import "server-only";
import { z } from "zod";
import type { CompleteOrderInput, OrderDetail, OrderTransitionInput, OwnerOrdersQuery, OwnerOrdersView, RequestCommand } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import { ApiFault, validate } from "@/server/security/api";
import { claimNextInput, completeOrderInput, ownerOrdersCursor, ownerOrdersQuery, readyOrderInput } from "@/lib/validations/owner-orders";
import { orderResponse, orderSummaryResponse, orderId } from "@/lib/validations/orders";
import { OrderFault } from "./database";
import { executeOwnerOrder } from "./owner-database";
import { completeTakeawayPickup } from "@/server/pickup/service";

const context = (owner: OwnerContext) => ({ storeId: owner.storeId, ownerId: owner.authUserId });
function snapshot(value: unknown): OrderDetail {
  const parsed = orderResponse.safeParse(value);
  if (!parsed.success) throw new OrderFault("INTERNAL_ERROR");
  return parsed.data;
}
const listResponse = z.strictObject({
  storeId: orderId, orders: z.array(orderSummaryResponse).max(100), detail: orderResponse.nullable(),
  counts: z.strictObject({ accepted: z.number().int().nonnegative(), preparing: z.number().int().nonnegative(), ready: z.number().int().nonnegative(), paymentException: z.number().int().nonnegative() }),
  after: ownerOrdersCursor.shape.after.nullable(), updatedAt: z.iso.datetime({ offset: true }),
});
export async function getOwnerOrders(owner: OwnerContext, input: OwnerOrdersQuery = {}): Promise<OwnerOrdersView> {
  const query = validate(ownerOrdersQuery, { ...input, ...(input.limit === undefined ? {} : { limit: String(input.limit) }) });
  let after: z.infer<typeof ownerOrdersCursor>["after"] | undefined;
  if (query.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw Error();
      const decoded = Buffer.from(query.cursor, "base64url");
      if (decoded.toString("base64url") !== query.cursor) throw Error();
      const cursor = ownerOrdersCursor.parse(JSON.parse(decoded.toString("utf8")));
      if (cursor.storeId !== owner.storeId || cursor.view !== query.view || cursor.type !== (query.type ?? null) || cursor.status !== (query.status ?? null) ||
        (query.view === "queue") !== ("day" in cursor.after)) throw Error();
      after = cursor.after;
    } catch { throw new ApiFault("VALIDATION_ERROR"); }
  }
  const { cursor: _cursor, ...filters } = query;
  void _cursor;
  const parsed = listResponse.safeParse(await executeOwnerOrder("list", { ...context(owner), query: { ...filters, ...(after ? { after } : {}) } }));
  if (!parsed.success || parsed.data.storeId !== owner.storeId || parsed.data.orders.some(o => o.storeId !== owner.storeId) || (parsed.data.detail && parsed.data.detail.storeId !== owner.storeId)) throw new OrderFault("INTERNAL_ERROR");
  const { after: next, ...view } = parsed.data;
  return { ...view, nextCursor: next ? Buffer.from(JSON.stringify({ v: 1, storeId: owner.storeId, view: query.view, type: query.type ?? null, status: query.status ?? null, after: next })).toString("base64url") : null };
}
export async function claimNextOrder(owner: OwnerContext, input: RequestCommand): Promise<OrderDetail | null> {
  const value = await executeOwnerOrder("claim", { ...context(owner), ...validate(claimNextInput, input) });
  return value === null ? null : snapshot(value);
}
export async function markOwnerOrderReady(owner: OwnerContext, id: string, input: OrderTransitionInput): Promise<OrderDetail> {
  return snapshot(await executeOwnerOrder("ready", { ...context(owner), orderId: validate(orderId, id), ...validate(readyOrderInput, input) }));
}
export async function completeOwnerOrder(owner: OwnerContext, id: string, input: CompleteOrderInput): Promise<OrderDetail> {
  const target = validate(orderId, id);
  const command = validate(completeOrderInput, input);
  if (command.type === "takeaway") return completeTakeawayPickup(owner, target, command);
  return snapshot(await executeOwnerOrder("complete", { ...context(owner), orderId: target, ...command }));
}
