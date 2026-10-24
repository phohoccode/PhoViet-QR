/** Production HTTP verification against isolated local Supabase; no UI assertion. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { pinRateKeys } from "./pin-rate-fixtures.mjs";
const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(status.API_URL, "http://127.0.0.1:15421");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = input => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const base = "http://localhost:13005", canonical = "https://qr.example.invalid", stores = [randomUUID(), randomUUID()];
const users = [], passwords = [randomUUID()+"aA!9", randomUUID()+"aA!9", randomUUID()+"aA!9"], emails = passwords.map(() => `qr-life-http-${randomUUID()}@example.invalid`);
const secrets = [status.SERVICE_ROLE_KEY, ...passwords, ...emails], guestHashes = new Set();
const env = { ...process.env, OWNER_BOOTSTRAP_ENABLED: "false", NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  APP_ORIGIN: base, APP_BASE_URL: canonical, TABLE_SESSION_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), TABLE_SESSION_ACTIVE_KEY_ID: "v1", TABLE_PIN_HMAC_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), TABLE_PIN_ACTIVE_HMAC_KEY_ID: "v1" };
const jars = [new Map(), new Map(), new Map()], guest = new Map();
let server, logs = "";
async function call(path, jar = guest, method = "GET", body, extra = {}) {
  const headers = { Accept: "application/json", ...(method === "GET" ? {} : { origin: base, "content-type": "application/json" }), ...extra };
  if (jar.size) headers.cookie = [...jar].map(([k,v]) => `${k}=${v}`).join("; ");
  const r = await fetch(base+path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(15000) });
  for (const value of r.headers.getSetCookie()) {
    const pair = value.split(";")[0], n = pair.indexOf("="), name = pair.slice(0,n), token = pair.slice(n+1); jar.set(name,token);
    if (name === "__Host-qr_guest") { secrets.push(token); guestHashes.add(createHash("sha256").update(token).digest("hex")); }
  }
  assert.match(r.headers.get("cache-control") || "", /no-store/);
  return r;
}
async function ok(path, jar, method, body, expected = 200, extra) {
  const r = await call(path,jar,method,body,extra), json = await r.json();
  assert.equal(r.status,expected,JSON.stringify(json)); assert.equal(json.error,null); return json.data;
}
async function fail(path, jar, method, body, statusCode, code, extra) {
  const r = await call(path,jar,method,body,extra), json = await r.json();
  assert.equal(r.status,statusCode,JSON.stringify(json)); assert.equal(json.data,null); assert.equal(json.error.code,code); return { r, error: json.error };
}
const command = () => ({ requestId: randomUUID() });
const build = () => new Promise((resolve,reject) => {
  const child = spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let output = ""; child.stdout.on("data",v=>{output+=v;}); child.stderr.on("data",v=>{output+=v;});
  child.once("error",reject); child.once("exit",code=>{ if (code===0) resolve(); else { for(const secret of secrets) output=output.replaceAll(secret,"[redacted]"); reject(Error(output)); } });
});
try {
  let occupied = false; try { await fetch(base,{signal:AbortSignal.timeout(800)}); occupied=true; } catch {}
  assert(!occupied,"Test port occupied; existing process preserved");
  await build(); console.log("PASS production build (local test env)");
  server = spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname=127.0.0.1","--port=13005"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",v=>{logs+=v;}); server.stderr.on("data",v=>{logs+=v;});
  for(let i=0;;i++) { try { await fetch(base,{signal:AbortSignal.timeout(1000)}); break; } catch { assert(i<60 && server.exitCode===null,"HTTP server startup failed"); await new Promise(r=>setTimeout(r,250)); } }
  for (let i=0;i<3;i++) {
    const r = await admin.auth.admin.createUser({email:emails[i],password:passwords[i],email_confirm:true}); assert(!r.error && r.data.user); users.push(r.data.user.id);
    const c = createClient(status.API_URL,status.PUBLISHABLE_KEY || status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed = await c.auth.signInWithPassword({email:emails[i],password:passwords[i]}); assert(!signed.error && signed.data.session);
    jars[i].set("sb-127-auth-token",`base64-${Buffer.from(JSON.stringify(signed.data.session)).toString("base64url")}`);
    secrets.push(signed.data.session.access_token,signed.data.session.refresh_token);
  }
  sql(`insert into public.stores(id,name) values('${stores[0]}','HTTP lifecycle A'),('${stores[1]}','HTTP lifecycle B');insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${users[0]}'),('${stores[1]}','${users[1]}');`);
  for (const path of ["/api/owner/tables","/api/owner/qr-codes"]) {
    await fail(path,guest,"GET",undefined,401,"UNAUTHORIZED");
    await fail(path,guest,"POST",{},401,"UNAUTHORIZED");
    await fail(path,jars[2],"GET",undefined,403,"FORBIDDEN");
    await fail(path,jars[2],"POST",{},403,"FORBIDDEN");
  }
  console.log("PASS HTTP owner auth/nonmember/guest guards and no-store");
  const input = {...command(),label:" \tBàn HTTP 01 "};
  let table = await ok("/api/owner/tables",jars[0],"POST",input,201);
  assert.deepEqual(await ok("/api/owner/tables",jars[0],"POST",input,201),table);
  const qr = table.qr;
  assert.equal(table.label,"Bàn HTTP 01"); assert.equal(qr.publicUrl,canonical+qr.path);
  assert(!qr.publicUrl.includes(stores[0])); assert.match(qr.publicCode,/^[a-f0-9]{32}$/);
  const viewed = await ok("/api/owner/qr-codes",jars[0],"GET",undefined,200,{"x-forwarded-host":"evil.example.invalid"});
  assert.deepEqual(viewed,[qr]);
  assert.equal((await ok("/api/owner/tables",jars[0])).tables.length,1);
  assert.equal((await ok(qr.path.replace("/q/","/api/public/qr/"),guest)).requiresSessionCode,true);
  assert.deepEqual((await ok(`/api/public/menu?qrCode=${qr.publicCode}`,guest)).items,[]);
  for (const body of [{...input,storeId:stores[1]},{...input,publicCode:"forged"},{...input,activeSessionId:randomUUID()},{...input,label:" "}])
    await fail("/api/owner/tables",jars[0],"POST",body,400,"VALIDATION_ERROR");
  await fail("/api/owner/tables",jars[0],"POST",{...command(),label:"bàn   http 01"},400,"VALIDATION_ERROR");
  await fail("/api/owner/tables",jars[0],"POST",{...input,label:"Different"},409,"DUPLICATE_REQUEST_CONFLICT");
  await fail("/api/owner/tables",jars[0],"POST",{...command(),label:"CSRF"},403,"FORBIDDEN",{origin:"https://evil.example.invalid"});
  await fail("/api/owner/tables?unexpected=true",jars[0],"POST",input,400,"VALIDATION_ERROR");
  await fail("/api/owner/tables?tableId=x&tableId=y",jars[0],"GET",undefined,400,"VALIDATION_ERROR");
  const patch = {...command(),expectedUpdatedAt:table.updatedAt,label:"Renamed HTTP"};
  table = await ok(`/api/owner/tables/${table.id}`,jars[0],"PATCH",patch);
  assert.equal(table.qr.publicCode,qr.publicCode);
  assert.deepEqual(await ok(`/api/owner/tables/${table.id}`,jars[0],"PATCH",patch),table);
  table = await ok(`/api/owner/tables/${table.id}`,jars[0],"PATCH",{...command(),expectedUpdatedAt:table.updatedAt,active:false});
  await fail(`/api/public/qr/${qr.publicCode}`,guest,"GET",undefined,404,"INVALID_QR");
  await fail("/api/owner/qr-codes",jars[0],"POST",{...command(),action:"create",type:"table",tableId:table.id},422,"INVALID_STATE_TRANSITION");
  table = await ok(`/api/owner/tables/${table.id}`,jars[0],"PATCH",{...command(),expectedUpdatedAt:table.updatedAt,active:true});
  await fail(`/api/owner/tables/${table.id}`,jars[0],"PATCH",{...patch,...command()},409,"INVALID_STATE_TRANSITION");
  await fail(`/api/owner/tables/${table.id}`,jars[1],"PATCH",{...patch,...command()},404,"RESOURCE_NOT_FOUND");
  await fail(`/api/owner/tables/${table.id}`,guest,"PATCH",patch,401,"UNAUTHORIZED");
  console.log("PASS table create/list/rename/replay/CAS, strict input, trusted URL and tenant isolation");
  const takeawayInput = {...command(),action:"create",type:"takeaway",tableId:null};
  const takeaway = await ok("/api/owner/qr-codes",jars[0],"POST",takeawayInput,201);
  assert.deepEqual(await ok("/api/owner/qr-codes",jars[0],"POST",takeawayInput,201),takeaway);
  await fail("/api/owner/qr-codes",jars[0],"POST",{...takeawayInput,...command()},409,"INVALID_STATE_TRANSITION");
  assert.equal((await ok(`/api/public/qr/${takeaway.publicCode}`,guest)).requiresSessionCode,false);
  await ok("/api/owner/qr-codes",jars[0],"POST",{...command(),action:"set_active",id:takeaway.id,active:false});
  await fail(`/api/public/qr/${takeaway.publicCode}`,guest,"GET",undefined,404,"INVALID_QR");
  await ok("/api/owner/qr-codes",jars[0],"POST",{...command(),action:"set_active",id:takeaway.id,active:true});
  const opened = await ok(`/api/owner/tables/${table.id}/sessions`,jars[0],"POST",command(),201);
  secrets.push(opened.sessionCredential.sessionCode);
  const blocked = await fail(`/api/owner/tables/${table.id}`,jars[0],"PATCH",{...command(),expectedUpdatedAt:table.updatedAt,active:false},409,"INVALID_STATE_TRANSITION");
  assert.equal(blocked.error.details.field,"activeSession");
  const rotation = {...command(),expectedUpdatedAt:qr.updatedAt,confirm:true};
  await fail(`/api/owner/qr-codes/${qr.id}/rotate`,guest,"POST",rotation,401,"UNAUTHORIZED");
  await fail(`/api/owner/qr-codes/${qr.id}/rotate`,jars[1],"POST",rotation,404,"RESOURCE_NOT_FOUND");
  await fail(`/api/owner/qr-codes/${qr.id}/rotate`,jars[0],"POST",{...rotation,confirm:false},400,"VALIDATION_ERROR");
  await fail(`/api/owner/qr-codes/${qr.id}/rotate`,jars[0],"POST",rotation,409,"INVALID_STATE_TRANSITION");
  await fail("/api/owner/qr-codes",jars[0],"POST",{...command(),action:"set_active",id:qr.id,active:false},409,"INVALID_STATE_TRANSITION");
  const verified = await ok("/api/public/table-sessions/verify",guest,"POST",{qrCode:qr.publicCode,sessionCode:opened.sessionCredential.sessionCode});
  assert.equal(verified.requiresSessionCode,false);
  const details = await ok(`/api/owner/tables?tableId=${table.id}`,jars[0]);
  assert.equal(details.detail.session.id,opened.session.id); assert(!JSON.stringify(details).includes(opened.sessionCredential.sessionCode));
  sql(`update public.table_sessions set status='closed' where id='${opened.session.id}'`);
  const next = await ok(`/api/owner/qr-codes/${qr.id}/rotate`,jars[0],"POST",rotation,201);
  assert.deepEqual(await ok(`/api/owner/qr-codes/${qr.id}/rotate`,jars[0],"POST",rotation,201),next);
  await fail(`/api/public/qr/${qr.publicCode}`,guest,"GET",undefined,404,"INVALID_QR");
  assert.equal((await ok(`/api/public/qr/${next.publicCode}`,guest)).requiresSessionCode,true);
  await fail("/api/owner/qr-codes",jars[0],"POST",{...command(),action:"set_active",id:qr.id,active:true},409,"INVALID_STATE_TRANSITION");
  const list = await ok("/api/owner/qr-codes",jars[0]); assert(list.find(q=>q.id===qr.id).retiredAt);
  console.log("PASS takeaway reuse, active-session guards, C01 verify, atomic rotate/replay and retired-code 404");
  sql(`insert into public.security_rate_buckets(key_hash,attempts,resets_at) values(encode(extensions.digest('owner:${users[0]}:write','sha256'),'hex'),30,clock_timestamp()+interval '1 minute') on conflict(key_hash) do update set attempts=30,resets_at=clock_timestamp()+interval '1 minute'`);
  const limited = await fail("/api/owner/tables",jars[0],"POST",{...command(),label:"Too fast"},429,"RATE_LIMITED");
  assert(limited.r.headers.get("retry-after"));
  for(const secret of secrets) assert(!logs.includes(secret),"Sensitive value in logs (withheld)");
  console.log("PASS HTTP rate-limit/Retry-After and no credential leakage in captured logs");
} finally {
  if(server && server.exitCode===null) await new Promise(resolve=>{server.once("exit",resolve);server.kill();});
  const pinQrIds=JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.qr_codes where store_id in('${stores.join("','")}')`));
  const pinKeys=pinRateKeys(pinQrIds,[...guestHashes]);
  sql(`delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${pinKeys.map(k=>`'${k}'`).join(",")}]::text[]) k)`);
  sql(`begin;set local session_replication_role=replica;
    delete from public.guest_access where store_id in('${stores.join("','")}');
    delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
    delete from public.operation_requests where store_id in('${stores.join("','")}');
    delete from public.table_qr_audit_log where store_id in('${stores.join("','")}');
    delete from public.outbox_events where aggregate_id in('${stores.join("','")}') or aggregate_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
    delete from public.table_sessions where store_id in('${stores.join("','")}');
    delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from (
      select unnest(array['${users.flatMap(id=>[`owner:${id}:read`,`owner:${id}:write`]).join("','")}']::text[]) k
      union all select 'read:'||h||':'||q.id from public.qr_codes q cross join unnest(array['${[...guestHashes].join("','")}']::text[]) h where q.store_id in('${stores.join("','")}')
      union all select 'verify-qr:'||id from public.qr_codes where store_id in('${stores.join("','")}')
    ) keys);
    delete from public.qr_codes where store_id in('${stores.join("','")}');delete from public.dining_tables where store_id in('${stores.join("','")}');
    delete from public.owner_members where store_id in('${stores.join("','")}');delete from public.stores where id in('${stores.join("','")}');
    delete from public.guest_browser_contexts where token_hash in('${[...guestHashes].join("','")}');commit;`);
  for(const id of users) assert(!(await admin.auth.admin.deleteUser(id)).error,"Fixture Auth cleanup failed");
  console.log("CLEANUP isolated lifecycle fixtures and test server removed");
}
