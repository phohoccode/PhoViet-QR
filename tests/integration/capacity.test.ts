import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';

// All schema edits, failure injection, and cleanup are confined to a disposable
// local database. No hosted URL, provider, credentials, or real charge is used.
const database = `p6_${randomUUID().replaceAll('-', '')}`;
const args = (db: string) => ['exec', '-i', 'supabase_db_qr-ordering-p1c02-local', 'psql', '-U', 'postgres', '-d', db, '-Atq', '-v', 'ON_ERROR_STOP=1'];
const sql = (s: string, db = database) => execFileSync('docker', args(db), { input: s, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const parallelSql = async (s: string) => (await promisify(execFile)('docker', [...args(database), '-c', s])).stdout.trim();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const sid = randomUUID(), actor = randomUUID(), table = randomUUID(), session = randomUUID(), qr = randomUUID(), tq = randomUUID(), category = randomUUID(), item = randomUUID();
const browser = hash('P6 buyer'), proof = hash('P6 proof'), verifier = hash('P6 correct verifier');
const scope = { storeId: sid, ownerId: actor };
const json = (v: unknown) => JSON.stringify(v).replaceAll("'", "''");
const query = (fn: string, action: string, input: object) => `set role service_role; select public.${fn}('${action}','${json(input)}')`;
const rpc = (fn: string, action: string, input: object) => JSON.parse(sql(query(fn, action, input)));
const patch = (fields: object) => rpc('p6_ordering_execute', 'patch', { ...scope, requestId: randomUUID(), expectedVersion: Number(sql(`select version from public.stores where id='${sid}'`)), ...fields });
const revision = () => sql(`select menu_revision from public.stores where id='${sid}'`);
const command = (code = tq) => ({ qrCode: code, clientRequestId: randomUUID(), menuRevision: revision(), items: [{ menuItemId: item, quantity: 1, optionIds: [], note: null }], note: null });
const guest = { browserHash: browser, grantProof: proof };
const checkout = (cmd = command()) => JSON.parse(sql(`set role service_role;select public.p4_checkout('${json({ ...guest, command: cmd, configuredStoreId: sid, accountNumber: '12345678', channelHash: hash('P6 channel') })}')`));

beforeAll(() => {
  sql(`create database ${database}`, 'postgres');
  sql('create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
  for (const name of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && f < '20261024001700').sort()) {
    sql(readFileSync(`supabase/migrations/${name}`, 'utf8'));
    if (name.includes('foundation')) sql('revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;');
  }
  const migration = readFileSync('supabase/migrations/20261024001700_capacity_admission_rate_limits.sql', 'utf8');
  sql(migration.replace(/commit;\s*$/, 'rollback;'));
  expect(sql("select to_regclass('public.capacity_rate_policy') is null")).toBe('t');
  const original = sql("select pg_get_functiondef('public.p4_checkout(jsonb)'::regprocedure)");
  sql(original.replace('AS $function$', 'AS $function$\n-- drift'));
  expect(() => sql(migration)).toThrow();
  expect(sql("select to_regclass('public.capacity_rate_policy') is null")).toBe('t');
  sql(original);
  // Reconstruct the exact Production source read from SQL Editor on 2026-10-24.
  // Its only differences from 010 are the missing store limiter and old emits.
  const storeRate = " retry:=public.p2_rate('takeaway-create-store:'||st.id,300);\n if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;\n";
  const oldEvents = " insert into public.order_events(store_id,order_id,event_type,version) values(st.id,o.id,'order.created',o.version);\n insert into public.outbox_events(topic,aggregate_id,version,payload) values('order.created',o.id,o.version,jsonb_build_object('aggregateId',o.id,'version',o.version,'type','order.created'));";
  const legacy = original.replaceAll('\r', '').replace(storeRate, '').replace(" perform public.p4_emit(o,'order.created');", oldEvents);
  sql(legacy);
  const checkoutHash = () => sql("select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.p4_checkout(jsonb)'::regprocedure");
  expect(checkoutHash()).toBe('2457e0ec02d73b9a53ed2ed23ba651eb');
  sql(legacy.replace('AS $function$', 'AS $function$\n-- unaudited legacy drift'));
  expect(() => sql(migration)).toThrow();
  sql(legacy);
  sql("alter function public.p4_checkout(jsonb) set lock_timeout='4s'");
  expect(() => sql(migration)).toThrow();
  sql(legacy);
  // Rollback must undo legacy normalization as well as all P6 schema changes.
  sql(migration.replace(/commit;\s*$/, 'rollback;'));
  expect(checkoutHash()).toBe('2457e0ec02d73b9a53ed2ed23ba651eb');
  expect(sql("select to_regclass('public.capacity_rate_policy') is null")).toBe('t');
  sql(migration.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'));
  // Both accepted baselines must converge to exactly the same final body.
  expect(checkoutHash()).toBe('c6a8c6955c88446af1174e3dd48d6303');
  sql(`insert into auth.users values('${actor}');insert into public.stores(id,name) values('${sid}','P6 TEST ONLY');
   insert into public.owner_members(store_id,auth_user_id) values('${sid}','${actor}');
   insert into public.dining_tables(id,store_id,label) values('${table}','${sid}','Test');
   insert into public.qr_codes(id,store_id,type,table_id,public_code) values('${qr}','${sid}','table','${table}','${qr}'),('${tq}','${sid}','takeaway',null,'${tq}');
   insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at,pin_generation,pin_key_id,pin_issued_at) values('${session}','${sid}','${table}','${verifier}',clock_timestamp()+interval '24 hours',1,'test',clock_timestamp());
   insert into public.guest_browser_contexts(token_hash) values('${browser}');
   insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at) values('${sid}','${session}','${hash(`${proof}:${session}`)}','${browser}',clock_timestamp()+interval '6 hours');
   insert into public.menu_categories(id,store_id,name) values('${category}','${sid}','Test');
   insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${sid}','${category}','Test coffee',10000);`);
}, 60000);
afterAll(() => sql(`drop database ${database} with(force)`, 'postgres'));

it('fresh apply, atomic rollback/drift guard and invoker-role ACLs', () => {
  expect(sql("select prosecdef,has_function_privilege('anon','public.p4_checkout(jsonb)','execute'),has_function_privilege('authenticated','public.p4_checkout(jsonb)','execute'),has_function_privilege('service_role','public.p4_checkout(jsonb)','execute') from pg_proc where oid='public.p4_checkout(jsonb)'::regprocedure")).toBe('f|f|f|t');
  for (const fn of ['p6_ordering_execute(text,jsonb)', 'p6_availability(public.stores,text)', 'p6_rate_cleanup()']) {
    expect(sql(`select prosecdef,has_function_privilege('anon','public.${fn}','execute'),has_function_privilege('authenticated','public.${fn}','execute'),has_function_privilege('service_role','public.${fn}','execute') from pg_proc where oid='public.${fn}'::regprocedure`)).toBe('f|f|f|t');
  }
  expect(sql("select has_table_privilege('authenticated','public.capacity_rate_policy','select'),has_table_privilege('service_role','public.capacity_rate_policy','update')")).toBe('f|f');
  expect(rpc('p6_ordering_execute', 'get', { ...scope, ownerId: randomUUID() }).error).toBe('FORBIDDEN');
});

it('legacy checkout upgrade restores store ceiling and emits one correlated creation event', () => {
  const cmd = command();
  const pending = checkout(cmd).data;
  const event = sql(`select e.id=o.id and o.payload->>'eventId'=e.id::text from public.order_events e join public.outbox_events o on o.aggregate_id=e.order_id and o.topic=e.event_type where e.order_id='${pending.id}' and e.event_type='order.created'`);
  expect(event).toBe('t');
  sql(`insert into public.security_rate_buckets(key_hash,attempts,resets_at) values('${hash(`takeaway-create-store:${sid}`)}',300,clock_timestamp()+interval '1 minute') on conflict(key_hash) do update set attempts=300,resets_at=excluded.resets_at`);
  expect(checkout().error).toBe('RATE_LIMITED');
  expect(checkout(cmd).data.id).toBe(pending.id);
  sql(`update public.security_rate_buckets set resets_at=clock_timestamp()-interval '1 second' where key_hash in('${hash(`takeaway-create-store:${sid}`)}','${hash(`takeaway-create:${browser}:${sid}`)}')`);
});

it('per-type pause rejects new writes, preserves replay and valid pending intents; master gate remains authoritative', async () => {
  const cmd = command();
  const pending = checkout(cmd).data;
  const before = sql(`select count(*) from public.payment_intents where store_id='${sid}'`);
  expect(patch({ acceptTakeaway: false }).data.availability).toContainEqual({ orderType: 'takeaway', acceptingOrders: false, reason: 'manual_pause' });
  expect(checkout().error).toBe('STORE_NOT_ACCEPTING_ORDERS');
  expect(checkout(cmd).data.id).toBe(pending.id);
  expect(sql(`select count(*) from public.payment_intents where store_id='${sid}'`)).toBe(before);
  const dine = rpc('p3_order_execute', 'create', { ...guest, command: command(qr) });
  expect(dine.data.type).toBe('dine_in');
  expect(patch({ acceptDineIn: false }).error).toBeUndefined();
  expect(rpc('p3_order_execute', 'create', { ...guest, command: command(qr) }).error).toBe('STORE_NOT_ACCEPTING_ORDERS');
  expect(rpc('p5_session_execute', 'owner_bill', { ...scope, sessionId: session }).data.canAcceptMoreOrders).toBe(false);
  // Admission flags never rewrite the existing pending/accepted order.
  expect(sql(`select status from public.orders where id='${pending.id}'`)).toBe('pending_payment');
  expect(sql(`select status from public.orders where id='${dine.data.id}'`)).toBe('accepted');
  expect(patch({ acceptDineIn: true, acceptTakeaway: true, acceptingOrders: false }).error).toBeUndefined();
  expect(checkout().error).toBe('STORE_NOT_ACCEPTING_ORDERS');
  expect(patch({ acceptingOrders: true }).error).toBeUndefined();
});

it('20 concurrent settings retries commit once; stale versions and changed payload conflict', async () => {
  const input = { ...scope, requestId: randomUUID(), expectedVersion: Number(sql(`select version from public.stores where id='${sid}'`)), acceptTakeaway: false };
  const results = await Promise.all(Array.from({ length: 20 }, () => parallelSql(query('p6_ordering_execute', 'patch', input))));
  results.forEach(r => expect(JSON.parse(r).data).toEqual(JSON.parse(results[0]).data));
  expect(sql(`select count(*) from public.operation_requests where request_id='${input.requestId}'`)).toBe('1');
  expect(rpc('p6_ordering_execute', 'patch', { ...input, acceptTakeaway: true }).error).toBe('DUPLICATE_REQUEST_CONFLICT');
  expect(rpc('p6_ordering_execute', 'patch', { ...input, requestId: randomUUID() }).error).toBe('INVALID_STATE_TRANSITION');
  patch({ acceptTakeaway: true });
});

it('pause and checkout serialize on the same store gate, before any intent/order writes', async () => {
  const input = { ...scope, requestId: randomUUID(), expectedVersion: Number(sql(`select version from public.stores where id='${sid}'`)), acceptTakeaway: false };
  const before = sql(`select count(*) from public.payment_intents where store_id='${sid}'`);
  const name = `pause_${randomUUID()}`;
  const closing = parallelSql(`set application_name='${name}';begin;${query('p6_ordering_execute', 'patch', input)};select pg_sleep(0.5);commit;`);
  for (let n = 0; ; n++) {
    if (sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event='PgSleep')`) === 't') break;
    expect(n).toBeLessThan(50);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const cmd = command();
  const result = await parallelSql(`set role service_role;select public.p4_checkout('${json({ ...guest, command: cmd, configuredStoreId: sid, accountNumber: '12345678', channelHash: hash('P6 channel') })}')`);
  await closing;
  expect(JSON.parse(result).error).toBe('STORE_NOT_ACCEPTING_ORDERS');
  expect(sql(`select count(*) from public.payment_intents where store_id='${sid}'`)).toBe(before);
  patch({ acceptTakeaway: true });
});

it('menu validators require current authorization and invalidate on price, availability and owner pause', () => {
  const input = { ...guest, qrCode: tq };
  const first = rpc('p2_menu_execute', 'public', input).data;
  expect(rpc('p2_menu_execute', 'public', { ...input, qrCode: qr, ifNoneMatch: first.etag }).data.notModified).toBeUndefined();
  expect(rpc('p2_menu_execute', 'public', { ...input, ifNoneMatch: first.etag }).data.notModified).toBe(true);
  sql(`update public.menu_items set price_vnd=12000,available=false where id='${item}'`);
  const edited = rpc('p2_menu_execute', 'public', { ...input, ifNoneMatch: first.etag }).data;
  expect(edited.etag).not.toBe(first.etag); expect(edited.items[0]).toMatchObject({ priceVnd: 12000, available: false });
  patch({ acceptTakeaway: false });
  const paused = rpc('p2_menu_execute', 'public', { ...input, ifNoneMatch: edited.etag }).data;
  expect(paused.orderingAvailability.acceptingOrders).toBe(false); expect(paused.notModified).toBeUndefined();
  sql(`update public.qr_codes set active=false where id='${tq}'`);
  expect(rpc('p2_menu_execute', 'public', { ...input, ifNoneMatch: paused.etag }).error).toBe('INVALID_QR');
  sql(`update public.qr_codes set active=true where id='${tq}';update public.menu_items set available=true where id='${item}'`);
  patch({ acceptTakeaway: true });
});

it('50 correct PINs on one table/IP succeed; wrong-device/source counters persist across connections', async () => {
  const ipHash = hash('shared wifi');
  const verify = (browserHash: string, valid = true) => ({ browserHash, grantProof: hash(browserHash), newBrowser: true, ipHash,
    qrCode: qr, sessionId: session, generation: 1, verifier: valid ? verifier : hash('wrong') });
  const attacker = hash('attacker');
  for (let n = 0; n < 5; n++) expect(rpc('p2_pin_execute', 'verify', verify(attacker, false)).error).toBe('INVALID_SESSION_CODE');
  expect(rpc('p2_pin_execute', 'verify', verify(attacker)).error).toBe('RATE_LIMITED');
  const results = await Promise.all(Array.from({ length: 50 }, (_, n) => parallelSql(query('p2_pin_execute', 'verify', verify(hash(`P6 wifi ${n}`))))));
  expect(results.every(r => !JSON.parse(r).error)).toBe(true);
  const wrong = rpc('p2_pin_execute', 'verify', verify(hash('next attacker'), false));
  expect(wrong.error).toBe('INVALID_SESSION_CODE');
  mkdirSync('docs/handoffs/evidence', { recursive: true });
  writeFileSync('docs/handoffs/evidence/P6_C02_CORRECTNESS.json', JSON.stringify({ environment: 'disposable local PostgreSQL; independent service_role connections', correctPinSharedWifi: { clients: 50, successes: results.length }, failedDeviceBlocked: true, provider: 'NOT_USED: DB-only admission/ACL/MVCC tests; signed HTTP callbacks measured separately' }, null, 2) + '\n');
});

it('atomic configurable limiter expires buckets, stays shared, and bounds maintenance', async () => {
  sql("insert into public.capacity_rate_policy values('capacity-test:',3,1)");
  const key = `capacity-test:${randomUUID()}`;
  const results = await Promise.all(Array.from({ length: 10 }, () => parallelSql(`set role service_role;select public.p2_rate('${key}',999)`)));
  expect(results.filter(r => r === '0')).toHaveLength(3); expect(results.filter(r => Number(r) > 0)).toHaveLength(7);
  sql(`update public.security_rate_buckets set resets_at=clock_timestamp()-interval '1 second' where key_hash='${hash(key)}'`);
  expect(sql(`set role service_role;select public.p2_rate('${key}',999)`)).toBe('0');
  sql(`update public.security_rate_buckets set resets_at=clock_timestamp()-interval '2 hours' where key_hash='${hash(key)}'`);
  expect(sql('set role service_role;select public.p6_rate_cleanup()')).toBe('1');
});
