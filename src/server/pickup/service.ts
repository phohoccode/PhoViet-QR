import { traceEvent } from "@/server/security/trace";
import "server-only";
import { z } from "zod";
import type {
  CompleteOrderInput,
  OrderDetail,
  PrivateOrderTrackingView,
} from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import type { GuestRequestContext } from "@/server/security/request-context";
import { ApiFault, validate } from "@/server/security/api";
import { OrderFault } from "@/server/orders/database";
import { orderId, orderResponse } from "@/lib/validations/orders";
import { paymentDatabase } from "@/server/payments/database";
import {
  decryptPickup,
  encryptPickup,
  newPickupCode,
  pickupCommandFingerprint,
  pickupKeys,
  pickupVerifier,
} from "./crypto";

async function rpc<T>(
  action: string,
  input: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await paymentDatabase().rpc("p4_pickup_execute", {
    action,
    input,
  });
  if (error || !data || typeof data !== "object")
    throw new OrderFault("INTERNAL_ERROR");
  if (data.error) {
    switch (data.error) {
      case "INVALID_PICKUP_CODE":
      case "PICKUP_NOT_ALLOWED":
      case "PICKUP_CREDENTIAL_UNAVAILABLE":
      case "ORDER_ALREADY_COMPLETED":
        throw new ApiFault(data.error);
      case "RATE_LIMITED":
        throw new OrderFault("RATE_LIMITED", {
          retryAfterSeconds: Math.max(
            1,
            Math.min(900, Number(data.retryAfterSeconds) || 60),
          ),
        });
      case "FORBIDDEN":
      case "ORDER_NOT_FOUND":
      case "INVALID_STATE_TRANSITION":
      case "DUPLICATE_REQUEST_CONFLICT":
      case "VALIDATION_ERROR":
        throw new OrderFault(data.error);
      default:
        throw new OrderFault("INTERNAL_ERROR");
    }
  }
  if (!Object.hasOwn(data, "data")) throw new OrderFault("INTERNAL_ERROR");
  return data.data as T;
}
export async function ensurePickupCredential(id: string): Promise<boolean> {
  const order = await rpc<{ id: string; storeId: string } | null>(
    "issue_context",
    { orderId: validate(orderId, id) },
  );
  if (!order) return false;
  const { encryptionKeyId, hmacKeyId } = pickupKeys(),
    code = newPickupCode();
  const result = await rpc<{ issued: boolean }>("issue", {
    orderId: order.id,
    storeId: order.storeId,
    codeHash: pickupVerifier(code, order.storeId, order.id, hmacKeyId),
    ciphertext: encryptPickup(code, order.storeId, order.id, encryptionKeyId),
    encryptionKeyId,
    hmacKeyId,
  });
  return result.issued;
}
export async function issuePickupAfterPayment(reference: string) {
  const { data, error } = await paymentDatabase()
    .from("payment_intents")
    .select("order_id")
    .eq("provider", "payos")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (error) throw new OrderFault("INTERNAL_ERROR");
  if (data) await ensurePickupCredential(data.order_id);
}
export async function recoverPickupCredentials() {
  const orders = await rpc<string[]>("missing", {});
  let issued = 0;
  for (const id of orders) {
    try {
      if (await ensurePickupCredential(id)) issued++;
    } catch {
      traceEvent("pickup.recovery_pending");
    }
  }
  return { checked: orders.length, issued };
}
const privateResult = z.strictObject({
  order: orderResponse,
  delivery: z
    .strictObject({
      ciphertext: z.unknown(),
      encryptionKeyId: z.string(),
      expiresAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});
export async function getPrivateTakeawayTracking(
  id: string,
  context: GuestRequestContext,
): Promise<PrivateOrderTrackingView> {
  const value = validate(
    privateResult,
    await rpc("tracking", {
      orderId: validate(orderId, id),
      browserHash: context.browserHash,
      grantProof: context.grantProof,
    }),
  );
  return {
    order: value.order,
    pickup: value.delivery
      ? {
          code: decryptPickup(
            value.delivery.ciphertext,
            value.order.storeId,
            value.order.id,
            value.delivery.encryptionKeyId,
          ),
          expiresAt: value.delivery.expiresAt,
        }
      : null,
  };
}
export async function completeTakeawayPickup(
  owner: OwnerContext,
  id: string,
  input: Extract<CompleteOrderInput, { type: "takeaway" }>,
): Promise<OrderDetail> {
  const { data, error } = await paymentDatabase()
    .from("pickup_credentials")
    .select("hmac_key_id")
    .eq("store_id", owner.storeId)
    .eq("order_id", id)
    .maybeSingle();
  if (error) throw new OrderFault("INTERNAL_ERROR");
  const hmacKeyId = data?.hmac_key_id ?? pickupKeys().hmacKeyId;
  const fingerprint = pickupCommandFingerprint(
    input.pickupCode,
    owner.storeId,
    owner.authUserId,
    id,
    input.requestId,
    input.expectedVersion,
    hmacKeyId,
  );
  return validate(
    orderResponse,
    await rpc("complete", {
      storeId: owner.storeId,
      ownerId: owner.authUserId,
      orderId: id,
      requestId: input.requestId,
      expectedVersion: input.expectedVersion,
      hmacKeyId,
      fingerprint,
      codeProof: pickupVerifier(input.pickupCode, owner.storeId, id, hmacKeyId),
    }),
  );
}
