import "server-only";

import { redirect, unstable_rethrow } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OwnerAccessError, verifyOwner, type OwnerContext } from "./verify-owner";
import { logAuthEvent } from "./log";

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
    // Preserve Next render/prerender control flow; it is not an auth outage.
    unstable_rethrow(error);
    if (error instanceof OwnerAccessError) throw error;
    logAuthEvent("auth.guard_failed");
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
    unstable_rethrow(error);
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
