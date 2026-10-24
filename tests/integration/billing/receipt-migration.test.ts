import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

it('HF01 forward migration is atomic, audits drift, backfills only proven closure revokes, and applies configured TTL without rewriting original evidence',()=>{
 const db=`receipt_${randomUUID().replaceAll('-','')}`;
 const sql=(database:string,input:string)=>execFileSync('docker',['exec','-i','supabase_db_qr-ordering-p1c02-local','psql','-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const run=(s:string)=>sql(db,s), hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 const migration=readFileSync('supabase/migrations/20261024001600_closed_session_receipts.sql','utf8');
 sql('postgres',`create database ${db}`);
 try {
  run('create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<'20261024001600').sort()) {
   run(readFileSync(`supabase/migrations/${file}`,'utf8'));
   if(file.includes('foundation'))run('revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;');
  }
  const actor=randomUUID(),store=randomUUID(),browser='a'.repeat(64),proof='b'.repeat(64);
  run(`insert into auth.users(id) values('${actor}');insert into public.stores(id,name) values('${store}','HF TEST');insert into public.owner_members(store_id,auth_user_id) values('${store}','${actor}');insert into public.guest_browser_contexts(token_hash) values('${browser}');`);
  const rpc=(action:string,input:object)=>JSON.parse(run(`set role service_role;select public.p5_session_execute('${action}','${JSON.stringify(input)}')`));
  const create=()=>{
   const session=randomUUID(),table=randomUUID(),label=`Historical ${table}`;
   run(`insert into public.dining_tables(id,store_id,label) values('${table}','${store}','${label}');insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session}','${store}','${table}','${'c'.repeat(64)}',clock_timestamp()+interval '24 hours');
    insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at) values('${store}','${session}','${hash(`${proof}:${session}`)}','${browser}',clock_timestamp()+interval '6 hours');`);
   return {session,table,label};
  };
  const settle=(session:string,revokeAfter=false)=>{
   const scope={storeId:store,ownerId:actor,sessionId:session};
   const b=rpc('owner_bill',scope).data;
   const prepared=rpc('begin_checkout',{...scope,requestId:randomUUID(),expectedVersion:b.session.version,expectedBillVersion:b.billVersion}).data.bill;
   const command={...scope,requestId:randomUUID(),expectedVersion:prepared.session.version,expectedBillVersion:prepared.billVersion,paymentMethod:'cash',receivedConfirmed:true};
   const r=revokeAfter?JSON.parse(run(`begin;select public.p5_session_execute('confirm_received','${JSON.stringify(command)}');update public.guest_access set revoked_at=clock_timestamp() where scope_id='${session}';commit;`)):rpc('confirm_received',command);
   expect(r.error).toBeUndefined();return r;
  };
  const valid=create(),prior=create(),later=create(),unpaid=create(),expired=create();
  run(`update public.guest_access set revoked_at=clock_timestamp() where scope_id='${prior.session}';update public.guest_access set expires_at=clock_timestamp()-interval '1 minute' where scope_id='${expired.session}'`);
  for(const f of [valid,prior,expired])settle(f.session);
  settle(later.session,true); // same XID as close, explicitly revoked AFTER its audit
  run(`update public.table_sessions set status='closed' where id='${unpaid.session}'`);
  const before=run(`select jsonb_build_object('sessions',(select jsonb_agg(to_jsonb(s) order by id) from public.table_sessions s),'grants',(select jsonb_agg(to_jsonb(g) order by id) from public.guest_access g),'settlements',(select jsonb_agg(to_jsonb(p) order by id) from public.session_settlements p))`);
  run(migration.replace(/commit;\s*$/,'rollback;'));
  expect(run("select to_regclass('public.session_receipts') is null")).toBe('t');
  for(const signature of ['p5_session_execute(text,jsonb)','p5_session_bill(uuid)','p2_session_guard()']) {
   const def=run(`select pg_get_functiondef('public.${signature}'::regprocedure)`);
   run(def.replace('AS $function$','AS $function$\n-- TEST DRIFT'));
   expect(()=>run(migration)).toThrow();
   expect(run("select to_regclass('public.session_receipts') is null")).toBe('t');run(def);
  }
  run(migration.replaceAll('\r\n','\n').replaceAll('\n','\r\n'));
  expect(run(`select jsonb_build_object('sessions',(select jsonb_agg(to_jsonb(s) order by id) from public.table_sessions s),'grants',(select jsonb_agg(to_jsonb(g) order by id) from public.guest_access g),'settlements',(select jsonb_agg(to_jsonb(p) order by id) from public.session_settlements p))`)).toBe(before);
  expect(run('select count(*) from public.session_receipts')).toBe('4');
  expect(run('select table_session_id from public.session_receipt_access')).toBe(valid.session);
  const guest=(sessionId:string)=>rpc('guest_receipt',{sessionId,browserHash:browser,grantProof:proof});
  expect(guest(valid.session).data).toMatchObject({kind:'paid_receipt',totalVnd:0,session:{status:'closed',paymentStatus:'paid'}});
  for(const f of [prior,later,expired,unpaid])expect(guest(f.session).error).toBe('RECEIPT_ACCESS_DENIED');
  run(`update public.dining_tables set label='New label' where id='${valid.table}'`);
  expect(guest(valid.session).data.table.label).toBe(valid.label);
  const future=create();run('update public.session_receipt_policy set ttl_seconds=60');settle(future.session);
  expect(run(`select extract(epoch from (a.expires_at-p.settled_at))::integer from public.session_receipt_access a join public.session_settlements p on p.table_session_id=a.table_session_id where a.table_session_id='${future.session}'`)).toBe('60');
  for(const table of ['session_receipts','session_receipt_access','session_receipt_read_audit','session_receipt_policy'])
   expect(run(`select relrowsecurity,has_table_privilege('anon','public.${table}','select'),has_table_privilege('authenticated','public.${table}','insert'),has_table_privilege('service_role','public.${table}','delete') from pg_class where oid='public.${table}'::regclass`)).toBe('t|f|f|f');
  for(const signature of ['p5_session_execute(text,jsonb)','p5_ordering_session_execute(text,jsonb)','p5_store_receipt(uuid)','p5_receipt_on_close()'])
   expect(run(`select prosecdef,proconfig[1],has_function_privilege('anon','public.${signature}','execute'),has_function_privilege('authenticated','public.${signature}','execute') from pg_proc where oid='public.${signature}'::regprocedure`)).toBe('f|search_path=pg_catalog|f|f');
 } finally {sql('postgres',`drop database ${db} with(force)`);}
});
