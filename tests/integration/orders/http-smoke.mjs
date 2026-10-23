/** Real Next production-mode HTTP + local Supabase. Never loads Production env credentials. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(status.API_URL, "http://127.0.0.1:15421");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = input => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const base = "http://localhost:13007", store = randomUUID(), password = randomUUID() + "aA!9", email = `p3-http-${randomUUID()}@example.invalid`;
const secrets = [status.SERVICE_ROLE_KEY, password, email], owner = new Map(), guest = new Map(), outsider = new Map();
const hashes = new Set(); let user, server, logs = "";
const extraUsers = [], extraStore = randomUUID();
const env = { ...process.env, OWNER_BOOTSTRAP_ENABLED: "false", APP_ORIGIN: base, APP_BASE_URL: "https://qr.example.invalid",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, TABLE_SESSION_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), TABLE_SESSION_ACTIVE_KEY_ID: "v1" };
async function call(path, jar = guest, method = "GET", body, overrides = {}) {
  const headers = { Accept: "application/json", ...(method === "GET" ? {} : { origin: base, "content-type": "application/json" }),
    ...(jar.size ? { cookie: [...jar].map(([k,v]) => `${k}=${v}`).join("; ") } : {}), ...overrides };
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(15000) });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], split = pair.indexOf("="), name = pair.slice(0, split), token = pair.slice(split + 1); jar.set(name, token);
    if (name === "__Host-qr_guest") { secrets.push(token); hashes.add(createHash("sha256").update(token).digest("hex")); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=lax/i); }
  }
  assert.match(response.headers.get("cache-control") || "", /no-store/); return response;
}
async function ok(path, jar, method, body, statusCode = 200) {
  const response = await call(path, jar, method, body), json = await response.json();
  assert.equal(response.status, statusCode, JSON.stringify(json)); assert.equal(json.error, null); return json.data;
}
async function fail(path, jar, method, body, statusCode, code, headers) {
  const response = await call(path, jar, method, body, headers), json = await response.json();
  assert.equal(response.status, statusCode, JSON.stringify(json)); assert.equal(json.data, null); assert.equal(json.error.code, code); return response;
}
const key = () => ({ requestId: randomUUID() });
const build = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", data => { output += data; }); child.stderr.on("data", data => { output += data; });
  child.once("error", reject); child.once("exit", code => { if (code === 0) resolve(); else { for (const secret of secrets) output = output.replaceAll(secret, "[redacted]"); reject(Error(output)); } });
});
try {
  let occupied = false; try { await fetch(base, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
  assert(!occupied, "Test port occupied; preserved existing process");
  await build(); console.log("PASS Next production build with loopback-only test env");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname=127.0.0.1", "--port=13007"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
  for (let i = 0;; i++) { try { await fetch(base, { signal: AbortSignal.timeout(700) }); break; } catch { assert(i < 60 && server.exitCode === null); await new Promise(r => setTimeout(r, 150)); } }
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); assert(!created.error && created.data.user); user = created.data.user.id;
  sql(`insert into public.stores(id,name) values('${store}','P3 HTTP fixture');insert into public.owner_members(store_id,auth_user_id) values('${store}','${user}')`);
  const auth = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await auth.auth.signInWithPassword({ email, password }); assert(!signed.error && signed.data.session);
  secrets.push(signed.data.session.access_token, signed.data.session.refresh_token);
  owner.set("sb-127-auth-token", `base64-${Buffer.from(JSON.stringify(signed.data.session)).toString("base64url")}`);
  const table = await ok("/api/owner/tables", owner, "POST", { ...key(), label: "Order HTTP" }, 201);
  const counter = await ok("/api/owner/qr-codes", owner, "POST", { ...key(), action: "create", type: "takeaway", tableId: null }, 201);
  const category = await ok("/api/owner/menu/categories", owner, "POST", { ...key(), name: "Drinks", sortOrder: 0, active: true }, 201);
  const item = await ok("/api/owner/menu", owner, "POST", { ...key(), categoryId: category.id, name: "Coffee", description: null, priceVnd: 29000, imageUrl: null, available: true, active: true, options: [{ name: "Milk", priceDeltaVnd: 3000, available: true }] }, 201);
  const opened = await ok(`/api/owner/tables/${table.id}/sessions`, owner, "POST", key(), 201); secrets.push(opened.sessionCredential.sessionCode);
  await ok(`/api/public/qr/${table.qr.publicCode}`, guest); const menu = await ok(`/api/public/menu?qrCode=${table.qr.publicCode}`, guest);
  const input = { qrCode: table.qr.publicCode, clientRequestId: randomUUID(), menuRevision: menu.menuRevision, items: [{ menuItemId: item.id, quantity: 2, optionIds: [item.options[0].id], note: "Private fixture note" }], note: null };
  secrets.push("Private fixture note");
  await fail("/api/public/orders", new Map(), "POST", input, 401, "UNAUTHORIZED");
  await fail("/api/public/orders", guest, "POST", input, 403, "SESSION_REQUIRED");
  await ok("/api/public/table-sessions/verify", guest, "POST", { qrCode: input.qrCode, sessionCode: opened.sessionCredential.sessionCode });
  const order = await ok("/api/public/orders", guest, "POST", input, 201);
  assert.equal(order.totalVnd, 64000); assert.equal(order.ticketNo, 1); assert.equal(order.status, "accepted"); assert.equal(order.payment.status, "unpaid");
  assert.deepEqual(await ok("/api/public/orders", guest, "POST", input, 201), order);
  assert.deepEqual(await ok(`/api/public/orders/${order.id}`, guest), order);
  assert.deepEqual(await ok(`/api/public/orders/${order.id}?includePickup=true`, guest), { order, pickup: null });
  await ok(`/api/public/qr/${input.qrCode}`, outsider);
  await fail(`/api/public/orders/${order.id}`, outsider, "GET", undefined, 404, "ORDER_NOT_FOUND");
  await fail(`/api/public/orders/${order.id}`, owner, "GET", undefined, 401, "UNAUTHORIZED");
  await fail("/api/public/orders", outsider, "POST", input, 403, "FORBIDDEN");
  await fail("/api/public/orders", guest, "POST", { ...input, note: "changed" }, 409, "DUPLICATE_REQUEST_CONFLICT");
  console.log("PASS verified guest create/replay/tracking/private projection and owner/outsider access boundary");
  for (const extra of [{ totalVnd: 1 }, { priceVnd: -1 }, { tableSessionId: opened.session.id }, { status: "accepted" }])
    await fail("/api/public/orders", guest, "POST", { ...input, ...extra, clientRequestId: randomUUID() }, 400, "VALIDATION_ERROR");
  await fail("/api/public/orders", guest, "POST", input, 403, "FORBIDDEN", { origin: "https://attacker.invalid" });
  await fail("/api/public/orders", guest, "POST", "x".repeat(65537), 400, "VALIDATION_ERROR");
  await fail(`/api/public/orders/${order.id}?includePickup=1`, guest, "GET", undefined, 400, "VALIDATION_ERROR");
  await fail("/api/public/orders", guest, "POST", { ...input, clientRequestId: randomUUID(), qrCode: counter.publicCode }, 409, "INVALID_STATE_TRANSITION");
  await fail("/api/public/orders", guest, "POST", { ...input, clientRequestId: randomUUID(), menuRevision: "stale" }, 409, "PRICE_CHANGED");
  await fail("/api/public/orders", guest, "POST", { ...input, clientRequestId: randomUUID(), items: [{ ...input.items[0], optionIds: [randomUUID()] }] }, 422, "VALIDATION_ERROR");
  // A body >4KiB remains supported by R04's dedicated bounded reader.
  const large = { ...input, clientRequestId: randomUUID(), items: Array.from({ length: 12 }, () => ({ ...input.items[0], note: "n".repeat(500) })) };
  assert(Buffer.byteLength(JSON.stringify(large)) > 4096); assert.equal((await ok("/api/public/orders", guest, "POST", large, 201)).itemCount, 24);
  console.log("PASS CSRF, strict input, price/context forgery, option422, stale409, takeaway rejection and 64KiB boundary");
  const lost = { ...input, clientRequestId: randomUUID() };
  await new Promise((resolve, reject) => {
    const request = http.request(base + "/api/public/orders", { method: "POST", headers: { origin: base, "content-type": "application/json", cookie: [...guest].map(([k,v]) => `${k}=${v}`).join("; ") } }, response => {
      assert.equal(response.statusCode, 201); response.destroy(); resolve(); // Deliberately discard committed response body.
    }); request.on("error", reject); request.end(JSON.stringify(lost));
  });
  const replay = await ok("/api/public/orders", guest, "POST", lost, 201);
  assert.equal(sql(`select count(*) from public.orders where store_id='${store}' and client_request_id='${lost.clientRequestId}'`), "1"); assert.equal(replay.ticketNo, 3);
  // P3-C02: real owner cookie auth and FIFO transitions against the same DB.
  async function extraOwner(member) {
    const address = `queue-http-${randomUUID()}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email: address, password, email_confirm: true }); assert(!created.error);
    extraUsers.push(created.data.user.id);
    if (member) sql(`insert into public.stores(id,name) values('${extraStore}','Other queue HTTP');insert into public.owner_members(store_id,auth_user_id) values('${extraStore}','${created.data.user.id}')`);
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = await client.auth.signInWithPassword({ email: address, password }); assert(!auth.error);
    secrets.push(address, auth.data.session.access_token, auth.data.session.refresh_token);
    return new Map([["sb-127-auth-token", `base64-${Buffer.from(JSON.stringify(auth.data.session)).toString("base64url")}`]]);
  }
  const nonmember = await extraOwner(false), foreignOwner = await extraOwner(true);
  await fail("/api/owner/orders", new Map(), "GET", undefined, 401, "UNAUTHORIZED");
  await fail("/api/owner/orders", nonmember, "GET", undefined, 403, "FORBIDDEN");
  for (const [path, body] of [["/api/owner/queue/claim-next", key()], [`/api/owner/orders/${order.id}/ready`, { ...key(), expectedVersion: 1 }], [`/api/owner/orders/${order.id}/complete`, { ...key(), expectedVersion: 1, type: "dine_in" }]]) {
    await fail(path, new Map(), "POST", body, 401, "UNAUTHORIZED");
    await fail(path, nonmember, "POST", body, 403, "FORBIDDEN");
    await fail(path, owner, "POST", body, 403, "FORBIDDEN", { origin: "https://attacker.invalid" });
  }
  await fail(`/api/owner/orders?orderId=${order.id}`, foreignOwner, "GET", undefined, 404, "ORDER_NOT_FOUND");
  await fail(`/api/owner/orders/${order.id}/ready`, foreignOwner, "POST", { ...key(), expectedVersion: 1 }, 404, "ORDER_NOT_FOUND");
  await fail(`/api/owner/orders/${order.id}/complete`, foreignOwner, "POST", { ...key(), expectedVersion: 1, type: "dine_in" }, 404, "ORDER_NOT_FOUND");
  const firstPage = await ok(`/api/owner/orders?limit=1&orderId=${replay.id}`, owner);
  assert.equal(firstPage.orders[0].id, order.id); assert.equal(firstPage.detail.id, replay.id); assert.equal(firstPage.counts.accepted, 3);
  assert(!JSON.stringify(firstPage.orders).includes("Private fixture note")); assert(!Object.hasOwn(firstPage.orders[0], "lines"));
  assert.equal((await ok(`/api/owner/orders?limit=1&cursor=${firstPage.nextCursor}`, owner)).orders[0].ticketNo, 2);
  for (const query of ["limit=101", "type=all", "status=completed", "status=ready&status=accepted", "storeId=x", "orderId=bad", "cursor=bad", `type=takeaway&cursor=${firstPage.nextCursor}`])
    await fail(`/api/owner/orders?${query}`, owner, "GET", undefined, 400, "VALIDATION_ERROR");
  for (const body of [{ ...key(), orderId: order.id }, { requestId: "bad" }]) await fail("/api/owner/queue/claim-next", owner, "POST", body, 400, "VALIDATION_ERROR");
  await fail("/api/owner/queue/claim-next", owner, "POST", "x".repeat(4097), 400, "VALIDATION_ERROR");
  await fail(`/api/owner/orders/${order.id}/ready`, owner, "POST", key(), 400, "VALIDATION_ERROR");
  await fail("/api/owner/orders/bad/ready", owner, "POST", { ...key(), expectedVersion: 1 }, 400, "VALIDATION_ERROR");
  await fail(`/api/owner/orders/${randomUUID()}/ready`, owner, "POST", { ...key(), expectedVersion: 1 }, 404, "ORDER_NOT_FOUND");
  await fail(`/api/owner/orders/${order.id}/complete`, owner, "POST", { ...key(), expectedVersion: 1, type: "takeaway", pickupCode: "opaque-private-proof" }, 409, "INVALID_STATE_TRANSITION");
  secrets.push("opaque-private-proof");
  const claimKey = key();
  const claims = await Promise.all(Array.from({ length: 12 }, () => ok("/api/owner/queue/claim-next", owner, "POST", claimKey)));
  claims.forEach(value => assert.deepEqual(value, claims[0])); assert.equal(claims[0].id, order.id); assert.equal(claims[0].status, "preparing");
  assert.equal((await ok(`/api/public/orders/${order.id}`, guest)).status, "preparing");
  const readyKey = { ...key(), expectedVersion: 2 }, ready = await ok(`/api/owner/orders/${order.id}/ready`, owner, "POST", readyKey);
  assert.equal(ready.status, "ready"); assert.equal((await ok(`/api/public/orders/${order.id}`, guest)).status, "ready");
  assert.deepEqual(await ok(`/api/owner/orders/${order.id}/ready`, owner, "POST", readyKey), ready);
  await fail(`/api/owner/orders/${order.id}/ready`, owner, "POST", { ...readyKey, expectedVersion: 3 }, 409, "DUPLICATE_REQUEST_CONFLICT");
  const completeKey = { ...key(), expectedVersion: 3, type: "dine_in" }, completed = await ok(`/api/owner/orders/${order.id}/complete`, owner, "POST", completeKey);
  assert.equal(completed.status, "completed"); assert.equal(completed.payment.status, "unpaid");
  assert.equal(sql(`select status from public.table_sessions where id='${opened.session.id}'`), "open");
  assert.deepEqual(await ok(`/api/owner/orders/${order.id}/complete`, owner, "POST", completeKey), completed);
  assert.deepEqual(await ok("/api/owner/queue/claim-next", owner, "POST", claimKey), claims[0]);
  assert.equal((await ok(`/api/public/orders/${order.id}`, guest)).status, "completed");
  await fail(`/api/public/orders/${order.id}`, outsider, "GET", undefined, 404, "ORDER_NOT_FOUND");
  const lostClaim = key();
  await new Promise((resolve, reject) => {
    const request = http.request(base + "/api/owner/queue/claim-next", { method: "POST", headers: { origin: base, "content-type": "application/json", cookie: [...owner].map(([k,v]) => `${k}=${v}`).join("; ") } }, response => {
      assert.equal(response.statusCode, 200); response.destroy(); resolve();
    }); request.on("error", reject); request.end(JSON.stringify(lostClaim));
  });
  assert.equal((await ok("/api/owner/queue/claim-next", owner, "POST", lostClaim)).ticketNo, 2);
  assert.equal((await ok("/api/owner/queue/claim-next", owner, "POST", key())).ticketNo, 3);
  const emptyClaim = key(); assert.equal(await ok("/api/owner/queue/claim-next", owner, "POST", emptyClaim), null);
  assert.equal(await ok("/api/owner/queue/claim-next", owner, "POST", emptyClaim), null);
  assert.equal(sql(`select count(*) from public.order_events where order_id='${order.id}' and actor_id='${user}' and before_state is not null and after_state is not null`), "3");
  console.log("PASS owner queue HTTP: cookie auth401/403, tenant404, strict400, pagination, FIFO, 12 concurrent replays, ready/complete, guest status, dropped claim response and empty replay");
  sql(`update public.security_rate_buckets set attempts=10 where key_hash=encode(extensions.digest('order-create:${[...hashes][0]}:${store}','sha256'),'hex')`);
  const limited = await fail("/api/public/orders", guest, "POST", { ...input, clientRequestId: randomUUID() }, 429, "RATE_LIMITED"); assert(limited.headers.get("retry-after"));
  assert.deepEqual(await ok("/api/public/orders", guest, "POST", lost, 201), replay);
  sql(`update public.table_sessions set status='checkout_pending' where id='${opened.session.id}'`);
  assert.equal((await ok(`/api/public/orders/${order.id}`, guest)).id, order.id);
  assert.deepEqual(await ok("/api/public/orders", guest, "POST", input, 201), order);
  await fail("/api/public/orders", guest, "POST", { ...input, clientRequestId: randomUUID() }, 409, "SESSION_CHECKOUT_PENDING");
  sql(`update public.table_sessions set status='closed' where id='${opened.session.id}'`);
  await fail(`/api/public/orders/${order.id}`, guest, "GET", undefined, 410, "SESSION_EXPIRED");
  await fail("/api/public/orders", guest, "POST", input, 410, "SESSION_EXPIRED");
  for (const secret of secrets) assert(!logs.includes(secret), "Sensitive data in captured server logs (withheld)");
  console.log("PASS dropped-response recovery, rate/replay, checkout/close revoke, Secure cookie and log privacy");
} finally {
  if (server && server.exitCode === null) await new Promise(resolve => { server.once("exit", resolve); server.kill(); });
  const orderIds = JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.orders where store_id='${store}'`));
  const qrIds = JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.qr_codes where store_id='${store}'`));
  const rateKeys = [...(user ? [`owner:${user}:read`, `owner:${user}:write`] : []),
    ...[...hashes].flatMap(hash => [`order-create:${hash}:${store}`, ...orderIds.map(id => `order-read:${hash}:${id}`), ...qrIds.flatMap(id => [`read:${hash}:${id}`, `verify:${hash}:${id}`])]),
    ...qrIds.map(id => `verify-qr:${id}`)];
  sql(`begin;set local session_replication_role=replica;
   delete from public.outbox_events where aggregate_id in(select id from public.orders where store_id='${store}' union all select id from public.table_sessions where store_id='${store}' union all select id from public.stores where id='${store}');
   delete from public.order_events where store_id='${store}';delete from public.order_requests where store_id='${store}';delete from public.order_items where store_id='${store}';delete from public.orders where store_id='${store}';delete from public.ticket_counters where store_id='${store}';
   delete from public.operation_requests where store_id='${store}';delete from public.table_qr_audit_log where store_id='${store}';delete from public.menu_audit_log where store_id='${store}';delete from public.guest_access where store_id='${store}';delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id='${store}');delete from public.table_sessions where store_id='${store}';
   delete from public.menu_item_options where store_id='${store}';delete from public.menu_items where store_id='${store}';delete from public.menu_categories where store_id='${store}';delete from public.qr_codes where store_id='${store}';delete from public.dining_tables where store_id='${store}';delete from public.owner_members where store_id='${store}';delete from public.stores where id='${store}';
   delete from public.guest_browser_contexts where token_hash in('${[...hashes].join("','")}');
   delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${rateKeys.map(k => `'${k}'`).join(",")}]::text[]) k);commit;`);
  if (user) assert(!(await admin.auth.admin.deleteUser(user)).error);
  sql(`delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${extraUsers.flatMap(id => [`'owner:${id}:read'`, `'owner:${id}:write'`]).join(",")}]::text[]) k);
   delete from public.owner_members where store_id='${extraStore}';delete from public.stores where id='${extraStore}';`);
  for (const id of extraUsers) assert(!(await admin.auth.admin.deleteUser(id)).error);
  console.log("CLEANUP isolated local fixtures and test server removed");
}
