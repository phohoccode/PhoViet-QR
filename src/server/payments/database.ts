import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import { ApiFault } from "@/server/security/api";
import { OrderFault } from "@/server/orders/database";

export function paymentDatabase() {
  return createClient(getClientEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
  });
}
export async function paymentRpc<T>(name: "p4_checkout" | "p4_ingest" | "p4_process" | "p4_payment_execute", args: Record<string, unknown>): Promise<T> {
  const { data, error } = await paymentDatabase().rpc(name, args);
  if (error || !data || typeof data !== "object") throw new OrderFault("INTERNAL_ERROR");
  if (data.error) {
    switch (data.error) {
      case "RESOURCE_NOT_FOUND": case "PAYMENT_PROVIDER_UNAVAILABLE": throw new ApiFault(data.error);
      case "ITEM_UNAVAILABLE": throw new OrderFault("ITEM_UNAVAILABLE", { menuItemIds: Array.isArray(data.menuItemIds) ? data.menuItemIds.filter((id: unknown) => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id)).slice(0, 100) : [] });
      case "INVALID_QR": case "UNAUTHORIZED": case "FORBIDDEN": case "VALIDATION_ERROR": case "OUT_OF_STOCK": case "PRICE_CHANGED":
      case "DUPLICATE_REQUEST_CONFLICT": case "INVALID_STATE_TRANSITION": case "STORE_NOT_ACCEPTING_ORDERS": throw new OrderFault(data.error);
      case "RATE_LIMITED": throw new OrderFault("RATE_LIMITED", { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) });
      default: throw new OrderFault("INTERNAL_ERROR");
    }
  }
  if (!Object.hasOwn(data, "data")) throw new OrderFault("INTERNAL_ERROR");
  return data.data as T;
}
