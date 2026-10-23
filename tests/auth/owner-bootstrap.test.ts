import { describe, expect, it, vi } from "vitest";
import { bootstrapOwner, readOwnerBootstrapEnv } from "../../scripts/lib/owner-bootstrap.mjs";

const storeId = "c0200000-0000-4000-8000-000000000001";
const config = {
  OWNER_BOOTSTRAP_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://dev.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_only",
  OWNER_BOOTSTRAP_EMAIL: "admin@example.invalid",
  OWNER_BOOTSTRAP_PASSWORD: "Test-bootstrap-123!",
  OWNER_BOOTSTRAP_STORE_ID: storeId,
  OWNER_BOOTSTRAP_STORE_NAME: "Test store",
};
const account = { id: "test-user", email: config.OWNER_BOOTSTRAP_EMAIL, email_confirmed_at: "2026-10-23" };
const membership = { store_id: storeId, role: "owner" };

function fixture(options: { existing?: boolean; member?: object; insertError?: boolean; schemaError?: boolean; permissionError?: boolean } = {}) {
  let reads = 0;
  const createUser = vi.fn().mockResolvedValue({ data: { user: account }, error: null });
  const listUsers = vi.fn().mockResolvedValue({ data: { users: options.existing ? [account] : [] }, error: null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: options.insertError ? { message: "raw secret" } : null });
  const from = vi.fn((name: string) => ({
    select: vi.fn(() => ({
      limit: vi.fn().mockResolvedValue({ error: options.permissionError ? { code: "42501" } : options.schemaError ? { message: "raw secret" } : null }),
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => {
        if (name === "stores") return { data: null, error: null };
        reads++;
        return { data: options.insertError && reads > 1 ? membership : options.member ?? null, error: null };
      }) })),
    })),
    upsert, insert,
  }));
  const client = { from, auth: { admin: { createUser, listUsers } } };
  const makeClient = vi.fn(() => client);
  return { makeClient, createUser, listUsers, upsert, insert };
}

describe("trusted owner startup bootstrap", () => {
  it("does nothing without an explicit opt-in", async () => {
    const f = fixture();
    expect(readOwnerBootstrapEnv({})).toBeNull();
    expect(await bootstrapOwner({ ...config, OWNER_BOOTSTRAP_ENABLED: "false" }, f.makeClient)).toEqual({ status: "disabled" });
    expect(f.makeClient).not.toHaveBeenCalled();
  });
  it("rejects missing admin credentials without disclosing config values", () => {
    expect(() => readOwnerBootstrapEnv({ ...config, SUPABASE_SERVICE_ROLE_KEY: "" })).toThrow("SUPABASE_SERVICE_ROLE_KEY");
    try { readOwnerBootstrapEnv({ ...config, SUPABASE_SERVICE_ROLE_KEY: "private-invalid-key" }); } catch (error) {
      expect(String(error)).not.toContain("private-invalid-key");
      expect(String(error)).not.toContain(config.OWNER_BOOTSTRAP_PASSWORD);
    }
  });
  it("creates a confirmed user, a fixed store and its owner membership", async () => {
    const f = fixture();
    expect(await bootstrapOwner(config, f.makeClient)).toEqual({ status: "created" });
    expect(f.createUser).toHaveBeenCalledWith({ email: config.OWNER_BOOTSTRAP_EMAIL, password: config.OWNER_BOOTSTRAP_PASSWORD, email_confirm: true });
    expect(f.upsert).toHaveBeenCalledWith({ id: storeId, name: "Test store" }, { onConflict: "id", ignoreDuplicates: true });
    expect(f.insert).toHaveBeenCalledWith({ store_id: storeId, auth_user_id: account.id, role: "owner" });
  });
  it("leaves an existing user, password, store and matching membership unchanged", async () => {
    const f = fixture({ existing: true, member: membership });
    expect(await bootstrapOwner(config, f.makeClient)).toEqual({ status: "existing" });
    expect(f.createUser).not.toHaveBeenCalled();
    expect(f.upsert).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled();
  });
  it("does not create Auth users when migrations are missing", async () => {
    const f = fixture({ schemaError: true });
    await expect(bootstrapOwner(config, f.makeClient)).rejects.toMatchObject({ code: "migration_required" });
    expect(f.createUser).not.toHaveBeenCalled();
  });
  it("distinguishes missing service-role grants from missing tables", async () => {
    const f = fixture({ permissionError: true });
    await expect(bootstrapOwner(config, f.makeClient)).rejects.toMatchObject({ code: "database_permission_denied" });
    expect(f.createUser).not.toHaveBeenCalled();
  });
  it("refuses to transfer a user to a different store", async () => {
    const f = fixture({ existing: true, member: { store_id: "another-store", role: "owner" } });
    await expect(bootstrapOwner(config, f.makeClient)).rejects.toMatchObject({ code: "membership_conflict" });
    expect(f.upsert).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled();
  });
  it("accepts an identical membership inserted by a concurrent server", async () => {
    const f = fixture({ existing: true, insertError: true });
    expect(await bootstrapOwner(config, f.makeClient)).toEqual({ status: "linked" });
  });
  it("recovers when another startup creates the same Auth email", async () => {
    const f = fixture();
    f.createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "duplicate user" } });
    f.listUsers.mockResolvedValueOnce({ data: { users: [] }, error: null }).mockResolvedValueOnce({ data: { users: [account] }, error: null });
    expect(await bootstrapOwner(config, f.makeClient)).toEqual({ status: "linked" });
  });
});
