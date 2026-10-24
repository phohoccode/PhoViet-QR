import { execFile, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDineInOrder, getGuestOrder } from "../../../src/server/orders/service";
import { getOwnerSessionBill, getGuestSessionBill, getGuestSessionReceipt, getOwnerSessionReceipt, settleSession } from "../../../src/server/table-sessions/billing";
import { claimNextOrder, markOwnerOrderReady, completeOwnerOrder, getOwnerOrders } from "../../../src/server/orders/owner-service";
import { hashSecret } from "../../../src/server/security/crypto";
import { paymentRpc } from "../../../src/server/payments/database";
import type { OrderDetail } from "../../../docs/contracts/types";
import type { CreateOrderV1Input, SettleSessionInput, TableBillView } from "../../../docs/contracts/types";

// TEST ONLY. Fail closed before any IO against a non-loopback database.
const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:15421") throw Error("Refusing non-local billing tests");
const args = ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"];
const sql = (input: string) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const concurrent = (input: string) => new Promise<string>((resolve, reject) => {
  let output = "";
  const child = execFile("docker", args, { windowsHide: true }, error => error ? reject(Error("Local billing SQL failed")) : resolve(output));
  child.stdout!.on("data", value => { output += value; }); child.stdin!.end(input);
});
const fixtures: ReturnType<typeof fixture>[] = [];
function fixture() {
  const store = randomUUID(), table = randomUUID(), session = randomUUID(), actor = randomUUID(), category = randomUUID(), item = randomUUID(), option = randomUUID(), code = randomUUID();
  const owner = { storeId: store, authUserId: actor }, devices: ReturnType<typeof device>[] = [];
  sql(`insert into auth.users(id) values('${actor}');insert into public.stores(id,name) values('${store}','P5 TEST ONLY');
   insert into public.owner_members(store_id,auth_user_id) values('${store}','${actor}');
   insert into public.dining_tables(id,store_id,label) values('${table}','${store}','Bill table');
   insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session}','${store}','${table}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours');
   insert into public.qr_codes(store_id,type,table_id,public_code) values('${store}','table','${table}','${code}');
   insert into public.menu_categories(id,store_id,name) values('${category}','${store}','Menu');
   insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${store}','${category}','Historical coffee',29000);
   insert into public.menu_item_options(id,store_id,item_id,name,price_delta_vnd) values('${option}','${store}','${item}','Historical milk',3000);`);
  function device() {
    const token = randomBytes(32).toString("base64url");
    const guest = { token, browserHash: hashSecret(token), grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: false };
    sql(`insert into public.guest_browser_contexts(token_hash) values('${guest.browserHash}');
     insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at)
     values('${store}','${session}','${hashSecret(`${guest.grantProof}:${session}`)}','${guest.browserHash}',clock_timestamp()+interval '6 hours');`);
    devices.push(guest); return guest;
  }
  const command = (extra: Partial<CreateOrderV1Input> = {}): CreateOrderV1Input => ({ qrCode: code, clientRequestId: randomUUID(), menuRevision: sql(`select menu_revision from public.stores where id='${store}'`),
    items: [{ menuItemId: item, quantity: 3, optionIds: [option], note: null }], note: null, ...extra });
  const read = () => getOwnerSessionBill(owner, session);
  const count = (name: string) => Number(sql(`select count(*) from public.${name} where store_id='${store}'`));
  const begin = async () => { const b = await read(); return settleSession(owner, session, { action: "begin_checkout", requestId: randomUUID(), expectedVersion: b.session.version, expectedBillVersion: b.billVersion }); };
  const confirm = (b: TableBillView, overrides = {}): SettleSessionInput => ({ action: "confirm_received", requestId: randomUUID(), expectedVersion: b.session.version, expectedBillVersion: b.billVersion, paymentMethod: "cash", receivedConfirmed: true, ...overrides });
  const f = { store, table, session, actor, item, option, owner, code, devices, device, command, read, count, begin, confirm };
  fixtures.push(f); return f;
}
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY || status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
});
afterAll(() => {
  for (const f of fixtures) sql(`begin;set local session_replication_role=replica;
   delete from public.security_rate_buckets where key_hash in(
    select encode(extensions.digest(k,'sha256'),'hex') from unnest(array['owner:${f.actor}:read','owner:${f.actor}:write','takeaway-create-store:${f.store}']::text[]) k
    union all select encode(extensions.digest(k,'sha256'),'hex') from unnest(array['${f.devices.flatMap(d => [`order-create:${d.browserHash}:${f.store}`, `session-bill:${d.browserHash}:${f.session}`, `takeaway-create:${d.browserHash}:${f.store}`]).join("','")}']::text[]) k
    union all select encode(extensions.digest('order-read:'||d.h||':'||o.id,'sha256'),'hex') from public.orders o cross join unnest(array['${f.devices.map(d => d.browserHash).join("','")}']::text[]) d(h) where o.store_id='${f.store}');
   delete from public.outbox_events where aggregate_id in(select id from public.table_sessions where store_id='${f.store}')
    or aggregate_id in(select id from public.orders where store_id='${f.store}') or aggregate_id in(select id from public.payment_intents where store_id='${f.store}');
   delete from public.session_receipt_read_audit where browser_hash in('${f.devices.map(d => d.browserHash).join("','")}');
   delete from public.session_receipt_access where store_id='${f.store}';delete from public.session_receipts where store_id='${f.store}';
   delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest('receipt-read:'||h,'sha256'),'hex') from unnest(array['${f.devices.map(d => d.browserHash).join("','")}']::text[]) d(h));
   delete from public.session_settlement_audit_log where store_id='${f.store}';delete from public.session_settlements where store_id='${f.store}';delete from public.session_checkout_snapshots where store_id='${f.store}';
   delete from public.operation_requests where store_id='${f.store}';delete from public.order_events where store_id='${f.store}';delete from public.order_requests where store_id='${f.store}';
   delete from public.payments where store_id='${f.store}';delete from public.payment_webhook_inbox where event->>'reference' in(select provider_reference from public.payment_intents where store_id='${f.store}');
   delete from public.payment_intents where store_id='${f.store}';delete from public.takeaway_requests where store_id='${f.store}';
   delete from public.order_items where store_id='${f.store}';delete from public.orders where store_id='${f.store}';delete from public.ticket_counters where store_id='${f.store}';
   delete from public.guest_access where store_id='${f.store}';delete from public.session_code_deliveries where session_id='${f.session}';delete from public.table_sessions where store_id='${f.store}';
   delete from public.qr_codes where store_id='${f.store}';delete from public.dining_tables where store_id='${f.store}';delete from public.menu_item_options where store_id='${f.store}';
   delete from public.menu_items where store_id='${f.store}';delete from public.menu_categories where store_id='${f.store}';delete from public.owner_members where store_id='${f.store}';delete from public.stores where id='${f.store}';delete from auth.users where id='${f.actor}';
   delete from public.guest_browser_contexts where token_hash in('${f.devices.map(d => d.browserHash).join("','")}');commit;`);
});

it("three devices create independent orders concurrently in one session and the bill includes all three", async () => {
  const f = fixture(), guests = [f.device(), f.device(), f.device()];
  const orders = await Promise.all(guests.map(guest => createDineInOrder(f.command(), guest)));
  expect(new Set(orders.map(o => o.id)).size).toBe(3);
  expect(orders.map(o => o.ticketNo).sort()).toEqual([1, 2, 3]);
  const bill = await f.read();
  expect(bill.orders.map(o => o.id).sort()).toEqual(orders.map(o => o.id).sort());
  expect(bill.totalVnd).toBe(288000);
});

it("three guests add three immutable tickets; 20 retries share one order; options/quantities and historical prices sum exactly", async () => {
  const f = fixture(), guests = [f.device(), f.device(), f.device()];
  const input = f.command();
  const retries = await Promise.all(Array.from({ length: 20 }, () => createDineInOrder(input, guests[0])));
  expect(new Set(retries.map(o => o.id)).size).toBe(1);
  await expect(createDineInOrder({ ...input, note: "changed" }, guests[0])).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  await createDineInOrder(f.command(), guests[1]);
  sql(`update public.menu_items set name='New name',price_vnd=31000 where id='${f.item}';update public.menu_item_options set name='New option',price_delta_vnd=4000 where id='${f.option}'`);
  await createDineInOrder(f.command(), guests[2]);
  const bill = await f.read();
  expect(bill.orders.map(o => o.ticketNo)).toEqual([1, 2, 3]); expect(bill.totalVnd).toBe(297000);
  expect(bill.orders.map(o => o.lines[0].name)).toEqual(["Historical coffee", "Historical coffee", "New name"]);
  expect(bill.orders[0].lines[0]).toMatchObject({ quantity: 3, unitPriceVnd: 32000, lineTotalVnd: 96000, options: [{ name: "Historical milk", priceDeltaVnd: 3000 }] });
  expect(bill).toMatchObject({ outstandingOrders: 3, canAcceptMoreOrders: true, canSettle: false });
  expect(await getGuestSessionBill(f.code, guests[0])).toEqual(bill);
  expect(f.count("orders")).toBe(3); expect(f.count("order_requests")).toBe(3);
});

it('HF01 two established devices keep exactly one immutable final receipt across reload/reopen; new device is isolated', async () => {
  const f=fixture(), a=f.device(), b=f.device();
  const orders=await Promise.all([createDineInOrder(f.command(),a),createDineInOrder(f.command(),b)]);
  // A cancelled ticket stays visible but contributes no payable value.
  sql(`update public.orders set status='cancelled' where id='${orders[1].id}';update public.orders set status='completed' where id='${orders[0].id}'`);
  const prepared=await f.begin();
  await expect(getGuestSessionReceipt(f.session,a)).rejects.toMatchObject({code:'RECEIPT_NOT_READY'});
  expect((await getGuestSessionBill(f.code,b)).session.status).toBe('checkout_pending');
  const command=f.confirm(prepared.bill,{paymentMethod:'bank_transfer'});
  await Promise.all([settleSession(f.owner,f.session,command),settleSession(f.owner,f.session,command)]);
  const r=await getGuestSessionReceipt(f.session,a);
  expect(r).toMatchObject({kind:'paid_receipt',currency:'VND',receiptVersion:3,paymentMethod:'bank_transfer',totalVnd:96000,
    session:{status:'closed',paymentStatus:'paid'},canAcceptMoreOrders:false,canSettle:false});
  expect(r.settledAt).toBeTruthy(); expect(r.orders).toHaveLength(2);
  expect(r.orders.map(o=>o.ticketNo)).toEqual([1,2]);
  expect(await getGuestSessionReceipt(f.session,{...a})).toEqual(r);
  expect(await getGuestSessionBill(f.code,b,f.session)).toEqual(r);
  expect(await getOwnerSessionReceipt(f.owner,f.session)).toEqual(r);
  sql(`update public.dining_tables set label='Renamed physical table' where id='${f.table}';update public.menu_items set name='Changed menu',price_vnd=50000 where id='${f.item}'`);
  expect(await getGuestSessionReceipt(f.session,b)).toEqual(r);
  sql(`update public.qr_codes set active=false where public_code='${f.code}'`);
  expect(await getGuestSessionBill(f.code,a,f.session)).toEqual(r);
  sql(`update public.qr_codes set active=true where public_code='${f.code}'`);
  expect(()=>sql(`set role service_role;update public.session_receipts set bill='{}' where table_session_id='${f.session}'`)).toThrow();
  expect(()=>sql(`update public.session_receipts set bill='{}' where table_session_id='${f.session}'`)).toThrow();
  await expect(createDineInOrder(f.command(),a)).rejects.toMatchObject({code:'SESSION_EXPIRED'});
  const fresh=randomUUID();
  sql(`insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${fresh}','${f.store}','${f.table}','${'c'.repeat(64)}',clock_timestamp()+interval '24 hours')`);
  const c=f.device(); // fixture's default grant intentionally scopes the OLD session
  sql(`delete from public.guest_access where browser_context_hash='${c.browserHash}';insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at)
   values('${f.store}','${fresh}','${hashSecret(`${c.grantProof}:${fresh}`)}','${c.browserHash}',clock_timestamp()+interval '6 hours')`);
  expect((await getGuestSessionBill(f.code,c)).session.id).toBe(fresh);
  expect(await getGuestSessionBill(f.code,a)).toEqual(r);
  await expect(getGuestSessionReceipt(f.session,c)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  await expect(getGuestSessionBill(f.code,a,fresh)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  const foreign=fixture();
  await expect(getGuestSessionBill(foreign.code,a,f.session)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  await expect(getOwnerSessionReceipt(foreign.owner,f.session)).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
  expect(f.count('session_receipts')).toBe(1); expect(f.count('session_settlements')).toBe(1);
  expect(sql(`select count(*) from public.outbox_events where aggregate_id='${f.session}' and topic='table_session.receipt_ready'`)).toBe('1');
  const event=JSON.parse(sql(`select payload from public.outbox_events where aggregate_id='${f.session}' and topic='table_session.receipt_ready'`));
  expect(event).toMatchObject({receiptVersion:r.receiptVersion,receiptId:r.receiptId,aggregateId:f.session});
  expect(Object.keys(event).sort()).toEqual(['aggregateId','eventId','receiptId','receiptVersion','type','version']);
});

it('HF01 expired/revoked/forged capabilities fail closed and revoked/expired pre-settlement guests never gain receipt access',async()=>{
  const f=fixture(), a=f.device(), b=f.device(), expired=f.device(), revoked=f.device();
  sql(`update public.guest_access set revoked_at=clock_timestamp() where browser_context_hash='${revoked.browserHash}';
   update public.guest_access set expires_at=clock_timestamp()-interval '1 minute' where browser_context_hash='${expired.browserHash}'`);
  const prepared=await f.begin();await settleSession(f.owner,f.session,f.confirm(prepared.bill));
  await expect(getGuestSessionReceipt(f.session,expired)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  await expect(getGuestSessionReceipt(f.session,revoked)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  await expect(getGuestSessionReceipt(f.session,{...a,grantProof:'d'.repeat(64)})).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  await expect(getGuestSessionReceipt(randomUUID(),a)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  sql(`update public.session_receipt_access set revoked_at=clock_timestamp() where browser_context_hash='${a.browserHash}';
   update public.session_receipt_access set expires_at=clock_timestamp()-interval '1 second' where browser_context_hash='${b.browserHash}'`);
  await expect(getGuestSessionReceipt(f.session,a)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  await expect(getGuestSessionReceipt(f.session,b)).rejects.toMatchObject({code:'RECEIPT_EXPIRED'});
  await expect(getGuestSessionBill(f.code,b)).rejects.toMatchObject({code:'RECEIPT_EXPIRED'});
  sql(`update public.guest_browser_contexts set expires_at=clock_timestamp()-interval '1 second' where token_hash='${b.browserHash}'`);
  await expect(getGuestSessionReceipt(f.session,b)).rejects.toMatchObject({code:'UNAUTHORIZED'});
  expect(sql(`select count(*) from public.session_receipt_read_audit where requested_session_id='${f.session}' and outcome='denied'`)).toBe('4');
});

it('HF01 no successful payment means no receipt; pending/cancel preserve ordering policy and read rate limits cover guessed IDs',async()=>{
  const f=fixture(),a=f.device();const prepared=await f.begin();
  await expect(getGuestSessionReceipt(f.session,a)).rejects.toMatchObject({code:'RECEIPT_NOT_READY'});
  await expect(createDineInOrder(f.command(),a)).rejects.toMatchObject({code:'SESSION_CHECKOUT_PENDING'});
  await settleSession(f.owner,f.session,{action:'cancel_checkout',requestId:randomUUID(),expectedVersion:prepared.bill.session.version});
  await createDineInOrder(f.command(),a);
  expect(f.count('session_receipts')).toBe(0);
  await expect(getGuestSessionReceipt(f.session,a)).rejects.toMatchObject({code:'RECEIPT_NOT_READY'});
  sql(`insert into public.security_rate_buckets(key_hash,attempts,resets_at) values('${hashSecret(`receipt-read:${a.browserHash}`)}',60,clock_timestamp()+interval '1 minute')
   on conflict(key_hash) do update set attempts=60,resets_at=excluded.resets_at`);
  await expect(getGuestSessionReceipt(randomUUID(),a)).rejects.toMatchObject({code:'RATE_LIMITED',details:{retryAfterSeconds:expect.any(Number)}});
  for(const relation of ['session_receipts','session_receipt_access','session_receipt_read_audit','session_receipt_policy']) {
    expect(()=>sql(`set role anon;select * from public.${relation}`)).toThrow();
    expect(()=>sql(`set role authenticated;select * from public.${relation}`)).toThrow();
  }
});

it('HF01 a concurrent explicit revoke wins before capture; settlement lock timeout rolls back and exact retry safely succeeds',async()=>{
  const f=fixture(),a=f.device();const b=(await f.begin()).bill;
  const name=`receipt_revoke_${randomUUID().replaceAll('-','')}`;
  const revoking=concurrent(`set application_name='${name}';begin;update public.guest_access set revoked_at=clock_timestamp() where scope_id='${f.session}';select pg_sleep(0.7);commit;`);
  for(let n=0;;n++) {
    if(sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`)==='1')break;
    if(n>50)throw Error('Revoke fixture did not lock');await new Promise(r=>setTimeout(r,20));
  }
  await settleSession(f.owner,f.session,f.confirm(b));await revoking;
  expect(f.count('session_receipts')).toBe(1);expect(f.count('session_receipt_access')).toBe(0);
  await expect(getGuestSessionReceipt(f.session,a)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});

  const timeout=fixture(),guest=timeout.device(),prepared=(await timeout.begin()).bill,command=timeout.confirm(prepared);
  const lockName=`receipt_timeout_${randomUUID().replaceAll('-','')}`;
  const locking=concurrent(`set application_name='${lockName}';begin;select 1 from public.table_sessions where id='${timeout.session}' for update;select pg_sleep(4.2);commit;`);
  for(let n=0;;n++) {
    if(sql(`select count(*) from pg_stat_activity where application_name='${lockName}' and wait_event='PgSleep'`)==='1')break;
    if(n>50)throw Error('Timeout fixture did not lock');await new Promise(r=>setTimeout(r,20));
  }
  await expect(settleSession(timeout.owner,timeout.session,command)).rejects.toMatchObject({code:'INTERNAL_ERROR'});
  await locking;
  expect(timeout.count('session_settlements')).toBe(0);expect(timeout.count('session_receipts')).toBe(0);expect(timeout.count('session_receipt_access')).toBe(0);
  expect(sql(`select revoked_at is null from public.guest_access where scope_id='${timeout.session}'`)).toBe('t');
  await settleSession(timeout.owner,timeout.session,command);
  expect((await getGuestSessionReceipt(timeout.session,guest)).session.paymentStatus).toBe('paid');
});

it("guest scope requires the correct capability/proof; revoked and expired grants cannot read or create", async () => {
  const a = fixture(), b = fixture(), guest = a.device();
  await createDineInOrder(a.command(), guest);
  await expect(getGuestSessionBill(b.code, guest)).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
  await expect(getGuestSessionBill(a.code, { ...guest, grantProof: "b".repeat(64) })).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
  sql(`update public.guest_access set revoked_at=clock_timestamp() where scope_id='${a.session}'`);
  await expect(getGuestSessionBill(a.code, guest)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  await expect(createDineInOrder(a.command(), guest)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  const other = a.device(); sql(`update public.guest_browser_contexts set expires_at=clock_timestamp()-interval '1 second' where token_hash='${other.browserHash}'`);
  await expect(getGuestSessionBill(a.code, other)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("checkout blocks add-ons and settlement while accepted/preparing/ready; fulfillment keeps financial revision; cancel restores admission", async () => {
  const f = fixture(), guest = f.device(), o = await createDineInOrder(f.command(), guest), first = await f.begin();
  expect(first.bill).toMatchObject({ session: { status: "checkout_pending" }, outstandingOrders: 1, canAcceptMoreOrders: false, canSettle: false });
  await expect(createDineInOrder(f.command(), guest)).rejects.toMatchObject({ code: "SESSION_CHECKOUT_PENDING" });
  await expect(settleSession(f.owner, f.session, f.confirm(first.bill))).rejects.toMatchObject({ code: "SESSION_ORDERS_OUTSTANDING" });
  const claimed = await claimNextOrder(f.owner, { requestId: randomUUID() }); expect(claimed?.id).toBe(o.id);
  await expect(settleSession(f.owner, f.session, f.confirm(await f.read()))).rejects.toMatchObject({ code: "SESSION_ORDERS_OUTSTANDING" });
  const ready = await markOwnerOrderReady(f.owner, o.id, { requestId: randomUUID(), expectedVersion: claimed!.version });
  await expect(settleSession(f.owner, f.session, f.confirm(await f.read()))).rejects.toMatchObject({ code: "SESSION_ORDERS_OUTSTANDING" });
  expect((await f.read()).billVersion).toBe(first.bill.billVersion);
  await completeOwnerOrder(f.owner, o.id, { requestId: randomUUID(), expectedVersion: ready.version, type: "dine_in" });
  expect((await f.read()).canSettle).toBe(true);
  const cancelled = await settleSession(f.owner, f.session, { action: "cancel_checkout", requestId: randomUUID(), expectedVersion: first.bill.session.version });
  expect(cancelled.bill.session.status).toBe("open"); await createDineInOrder(f.command(), guest);
  expect((await f.read()).orders).toHaveLength(2); expect(f.count("session_checkout_snapshots")).toBe(1);
});

it("two owner tabs beginning checkout concurrently produce one frozen snapshot and one stale-state result", async () => {
  const f = fixture(), bill = await f.read();
  const inputs = [0, 1].map(() => ({ action: "begin_checkout" as const, requestId: randomUUID(), expectedVersion: bill.session.version, expectedBillVersion: bill.billVersion }));
  const results = await Promise.allSettled(inputs.map(input => settleSession(f.owner, f.session, input)));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "INVALID_STATE_TRANSITION" } });
  expect(f.count("session_checkout_snapshots")).toBe(1);
  expect((await f.read()).session.status).toBe("checkout_pending");
});

it("stale financial/session versions, acknowledgement, payment method and client totals are rejected without a ledger", async () => {
  const f = fixture(), guest = f.device(), stale = await f.read(); await createDineInOrder(f.command(), guest);
  await expect(settleSession(f.owner, f.session, { action: "begin_checkout", requestId: randomUUID(), expectedVersion: stale.session.version, expectedBillVersion: stale.billVersion })).rejects.toMatchObject({ code: "BILL_CHANGED" });
  const prepared = await f.begin(), input = f.confirm(prepared.bill);
  for (const changes of [{ receivedConfirmed: false }, { paymentMethod: "card" }, { totalVnd: 1 }, { paidAmount: 1 }, { discount: 1 }, { expectedBillVersion: "bad" }]) {
    await expect(settleSession(f.owner, f.session, { ...input, ...changes } as SettleSessionInput)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  }
  await expect(settleSession(f.owner, f.session, { ...input, expectedVersion: 1 })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  expect(f.count("session_settlements")).toBe(0);
});

it("20 simultaneous confirmations plus a lost response retry produce one settlement/close and paid history; a second key cannot reopen", async () => {
  const f = fixture(), guest = f.device(), order = await createDineInOrder(f.command(), guest);
  sql(`update public.orders set status='completed' where id='${order.id}'`);
  const prepared = await f.begin(), input = f.confirm(prepared.bill, { paymentMethod: "bank_transfer" });
  const results = await Promise.all(Array.from({ length: 20 }, () => settleSession(f.owner, f.session, input)));
  for (const r of results) expect(r).toEqual(results[0]);
  expect(await settleSession(f.owner, f.session, input)).toEqual(results[0]);
  expect(results[0]).toMatchObject({ bill: { session: { status: "closed", paymentStatus: "paid", version: 3 }, canSettle: false, outstandingOrders: 0 }, settlement: { totalVnd: 96000, paymentMethod: "bank_transfer" } });
  const history = await getOwnerOrders(f.owner, { view: "history", orderId: order.id });
  expect(history.detail).toMatchObject({ paymentStatus: "paid", payment: { status: "paid" }, ticketNo: order.ticketNo, status: "completed", version: 3 });
  expect(f.count("session_settlements")).toBe(1); expect(f.count("session_settlement_audit_log")).toBe(2);
  expect(sql(`select count(*) from public.outbox_events where aggregate_id='${f.session}' and topic='table_session.closed'`)).toBe("1");
  expect(sql(`select revoked_at is not null from public.guest_access where scope_id='${f.session}'`)).toBe("t");
  await expect(settleSession(f.owner, f.session, { ...input, paymentMethod: "cash" })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  await expect(settleSession(f.owner, f.session, f.confirm(prepared.bill))).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  await expect(settleSession(f.owner, f.session, { action: "cancel_checkout", requestId: randomUUID(), expectedVersion: 3 })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  const receipt = await getGuestSessionBill(f.code, guest);
  expect(receipt).toMatchObject({kind:'paid_receipt',totalVnd:96000,session:{status:'closed',paymentStatus:'paid'}});
  expect(f.count('session_receipts')).toBe(1);
  await expect(getGuestOrder(order.id, guest)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  // The fixed QR now locates a fresh session, but the old capability cannot enter it.
  const fresh = randomUUID(); sql(`insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${fresh}','${f.store}','${f.table}','${"b".repeat(64)}',clock_timestamp()+interval '24 hours')`);
  expect(await getGuestSessionBill(f.code, guest)).toEqual(receipt);
  await expect(getGuestSessionBill(f.code, guest, fresh)).rejects.toMatchObject({code:'RECEIPT_ACCESS_DENIED'});
  await expect(createDineInOrder(f.command(), guest)).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
});

it("two different request IDs race: one closes, the other gets an explicit stale-state error; empty zero bill can settle", async () => {
  const f = fixture(), b = (await f.begin()).bill;
  const results = await Promise.allSettled([settleSession(f.owner, f.session, f.confirm(b)), settleSession(f.owner, f.session, f.confirm(b))]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "INVALID_STATE_TRANSITION" } });
  expect(f.count("session_settlements")).toBe(1); expect((await f.read()).totalVnd).toBe(0);
});

it("session settlement races verified takeaway admission and a new dine-in ticket without mixing their ledgers", async () => {
  const f = fixture(), guest = f.device(), order = await createDineInOrder(f.command(), guest);
  const takeawayCode = randomUUID();
  sql(`update public.orders set status='completed' where id='${order.id}';
    insert into public.qr_codes(store_id,type,public_code) values('${f.store}','takeaway','${takeawayCode}');`);
  const pending = await paymentRpc<OrderDetail>("p4_checkout", { input: {
    command: f.command({ qrCode: takeawayCode }), browserHash: guest.browserHash, grantProof: guest.grantProof,
    configuredStoreId: f.store, accountNumber: "12345678", channelHash: "a".repeat(64),
  } });
  expect(pending.ticketNo).toBeNull();
  const ref = sql(`select provider_reference from public.payment_intents where order_id='${pending.id}'`);
  // This invokes the post-signature DB seam with normalized synthetic evidence.
  // Signature and pickup recovery remain covered by payments.test.ts; no provider IO.
  const inbox = await paymentRpc<{ id: string }>("p4_ingest", { input: {
    channelHash: "a".repeat(64), evidence: { testOnly: true }, event: {
      provider: "payos", eventId: randomUUID(), transactionId: randomUUID(), reference: ref,
      amountVnd: pending.totalVnd, currency: "VND", accountNumber: "12345678",
      paymentLinkId: randomUUID().replaceAll("-", ""), paid: true, occurredAt: new Date().toISOString(),
    },
  } });
  const prepared = await f.begin();
  // A second table in the SAME store participates in the shared FIFO.
  const table2 = randomUUID(), session2 = randomUUID(), code2 = randomUUID();
  sql(`insert into public.dining_tables(id,store_id,label) values('${table2}','${f.store}','Concurrent table');
    insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session2}','${f.store}','${table2}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours');
    insert into public.qr_codes(store_id,type,table_id,public_code) values('${f.store}','table','${table2}','${code2}');
    insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at)
    values('${f.store}','${session2}','${hashSecret(`${guest.grantProof}:${session2}`)}','${guest.browserHash}',clock_timestamp()+interval '6 hours');`);
  const results = await Promise.all([
    settleSession(f.owner, f.session, f.confirm(prepared.bill)),
    paymentRpc<{ outcome: string }>("p4_process", { event_uuid: inbox.id }),
    createDineInOrder(f.command({ qrCode: code2 }), guest),
  ]);
  expect(results[1].outcome).toBe("accepted");
  expect(results[0].bill.session).toMatchObject({ status: "closed", paymentStatus: "paid" });
  expect(f.count("session_settlements")).toBe(1); expect(f.count("payments")).toBe(1);
  expect([Number(sql(`select ticket_no from public.orders where id='${pending.id}'`)), results[2].ticketNo].sort()).toEqual([2, 3]);
  expect(sql(`select count(distinct ticket_no)=count(*) from public.orders where store_id='${f.store}'`)).toBe("t");
  expect((await f.read()).totalVnd).toBe(order.totalVnd);
});

it("cancel checkout racing settlement leaves either a reopened unpaid session or one closed settlement", async () => {
  const f = fixture(), guest = f.device(), order = await createDineInOrder(f.command(), guest);
  sql(`update public.orders set status='completed' where id='${order.id}'`);
  const prepared = await f.begin();
  const cancel = { action: "cancel_checkout" as const, requestId: randomUUID(), expectedVersion: prepared.bill.session.version };
  const confirm = f.confirm(prepared.bill);
  const results = await Promise.allSettled([settleSession(f.owner, f.session, cancel), settleSession(f.owner, f.session, confirm)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  const current = await f.read();
  if (current.session.status === "closed") {
    expect(current.session.paymentStatus).toBe("paid");
    expect(f.count("session_settlements")).toBe(1);
  } else {
    expect(current.session.status).toBe("open");
    expect(current.session.paymentStatus).toBe("unpaid");
    expect(f.count("session_settlements")).toBe(0);
  }
});

it("owner identity/store substitution cannot read or settle another store; browser roles cannot invoke RPC", async () => {
  const a = fixture(), b = fixture();
  await expect(getOwnerSessionBill(b.owner, a.session)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  await expect(getOwnerSessionBill({ ...a.owner, authUserId: b.actor }, a.session)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(settleSession(b.owner, a.session, { action: "cancel_checkout", requestId: randomUUID(), expectedVersion: 1 })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  expect(() => sql(`set role authenticated;select public.p5_session_execute('owner_bill','{}')`)).toThrow();
  expect(() => sql(`set role anon;select * from public.session_settlements`)).toThrow();
});

it("integer VND stays exact at the safe wire boundary; a session overflow rolls its order and ticket back", async () => {
  const f = fixture(), guest = f.device();
  sql(`update public.menu_items set price_vnd=9007199254740991 where id='${f.item}'`);
  const command = () => f.command({ items: [{ menuItemId: f.item, quantity: 1, optionIds: [], note: null }] });
  await createDineInOrder(command(), guest);
  expect((await f.read()).totalVnd).toBe(Number.MAX_SAFE_INTEGER);
  await expect(createDineInOrder(command(), guest)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  expect(f.count("orders")).toBe(1); expect(sql(`select last_ticket from public.ticket_counters where store_id='${f.store}'`)).toBe("1");
  expect((await f.read()).totalVnd).toBe(Number.MAX_SAFE_INTEGER);
});

it("cancelled order snapshots stay visible and excluded; changed checkout financial content requires new prepare", async () => {
  const f = fixture(), guest = f.device(), order = await createDineInOrder(f.command(), guest), prepared = await f.begin();
  // No public cancel API exists. This privileged fixture models a future audited cancellation writer.
  sql(`update public.orders set status='cancelled' where id='${order.id}'`);
  const changed = await f.read(); expect(changed.totalVnd).toBe(0); expect(changed.orders[0].totalVnd).toBe(96000); expect(changed.canSettle).toBe(false);
  await expect(settleSession(f.owner, f.session, f.confirm(prepared.bill))).rejects.toMatchObject({ code: "BILL_CHANGED" });
  await expect(settleSession(f.owner, f.session, f.confirm(changed))).rejects.toMatchObject({ code: "BILL_CHANGED" });
  await settleSession(f.owner, f.session, { action: "cancel_checkout", requestId: randomUUID(), expectedVersion: changed.session.version });
  const newBill = (await f.begin()).bill; expect(newBill.canSettle).toBe(true);
  expect((await settleSession(f.owner, f.session, f.confirm(newBill))).settlement?.totalVnd).toBe(0);
});

it("create versus checkout uses the same admission lock across 50 concurrent attempts: every accepted ticket is in the frozen bill", async () => {
  const f = fixture(), guests = Array.from({ length: 50 }, () => f.device());
  // Hold the admission gate to queue 50 independent DB transactions concurrently.
  const name = `p5_${randomUUID()}`;
  const gate = concurrent(`set application_name='${name}';begin;select 1 from public.stores where id='${f.store}' for no key update;select pg_sleep(0.8);commit;`);
  for (let n = 0; n < 50; n++) {
    if (sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`) === "1") break;
    await new Promise(r => setTimeout(r, 20));
  }
  const initial = await f.read();
  const creations = guests.map(g => createDineInOrder(f.command(), g));
  // Financial CAS may reject begin if an order commits first; refetch and retry intentionally.
  const checkout = settleSession(f.owner, f.session, { action: "begin_checkout", requestId: randomUUID(), expectedVersion: initial.session.version, expectedBillVersion: initial.billVersion }).catch(e => e);
  const results = await Promise.allSettled(creations); await gate;
  const attempt = await checkout;
  const prepared = "code" in attempt ? await f.begin() : attempt;
  const committed = results.filter(r => r.status === "fulfilled").map(r => r.value.id).sort();
  expect(prepared.bill.orders.map(o => o.id).sort()).toEqual(committed);
  for (const r of results.filter(r => r.status === "rejected")) expect(r.reason).toMatchObject({ code: "SESSION_CHECKOUT_PENDING" });
  const final = await f.read(); expect(final.orders.map(o => o.id).sort()).toEqual(committed);
  expect(final.totalVnd).toBe(committed.length * 96000);
  expect(f.count("orders")).toBe(committed.length);
});

async function waitSleeping(name: string) {
  for (let n = 0; n < 80; n++) {
    if (sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`) === "1") return;
    await new Promise(r => setTimeout(r, 20));
  }
  throw Error("Lock fixture did not reach the held transaction");
}
it("checkout commits first: an order queued behind its uncommitted session lock is rejected and consumes no ticket", async () => {
  const f = fixture(), guest = f.device(), bill = await f.read(), name = `p5_lock_${randomUUID()}`;
  const input = { storeId: f.store, ownerId: f.actor, sessionId: f.session, action: "begin_checkout", requestId: randomUUID(), expectedVersion: bill.session.version, expectedBillVersion: bill.billVersion };
  const checkout = concurrent(`set application_name='${name}';set role service_role;begin;select public.p5_session_execute('begin_checkout','${JSON.stringify(input)}');select pg_sleep(0.7);commit;`);
  await waitSleeping(name);
  const order = createDineInOrder(f.command(), guest);
  await expect(order).rejects.toMatchObject({ code: "SESSION_CHECKOUT_PENDING" }); await checkout;
  expect(f.count("orders")).toBe(0); expect(f.count("ticket_counters")).toBe(0); expect((await f.read()).totalVnd).toBe(0);
});
it("creation commits first: checkout detects the changed total after waiting; a fresh explicit prepare includes the committed ticket", async () => {
  const f = fixture(), guest = f.device(), bill = await f.read(), name = `p5_create_${randomUUID()}`;
  const input = { command: f.command(), browserHash: guest.browserHash, grantProof: guest.grantProof };
  const creation = concurrent(`set application_name='${name}';set role service_role;begin;select public.p3_order_execute('create','${JSON.stringify(input)}');select pg_sleep(0.7);commit;`);
  await waitSleeping(name);
  const prepare = settleSession(f.owner, f.session, { action: "begin_checkout", requestId: randomUUID(), expectedVersion: bill.session.version, expectedBillVersion: bill.billVersion });
  await expect(prepare).rejects.toMatchObject({ code: "BILL_CHANGED" });
  const order = JSON.parse(await creation).data;
  const prepared = await f.begin(); expect(prepared.bill.orders.map(o => o.id)).toEqual([order.id]); expect(prepared.bill.totalVnd).toBe(96000);
});

it("outbox persistence failure rolls settlement/close/revoke back; retry same key then read works without a realtime publisher", async () => {
  const f = fixture(), guest = f.device(), o = await createDineInOrder(f.command(), guest);
  sql(`update public.orders set status='completed' where id='${o.id}'`);
  const prepared = await f.begin(), input = f.confirm(prepared.bill), name = `p5_fault_${randomUUID().replaceAll("-", "")}`;
  sql(`create function public.${name}() returns trigger language plpgsql as $$begin if new.aggregate_id='${f.session}' and new.topic='table_session.closed' then raise exception 'TEST ONLY';end if;return new;end;$$;
   create trigger ${name} before insert on public.outbox_events for each row execute function public.${name}();`);
  try {
    await expect(settleSession(f.owner, f.session, input)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(f.count("session_settlements")).toBe(0); expect((await f.read()).session.status).toBe("checkout_pending");
    expect(f.count('session_receipts')).toBe(0); expect(f.count('session_receipt_access')).toBe(0);
    expect(sql(`select revoked_at is null from public.guest_access where scope_id='${f.session}'`)).toBe("t");
  } finally { sql(`drop trigger ${name} on public.outbox_events;drop function public.${name}();`); }
  const settled = await settleSession(f.owner, f.session, input);
  expect((await f.read()).session.status).toBe("closed");
  expect((await f.read()).settledAt).toBe(settled.settlement?.settledAt);
});
