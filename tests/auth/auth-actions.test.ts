import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), verifyOwner: vi.fn(), redirect: vi.fn(),
  signIn: vi.fn(), signOut: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createClient }));
vi.mock("@/server/auth/verify-owner", () => ({ verifyOwner: mocks.verifyOwner }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { signInOwnerAction, signOutOwnerAction } from "../../src/features/owner/auth-actions";

const input = () => {
  const form = new FormData();
  form.set("email", "owner@example.invalid");
  form.set("password", "TEST-ONLY-NOT-A-REAL-PASSWORD");
  return form;
};
beforeEach(() => {
  mocks.createClient.mockResolvedValue({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut } });
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.verifyOwner.mockResolvedValue({ authUserId: "verified-user", storeId: "authorized-store" });
  mocks.redirect.mockImplementation((path) => { throw new Error(`NEXT_REDIRECT:${path}`); });
});

describe("owner auth actions", () => {
  it("rejects invalid input before creating a provider client", async () => {
    const result = await signInOwnerAction({ status: "idle" }, new FormData());
    expect(result.status).toBe("error");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("returns the same safe message for bad password, missing account and missing membership", async () => {
    mocks.signIn.mockResolvedValueOnce({ error: { message: "account not found secret" } });
    const missingAccount = await signInOwnerAction({ status: "idle" }, input());
    mocks.signIn.mockResolvedValueOnce({ error: { message: "wrong password secret" } });
    const wrongPassword = await signInOwnerAction({ status: "idle" }, input());
    mocks.verifyOwner.mockRejectedValueOnce(new Error("forbidden tenant internal"));
    const forbidden = await signInOwnerAction({ status: "idle" }, input());
    expect(missingAccount).toEqual(wrongPassword);
    expect(forbidden).toEqual(wrongPassword);
    expect(JSON.stringify(forbidden)).not.toContain("secret");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("clears a session on membership query failure and stays on login", async () => {
    mocks.verifyOwner.mockRejectedValueOnce(new Error("DB internal"));
    expect((await signInOwnerAction({ status: "idle" }, input())).status).toBe("error");
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("redirects only after trusted user and membership verification, without swallowing redirect", async () => {
    await expect(signInOwnerAction({ status: "idle" }, input())).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mocks.verifyOwner).toHaveBeenCalledOnce();
  });
  it("maps configuration/provider exceptions to safe form errors", async () => {
    mocks.createClient.mockRejectedValueOnce(new Error("raw private configuration"));
    const result = await signInOwnerAction({ status: "idle" }, input());
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("raw private");
  });
  it("logs out the current browser session before redirecting", async () => {
    await expect(signOutOwnerAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("does not claim logout success when the provider reports failure", async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { message: "internal error" } });
    await expect(signOutOwnerAction()).rejects.toThrow("Không thể đăng xuất");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
