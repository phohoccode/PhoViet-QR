/** Local-only production HTTP integration. No browser/hydration claims. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(status.API_URL, "http://127.0.0.1:15421");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = input => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const stores = [randomUUID(), randomUUID()], tables = [randomUUID(), randomUUID(), randomUUID()];
const codes = tables.map(() => randomBytes(16).toString("hex")), takeaway = randomBytes(16).toString("hex");
const password = `${randomUUID()}aA!9`, emails = [0,1,2].map(() => `qr-http-${randomUUID()}@example.invalid`), users = [];
const base = "http://localhost:13003";
const env = { ...process.env, OWNER_BOOTSTRAP_ENABLED: "false", NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  TABLE_SESSION_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }), TABLE_SESSION_ACTIVE_KEY_ID: "v1", APP_ORIGIN: base };
let server, logs = "";
const secrets = [password, ...emails, status.SERVICE_ROLE_KEY];
const allCookies = new Set();
const guestTokens = new Set();
const hash = value => createHash("sha256").update(value).digest("hex");
const jar = () => new Map();
const ownerJar = jar(), nonmemberJar = jar(), foreignJar = jar(), guestA = jar(), guestB = jar(), attacker = jar();
const call = async (path, cookies = guestA, options = {}) => {
  const headers = new Headers(options.headers);
  if (cookies.size) headers.set("cookie", [...cookies].map(([k,v]) => `${k}=${v}`).join("; "));
  const response = await fetch(`${base}${path}`, { ...options, headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], index = pair.indexOf("="), key = pair.slice(0,index), value = pair.slice(index+1);
    if (value) { cookies.set(key,value); allCookies.add(value); if(key==="__Host-qr_guest")guestTokens.add(value); } else cookies.delete(key);
  }
  return response;
};
const jsonCall = async (path, cookies, body, origin = base) => call(path, cookies, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
async function expectError(response, statusCode, code) {
  assert.equal(response.status,statusCode);
  const body=await response.json(); assert.equal(body.data,null); assert.equal(body.error.code,code);
  assert.match(response.headers.get("cache-control"),/no-store/); return body;
}
const report = label => console.log(`PASS ${label}`);
const runNext = args => new Promise((accept,reject) => {
  const child = spawn(process.execPath,["node_modules/next/dist/bin/next",...args],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
  child.stdout.resume(); child.stderr.resume();
  child.on("error",reject); child.on("exit",code=>code===0?accept():reject(new Error("Next command failed; captured output withheld")));
});
try {
  let occupied=false; try{await fetch(base,{signal:AbortSignal.timeout(800)});occupied=true;}catch{}
  assert(!occupied,"Port13003 occupied; no existing server will be stopped");
  await runNext(["build"]); report("production build with local Supabase and isolated keyring");
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname=127.0.0.1","--port=13003"],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
  server.stdout.on("data",chunk=>{logs+=chunk;});server.stderr.on("data",chunk=>{logs+=chunk;});
  for(let attempt=0;;attempt++){try{await fetch(base,{signal:AbortSignal.timeout(1000)});break;}catch{assert(attempt<60&&server.exitCode===null,"Server failed to start");await new Promise(r=>setTimeout(r,250));}}
  for(const email of emails){const r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert(!r.error&&r.data.user,"Auth setup failed");users.push(r.data.user.id);}
  sql(`begin;insert into public.stores(id,name) values('${stores[0]}','HTTP QR A'),('${stores[1]}','HTTP QR B');
    insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${users[0]}'),('${stores[1]}','${users[1]}');
    ${tables.map((id,i)=>`insert into public.dining_tables(id,store_id,label) values('${id}','${stores[i===2?1:0]}','HTTP Table ${i}');insert into public.qr_codes(store_id,type,table_id,public_code) values('${stores[i===2?1:0]}','table','${id}','${codes[i]}');`).join("\n")}
    insert into public.qr_codes(store_id,type,public_code) values('${stores[0]}','takeaway','${takeaway}');commit;`);
  // Real signed provider cookies: Next reads cookies() and verifies getUser remotely.
  for(const [i,cookies] of [[0,ownerJar],[1,foreignJar],[2,nonmemberJar]]){
    const client=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const r=await client.auth.signInWithPassword({email:emails[i],password});assert(!r.error&&r.data.session,"Fixture login failed");
    cookies.set("sb-127-auth-token",`base64-${Buffer.from(JSON.stringify(r.data.session)).toString("base64url")}`);
    secrets.push(r.data.session.access_token,r.data.session.refresh_token);
  }
  await expectError(await call("/api/owner/tables",guestA),401,"UNAUTHORIZED");
  await expectError(await call("/api/owner/tables",nonmemberJar),403,"FORBIDDEN");
  await expectError(await call(`/api/owner/tables?tableId=${tables[0]}`,foreignJar),404,"RESOURCE_NOT_FOUND");
  await expectError(await jsonCall(`/api/owner/tables/${tables[0]}/sessions`,foreignJar,{requestId:randomUUID()}),404,"RESOURCE_NOT_FOUND");
  report("owner APIs verify real Auth membership and tenant scope on each request");
  let response=await call(`/api/public/qr/${codes[0]}`,guestA);assert.equal(response.status,200);
  const unverified=await response.json();assert.equal(unverified.data.session,null);assert.equal(unverified.data.requiresSessionCode,true);
  const cookie=response.headers.getSetCookie().find(value=>value.startsWith("__Host-qr_guest="));assert(cookie);
  for(const flag of [/HttpOnly/i,/Secure/i,/SameSite=Lax/i,/Path=\//i])assert.match(cookie,flag);
  assert(!cookie.includes("Domain="));
  const guestCookie=guestA.get("__Host-qr_guest");
  response=await call(`/api/public/qr/${takeaway}`,guestA);assert.equal(response.status,200);assert.equal((await response.json()).data.mode,"takeaway");assert.equal(guestA.get("__Host-qr_guest"),guestCookie);
  await expectError(await call("/api/public/qr/unknown",guestA),404,"INVALID_QR");
  await expectError(await call(`/api/public/qr/${codes[0]}?sessionCode=DO_NOT_ECHO`,guestA),400,"VALIDATION_ERROR");
  report("public table/takeaway DTOs and host-only secure opaque cookie; no QR session disclosure");
  const req=randomUUID();
  const raced=await Promise.all([jsonCall(`/api/owner/tables/${tables[0]}/sessions`,ownerJar,{requestId:req}),jsonCall(`/api/owner/tables/${tables[0]}/sessions`,ownerJar,{requestId:req})]);
  for(const r of raced)assert.equal(r.status,201);
  const opened=await raced[0].json();assert.deepEqual(await raced[1].json(),opened);
  const code=opened.data.sessionCredential.sessionCode;secrets.push(code);
  await expectError(await jsonCall(`/api/owner/tables/${tables[0]}/sessions`,ownerJar,{requestId:randomUUID()}),409,"INVALID_STATE_TRANSITION");
  await expectError(await jsonCall(`/api/owner/tables/${tables[1]}/sessions`,ownerJar,{requestId:req}),409,"DUPLICATE_REQUEST_CONFLICT");
  await expectError(await jsonCall(`/api/owner/tables/${tables[1]}/sessions`,ownerJar,{requestId:randomUUID(),storeId:stores[1]}),400,"VALIDATION_ERROR");
  report("open-session atomic race and principal-bound requestId replay with one private code");
  await expectError(await jsonCall("/api/public/table-sessions/verify",guestA,{qrCode:codes[0],sessionCode:code},"https://untrusted.example.invalid"),403,"FORBIDDEN");
  await expectError(await jsonCall("/api/public/table-sessions/verify",guestA,{qrCode:codes[0]}),400,"VALIDATION_ERROR");
  await expectError(await jsonCall("/api/public/table-sessions/verify",guestA,{qrCode:codes[0],sessionCode:"x".repeat(5000)}),400,"VALIDATION_ERROR");
  for(let i=0;i<5;i++)await expectError(await jsonCall("/api/public/table-sessions/verify",attacker,{qrCode:codes[0],sessionCode:"wrong"}),422,"INVALID_SESSION_CODE");
  response=await jsonCall("/api/public/table-sessions/verify",attacker,{qrCode:codes[0],sessionCode:"wrong"});
  assert(response.headers.get("retry-after"));await expectError(response,429,"RATE_LIMITED");
  report("CSRF, strict body/size validation, persisted rate-limit and Retry-After");
  for(const cookies of [guestA,guestB]){
    response=await jsonCall("/api/public/table-sessions/verify",cookies,{qrCode:codes[0],sessionCode:code});assert.equal(response.status,200);
    const body=await response.json();assert.equal(body.data.requiresSessionCode,false);assert.equal(body.data.session.id,opened.data.session.id);
    assert(!JSON.stringify(body).includes(code));assert(!JSON.stringify(body).includes(cookies.get("__Host-qr_guest")));
  }
  assert.notEqual(guestA.get("__Host-qr_guest"),guestB.get("__Host-qr_guest"));
  response=await call(`/api/public/qr/${codes[0]}`,guestA);assert.equal((await response.json()).data.session.id,opened.data.session.id);
  response=await call(`/api/public/qr/${codes[1]}`,guestA);assert.equal((await response.json()).data.session,null);
  for(const path of ["/api/owner/tables",`/api/owner/tables?tableId=${tables[0]}`,"/api/owner/qr-codes"]){response=await call(path,ownerJar);assert.equal(response.status,200);const body=await response.text();assert(!body.includes(code));assert(!body.includes("code_hash"));assert(!body.includes("artifact"));}
  report("two device grants, refresh persistence, cross-table isolation and secret-free owner lists");
  sql(`update public.table_sessions set status='checkout_pending' where id='${opened.data.session.id}'`);
  response=await jsonCall("/api/public/table-sessions/verify",jar(),{qrCode:codes[0],sessionCode:code});assert.equal(response.status,200);assert.equal((await response.json()).data.session.status,"checkout_pending");
  sql(`update public.table_sessions set status='closed' where id='${opened.data.session.id}'`);
  await expectError(await jsonCall("/api/public/table-sessions/verify",jar(),{qrCode:codes[0],sessionCode:code}),410,"SESSION_EXPIRED");
  await expectError(await jsonCall(`/api/owner/tables/${tables[0]}/sessions`,ownerJar,{requestId:req}),410,"SESSION_EXPIRED");
  response=await call(`/api/public/qr/${codes[0]}`,guestA);assert.equal((await response.json()).data.session,null);
  assert.equal(sql(`select count(*) from public.guest_access where scope_id='${opened.data.session.id}' and revoked_at is null`),"0");
  assert.equal(sql(`select count(*) from public.session_code_deliveries where session_id='${opened.data.session.id}'`),"0");
  report("checkout-pending read policy and atomic close revocation without old secret replay");
  for(const secret of [...secrets,...allCookies].filter(Boolean))assert(!logs.includes(secret),"Credential leaked in server logs (value withheld)");
  report("captured server logs contain no fixture code/password/email/token/service key");
} finally {
  if(server&&server.exitCode===null)await new Promise(resolve=>{server.once("exit",resolve);server.kill();});
  const qrIds=JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.qr_codes where store_id in('${stores.join("','")}')`));
  const browserHashes=[...guestTokens].map(hash);
  const buckets=[...users.flatMap(id=>[`owner:${id}:read`,`owner:${id}:write`]),...qrIds.flatMap(id=>[`verify-qr:${id}`,...browserHashes.flatMap(h=>[`read:${h}:${id}`,`verify:${h}:${id}`])])].map(hash);
  sql(`begin;delete from public.guest_access where store_id in('${stores.join("','")}');delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
    delete from public.operation_requests where store_id in('${stores.join("','")}');delete from public.outbox_events where aggregate_id in(select id from public.table_sessions where store_id in('${stores.join("','")}'));
    delete from public.table_sessions where store_id in('${stores.join("','")}');delete from public.qr_codes where store_id in('${stores.join("','")}');delete from public.dining_tables where store_id in('${stores.join("','")}');
    delete from public.owner_members where store_id in('${stores.join("','")}');delete from public.stores where id in('${stores.join("','")}');
    delete from public.guest_browser_contexts where token_hash in('${browserHashes.join("','")}');delete from public.security_rate_buckets where key_hash in('${buckets.join("','")}');commit;`);
  for(const id of users)assert(!(await admin.auth.admin.deleteUser(id)).error,"Test Auth cleanup failed");
  logs="";console.log("CLEANUP fixture stores/users/sessions removed; test Next server stopped");
}
