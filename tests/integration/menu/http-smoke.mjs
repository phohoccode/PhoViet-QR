/** Production Next route smoke against isolated local Supabase. No browser claim. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const status=JSON.parse(execFileSync(process.execPath,["node_modules/supabase/dist/supabase.js","status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
assert.equal(status.API_URL,"http://127.0.0.1:15421");
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const sql=input=>execFileSync("docker",["exec","-i","supabase_db_qr-ordering-p1c02-local","psql","-U","postgres","-d","postgres","-At","-v","ON_ERROR_STOP=1"],{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
const base="http://localhost:13004",stores=[randomUUID(),randomUUID()],table=randomUUID(),codes=[randomBytes(16).toString("hex"),randomBytes(16).toString("hex")];
const users=[],password=`${randomUUID()}aA!9`,emails=[0,1,2].map(()=>`menu-http-${randomUUID()}@example.invalid`),contexts=new Set();
const secretValues=[status.SERVICE_ROLE_KEY,password,...emails];
const env={...process.env,OWNER_BOOTSTRAP_ENABLED:"false",NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY||status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,APP_ORIGIN:base};
let server,logs="";
const jar=()=>new Map();const owners=[jar(),jar(),jar()],guest=jar();
async function call(path,cookies=guest,method="GET",body,origin=base){
 const headers={Accept:"application/json",...(method==="GET"?{}:{origin,"content-type":"application/json"})};
 if(cookies.size)headers.cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join("; ");
 const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(15000)});
 for(const value of response.headers.getSetCookie()){
  const pair=value.split(";")[0],n=pair.indexOf("="),name=pair.slice(0,n),token=pair.slice(n+1);cookies.set(name,token);
  if(name==="__Host-qr_guest"){
   secretValues.push(token);
   contexts.add(await import("node:crypto").then(c=>c.createHash("sha256").update(token).digest("hex")));
  }
 }
 assert.match(response.headers.get("cache-control")||"",/no-store/);
 return response;
}
async function ok(path,cookies,method,body,expected=200){const r=await call(path,cookies,method,body);const j=await r.json();assert.equal(r.status,expected,JSON.stringify(j));assert.equal(j.error,null);return j.data;}
async function fail(path,cookies,method,body,statusCode,code,origin){const r=await call(path,cookies,method,body,origin);const j=await r.json();assert.equal(r.status,statusCode);assert.equal(j.data,null);assert.equal(j.error.code,code);return r;}
const runBuild=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stdout.resume();child.stderr.resume();child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(Error("Build failed; raw output withheld")));});
try{
 let occupied=false;try{await fetch(base,{signal:AbortSignal.timeout(800)});occupied=true;}catch{}assert(!occupied,"Test port occupied; existing process preserved");
 await runBuild();console.log("PASS production build (local test env)");
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname=127.0.0.1","--port=13004"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 server.stdout.on("data",value=>{logs+=value;});server.stderr.on("data",value=>{logs+=value;});
 for(let i=0;;i++){try{await fetch(base,{signal:AbortSignal.timeout(1000)});break;}catch{assert(i<60&&server.exitCode===null,"Test server failed");await new Promise(r=>setTimeout(r,250));}}
 for(const email of emails){const r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert(!r.error&&r.data.user);users.push(r.data.user.id);}
 sql(`begin;insert into public.stores(id,name) values('${stores[0]}','HTTP menu A'),('${stores[1]}','HTTP menu B');insert into public.owner_members(store_id,auth_user_id) values('${stores[0]}','${users[0]}'),('${stores[1]}','${users[1]}');
 insert into public.dining_tables(id,store_id,label) values('${table}','${stores[0]}','HTTP menu table');insert into public.qr_codes(store_id,type,table_id,public_code) values('${stores[0]}','table','${table}','${codes[0]}'),('${stores[0]}','takeaway',null,'${codes[1]}');commit;`);
 for(const[index,cookies]of owners.entries()){
  const c=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const r=await c.auth.signInWithPassword({email:emails[index],password});assert(!r.error&&r.data.session);
  cookies.set("sb-127-auth-token",`base64-${Buffer.from(JSON.stringify(r.data.session)).toString("base64url")}`);secretValues.push(r.data.session.access_token,r.data.session.refresh_token);
 }
 await fail("/api/owner/menu",guest,"GET",undefined,401,"UNAUTHORIZED");
 await fail("/api/owner/menu/categories",owners[2],"GET",undefined,403,"FORBIDDEN");
 await fail("/api/owner/menu",guest,"POST",{},401,"UNAUTHORIZED");
 console.log("PASS guest and authenticated nonmember deny owner routes");
 const empty=await ok(`/api/public/menu?qrCode=${codes[0]}`,guest);assert.deepEqual(empty.items,[]);assert.deepEqual(empty.categories,[]);
 await fail("/api/public/menu?storeId=forged",guest,"GET",undefined,400,"VALIDATION_ERROR");
 await fail(`/api/public/menu?qrCode=${codes[0]}&qrCode=${codes[1]}`,guest,"GET",undefined,400,"VALIDATION_ERROR");
 await fail("/api/public/menu?qrCode=missing",guest,"GET",undefined,404,"INVALID_QR");
 const catCommand={requestId:randomUUID(),name:"Coffee",sortOrder:1,active:true};
 let category=await ok("/api/owner/menu/categories",owners[0],"POST",catCommand,201);
 assert.deepEqual(await ok("/api/owner/menu/categories",owners[0],"POST",catCommand,201),category);
 const other=await ok("/api/owner/menu/categories",owners[1],"POST",{...catCommand,requestId:randomUUID()},201);
 let itemCommand={requestId:randomUUID(),categoryId:category.id,name:"Coffee",description:null,priceVnd:29000,imageUrl:null,available:true,active:true,options:[{name:"Milk",priceDeltaVnd:3000,available:true}]};
 let item=await ok("/api/owner/menu",owners[0],"POST",itemCommand,201);
 assert.deepEqual(await ok("/api/owner/menu",owners[0],"POST",itemCommand,201),item);
 assert.deepEqual((await ok("/api/owner/menu",owners[1])).items,[]);
 await fail(`/api/owner/menu/${item.id}`,owners[1],"PATCH",{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,priceVnd:1},404,"RESOURCE_NOT_FOUND");
 await fail("/api/owner/menu",owners[0],"POST",{...itemCommand,requestId:randomUUID(),categoryId:other.id},404,"RESOURCE_NOT_FOUND");
 await fail("/api/owner/menu/categories",owners[0],"POST",{...catCommand,requestId:randomUUID()},422,"VALIDATION_ERROR");
 await fail("/api/owner/menu",owners[0],"POST",{...itemCommand,requestId:randomUUID()},403,"FORBIDDEN","https://untrusted.example.invalid");
 for(const extra of [{priceVnd:-1},{priceVnd:2.5},{quantity:1},{storeId:stores[1]},{imageUrl:"javascript:alert(1)"},{imageUrl:"https://localhost/private"},{options:[{name:"Milk",priceDeltaVnd:-1,available:true}]}])
  await fail("/api/owner/menu",owners[0],"POST",{...itemCommand,requestId:randomUUID(),...extra},400,"VALIDATION_ERROR");
 console.log("PASS owner CRUD, tenant isolation, command replay, CSRF and strict pricing/image/input checks");
 const publicA=await ok(`/api/public/menu?qrCode=${codes[0]}`,guest),publicB=await ok(`/api/public/menu?qrCode=${codes[1]}`,guest);
 assert.deepEqual(publicA.items,publicB.items);assert.equal(publicA.menuRevision,publicB.menuRevision);
 assert(!JSON.stringify(publicA).match(/storeId|ownerId|codeHash|tokenHash|session|active/));
 const resolutionA=await ok(`/api/public/qr/${codes[0]}`,guest),resolutionB=await ok(`/api/public/qr/${codes[1]}`,guest);
 assert.equal(resolutionA.mode,"dine_in");assert.equal(resolutionB.mode,"takeaway");
 const before=item.updatedAt,patch={requestId:randomUUID(),expectedUpdatedAt:before,priceVnd:31000,available:false};
 item=await ok(`/api/owner/menu/${item.id}`,owners[0],"PATCH",patch);
 assert.deepEqual(await ok(`/api/owner/menu/${item.id}`,owners[0],"PATCH",patch),item);
 await fail(`/api/owner/menu/${item.id}`,owners[0],"PATCH",{...patch,requestId:randomUUID()},409,"INVALID_STATE_TRANSITION");
 const latest=await ok(`/api/public/menu?qrCode=${codes[0]}`,guest);assert.notEqual(latest.menuRevision,publicA.menuRevision);assert.equal(latest.items[0].priceVnd,31000);assert.equal(latest.items[0].available,false);
 const badOption={requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,priceVnd:1,options:[{id:randomUUID(),name:"bad",priceDeltaVnd:0,available:true}]};
 await fail(`/api/owner/menu/${item.id}`,owners[0],"PATCH",badOption,422,"VALIDATION_ERROR");
 assert.equal((await ok("/api/owner/menu",owners[0])).items[0].priceVnd,31000);
 item=await ok(`/api/owner/menu/${item.id}`,owners[0],"PATCH",{requestId:randomUUID(),expectedUpdatedAt:item.updatedAt,options:[]});
 assert.equal(item.options[0].available,false);assert.deepEqual((await ok(`/api/public/menu?qrCode=${codes[0]}`,guest)).items[0].options,[]);
 category=await ok(`/api/owner/menu/categories/${category.id}`,owners[0],"PATCH",{requestId:randomUUID(),expectedUpdatedAt:category.updatedAt,active:false});
 assert.deepEqual((await ok(`/api/public/menu?qrCode=${codes[0]}`,guest)).items,[]);
 assert.equal((await ok("/api/owner/menu",owners[0])).items.length,1);
 assert.deepEqual((await ok("/api/owner/menu?includeInactive=false",owners[0])).items,[]);
 console.log("PASS public QR modes, hidden/unavailable semantics, CAS, option retention and immediate no-store revision updates");
 sql(`update public.qr_codes set active=false where public_code='${codes[0]}'`);
 await fail(`/api/public/menu?qrCode=${codes[0]}`,guest,"GET",undefined,404,"INVALID_QR");
 sql(`update public.qr_codes set active=true where public_code='${codes[0]}';update public.dining_tables set active=false where id='${table}'`);
 await fail(`/api/public/menu?qrCode=${codes[0]}`,guest,"GET",undefined,404,"INVALID_QR");
 const ownerRateKey=`owner:${users[0]}:read`;
 sql(`insert into public.security_rate_buckets(key_hash,attempts,resets_at) values(encode(extensions.digest('${ownerRateKey}','sha256'),'hex'),120,clock_timestamp()+interval '1 minute') on conflict(key_hash) do update set attempts=120,resets_at=clock_timestamp()+interval '1 minute'`);
 const limited=await fail("/api/owner/menu",owners[0],"GET",undefined,429,"RATE_LIMITED");assert(limited.headers.get("retry-after"));
 for(const cookie of guest.values()){secretValues.push(cookie);const tokenHash=await import("node:crypto").then(c=>c.createHash("sha256").update(cookie).digest("hex"));contexts.add(tokenHash);}
 for(const value of secretValues)assert(!logs.includes(value),"Sensitive value in server logs (withheld)");
 console.log("PASS disabled QR/table, shared DB rate limiter, no credential leakage in captured logs");
}finally{
 if(server&&server.exitCode===null)await new Promise(resolve=>{server.once("exit",resolve);server.kill();});
 const qrIds=JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.qr_codes where store_id in('${stores.join("','")}')`));
 sql(`begin;delete from public.menu_audit_log where store_id in('${stores.join("','")}');delete from public.operation_requests where store_id in('${stores.join("','")}');delete from public.outbox_events where aggregate_id in('${stores.join("','")}');
 delete from public.menu_item_options where store_id in('${stores.join("','")}');delete from public.menu_items where store_id in('${stores.join("','")}');delete from public.menu_categories where store_id in('${stores.join("','")}');delete from public.qr_codes where store_id in('${stores.join("','")}');delete from public.dining_tables where store_id in('${stores.join("','")}');delete from public.owner_members where store_id in('${stores.join("','")}');delete from public.stores where id in('${stores.join("','")}');
 delete from public.guest_browser_contexts where token_hash in('${[...contexts].join("','")}');
 delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${[...users.flatMap(id=>[`owner:${id}:read`,`owner:${id}:write`]),...[...contexts].flatMap(h=>qrIds.map(id=>`read:${h}:${id}`))].map(k=>`'${k}'`).join(",")}]::text[]) k);commit;`);
 for(const id of users)assert(!(await admin.auth.admin.deleteUser(id)).error);console.log("CLEANUP isolated menu fixture and test server removed");
}
