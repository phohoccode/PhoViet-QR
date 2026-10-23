import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import type { ApiErrorCode } from "@contracts";
import { ApiFault, apiFailure } from "@/server/security/api";

const codes = new Set<ApiErrorCode>(["FORBIDDEN", "UNAUTHORIZED", "RESOURCE_NOT_FOUND", "INVALID_STATE_TRANSITION", "DUPLICATE_REQUEST_CONFLICT", "VALIDATION_ERROR", "RATE_LIMITED"]);
const fields = new Set(["label", "activeSession", "activeQr", "tableActive", "expectedUpdatedAt", "retiredQr", "rotation"]);
export async function executeTableQr<T>(action: string, input: Record<string, unknown>): Promise<T> {
  try {
    const env = getClientEnv();
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await client.rpc("p2_table_qr_execute", { action, input });
    if (error || !data || typeof data !== "object") throw new ApiFault("INTERNAL_ERROR");
    if (data.error) throw new ApiFault(codes.has(data.error) ? data.error : "INTERNAL_ERROR",
      data.error === "RATE_LIMITED" ? { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) }
        : fields.has(data.field) ? { field: data.field } : undefined);
    return data.data as T;
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault("INTERNAL_ERROR");
  }
}
/** Frozen R18 specifies 422 for inactive tables, independent of 409 conflicts. */
export function tableQrFailure(error: unknown) {
  const response = apiFailure(error);
  if (error instanceof ApiFault && error.code === "INVALID_STATE_TRANSITION" && error.details?.field === "tableActive")
    return new NextResponse(response.body, { status: 422, headers: response.headers });
  return response;
}
