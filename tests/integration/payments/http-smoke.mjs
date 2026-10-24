/** TEST ONLY: real Next HTTP + local PostgreSQL; signed fixtures, no provider IO. */
// Run after DB integration tests, never concurrently with their failed receipts.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PayOS } from "@payos/node";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(status.API_URL, "http://127.0.0.1:15421");
const sql = input => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const base = "http://localhost:13010", store = randomUUID(), qr = randomUUID(), item = randomUUID(), category = randomUUID();
const token = randomBytes(32).toString("base64url"), hash = s => createHash("sha256").update(s).digest("hex"), browserHash = hash(token), grantProof = hash(`qr-guest-grant-v1:${token}`);
const checksumKey = "TEST_ONLY_HTTP_CHECKSUM_NOT_REAL", account = "12345678", clientId = "TEST_ONLY_HTTP_CLIENT";
const sdk = new PayOS({ clientId, apiKey: "TEST_ONLY_HTTP_API", checksumKey, logLevel: "off" });
const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const env = { ...process.env, OWNER_BOOTSTRAP_ENABLED: "false", APP_ORIGIN: base,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  TABLE_SESSION_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), TABLE_SESSION_ACTIVE_KEY_ID: "v1",
  TABLE_PIN_HMAC_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), TABLE_PIN_ACTIVE_HMAC_KEY_ID: "v1",
  PICKUP_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), PICKUP_ACTIVE_ENCRYPTION_KEY_ID: "v1",
  PICKUP_HMAC_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), PICKUP_ACTIVE_HMAC_KEY_ID: "v1",
  PAYOS_STORE_ID: store, PAYOS_CLIENT_ID: clientId, PAYOS_API_KEY: "TEST_ONLY_HTTP_API", PAYOS_CHECKSUM_KEY: checksumKey,
  PAYOS_ACCOUNT_NUMBER: account, PAYMENT_RETURN_ORIGIN: "https://test.invalid", PAYMENT_RECONCILE_SECRET: "TEST_ONLY_RECONCILE_SECRET_NEVER_USE_REAL" };
const protectedValues = [status.SERVICE_ROLE_KEY, status.ANON_KEY, token, checksumKey, env.PAYOS_API_KEY, env.PAYMENT_RECONCILE_SECRET, account];
let server, logs = "", order, user, foreignUser;
const foreignStore = randomUUID();
const ownerCookies = [];
const correlationIds = new Set();
async function ownerSession(storeId) {
  const email = `${randomUUID()}@example.invalid`, password = randomUUID() + "aA!9";
  protectedValues.push(email, password);
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data.user);
  const id = created.data.user.id;
  if (storeId === store) user = id; else foreignUser = id;
  sql(`insert into public.owner_members(store_id,auth_user_id) values('${storeId}','${id}')`);
  const auth = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await auth.auth.signInWithPassword({ email, password }); assert(!signed.error && signed.data.session);
  protectedValues.push(signed.data.session.access_token, signed.data.session.refresh_token);
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(signed.data.session)).toString("base64url")}`;
  ownerCookies.push(cookie); return cookie;
}
async function call(path, { body, guest = false, method = body ? "POST" : "GET", headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", "X-Request-Id": "TEST_ONLY_UNTRUSTED_HEADER", ...(guest ? { cookie: `__Host-qr_guest=${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const correlationId = response.headers.get("X-Request-Id"); assert.match(correlationId, /^[a-f0-9-]{36}$/);
  assert(!correlationIds.has(correlationId)); correlationIds.add(correlationId);
  return response;
}
async function paymentEvent(extra = {}) {
  const reference = sql(`select provider_reference from public.payment_intents where order_id='${order.id}'`);
  const data = { orderCode: Number(reference), amount: order.totalVnd, description: "QR ORDER", accountNumber: account, reference: randomUUID(),
    transactionDateTime: sql("select to_char(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS')"), currency: "VND", paymentLinkId: randomBytes(16).toString("hex"), code: "00", desc: "success", ...extra };
  return { code: "00", success: true, data, signature: await sdk.crypto.createSignatureFromObj(data, checksumKey) };
}
try {
  let occupied = false; try { await fetch(base, { signal: AbortSignal.timeout(300) }); occupied = true; } catch {}
  assert(!occupied, "Test port occupied; preserving existing process");
  // NEXT_PUBLIC_ values are inlined at build time. Always compile against the
  // same loopback-only test env, never reuse a build made with .env.local.
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", () => {}); child.stderr.on("data", () => {});
    child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(Error("Local payment HTTP build failed")));
  });
  sql(`insert into public.stores(id,name) values('${store}','P4 HTTP TEST ONLY');insert into public.qr_codes(store_id,type,public_code) values('${store}','takeaway','${qr}');
    insert into public.menu_categories(id,store_id,name) values('${category}','${store}','Menu');insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${store}','${category}','Coffee',35000);
    insert into public.guest_browser_contexts(token_hash) values('${browserHash}');`);
  sql(`insert into public.stores(id,name) values('${foreignStore}','P4 HTTP FOREIGN TEST ONLY')`);
  const ownerCookie = await ownerSession(store), foreignCookie = await ownerSession(foreignStore);
  const command = { qrCode: qr, clientRequestId: randomUUID(), menuRevision: sql(`select menu_revision from public.stores where id='${store}'`), items: [{ menuItemId: item, quantity: 2, optionIds: [], note: null }], note: null };
  // Seed the pending command through the real RPC so no HTTP after() task calls a provider.
  const seeded = await db.rpc("p4_checkout", { input: { command, browserHash, grantProof, channelHash: hash(clientId), accountNumber: account, configuredStoreId: store } });
  assert.equal(seeded.error, null); assert(seeded.data?.data); order = seeded.data.data;
  assert.equal(order.status, "pending_payment"); assert.equal(order.ticketNo, null);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname=127.0.0.1", "--port=13010"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", b => { logs += b; }); server.stderr.on("data", b => { logs += b; });
  for (let i = 0;; i++) { try { await fetch(base, { signal: AbortSignal.timeout(700) }); break; } catch { assert(i < 60 && server.exitCode === null); await new Promise(r => setTimeout(r, 150)); } }
  const intentId = order.payment.intentId;
  assert.equal((await call(`/api/public/payments/${intentId}`)).status, 401);
  assert.equal((await call(`/api/public/payments/${intentId}`, { headers: { cookie: `__Host-qr_guest=${randomBytes(32).toString("base64url")}` } })).status, 404);
  let response = await call(`/api/public/payments/${intentId}`, { guest: true });
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/); assert.equal((await response.json()).data.status, "pending");
  assert.equal((await call(`/api/public/orders/${order.id}`)).status, 401);
  assert.equal((await call(`/api/public/orders/${order.id}`, { headers: { cookie: `__Host-qr_guest=${randomBytes(32).toString("base64url")}` } })).status, 404);
  response = await call(`/api/public/orders/${order.id}?includePickup=true`, { guest: true });
  assert.equal(response.status, 200); assert.equal((await response.json()).data.pickup, null);
  assert.equal((await call("/api/webhooks/payments/sepay", { body: {} })).status, 404);
  const body = await paymentEvent();
  assert.equal((await call("/api/webhooks/payments/payos", { body: { ...body, signature: "a".repeat(64) } })).status, 401);
  assert.equal((await call("/api/webhooks/payments/payos", { body: "x".repeat(4097) })).status, 400);
  assert.equal(sql(`select count(*) from public.payment_webhook_inbox where event->>'reference'='${body.data.orderCode}'`), "0");
  assert.equal((await call("/api/internal/payments/reconcile", { method: "POST" })).status, 401);
  const acks = await Promise.all(Array.from({ length: 20 }, () => call("/api/webhooks/payments/payos", { body })));
  for (const ack of acks) { assert.equal(ack.status, 200); assert.deepEqual(await ack.json(), { code: "00", desc: "success" }); }
  assert.equal(sql(`select count(*) from public.payments where store_id='${store}'`), "1");
  assert.equal(sql(`select last_ticket from public.ticket_counters where store_id='${store}'`), "1");
  const tracked = (await (await call(`/api/public/orders/${order.id}`, { guest: true })).json()).data;
  assert.equal(tracked.status, "accepted"); assert.equal(tracked.paymentStatus, "paid"); assert.equal(tracked.ticketNo, 1);
  const paid = (await (await call(`/api/public/payments/${intentId}`, { guest: true })).json()).data;
  assert.equal(paid.status, "paid"); assert.equal(paid.intentStatus, "succeeded"); assert(!("qrPayload" in paid));
  response = await call("/api/internal/payments/reconcile", { method: "POST", headers: { authorization: `Bearer ${env.PAYMENT_RECONCILE_SECRET}` } });
  assert.equal(response.status, 200);
  const ownerCall = (path, body, cookie = ownerCookie, origin = base) => call(path, { body, method: body ? "POST" : "GET", headers: { cookie, origin } });
  const completePath = `/api/owner/orders/${order.id}/complete`;
  response = await call(`/api/public/orders/${order.id}?includePickup=true`, { guest: true });
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /private.*no-store/);
  const privateView = (await response.json()).data, code = privateView.pickup.code; assert.match(code, /^[0-9]{6}$/); protectedValues.push(code);
  assert.equal((await call(`/api/public/orders/${order.id}?includePickup=true`)).status, 401);
  assert.equal((await call(`/api/public/orders/${order.id}?includePickup=true`, { headers: { cookie: `__Host-qr_guest=${randomBytes(32).toString("base64url")}` } })).status, 404);
  assert.equal(JSON.stringify(tracked).includes('"pickup"'), false);
  const commandComplete = { requestId: randomUUID(), expectedVersion: privateView.order.version, type: "takeaway", pickupCode: code };
  assert.equal((await call(completePath, { body: commandComplete, headers: { origin: base } })).status, 401);
  assert.equal((await ownerCall(completePath, commandComplete, foreignCookie)).status, 404);
  assert.equal((await ownerCall(completePath, commandComplete, ownerCookie, "https://foreign.invalid")).status, 403);
  assert.equal((await ownerCall(completePath, { ...commandComplete, pickupCode: "12345" })).status, 400);
  response = await ownerCall(completePath, commandComplete); assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "PICKUP_NOT_ALLOWED");
  const list = await ownerCall("/api/owner/orders?orderId=" + order.id); assert.equal(list.status, 200);
  assert(!/pickupCode|code_ciphertext|code_hash/.test(JSON.stringify(await list.json())));
  response = await ownerCall("/api/owner/queue/claim-next", { requestId: randomUUID() }); assert.equal(response.status, 200);
  const claimed = (await response.json()).data; assert.equal(claimed.id, order.id);
  response = await ownerCall(`/api/owner/orders/${order.id}/ready`, { requestId: randomUUID(), expectedVersion: claimed.version }); assert.equal(response.status, 200);
  const ready = (await response.json()).data, wrong = code === "000000" ? "000001" : "000000";
  const cmd = { ...commandComplete, requestId: randomUUID(), expectedVersion: ready.version };
  response = await ownerCall(completePath, { ...cmd, requestId: randomUUID(), pickupCode: wrong }); assert.equal(response.status, 422); assert.equal((await response.json()).error.code, "INVALID_PICKUP_CODE");
  // Treat the first successful response as lost, then replay the exact command.
  const completedResponses = await Promise.all(Array.from({ length: 20 }, () => ownerCall(completePath, cmd)));
  const completed = [];
  for (const res of completedResponses) { assert.equal(res.status, 200); completed.push((await res.json()).data); }
  completed.forEach(o => assert.deepEqual(o, completed[0])); assert.equal(completed[0].status, "completed"); assert.equal(completed[0].fulfillmentStatus, "collected");
  response = await ownerCall(completePath, cmd); assert.equal(response.status, 200); assert.deepEqual((await response.json()).data, completed[0]);
  response = await ownerCall(completePath, { ...cmd, pickupCode: wrong }); assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "DUPLICATE_REQUEST_CONFLICT");
  response = await ownerCall(completePath, { ...cmd, requestId: randomUUID() }); assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "ORDER_ALREADY_COMPLETED");
  const finalView = (await (await call(`/api/public/orders/${order.id}?includePickup=true`, { guest: true })).json()).data;
  assert.equal(finalView.order.status, "completed"); assert.equal(finalView.pickup, null);
  assert.equal(sql(`select count(*) from public.order_events where order_id='${order.id}' and event_type='order.completed'`), "1");
  assert.equal(sql(`select count(*) from public.outbox_events where aggregate_id='${order.id}' and topic='order.completed'`), "1");
  const committed = JSON.parse(sql(`select json_build_object('ledgerCount',(select count(*) from public.payments where intent_id='${intentId}'),
    'acceptanceCount',(select count(*) from public.order_events where order_id='${order.id}' and event_type='order.accepted'),
    'completionAuditCount',(select count(*) from public.order_events where order_id='${order.id}' and event_type='order.completed'),
    'completionOutboxCount',(select count(*) from public.outbox_events where aggregate_id='${order.id}' and topic='order.completed'),
    'pickupConsumed',(select verified_at is not null and verified_at=completed_at and verified_by='${user}' from public.pickup_credentials where order_id='${order.id}'))`));
  assert.deepEqual(committed, { ledgerCount: 1, acceptanceCount: 1, completionAuditCount: 1, completionOutboxCount: 1, pickupConsumed: true });
  const trace = { environment: "LOCAL_ONLY Next production build + PostgreSQL; signed TEST ONLY fixture webhook; no provider IO",
    orderAlias: "local-takeaway-A", intentAlias: "local-intent-A", providerE2E: "BLOCKED_PROVIDER_E2E",
    steps: [order, tracked, claimed, ready, completed[0]].map(o => ({ status: o.status, paymentStatus: o.paymentStatus, ticketNo: o.ticketNo, version: o.version, acceptedAt: o.acceptedAt })), committed };
  mkdirSync("docs/handoffs/evidence", { recursive: true });
  writeFileSync("docs/handoffs/evidence/P4_C04_LOCAL_HTTP_TRACE.json", JSON.stringify(trace, null, 2) + "\n");

  // Local-only extra-transaction hold: route serializer, error mapping and FIFO gate.
  const heldSeed = await db.rpc("p4_checkout", { input: { command: { ...command, clientRequestId: randomUUID() }, browserHash, grantProof, channelHash: hash(clientId), accountNumber: account, configuredStoreId: store } });
  assert(!heldSeed.error && heldSeed.data?.data); order = heldSeed.data.data;
  const firstPayment = await paymentEvent();
  assert.equal((await call("/api/webhooks/payments/payos", { body: firstPayment })).status, 200);
  assert.equal((await call("/api/webhooks/payments/payos", { body: await paymentEvent({ paymentLinkId: firstPayment.data.paymentLinkId }) })).status, 200);
  const held = (await (await call(`/api/public/orders/${order.id}?includePickup=true`, { guest: true })).json()).data;
  assert.equal(held.order.paymentReviewRequired, true); assert.equal(held.order.payment.reconciliationRequired, true); assert.equal(held.pickup, null);
  const queue = (await (await ownerCall("/api/owner/orders")).json()).data;
  assert.equal(queue.orders.length, 0); assert.equal(queue.counts.paymentException, 1);
  assert.equal((await (await ownerCall("/api/owner/orders?view=exceptions")).json()).data.orders[0].id, order.id);
  response = await ownerCall(`/api/owner/orders/${order.id}/ready`, { requestId: randomUUID(), expectedVersion: held.order.version });
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "PAYMENT_REVIEW_REQUIRED");
  assert.equal((await (await ownerCall("/api/owner/queue/claim-next", { requestId: randomUUID() })).json()).data, null);
  assert.equal(sql(`select count(*) from public.outbox_events where aggregate_id in(select id from public.orders where store_id='${store}')
    and (payload-array['eventId','aggregateId','version','type']<>'{}'::jsonb or not(payload ?& array['eventId','aggregateId','version','type'])
      or payload->>'eventId'<>id::text or payload->>'aggregateId'<>aggregate_id::text or published_at is not null)`), "0");
  for (const value of protectedValues.filter(Boolean)) assert(!logs.includes(value), "Server log leaked protected fixture value");
  assert(!logs.includes("TEST_ONLY_UNTRUSTED_HEADER"));
  const entries = logs.split(/\r?\n/).filter(l => l.startsWith('{"event":')).map(l => JSON.parse(l));
  assert(entries.some(l => l.event === "api.request" && correlationIds.has(l.correlationId)));
  console.log("PASS payment/pickup HTTP: scoped401/404, CSRF403, validation400, pending/ready gates, wrong422, 20 webhook ACKs -> one ledger/ticket/credential, 20 complete replays -> one audit/outbox, lost response replay, conflicts409, completed guest projection, private logs");
} finally {
  if (server && server.exitCode === null) { server.kill(); await new Promise(r => server.once("exit", r)); }
  sql(`begin;set local session_replication_role=replica;
   delete from public.outbox_events where aggregate_id in(select id from public.orders where store_id='${store}') or aggregate_id in(select id from public.payment_intents where store_id='${store}');
   delete from public.order_events where store_id='${store}';delete from public.payments where store_id='${store}';
   delete from public.pickup_attempt_log where store_id='${store}';delete from public.pickup_credentials where store_id='${store}';delete from public.operation_requests where store_id='${store}';
   delete from public.payment_webhook_inbox where event->>'reference' in(select provider_reference from public.payment_intents where store_id='${store}');
   delete from public.payment_intents where store_id='${store}';delete from public.takeaway_requests where store_id='${store}';
   delete from public.order_items where store_id='${store}';delete from public.orders where store_id='${store}';delete from public.ticket_counters where store_id='${store}';
   delete from public.qr_codes where store_id='${store}';delete from public.menu_items where store_id='${store}';delete from public.menu_categories where store_id='${store}';
   delete from public.owner_members where store_id in('${store}','${foreignStore}');delete from public.stores where id in('${store}','${foreignStore}');delete from public.guest_browser_contexts where token_hash='${browserHash}';commit;`);
  if (user) await db.auth.admin.deleteUser(user);
  if (foreignUser) await db.auth.admin.deleteUser(foreignUser);
  console.log("CLEANUP local payment HTTP fixtures and owned server only");
}
