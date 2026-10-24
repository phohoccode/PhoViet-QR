import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import { ApiFault } from "@/server/security/api";
import type { ApiErrorCode } from "@contracts";
export type PinResult<T> = { data: T; delivery?: unknown; keyId?: string };
const codes = new Set<ApiErrorCode>(["INVALID_QR", "SESSION_EXPIRED", "SESSION_CHECKOUT_PENDING", "INVALID_SESSION_CODE", "INVALID_STATE_TRANSITION", "RESOURCE_NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "DUPLICATE_REQUEST_CONFLICT", "RATE_LIMITED", "VALIDATION_ERROR"]);
export async function executePin<T>(action: "open" | "inspect" | "reveal" | "rotate" | "locate" | "verify", input: Record<string, unknown>): Promise<PinResult<T>> {
  try {
    const client = createClient(getClientEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await client.rpc("p2_pin_execute", { action, input });
    if (error || !data || typeof data !== "object") throw new ApiFault("INTERNAL_ERROR");
    if (data.error) throw new ApiFault(codes.has(data.error) ? data.error as ApiErrorCode : "INTERNAL_ERROR",
      data.error === "RATE_LIMITED" ? { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) } : undefined);
    if (!Object.hasOwn(data, "data")) throw new ApiFault("INTERNAL_ERROR");
    return data;
  } catch (error) { if (error instanceof ApiFault) throw error; throw new ApiFault("INTERNAL_ERROR"); }
}
