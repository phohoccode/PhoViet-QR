import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@contracts";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import { ApiFault, apiFailure } from "@/server/security/api";

export class MenuBusinessFault extends ApiFault { constructor() { super("VALIDATION_ERROR"); } }
const errors = new Set<ApiErrorCode>(["FORBIDDEN", "UNAUTHORIZED", "INVALID_QR", "RESOURCE_NOT_FOUND", "INVALID_STATE_TRANSITION", "DUPLICATE_REQUEST_CONFLICT", "RATE_LIMITED", "VALIDATION_ERROR", "CATEGORY_NOT_EMPTY", "TABLE_IN_USE", "ITEM_UNAVAILABLE"]);
export async function executeMenu<T>(action: string, input: Record<string, unknown>): Promise<T> {
  try {
    const env = getClientEnv();
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await client.rpc("p2_menu_execute", { action, input });
    if (error || !data || typeof data !== "object") throw new ApiFault("INTERNAL_ERROR");
    if (data.error) {
      if (data.error === "VALIDATION_ERROR") throw new MenuBusinessFault();
      throw new ApiFault(errors.has(data.error) ? data.error : "INTERNAL_ERROR",
        data.error === "RATE_LIMITED" ? { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) }
          : data.error === "CATEGORY_NOT_EMPTY" ? { count: Math.max(0, Number(data.details?.count) || 0) } : undefined);
    }
    return data.data as T;
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault("INTERNAL_ERROR");
  }
}
export function menuFailure(error: unknown) {
  if (!(error instanceof MenuBusinessFault)) return apiFailure(error);
  return NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, {
    status: 422, headers: { "Cache-Control": "private, no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
  });
}
