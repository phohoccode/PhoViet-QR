/** TEST ONLY: loopback Supabase/Auth + real Next HTTP. No provider IO. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(status.API_URL, "http://127.0.0.1:15421");
const sql = input => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const base = "http://localhost:13015", store = randomUUID(), foreign = randomUUID(), table = randomUUID(), code = randomUUID(), category = randomUUID(), item = randomUUID();
let session=randomUUID();
const token = randomBytes(32).toString("base64url"), hash = s => createHash("sha256").update(s).digest("hex"), browserHash = hash(token), grantProof = hash(`qr-guest-grant-v1:${token}`);
const tokenB=randomBytes(32).toString('base64url'), tokenC=randomBytes(32).toString('base64url');
const browsers=[browserHash,hash(tokenB),hash(tokenC)];
const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const env = { ...process.env, OWNER_BOOTSTRAP_ENABLED: "false", APP_ORIGIN: base,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  TABLE_SESSION_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), TABLE_SESSION_ACTIVE_KEY_ID: "v1",
  TABLE_PIN_HMAC_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), TABLE_PIN_ACTIVE_HMAC_KEY_ID: "v1" };
const protectedValues = [status.SERVICE_ROLE_KEY, status.ANON_KEY, token, tokenB, tokenC, grantProof];
const users = []; let server, logs = "", checks = 0;
async function ownerSession(storeId) {
  const email = `${randomUUID()}@example.invalid`, password = randomUUID() + "Aa!9";
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true }); assert(!created.error && created.data.user);
  users.push(created.data.user.id); sql(`insert into public.owner_members(store_id,auth_user_id) values('${storeId}','${created.data.user.id}')`);
  const auth = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await auth.auth.signInWithPassword({ email, password }); assert(!signed.error && signed.data.session);
  protectedValues.push(email, password, signed.data.session.access_token, signed.data.session.refresh_token);
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(signed.data.session)).toString("base64url")}`;
}
async function call(path, { body, cookie, origin = base, method = body === undefined ? "GET" : "POST" } = {}) {
  const response = await fetch(base + path, { method, headers: { accept: "application/json", "content-type": "application/json", ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  assert.match(response.headers.get("cache-control"), /no-store/);
  // PIN/open are legacy routes without the billing trace wrapper.
  if(!/\/(sessions|verify)$/.test(path))assert.match(response.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
  const payload = await response.json();
  if (response.ok) assert.equal(payload.error, null); else assert.equal(payload.data, null);
  checks++; return { status: response.status, payload, retryAfter: response.headers.get("retry-after") };
}
try {
  let occupied = false; try { await fetch(base, { signal: AbortSignal.timeout(300) }); occupied = true; } catch {}
  assert(!occupied, "Test port occupied; preserving existing process");
  await new Promise((resolve, reject) => {
    let output='';
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", b => {output+=b;}); child.stderr.on("data", b => {output+=b;});
    child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(Error('Local billing HTTP build failed: '+protectedValues.filter(Boolean).reduce((s,v)=>s.replaceAll(v,'[redacted]'),output).slice(-4000))));
  });
  sql(`insert into public.stores(id,name) values('${store}','P5 HTTP TEST ONLY'),('${foreign}','P5 FOREIGN');
   insert into public.dining_tables(id,store_id,label) values('${table}','${store}','Bill table');
   insert into public.qr_codes(store_id,type,table_id,public_code) values('${store}','table','${table}','${code}');
   insert into public.menu_categories(id,store_id,name) values('${category}','${store}','Menu');
   insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${store}','${category}','Snapshot',31000);
   insert into public.guest_browser_contexts(token_hash) values('${browsers.join("'),('")}');`);
  const owner = await ownerSession(store), outsider = await ownerSession(foreign), guest = `__Host-qr_guest=${token}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname=127.0.0.1", "--port=13015"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", b => { logs += b; }); server.stderr.on("data", b => { logs += b; });
  for (let i = 0;; i++) { try { await fetch(base, { signal: AbortSignal.timeout(700) }); break; } catch { assert(i < 60 && server.exitCode === null); await new Promise(r => setTimeout(r, 150)); } }
  const opened=await call(`/api/owner/tables/${table}/sessions`,{cookie:owner,body:{requestId:randomUUID()}});
  assert.equal(opened.status,201);session=opened.payload.data.session.id;
  const pin=opened.payload.data.sessionCredential.sessionCode;assert.match(pin,/^\d{6}$/);protectedValues.push(pin);
  const guestB=`__Host-qr_guest=${tokenB}`, guestC=`__Host-qr_guest=${tokenC}`;
  for(const cookie of [guest,guestB])assert.equal((await call('/api/public/table-sessions/verify',{cookie,body:{qrCode:code,sessionCode:pin}})).status,200);
  const guestBill = `/api/public/table-sessions/current/bill?qrCode=${code}`, ownerBill = `/api/owner/table-sessions/${session}/bill`, settle = `/api/owner/table-sessions/${session}/settle`;
  assert.equal((await call(guestBill)).status, 401);
  assert.equal((await call(guestBill, { cookie: `__Host-qr_guest=${randomBytes(32).toString("base64url")}` })).status, 401);
  assert.equal((await call(guestBill + `&sessionId=${randomUUID()}`, { cookie: guest })).status, 403);
  assert.equal((await call(guestBill + `&qrCode=${code}`, { cookie: guest })).status, 400);
  assert.equal((await call(ownerBill)).status, 401);
  assert.equal((await call(ownerBill, { cookie: outsider })).status, 404);
  assert.equal((await call(settle, { cookie: guest, body: {} })).status, 401);
  assert.equal((await call(settle, { cookie: owner, origin: "https://evil.invalid", body: {} })).status, 403);
  assert.equal((await call(settle, { cookie: owner, origin: null, body: {} })).status, 403);
  assert.equal((await call(settle, { cookie: owner, body: { action: "confirm_received", requestId: randomUUID(), expectedVersion: 1, paymentMethod: "payos" } })).status, 400);
  const command = () => ({ qrCode: code, clientRequestId: randomUUID(), menuRevision: sql(`select menu_revision from public.stores where id='${store}'`), items: [{ menuItemId: item, quantity: 2, optionIds: [], note: null }], note: null });
  for (let n = 0; n < 3; n++) assert.equal((await call("/api/public/orders", { cookie: n===1?guestB:guest, body: command() })).status, 201);
  let bill = (await call(ownerBill, { cookie: owner })).payload.data;
  assert.equal(bill.totalVnd, 186000); assert.deepEqual(bill.orders.map(o => o.ticketNo), [1, 2, 3]);
  const publicBill = (await call(guestBill, { cookie: guest })).payload.data; assert.deepEqual(publicBill, bill);
  assert.deepEqual((await call(`/api/public/table-sessions/bill?qrCode=${code}`, { cookie: guest })).payload.data, bill);
  for (const secret of [...protectedValues, ...users]) assert(!JSON.stringify(publicBill).includes(secret));
  const begin = b => ({ action: "begin_checkout", requestId: randomUUID(), expectedVersion: b.session.version, expectedBillVersion: b.billVersion });
  let prepared = await call(settle, { cookie: owner, body: begin(bill) }); assert.equal(prepared.status, 200); bill = prepared.payload.data.bill;
  const receiptPath=`/api/public/table-sessions/${session}/receipt`;
  assert.equal((await call(receiptPath,{cookie:guest})).payload.error.code,'RECEIPT_NOT_READY');
  assert.equal((await call("/api/public/orders", { cookie: guest, body: command() })).payload.error.code, "SESSION_CHECKOUT_PENDING");
  const confirm = b => ({ action: "confirm_received", requestId: randomUUID(), expectedVersion: b.session.version, expectedBillVersion: b.billVersion, paymentMethod: "bank_transfer", receivedConfirmed: true });
  assert.equal((await call(settle, { cookie: owner, body: confirm(bill) })).payload.error.code, "SESSION_ORDERS_OUTSTANDING");
  let cancelled = await call(settle, { cookie: owner, body: { action: "cancel_checkout", requestId: randomUUID(), expectedVersion: bill.session.version } }); assert.equal(cancelled.payload.data.bill.session.status, "open");
  assert.equal((await call("/api/public/orders", { cookie: guest, body: command() })).status, 201);
  bill = (await call(ownerBill, { cookie: owner })).payload.data;
  prepared = await call(settle, { cookie: owner, body: begin(bill) }); assert.equal(prepared.status, 200); bill = prepared.payload.data.bill;
  for (let n = 0; n < 4; n++) {
    const claimed = (await call("/api/owner/queue/claim-next", { cookie: owner, body: { requestId: randomUUID() } })).payload.data;
    const ready = (await call(`/api/owner/orders/${claimed.id}/ready`, { cookie: owner, body: { requestId: randomUUID(), expectedVersion: claimed.version } })).payload.data;
    assert.equal((await call(`/api/owner/orders/${claimed.id}/complete`, { cookie: owner, body: { requestId: randomUUID(), expectedVersion: ready.version, type: "dine_in" } })).status, 200);
  }
  bill = (await call(ownerBill, { cookie: owner })).payload.data; assert.equal(bill.canSettle, true); assert.equal(bill.outstandingOrders, 0);
  const input = confirm(bill);
  assert.equal((await call(settle, { cookie: owner, body: { ...input, receivedConfirmed: false } })).status, 400);
  assert.equal((await call(settle, { cookie: owner, body: { ...input, expectedBillVersion: "0".repeat(32) } })).payload.error.code, "BILL_CHANGED");
  // Local fault fixtures affect this isolated owner/session only. Preserve the
  // command key through a rate limit, a rolled-back 500 and the eventual success.
  const bucket = hash(`owner:${users[0]}:write`);
  sql(`insert into public.security_rate_buckets(key_hash,attempts,resets_at) values('${bucket}',30,clock_timestamp()+interval '1 minute')
    on conflict(key_hash) do update set attempts=30,resets_at=excluded.resets_at`);
  const limited = await call(settle, { cookie: owner, body: input });
  assert.equal(limited.status, 429); assert.equal(limited.payload.error.code, "RATE_LIMITED");
  assert(Number(limited.retryAfter) > 0);
  assert.equal(sql(`select count(*) from public.session_settlements where table_session_id='${session}'`), "0");
  sql(`delete from public.security_rate_buckets where key_hash='${bucket}'`);
  const fault = `p5_http_${randomUUID().replaceAll("-", "")}`;
  sql(`create function public.${fault}() returns trigger language plpgsql as $$begin
    if new.aggregate_id='${session}' and new.topic='table_session.closed' then raise exception 'TEST ONLY';end if;return new;end;$$;
    create trigger ${fault} before insert on public.outbox_events for each row execute function public.${fault}();`);
  try {
    const failed = await call(settle, { cookie: owner, body: input });
    assert.equal(failed.status, 500); assert.equal(failed.payload.error.code, "INTERNAL_ERROR");
    assert.equal(sql(`select count(*) from public.session_settlements where table_session_id='${session}'`), "0");
    assert.equal((await call(ownerBill, { cookie: owner })).payload.data.session.status, "checkout_pending");
    assert.equal(sql(`select bool_and(revoked_at is null) from public.guest_access where scope_id='${session}'`), "t");
    assert.equal(sql(`select count(*) from public.session_receipts where table_session_id='${session}'`),'0');
    assert.equal(sql(`select count(*) from public.session_receipt_access where table_session_id='${session}'`),'0');
  } finally { sql(`drop trigger ${fault} on public.outbox_events;drop function public.${fault}();`); }
  const responses = await Promise.all([call(settle, { cookie: owner, body: input }), call(settle, { cookie: owner, body: input })]);
  assert.equal(responses[0].status, 200); assert.deepEqual(responses[1].payload, responses[0].payload);
  // Treat first response as lost; a same-key retry must return the stored result.
  assert.deepEqual((await call(settle, { cookie: owner, body: input })).payload, responses[0].payload);
  assert.equal((await call(settle, { cookie: owner, body: { ...input, requestId: randomUUID() } })).status, 409);
  const final = (await call(ownerBill, { cookie: owner })).payload.data;
  assert.equal(final.session.status, "closed"); assert.equal(final.session.paymentStatus, "paid"); assert.equal(final.totalVnd, 248000);
  assert(final.orders.every(o => o.paymentStatus === "paid" && o.payment.status === "paid"));
  const receiptResponse=await call(guestBill,{cookie:guest});assert.equal(receiptResponse.status,200);
  const receipt=receiptResponse.payload.data;
  assert.equal(receipt.kind,'paid_receipt');assert.equal(receipt.totalVnd,248000);assert.equal(receipt.session.status,'closed');
  assert.equal(receipt.session.paymentStatus,'paid');assert.equal(receipt.paymentMethod,'bank_transfer');assert(receipt.settledAt);
  assert.equal(receipt.canAcceptMoreOrders,false);assert.equal(receipt.currency,'VND');
  for(const cookie of [guest,guestB])assert.deepEqual((await call(receiptPath,{cookie})).payload.data,receipt);
  assert.deepEqual((await call(`/api/owner/table-sessions/${session}/receipt`,{cookie:owner})).payload.data,receipt);
  assert.equal((await call(receiptPath,{cookie:guestC})).payload.error.code,'RECEIPT_ACCESS_DENIED');
  assert.equal((await call(receiptPath)).status,401);
  assert.equal((await call(`/api/public/table-sessions/${randomUUID()}/receipt`,{cookie:guest})).payload.error.code,'RECEIPT_ACCESS_DENIED');
  assert.equal((await call('/api/public/table-sessions/verify',{cookie:guestC,body:{qrCode:code,sessionCode:pin}})).status,410);
  assert.equal((await call("/api/public/orders", { cookie: guest, body: command() })).status, 410);
  assert.equal(sql(`select count(*) from public.session_settlements where table_session_id='${session}'`), "1");
  assert.equal(sql(`select count(*) from public.outbox_events where aggregate_id='${session}' and topic='table_session.closed' and published_at is null`), "1");
  const reopened=await call(`/api/owner/tables/${table}/sessions`,{cookie:owner,body:{requestId:randomUUID()}});
  assert.equal(reopened.status,201);const fresh=reopened.payload.data.session.id;
  const nextPin=reopened.payload.data.sessionCredential.sessionCode;protectedValues.push(nextPin);
  assert.equal((await call('/api/public/table-sessions/verify',{cookie:guestC,body:{qrCode:code,sessionCode:nextPin}})).status,200);
  assert.equal((await call(guestBill,{cookie:guestC})).payload.data.session.id,fresh);
  assert.deepEqual((await call(guestBill,{cookie:guest})).payload.data,receipt);
  assert.equal((await call(guestBill+`&sessionId=${fresh}`,{cookie:guest})).payload.error.code,'RECEIPT_ACCESS_DENIED');
  assert.equal((await call(receiptPath,{cookie:guestC})).payload.error.code,'RECEIPT_ACCESS_DENIED');
  sql(`update public.session_receipt_access set revoked_at=clock_timestamp() where table_session_id='${session}' and browser_context_hash='${browserHash}';
   update public.session_receipt_access set expires_at=clock_timestamp()-interval '1 second' where table_session_id='${session}' and browser_context_hash='${hash(tokenB)}'`);
  assert.equal((await call(receiptPath,{cookie:guest})).payload.error.code,'RECEIPT_ACCESS_DENIED');
  assert.equal((await call(receiptPath,{cookie:guestB})).payload.error.code,'RECEIPT_EXPIRED');
  for (const secret of protectedValues) if (secret) assert(!logs.includes(secret), "Sensitive value in server logs");
  const evidence = { scope: "loopback PostgreSQL + Supabase Auth + Next production HTTP", checks, status: "PASS", orders: 4, successfulSettlements: 1, totalVnd: final.totalVnd,
    recovery: ["429 with Retry-After and zero ledger", "500 with full rollback", "same-key retry after recovery", "commit response ignored; GET/refetch and exact retry"],
    paidReceiptResponse:receiptResponse.payload, isolatedReopen:true,twoPinVerifiedDevices:true,
    realtimePublisher: "absent; private outbox + authenticated GET reconciliation verified", providerNetwork: "NOT_CALLED", browserE2E: "NOT_RUN" };
  mkdirSync("docs/reports/evidence", { recursive: true }); writeFileSync("docs/reports/evidence/P5_HF01_LOCAL_HTTP.json", JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence));
} finally {
  if (server) { server.kill(); await new Promise(r => server.once("exit", r)); }
  sql(`begin;set local session_replication_role=replica;
   delete from public.security_rate_buckets where key_hash in(
    select encode(extensions.digest(k,'sha256'),'hex') from unnest(array['session-bill:${browserHash}:${session}','order-create:${browserHash}:${store}'${users.map(id => `,'owner:${id}:read','owner:${id}:write'`).join("")}]::text[]) k);
   delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest('receipt-read:'||h,'sha256'),'hex') from unnest(array['${browsers.join("','")}']::text[]) d(h));
   delete from public.security_rate_buckets where key_hash in(
    select encode(extensions.digest('session-bill:'||h||':'||s.id,'sha256'),'hex') from public.table_sessions s cross join unnest(array['${browsers.join("','")}']::text[]) d(h) where s.store_id='${store}'
    union all select encode(extensions.digest(prefix||q.id,'sha256'),'hex') from public.qr_codes q cross join unnest(array['pin-table-burst:','pin-table-minute:']) p(prefix) where q.store_id='${store}'
    union all select encode(extensions.digest(prefix||h||':'||q.id,'sha256'),'hex') from public.qr_codes q cross join unnest(array['${browsers.join("','")}']::text[]) d(h) cross join unnest(array['pin-device-burst:','verify:']) p(prefix) where q.store_id='${store}');
   delete from public.session_receipt_read_audit where browser_hash in('${browsers.join("','")}');delete from public.session_receipt_access where store_id='${store}';delete from public.session_receipts where store_id='${store}';
   delete from public.outbox_events where aggregate_id in(select id from public.table_sessions where store_id='${store}') or aggregate_id in(select id from public.orders where store_id='${store}');
   delete from public.session_settlement_audit_log where store_id='${store}';delete from public.session_settlements where store_id='${store}';delete from public.session_checkout_snapshots where store_id='${store}';
   delete from public.operation_requests where store_id='${store}';delete from public.order_events where store_id='${store}';delete from public.order_requests where store_id='${store}';delete from public.order_items where store_id='${store}';delete from public.orders where store_id='${store}';delete from public.ticket_counters where store_id='${store}';
   delete from public.guest_access where store_id='${store}';delete from public.table_pin_audit_log where store_id='${store}';delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id='${store}');delete from public.table_sessions where store_id='${store}';delete from public.qr_codes where store_id='${store}';delete from public.dining_tables where store_id='${store}';delete from public.menu_items where store_id='${store}';delete from public.menu_categories where store_id='${store}';
   delete from public.owner_members where store_id in('${store}','${foreign}');delete from public.stores where id in('${store}','${foreign}');delete from public.guest_browser_contexts where token_hash in('${browsers.join("','")}');commit;`);
  for (const id of users) await db.auth.admin.deleteUser(id);
}
