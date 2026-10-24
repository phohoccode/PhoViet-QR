import { execFile, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { claimNextOrder, completeOwnerOrder, getOwnerOrders, markOwnerOrderReady } from "../../../src/server/orders/owner-service";
import { createDineInOrder, getGuestOrder } from "../../../src/server/orders/service";
import { hashSecret } from "../../../src/server/security/crypto";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:15421") throw Error("Refusing non-local owner queue tests");
const args = ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"];
const sql = (input: string) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const concurrent = (input: string) => new Promise<string>((resolve, reject) => {
  let output = "";
  const child = execFile("docker", args, { windowsHide: true }, error => error ? reject(Error("Isolated queue SQL failed")) : resolve(output));
  child.stdout!.on("data", value => { output += value; }); child.stdin!.end(input);
});
const rpc = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sid = randomUUID(), foreign = randomUUID(), actor = randomUUID(), second = randomUUID(), table = randomUUID(), session = randomUUID(), category = randomUUID(), item = randomUUID(), code = randomUUID();
const owner = { storeId: sid, authUserId: actor }, other = { storeId: foreign, authUserId: second };
const token = randomBytes(32).toString("base64url");
const guest = { token, browserHash: hashSecret(token), grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: false };
const key = () => ({ requestId: randomUUID() });
let ticket = 0;
function seed(count: number, state = "accepted", day = "2026-10-23") {
  const ids = Array.from({ length: count }, () => randomUUID());
  sql(`begin;${ids.map(id => `insert into public.orders(id,store_id,type,table_session_id,table_id,table_label_snapshot,status,client_request_id,ticket_no,service_date,accepted_at,total_vnd,item_count)
   values('${id}','${sid}','dine_in','${session}','${table}','Queue table','${state}','${randomUUID()}',${++ticket},'${day}',clock_timestamp(),100,1);
   insert into public.order_items(store_id,order_id,ordinal,item_id,name_snapshot,base_unit_price_vnd,options_snapshot,unit_price_vnd,qty,line_total_vnd)
   values('${sid}','${id}',1,'${item}','Snapshot coffee',100,'[]',100,1,100);`).join("\n")}commit;`);
  return ids;
}
const count = (relation: string) => sql(`select count(*) from public.${relation} where ${relation === "outbox_events" ? `aggregate_id in(select id from public.orders where store_id='${sid}')` : `store_id='${sid}'`}`);
async function waitSleeping(name: string) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 20));
    if (sql(`select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`) === "1") return;
  }
  throw Error("Lock fixture did not acquire lock");
}
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY || status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  sql(`insert into auth.users(id) values('${actor}'),('${second}');
   insert into public.stores(id,name) values('${sid}','Queue fixture'),('${foreign}','Other queue');
   insert into public.owner_members(store_id,auth_user_id) values('${sid}','${actor}'),('${foreign}','${second}');
   insert into public.dining_tables(id,store_id,label) values('${table}','${sid}','Queue table');
   insert into public.qr_codes(store_id,type,table_id,public_code) values('${sid}','table','${table}','${code}');
   insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session}','${sid}','${table}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours');
   insert into public.menu_categories(id,store_id,name) values('${category}','${sid}','Queue menu');
   insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${sid}','${category}','Coffee',100);
   insert into public.guest_browser_contexts(token_hash) values('${guest.browserHash}');
   insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at) values('${sid}','${session}','${hashSecret(`${guest.grantProof}:${session}`)}','${guest.browserHash}',clock_timestamp()+interval '6 hours');`);
});
beforeEach(() => {
  // Clear only this test store's active work, retaining audit/history for assertions.
  sql(`update public.orders set status='completed' where store_id='${sid}' and status in('accepted','preparing','ready');
   delete from public.security_rate_buckets where key_hash in(encode(extensions.digest('owner:${actor}:read','sha256'),'hex'),encode(extensions.digest('owner:${actor}:write','sha256'),'hex'));`);
});
afterAll(() => {
  sql(`begin;set local session_replication_role=replica;
   delete from public.outbox_events where aggregate_id in(select id from public.orders where store_id='${sid}');
   delete from public.order_events where store_id='${sid}';delete from public.order_requests where store_id='${sid}';delete from public.operation_requests where store_id in('${sid}','${foreign}');
   delete from public.order_items where store_id='${sid}';delete from public.orders where store_id='${sid}';delete from public.ticket_counters where store_id='${sid}';
   delete from public.guest_access where store_id='${sid}';delete from public.guest_browser_contexts where token_hash='${guest.browserHash}';
   delete from public.table_sessions where store_id='${sid}';delete from public.qr_codes where store_id='${sid}';delete from public.dining_tables where store_id='${sid}';
   delete from public.menu_items where store_id='${sid}';delete from public.menu_categories where store_id='${sid}';
   delete from public.owner_members where store_id in('${sid}','${foreign}');delete from public.stores where id in('${sid}','${foreign}');
   delete from auth.users where id in('${actor}','${second}');
   delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array['owner:${actor}:read','owner:${actor}:write','owner:${second}:read','owner:${second}:write','order-create:${guest.browserHash}:${sid}']) k);
   commit;`);
});

it("lists FIFO across service days with keyset pages, whole-store counts, independent detail and no list secrets", async () => {
  const ids = seed(5), old = seed(1, "accepted", "2026-10-22")[0], preparing = seed(1, "preparing")[0];
  let cursor: string | undefined; const seen: string[] = [];
  do {
    const page = await getOwnerOrders(owner, { limit: 2, cursor, status: "accepted", orderId: preparing });
    seen.push(...page.orders.map(o => o.id)); cursor = page.nextCursor ?? undefined;
    expect(page.counts).toMatchObject({ accepted: 6, preparing: 1, ready: 0 }); expect(page.detail?.id).toBe(preparing);
    for (const row of page.orders) { expect(row).not.toHaveProperty("lines"); expect(row).not.toHaveProperty("note"); expect(row).not.toHaveProperty("payment"); }
  } while (cursor);
  expect(seen).toEqual([old, ...ids]); expect(new Set(seen).size).toBe(6);
  const page = await getOwnerOrders(owner, { limit: 1 });
  for (const input of [{ status: "ready" as const }, { type: "takeaway" as const }, { view: "history" as const }])
    await expect(getOwnerOrders(owner, { ...input, cursor: page.nextCursor! })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(getOwnerOrders(other, { cursor: page.nextCursor! })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect((await getOwnerOrders(owner, { type: "takeaway" })).orders).toEqual([]);
  expect((await getOwnerOrders(owner, { view: "exceptions" })).orders).toEqual([]);
  expect((await getOwnerOrders(owner, { type: "takeaway" })).counts.accepted).toBe(6);
  seed(4, "completed");
  const expected = JSON.parse(sql(`select coalesce(json_agg(id order by created_at desc,id desc),'[]') from public.orders where store_id='${sid}' and status in('completed','cancelled')`));
  const history: string[] = []; cursor = undefined;
  do {
    const page = await getOwnerOrders(owner, { view: "history", limit: 2, cursor });
    history.push(...page.orders.map(o => o.id)); cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(history).toEqual(expected);
});
it("claims five accepted sequentially; 20 same-key retries replay one immutable snapshot", async () => {
  const ids = seed(5), cmd = key();
  const snapshots = await Promise.all(Array.from({ length: 20 }, () => claimNextOrder(owner, cmd)));
  snapshots.forEach(o => expect(o).toEqual(snapshots[0])); expect(snapshots[0]?.id).toBe(ids[0]);
  expect((await claimNextOrder(owner, key()))?.id).toBe(ids[1]); expect((await claimNextOrder(owner, key()))?.id).toBe(ids[2]);
  const ready = await markOwnerOrderReady(owner, ids[0], { ...key(), expectedVersion: 2 });
  expect(ready.version).toBe(3); expect(await claimNextOrder(owner, cmd)).toEqual(snapshots[0]);
  expect(sql(`select count(*) from public.order_events where order_id='${ids[0]}' and event_type='order.preparing'`)).toBe("1");
});
it("different concurrent keys claim distinct oldest jobs; audit commit order follows FIFO", async () => {
  const ids = seed(16), before = count("order_events");
  const results = await Promise.all(ids.map(() => claimNextOrder(owner, key())));
  expect(new Set(results.map(o => o!.id)).size).toBe(16); expect(results.map(o => o!.id).sort()).toEqual([...ids].sort());
  const events = JSON.parse(sql(`select json_agg(order_id order by created_at) from public.order_events where order_id in('${ids.join("','")}')`));
  expect(events).toEqual(ids); expect(Number(count("order_events"))).toBe(Number(before) + 16);
});
it("empty claim is persisted and replay stays null after a new order; ticket counter untouched", async () => {
  const cmd = key(), before = count("ticket_counters");
  expect(await claimNextOrder(owner, cmd)).toBeNull(); const id = seed(1)[0];
  expect(await claimNextOrder(owner, cmd)).toBeNull(); expect((await claimNextOrder(owner, key()))?.id).toBe(id);
  expect(count("ticket_counters")).toBe(before);
});
it("ready and complete enforce status/version, replay once, retain unpaid/open and update guest tracking", async () => {
  const id = seed(1)[0];
  await expect(markOwnerOrderReady(owner, id, { ...key(), expectedVersion: 1 })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  const claimed = (await claimNextOrder(owner, key()))!;
  await expect(completeOwnerOrder(owner, id, { ...key(), expectedVersion: 2, type: "dine_in" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  const readyKey = { ...key(), expectedVersion: 2 };
  const ready = await Promise.all(Array.from({ length: 10 }, () => markOwnerOrderReady(owner, id, readyKey)));
  ready.forEach(o => expect(o).toEqual(ready[0]));
  await expect(markOwnerOrderReady(owner, id, { ...readyKey, expectedVersion: 3 })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  await expect(markOwnerOrderReady(owner, seed(1, "preparing")[0], readyKey)).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  await expect(markOwnerOrderReady(owner, id, { ...key(), expectedVersion: 3 })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  const completeKey = { ...key(), expectedVersion: 3, type: "dine_in" as const };
  const completed = await Promise.all(Array.from({ length: 10 }, () => completeOwnerOrder(owner, id, completeKey)));
  completed.forEach(o => expect(o).toEqual(completed[0]));
  expect(completed[0]).toMatchObject({ status: "completed", paymentStatus: "unpaid", payment: { status: "unpaid" }, version: 4, ticketNo: claimed.ticketNo, totalVnd: claimed.totalVnd, acceptedAt: claimed.acceptedAt });
  expect(sql(`select status from public.table_sessions where id='${session}'`)).toBe("open");
  expect((await getGuestOrder(id, guest)).status).toBe("completed");
  expect(await markOwnerOrderReady(owner, id, readyKey)).toEqual(ready[0]);
  await expect(completeOwnerOrder(owner, id, { ...completeKey, expectedVersion: 4 })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  for (const state of ["accepted", "ready", "completed", "cancelled"]) {
    const target = seed(1, state)[0];
    await expect(markOwnerOrderReady(owner, target, { ...key(), expectedVersion: 1 })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    if (state !== "ready") await expect(completeOwnerOrder(owner, target, { ...key(), expectedVersion: 1, type: "dine_in" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  }
  expect(sql(`select count(*) from public.order_events where order_id='${id}'`)).toBe("3");
  expect(sql(`select count(*) from public.outbox_events where aggregate_id='${id}'`)).toBe("3");
});
it("returns safe missing/cross-store errors, rejects revoked membership/another actor and operation reuse", async () => {
  const id = seed(1)[0], cmd = key(); await claimNextOrder(owner, cmd);
  await expect(markOwnerOrderReady(other, id, { ...key(), expectedVersion: 2 })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  await expect(getOwnerOrders(other, { orderId: id })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  await expect(markOwnerOrderReady(owner, randomUUID(), { ...key(), expectedVersion: 1 })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  await expect(completeOwnerOrder(owner, randomUUID(), { ...key(), expectedVersion: 1, type: "dine_in" })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  await expect(markOwnerOrderReady(owner, id, { ...cmd, expectedVersion: 2 })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  sql(`update public.owner_members set store_id='${sid}' where auth_user_id='${second}'`);
  try { await expect(claimNextOrder({ storeId: sid, authUserId: second }, cmd)).rejects.toMatchObject({ code: "FORBIDDEN" }); }
  finally { sql(`update public.owner_members set store_id='${foreign}' where auth_user_id='${second}'`); }
  await expect(claimNextOrder({ storeId: foreign, authUserId: actor }, key())).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("concurrent stale-version tabs allow one ready and reject the other", async () => {
  const id = seed(1, "preparing")[0];
  const results = await Promise.allSettled(Array.from({ length: 2 }, () => markOwnerOrderReady(owner, id, { ...key(), expectedVersion: 1 })));
  expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
  expect(results.find(x => x.status === "rejected")).toMatchObject({ reason: { code: "INVALID_STATE_TRANSITION" } });
});
it("late outbox failure rolls back status, command, audit and outbox; same key safely retries", async () => {
  const id = seed(1)[0], cmd = key(), suffix = sid.replaceAll("-", "");
  const before = [count("operation_requests"), count("order_events"), count("outbox_events")];
  sql(`create function public.queue_fault_${suffix}() returns trigger language plpgsql as $$ begin if new.aggregate_id='${id}' then raise exception 'isolated queue failure';end if;return new;end;$$;
   create trigger queue_fault_${suffix} before insert on public.outbox_events for each row execute function public.queue_fault_${suffix}();`);
  try { await expect(claimNextOrder(owner, cmd)).rejects.toMatchObject({ code: "INTERNAL_ERROR" }); }
  finally { sql(`drop trigger queue_fault_${suffix} on public.outbox_events;drop function public.queue_fault_${suffix}()`); }
  expect([count("operation_requests"), count("order_events"), count("outbox_events")]).toEqual(before);
  expect(sql(`select status||':'||version from public.orders where id='${id}'`)).toBe("accepted:1");
  expect((await claimNextOrder(owner, cmd))?.id).toBe(id);
});
it("a locked head is waited for, never skipped; changed head is reread before choosing the next", async () => {
  const ids = seed(3), name = `queue-lock-${sid}`;
  let locking = concurrent(`set application_name='${name}';begin;select id from public.orders where id='${ids[0]}' for update;select pg_sleep(1);commit;`);
  await waitSleeping(name); let resolved = false;
  const claiming = claimNextOrder(owner, key()).then(o => { resolved = true; return o; });
  await new Promise(r => setTimeout(r, 150)); expect(resolved).toBe(false);
  expect((await claiming)?.id).toBe(ids[0]); await locking;
  locking = concurrent(`set application_name='${name}';begin;update public.orders set status='cancelled' where id='${ids[1]}';select pg_sleep(1);commit;`);
  await waitSleeping(name); expect((await claimNextOrder(owner, key()))?.id).toBe(ids[2]); await locking;
});
it("C01 acceptance and claim share the gate; session close and guest reads do not deadlock", async () => {
  // Seed orders use a prior date so the real acceptance ticket #1 is distinct.
  seed(1, "accepted", "2026-10-21");
  sql(`insert into public.ticket_counters(store_id,service_date,last_ticket)
   select '${sid}',public.p3_service_date(clock_timestamp(),'Asia/Ho_Chi_Minh'),coalesce(max(ticket_no),1)
   from public.orders where store_id='${sid}' and service_date=public.p3_service_date(clock_timestamp(),'Asia/Ho_Chi_Minh')
   on conflict(store_id,service_date) do update set last_ticket=excluded.last_ticket;`);
  const input = { qrCode: code, clientRequestId: randomUUID(), menuRevision: sql(`select menu_revision from public.stores where id='${sid}'`), items: [{ menuItemId: item, quantity: 1, optionIds: [], note: null }], note: null };
  const [created, claimed] = await Promise.all([createDineInOrder(input, guest), claimNextOrder(owner, key())]);
  expect(claimed!.serviceDate).toBe("2026-10-21"); expect(created.status).toBe("accepted");
  const name = `queue-session-${sid}`;
  const closing = concurrent(`set application_name='${name}';begin;select id from public.table_sessions where id='${session}' for update;select pg_sleep(0.6);update public.table_sessions set status='checkout_pending' where id='${session}';commit;`);
  await waitSleeping(name);
  const results = await Promise.all([claimNextOrder(owner, key()), getGuestOrder(created.id, guest)]); await closing;
  expect(results[0]?.id).toBe(created.id); expect(["accepted", "preparing"]).toContain(results[1].status);
  sql(`update public.table_sessions set status='open' where id='${session}'`);
});
it("blocks takeaway proof before persistence and schema forbids pending-payment/ticketless takeaway", async () => {
  const id = seed(1, "ready")[0], before = count("operation_requests");
  await expect(completeOwnerOrder(owner, id, { ...key(), expectedVersion: 1, type: "takeaway", pickupCode: "private-proof" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(count("operation_requests")).toBe(before);
  expect(() => sql(`update public.orders set type='takeaway',status='pending_payment',ticket_no=null where id='${id}'`)).toThrow();
  for (const role of ["anon", "authenticated"]) {
    expect(sql(`select has_function_privilege('${role}','public.p3_owner_orders_execute(text,jsonb)','execute')`)).toBe("f");
    expect((await createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } }).rpc("p3_owner_orders_execute", { action: "claim", input: { storeId: sid, ownerId: actor, ...key() } })).error).toBeTruthy();
  }
  const response = await rpc.rpc("p3_owner_orders_execute", { action: "claim", input: { storeId: sid, ownerId: second, ...key() } });
  expect(response.data).toEqual({ error: "FORBIDDEN" });
});

it("bounds a long DB lock wait and safely retries the same command after rollback", async () => {
  const id = seed(1)[0], cmd = key(), name = `queue-timeout-${sid}`;
  const locking = concurrent(`set application_name='${name}';begin;select id from public.orders where id='${id}' for update;select pg_sleep(4.5);commit;`);
  await waitSleeping(name); const started = performance.now();
  await expect(claimNextOrder(owner, cmd)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  expect(performance.now() - started).toBeLessThan(4400);
  expect(sql(`select status||':'||version from public.orders where id='${id}'`)).toBe("accepted:1");
  expect(sql(`select count(*) from public.operation_requests where store_id='${sid}' and request_id='${cmd.requestId}'`)).toBe("0");
  await locking; expect((await claimNextOrder(owner, cmd))?.id).toBe(id);
});

it("an injected inverse-lock maintenance deadlock aborts atomically; same-key recovery never double claims", async () => {
  const id = seed(1)[0], cmd = key(), name = `queue-deadlock-${sid}`;
  // Deliberately violate documented lock ordering in an isolated maintenance
  // fixture, to exercise PostgreSQL's abort path, not normal application flow.
  const maintenance = concurrent(`set application_name='${name}';set deadlock_timeout='10s';begin;
   select id from public.orders where id='${id}' for update;select pg_sleep(0.5);
   select id from public.stores where id='${sid}' for no key update;commit;`);
  await waitSleeping(name);
  const failed = await rpc.rpc("p3_owner_orders_execute", { action: "claim", input: { storeId: sid, ownerId: actor, ...cmd } });
  expect(failed.error?.code).toBe("40P01"); await maintenance;
  expect(sql(`select status||':'||version from public.orders where id='${id}'`)).toBe("accepted:1");
  expect(sql(`select count(*) from public.operation_requests where store_id='${sid}' and request_id='${cmd.requestId}'`)).toBe("0");
  const recovered = await claimNextOrder(owner, cmd); expect(recovered?.id).toBe(id);
  expect(await claimNextOrder(owner, cmd)).toEqual(recovered);
  expect(sql(`select count(*) from public.order_events where order_id='${id}'`)).toBe("1");
});
