import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { PayOS } from "@payos/node";
import { createCustomerOrder, getCustomerPayment, getTakeawayOrder, receivePayosWebhook, provisionPayment } from "../../../src/server/payments/service";
import { PayosGateway } from "../../../src/server/payments/payos";
import { paymentRpc } from "../../../src/server/payments/database";
import { hashSecret } from "../../../src/server/security/crypto";
import { createDineInOrder } from "../../../src/server/orders/service";
import type { GuestRequestContext } from "../../../src/server/security/request-context";
import { getOwnerOrders, claimNextOrder, markOwnerOrderReady, completeOwnerOrder } from "../../../src/server/orders/owner-service";
import { ensurePickupCredential, recoverPickupCredentials } from "../../../src/server/pickup/service";
import * as pickupCrypto from "../../../src/server/pickup/crypto";
import type { CreateOrderV1Input, OrderDetail, PrivateOrderTrackingView } from "../../../docs/contracts/types";

// TEST ONLY. Local Docker DB + signed fixture events, never provider network.
// Run serially with HTTP scripts: reconcile can recover deliberately failed
// receipts between rollback assertions in a concurrent test process.
const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:15421") throw Error("Refusing non-local payment tests");
const sql = (input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const store = randomUUID(), qr = randomUUID(), category = randomUUID(), item = randomUUID(), actor = randomUUID(), table = randomUUID(), session = randomUUID(), tableQr = randomUUID();
const checksumKey = "TEST_ONLY_PAYMENT_CHECKSUM_NOT_A_REAL_KEY", account = "12345678";
const sdk = new PayOS({ clientId: "TEST_ONLY_CLIENT", apiKey: "TEST_ONLY_API", checksumKey, logLevel: "off" });
const owner = { storeId: store, authUserId: actor };
const secondActor = randomUUID();
const secondOwner = { storeId: store, authUserId: secondActor };
const devices: GuestRequestContext[] = [];
const transactionIds: string[] = [];
function device() {
  const token = randomBytes(32).toString("base64url");
  const context = { token, browserHash: hashSecret(token), grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: false };
  devices.push(context); sql(`insert into public.guest_browser_contexts(token_hash) values('${context.browserHash}')`); return context;
}
function cmd(extra: Partial<CreateOrderV1Input> = {}): CreateOrderV1Input {
  return { qrCode: qr, clientRequestId: randomUUID(), menuRevision: sql(`select menu_revision from public.stores where id='${store}'`),
    items: [{ menuItemId: item, quantity: 2, optionIds: [], note: null }], note: null, ...extra };
}
const count = (relation: string) => Number(sql(`select count(*) from public.${relation} where store_id='${store}'`));
const intent = (o: OrderDetail) => { if (o.payment.kind !== "takeaway") throw Error("Expected takeaway"); return o.payment.intentId; };
const reference = (o: OrderDetail) => Number(sql(`select provider_reference from public.payment_intents where id='${intent(o)}'`));
async function webhook(o: OrderDetail, extra: Record<string, unknown> = {}) {
  const data = { orderCode: reference(o), amount: o.totalVnd, description: "QR ORDER", accountNumber: account,
    reference: randomUUID(), transactionDateTime: sql("select to_char(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS')"),
    currency: "VND", paymentLinkId: randomBytes(16).toString("hex"), code: "00", desc: "success", ...extra };
  transactionIds.push(String(data.reference));
  return { code: "00", success: true, data, signature: await sdk.crypto.createSignatureFromObj(data, checksumKey) };
}
beforeAll(() => {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, PAYOS_STORE_ID: store, PAYOS_CLIENT_ID: "TEST_ONLY_CLIENT", PAYOS_API_KEY: "TEST_ONLY_API", PAYOS_CHECKSUM_KEY: checksumKey,
    PAYOS_ACCOUNT_NUMBER: account, PAYMENT_RETURN_ORIGIN: "https://test.invalid",
    PICKUP_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }),
    PICKUP_HMAC_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }) })) vi.stubEnv(key, String(value));
  sql(`notify pgrst,'reload schema';
   insert into public.stores(id,name) values('${store}','P4 TEST ONLY');
   insert into auth.users(id,email) values('${actor}','${actor}@test.invalid');
   insert into auth.users(id,email) values('${secondActor}','${secondActor}@test.invalid');
   insert into public.owner_members(store_id,auth_user_id) values('${store}','${actor}');
   insert into public.owner_members(store_id,auth_user_id) values('${store}','${secondActor}');
   insert into public.dining_tables(id,store_id,label) values('${table}','${store}','Test');
   insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session}','${store}','${table}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours');
   insert into public.qr_codes(store_id,type,public_code,table_id) values('${store}','takeaway','${qr}',null),('${store}','table','${tableQr}','${table}');
   insert into public.menu_categories(id,store_id,name) values('${category}','${store}','Menu');
   insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${store}','${category}','Coffee',35000);`);
});
beforeEach(() => {
  sql(`delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array['pickup-owner:${actor}','pickup-command:${actor}','owner:${actor}:write','owner:${actor}:read']) k)`);
});
afterAll(() => {
  sql(`begin;set local session_replication_role=replica;
   delete from public.outbox_events where aggregate_id in(select id from public.orders where store_id='${store}') or aggregate_id in(select id from public.payment_intents where store_id='${store}');
   delete from public.operation_requests where store_id='${store}';delete from public.order_events where store_id='${store}';
   delete from public.pickup_attempt_log where store_id='${store}';delete from public.pickup_credentials where store_id='${store}';
   delete from public.payments where store_id='${store}';delete from public.payment_webhook_inbox where transaction_id in('${transactionIds.join("','")}');
   delete from public.payment_intents where store_id='${store}';delete from public.takeaway_requests where store_id='${store}';
   delete from public.order_requests where store_id='${store}';delete from public.order_items where store_id='${store}';delete from public.orders where store_id='${store}';
   delete from public.ticket_counters where store_id='${store}';delete from public.guest_access where store_id='${store}';delete from public.table_sessions where store_id='${store}';
   delete from public.qr_codes where store_id='${store}';delete from public.dining_tables where store_id='${store}';
   delete from public.menu_item_options where store_id='${store}';delete from public.menu_items where store_id='${store}';delete from public.menu_categories where store_id='${store}';
   delete from public.owner_members where store_id='${store}';delete from public.stores where id='${store}';delete from auth.users where id in('${actor}','${secondActor}');
   delete from public.guest_browser_contexts where token_hash in('${devices.map(d => d.browserHash).join("','")}');commit;`);
  vi.unstubAllEnvs();
});
it("pending snapshot has integer server price, scoped capability, no session or FIFO, immutable same-key replay", async () => {
  const guest = device(), input = cmd(), before = count("orders");
  const o = await createCustomerOrder(input, guest);
  expect(o).toMatchObject({ type: "takeaway", status: "pending_payment", ticketNo: null, totalVnd: 70000, tableSessionId: null, table: null, paymentStatus: "pending" });
  expect(o.payment).toMatchObject({ checkoutUrl: null, qrPayload: null, amountVnd: 70000 });
  expect(count("orders")).toBe(before + 1); expect(count("ticket_counters")).toBe(0);
  const retries = await Promise.all(Array.from({ length: 20 }, () => createCustomerOrder(input, guest)));
  retries.forEach(r => expect(r).toEqual(o));
  await expect(createCustomerOrder({ ...input, note: "changed" }, guest)).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  await expect(getCustomerPayment(intent(o), device())).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  expect(await getCustomerPayment(intent(o), guest)).toMatchObject({ status: "pending" });
  expect((await getOwnerOrders(owner)).orders).toHaveLength(0);
});
it("20 concurrent verified duplicate webhooks create exactly one ledger and one shared ticket", async () => {
  const guest = device(), input = cmd(), o = await createCustomerOrder(input, guest), body = await webhook(o), before = count("payments");
  const result = await Promise.all(Array.from({ length: 20 }, () => receivePayosWebhook(body)));
  expect(result.filter(r => r.outcome === "accepted")).toHaveLength(1);
  expect(count("payments")).toBe(before + 1);
  expect(await getTakeawayOrder(o.id, guest, false)).toMatchObject({ status: "accepted", ticketNo: 1, paymentStatus: "paid" });
  expect(await createCustomerOrder(input, guest)).toEqual(o);
  const duplicateTx = { ...body.data, description: "changed delivery" };
  expect(await receivePayosWebhook({ ...body, data: duplicateTx, signature: await sdk.crypto.createSignatureFromObj(duplicateTx, checksumKey) })).toMatchObject({ outcome: "duplicate" });
  expect(sql(`select last_ticket from public.ticket_counters where store_id='${store}'`)).toBe("1");
  expect(sql(`select count(*) from public.pickup_credentials where order_id='${o.id}'`)).toBe("1");
  const first = sql(`select code_hash||':'||code_ciphertext::text from public.pickup_credentials where order_id='${o.id}'`);
  await Promise.all(Array.from({ length: 20 }, () => ensurePickupCredential(o.id)));
  await Promise.all(Array.from({ length: 20 }, () => recoverPickupCredentials()));
  expect(sql(`select code_hash||':'||code_ciphertext::text from public.pickup_credentials where order_id='${o.id}'`)).toBe(first);
  expect(sql(`select count(*) from public.order_events where order_id='${o.id}' and event_type='pickup.issued'`)).toBe("1");
});

it("50 concurrent checkouts remain outside FIFO and never share reference/intent/order", async () => {
  const inputs = Array.from({ length: 50 }, () => ({ input: cmd(), guest: device() }));
  const before = count("orders");
  const orders = await Promise.all(inputs.map(({ input, guest }) => createCustomerOrder(input, guest)));
  expect(new Set(orders.map(o => o.id)).size).toBe(50); expect(new Set(orders.map(intent)).size).toBe(50);
  expect(count("orders")).toBe(before + 50); expect(orders.every(o => o.ticketNo === null)).toBe(true);
  expect(sql(`select count(distinct provider_reference)=count(*) from public.payment_intents where store_id='${store}'`)).toBe("t");
  expect((await getOwnerOrders(owner)).orders.map(o => o.status)).toEqual(["accepted"]);
});
it("mismatch/late/unknown evidence never issues tickets, failure cannot downgrade paid", async () => {
  for (const extra of [{ amount: 1 }, { currency: "USD" }]) {
    const guest = device(), o = await createCustomerOrder(cmd(), guest);
    expect(await receivePayosWebhook(await webhook(o, extra))).toMatchObject({ outcome: "recorded_exception" });
    expect(await getTakeawayOrder(o.id, guest, false)).toMatchObject({ status: "payment_exception", ticketNo: null });
  }
  const guest = device(), o = await createCustomerOrder(cmd(), guest);
  // TEST ONLY clock fixture. Evidence immutability remains enabled for all runtime roles.
  sql(`begin;set local session_replication_role=replica;update public.payment_intents set expires_at=clock_timestamp()-interval '1 second' where id='${intent(o)}';commit;`);
  await paymentRpc("p4_payment_execute", { action: "expire", input: { intentId: intent(o) } });
  expect(await getCustomerPayment(intent(o), guest)).toMatchObject({ status: "expired" });
  expect(await receivePayosWebhook(await webhook(o))).toMatchObject({ outcome: "recorded_exception" });
  expect(await getTakeawayOrder(o.id, guest, false)).toMatchObject({ status: "payment_exception", ticketNo: null });
  expect(await receivePayosWebhook(await webhook(o, { orderCode: 9000000000000000 }))).toMatchObject({ outcome: "recorded_exception" });
  expect(sql(`select last_ticket from public.ticket_counters where store_id='${store}'`)).toBe("1");
});
it("processing fault persists inbox, rolls back payment/ticket/outbox then succeeds on exact retry", async () => {
  const guest = device(), o = await createCustomerOrder(cmd(), guest), body = await webhook(o), before = count("payments");
  sql(`create function public.p4_test_failure() returns trigger language plpgsql as $$ begin if new.id='${o.id}' and new.status='accepted' then raise exception 'TEST ONLY'; end if;return new;end; $$;
    create trigger p4_test_failure before update on public.orders for each row execute function public.p4_test_failure();`);
  try { await expect(receivePayosWebhook(body)).rejects.toMatchObject({ code: "INTERNAL_ERROR" }); }
  finally { sql("drop trigger p4_test_failure on public.orders;drop function public.p4_test_failure()"); }
  expect(count("payments")).toBe(before);
  expect(sql(`select state from public.payment_webhook_inbox where transaction_id='${body.data.reference}'`)).toBe("failed");
  expect(await getTakeawayOrder(o.id, guest, false)).toMatchObject({ status: "pending_payment", ticketNo: null });
  sql(`begin;set local session_replication_role=replica;update public.payment_intents set expires_at=(select received_at+interval '1 microsecond' from public.payment_webhook_inbox where transaction_id='${body.data.reference}') where id='${intent(o)}';commit;`);
  await paymentRpc("p4_payment_execute", { action: "expire", input: { intentId: intent(o) } });
  expect(await getCustomerPayment(intent(o), guest)).toMatchObject({ status: "pending" });
  expect(await receivePayosWebhook(body)).toMatchObject({ outcome: "accepted" });
  expect(count("payments")).toBe(before + 1);
});
it("TEST ONLY provider timeout preserves reference; retry recovers signed status/link without a second create or paid transition", async () => {
  const guest = device(), o = await createCustomerOrder(cmd(), guest), id = intent(o), ref = reference(o);
  const recoveredLink = randomBytes(16).toString("hex");
  const create = vi.spyOn(PayosGateway.prototype, "createPayment").mockRejectedValue(Error("TEST ONLY provider timeout after remote commit"));
  const query = vi.spyOn(PayosGateway.prototype, "getPaymentStatus").mockResolvedValue({ status: "PENDING", amountVnd: o.totalVnd, reference: String(ref), paymentLinkId: recoveredLink });
  try {
    await provisionPayment(id);
    expect(await getCustomerPayment(id, guest)).toMatchObject({ status: "pending", checkoutUrl: null });
    expect(sql(`select create_attempts from public.payment_intents where id='${id}'`)).toBe("1");
    sql(`update public.payment_intents set lease_until=clock_timestamp()-interval '1 second' where id='${id}'`);
    await provisionPayment(id);
    expect(create).toHaveBeenCalledTimes(1); expect(query).toHaveBeenCalledWith(String(ref));
    expect(await getCustomerPayment(id, guest)).toMatchObject({ status: "pending", checkoutUrl: `https://pay.payos.vn/web/${recoveredLink}`, qrPayload: null });
    expect(await getTakeawayOrder(o.id, guest, false)).toMatchObject({ status: "pending_payment", ticketNo: null });
    expect(reference(o)).toBe(ref);
  } finally { create.mockRestore(); query.mockRestore(); }
});
it("TEST ONLY 20 concurrent provisioning calls share durable lease and never hold DB locks across provider IO", async () => {
  const guest = device(), o = await createCustomerOrder(cmd(), guest), id = intent(o);
  const create = vi.spyOn(PayosGateway.prototype, "createPayment").mockImplementation(async () => {
    // The provider callback can take the admission lock because prepare already committed.
    sql(`begin;set local lock_timeout='500ms';select id from public.stores where id='${store}' for no key update;commit;`);
    return { paymentLinkId: randomBytes(16).toString("hex"), accountNumber: account, checkoutUrl: "https://pay.payos.vn/web/TEST_ONLY", qrPayload: "TEST_ONLY_NOT_A_PAYMENT_QR" };
  });
  try { await Promise.all(Array.from({ length: 20 }, () => provisionPayment(id))); expect(create).toHaveBeenCalledTimes(1); }
  finally { create.mockRestore(); }
  expect(await getCustomerPayment(id, guest)).toMatchObject({ status: "pending", qrPayload: "TEST_ONLY_NOT_A_PAYMENT_QR" });
});
it("merchant/link mismatch and signed failure cannot accept or downgrade; evidence/intent fields cannot be rewritten", async () => {
  const guest = device(), o = await createCustomerOrder(cmd(), guest), id = intent(o);
  expect(await receivePayosWebhook(await webhook(o, { accountNumber: "99999999" }))).toMatchObject({ outcome: "recorded_exception" });
  expect(await getTakeawayOrder(o.id, guest, false)).toMatchObject({ status: "pending_payment", ticketNo: null });
  expect(await receivePayosWebhook(await webhook(o))).toMatchObject({ outcome: "accepted" });
  expect(await receivePayosWebhook(await webhook(o, { code: "99", paymentLinkId: sql(`select provider_link_id from public.payment_intents where id='${id}'`) }))).toMatchObject({ outcome: "ignored" });
  expect(await getTakeawayOrder(o.id, guest, false)).toMatchObject({ status: "accepted", paymentStatus: "paid" });
  expect(() => sql(`update public.payment_intents set amount_vnd=1 where id='${id}'`)).toThrow();
  expect(() => sql(`update public.payment_webhook_inbox set event='{}' where event->>'reference'='${reference(o)}'`)).toThrow();
  expect(() => sql(`update public.orders set ticket_no=ticket_no+1 where id='${o.id}'`)).toThrow();
});
it("provider configuration, store binding, zero price and stale menu fail before creating a payment", async () => {
  const guest = device(), before = count("orders");
  vi.stubEnv("PAYOS_API_KEY", "");
  try { await expect(createCustomerOrder(cmd(), guest)).rejects.toMatchObject({ code: "PAYMENT_PROVIDER_UNAVAILABLE" }); }
  finally { vi.stubEnv("PAYOS_API_KEY", "TEST_ONLY_API"); }
  vi.stubEnv("PAYOS_STORE_ID", randomUUID());
  try { await expect(createCustomerOrder(cmd(), guest)).rejects.toMatchObject({ code: "PAYMENT_PROVIDER_UNAVAILABLE" }); }
  finally { vi.stubEnv("PAYOS_STORE_ID", store); }
  await expect(createCustomerOrder(cmd({ menuRevision: "stale" }), guest)).rejects.toMatchObject({ code: "PRICE_CHANGED" });
  sql(`update public.menu_items set price_vnd=0 where id='${item}'`);
  try { await expect(createCustomerOrder(cmd(), guest)).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); }
  finally { sql(`update public.menu_items set price_vnd=35000 where id='${item}'`); }
  expect(count("orders")).toBe(before);
});
it("server-observed underpayment cannot issue a ticket and becomes reconciliation exception at expiry", async () => {
  const guest = device(), o = await createCustomerOrder(cmd(), guest), id = intent(o);
  await paymentRpc("p4_payment_execute", { action: "observe", input: { intentId: id, channelHash: hashSecret("TEST_ONLY_CLIENT"), status: "UNDERPAID" } });
  expect(await getCustomerPayment(id, guest)).toMatchObject({ status: "pending" });
  sql(`begin;set local session_replication_role=replica;update public.payment_intents set expires_at=clock_timestamp()-interval '1 second' where id='${id}';commit;`);
  await paymentRpc("p4_payment_execute", { action: "expire", input: { intentId: id } });
  expect(await getCustomerPayment(id, guest)).toMatchObject({ status: "exception", reconciliationRequired: true });
  expect(await getTakeawayOrder(o.id, guest, false)).toMatchObject({ status: "payment_exception", ticketNo: null });
});
it("mixed dine-in/takeaway share admission order, owner claim and ready; pause does not reject already funded intent", async () => {
  const guest = device(), pending = await createCustomerOrder(cmd(), guest);
  sql(`insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at)
    values('${store}','${session}','${hashSecret(`${guest.grantProof}:${session}`)}','${guest.browserHash}',clock_timestamp()+interval '6 hours')`);
  const dine = await createDineInOrder(cmd({ qrCode: tableQr }), guest);
  sql(`update public.stores set accepting_orders=false where id='${store}'`);
  try { expect(await receivePayosWebhook(await webhook(pending))).toMatchObject({ outcome: "accepted" }); }
  finally { sql(`update public.stores set accepting_orders=true where id='${store}'`); }
  const take = await getTakeawayOrder(pending.id, guest, false) as OrderDetail;
  expect(take.ticketNo).toBe(dine.ticketNo! + 1);
  const queue = await getOwnerOrders(owner);
  expect(queue.orders.filter(o => o.type === "takeaway").every(o => o.paymentStatus === "paid")).toBe(true);
  const first = await claimNextOrder(owner, { requestId: randomUUID() });
  expect(first?.ticketNo).toBe(1); expect(first?.type).toBe("takeaway");
  const ready = await markOwnerOrderReady(owner, first!.id, { requestId: randomUUID(), expectedVersion: first!.version });
  expect(ready.status).toBe("ready");
});

async function tracking(o: OrderDetail, guest: GuestRequestContext) {
  return await getTakeawayOrder(o.id, guest, true) as PrivateOrderTrackingView;
}
async function paid() {
  const guest = device(), pending = await createCustomerOrder(cmd(), guest), body = await webhook(pending);
  await receivePayosWebhook(body);
  const view = await tracking(pending, guest);
  expect(view.pickup?.code).toMatch(/^[0-9]{6}$/);
  return { guest, order: view.order, code: view.pickup!.code, body };
}
async function ready(o: OrderDetail) {
  for (let n = 0; n < 100; n++) {
    const claimed = await claimNextOrder(owner, { requestId: randomUUID() });
    if (!claimed) throw Error("Target not found in FIFO");
    if (claimed.id === o.id) return markOwnerOrderReady(owner, o.id, { requestId: randomUUID(), expectedVersion: claimed.version });
  }
  throw Error("Target outside fixture queue bound");
}
const complete = (o: OrderDetail, code: string, requestId = randomUUID()) => completeOwnerOrder(owner, o.id,
  { requestId, expectedVersion: o.version, type: "takeaway", pickupCode: code });
const state = (o: OrderDetail) => sql(`select status from public.orders where id='${o.id}'`);

it("pickup: GET pending never issues, accepted recovers leading zeros only to correct guest, reload never mutates credential", async () => {
  const guest = device(), o = await createCustomerOrder(cmd(), guest);
  expect((await tracking(o, guest)).pickup).toBeNull();
  await expect(complete(o, "000042")).rejects.toMatchObject({ code: "PICKUP_NOT_ALLOWED" });
  expect(sql(`select count(*) from public.pickup_credentials where order_id='${o.id}'`)).toBe("0");
  const generator = vi.spyOn(pickupCrypto, "newPickupCode").mockReturnValue("000042");
  try { await receivePayosWebhook(await webhook(o)); } finally { generator.mockRestore(); }
  const first = await tracking(o, guest); expect(first.pickup?.code).toBe("000042");
  const stored = sql(`select row_to_json(c) from public.pickup_credentials c where order_id='${o.id}'`);
  expect((await tracking(o, guest)).pickup).toEqual(first.pickup);
  expect(sql(`select row_to_json(c) from public.pickup_credentials c where order_id='${o.id}'`)).toBe(stored);
  await expect(tracking(o, device())).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  const other = await paid(); await expect(tracking(o, other.guest)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  const normal = await getTakeawayOrder(o.id, guest, false);
  expect(JSON.stringify(normal)).not.toContain('"pickup"');
  expect(JSON.stringify(await getOwnerOrders(owner, { orderId: o.id }))).not.toMatch(/code_hash|code_ciphertext|pickupCode|"code"/);
  sql(`update public.takeaway_requests set access_expires_at=clock_timestamp()-interval '1 second' where order_id='${o.id}'`);
  await expect(tracking(o, guest)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
});
it("pickup: 20 same-key completes, lost-response replay, different payload conflict and no second audit", async () => {
  const p = await paid(), o = await ready(p.order), request = randomUUID();
  const results = await Promise.all(Array.from({ length: 20 }, () => complete(o, p.code, request)));
  results.forEach(r => expect(r).toEqual(results[0]));
  expect(results[0]).toMatchObject({ status: "completed", paymentStatus: "paid", fulfillmentStatus: "collected", version: o.version + 1 });
  expect(await complete(o, p.code, request)).toEqual(results[0]);
  await expect(complete(o, p.code === "999999" ? "999998" : "999999", request)).rejects.toMatchObject({ code: "DUPLICATE_REQUEST_CONFLICT" });
  await expect(complete(o, p.code)).rejects.toMatchObject({ code: "ORDER_ALREADY_COMPLETED" });
  expect(sql(`select count(*) from public.order_events where order_id='${o.id}' and event_type='order.completed'`)).toBe("1");
  expect(sql(`select count(*) from public.outbox_events where aggregate_id='${o.id}' and topic='order.completed'`)).toBe("1");
  expect(sql(`select verified_by='${actor}' and verified_at=completed_at from public.pickup_credentials where order_id='${o.id}'`)).toBe("t");
  expect(await tracking(o, p.guest)).toMatchObject({ order: { status: "completed" }, pickup: null });
  const evidence = sql(`select coalesce(json_agg(t)::text,'') from (select request_fingerprint,result_json from public.operation_requests where store_id='${store}' and request_id='${request}') t`);
  expect(evidence).not.toContain('"pickupCode"'); expect(evidence).not.toContain('"codeProof"');
});
it("pickup: 20 distinct-key concurrent completes make exactly one transition", async () => {
  const p = await paid(), o = await ready(p.order);
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => complete(o, p.code)));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  results.filter(r => r.status === "rejected").forEach(r => expect(r.reason).toMatchObject({ code: "ORDER_ALREADY_COMPLETED" }));
  expect(sql(`select count(*) from public.order_events where order_id='${o.id}' and event_type='order.completed'`)).toBe("1");
});
it("pickup: replay belongs to the initiating owner and rechecks current membership", async () => {
  const p = await paid(), o = await ready(p.order), requestId = randomUUID();
  const input = { requestId, expectedVersion: o.version, type: "takeaway" as const, pickupCode: p.code };
  const completed = await completeOwnerOrder(owner, o.id, input);
  await expect(completeOwnerOrder(secondOwner, o.id, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  sql(`delete from public.owner_members where store_id='${store}' and auth_user_id='${actor}'`);
  try { await expect(completeOwnerOrder(owner, o.id, input)).rejects.toMatchObject({ code: "FORBIDDEN" }); }
  finally { sql(`insert into public.owner_members(store_id,auth_user_id) values('${store}','${actor}')`); }
  expect(await completeOwnerOrder(owner, o.id, input)).toEqual(completed);
});
it("pickup: correct code cannot bypass accepted/preparing/review/version/type/store checks", async () => {
  const p = await paid();
  await expect(complete(p.order, p.code)).rejects.toMatchObject({ code: "PICKUP_NOT_ALLOWED" });
  const o = await ready(p.order);
  // Deferred guards reject either half of completion outside the transaction.
  expect(() => sql(`update public.orders set status='completed' where id='${o.id}'`)).toThrow();
  expect(() => sql(`update public.pickup_credentials set verified_at=clock_timestamp(),verified_by='${actor}',completed_at=clock_timestamp() where order_id='${o.id}'`)).toThrow();
  expect(() => sql(`update public.pickup_credentials set code_hash='${"b".repeat(64)}' where order_id='${o.id}'`)).toThrow();
  expect(() => sql(`delete from public.pickup_credentials where order_id='${o.id}'`)).toThrow();
  const preparing = await paid();
  const claimed = await claimNextOrder(owner, { requestId: randomUUID() }); expect(claimed?.id).toBe(preparing.order.id);
  await expect(complete(claimed!, preparing.code)).rejects.toMatchObject({ code: "PICKUP_NOT_ALLOWED" });
  await expect(complete({ ...o, version: o.version - 1 }, p.code)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  sql(`update public.payment_intents set needs_reconciliation=true where order_id='${o.id}'`);
  try {
    expect((await tracking(o, p.guest)).pickup).toBeNull();
    await expect(complete(o, p.code)).rejects.toMatchObject({ code: "PICKUP_NOT_ALLOWED" });
  } finally { sql(`update public.payment_intents set needs_reconciliation=false where order_id='${o.id}'`); }
  await expect(completeOwnerOrder(owner, o.id, { requestId: randomUUID(), expectedVersion: o.version, type: "dine_in" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  await expect(completeOwnerOrder({ storeId: randomUUID(), authUserId: actor }, o.id,
    { requestId: randomUUID(), expectedVersion: o.version, type: "takeaway", pickupCode: p.code })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(state(o)).toBe("ready");
});
it("pickup: five wrong attempts lock order15min; failed key replay does not count twice; correct code cannot bypass lock", async () => {
  const p = await paid(), o = await ready(p.order), wrong = p.code === "000000" ? "000001" : "000000", request = randomUUID();
  for (let n = 0; n < 5; n++) await expect(complete(o, wrong, n === 0 ? request : randomUUID())).rejects.toMatchObject({ code: "INVALID_PICKUP_CODE" });
  await expect(complete(o, wrong, request)).rejects.toMatchObject({ code: "INVALID_PICKUP_CODE" });
  expect(sql(`select failed_attempts from public.pickup_credentials where order_id='${o.id}'`)).toBe("5");
  for (let n = 5; n < 12; n++) await expect(complete(o, wrong)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(sql(`select failed_attempts from public.pickup_credentials where order_id='${o.id}'`)).toBe("5");
  await expect(complete(o, p.code)).rejects.toMatchObject({ code: "RATE_LIMITED", details: { retryAfterSeconds: expect.any(Number) } });
  expect(state(o)).toBe("ready");
  expect(sql(`select count(*) from public.order_events where order_id='${o.id}' and event_type='order.completed'`)).toBe("0");
  sql(`update public.pickup_credentials set locked_until=clock_timestamp()-interval '1 second',window_started_at=clock_timestamp()-interval '16 minutes' where order_id='${o.id}'`);
  expect((await complete(o, p.code)).status).toBe("completed");
});
it("pickup: owner limiter spans orders and returns429 without consuming credentials", async () => {
  const fixtures = await Promise.all(Array.from({ length: 3 }, () => paid()));
  const orders: OrderDetail[] = [];
  for (const p of fixtures.sort((a, b) => a.order.ticketNo! - b.order.ticketNo!)) orders.push(await ready(p.order));
  for (let n = 0; n < 10; n++) {
    const idx = n % 3, wrong = fixtures[idx].code === "000000" ? "000001" : "000000";
    await expect(complete(orders[idx], wrong)).rejects.toMatchObject({ code: "INVALID_PICKUP_CODE" });
  }
  await expect(complete(orders[0], fixtures[0].code)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(orders.map(state)).toEqual(["ready", "ready", "ready"]);
});
it("pickup: key outage after durable payment recovers once by trusted worker; GET never creates", async () => {
  const guest = device(), o = await createCustomerOrder(cmd(), guest), body = await webhook(o), keys = process.env.PICKUP_ENCRYPTION_KEYS!;
  vi.stubEnv("PICKUP_ENCRYPTION_KEYS", "{}");
  try { await expect(receivePayosWebhook(body)).rejects.toMatchObject({ code: "PICKUP_CREDENTIAL_UNAVAILABLE" }); }
  finally { vi.stubEnv("PICKUP_ENCRYPTION_KEYS", keys); }
  expect((await tracking(o, guest)).pickup).toBeNull();
  expect(sql(`select count(*) from public.pickup_credentials where order_id='${o.id}'`)).toBe("0");
  const current = (await tracking(o, guest)).order, readyOrder = await ready(current);
  await expect(complete(readyOrder, "000042")).rejects.toMatchObject({ code: "PICKUP_CREDENTIAL_UNAVAILABLE" });
  expect(await recoverPickupCredentials()).toMatchObject({ issued: expect.any(Number) });
  const first = await tracking(o, guest); expect(first.pickup).not.toBeNull();
  await receivePayosWebhook(body); await recoverPickupCredentials();
  expect((await tracking(o, guest)).pickup).toEqual(first.pickup);
});
it("pickup: expired credential and expired browser scope fail closed; no code rotate", async () => {
  const p = await paid(), o = await ready(p.order);
  sql(`begin;set local session_replication_role=replica;update public.pickup_credentials set created_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '1 hour' where order_id='${o.id}';commit;`);
  expect((await tracking(o, p.guest)).pickup).toBeNull();
  await expect(complete(o, p.code)).rejects.toMatchObject({ code: "INVALID_PICKUP_CODE" });
  await ensurePickupCredential(o.id);
  expect((await tracking(o, p.guest)).pickup).toBeNull();
  sql(`update public.guest_browser_contexts set expires_at=clock_timestamp()-interval '1 second' where token_hash='${p.guest.browserHash}'`);
  await expect(tracking(o, p.guest)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
});
it("pickup: fault at outbox rolls back completed/consume/audit/key together and same key then succeeds", async () => {
  const p = await paid(), o = await ready(p.order), request = randomUUID();
  sql(`create function public.pickup_test_failure() returns trigger language plpgsql as $$ begin if new.aggregate_id='${o.id}' and new.topic='order.completed' then raise exception 'TEST ONLY'; end if;return new;end; $$;
    create trigger pickup_test_failure before insert on public.outbox_events for each row execute function public.pickup_test_failure();`);
  try { await expect(complete(o, p.code, request)).rejects.toMatchObject({ code: "INTERNAL_ERROR" }); }
  finally { sql("drop trigger pickup_test_failure on public.outbox_events;drop function public.pickup_test_failure()"); }
  expect(state(o)).toBe("ready");
  expect(sql(`select verified_at is null from public.pickup_credentials where order_id='${o.id}'`)).toBe("t");
  expect(sql(`select count(*) from public.operation_requests where store_id='${store}' and request_id='${request}'`)).toBe("0");
  expect(sql(`select count(*) from public.order_events where order_id='${o.id}' and event_type='order.completed'`)).toBe("0");
  expect((await complete(o, p.code, request)).status).toBe("completed");
});

it("C04: a paid order held for extra payment leaves queue, exposes review, blocks ready and preserves ticket", async () => {
  const p = await paid(), claimed = await claimNextOrder(owner, { requestId: randomUUID() });
  expect(claimed?.id).toBe(p.order.id);
  const extra = await webhook(p.order, { paymentLinkId: p.body.data.paymentLinkId });
  expect(await receivePayosWebhook(extra)).toMatchObject({ outcome: "recorded_exception" });
  const view = await tracking(p.order, p.guest);
  expect(view).toMatchObject({ order: { status: "preparing", ticketNo: p.order.ticketNo, paymentReviewRequired: true,
    payment: { status: "paid", reconciliationRequired: true } }, pickup: null });
  expect((await getOwnerOrders(owner)).orders.some(o => o.id === p.order.id)).toBe(false);
  expect((await getOwnerOrders(owner, { view: "exceptions" })).orders.some(o => o.id === p.order.id)).toBe(true);
  await expect(markOwnerOrderReady(owner, p.order.id, { requestId: randomUUID(), expectedVersion: view.order.version }))
    .rejects.toMatchObject({ code: "PAYMENT_REVIEW_REQUIRED" });
  const unclaimed = await paid();
  await receivePayosWebhook(await webhook(unclaimed.order, { paymentLinkId: unclaimed.body.data.paymentLinkId }));
  const eligible = await paid();
  expect((await claimNextOrder(owner, { requestId: randomUUID() }))?.id).toBe(eligible.order.id);
  expect(sql(`select count(*) from public.order_events where order_id='${p.order.id}' and event_type='payment.review_required'`)).toBe("1");
  await receivePayosWebhook(extra);
  expect(sql(`select count(*) from public.order_events where order_id='${p.order.id}' and event_type='payment.review_required'`)).toBe("1");
});
it("C04: provisional provider PAID observation is cleared by authoritative verified payment", async () => {
  const guest = device(), o = await createCustomerOrder(cmd(), guest);
  await paymentRpc("p4_payment_execute", { action: "observe", input: { intentId: intent(o), channelHash: hashSecret("TEST_ONLY_CLIENT"), status: "PAID" } });
  await receivePayosWebhook(await webhook(o));
  expect(await tracking(o, guest)).toMatchObject({ order: { status: "accepted", paymentReviewRequired: false,
    payment: { status: "paid", reconciliationRequired: false } }, pickup: { code: expect.stringMatching(/^[0-9]{6}$/) } });
  // An in-flight provider query can finish after webhook acceptance. It is only
  // provisional evidence and cannot place the now-verified order on hold again.
  await paymentRpc("p4_payment_execute", { action: "observe", input: { intentId: intent(o), channelHash: hashSecret("TEST_ONLY_CLIENT"), status: "PAID" } });
  expect(await tracking(o, guest)).toMatchObject({ order: { paymentReviewRequired: false }, pickup: { code: expect.any(String) } });
});

it("C04: inactive counter, table QR, tampered prices, quantity, availability and foreign options cannot create takeaway", async () => {
  const guest = device(), before = count("orders"), option = randomUUID();
  sql(`update public.qr_codes set active=false where public_code='${qr}'`);
  try { await expect(createCustomerOrder(cmd(), guest)).rejects.toMatchObject({ code: "INVALID_QR" }); }
  finally { sql(`update public.qr_codes set active=true where public_code='${qr}'`); }
  await expect(createCustomerOrder(cmd({ qrCode: tableQr }), guest)).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
  await expect(createCustomerOrder({ ...cmd(), totalVnd: 1 } as CreateOrderV1Input, guest)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(createCustomerOrder(cmd({ items: [{ menuItemId: item, quantity: 100, optionIds: [], note: null }] }), guest)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(createCustomerOrder(cmd({ items: [{ menuItemId: item, quantity: 1, optionIds: [randomUUID()], note: null }] }), guest)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  sql(`update public.menu_items set available=false where id='${item}'`);
  try { await expect(createCustomerOrder(cmd(), guest)).rejects.toMatchObject({ code: "OUT_OF_STOCK" }); }
  finally { sql(`update public.menu_items set available=true where id='${item}'`); }
  expect(count("orders")).toBe(before);
  sql(`insert into public.menu_item_options(id,store_id,item_id,name,price_delta_vnd) values('${option}','${store}','${item}','Extra',7000)`);
  const order = await createCustomerOrder(cmd({ items: [{ menuItemId: item, quantity: 3, optionIds: [option], note: null }] }), guest);
  expect(order).toMatchObject({ type: "takeaway", totalVnd: 126000, itemCount: 3, ticketNo: null });
});

it("C04: faults before ledger and before/after acceptance outbox leave no partial commit and retry safely", async () => {
  for (const point of ["ledger", "before_outbox", "after_outbox"]) {
    const guest = device(), order = await createCustomerOrder(cmd(), guest), body = await webhook(order);
    const relation = point === "ledger" ? "payments" : "outbox_events";
    const condition = point === "ledger" ? `new.intent_id='${intent(order)}'` : `new.aggregate_id='${order.id}' and new.topic='order.accepted'`;
    sql(`create function public.c04_test_failure() returns trigger language plpgsql as $$ begin if ${condition} then raise exception 'TEST ONLY';end if;return new;end; $$;
      create trigger c04_test_failure ${point === "after_outbox" ? "after" : "before"} insert on public.${relation} for each row execute function public.c04_test_failure();`);
    try { await expect(receivePayosWebhook(body)).rejects.toMatchObject({ code: "INTERNAL_ERROR" }); }
    finally { sql(`drop trigger c04_test_failure on public.${relation};drop function public.c04_test_failure();`); }
    expect(sql(`select count(*) from public.payments where intent_id='${intent(order)}'`)).toBe("0");
    expect(sql(`select count(*) from public.outbox_events where (aggregate_id='${order.id}' and topic='order.accepted') or (aggregate_id='${intent(order)}' and topic='payment.updated')`)).toBe("0");
    expect(sql(`select count(*) from public.order_events where order_id='${order.id}' and event_type='order.accepted'`)).toBe("0");
    expect(await getTakeawayOrder(order.id, guest, false)).toMatchObject({ status: "pending_payment", ticketNo: null });
    expect(await receivePayosWebhook(body)).toMatchObject({ outcome: "accepted" });
    expect(sql(`select count(*) from public.payments where intent_id='${intent(order)}'`)).toBe("1");
  }
});

it("C04: 100 simultaneous mixed real DB acceptances share unique ordered tickets (LOCAL ONLY)", async () => {
  const fixtures = [];
  for (let n = 0; n < 50; n++) {
    const guest = device(), command = cmd(), pending = await createCustomerOrder(command, guest);
    fixtures.push({ guest, command: cmd({ qrCode: tableQr }), pending, event: await webhook(pending) });
  }
  sql(`insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at) values
    ${fixtures.map(f => `('${store}','${session}','${hashSecret(`${f.guest.grantProof}:${session}`)}','${f.guest.browserHash}',clock_timestamp()+interval '6 hours')`).join(",")}`);
  const counterBefore = Number(sql(`select last_ticket from public.ticket_counters where store_id='${store}'`));
  const latencies: number[] = [], ids = fixtures.map(f => f.pending.id);
  const started = performance.now();
  const actions = fixtures.flatMap(f => [async () => {
    expect(await receivePayosWebhook(f.event)).toMatchObject({ outcome: "accepted" });
  }, async () => { ids.push((await createDineInOrder(f.command, f.guest)).id); }]);
  const results = await Promise.allSettled(actions.map(async action => {
    const start = performance.now(); try { await action(); } finally { latencies.push(performance.now() - start); }
  }));
  const durationMs = performance.now() - started;
  const failures = results.filter(r => r.status === "rejected");
  const metrics = { environment: "LOCAL_ONLY Docker PostgreSQL + PostgREST + Node22, signed TEST ONLY payOS fixtures; no provider IO",
    concurrency: 100, dineIn: 50, takeaway: 50, attempts: 100, successes: results.length - failures.length,
    errors: failures.length, applicationRetries: 0, durationMs: Math.round(durationMs),
    p50Ms: 0, p95Ms: 0, failedInbox: Number(sql(`select count(*) from public.payment_webhook_inbox where state='failed' and event->>'reference' in(select provider_reference from public.payment_intents where order_id in('${fixtures.map(f => f.pending.id).join("','")}'))`)) };
  latencies.sort((a, b) => a - b);
  metrics.p50Ms = Math.round(latencies[49]); metrics.p95Ms = Math.round(latencies[94]);
  mkdirSync("docs/handoffs/evidence", { recursive: true });
  writeFileSync("docs/handoffs/evidence/P4_C04_LOCAL_STRESS.json", JSON.stringify(metrics, null, 2) + "\n");
  expect(failures).toHaveLength(0); expect(metrics.failedInbox).toBe(0);
  expect(Number(sql(`select last_ticket from public.ticket_counters where store_id='${store}'`))).toBe(counterBefore + 100);
  const rows = JSON.parse(sql(`select json_agg(t) from (select type,ticket_no,accepted_at from public.orders where id in('${ids.join("','")}') order by accepted_at,ticket_no) t`));
  expect(rows).toHaveLength(100);
  expect(rows.map((r: { ticket_no: number }) => r.ticket_no)).toEqual(Array.from({ length: 100 }, (_, n) => counterBefore + n + 1));
  expect(sql(`select count(*) from public.payments where intent_id in(select id from public.payment_intents where order_id in('${ids.join("','")}'))`)).toBe("50");
  for (const relation of ["order_events", "outbox_events"]) {
    const idColumn = relation === "order_events" ? "order_id" : "aggregate_id", topicColumn = relation === "order_events" ? "event_type" : "topic";
    expect(sql(`select count(*) from public.${relation} where ${idColumn} in('${ids.join("','")}') and ${topicColumn}='order.accepted'`)).toBe("100");
  }
}, 120000);
