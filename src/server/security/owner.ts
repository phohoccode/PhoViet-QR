import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyOwner, OwnerAccessError, type OwnerContext } from "@/server/auth/verify-owner";
import { ApiFault } from "./api";

/** API auth returns JSON status, never the page guard's login/refresh redirect. */
export async function requireApiOwner(): Promise<OwnerContext> {
  try {
    const client = await createServerSupabaseClient({ cookieMode: "write" });
    const owner = await verifyOwner(client);
    if (!owner) throw new ApiFault("UNAUTHORIZED");
    return owner;
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    if (error instanceof OwnerAccessError && error.code === "forbidden") throw new ApiFault("FORBIDDEN");
    throw new ApiFault("INTERNAL_ERROR");
  }
}
