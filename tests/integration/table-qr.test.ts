import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createTable, updateTable, listManagedTables } from "../../src/server/tables/service";
import { listManagedQrCodes, writeOwnerQr, rotateOwnerQr, resolvePublicQr } from "../../src/server/qr/service";
import { openTableSession, verifyTableSession } from "../../src/server/table-sessions/service";
import { hashSecret } from "../../src/server/security/crypto";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:15421") throw Error("Refusing non-local table/QR tests");
const sql = (input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stores = [randomUUID(), randomUUID()], users: string[] = [], hashes: string[] = [];
const owner = () => ({ storeId: stores[0], authUserId: users[0] });
const foreign = () => ({ storeId: stores[1], authUserId: users[1] });
const command = () => ({ requestId: randomUUID() });
const browser = () => { const token = randomBytes(32).toString("base64url"); hashes.push(hashSecret(token)); return { token, browserHash: hashSecret(token), grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: true }; };
const makeTable = (label = `Bàn ${randomUUID()}`) => createTable(owner(), { ...command(), label });
const lastJson = (value: string) => JSON.parse(value.split("\n").filter(line => line.startsWith("{")).at(-1)!);

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY || status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  process.env.APP_BASE_URL = "https://qr.example.invalid";
  process.env.TABLE_SESSION_ENCRYPTION_KEYS = JSON.stringify({ v1: randomBytes(32).toString("base64") });
  process.env.TABLE_SESSION_ACTIVE_KEY_ID = "v1";
  process.env.TABLE_PIN_HMAC_KEYS = JSON.stringify({ v1: randomBytes(32).toString("base64") });
  process.env.TABLE_PIN_ACTIVE_HMAC_KEY_ID = "v1";
  for (let i = 0; i < 3; i++) {
    const r = await admin.auth.admin.createUser({ email: `tables-${randomUUID()}@example.invalid`, password: `${randomUUID()}aA!9`, email_confirm: true });
    if (r.error || !r.data.user) throw Error("Local Auth setup failed");
    users.push(r.data.user.id);
  }
  sql(`insert into public.stores(id,name) values('${stores[0]}','Lifecycle A'),('${stores[1]}','Lifecycle B');
    insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${users[0]}'),('${stores[1]}','${users[1]}'),('${stores[0]}','${users[2]}');`);
});
beforeEach(() => {
  sql(`delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${users.flatMap(id => [`'owner:${id}:read'`, `'owner:${id}:write'`]).join(",")}]::text[]) k)`);
});
afterAll(async () => {
  const qrIds: string[] = JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.qr_codes where store_id in('${stores.join("','")}')`));
  const pinKeys = qrIds.flatMap(id => [`pin-table-burst:${id}`, `pin-table-minute:${id}`, ...hashes.map(h => `pin-device-burst:${h}:${id}`)]);
  sql(`delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${pinKeys.map(k => `'${k}'`).join(",")}]::text[]) k)`);
  // Local postgres only: bypass immutable-history triggers for these random fixtures.
  sql(`begin;set local session_replication_role=replica;
    delete from public.guest_access where store_id in('${stores.join("','")}');
    delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
    delete from public.operation_requests where store_id in('${stores.join("','")}');
    delete from public.table_qr_audit_log where store_id in('${stores.join("','")}');
    delete from public.outbox_events where aggregate_id in('${stores.join("','")}') or aggregate_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
    delete from public.table_sessions where store_id in('${stores.join("','")}');
    delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from (
      select unnest(array[${users.flatMap(id => [`'owner:${id}:read'`, `'owner:${id}:write'`]).join(",")}]::text[]) k
      union all select 'read:'||h||':'||q.id from public.qr_codes q cross join unnest(array['${hashes.join("','")}']::text[]) h where q.store_id in('${stores.join("','")}')
      union all select 'verify-qr:'||id from public.qr_codes where store_id in('${stores.join("','")}')
    ) keys);
    delete from public.qr_codes where store_id in('${stores.join("','")}');
    delete from public.dining_tables where store_id in('${stores.join("','")}');
    delete from public.owner_members where store_id in('${stores.join("','")}');
    delete from public.stores where id in('${stores.join("','")}');
    delete from public.guest_browser_contexts where token_hash in('${hashes.join("','")}');commit;`);
  for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});

describe("owner table and QR lifecycle on real local Supabase", () => {
  it("creates table and 128-bit QR atomically, returns stable list and resolves both modes", async () => {
    const table = await makeTable(" \tBàn\u0085 01 ");
    expect(table).toMatchObject({ label: "Bàn 01", active: true, session: null, qr: { type: "table", active: true } });
    expect(table.qr!.publicCode).toMatch(/^[a-f0-9]{32}$/);
    expect(table.qr!.publicUrl).toBe(`https://qr.example.invalid/q/${table.qr!.publicCode}`);
    const first = await listManagedTables(owner());
    expect(first.tables.find(t => t.id === table.id)).toEqual(table);
    expect((await listManagedTables(owner())).tables.find(t => t.id === table.id)).toEqual(table);
    expect(await resolvePublicQr(table.qr!.publicCode, browser())).toMatchObject({ requiresSessionCode: true, table: { id: table.id }, session: null });
    const qr = await writeOwnerQr(owner(), { ...command(), action: "create", type: "takeaway", tableId: null });
    expect(await resolvePublicQr(qr.publicCode, browser())).toMatchObject({ type: "takeaway", requiresSessionCode: false, table: null });
    await writeOwnerQr(owner(), { ...command(), action: "set_active", id: qr.id, active: false });
    expect(JSON.stringify(first)).not.toMatch(/sessionCode|codeHash|artifact|guestAccess|token/);
  });
  it("coalesces simultaneous retries, binds actor/action/payload and replays before CAS", async () => {
    const input = { ...command(), label: "Retry" };
    const [a, b] = await Promise.all([createTable(owner(), input), createTable(owner(), input)]);
    expect(a).toEqual(b);
    expect(sql(`select count(*) from public.dining_tables where store_id='${stores[0]}' and label='Retry'`)).toBe("1");
    await expect(createTable(owner(), { ...input, label: "Different" })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
    await expect(createTable({ ...owner(), authUserId: users[2] }, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const patch = { ...command(), expectedUpdatedAt: a.updatedAt, label: "Retried rename" };
    const changed = await updateTable(owner(), a.id, patch);
    expect(await updateTable(owner(), a.id, patch)).toEqual(changed);
    await expect(updateTable(owner(), a.id, { ...patch, ...command() })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", details: { field: "expectedUpdatedAt" } });
    await expect(writeOwnerQr(owner(), { requestId: input.requestId, action: "create", type: "takeaway", tableId: null })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  });
  it("normalizes labels in DB and rejects case/whitespace duplicates under concurrency", async () => {
    const results = await Promise.allSettled([makeTable("Café table"), makeTable(" café\t table ")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "VALIDATION_ERROR", details: { field: "label" } } });
    expect(() => sql(`insert into public.dining_tables(store_id,label) values('${stores[0]}','CAFÉ   TABLE')`)).toThrow();
    expect(() => sql(`insert into public.dining_tables(store_id,label) values('${stores[0]}',chr(1))`)).toThrow();
  });
  it("renames without changing printed QR, disables/re-enables table and QR consistently", async () => {
    let table = await makeTable(); const qr = table.qr!;
    table = await updateTable(owner(), table.id, { ...command(), expectedUpdatedAt: table.updatedAt, label: "New name" });
    expect(table.qr!.publicCode).toBe(qr.publicCode);
    expect(await resolvePublicQr(qr.publicCode, browser())).toMatchObject({ table: { label: "New name" } });
    table = await updateTable(owner(), table.id, { ...command(), expectedUpdatedAt: table.updatedAt, active: false });
    expect(table.qr!.active).toBe(true);
    await expect(resolvePublicQr(qr.publicCode, browser())).rejects.toMatchObject({ code: "INVALID_QR" });
    await expect(openTableSession(owner(), table.id, command())).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    table = await updateTable(owner(), table.id, { ...command(), expectedUpdatedAt: table.updatedAt, active: true });
    expect(table.qr!.publicUrl).toBe(qr.publicUrl);
    await writeOwnerQr(owner(), { ...command(), action: "set_active", id: qr.id, active: false });
    await expect(resolvePublicQr(qr.publicCode, browser())).rejects.toMatchObject({ code: "INVALID_QR" });
    await writeOwnerQr(owner(), { ...command(), action: "set_active", id: qr.id, active: true });
    expect((await resolvePublicQr(qr.publicCode, browser())).type).toBe("table");
    expect(() => sql(`delete from public.dining_tables where id='${table.id}'`)).toThrow();
  });
  it("serializes concurrent legacy table QR and takeaway creation", async () => {
    const table = await makeTable();
    await writeOwnerQr(owner(), { ...command(), action: "set_active", id: table.qr!.id, active: false });
    for (const target of [{ type: "table" as const, tableId: table.id }, { type: "takeaway" as const, tableId: null }]) {
      const results = await Promise.allSettled([writeOwnerQr(owner(), { ...command(), action: "create", ...target }), writeOwnerQr(owner(), { ...command(), action: "create", ...target })]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "INVALID_STATE_TRANSITION", details: { field: "activeQr" } } });
    }
    await expect(writeOwnerQr(owner(), { ...command(), action: "set_active", id: table.qr!.id, active: true })).rejects.toMatchObject({ details: { field: "activeQr" } });
    expect(sql(`select count(*) from public.qr_codes where table_id='${table.id}' and active`)).toBe("1");
  });
  it("blocks disabling/rotating while open or checkout_pending and preserves C01 verification", async () => {
    const table = await makeTable(), qr = table.qr!;
    const opened = await openTableSession(owner(), table.id, command());
    const device = browser();
    expect(await verifyTableSession(qr.publicCode, opened.sessionCredential.sessionCode, device)).toMatchObject({ requiresSessionCode: false, session: { id: opened.session.id } });
    for (const state of ["open", "checkout_pending"]) {
      sql(`update public.table_sessions set status='${state}' where id='${opened.session.id}'`);
      for (const action of [() => updateTable(owner(), table.id, { ...command(), expectedUpdatedAt: table.updatedAt, active: false }),
        () => writeOwnerQr(owner(), { ...command(), action: "set_active", id: qr.id, active: false }),
        () => rotateOwnerQr(owner(), qr.id, { ...command(), expectedUpdatedAt: qr.updatedAt, confirm: true })])
        await expect(action()).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", details: { field: "activeSession" } });
    }
    const detail = await listManagedTables(owner(), table.id);
    expect(detail.detail).toMatchObject({ table: { id: table.id }, session: { status: "checkout_pending" }, orders: [] });
    expect(JSON.stringify(detail)).not.toContain(opened.sessionCredential.sessionCode);
    // Trusted fixture close, not a new application endpoint.
    sql(`update public.table_sessions set status='closed' where id='${opened.session.id}'`);
    await expect(verifyTableSession(qr.publicCode, opened.sessionCredential.sessionCode, device)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect((await rotateOwnerQr(owner(), qr.id, { ...command(), expectedUpdatedAt: qr.updatedAt, confirm: true })).publicCode).not.toBe(qr.publicCode);
  });
  it("rotates once under contention, replays, and permanently retires the printed old code", async () => {
    const table = await makeTable(), qr = table.qr!;
    const input = { ...command(), expectedUpdatedAt: qr.updatedAt, confirm: true as const };
    const [a, b] = await Promise.all([rotateOwnerQr(owner(), qr.id, input), rotateOwnerQr(owner(), qr.id, input)]);
    expect(a).toEqual(b); expect(a.publicCode).not.toBe(qr.publicCode);
    await expect(resolvePublicQr(qr.publicCode, browser())).rejects.toMatchObject({ code: "INVALID_QR" });
    expect((await resolvePublicQr(a.publicCode, browser())).type).toBe("table");
    await expect(writeOwnerQr(owner(), { ...command(), action: "set_active", id: qr.id, active: true })).rejects.toMatchObject({ details: { field: "retiredQr" } });
    const attempts = await Promise.allSettled([rotateOwnerQr(owner(), a.id, { ...input, ...command(), expectedUpdatedAt: a.updatedAt }), rotateOwnerQr(owner(), a.id, { ...input, ...command(), expectedUpdatedAt: a.updatedAt })]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(sql(`select count(*) from public.qr_codes where table_id='${table.id}' and active`)).toBe("1");
    expect((await listManagedQrCodes(owner())).find(q => q.id === qr.id)).toMatchObject({ active: false, retiredAt: expect.any(String) });
  });
  it("rolls back retirement, table creation, audit, outbox and replay on mid-command failure", async () => {
    const table = await makeTable(), qr = table.qr!, requestId = randomUUID();
    const data = { ...owner(), ownerId: users[0], id: qr.id, requestId, expectedUpdatedAt: qr.updatedAt, confirm: true };
    delete (data as Partial<typeof data>).authUserId;
    const before = sql(`select count(*) from public.outbox_events where aggregate_id='${stores[0]}'`);
    // Transaction-local failure injection; rollback also removes test function/trigger.
    const result = lastJson(sql(`begin;
      create function public.p2_test_fail_qr() returns trigger language plpgsql as $$ begin
       if new.store_id='${stores[0]}'::uuid then raise unique_violation using constraint='qr_codes_one_active_table'; end if;return new;end $$;
      create trigger p2_test_fail before insert on public.qr_codes for each row execute function public.p2_test_fail_qr();
      set local role service_role;
      select public.p2_table_qr_execute('rotate_qr','${JSON.stringify(data)}');
      select jsonb_build_object('active',(select active from public.qr_codes where id='${qr.id}'),
       'retired',(select retired_at from public.qr_codes where id='${qr.id}'),
       'replays',(select count(*) from public.operation_requests where request_id='${requestId}'));
      rollback;`));
    expect(result).toEqual({ active: true, retired: null, replays: 0 });
    expect(sql(`select count(*) from public.outbox_events where aggregate_id='${stores[0]}'`)).toBe(before);
    expect((await resolvePublicQr(qr.publicCode, browser())).type).toBe("table");
    const input = { ownerId: users[0], storeId: stores[0], requestId: randomUUID(), label: "No orphan" };
    const rollback = lastJson(sql(`begin;
      create function public.p2_test_fail_qr() returns trigger language plpgsql as $$ begin raise unique_violation using constraint='qr_codes_one_active_table';end $$;
      create trigger p2_test_fail before insert on public.qr_codes for each row execute function public.p2_test_fail_qr();
      set local role service_role;select public.p2_table_qr_execute('create_table','${JSON.stringify(input)}');
      select jsonb_build_object('tables',(select count(*) from public.dining_tables where store_id='${stores[0]}' and label='No orphan'));rollback;`));
    expect(rollback.tables).toBe(0);
  });
  it("serializes session-open versus disable and resolver versus rotation without deadlocks", async () => {
    for (let i = 0; i < 3; i++) {
      const table = await makeTable();
      const results = await Promise.allSettled([openTableSession(owner(), table.id, command()), updateTable(owner(), table.id, { ...command(), expectedUpdatedAt: table.updatedAt, active: false })]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const errors = results.filter(r => r.status === "rejected");
      expect(errors).toMatchObject([{ reason: { code: "INVALID_STATE_TRANSITION" } }]);
    }
    const table = await makeTable(), qr = table.qr!;
    const [resolved, rotated] = await Promise.allSettled([resolvePublicQr(qr.publicCode, browser()), rotateOwnerQr(owner(), qr.id, { ...command(), expectedUpdatedAt: qr.updatedAt, confirm: true })]);
    expect(rotated.status).toBe("fulfilled");
    if (resolved.status === "rejected") expect(resolved.reason.code).toBe("INVALID_QR");
    await expect(resolvePublicQr(qr.publicCode, browser())).rejects.toMatchObject({ code: "INVALID_QR" });
  });
  it("rolls back resources and audit/outbox together if saving the idempotency result fails", () => {
    const input = { ownerId: users[0], storeId: stores[0], requestId: randomUUID(), label: "No partial audit" };
    const result = lastJson(sql(`begin;
      create temporary table p2_baseline as select (select count(*) from public.table_qr_audit_log where store_id='${stores[0]}') audits,
       (select count(*) from public.outbox_events where aggregate_id='${stores[0]}') events;
      grant select on p2_baseline to service_role;
      create function public.p2_test_fail_result() returns trigger language plpgsql as $$ begin
       if new.store_id='${stores[0]}'::uuid then raise unique_violation using constraint='qr_codes_one_active_table';end if;return new;end $$;
      create trigger p2_test_fail_result before insert on public.operation_requests for each row execute function public.p2_test_fail_result();
      set local role service_role;select public.p2_table_qr_execute('create_table','${JSON.stringify(input)}');
      select jsonb_build_object('tables',(select count(*) from public.dining_tables where store_id='${stores[0]}' and label='No partial audit'),
       'auditDelta',(select count(*) from public.table_qr_audit_log where store_id='${stores[0]}')-(select audits from p2_baseline),
       'eventDelta',(select count(*) from public.outbox_events where aggregate_id='${stores[0]}')-(select events from p2_baseline));rollback;`));
    expect(result).toEqual({ tables: 0, auditDelta: 0, eventDelta: 0 });
  });
  it("rotates takeaway with replay and serializes competing table edits using the same CAS token", async () => {
    const active = (await listManagedQrCodes(owner())).find(q => q.type === "takeaway" && q.active)!;
    const input = { ...command(), expectedUpdatedAt: active.updatedAt, confirm: true as const };
    const next = await rotateOwnerQr(owner(), active.id, input);
    expect(await rotateOwnerQr(owner(), active.id, input)).toEqual(next);
    await expect(resolvePublicQr(active.publicCode, browser())).rejects.toMatchObject({ code: "INVALID_QR" });
    expect(await resolvePublicQr(next.publicCode, browser())).toMatchObject({ type: "takeaway", requiresSessionCode: false });
    const table = await makeTable();
    const edits = await Promise.allSettled([updateTable(owner(), table.id, { ...command(), expectedUpdatedAt: table.updatedAt, label: "Edit A" }),
      updateTable(owner(), table.id, { ...command(), expectedUpdatedAt: table.updatedAt, label: "Edit B" })]);
    expect(edits.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(edits.find(r => r.status === "rejected")).toMatchObject({ reason: { details: { field: "expectedUpdatedAt" } } });
  });
  it("denies cross-store access, direct writes, RPC by guests and immutable identity changes", async () => {
    const table = await makeTable();
    await expect(updateTable(foreign(), table.id, { ...command(), expectedUpdatedAt: table.updatedAt, label: "Hijack" })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(rotateOwnerQr(foreign(), table.qr!.id, { ...command(), expectedUpdatedAt: table.qr!.updatedAt, confirm: true })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(createTable({ ...foreign(), authUserId: users[0] }, { ...command(), label: "Forged" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const role of ["anon", "authenticated"]) {
      expect(sql(`select has_function_privilege('${role}','public.p2_table_qr_execute(text,jsonb)','execute')`)).toBe("f");
      expect(() => sql(`set role ${role};update public.dining_tables set active=false where id='${table.id}'`)).toThrow();
      expect(sql(`select has_column_privilege('${role}','public.qr_codes','active','update')`)).toBe("f");
    }
    expect(sql("select has_table_privilege('service_role','public.qr_codes','delete')")).toBe("f");
    expect(() => sql(`update public.qr_codes set public_code='changed' where id='${table.qr!.id}'`)).toThrow();
    expect(() => sql(`insert into public.qr_codes(store_id,type,table_id) values('${stores[1]}','table','${table.id}')`)).toThrow();
  });
  it("fails before writes when canonical config is missing, and applies shared rate limits with replay allowed", async () => {
    const before = sql(`select count(*) from public.dining_tables where store_id='${stores[0]}'`);
    const base = process.env.APP_BASE_URL; delete process.env.APP_BASE_URL;
    try { await expect(makeTable("Config fail")).rejects.toMatchObject({ code: "INTERNAL_ERROR", details: { field: "APP_BASE_URL" } }); }
    finally { process.env.APP_BASE_URL = base; }
    expect(sql(`select count(*) from public.dining_tables where store_id='${stores[0]}'`)).toBe(before);
    const input = { ...command(), label: "Rate replay" }, table = await createTable(owner(), input);
    sql(`update public.security_rate_buckets set attempts=30,resets_at=clock_timestamp()+interval '1 minute' where key_hash=encode(extensions.digest('owner:${users[0]}:write','sha256'),'hex')`);
    expect(await createTable(owner(), input)).toEqual(table);
    await expect(makeTable()).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(sql(`select count(*) from public.table_qr_audit_log where entity_id='${table.id}'`)).toBe("1");
    expect(sql(`select count(*) from public.table_qr_audit_log where entity_id='${table.qr!.id}'`)).toBe("1");
    expect(sql(`select string_agg(payload::text,'') from public.outbox_events where aggregate_id='${stores[0]}'`)).not.toMatch(/sessionCode|artifact|code_hash|token/);
  });
});
