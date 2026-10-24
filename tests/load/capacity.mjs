/** LOCAL ONLY. Bounded HTTP read bursts + real PostgREST checkout + signed TEST ONLY callbacks. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { PayOS } from '@payos/node';
import { request as httpRequest } from 'node:http';

const phase=process.argv[2];assert(['before','after'].includes(phase),'Use before|after');
const status=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(status.API_URL,'http://127.0.0.1:15421');
const sql=s=>execFileSync('docker',['exec','-i','supabase_db_qr-ordering-p1c02-local','psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const hash=s=>createHash('sha256').update(s).digest('hex');
const store=randomUUID(),qr=randomUUID(),category=randomUUID(),item=randomUUID(),port=13026,base=`http://localhost:${port}`;
let actor=randomUUID();const authSecrets=[];
const checksum='TEST_ONLY_P6_CHECKSUM',account='12345678',clientId='TEST_ONLY_P6_CLIENT';
const sdk=new PayOS({clientId,apiKey:'TEST_ONLY_P6_API',checksumKey:checksum,logLevel:'off'});
const db=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const devices=Array.from({length:200},()=>{const token=randomBytes(32).toString('base64url');return{token,browserHash:hash(token),grantProof:hash(`qr-guest-grant-v1:${token}`)};});
const tx=[],orderIds=[],commands=[],measurements=[];let server,logs='';
const env={...process.env,OWNER_BOOTSTRAP_ENABLED:'false',APP_ORIGIN:base,APP_BASE_URL:base,
 NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY||status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
 PAYOS_STORE_ID:store,PAYOS_CLIENT_ID:clientId,PAYOS_API_KEY:'TEST_ONLY_P6_API',PAYOS_CHECKSUM_KEY:checksum,PAYOS_ACCOUNT_NUMBER:account,PAYMENT_RETURN_ORIGIN:'https://test.invalid',
 PICKUP_ENCRYPTION_KEYS:JSON.stringify({v1:randomBytes(32).toString('base64')}),PICKUP_HMAC_KEYS:JSON.stringify({v1:randomBytes(32).toString('base64')})};
async function burst(label,n,work){
 const started=performance.now(),times=[],codes={},errors={};let bytes=0;
 const results=await Promise.all(Array.from({length:n},async(_,i)=>{
  const at=performance.now();try{const r=await work(i);times.push(performance.now()-at);codes[r.status]=(codes[r.status]||0)+1;bytes+=r.bytes||0;if(r.error)errors[r.error]=(errors[r.error]||0)+1;return r;}
  catch(error){times.push(performance.now()-at);codes.network_error=(codes.network_error||0)+1;const reason=error instanceof SyntaxError?'INVALID_JSON':error?.name||'REQUEST_FAILURE';errors[reason]=(errors[reason]||0)+1;if(i===0)console.log(JSON.stringify({label,failure:reason,message:String(error.message).slice(0,160)}));return null;}
 }));
 const durationMs=performance.now()-started;times.sort((a,b)=>a-b);const p=q=>Math.round(times[Math.min(times.length-1,Math.ceil(q*times.length)-1)]);
 const m={label,concurrency:n,requests:n,durationMs:Math.round(durationMs),rps:Math.round(n/durationMs*1000),p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99),statusCounts:codes,errorCodes:errors,bytes};measurements.push(m);console.log(JSON.stringify(m));return results;
}
async function call(path,d,body,headers={},method=body===undefined?'GET':'POST'){
 // Fresh socket per request: synchronous psql fixture setup can outlive Next's
 // keepalive timeout; never mistake an Undici stale POST socket for app failure.
 return new Promise((resolve,reject)=>{
  const req=httpRequest(base+path,{agent:false,method,headers:{accept:'application/json',...(d?{cookie:`__Host-qr_guest=${d.token}`} : {}),...(body?{'content-type':'application/json'}:{}),...headers}},res=>{
   let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>{try{const payload=text?JSON.parse(text):null;resolve({status:res.statusCode,payload,bytes:Buffer.byteLength(text),etag:res.headers.etag,error:payload?.error?.code});}catch(e){reject(e);}});
  });req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('HTTP_TIMEOUT')));req.end(body===undefined?undefined:JSON.stringify(body));
 });
}
try{
 let occupied=false;try{await fetch(base,{signal:AbortSignal.timeout(300)});occupied=true;}catch{}assert(!occupied,'Preserving occupied port');
 await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>out+=b);p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error('Load build failed (no fixture/provider request made)')));});
 const email=`p6-load-${actor}@example.invalid`,password=randomUUID()+'aA9!';authSecrets.push(email,password);
 const created=await db.auth.admin.createUser({email,password,email_confirm:true});assert(!created.error);actor=created.data.user.id;
 const auth=createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const signedIn=await auth.auth.signInWithPassword({email,password});assert(!signedIn.error);
 authSecrets.push(signedIn.data.session.access_token,signedIn.data.session.refresh_token);
 const ownerHeaders={cookie:`sb-127-auth-token=base64-${Buffer.from(JSON.stringify(signedIn.data.session)).toString('base64url')}`,origin:base};
 sql(`insert into public.stores(id,name) values('${store}','P6 LOAD TEST ONLY');
 insert into public.owner_members(store_id,auth_user_id) values('${store}','${actor}');
 insert into public.qr_codes(id,store_id,type,public_code) values('${qr}','${store}','takeaway','${qr}');
 insert into public.menu_categories(id,store_id,name) values('${category}','${store}','Load menu');
 insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${store}','${category}','Load coffee',35000);
 insert into public.menu_items(store_id,category_id,name,price_vnd) select '${store}','${category}','Item '||n,10000+n from generate_series(1,199)n;
 insert into public.menu_item_options(store_id,item_id,name,price_delta_vnd) select '${store}',i.id,'Option '||n,n*1000 from public.menu_items i cross join generate_series(1,5)n where i.store_id='${store}';
 insert into public.guest_browser_contexts(token_hash) values ${devices.map(d=>`('${d.browserHash}')`).join(',')};analyze public.menu_items;analyze public.menu_item_options;`);
 const explain=JSON.parse(sql(`explain(analyze,buffers,format json) select public.menu_snapshot('${store}',false,false)`));
 const revision=sql(`select menu_revision from public.stores where id='${store}'`);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname=127.0.0.1',`--port=${port}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 for(let i=0;;i++){try{await fetch(base,{signal:AbortSignal.timeout(500)});break;}catch{assert(i<100&&server.exitCode===null);await new Promise(r=>setTimeout(r,100));}}
 for(const n of [50,100,200]){
  const resolved=await burst('qr-resolve',n,i=>call(`/api/public/qr/${qr}`,devices[i]));assert(resolved.every(r=>r?.status===200));
  const menus=await burst('menu-read',n,i=>call(`/api/public/menu?qrCode=${qr}`,devices[i]));assert(menus.every(r=>r?.status===200&&r.payload.data.items.length===200));
  if(phase==='after'){
   const tag=menus[0].etag;assert(tag);
   const conditional=await burst('menu-revalidate',n,i=>call(`/api/public/menu?qrCode=${qr}`,devices[i],undefined,{'if-none-match':tag}));assert(conditional.every(r=>r?.status===304));
  }
 }
 const checkouts=await burst('takeaway-checkout-postgrest',50,async i=>{
  const command={qrCode:qr,clientRequestId:randomUUID(),menuRevision:revision,items:[{menuItemId:item,quantity:1,optionIds:[],note:null}],note:null};
  commands[i]=command;
  const {data,error}=await db.rpc('p4_checkout',{input:{command,browserHash:devices[i].browserHash,grantProof:devices[i].grantProof,configuredStoreId:store,accountNumber:account,channelHash:hash(clientId)}});
  return{status:error?500:data.error?409:201,payload:data,error:data?.error};
 });assert(checkouts.every(r=>r?.status===201));
 const orders=checkouts.map(r=>r.payload.data);orderIds.push(...orders.map(o=>o.id));assert.equal(new Set(orderIds).size,50);
 assert(orders.every(o=>o.ticketNo===null&&o.status==='pending_payment'));
 const references=JSON.parse(sql(`select json_agg(json_build_object('id',order_id,'reference',provider_reference)) from public.payment_intents where store_id='${store}'`));assert.equal(new Set(references.map(r=>r.reference)).size,50);
 let admission='not applicable to baseline';
 if(phase==='after'){
  assert.equal((await call('/api/owner/settings/ordering')).status,401);
  const get=await call('/api/owner/settings/ordering',null,undefined,ownerHeaders);assert.equal(get.status,200);
  const current=get.payload.data;
  const pauseCommand={requestId:randomUUID(),expectedVersion:current.version,acceptTakeaway:false};
  const denied=await call('/api/owner/settings/ordering',null,pauseCommand,{...ownerHeaders,origin:'https://untrusted.invalid'},'PATCH');assert.equal(denied.status,403);
  const paused=await call('/api/owner/settings/ordering',null,pauseCommand,ownerHeaders,'PATCH');assert.equal(paused.status,200);
  assert.equal(paused.payload.data.availability.find(a=>a.orderType==='takeaway').acceptingOrders,false);
  const input={command:{...commands[0],clientRequestId:randomUUID()},browserHash:devices[0].browserHash,grantProof:devices[0].grantProof,configuredStoreId:store,accountNumber:account,channelHash:hash(clientId)};
  const blocked=await db.rpc('p4_checkout',{input});assert.equal(blocked.data.error,'STORE_NOT_ACCEPTING_ORDERS');
  const replay=await burst('same-key-checkout-retry-while-paused',20,async()=>{
   const r=await db.rpc('p4_checkout',{input:{...input,command:commands[0]}});
   assert.equal(r.data.data.id,orders[0].id);return{status:r.error?500:200};
  });assert(replay.every(r=>r?.status===200));
  const conflict=await db.rpc('p4_checkout',{input:{...input,command:{...commands[0],note:'different'}}});assert.equal(conflict.data.error,'DUPLICATE_REQUEST_CONFLICT');
  admission='PASS: real owner Auth GET/PATCH, missing Auth 401, cross-origin 403; pause blocks before intent; 20 same-key retries return original; concurrent pause/signed callbacks accept all previously issued intents';
 }
 const signed=await Promise.all(orders.map(async o=>{
  const data={orderCode:Number(references.find(r=>r.id===o.id).reference),amount:o.totalVnd,description:'TEST ONLY',accountNumber:account,reference:randomUUID(),transactionDateTime:sql("select to_char(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS')"),currency:'VND',paymentLinkId:randomBytes(16).toString('hex'),code:'00',desc:'success'};tx.push(data.reference);
  return{code:'00',success:true,data,signature:await sdk.crypto.createSignatureFromObj(data,checksum)};
 }));
 let pendingPause;
 if(phase==='after'){
  const scope={storeId:store,ownerId:actor};
  const current=(await db.rpc('p6_ordering_execute',{action:'get',input:scope})).data.data;
  const resumed=(await db.rpc('p6_ordering_execute',{action:'patch',input:{...scope,requestId:randomUUID(),expectedVersion:current.version,acceptTakeaway:true}})).data.data;
  pendingPause={...scope,requestId:randomUUID(),expectedVersion:resumed.version,acceptTakeaway:false};
 }
 const processing=burst('signed-test-webhooks',50,i=>call('/api/webhooks/payments/payos',null,signed[i]));
 if(pendingPause){const pause=await db.rpc('p6_ordering_execute',{action:'patch',input:pendingPause});assert.equal(pause.data.data.acceptTakeaway,false);}
 const paid=await processing;assert(paid.every(r=>r?.status===200));
 const duplicate=await burst('duplicate-signed-webhooks',50,i=>call('/api/webhooks/payments/payos',null,signed[i]));assert(duplicate.every(r=>r?.status===200));
 const tracking=await burst('private-pickup-tracking',50,i=>call(`/api/public/orders/${orders[i].id}?includePickup=true`,devices[i]));
 assert(tracking.every((r,i)=>r?.status===200&&r.payload.data.order.id===orders[i].id&&/^\d{6}$/.test(r.payload.data.pickup.code)));
 const foreign=await call(`/api/public/orders/${orders[0].id}?includePickup=true`,devices[1]);assert.equal(foreign.status,404);
 const counts=JSON.parse(sql(`select json_build_object('orders',(select count(*) from public.orders where store_id='${store}'),'payments',(select count(*) from public.payments where store_id='${store}'),'tickets',(select count(distinct(service_date,ticket_no)) from public.orders where store_id='${store}' and ticket_no is not null),'pickup',(select count(*) from public.pickup_credentials where store_id='${store}'),'failedInbox',(select count(*) from public.payment_webhook_inbox where transaction_id in('${tx.join("','")}') and state='failed'))`));
 assert.deepEqual(counts,{orders:50,payments:50,tickets:50,pickup:50,failedInbox:0});
 const ownerQueueExplain=JSON.parse(sql(`explain(analyze,buffers,format json) select id from public.orders where store_id='${store}' and status in('accepted','preparing','ready') order by service_date,ticket_no,id limit 51`));
 for(const secret of [status.SERVICE_ROLE_KEY,...devices.map(d=>d.token),checksum,...authSecrets])assert(!logs.includes(secret));
 const evidence={phase,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirtyWorktree:true,environment:'Loopback Docker PostgreSQL/PostgREST + Next production HTTP; 200 menu items, 1000 options; burst concurrency, not sustained load',provider:'TEST ONLY signatures validated by production parser; no provider network/charge; checkout via PostgREST seam to avoid provisioning network',measurements,counts,crossBuyer:'404',admission,menuExplain:explain,ownerQueueExplain,filtersAndCart:'client-only operations; no separate backend endpoint',status:'PASS'};
 mkdirSync('docs/handoffs/evidence',{recursive:true});writeFileSync(`docs/handoffs/evidence/P6_C02_${phase.toUpperCase()}.json`,JSON.stringify(evidence,null,2)+'\n');
}finally{
 if(server&&server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}
 const intentIds=JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.payment_intents where store_id='${store}'`));
 sql(`begin;set local session_replication_role=replica;
 delete from public.security_rate_buckets where key_hash in(select encode(extensions.digest(k,'sha256'),'hex') from unnest(array[${devices.flatMap(d=>[
  `read:${d.browserHash}:${qr}`,...orderIds.map(id=>`order-read:${d.browserHash}:${id}`),
  `takeaway-create:${d.browserHash}:${store}`,...intentIds.map(id=>`payment-read:${d.browserHash}:${id}`)
 ]).map(k=>`'${k}'`).join(',')},'owner:${actor}:read','owner:${actor}:write','takeaway-create-store:${store}']::text[])k);
 delete from public.outbox_events where aggregate_id='${store}' or aggregate_id in(select id from public.orders where store_id='${store}') or aggregate_id in(select id from public.payment_intents where store_id='${store}');
 delete from public.operation_requests where store_id='${store}';
 delete from public.pickup_attempt_log where store_id='${store}';delete from public.pickup_credentials where store_id='${store}';delete from public.order_events where store_id='${store}';delete from public.payments where store_id='${store}';
 delete from public.payment_webhook_inbox where transaction_id in('${tx.join("','")}');delete from public.payment_intents where store_id='${store}';delete from public.takeaway_requests where store_id='${store}';delete from public.order_items where store_id='${store}';delete from public.orders where store_id='${store}';delete from public.ticket_counters where store_id='${store}';
 delete from public.menu_item_options where store_id='${store}';delete from public.menu_items where store_id='${store}';delete from public.menu_categories where store_id='${store}';delete from public.qr_codes where store_id='${store}';delete from public.owner_members where store_id='${store}';delete from public.stores where id='${store}';delete from auth.users where id='${actor}';delete from public.guest_browser_contexts where token_hash in('${devices.map(d=>d.browserHash).join("','")}');commit;`);
}
