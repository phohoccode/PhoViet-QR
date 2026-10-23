import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { hashSecret, newBrowserToken } from "../../src/server/security/crypto";
import { resolvePublicQr, listOwnerQrCodes } from "../../src/server/qr/service";
import { openTableSession, listOwnerTables, verifyTableSession, requireGuestTableSession } from "../../src/server/table-sessions/service";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as Record<string, string>;
if (status.API_URL !== "http://127.0.0.1:15421") throw new Error("Refusing non-local QR integration");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = (input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const stores = [randomUUID(), randomUUID()], tables = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const qr = tables.map(() => randomBytes(16).toString("hex")), takeaway = randomBytes(16).toString("hex");
const users: string[] = [];
const fixturePassword = `${randomUUID()}aA!9`;
const browserHashes = new Set<string>();
const browser = () => { const token = newBrowserToken(), browserHash = hashSecret(token); browserHashes.add(browserHash); return { token, browserHash, grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: true }; };
const owner = () => ({ authUserId: users[0], storeId: stores[0] });
let opened: Awaited<ReturnType<typeof openTableSession>>;
const requestId = randomUUID(), deviceA = browser(), deviceB = browser();
beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY || status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  process.env.TABLE_SESSION_ENCRYPTION_KEYS = JSON.stringify({ v1: randomBytes(32).toString("base64") });
  process.env.TABLE_SESSION_ACTIVE_KEY_ID = "v1";
  for (let i = 0; i < 3; i++) {
    const result = await admin.auth.admin.createUser({ email: `qr-${randomUUID()}@example.invalid`, password: fixturePassword, email_confirm: true });
    if (result.error || !result.data.user) throw new Error("Test Auth bootstrap failed");
    users.push(result.data.user.id);
  }
  sql(`begin; insert into public.stores(id,name) values('${stores[0]}','QR A'),('${stores[1]}','QR B');
    insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${users[0]}'),('${stores[1]}','${users[1]}');
    ${tables.map((id,i) => `insert into public.dining_tables(id,store_id,label) values('${id}','${stores[i===3?1:0]}','Table ${i}'); insert into public.qr_codes(store_id,type,table_id,public_code) values('${stores[i===3?1:0]}','table','${id}','${qr[i]}');`).join("\n")}
    insert into public.qr_codes(store_id,type,public_code) values('${stores[0]}','takeaway','${takeaway}'); commit;`);
});
afterAll(async () => {
  const qrIds=JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.qr_codes where store_id in('${stores.join("','")}')`)) as string[];
  const buckets = [
    ...users.flatMap(id => [`owner:${id}:read`,`owner:${id}:write`]),
    ...qrIds.flatMap(id => [`verify-qr:${id}`,`verify-ip:${hashSecret("shared-ip")}:${id}`,...[...browserHashes].flatMap(hash => [`read:${hash}:${id}`,`verify:${hash}:${id}`])]),
  ].map(hashSecret);
  sql(`begin; delete from public.guest_access where store_id in ('${stores.join("','")}');
    delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
    delete from public.operation_requests where store_id in('${stores.join("','")}');
    delete from public.outbox_events where aggregate_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
    delete from public.table_sessions where store_id in('${stores.join("','")}');
    delete from public.qr_codes where store_id in('${stores.join("','")}'); delete from public.dining_tables where store_id in('${stores.join("','")}');
    delete from public.owner_members where store_id in('${stores.join("','")}'); delete from public.stores where id in('${stores.join("','")}');
    delete from public.guest_browser_contexts where token_hash in('${[...browserHashes].join("','")}');
    delete from public.security_rate_buckets where key_hash in('${buckets.join("','")}'); commit;`);
  for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});
describe("real local QR/session/guest database", () => {
  it("resolves table/takeaway without leaking a live session or owner data", async () => {
    const table = await resolvePublicQr(qr[0], browser());
    expect(table).toMatchObject({ type: "table", mode: "dine_in", requiresSessionCode: true, session: null, table: { id: tables[0] } });
    expect(await resolvePublicQr(takeaway, browser())).toMatchObject({ type: "takeaway", table: null, session: null, requiresSessionCode: false });
    expect(JSON.stringify(table)).not.toMatch(/codeHash|code_hash|owner|membership|sessionCode/);
  });
  it("rejects unknown, disabled QR and inactive tables", async () => {
    await expect(resolvePublicQr("not-found", browser())).rejects.toMatchObject({ code: "INVALID_QR" });
    sql(`update public.qr_codes set active=false where public_code='${qr[2]}'`);
    await expect(resolvePublicQr(qr[2], browser())).rejects.toMatchObject({ code: "INVALID_QR" });
    sql(`update public.qr_codes set active=true where public_code='${qr[2]}'; update public.dining_tables set active=false where id='${tables[2]}'`);
    await expect(resolvePublicQr(qr[2], browser())).rejects.toMatchObject({ code: "INVALID_QR" });
    sql(`update public.dining_tables set active=true where id='${tables[2]}'`);
  });
  it("does not interpret acceptingOrders=false as an invalid QR", async () => {
    sql(`update public.stores set accepting_orders=false where id='${stores[0]}'`);
    expect((await resolvePublicQr(qr[0], browser())).store.acceptingOrders).toBe(false);
    sql(`update public.stores set accepting_orders=true where id='${stores[0]}'`);
  });
  it("opens once under race, stores only a hash/ciphertext, and replays identical commands", async () => {
    const results = await Promise.allSettled([openTableSession(owner(), tables[0], { requestId }), openTableSession(owner(), tables[0], { requestId: randomUUID() })]);
    const success = results.find(result => result.status === "fulfilled");
    expect(success?.status).toBe("fulfilled");
    if (!success || success.status !== "fulfilled") throw new Error("No open succeeded");
    opened = success.value;
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "INVALID_STATE_TRANSITION" } });
    expect(sql(`select count(*) from public.table_sessions where table_id='${tables[0]}' and status in('open','checkout_pending')`)).toBe("1");
    const op = JSON.parse(sql(`select json_build_object('requestId',request_id) from public.operation_requests where result_json->'session'->>'id'='${opened.session.id}'`));
    expect(await openTableSession(owner(), tables[0], { requestId: op.requestId })).toEqual(opened);
    const persisted = sql(`select row_to_json(s) from public.table_sessions s where id='${opened.session.id}'; select row_to_json(d) from public.session_code_deliveries d where session_id='${opened.session.id}'; select result_json from public.operation_requests where result_json->'session'->>'id'='${opened.session.id}'`);
    expect(persisted).not.toContain(opened.sessionCredential.sessionCode);
    expect(persisted).toContain(hashSecret(opened.sessionCredential.sessionCode));
    expect(sql(`select count(*) from public.outbox_events where aggregate_id='${opened.session.id}'`)).toBe("1");
  });
  it("enforces owner membership/store and idempotency binding", async () => {
    await expect(openTableSession({ authUserId: users[2], storeId: stores[0] }, tables[1], { requestId: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(openTableSession({ authUserId: users[1], storeId: stores[1] }, tables[0], { requestId: randomUUID() })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    const op = JSON.parse(sql(`select json_build_object('requestId',request_id) from public.operation_requests where result_json->'session'->>'id'='${opened.session.id}'`));
    await expect(openTableSession(owner(), tables[1], { requestId: op.requestId })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
    expect((await listOwnerTables(owner())).tables.every(table => tables.slice(0,3).includes(table.id))).toBe(true);
    await expect(listOwnerTables(owner(), tables[3])).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    const data = await listOwnerTables(owner(), tables[0]);
    expect(data.detail?.orders).toEqual([]); expect(data.detail?.session.id).toBe(opened.session.id);
    expect(JSON.stringify(data)).not.toMatch(/code_hash|sessionCode|artifact|token_hash/);
    expect(await listOwnerQrCodes(owner())).toHaveLength(4);
  });
  it("commits brute-force limits and isolates browsers on shared Wi-Fi", async () => {
    const attacker = { ...browser(), ipHash: hashSecret("shared-ip") };
    for (let i=0;i<5;i++) await expect(verifyTableSession(qr[0], "wrong", attacker)).rejects.toMatchObject({ code: "INVALID_SESSION_CODE" });
    await expect(verifyTableSession(qr[0], "wrong", attacker)).rejects.toMatchObject({ code: "RATE_LIMITED", details: { retryAfterSeconds: expect.any(Number) } });
    expect(await verifyTableSession(qr[0], opened.sessionCredential.sessionCode, { ...deviceA, ipHash: attacker.ipHash })).toMatchObject({ requiresSessionCode: false, session: { id: opened.session.id } });
  });
  it("issues independent grants to multiple devices and prevents cross-table access", async () => {
    await verifyTableSession(qr[0], opened.sessionCredential.sessionCode, deviceB);
    const a = await requireGuestTableSession(qr[0], deviceA), b = await requireGuestTableSession(qr[0], deviceB);
    expect(a.sessionId).toBe(b.sessionId); expect(a.guestAccessId).not.toBe(b.guestAccessId);
    await expect(requireGuestTableSession(qr[3], deviceA)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    const second = await openTableSession(owner(), tables[1], { requestId: randomUUID() });
    await expect(requireGuestTableSession(qr[1], deviceA)).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    await verifyTableSession(qr[1], second.sessionCredential.sessionCode, deviceA);
    expect((await requireGuestTableSession(qr[0], deviceA)).sessionId).toBe(opened.session.id);
    expect((await requireGuestTableSession(qr[1], deviceA)).sessionId).toBe(second.session.id);
  });
  it("does not count successful verify retries as failed guesses", async () => {
    const device = browser();
    for (let i=0;i<7;i++) expect((await verifyTableSession(qr[0], opened.sessionCredential.sessionCode, device)).requiresSessionCode).toBe(false);
    expect(sql(`select count(*) from public.guest_access where scope_id='${opened.session.id}' and browser_context_hash='${device.browserHash}'`)).toBe("1");
  });
  it("does not replay another owner's command even within the same store", async () => {
    sql(`insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${users[2]}')`);
    const op = JSON.parse(sql(`select json_build_object('requestId',request_id) from public.operation_requests where result_json->'session'->>'id'='${opened.session.id}'`));
    await expect(openTableSession({ authUserId: users[2], storeId: stores[0] }, tables[0], { requestId: op.requestId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("allows checkout-pending reads/verify but rejects future order writes", async () => {
    sql(`update public.table_sessions set status='checkout_pending',version=version+1 where id='${opened.session.id}'`);
    expect(await verifyTableSession(qr[0], opened.sessionCredential.sessionCode, browser())).toMatchObject({ session: { status: "checkout_pending" } });
    await expect(requireGuestTableSession(qr[0], deviceA)).rejects.toMatchObject({ code: "SESSION_CHECKOUT_PENDING" });
    expect((await requireGuestTableSession(qr[0], deviceA, { forWrite: false })).sessionId).toBe(opened.session.id);
    await expect(openTableSession(owner(), tables[0], { requestId: randomUUID() })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    sql(`update public.table_sessions set status='open',version=version+1 where id='${opened.session.id}'`);
  });
  it("denies revoked/expired grants and wrong expected session", async () => {
    await expect(requireGuestTableSession(qr[0], deviceA, { expectedSessionId: randomUUID() })).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    sql(`update public.guest_access set revoked_at=clock_timestamp() where scope_id='${opened.session.id}' and browser_context_hash='${deviceB.browserHash}'`);
    await expect(requireGuestTableSession(qr[0], deviceB)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await expect(verifyTableSession(qr[0], opened.sessionCredential.sessionCode, deviceB)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    sql(`update public.guest_access set expires_at=clock_timestamp()-interval '1 second' where scope_id='${opened.session.id}' and browser_context_hash='${deviceA.browserHash}'`);
    await expect(requireGuestTableSession(qr[0], deviceA)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("enforces same-store FK and denies anon/authenticated sensitive-table access and RPC", async () => {
    let failed = false;
    try { sql(`insert into public.table_sessions(store_id,table_id,code_hash,code_expires_at) values('${stores[0]}','${tables[3]}','${"a".repeat(64)}',clock_timestamp()+interval '1 hour')`); } catch { failed=true; }
    expect(failed).toBe(true);
    const anon = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const user = await admin.auth.admin.getUserById(users[0]);
    const auth = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await auth.auth.signInWithPassword({ email: user.data.user!.email!, password: fixturePassword })).error).toBeNull();
    for (const client of [anon, auth]) {
      for (const table of ["table_sessions","guest_access","session_code_deliveries","operation_requests","security_rate_buckets","guest_browser_contexts","outbox_events"]) expect((await client.from(table).select("*")).error).not.toBeNull();
      expect((await client.rpc("p2_execute", { action: "owner_tables", input: { ownerId: users[0], storeId: stores[0] } })).error).not.toBeNull();
    }
    expect((await anon.rpc("p2_execute", { action: "owner_tables", input: { ownerId: users[0], storeId: stores[0] } })).error).not.toBeNull();
  });
  it("closed sessions and old code/token/replay never revive a session", async () => {
    sql(`update public.table_sessions set status='closed',closed_at=clock_timestamp(),version=version+1 where id='${opened.session.id}'`);
    await expect(verifyTableSession(qr[0], opened.sessionCredential.sessionCode, browser())).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await expect(requireGuestTableSession(qr[0], deviceA)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    const op = JSON.parse(sql(`select json_build_object('requestId',request_id) from public.operation_requests where result_json->'session'->>'id'='${opened.session.id}'`));
    await expect(openTableSession(owner(), tables[0], { requestId: op.requestId })).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(await resolvePublicQr(qr[0], deviceA)).toMatchObject({ requiresSessionCode: true, session: null });
    expect(sql(`select count(*) from public.guest_access where scope_id='${opened.session.id}' and revoked_at is null`)).toBe("0");
    expect(sql(`select count(*) from public.session_code_deliveries where session_id='${opened.session.id}'`)).toBe("0");
    const fresh = await openTableSession(owner(), tables[0], { requestId: randomUUID() });
    expect(fresh.session.id).not.toBe(opened.session.id);
    await expect(verifyTableSession(qr[0], opened.sessionCredential.sessionCode, browser())).rejects.toMatchObject({ code: "INVALID_SESSION_CODE" });
  });
  it("expires codes/browser contexts without creating or restoring grants", async () => {
    const target = await openTableSession(owner(), tables[2], { requestId: randomUUID() });
    sql(`update public.table_sessions set opened_at=clock_timestamp()-interval '2 days',code_expires_at=clock_timestamp()-interval '1 day' where id='${target.session.id}'`);
    await expect(verifyTableSession(qr[2], target.sessionCredential.sessionCode, browser())).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    const device=browser(); await resolvePublicQr(qr[1],device);
    sql(`update public.guest_browser_contexts set expires_at=clock_timestamp()-interval '1 second' where token_hash='${device.browserHash}'`);
    await expect(resolvePublicQr(qr[1],{...device,isNew:false})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
