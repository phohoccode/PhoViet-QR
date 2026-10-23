import "server-only";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OwnerAccessError, verifyOwner, type OwnerContext } from "./verify-owner";

export async function getCurrentOwner(): Promise<OwnerContext | null> {
  let refreshRequired = false;
  try {
    const client = await createServerSupabaseClient({
      cookieMode: "read-only", onRefreshRequired: () => { refreshRequired = true; },
    });
    const owner = await verifyOwner(client);
    if (owner && refreshRequired) throw new OwnerAccessError("refresh_required");
    return owner;
  } catch (error) {
    if (error instanceof OwnerAccessError) throw error;
    throw new OwnerAccessError("unavailable");
  }
}

/** Page/layout guard. Future owner APIs must authorize independently per request. */
export async function requireOwner(): Promise<OwnerContext> {
  let owner: OwnerContext | null = null;
  let destination: string | undefined;
  try {
    owner = await getCurrentOwner();
  } catch (error) {
    destination = error instanceof OwnerAccessError && error.code === "refresh_required"
      ? "/api/owner/auth/refresh"
      : error instanceof OwnerAccessError && error.code === "forbidden"
        ? "/login?reason=access_denied"
        : "/login?reason=service_unavailable";
  }
  if (destination) redirect(destination);
  if (!owner) redirect("/login");
  return owner;
}
