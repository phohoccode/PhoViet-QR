import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { verifyOwner } from "../../src/server/auth/verify-owner";
import type { Database } from "../../src/lib/supabase/database";

function fixture(userId: string | null, membership: unknown, dbError: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: membership, error: dbError }) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const raw = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null }, error: null }) }, from: vi.fn().mockReturnValue(query) };
  return { client: raw as unknown as SupabaseClient<Database>, raw, query };
}
describe("trusted membership authorization", () => {
  it("denies an anonymous request without querying memberships", async () => {
    const f = fixture(null, null);
    expect(await verifyOwner(f.client)).toBeNull();
    expect(f.raw.from).not.toHaveBeenCalled();
  });
  it("uses verified Auth user ID, not submitted tenant/user data", async () => {
    const f = fixture("verified", { auth_user_id: "verified", store_id: "mapped-store", role: "owner" });
    expect(await verifyOwner(f.client)).toEqual({ authUserId: "verified", storeId: "mapped-store" });
    expect(f.query.eq).toHaveBeenCalledWith("auth_user_id", "verified");
    expect(f.query.eq).toHaveBeenCalledWith("role", "owner");
  });
  it.each([null, { auth_user_id: "other", store_id: "other-store", role: "owner" }])("denies absent or mismatched membership", async (membership) => {
    await expect(verifyOwner(fixture("verified", membership).client)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("fails closed on a database error", async () => {
    await expect(verifyOwner(fixture("verified", null, { message: "internal" }).client)).rejects.toMatchObject({ code: "unavailable" });
  });
});
