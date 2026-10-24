import { traceEvent } from "@/server/security/trace";
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { CreateOrderV1Input, OrderDetail, TakeawayPaymentViewState, WebhookReceipt } from "@contracts";
import { createOrderInput, orderId, orderResponse, takeawayPaymentResponse } from "@/lib/validations/orders";
import { ApiFault, validate } from "@/server/security/api";
import type { GuestRequestContext } from "@/server/security/request-context";
import { createDineInOrder } from "@/server/orders/service";
import { OrderFault } from "@/server/orders/database";
import { PayosGateway, paymentConfig } from "./payos";
import type { PaymentIntent } from "./gateway";
import { paymentDatabase, paymentRpc } from "./database";
import { getPrivateTakeawayTracking, issuePickupAfterPayment, recoverPickupCredentials } from "@/server/pickup/service";

const proof = (context: GuestRequestContext) => ({ browserHash: context.browserHash, grantProof: context.grantProof });
function channel() {
  const env = paymentConfig();
  return { configuredStoreId: env.PAYOS_STORE_ID, accountNumber: env.PAYOS_ACCOUNT_NUMBER,
    channelHash: createHash("sha256").update(env.PAYOS_CLIENT_ID).digest("hex") };
}
export async function createCustomerOrder(input: CreateOrderV1Input, context: GuestRequestContext): Promise<OrderDetail> {
  const command = validate(createOrderInput, input);
  const { data, error } = await paymentDatabase().from("qr_codes").select("type").eq("public_code", command.qrCode).maybeSingle();
  if (error) throw new OrderFault("INTERNAL_ERROR");
  if (!data) throw new OrderFault("INVALID_QR");
  if (data.type === "table") return createDineInOrder(command, context);
  const value = await paymentRpc("p4_checkout", { input: { command, ...proof(context), ...channel() } });
  // Immutable command response contains the persisted pending intent. Instructions
  // are fetched via R06, so retries always return precisely the original result.
  return validate(orderResponse, value);
}

async function intentForOrder(id: string): Promise<string | null> {
  const { data, error } = await paymentDatabase().from("payment_intents").select("id").eq("order_id", validate(orderId, id)).maybeSingle();
  if (error) throw new OrderFault("INTERNAL_ERROR");
  return data?.id ?? null;
}
export async function getTakeawayOrder(id: string, context: GuestRequestContext, includePickup: boolean) {
  const intentId = await intentForOrder(id);
  if (!intentId) return null;
  if (includePickup) return getPrivateTakeawayTracking(id, context);
  let value: unknown;
  try { value = await paymentRpc("p4_payment_execute", { action: "order", input: { intentId, includePickup, ...proof(context) } }); }
  catch (error) {
    if (error instanceof ApiFault && error.code === "RESOURCE_NOT_FOUND") throw new OrderFault("ORDER_NOT_FOUND");
    throw error;
  }
  return validate(orderResponse, value);
}
export async function getCustomerPayment(id: string, context: GuestRequestContext): Promise<TakeawayPaymentViewState> {
  // GET is DB-only. No provider call or write triggered by browser polling.
  return validate(takeawayPaymentResponse, await paymentRpc("p4_payment_execute", { action: "get", input: { intentId: validate(orderId, id), ...proof(context) } }));
}

export async function provisionPayment(intentId: string) {
  const gateway = new PayosGateway();
  const scope = channel();
  const work = await paymentRpc<(PaymentIntent & { lease: string; attempt: number; accountNumber: string }) | null>("p4_payment_execute", { action: "prepare", input: { intentId, ...scope } });
  if (!work) return;
  try {
    if (work.attempt > 1) {
      // Recover an uncertain first create using the SAME reference. A confirmed
      // existing request is observed, never replaced by a second payment intent.
      try {
        const remote = await gateway.getPaymentStatus(work.reference);
        await paymentRpc("p4_payment_execute", { action: "observe", input: { intentId, status: remote.status, ...scope } });
        if (remote.reference !== work.reference || remote.amountVnd !== work.amountVnd || !/^[a-f0-9]{32}$/i.test(remote.paymentLinkId)) throw new Error("Provider recovery mismatch");
        if (remote.status !== "PENDING") return;
        await paymentRpc("p4_payment_execute", { action: "attach", input: { intentId, lease: work.lease, ...scope,
          paymentLinkId: remote.paymentLinkId, checkoutUrl: `https://pay.payos.vn/web/${remote.paymentLinkId}`, qrPayload: null } });
        return;
      } catch {
        // An unavailable status query cannot establish whether the first POST
        // committed. Keep the durable reference for the next reconciliation run.
        return;
      }
    }
    const instructions = await gateway.createPayment(work);
    await paymentRpc("p4_payment_execute", { action: "attach", input: { intentId, lease: work.lease, ...scope, ...instructions } });
  } catch {
    // Leave the durable lease/attempt for the worker. Never log SDK errors,
    // provider responses, account numbers or bodies (may contain credentials).
    traceEvent("payment.provision_pending");
  }
}
export async function receivePayosWebhook(body: unknown): Promise<WebhookReceipt> {
  const gateway = new PayosGateway();
  const verified = await gateway.verifyWebhook(body);
  const event = gateway.parseEvent(verified);
  const inbox = await paymentRpc<{ id: string }>("p4_ingest", { input: { event, evidence: body, channelHash: channel().channelHash } });
  const receipt = await paymentRpc<WebhookReceipt>("p4_process", { event_uuid: inbox.id });
  await issuePickupAfterPayment(event.reference);
  return receipt;
}
export function verifyReconcileSecret(request: Request) {
  const secret = process.env.PAYMENT_RECONCILE_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(`Bearer ${secret}`).digest())) throw new ApiFault("UNAUTHORIZED");
}
export async function reconcilePayments() {
  const scope = channel();
  const jobs = await paymentRpc<{ events: string[]; intents: string[] }>("p4_payment_execute", { action: "jobs", input: scope });
  let retried = 0;
  for (const id of jobs.events) {
    try { await paymentRpc("p4_process", { event_uuid: id }); retried++; } catch { /* Durable failed item stays in the next batch. */ }
  }
  for (const intentId of jobs.intents) {
    await paymentRpc("p4_payment_execute", { action: "expire", input: { intentId } });
    const remoteQuery = await paymentRpc<{ reference: string; hasInstructions: boolean; pending: boolean }>("p4_payment_execute", { action: "inspect", input: { intentId, ...scope } });
    if (remoteQuery.pending && remoteQuery.hasInstructions) {
      try {
        const remote = await new PayosGateway().getPaymentStatus(remoteQuery.reference);
        await paymentRpc("p4_payment_execute", { action: "observe", input: { intentId, status: remote.status, ...scope } });
      } catch { /* Retain pending; the next scheduled run queries again. */ }
    } else if (remoteQuery.pending) await provisionPayment(intentId);
  }
  const pickup = await recoverPickupCredentials();
  return { retried, checked: jobs.intents.length, pickup };
}
