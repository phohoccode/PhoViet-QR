import { execFile, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createDineInOrder, getGuestOrder } from "../../../src/server/orders/service";
import { hashSecret } from "../../../src/server/security/crypto";
import type { GuestRequestContext } from "../../../src/server/security/request-context";
import type { CreateOrderV1Input } from "../../../docs/contracts/types";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:15421") throw Error("Refusing non-local order tests");
const psqlArgs = ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"];
const sql = (input: string) => execFileSync("docker", psqlArgs, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const concurrentSql = (input: string) => new Promise<string>((resolve, reject) => {
  let output = "";
  const child = execFile("docker", psqlArgs, { windowsHide: true }, error => error ? reject(Error("Isolated order SQL failed")) : resolve(output));
  child.stdout!.on("data", value => { output += value; }); child.stdin!.end(input);
});
const rpcClient = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stores = [randomUUID(), randomUUID()], tables = [randomUUID(), randomUUID(), randomUUID()], sessions = tables.map(() => randomUUID());
const codes = tables.map(() => randomUUID()), counterCode = randomUUID();
const categories = stores.map(() => randomUUID()), items = [randomUUID(), randomUUID(), randomUUID()], option = randomUUID();
const browsers: GuestRequestContext[] = [];
function device(session = sessions[0], store = stores[0]) {
  const token = randomBytes(32).toString("base64url");
  const context = { token, browserHash: hashSecret(token), grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: false };
  browsers.push(context);
  sql(`insert into public.guest_browser_contexts(token_hash) values('${context.browserHash}');
   insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at)
   values('${store}','${session}','${hashSecret(`${context.grantProof}:${session}`)}','${context.browserHash}',clock_timestamp()+interval '6 hours');`);
  return context;
}
let guest: GuestRequestContext, otherTable: GuestRequestContext, secondStore: GuestRequestContext;
const revision = (store = stores[0]) => sql(`select menu_revision from public.stores where id='${store}'`);
const command = (extra: Partial<CreateOrderV1Input> = {}): CreateOrderV1Input => ({ qrCode: codes[0], clientRequestId: randomUUID(), menuRevision: revision(), items: [
  { menuItemId: items[0], quantity: 2, optionIds: [option], note: "Ít đá" },
  { menuItemId: items[1], quantity: 1, optionIds: [], note: null },
], note: null, ...extra });
const orderCount = () => Number(sql(`select count(*) from public.orders where store_id='${stores[0]}'`));
const counterTotal = () => sql(`select coalesce(sum(last_ticket),0) from public.ticket_counters where store_id='${stores[0]}'`);

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY || status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  sql(`insert into public.stores(id,name) values('${stores[0]}','P3 isolated A'),('${stores[1]}','P3 isolated B');
   insert into public.dining_tables(id,store_id,label) values('${tables[0]}','${stores[0]}','Order table A'),('${tables[1]}','${stores[0]}','Order table B'),('${tables[2]}','${stores[1]}','Other store');
   insert into public.qr_codes(store_id,type,table_id,public_code) values('${stores[0]}','table','${tables[0]}','${codes[0]}'),('${stores[0]}','table','${tables[1]}','${codes[1]}'),('${stores[1]}','table','${tables[2]}','${codes[2]}'),('${stores[0]}','takeaway',null,'${counterCode}');
   insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${sessions[0]}','${stores[0]}','${tables[0]}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours'),('${sessions[1]}','${stores[0]}','${tables[1]}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours'),('${sessions[2]}','${stores[1]}','${tables[2]}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours');
   insert into public.menu_categories(id,store_id,name) values('${categories[0]}','${stores[0]}','Menu'),('${categories[1]}','${stores[1]}','Other menu');
   insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${items[0]}','${stores[0]}','${categories[0]}','Coffee',29000),('${items[1]}','${stores[0]}','${categories[0]}','Tea',32000),('${items[2]}','${stores[1]}','${categories[1]}','Other coffee',100);
   insert into public.menu_item_options(id,store_id,item_id,name,price_delta_vnd) values('${option}','${stores[0]}','${items[0]}','Milk',3000);`);
  guest = device(); otherTable = device(sessions[1]); secondStore = device(sessions[2], stores[1]);
});
afterAll(() => {
  const orderIds: string[] = JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.orders where store_id in('${stores.join("','")}')`));
  const rateKeys = browsers.flatMap(b => [...stores.map(s => `order-create:${b.browserHash}:${s}`), ...orderIds.map(id => `order-read:${b.browserHash}:${id}`)]);
  // Only UUID-scoped fixtures on loopback. Never disable Production history guards.
  sql(`begin;set local session_replication_role=replica;
   delete from public.outbox_events where aggregate_id in(select id from public.orders where store_id in('${stores.join("','")}'));
   delete from public.order_events where store_id in('${stores.join("','")}');delete from public.order_requests where store_id in('${stores.join("','")}');
   delete from public.order_items where store_id in('${stores.join("','")}');delete from public.orders where store_id in('${stores.join("','")}');delete from public.ticket_counters where store_id in('${stores.join("','")}');
   delete from public.guest_access where store_id in('${stores.join("','")}');delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
   delete from public.table_sessions where store_id in('${stores.join("','")}');delete from public.qr_codes where store_id in('${stores.join("','")}');delete from public.dining_tables where store_id in('${stores.join("','")}');
   delete from public.menu_item_options where store_id in('${stores.join("','")}');delete from public.menu_items where store_id in('${stores.join("','")}');delete from public.menu_categories where store_id in('${stores.join("','")}');
   delete from public.stores where id in('${stores.join("','")}');
   delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${rateKeys.map(k => `'${k}'`).join(",")}]::text[]) k);
   delete from public.guest_browser_contexts where token_hash in('${browsers.map(b => b.browserHash).join("','")}');commit;`);
});

it("persists accepted order, two immutable item snapshots, options, integer totals, audit and outbox atomically", async () => {
  const input = command(), before = orderCount();
  const order = await createDineInOrder(input, guest);
  expect(order).toMatchObject({ type: "dine_in", status: "accepted", ticketNo: 1, totalVnd: 96000, itemCount: 3, tableSessionId: sessions[0], paymentStatus: "unpaid", fulfillmentStatus: "awaiting_preparation", version: 1 });
  expect(order.lines.map(l => l.lineTotalVnd)).toEqual([64000, 32000]);
  expect(order.lines[0].options).toEqual([{ menuOptionId: option, name: "Milk", priceDeltaVnd: 3000 }]);
  expect(order.payment).toMatchObject({ kind: "table_session", status: "unpaid", amountVnd: 96000, reconciliationRequired: false });
  expect(order.serviceDate).toBe(sql(`select public.p3_service_date('${order.acceptedAt}','Asia/Ho_Chi_Minh')`));
  expect(Number.isSafeInteger(order.totalVnd)).toBe(true); expect(orderCount()).toBe(before + 1);
  expect(sql(`select count(*) from public.order_events where order_id='${order.id}'`)).toBe("2");
  expect(sql(`select count(*) from public.outbox_events where aggregate_id='${order.id}' and id=(payload->>'eventId')::uuid and published_at is null and not(payload ? 'note')`)).toBe("2");
  expect(await getGuestOrder(order.id, guest)).toEqual(order);
  expect(await getGuestOrder(order.id, guest, true)).toEqual({ order, pickup: null });
});
it("twenty concurrent same-key creates and lost-response retries return one order/ticket and identical snapshot", async () => {
  const input = command(), before = orderCount(), counter = Number(counterTotal());
  const results = await Promise.all(Array.from({ length: 20 }, () => createDineInOrder(input, guest)));
  expect(new Set(results.map(o => o.id)).size).toBe(1); results.forEach(o => expect(o).toEqual(results[0]));
  expect(orderCount()).toBe(before + 1); expect(Number(counterTotal())).toBe(counter + 1);
  // Simulate response loss: committed result ignored, caller retries immutable command.
  expect(await createDineInOrder(JSON.parse(JSON.stringify(input)), guest)).toEqual(results[0]);
});
it("binds idempotency to browser and normalized payload; replay precedes menu/store/checkout write guards", async () => {
  const context = device(), input = command(), order = await createDineInOrder(input, context), before = orderCount();
  await expect(createDineInOrder({ ...input, note: "changed" }, context)).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  await expect(createDineInOrder(input, device())).rejects.toMatchObject({ code: "FORBIDDEN" });
  sql(`update public.stores set accepting_orders=false where id='${stores[0]}';update public.table_sessions set status='checkout_pending' where id='${sessions[0]}';update public.menu_items set price_vnd=30000,name='Changed coffee' where id='${items[0]}';update public.menu_item_options set name='Changed milk',price_delta_vnd=4000 where id='${option}'`);
  try {
    expect(await createDineInOrder(input, context)).toEqual(order);
    expect(await getGuestOrder(order.id, context)).toEqual(order); // Today's names/options/prices differ.
  }
  finally { sql(`update public.stores set accepting_orders=true where id='${stores[0]}';update public.table_sessions set status='open' where id='${sessions[0]}';update public.menu_items set price_vnd=29000,name='Coffee' where id='${items[0]}';update public.menu_item_options set name='Milk',price_delta_vnd=3000 where id='${option}'`); }
  expect((await getGuestOrder(order.id, context)).lines[0]).toMatchObject({ name: "Coffee", baseUnitPriceVnd: 29000 }); expect(orderCount()).toBe(before);
});
it("replays the original command snapshot after a later status/version change; tracking stays current", async () => {
  const context = device(), input = command(), order = await createDineInOrder(input, context), count = counterTotal();
  // Only fixture SQL simulates the future owner transition. No owner endpoint is introduced.
  sql(`update public.orders set status='preparing' where id='${order.id}'`);
  expect(await createDineInOrder(input, context)).toEqual(order);
  expect(await getGuestOrder(order.id, context)).toMatchObject({ id: order.id, status: "preparing", fulfillmentStatus: "preparing", version: 2 });
  expect(counterTotal()).toBe(count);
});
it("rejects unverified/cross-table/cross-store guests, invalid or inactive QR and unsupported takeaway without writes", async () => {
  const token = randomBytes(32).toString("base64url"), empty = { token, browserHash: hashSecret(token), grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: false };
  browsers.push(empty); sql(`insert into public.guest_browser_contexts(token_hash) values('${empty.browserHash}')`);
  const before = orderCount(), count = counterTotal();
  for (const context of [empty, otherTable, secondStore]) await expect(createDineInOrder(command(), context)).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
  await expect(createDineInOrder(command({ qrCode: randomUUID() }), guest)).rejects.toMatchObject({ code: "INVALID_QR" });
  await expect(createDineInOrder(command({ qrCode: counterCode }), guest)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  const inactiveCode = randomUUID();
  sql(`insert into public.qr_codes(store_id,type,table_id,public_code,active,retired_at) values('${stores[0]}','table','${tables[0]}','${inactiveCode}',false,clock_timestamp())`);
  await expect(createDineInOrder(command({ qrCode: inactiveCode }), guest)).rejects.toMatchObject({ code: "INVALID_QR" });
  expect(orderCount()).toBe(before); expect(counterTotal()).toBe(count);
});
it("rejects checkout-pending/store pause and expired grants before any ticket", async () => {
  const context = device(), before = counterTotal();
  sql(`update public.table_sessions set status='checkout_pending' where id='${sessions[0]}'`);
  try { await expect(createDineInOrder(command(), context)).rejects.toMatchObject({ code: "SESSION_CHECKOUT_PENDING" }); }
  finally { sql(`update public.table_sessions set status='open' where id='${sessions[0]}'`); }
  sql(`update public.stores set accepting_orders=false where id='${stores[0]}'`);
  try { await expect(createDineInOrder(command(), context)).rejects.toMatchObject({ code: "STORE_NOT_ACCEPTING_ORDERS" }); }
  finally { sql(`update public.stores set accepting_orders=true where id='${stores[0]}'`); }
  sql(`update public.guest_access set expires_at=clock_timestamp()-interval '1 second' where browser_context_hash='${context.browserHash}'`);
  await expect(createDineInOrder(command(), context)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  expect(counterTotal()).toBe(before);
});
it("rejects hidden/sold-out/foreign items and foreign/inactive options, prior to revision conflict", async () => {
  const context = device(), count = counterTotal();
  for (const field of ["active", "available"]) {
    sql(`update public.menu_items set ${field}=false where id='${items[0]}'`);
    try { await expect(createDineInOrder(command({ menuRevision: "stale" }), context)).rejects.toMatchObject({ code: "OUT_OF_STOCK" }); }
    finally { sql(`update public.menu_items set ${field}=true where id='${items[0]}'`); }
  }
  await expect(createDineInOrder(command({ items: [{ menuItemId: items[2], quantity: 1, optionIds: [], note: null }] }), context)).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
  await expect(createDineInOrder(command({ items: [{ menuItemId: items[1], quantity: 1, optionIds: [option], note: null }] }), context)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  sql(`update public.menu_item_options set active=false where id='${option}'`);
  try { await expect(createDineInOrder(command(), context)).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); }
  finally { sql(`update public.menu_item_options set active=true where id='${option}'`); }
  await expect(createDineInOrder(command({ menuRevision: "stale" }), context)).rejects.toMatchObject({ code: "PRICE_CHANGED" });
  expect(counterTotal()).toBe(count);
});
it("sixty simultaneous valid orders across two sessions get unique sequential tickets with no lost rows", async () => {
  const devices = Array.from({ length: 12 }, (_, i) => device(sessions[i % 2])), before = orderCount(), counter = Number(counterTotal());
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => createDineInOrder(command({ qrCode: codes[i % 2] }), devices[i % 12])));
  const tickets = results.map(o => o.ticketNo!).sort((a, b) => a - b);
  expect(tickets).toEqual(Array.from({ length: 60 }, (_, i) => counter + i + 1));
  expect(new Set(results.map(o => o.id)).size).toBe(60); expect(orderCount()).toBe(before + 60); expect(Number(counterTotal())).toBe(counter + 60);
  const accepted = [...results].sort((a, b) => a.ticketNo! - b.ticketNo!).map(o => Date.parse(o.acceptedAt!));
  expect(accepted).toEqual([...accepted].sort((a, b) => a - b));
  console.log(`P3 FIFO local burst: 60 orders, 0 errors, ${Math.round(performance.now() - started)}ms; not a Production SLA`);
});
it("a late outbox failure rolls back all order resources and allows the same intent to retry", async () => {
  const context = device(), input = command();
  const counts = () => sql(`select jsonb_build_object('orders',(select count(*) from public.orders where store_id='${stores[0]}'),'items',(select count(*) from public.order_items where store_id='${stores[0]}'),'requests',(select count(*) from public.order_requests where store_id='${stores[0]}'),'audit',(select count(*) from public.order_events where store_id='${stores[0]}'),'outbox',(select count(*) from public.outbox_events where aggregate_id in(select id from public.orders where store_id='${stores[0]}')),'counter',(select sum(last_ticket) from public.ticket_counters where store_id='${stores[0]}'))`);
  const before = counts(), suffix = stores[0].replaceAll("-", "");
  sql(`create function public.p3_late_${suffix}() returns trigger language plpgsql as $$ begin if new.topic='order.accepted' and exists(select 1 from public.orders where id=new.aggregate_id and store_id='${stores[0]}') then raise exception 'isolated outbox failure';end if;return new;end;$$;
   create trigger p3_late_${suffix} before insert on public.outbox_events for each row execute function public.p3_late_${suffix}();`);
  try { await expect(createDineInOrder(input, context)).rejects.toMatchObject({ code: "INTERNAL_ERROR" }); }
  finally { sql(`drop trigger p3_late_${suffix} on public.outbox_events;drop function public.p3_late_${suffix}()`); }
  expect(counts()).toBe(before); expect((await createDineInOrder(input, context)).status).toBe("accepted");
});
it("menu write and order share a store gate, rejecting stale revision rather than accepting mixed prices", async () => {
  const input = command(), context = device();
  const editing = concurrentSql(`set application_name='p3-menu-${stores[0]}';begin;select id from public.stores where id='${stores[0]}' for update;update public.menu_items set price_vnd=30000 where id='${items[0]}';select pg_sleep(0.7);commit;`);
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setTimeout(resolve, 25));
    if (sql(`select count(*) from pg_stat_activity where application_name='p3-menu-${stores[0]}' and wait_event='PgSleep'`) === "1") break;
    if (i === 39) throw Error("Menu fixture did not acquire store lock");
  }
  try { await expect(createDineInOrder(input, context)).rejects.toMatchObject({ code: "PRICE_CHANGED" }); await editing; }
  finally { sql(`update public.menu_items set price_vnd=29000 where id='${items[0]}'`); }
});
it("uses safe integer server arithmetic, rejects overflow and supports zero-priced dine-in without payment", async () => {
  const before = counterTotal(), context = device();
  sql(`update public.menu_items set price_vnd=9007199254740991 where id='${items[0]}'`);
  try { await expect(createDineInOrder(command(), context)).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); }
  finally { sql(`update public.menu_items set price_vnd=29000 where id='${items[0]}'`); }
  expect(counterTotal()).toBe(before);
  sql(`update public.menu_items set price_vnd=0 where id='${items[1]}'`);
  try { expect(await createDineInOrder(command({ items: [{ menuItemId: items[1], quantity: 1, optionIds: [], note: null }] }), context)).toMatchObject({ totalVnd: 0, status: "accepted", paymentStatus: "unpaid" }); }
  finally { sql(`update public.menu_items set price_vnd=32000 where id='${items[1]}'`); }
});
it("forced failure after counter allocation rolls back counter/order/lines/replay/audit/outbox", async () => {
  const input = command(), context = device(), before = counterTotal(), rows = orderCount();
  // Scoped by this random fixture's UUID; ordinary sessions/stores are untouched.
  sql(`create function public.p3_test_fault_${stores[0].replaceAll("-", "")}() returns trigger language plpgsql as $$ begin if new.store_id='${stores[0]}' then raise exception 'isolated injected failure';end if;return new;end;$$;
   create trigger p3_test_fault_${stores[0].replaceAll("-", "")} before insert on public.orders for each row execute function public.p3_test_fault_${stores[0].replaceAll("-", "")}();`);
  try { await expect(createDineInOrder(input, context)).rejects.toMatchObject({ code: "INTERNAL_ERROR" }); }
  finally { sql(`drop trigger p3_test_fault_${stores[0].replaceAll("-", "")} on public.orders;drop function public.p3_test_fault_${stores[0].replaceAll("-", "")}();`); }
  expect(counterTotal()).toBe(before); expect(orderCount()).toBe(rows);
  expect(sql(`select count(*) from public.order_requests where store_id='${stores[0]}' and client_request_id='${input.clientRequestId}'`)).toBe("0");
  expect((await createDineInOrder(input, context)).ticketNo).toBe(Number(before) + 1);
});
it("two stores and two local business dates have independent row counters, including timezone midnight", async () => {
  const input = command({ qrCode: codes[2], menuRevision: revision(stores[1]), items: [{ menuItemId: items[2], quantity: 1, optionIds: [], note: null }] });
  expect((await createDineInOrder(input, secondStore)).ticketNo).toBe(1);
  expect(sql(`select public.p3_service_date('2026-10-23 16:59:59+00','Asia/Ho_Chi_Minh'),public.p3_service_date('2026-10-23 17:00:00+00','Asia/Ho_Chi_Minh')`)).toBe("2026-10-23|2026-10-24");
  expect(sql(`begin;select public.p3_next_ticket('${stores[0]}','2000-01-01');select public.p3_next_ticket('${stores[0]}','2000-01-02');select public.p3_next_ticket('${stores[0]}','2000-01-01');rollback;`)).toBe("1\n1\n2");
});
it("GET denies unrelated browser/session, allows a second verified device in the same session, and scopes pickup projection", async () => {
  const context = device(), input = command(), order = await createDineInOrder(input, context);
  for (const unauthorized of [otherTable, secondStore]) await expect(getGuestOrder(order.id, unauthorized)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  const peer = device(); expect((await getGuestOrder(order.id, peer)).id).toBe(order.id);
  await expect(getGuestOrder(order.id, peer, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(getGuestOrder(randomUUID(), context)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  sql(`update public.guest_access set revoked_at=clock_timestamp() where browser_context_hash='${context.browserHash}'`);
  await expect(getGuestOrder(order.id, context)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  await expect(createDineInOrder(input, context)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
});
it("create and session close serialize: close first rejects, create first commits before revoke", async () => {
  for (const closeFirst of [true, false]) {
    const table = randomUUID(), session = randomUUID(), code = randomUUID();
    sql(`insert into public.dining_tables(id,store_id,label) values('${table}','${stores[0]}','Race ${table}');insert into public.qr_codes(store_id,type,table_id,public_code) values('${stores[0]}','table','${table}','${code}');insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session}','${stores[0]}','${table}','${"b".repeat(64)}',clock_timestamp()+interval '24 hours')`);
    const context = device(session), input = command({ qrCode: code });
    if (closeFirst) {
      const closing = concurrentSql(`set application_name='p3-close-${session}';begin;update public.table_sessions set status='checkout_pending' where id='${session}';select pg_sleep(1);update public.table_sessions set status='closed' where id='${session}';commit;`);
      // Wait for actual session row lock, not just process creation.
      for (let i = 0; i < 40; i++) {
        await new Promise(resolve => setTimeout(resolve, 25));
        if (sql(`select count(*) from pg_stat_activity where application_name='p3-close-${session}' and wait_event='PgSleep'`) === "1") break;
        if (i === 39) throw Error("Close fixture did not acquire row lock");
      }
      await expect(createDineInOrder(input, context)).rejects.toMatchObject({ code: "SESSION_EXPIRED" }); await closing;
    } else {
      const request = command({ ...input });
      // Keep order's transaction alive after RPC, so a concurrent close must wait.
      const creating = concurrentSql(`set application_name='p3-create-${session}';begin;set local role service_role;select public.p3_order_execute('create','${JSON.stringify({ command: request, browserHash: context.browserHash, grantProof: context.grantProof })}'::jsonb);select pg_sleep(1);commit;`);
      for (let i = 0; i < 40; i++) {
        await new Promise(resolve => setTimeout(resolve, 25));
        if (sql(`select count(*) from pg_stat_activity where application_name='p3-create-${session}' and wait_event='PgSleep'`) === "1") break;
        if (i === 39) throw Error("Create fixture did not acquire session lock");
      }
      await concurrentSql(`begin;update public.table_sessions set status='checkout_pending' where id='${session}';update public.table_sessions set status='closed' where id='${session}';commit;`);
      const output = await creating; expect(output).toContain('"status": "accepted"');
      expect(sql(`select count(*) from public.orders where table_session_id='${session}'`)).toBe("1");
      await expect(createDineInOrder(input, context)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    }
    expect(sql(`select count(*) from public.guest_access where scope_id='${session}' and revoked_at is null`)).toBe("0");
  }
});
it("rate limiting returns a committed cooldown; same-key replay bypasses create bucket", async () => {
  const context = device(), input = command(), order = await createDineInOrder(input, context);
  sql(`update public.security_rate_buckets set attempts=10 where key_hash=encode(extensions.digest('order-create:${context.browserHash}:${stores[0]}','sha256'),'hex')`);
  await expect(createDineInOrder(command(), context)).rejects.toMatchObject({ code: "RATE_LIMITED", details: { retryAfterSeconds: expect.any(Number) } });
  expect(await createDineInOrder(input, context)).toEqual(order);
});
it("PostgreSQL enforces private RLS/RPC permissions, immutable history and deferred line totals", async () => {
  expect(sql(`select has_function_privilege('anon','public.p3_order_execute(text,jsonb)','execute'),has_function_privilege('authenticated','public.p3_order_execute(text,jsonb)','execute'),has_function_privilege('service_role','public.p3_order_execute(text,jsonb)','execute')`)).toBe("f|f|t");
  for (const table of ["orders", "order_items", "ticket_counters", "order_requests", "order_events"]) expect(sql(`select has_table_privilege('authenticated','public.${table}','select'),relrowsecurity from pg_class where oid='public.${table}'::regclass`)).toBe("f|t");
  const order = await createDineInOrder(command(), device());
  expect(() => sql(`update public.orders set total_vnd=1 where id='${order.id}'`)).toThrow();
  expect(() => sql(`update public.order_items set name_snapshot='forged' where order_id='${order.id}'`)).toThrow();
  expect(() => sql(`delete from public.orders where id='${order.id}'`)).toThrow();
  const fake = randomUUID();
  expect(() => sql(`insert into public.orders(id,store_id,type,table_session_id,table_id,table_label_snapshot,status,client_request_id,ticket_no,service_date,accepted_at,total_vnd,item_count) values('${fake}','${stores[0]}','dine_in','${sessions[0]}','${tables[0]}','Broken','accepted','${randomUUID()}',999999,current_date,now(),1,1)`)).toThrow();
  expect(sql(`select count(*) from public.orders where id='${fake}'`)).toBe("0");
  const anon = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY);
  expect((await anon.rpc("p3_order_execute", { action: "get", input: {} })).error).toBeTruthy();
  expect((await rpcClient.rpc("p3_order_execute", { action: "get", input: {} })).data).toEqual({ error: "UNAUTHORIZED" });
});
