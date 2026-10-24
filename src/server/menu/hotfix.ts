import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ApiErrorCode } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import { ApiFault, validate } from "@/server/security/api";
import { resourceId } from "@/lib/validations/table-sessions";

export const ownerScope = (owner: OwnerContext) => ({ storeId: owner.storeId, ownerId: owner.authUserId });
export function menuStorageClient() {
  return createClient(getClientEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
  });
}
const known = new Set<ApiErrorCode>(["FORBIDDEN", "RESOURCE_NOT_FOUND", "TABLE_IN_USE", "CATEGORY_NOT_EMPTY", "VALIDATION_ERROR", "RATE_LIMITED"]);
export async function hotfixRpc<T>(fn: "hf01_owner_execute" | "hf01_image_cleanup", action: string, input: Record<string, unknown>): Promise<T> {
  try {
    const { data, error } = await menuStorageClient().rpc(fn, { action, input });
    if (error || !data || typeof data !== "object") throw new ApiFault("INTERNAL_ERROR");
    if (data.error) throw new ApiFault(known.has(data.error) ? data.error : "INTERNAL_ERROR",
      data.error === "CATEGORY_NOT_EMPTY" ? { count: Math.max(0, Number(data.details?.count) || 0) }
        : data.error === "RATE_LIMITED" ? { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) } : undefined);
    return data.data as T;
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault("INTERNAL_ERROR");
  }
}
export type ArchiveResult = { success: true; id: string; archivedAt: string };
export const archiveResource = (owner: OwnerContext, kind: "table" | "category" | "item", id: string) =>
  hotfixRpc<ArchiveResult>("hf01_owner_execute", `archive_${kind}`, { ...ownerScope(owner), id: validate(resourceId, id) });
