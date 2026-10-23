import type { CreateOrderV1Input, OrderDetail, PrivateOrderTrackingView } from "@contracts";
import { menuRequest } from "@/features/customer/api-client";
export { MenuApiError as OrderApiError } from "@/features/customer/api-client";

/** Input/key belong to the caller's immutable submit intent. Never retry with a new key here. */
export const submitCustomerOrder = (input: CreateOrderV1Input): Promise<OrderDetail> => menuRequest("/api/public/orders", "POST", input);
export const getCustomerOrderTracking = (id: string): Promise<OrderDetail> => menuRequest(`/api/public/orders/${encodeURIComponent(id)}`);
export const getPrivateOrderTracking = (id: string): Promise<PrivateOrderTrackingView> => menuRequest(`/api/public/orders/${encodeURIComponent(id)}?includePickup=true`);
