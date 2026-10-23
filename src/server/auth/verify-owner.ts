import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { logAuthEvent } from "./log";

export type OwnerContext = { authUserId: string; storeId: string };
export class OwnerAccessError extends Error {
  constructor(public readonly code: "forbidden" | "unavailable" | "refresh_required") {
    super("Không thể xác minh quyền truy cập quản lý.");
    this.name = "OwnerAccessError";
  }
}

/** Verify remotely with Auth, then query RLS-protected membership; never getSession(). */
export async function verifyOwner(client: SupabaseClient<Database>): Promise<OwnerContext | null> {
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (!error.status || error.status >= 500) {
      logAuthEvent("auth.provider_unavailable");
      throw new OwnerAccessError("unavailable");
    }
    return null;
  }
  if (!data.user) return null;

  const membership = await client.from("owner_members")
    .select("store_id, auth_user_id, role")
    .eq("auth_user_id", data.user.id).eq("role", "owner").maybeSingle();
  if (membership.error) {
    logAuthEvent("auth.membership_unavailable");
    throw new OwnerAccessError("unavailable");
  }
  if (!membership.data || membership.data.auth_user_id !== data.user.id || membership.data.role !== "owner") {
    logAuthEvent("auth.membership_denied");
    throw new OwnerAccessError("forbidden");
  }
  return { authUserId: data.user.id, storeId: membership.data.store_id };
}
