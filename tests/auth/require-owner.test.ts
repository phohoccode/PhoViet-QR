import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), verify: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createClient }));
vi.mock("@/server/auth/verify-owner", async (original) => ({ ...await original<typeof import("../../src/server/auth/verify-owner")>(), verifyOwner: mocks.verify }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { getCurrentOwner, requireOwner } from "../../src/server/auth/require-owner";
import { OwnerAccessError } from "../../src/server/auth/verify-owner";

beforeEach(() => {
  mocks.createClient.mockResolvedValue({});
  mocks.verify.mockResolvedValue(null);
  mocks.redirect.mockImplementation((path) => { throw new Error(`NEXT_REDIRECT:${path}`); });
});
describe("dashboard server guard", () => {
  it("redirects a guest to login", async () => {
    await expect(requireOwner()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
  it("returns only the verified membership context", async () => {
    mocks.verify.mockResolvedValueOnce({ authUserId: "u", storeId: "s" });
    expect(await requireOwner()).toEqual({ authUserId: "u", storeId: "s" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("denies an authenticated user with no owner membership", async () => {
    mocks.verify.mockRejectedValueOnce(new OwnerAccessError("forbidden"));
    await expect(requireOwner()).rejects.toThrow("NEXT_REDIRECT:/login?reason=access_denied");
  });
  it("fails closed without leaking env/database errors", async () => {
    mocks.createClient.mockRejectedValueOnce(new Error("private config values"));
    await expect(requireOwner()).rejects.toThrow("NEXT_REDIRECT:/login?reason=service_unavailable");
  });
  it("sends refreshed cookies to a writable route instead of silently losing them during render", async () => {
    mocks.createClient.mockImplementationOnce(async (options) => { options.onRefreshRequired(); return {}; });
    mocks.verify.mockResolvedValueOnce({ authUserId: "u", storeId: "s" });
    await expect(requireOwner()).rejects.toThrow("NEXT_REDIRECT:/api/owner/auth/refresh");
  });
  it("exposes refresh-required as a typed error to non-page callers", async () => {
    mocks.createClient.mockImplementationOnce(async (options) => { options.onRefreshRequired(); return {}; });
    mocks.verify.mockResolvedValueOnce({ authUserId: "u", storeId: "s" });
    await expect(getCurrentOwner()).rejects.toMatchObject({ code: "refresh_required" });
  });
});
