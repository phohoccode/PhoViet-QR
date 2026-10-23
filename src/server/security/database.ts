import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import { ApiFault } from "./api";
import type { ApiErrorCode } from "@contracts";

type DbResult<T> = { data: T; error?: string; delivery?: unknown; keyId?: string; expiresAt?: string };
const knownCodes = new Set<ApiErrorCode>(["INVALID_QR", "SESSION_REQUIRED", "SESSION_EXPIRED", "SESSION_CHECKOUT_PENDING", "INVALID_SESSION_CODE", "INVALID_STATE_TRANSITION", "RESOURCE_NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "DUPLICATE_REQUEST_CONFLICT", "RATE_LIMITED"]);
export async function executePhase2<T>(action: string, input: Record<string, unknown>): Promise<DbResult<T>> {
  try {
    const env = getClientEnv();
    const server = getServerEnv();
    // Privileged client exists only inside server modules; never expose generic RPC to browsers.
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, server.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await client.rpc("p2_execute", { action, input });
    if (error || !data || typeof data !== "object") throw new ApiFault("INTERNAL_ERROR");
    if (data.error) {
      const code = knownCodes.has(data.error) ? data.error as ApiErrorCode : "INTERNAL_ERROR";
      throw new ApiFault(code, code === "RATE_LIMITED" ? { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) } : undefined);
    }
    return data as DbResult<T>;
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault("INTERNAL_ERROR");
  }
}
