/** Local only: verify real Auth creation, RLS membership and startup idempotency. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { bootstrapOwner } from "../../scripts/lib/owner-bootstrap.mjs";

const status = JSON.parse(execFileSync(process.execPath, [
  "node_modules/supabase/dist/supabase.js", "status", "-o", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as Record<string, string>;
if (status.API_URL !== "http://127.0.0.1:15421") throw new Error("Refusing non-local bootstrap integration");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const storeId = randomUUID();
const email = `bootstrap-${randomUUID()}@example.invalid`;
const password = `${randomUUID()}aA!9`;
let userId: string | undefined;
const env = {
  OWNER_BOOTSTRAP_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  OWNER_BOOTSTRAP_EMAIL: email,
  OWNER_BOOTSTRAP_PASSWORD: password,
  OWNER_BOOTSTRAP_STORE_ID: storeId,
  OWNER_BOOTSTRAP_STORE_NAME: "Bootstrap integration",
};

afterAll(async () => {
  const result = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const created = result.data?.users.find(user => user.email === email);
  if (created) {
    expect((await admin.from("owner_members").delete().eq("auth_user_id", created.id)).error).toBeNull();
    expect((await admin.auth.admin.deleteUser(created.id)).error).toBeNull();
  }
  expect((await admin.from("stores").delete().eq("id", storeId)).error).toBeNull();
});

it("bootstraps a confirmed owner once, preserving its password/store on restart", async () => {
  expect(await bootstrapOwner(env)).toEqual({ status: "created" });
  const browser = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await browser.auth.signInWithPassword({ email, password });
  expect(login.error).toBeNull();
  userId = login.data.user?.id;
  expect(userId).toBeTruthy();
  const membership = await browser.from("owner_members").select("store_id,role").eq("auth_user_id", userId).single();
  expect(membership.error).toBeNull();
  expect(membership.data).toEqual({ store_id: storeId, role: "owner" });
  expect(await bootstrapOwner({ ...env, OWNER_BOOTSTRAP_PASSWORD: `${randomUUID()}Changed!`, OWNER_BOOTSTRAP_STORE_NAME: "Should not rename" })).toEqual({ status: "existing" });
  expect((await browser.auth.signInWithPassword({ email, password })).error).toBeNull();
  const store = await browser.from("stores").select("name,version").eq("id", storeId).single();
  expect(store.data).toEqual({ name: "Bootstrap integration", version: 1 });
});
