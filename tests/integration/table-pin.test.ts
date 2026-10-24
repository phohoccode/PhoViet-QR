import { execFile, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { openTableSession, revealTablePin, rotateTablePin, verifyTableSession, requireGuestTableSession } from "../../src/server/table-sessions/service";
import { encryptPin, pinVerifier } from "../../src/server/table-sessions/pin-crypto";
import { hashSecret, newBrowserToken } from "../../src/server/security/crypto";
import { resolvePublicQr } from "../../src/server/qr/service";
import { createDineInOrder, getGuestOrder } from "../../src/server/orders/service";
import { claimNextOrder, markOwnerOrderReady, completeOwnerOrder } from "../../src/server/orders/owner-service";
import { listManagedTables } from "../../src/server/tables/service";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:15421") throw Error("Refusing non-local PIN tests");
const args = ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"];
const sql = (input: string) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const concurrent = (input: string) => new Promise<string>((resolve, reject) => {
  let result = "";
  const child = execFile("docker", args, { windowsHide: true }, error => error ? reject(Error("Isolated PIN SQL failed")) : resolve(result));
  child.stdout!.on("data", value => { result += value; }); child.stdin!.end(input);
});
const rpc = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stores = [randomUUID(), randomUUID()], actors = [randomUUID(), randomUUID()], tables: string[] = [], codes: string[] = [];
const category = randomUUID(), item = randomUUID(), counter = randomUUID(), devices: ReturnType<typeof device>[] = [];
const owner = { storeId: stores[0], authUserId: actors[0] }, other = { storeId: stores[1], authUserId: actors[1] };
const key = () => ({ requestId: randomUUID() });
function device() { const token = newBrowserToken(); return { token, browserHash: hashSecret(token), grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: true, ipHash: hashSecret("shared-WiFi-pin-test") }; }
function browser() { const context = device(); devices.push(context); return context; }
function table() {
  const id = randomUUID(), code = randomUUID(); tables.push(id); codes.push(code);
  sql(`insert into public.dining_tables(id,store_id,label) values('${id}','${stores[0]}','PIN ${tables.length}');insert into public.qr_codes(store_id,type,table_id,public_code) values('${stores[0]}','table','${id}','${code}');`);
  return { id, code };
}
const wrong = (pin: string) => pin === "000000" ? "000001" : "000000";
async function waitSleep(name: string) {
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 20)); if (sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`) === "1") return; }
  throw Error("PIN lock fixture did not acquire lock");
}
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY || status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY; process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.TABLE_SESSION_ENCRYPTION_KEYS = JSON.stringify({ v1: randomBytes(32).toString("base64") }); process.env.TABLE_SESSION_ACTIVE_KEY_ID = "v1";
  process.env.TABLE_PIN_HMAC_KEYS = JSON.stringify({ v1: randomBytes(32).toString("base64") }); process.env.TABLE_PIN_ACTIVE_HMAC_KEY_ID = "v1";
  sql(`insert into auth.users(id) values('${actors[0]}'),('${actors[1]}');insert into public.stores(id,name) values('${stores[0]}','PIN fixture'),('${stores[1]}','Other PIN fixture');
   insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${actors[0]}'),('${stores[1]}','${actors[1]}');
   insert into public.menu_categories(id,store_id,name) values('${category}','${stores[0]}','PIN menu');
   insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${stores[0]}','${category}','Coffee',100);
   insert into public.qr_codes(store_id,type,public_code) values('${stores[0]}','takeaway','${counter}');`);
});
beforeEach(() => sql(`delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array['owner:${actors[0]}:read','owner:${actors[0]}:write']) k)`));
afterAll(() => {
  const orderIds: string[] = JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.orders where store_id='${stores[0]}'`));
  const qrIds: string[] = JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.qr_codes where store_id='${stores[0]}'`));
  const rateKeys = [...actors.flatMap(id => [`owner:${id}:read`, `owner:${id}:write`]),
    ...qrIds.flatMap(id => [`pin-table-burst:${id}`, `pin-table-minute:${id}`, ...devices.flatMap(d => [`pin-ip-burst:${d.ipHash}:${id}`, `pin-ip-minute:${d.ipHash}:${id}`, `pin-device-burst:${d.browserHash}:${id}`, `verify:${d.browserHash}:${id}`, `read:${d.browserHash}:${id}`])]),
    ...devices.flatMap(d => [`order-create:${d.browserHash}:${stores[0]}`, ...orderIds.map(id => `order-read:${d.browserHash}:${id}`)])];
  sql(`begin;set local session_replication_role=replica;
   delete from public.outbox_events where aggregate_id in(select id from public.table_sessions where store_id='${stores[0]}' union all select id from public.orders where store_id='${stores[0]}');
   delete from public.order_events where store_id='${stores[0]}';delete from public.order_requests where store_id='${stores[0]}';delete from public.order_items where store_id='${stores[0]}';delete from public.orders where store_id='${stores[0]}';delete from public.ticket_counters where store_id='${stores[0]}';
   delete from public.table_pin_audit_log where store_id='${stores[0]}';delete from public.operation_requests where store_id in('${stores.join("','")}');
   delete from public.guest_access where store_id='${stores[0]}';delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id='${stores[0]}');delete from public.table_sessions where store_id='${stores[0]}';
   delete from public.qr_codes where store_id='${stores[0]}';delete from public.dining_tables where store_id='${stores[0]}';delete from public.menu_items where store_id='${stores[0]}';delete from public.menu_categories where store_id='${stores[0]}';
   delete from public.owner_members where store_id in('${stores.join("','")}');delete from public.stores where id in('${stores.join("','")}');delete from auth.users where id in('${actors.join("','")}');
   delete from public.guest_browser_contexts where token_hash in('${devices.map(d => d.browserHash).join("','")}');
   delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${rateKeys.map(k => `'${k}'`).join(",")}]::text[]) k);commit;`);
});

it("open/reveal stores only contextual HMAC/ciphertext, audits reveal, hides secrets from ordinary tables and public QR", async () => {
  const t = table(), cmd = key(), opened = await openTableSession(owner, t.id.toUpperCase(), cmd), pin = opened.sessionCredential.sessionCode;
  expect(pin).toMatch(/^[0-9]{6}$/); expect(opened.sessionCredential.pinFormat).toBe("numeric_6");
  const revealed = await revealTablePin(owner, opened.session.id); expect(revealed.pin).toBe(pin);
  expect(await openTableSession(owner, t.id, cmd)).toEqual(opened);
  const row = JSON.parse(sql(`select to_jsonb(s) from public.table_sessions s where id='${opened.session.id}'`));
  expect(row.code_hash).toBe(pinVerifier(pin, stores[0], opened.session.id, 1, "v1")); expect(row.code_hash).not.toBe(hashSecret(pin));
  const artifact = JSON.parse(sql(`select artifact from public.session_code_deliveries where session_id='${opened.session.id}'`));
  expect(Buffer.from(artifact.iv, "base64")).toHaveLength(12); expect(Buffer.from(artifact.tag, "base64")).toHaveLength(16);
  for (const data of [row, artifact, await listManagedTables(owner), await resolvePublicQr(t.code, browser())]) {
    expect(data).not.toHaveProperty("pin"); expect(data).not.toHaveProperty("sessionCredential");
  }
  const audit = sql(`select json_agg(to_jsonb(a)) from public.table_pin_audit_log a where session_id='${opened.session.id}'`);
  expect(audit).toContain("PIN_REVEALED"); expect(audit).not.toMatch(/"pin"|artifact|code_hash|ciphertext/);
  expect(await resolvePublicQr(counter, browser())).toMatchObject({ type: "takeaway", requiresSessionCode: false });
});

it("leading-zero PIN verifies against its table; wrong/cross-table/non-numeric inputs cannot grant access", async () => {
  const t = table(), target = table(), id = randomUUID(), pin = "000042";
  const artifact = encryptPin(pin, "v1", stores[0], t.id, id, 1);
  sql(`begin;insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at,pin_key_id,pin_generation,pin_issued_at)
   values('${id}','${stores[0]}','${t.id}','${pinVerifier(pin, stores[0], id, 1, "v1")}',clock_timestamp()+interval '24 hours','v1',1,clock_timestamp());
   insert into public.session_code_deliveries(session_id,key_id,artifact,expires_at,pin_generation) values('${id}','v1','${JSON.stringify(artifact)}',clock_timestamp()+interval '24 hours',1);commit;`);
  const guest = browser(); expect((await verifyTableSession(t.code, pin, guest)).session?.id).toBe(id);
  expect((await requireGuestTableSession(t.code, guest)).sessionId).toBe(id);
  const otherPin = await openTableSession(owner, target.id, key());
  if (otherPin.sessionCredential.sessionCode === pin) await rotateTablePin(owner, otherPin.session.id, { ...key(), expectedVersion: 1, confirm: true });
  await expect(verifyTableSession(target.code, pin, browser())).rejects.toMatchObject({ code: "INVALID_SESSION_CODE" });
  for (const bad of ["12345", "1234567", "abcdef"]) await expect(verifyTableSession(t.code, bad, browser())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});

it("explicitly converts legacy with existing grant/orders, preserves scopes and Phase3 FIFO, invalidates legacy verifier", async () => {
  const t = table(), id = randomUUID(), legacy = randomBytes(16).toString("base64url"), guest = browser();
  sql(`insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${id}','${stores[0]}','${t.id}','${hashSecret(legacy)}',clock_timestamp()+interval '24 hours');
   insert into public.guest_browser_contexts(token_hash) values('${guest.browserHash}');
   insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at) values('${stores[0]}','${id}','${hashSecret(`${guest.grantProof}:${id}`)}','${guest.browserHash}',clock_timestamp()+interval '6 hours');`);
  expect((await listManagedTables(owner)).tables.find(x => x.id === t.id)?.session?.pinState).toBe("legacy");
  const order = await createDineInOrder({ qrCode: t.code, clientRequestId: randomUUID(), menuRevision: sql(`select menu_revision from public.stores where id='${stores[0]}'`), items: [{ menuItemId: item, quantity: 1, optionIds: [], note: null }], note: null }, guest);
  await expect(revealTablePin(owner, id)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  const beforeGrant = sql(`select to_jsonb(g) from public.guest_access g where scope_id='${id}'`), cmd = { ...key(), expectedVersion: 1, confirm: true as const };
  const converted = await rotateTablePin(owner, id, cmd);
  expect(converted).toMatchObject({ sessionId: id, generation: 1, sessionVersion: 2 });
  expect(sql(`select code_hash from public.table_sessions where id='${id}'`)).toBe(pinVerifier(converted.pin, stores[0], id, 1, "v1"));
  expect(sql(`select code_hash from public.table_sessions where id='${id}'`)).not.toBe(hashSecret(legacy));
  expect(sql(`select to_jsonb(g) from public.guest_access g where scope_id='${id}'`)).toBe(beforeGrant);
  expect(await rotateTablePin(owner, id, cmd)).toEqual(converted);
  expect((await getGuestOrder(order.id, guest)).ticketNo).toBe(order.ticketNo);
  expect((await requireGuestTableSession(t.code, guest)).sessionId).toBe(id);
  await expect(verifyTableSession(t.code, legacy, browser())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  const oldPath = await rpc.rpc("p2_execute", { action: "verify", input: { qrCode: t.code, codeHash: hashSecret(legacy), browserHash: guest.browserHash, grantProof: guest.grantProof } });
  expect(oldPath.data).toEqual({ error: "INVALID_STATE_TRANSITION" });
  expect((await verifyTableSession(t.code, converted.pin, browser())).session?.id).toBe(id);
  const claimed = (await claimNextOrder(owner, key()))!; expect(claimed.id).toBe(order.id);
  const ready = await markOwnerOrderReady(owner, claimed.id, { ...key(), expectedVersion: claimed.version });
  const completed = await completeOwnerOrder(owner, ready.id, { ...key(), expectedVersion: ready.version, type: "dine_in" });
  expect(completed.status).toBe("completed"); expect(completed.paymentStatus).toBe("unpaid");
});

it("20 same-key rotations change PIN once; stale different-key tabs conflict and old keys never reveal superseded PIN", async () => {
  const t = table(), openKey = key(), opened = await openTableSession(owner, t.id, openKey), cmd = { ...key(), expectedVersion: 1, confirm: true as const };
  const guest = browser(); await verifyTableSession(t.code, opened.sessionCredential.sessionCode, guest);
  const rotated = await Promise.all(Array.from({ length: 20 }, () => rotateTablePin(owner, opened.session.id.toUpperCase(), cmd)));
  rotated.forEach(result => expect(result).toEqual(rotated[0])); expect(rotated[0].pin).not.toBe(opened.sessionCredential.sessionCode); expect(rotated[0].generation).toBe(2);
  expect(sql(`select count(*) from public.table_pin_audit_log where session_id='${opened.session.id}' and action='PIN_ROTATED'`)).toBe("1");
  expect((await requireGuestTableSession(t.code, guest)).sessionId).toBe(opened.session.id);
  await expect(verifyTableSession(t.code, opened.sessionCredential.sessionCode, browser())).rejects.toMatchObject({ code: "INVALID_SESSION_CODE" });
  expect((await verifyTableSession(t.code, rotated[0].pin, browser())).requiresSessionCode).toBe(false);
  const tabs = await Promise.allSettled(Array.from({ length: 2 }, () => rotateTablePin(owner, opened.session.id, { ...key(), expectedVersion: 2, confirm: true })));
  expect(tabs.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(tabs.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "INVALID_STATE_TRANSITION" } });
  await expect(rotateTablePin(owner, opened.session.id, cmd)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  await expect(openTableSession(owner, t.id, openKey)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  await expect(rotateTablePin(owner, opened.session.id, { ...cmd, expectedVersion: 3 })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
});

it("multi-instance durable device/IP/table burst limits preserve shared-WiFi access to other devices/tables", async () => {
  const t = table(), t2 = table(), opened = await openTableSession(owner, t.id, key()), otherPin = await openTableSession(owner, t2.id, key());
  const attacker = browser();
  for (let i = 0; i < 5; i++) await expect(verifyTableSession(t.code, wrong(opened.sessionCredential.sessionCode), attacker)).rejects.toMatchObject({ code: "INVALID_SESSION_CODE" });
  // Each service call creates an independent REST client; state is in Postgres.
  await expect(verifyTableSession(t.code, opened.sessionCredential.sessionCode, attacker)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect((await verifyTableSession(t.code, opened.sessionCredential.sessionCode, browser())).requiresSessionCode).toBe(false);
  expect((await verifyTableSession(t2.code, otherPin.sessionCredential.sessionCode, { ...attacker, browserHash: browser().browserHash })).requiresSessionCode).toBe(false);
  // A new cookie per guess still hits source+QR and then aggregate QR limits.
  for (let i = 0; i < 3; i++) await expect(verifyTableSession(t.code, wrong(opened.sessionCredential.sessionCode), browser())).rejects.toMatchObject({ code: "INVALID_SESSION_CODE" });
  await expect(verifyTableSession(t.code, opened.sessionCredential.sessionCode, browser())).rejects.toMatchObject({ code: "RATE_LIMITED" });
  const qrId = sql(`select id from public.qr_codes where public_code='${t.code}'`);
  sql(`update public.security_rate_buckets set attempts=20 where key_hash=encode(extensions.digest('pin-table-burst:${qrId}','sha256'),'hex')`);
  await expect(verifyTableSession(t.code, opened.sessionCredential.sessionCode, { ...browser(), ipHash: hashSecret("different-source") })).rejects.toMatchObject({ code: "RATE_LIMITED", details: { retryAfterSeconds: expect.any(Number) } });
});

it("owner scope/RPC grants isolate PIN secrets and reveal/rotate deny checkout, expired and closed sessions", async () => {
  const t = table(), opened = await openTableSession(owner, t.id, key()), id = opened.session.id;
  await expect(revealTablePin(other, id)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  await expect(rotateTablePin(other, id, { ...key(), expectedVersion: 1, confirm: true })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  await expect(revealTablePin({ storeId: stores[0], authUserId: actors[1] }, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  for (const role of ["anon", "authenticated"]) {
    expect(sql(`select has_function_privilege('${role}','public.p2_pin_execute(text,jsonb)','execute')`)).toBe("f");
    for (const rel of ["table_sessions", "session_code_deliveries", "table_pin_audit_log"]) expect(sql(`select has_table_privilege('${role}','public.${rel}','select')`)).toBe("f");
  }
  sql(`update public.table_sessions set status='checkout_pending' where id='${id}'`);
  await expect(revealTablePin(owner, id)).rejects.toMatchObject({ code: "SESSION_CHECKOUT_PENDING" });
  await expect(verifyTableSession(t.code, opened.sessionCredential.sessionCode, browser())).rejects.toMatchObject({ code: "SESSION_CHECKOUT_PENDING" });
  sql(`update public.table_sessions set status='open' where id='${id}'`);
  const name = `pin-close-${id}`;
  const closing = concurrent(`set application_name='${name}';begin;update public.table_sessions set status='closed' where id='${id}';select pg_sleep(0.5);commit;`);
  await waitSleep(name); await expect(revealTablePin(owner, id)).rejects.toMatchObject({ code: "SESSION_EXPIRED" }); await closing;
  await expect(rotateTablePin(owner, id, { ...key(), expectedVersion: 3, confirm: true })).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  expect(sql(`select count(*) from public.session_code_deliveries where session_id='${id}'`)).toBe("0");
  const fresh = await openTableSession(owner, t.id, key()); expect(fresh.session.id).not.toBe(id);
  const expiredTable = table(), expired = await openTableSession(owner, expiredTable.id, key());
  sql(`update public.table_sessions set opened_at=clock_timestamp()-interval '2 days',code_expires_at=clock_timestamp()-interval '1 day' where id='${expired.session.id}'`);
  await expect(revealTablePin(owner, expired.session.id)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
});

it("a late rotation outbox failure rolls back HMAC, ciphertext, version, audit and idempotency", async () => {
  const t = table(), opened = await openTableSession(owner, t.id, key()), id = opened.session.id, suffix = id.replaceAll("-", "");
  const snapshot = () => sql(`select jsonb_build_object('session',(select to_jsonb(s) from public.table_sessions s where id='${id}'),'delivery',(select to_jsonb(d) from public.session_code_deliveries d where session_id='${id}'),'audit',(select count(*) from public.table_pin_audit_log where session_id='${id}'),'op',(select count(*) from public.operation_requests where store_id='${stores[0]}'),'events',(select count(*) from public.outbox_events where aggregate_id='${id}'))`);
  const before = snapshot(), cmd = { ...key(), expectedVersion: 1, confirm: true as const };
  sql(`create function public.pin_fault_${suffix}() returns trigger language plpgsql as $$ begin if new.aggregate_id='${id}' and new.topic='table_session.updated' then raise exception 'isolated PIN failure';end if;return new;end;$$;create trigger pin_fault_${suffix} before insert on public.outbox_events for each row execute function public.pin_fault_${suffix}();`);
  try { await expect(rotateTablePin(owner, id, cmd)).rejects.toMatchObject({ code: "INTERNAL_ERROR" }); }
  finally { sql(`drop trigger pin_fault_${suffix} on public.outbox_events;drop function public.pin_fault_${suffix}()`); }
  expect(snapshot()).toBe(before); expect((await revealTablePin(owner, id)).pin).toBe(opened.sessionCredential.sessionCode);
  expect((await rotateTablePin(owner, id, cmd)).generation).toBe(2);
});
