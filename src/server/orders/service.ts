import "server-only";
import type { CreateOrderV1Input, OrderDetail, PrivateOrderTrackingView } from "@contracts";
import { createOrderInput, dineInOrderResponse, orderId } from "@/lib/validations/orders";
import { validate } from "@/server/security/api";
import type { GuestRequestContext } from "@/server/security/request-context";
import { executeOrder, OrderFault } from "./database";

function proof(context: GuestRequestContext) { return { browserHash: context.browserHash, grantProof: context.grantProof }; }
export async function createDineInOrder(input: CreateOrderV1Input, context: GuestRequestContext): Promise<OrderDetail> {
  return snapshot(await executeOrder("create", { command: validate(createOrderInput, input), ...proof(context) }));
}
function snapshot(value: unknown): OrderDetail {
  const parsed = dineInOrderResponse.safeParse(value);
  if (!parsed.success) throw new OrderFault("INTERNAL_ERROR");
  return parsed.data;
}
export function getGuestOrder(id: string, context: GuestRequestContext, includePickup: true): Promise<PrivateOrderTrackingView>;
export function getGuestOrder(id: string, context: GuestRequestContext, includePickup?: false): Promise<OrderDetail>;
export function getGuestOrder(id: string, context: GuestRequestContext, includePickup: boolean): Promise<OrderDetail | PrivateOrderTrackingView>;
export async function getGuestOrder(id: string, context: GuestRequestContext, includePickup = false): Promise<OrderDetail | PrivateOrderTrackingView> {
  const value = await executeOrder<unknown>("get", { orderId: validate(orderId, id), includePickup, ...proof(context) });
  if (!includePickup) return snapshot(value);
  if (!value || typeof value !== "object" || !("order" in value) || !("pickup" in value) || value.pickup !== null) throw new OrderFault("INTERNAL_ERROR");
  return { order: snapshot(value.order), pickup: null };
}
