import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import { OrderFault } from "./database";

export async function executeOwnerOrder(action: "list" | "claim" | "ready" | "complete", input: Record<string, unknown>): Promise<unknown> {
  try {
    const client = createClient(getClientEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await client.rpc("p3_owner_orders_execute", { action, input });
    if (error || !data || typeof data !== "object") throw new OrderFault("INTERNAL_ERROR");
    if (data.error) {
      switch (data.error) {
        case "FORBIDDEN": case "ORDER_NOT_FOUND": case "DUPLICATE_REQUEST_CONFLICT": case "INVALID_STATE_TRANSITION":
          throw new OrderFault(data.error);
        case "RATE_LIMITED": throw new OrderFault("RATE_LIMITED", { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) });
        default: throw new OrderFault("INTERNAL_ERROR");
      }
    }
    if (!Object.hasOwn(data, "data")) throw new OrderFault("INTERNAL_ERROR");
    return data.data;
  } catch (error) {
    if (error instanceof OrderFault) throw error;
    // A timeout is uncertain; caller retries the SAME key. No automatic new claim.
    throw new OrderFault("INTERNAL_ERROR");
  }
}
