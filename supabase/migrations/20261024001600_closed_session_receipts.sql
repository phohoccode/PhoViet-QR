-- P5-HF01. Forward/additive; preserve payment/order/PIN evidence. No provider IO.
-- A receipt capability reuses the existing hashed proof, never the six-digit PIN.
begin;
do $preflight$
declare x record; actual text;
begin
 for x in select * from (values
  ('public.p5_session_execute(text,jsonb)','32699e88b97d7620ef3e93e960ba0f0d',array['search_path=pg_catalog','lock_timeout=3s']),
  ('public.p5_session_bill(uuid)','23f6fbaedf265284b759f745efd7026c',array['search_path=pg_catalog']),
  ('public.p2_session_guard()','7edd4dc9086a50ae32a920f274a6aa0c',array['search_path=pg_catalog'])
 ) t(signature,digest,config) loop
  select md5(replace(p.prosrc,chr(13),'')) into actual from pg_proc p where p.oid=to_regprocedure(x.signature);
  if actual is distinct from x.digest or exists(select 1 from pg_proc p where p.oid=to_regprocedure(x.signature)
   and (p.prosecdef or p.proconfig is distinct from x.config)) then
   raise exception 'P5-HF01 preflight: unexpected definition for %; audit before retry',x.signature;
  end if;
 end loop;
end; $preflight$;

-- Deployment policy, changed by a DB administrator, not a guest/owner payload.
-- Changes affect future grants only. Browser context/cookie expiry is an upper bound.
create table public.session_receipt_policy (
 singleton boolean primary key default true check(singleton),
 ttl_seconds integer not null default 172800 check(ttl_seconds between 60 and 2592000)
);
insert into public.session_receipt_policy(singleton) values(true);
create table public.session_receipts (
 id uuid primary key references public.session_settlements(id) on delete restrict,
 store_id uuid not null, table_session_id uuid not null unique,
 receipt_version bigint not null check(receipt_version>0),
 bill jsonb not null check(jsonb_typeof(bill)='object'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(store_id,table_session_id) references public.table_sessions(store_id,id) on delete restrict,
 unique(store_id,id)
);
create table public.session_receipt_access (
 guest_access_id uuid primary key references public.guest_access(id) on delete restrict,
 store_id uuid not null, table_session_id uuid not null,
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 browser_context_hash text not null references public.guest_browser_contexts(token_hash),
 expires_at timestamptz not null, revoked_at timestamptz,
 foreign key(store_id,table_session_id) references public.table_sessions(store_id,id) on delete restrict,
 unique(browser_context_hash,table_session_id)
);
create index session_receipt_access_scope on public.session_receipt_access(table_session_id,browser_context_hash);
create table public.session_receipt_read_audit (
 id bigint generated always as identity primary key,
 browser_hash text not null, requested_session_id uuid,
 outcome text not null check(outcome in('allowed','denied','expired','not_ready')),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.session_receipt_policy enable row level security;
alter table public.session_receipts enable row level security;
alter table public.session_receipt_access enable row level security;
alter table public.session_receipt_read_audit enable row level security;
revoke all on public.session_receipt_policy,public.session_receipts,public.session_receipt_access,public.session_receipt_read_audit from public,anon,authenticated,service_role;
grant select on public.session_receipt_policy to service_role;
grant select,insert on public.session_receipts,public.session_receipt_access,public.session_receipt_read_audit to service_role;
grant update(revoked_at) on public.session_receipt_access to service_role;
grant usage on sequence public.session_receipt_read_audit_id_seq to service_role;
create trigger session_receipt_immutable before update or delete on public.session_receipts for each row execute function public.p3_item_guard();

-- Preserve the full audited guard, including immutability and PIN generation.
-- Capture only grants still valid BEFORE the original ordering revoke.
create or replace function public.p2_session_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare changed_pin boolean;
begin
 if old.status='closed' and new is distinct from old then raise check_violation using message='Closed session is immutable'; end if;
 if new.store_id<>old.store_id or new.table_id<>old.table_id then raise check_violation using message='Session scope is immutable'; end if;
 changed_pin:=(new.code_hash,new.pin_key_id,new.pin_generation,new.pin_issued_at) is distinct from (old.code_hash,old.pin_key_id,old.pin_generation,old.pin_issued_at);
 if changed_pin then
  if old.status<>'open' or new.status<>'open' or new.pin_generation<>old.pin_generation+1 or new.pin_key_id is null
   or new.pin_issued_at is null or new.pin_issued_at<=coalesce(old.pin_issued_at,'-infinity'::timestamptz) then
   raise check_violation using message='Invalid PIN generation transition';
  end if;
 end if;
 if new.status<>old.status or changed_pin then new.version:=old.version+1; end if;
 if new.status='closed' then
  new.closed_at:=coalesce(new.closed_at,clock_timestamp());
  if old.status<>'closed' then
   insert into public.session_receipt_access(guest_access_id,store_id,table_session_id,token_hash,browser_context_hash,expires_at)
   select g.id,g.store_id,g.scope_id,g.token_hash,g.browser_context_hash,
    least(b.expires_at,p.settled_at+make_interval(secs=>policy.ttl_seconds))
   from public.guest_access g join public.guest_browser_contexts b on b.token_hash=g.browser_context_hash
    join public.session_settlements p on p.table_session_id=g.scope_id and p.store_id=g.store_id and p.status='succeeded'
    cross join public.session_receipt_policy policy
   where g.scope_id=new.id and g.store_id=new.store_id and g.revoked_at is null
    and g.expires_at>clock_timestamp() and b.expires_at>clock_timestamp()
   for update of g
   on conflict do nothing;
  end if;
  update public.guest_access set revoked_at=coalesce(revoked_at,clock_timestamp()) where scope_id=new.id;
  delete from public.session_code_deliveries where session_id=new.id;
 end if;
 return new;
end; $$;

create function public.p5_store_receipt(target uuid) returns void language plpgsql set search_path=pg_catalog as $$
declare p public.session_settlements; s public.table_sessions; snapshot jsonb; table_ref jsonb;
begin
 select * into p from public.session_settlements where table_session_id=target and status='succeeded';
 if not found then return; end if;
 select * into s from public.table_sessions where id=target and store_id=p.store_id;
 if s.status<>'closed' then raise check_violation using message='Receipt requires settled closed session'; end if;
 -- Prepared table label is historical, even if the physical table was renamed.
 select bill->'table' into table_ref from public.session_checkout_snapshots where id=p.checkout_id and store_id=p.store_id;
 snapshot:=public.p5_session_bill(target);
 snapshot:=snapshot||jsonb_build_object('table',table_ref,'orders',coalesce((select jsonb_agg(value||jsonb_build_object('table',table_ref) order by ordinal)
  from jsonb_array_elements(snapshot->'orders') with ordinality x(value,ordinal)),'[]'::jsonb),
  'kind','paid_receipt','receiptId',p.id,'receiptVersion',s.version,'currency','VND',
  'canAcceptMoreOrders',false,'canSettle',false);
 insert into public.session_receipts(id,store_id,table_session_id,receipt_version,bill)
  values(p.id,p.store_id,s.id,s.version,snapshot) on conflict(table_session_id) do nothing;
end; $$;
create function public.p5_receipt_on_close() returns trigger language plpgsql set search_path=pg_catalog as $$
declare r public.session_receipts; event_uuid uuid;
begin
 if new.status='closed' and old.status<>'closed' and public.p5_session_paid(new.id) then
  perform public.p5_store_receipt(new.id);
  select * into r from public.session_receipts where table_session_id=new.id;
  event_uuid:=gen_random_uuid();
  insert into public.outbox_events(id,topic,aggregate_id,version,payload) values(event_uuid,'table_session.receipt_ready',new.id,r.receipt_version,
   jsonb_build_object('eventId',event_uuid,'aggregateId',new.id,'version',r.receipt_version,'receiptVersion',r.receipt_version,'receiptId',r.id,'type','table_session.receipt_ready'));
 end if;
 return null;
end; $$;
create trigger session_receipt_on_close after update on public.table_sessions for each row execute function public.p5_receipt_on_close();

-- A committed successful ledger must always have exactly its final receipt,
-- including privileged writes that bypass the normal command executor.
create function public.p5_receipt_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare p public.session_settlements; r public.session_receipts; s public.table_sessions;
begin
 select * into p from public.session_settlements where table_session_id=new.table_session_id;
 if not found then raise check_violation using message='Receipt requires successful settlement'; end if;
 select * into r from public.session_receipts where table_session_id=p.table_session_id;
 select * into s from public.table_sessions where id=p.table_session_id;
 if r.id is distinct from p.id or r.store_id is distinct from p.store_id or s.status is distinct from 'closed'
  or r.receipt_version is distinct from s.version or r.bill->>'kind' is distinct from 'paid_receipt'
  or r.bill->>'receiptId' is distinct from p.id::text or r.bill->>'billVersion' is distinct from p.bill_version
  or (r.bill->>'totalVnd')::bigint is distinct from p.total_vnd
  or (r.bill->>'settledAt')::timestamptz is distinct from p.settled_at
  or r.bill->>'paymentMethod' is distinct from p.payment_method
  or r.bill->'session'->>'id' is distinct from s.id::text
  or r.bill->'session'->>'status' is distinct from 'closed' or r.bill->'session'->>'paymentStatus' is distinct from 'paid'
  or r.bill->'canAcceptMoreOrders' is distinct from 'false'::jsonb or r.bill->'canSettle' is distinct from 'false'::jsonb then
  raise check_violation using message='Invalid final receipt';
 end if;
 return null;
end; $$;
create constraint trigger session_receipt_consistency after insert on public.session_receipts deferrable initially deferred for each row execute function public.p5_receipt_guard();
create constraint trigger session_settlement_receipt_required after insert on public.session_settlements deferrable initially deferred for each row execute function public.p5_receipt_guard();

-- Compatibility: build historical receipts from existing successful evidence.
-- Restore read scope ONLY when tuple transaction IDs prove that closure, ledger
-- and grant revoke occurred in the SAME transaction, inside the close/audit
-- time window, before grant expiry. Special/ambiguous/later-revoked XIDs fail closed. Never un-revoke
-- ordering grants. Existing open pre-HF grants are captured on their future close.
do $backfill$
declare target uuid;
begin
 for target in select p.table_session_id from public.session_settlements p join public.table_sessions s on s.id=p.table_session_id and s.store_id=p.store_id
  where p.status='succeeded' and s.status='closed' loop
  perform public.p5_store_receipt(target);
 end loop;
end; $backfill$;
insert into public.session_receipt_access(guest_access_id,store_id,table_session_id,token_hash,browser_context_hash,expires_at)
 select g.id,g.store_id,g.scope_id,g.token_hash,g.browser_context_hash,least(b.expires_at,p.settled_at+make_interval(secs=>policy.ttl_seconds))
 from public.guest_access g join public.table_sessions s on s.id=g.scope_id and s.store_id=g.store_id
 join public.session_settlements p on p.table_session_id=s.id and p.store_id=s.store_id and p.status='succeeded'
 join public.session_settlement_audit_log audit on audit.table_session_id=p.table_session_id and audit.store_id=p.store_id
  and audit.request_id=p.request_id and audit.action='confirm_received'
 join public.guest_browser_contexts b on b.token_hash=g.browser_context_hash cross join public.session_receipt_policy policy
 where s.status='closed' and g.revoked_at>=s.closed_at and g.revoked_at<=audit.created_at and g.expires_at>s.closed_at
  and g.created_at<s.closed_at and g.xmin=s.xmin and s.xmin=p.xmin and s.xmin::text not in('0','1','2')
  and b.expires_at>clock_timestamp() and p.settled_at+make_interval(secs=>policy.ttl_seconds)>clock_timestamp()
 on conflict do nothing;

alter function public.p5_session_execute(text,jsonb) rename to p5_ordering_session_execute;
create function public.p5_session_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare target uuid:=(input->>'sessionId')::uuid; s public.table_sessions; g public.session_receipt_access;
 result jsonb; failure text; retry integer; browser text:=input->>'browserHash'; proof text:=input->>'grantProof';
begin
 if action not in('guest_bill','guest_receipt','owner_receipt') then return public.p5_ordering_session_execute(action,input); end if;
 if action='owner_receipt' then
  result:=public.p5_ordering_session_execute('owner_bill',input);
  if result ? 'error' then return result; end if;
  select bill into result from public.session_receipts where table_session_id=target and store_id=(input->>'storeId')::uuid;
  if not found then return public.p2_fail('RECEIPT_NOT_READY'); end if;
  return jsonb_build_object('data',result);
 end if;
 if browser is null or browser !~ '^[a-f0-9]{64}$' or proof is null or proof !~ '^[a-f0-9]{64}$'
  or not exists(select 1 from public.guest_browser_contexts where token_hash=browser and expires_at>clock_timestamp()) then return public.p2_fail('UNAUTHORIZED'); end if;
 -- Limit before resource lookup, including guesses of nonexistent UUIDs/QRs.
 retry:=public.p2_rate('receipt-read:'||browser,60);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 if action='guest_bill' then
  -- A QR is only a locator. Pick the newest session for which THIS browser has
  -- proof; a fresh live session cannot hide a former guest's paid receipt.
  select ts.* into s from public.table_sessions ts join public.qr_codes q on q.table_id=ts.table_id and q.store_id=ts.store_id
  where q.public_code=input->>'qrCode' and q.type='table' and (target is null or ts.id=target)
   and (exists(select 1 from public.guest_access a where a.scope_id=ts.id and a.store_id=ts.store_id and a.browser_context_hash=browser
    and a.token_hash=encode(extensions.digest(proof||':'||ts.id::text,'sha256'),'hex') and ts.status<>'closed')
    or exists(select 1 from public.session_receipt_access a where a.table_session_id=ts.id and a.store_id=ts.store_id and a.browser_context_hash=browser
    and a.token_hash=encode(extensions.digest(proof||':'||ts.id::text,'sha256'),'hex')))
  order by ts.opened_at desc,ts.id desc limit 1 for share of ts;
  if not found then
   insert into public.session_receipt_read_audit(browser_hash,requested_session_id,outcome) values(browser,target,'denied');
   return public.p2_fail(case when target is null then 'SESSION_REQUIRED' else 'RECEIPT_ACCESS_DENIED' end);
  end if;
  if s.status<>'closed' then return public.p5_ordering_session_execute('guest_bill',input); end if;
  target:=s.id;
 end if;
 select * into g from public.session_receipt_access a where a.table_session_id=target and a.browser_context_hash=browser
  and a.token_hash=encode(extensions.digest(proof||':'||target::text,'sha256'),'hex') for share;
 if not found or g.revoked_at is not null then
  -- Distinguish not-yet-paid only for the proven active session holder.
  if action='guest_receipt' and exists(select 1 from public.guest_access a join public.table_sessions ts on ts.id=a.scope_id and ts.store_id=a.store_id
   where a.scope_id=target and a.browser_context_hash=browser and a.revoked_at is null and a.expires_at>clock_timestamp()
    and ts.status in('open','checkout_pending') and a.token_hash=encode(extensions.digest(proof||':'||target::text,'sha256'),'hex')) then
   failure:='RECEIPT_NOT_READY';
  else failure:='RECEIPT_ACCESS_DENIED'; end if;
 elsif g.expires_at<=clock_timestamp() then failure:='RECEIPT_EXPIRED';
 else
  select bill into result from public.session_receipts where table_session_id=g.table_session_id and store_id=g.store_id;
  if not found then failure:='RECEIPT_NOT_READY'; end if;
 end if;
 insert into public.session_receipt_read_audit(browser_hash,requested_session_id,outcome) values(browser,target,
  case failure when 'RECEIPT_EXPIRED' then 'expired' when 'RECEIPT_NOT_READY' then 'not_ready' when 'RECEIPT_ACCESS_DENIED' then 'denied' else 'allowed' end);
 if failure is not null then return public.p2_fail(failure); end if;
 return jsonb_build_object('data',result);
end; $$;
revoke all on function public.p5_store_receipt(uuid),public.p5_receipt_on_close(),public.p5_receipt_guard(),public.p5_session_execute(text,jsonb),public.p5_ordering_session_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p5_store_receipt(uuid),public.p5_receipt_on_close(),public.p5_receipt_guard(),public.p5_session_execute(text,jsonb),public.p5_ordering_session_execute(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
