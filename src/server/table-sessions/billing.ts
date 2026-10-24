import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ApiErrorCode, SessionSettlementResult, SettleSessionInput, TableBillView } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import type { GuestRequestContext } from "@/server/security/request-context";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import { resourceId } from "@/lib/validations/table-sessions";
import { guestBillQuery, settleSessionInput, tableBillResponse } from "@/lib/validations/session-billing";
import { ApiFault, validate } from "@/server/security/api";

const known = new Set<ApiErrorCode>(["RESOURCE_NOT_FOUND", "SESSION_REQUIRED", "SESSION_EXPIRED", "UNAUTHORIZED", "FORBIDDEN",
  "INVALID_STATE_TRANSITION", "DUPLICATE_REQUEST_CONFLICT", "VALIDATION_ERROR", "RATE_LIMITED", "BILL_CHANGED", "SESSION_ORDERS_OUTSTANDING"]);
async function execute<T>(action: string, input: Record<string, unknown>): Promise<T> {
  try {
    const client = createClient(getClientEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await client.rpc("p5_session_execute", { action, input });
    if (error || !data || typeof data !== "object") throw new ApiFault("INTERNAL_ERROR");
    if (data.error) {
      const code: ApiErrorCode = known.has(data.error) ? data.error : "INTERNAL_ERROR";
      throw new ApiFault(code, code === "RATE_LIMITED" ? { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) } : undefined);
    }
    if (!data.data || typeof data.data !== "object") throw new ApiFault("INTERNAL_ERROR");
    return data.data as T;
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault("INTERNAL_ERROR");
  }
}
function bill(value: unknown): TableBillView {
  const result = tableBillResponse.safeParse(value);
  if (!result.success) throw new ApiFault("INTERNAL_ERROR");
  return result.data;
}
const scope = (owner: OwnerContext) => ({ storeId: owner.storeId, ownerId: owner.authUserId });
export async function getOwnerSessionBill(owner: OwnerContext, sessionId: string): Promise<TableBillView> {
  return bill(await execute("owner_bill", { ...scope(owner), sessionId: validate(resourceId, sessionId) }));
}
export async function getGuestSessionBill(qrCode: string, context: GuestRequestContext): Promise<TableBillView> {
  return bill(await execute("guest_bill", { ...validate(guestBillQuery, { qrCode }), browserHash: context.browserHash, grantProof: context.grantProof }));
}
export async function settleSession(owner: OwnerContext, sessionId: string, input: SettleSessionInput): Promise<SessionSettlementResult> {
  const command = validate(settleSessionInput, input);
  const result = await execute<SessionSettlementResult>(command.action, { ...scope(owner), sessionId: validate(resourceId, sessionId), ...command });
  const snapshot = bill(result.bill);
  if (command.action === "confirm_received" && (!result.settlement || snapshot.session.paymentStatus !== "paid" || snapshot.session.status !== "closed" ||
    result.settlement.tableSessionId !== snapshot.session.id || result.settlement.totalVnd !== snapshot.totalVnd ||
    result.settlement.paymentMethod !== snapshot.paymentMethod || result.settlement.settledAt !== snapshot.settledAt || result.settlement.status !== "succeeded")) throw new ApiFault("INTERNAL_ERROR");
  return { ...result, bill: snapshot };
}
