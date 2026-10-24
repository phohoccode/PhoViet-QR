-- P6-C02. Atomic, forward-only: no order/payment/ticket/pickup rows rewritten.
begin;
set local lock_timeout='3s';
do $preflight$
declare e record; p record;
begin
 for e in select * from (values
 ('public.p3_order_execute(text,jsonb)','7fe1ae6d69fff5288a647502ccc3b3a3'),
 ('public.p4_checkout(jsonb)','b79040e8486bc7315d1377eafc486d8b'),
 ('public.p2_pin_execute(text,jsonb)','61d10b3b9615011cb10ab11232926643'),
 ('public.p2_menu_execute(text,jsonb)','4ba1cf289fe9551d0450165add93dfb7'),
 ('public.p2_execute(text,jsonb)','991be6b89cd9f97ee623c810e8b33a4b'),
 ('public.p5_session_bill(uuid)','23f6fbaedf265284b759f745efd7026c'),
 ('public.p2_rate(text,integer)','eb4ebfbd449729c29016cafc6287de94'),
 ('public.p2_pin_rate(text,integer,integer)','2e433855a60a13f62d68abbe55fb4d8c'),
 ('public.p4_payment_execute(text,jsonb)','e4cf95c3e1283ba548e6e7e0dd379b6b'),
 ('public.p4_emit(public.orders,text)','cf84bf7a41a9224e15ba26fc44ee473f')
 ) x(signature,digest) loop
  select * into p from pg_proc where oid=to_regprocedure(e.signature);
  -- Audited Production checkout: lacks the store limiter and uses legacy
  -- event/outbox inserts. Normalize that exact body below; reject other drift.
  if not found or (md5(replace(p.prosrc,chr(13),'')) is distinct from e.digest
   and not(e.signature='public.p4_checkout(jsonb)' and md5(replace(p.prosrc,chr(13),''))='2457e0ec02d73b9a53ed2ed23ba651eb')) or p.prosecdef
   or p.proconfig is distinct from (case when e.signature in('public.p4_checkout(jsonb)','public.p2_pin_execute(text,jsonb)','public.p4_payment_execute(text,jsonb)')
    then array['search_path=pg_catalog','lock_timeout=3s'] else array['search_path=pg_catalog'] end) then
   raise exception 'P6-C02 preflight: audit deployed definition for % before retry',e.signature;
  end if;
 end loop;
end; $preflight$;

-- Converge the audited legacy checkout to 010 before applying any P6 edits.
-- This changes definitions only; existing order/event/payment evidence stays.
do $legacy_checkout$
declare def text; actual text;
begin
 select md5(replace(prosrc,chr(13),'')) into actual from pg_proc
  where oid='public.p4_checkout(jsonb)'::regprocedure;
 if actual='2457e0ec02d73b9a53ed2ed23ba651eb' then
  def:=replace(pg_get_functiondef('public.p4_checkout(jsonb)'::regprocedure),chr(13),'');
  -- Explicit LF separators also work when this migration is pasted with CRLF.
  def:=replace(def,
   ' insert into public.order_events(store_id,order_id,event_type,version) values(st.id,o.id,''order.created'',o.version);'||E'\n'||
   ' insert into public.outbox_events(topic,aggregate_id,version,payload) values(''order.created'',o.id,o.version,jsonb_build_object(''aggregateId'',o.id,''version'',o.version,''type'',''order.created''));',
   ' perform public.p4_emit(o,''order.created'');');
  def:=replace(def,' if not st.accepting_orders then',
   ' retry:=public.p2_rate(''takeaway-create-store:''||st.id,300);'||E'\n'||
   ' if retry>0 then return jsonb_build_object(''error'',''RATE_LIMITED'',''retryAfterSeconds'',retry); end if;'||E'\n'||
   ' if not st.accepting_orders then');
  execute def;
  select md5(replace(prosrc,chr(13),'')) into actual from pg_proc
   where oid='public.p4_checkout(jsonb)'::regprocedure;
  if actual is distinct from 'b79040e8486bc7315d1377eafc486d8b' then
   raise exception 'P6-C02: legacy checkout normalization failed';
  end if;
 end if;
end; $legacy_checkout$;

alter table public.stores add column accept_dine_in boolean not null default true,
 add column accept_takeaway boolean not null default true, add column ordering_paused_at timestamptz;
grant update(accepting_orders,accept_dine_in,accept_takeaway,ordering_paused_at) on public.stores to service_role;

-- Shared configuration, admin-managed. Prefix overrides are explicit, bounded,
-- and never writable by guests/owners. Existing defaults remain at call sites.
create table public.capacity_rate_policy (
 prefix text primary key check(prefix ~ '^[a-z-]+:$'),
 maximum integer not null check(maximum between 1 and 10000),
 window_seconds integer not null check(window_seconds between 1 and 60)
);
insert into public.capacity_rate_policy values
 ('read:',60,60),('order-read:',60,60),('payment-read:',60,60),('receipt-read:',60,60),
 ('order-create:',10,60),('takeaway-create:',10,60),('takeaway-create-store:',300,60),
 ('pin-table-burst:',20,10),('pin-table-minute:',60,60),('pin-ip-burst:',10,10),('pin-ip-minute:',30,60),
 ('pin-device-burst:',5,10),('verify:',5,60),('owner-read:',120,60),('owner-write:',30,60);
alter table public.capacity_rate_policy enable row level security;
revoke all on public.capacity_rate_policy from public,anon,authenticated,service_role;
grant select on public.capacity_rate_policy to service_role;

create or replace function public.p2_pin_rate(k text,maximum integer,seconds integer) returns integer
language plpgsql set search_path=pg_catalog as $$
declare b public.security_rate_buckets; policy public.capacity_rate_policy;
begin
 select * into policy from public.capacity_rate_policy where prefix=case when split_part(k,':',1)='owner'
  then 'owner-'||split_part(k,':',3)||':' else split_part(k,':',1)||':' end;
 maximum:=coalesce(policy.maximum,maximum); seconds:=coalesce(policy.window_seconds,seconds);
 if k is null or maximum not between 1 and 10000 or seconds not between 1 and 60 then raise invalid_parameter_value; end if;
 insert into public.security_rate_buckets(key_hash,attempts,resets_at)
 values(encode(extensions.digest(k,'sha256'),'hex'),1,clock_timestamp()+make_interval(secs=>seconds))
 on conflict(key_hash) do update set
  attempts=case when security_rate_buckets.resets_at<=clock_timestamp() then 1 else least(10001,security_rate_buckets.attempts+1) end,
  resets_at=case when security_rate_buckets.resets_at<=clock_timestamp() then clock_timestamp()+make_interval(secs=>seconds) else security_rate_buckets.resets_at end
 returning * into b;
 if b.attempts>maximum then return greatest(1,ceil(extract(epoch from b.resets_at-clock_timestamp()))::integer); end if;
 return 0;
end; $$;
create or replace function public.p2_rate(p_key text,p_limit integer) returns integer language sql set search_path=pg_catalog as $$
 select public.p2_pin_rate(p_key,p_limit,60);
$$;

create function public.p6_rate_cleanup() returns integer language plpgsql set search_path=pg_catalog as $$
declare n integer;
begin
 with expired as (select key_hash from public.security_rate_buckets where resets_at<clock_timestamp()-interval '1 hour'
  order by resets_at limit 1000 for update skip locked)
 delete from public.security_rate_buckets b using expired e where b.key_hash=e.key_hash;
 get diagnostics n=row_count; return n;
end; $$;

create function public.p6_availability(st public.stores,kind text) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('orderType',kind,'acceptingOrders',st.accepting_orders and
  case kind when 'dine_in' then st.accept_dine_in when 'takeaway' then st.accept_takeaway else false end)
  ||case when st.accepting_orders and case kind when 'dine_in' then st.accept_dine_in when 'takeaway' then st.accept_takeaway else false end
   then '{}'::jsonb else jsonb_build_object('reason','manual_pause') end;
$$;
create function public.p6_ordering_view(st public.stores) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('storeId',st.id,'version',st.version,'acceptingOrders',st.accepting_orders,
  'acceptDineIn',st.accept_dine_in,'acceptTakeaway',st.accept_takeaway,'pausedAt',st.ordering_paused_at,
  'availability',jsonb_build_array(public.p6_availability(st,'dine_in'),public.p6_availability(st,'takeaway')));
$$;
create function public.p6_ordering_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare sid uuid:=(input->>'storeId')::uuid; actor uuid:=(input->>'ownerId')::uuid;
 st public.stores; op public.operation_requests; command uuid; fingerprint text; result jsonb; retry integer; event_uuid uuid;
begin
 if action not in('get','patch') then return public.p2_fail('VALIDATION_ERROR'); end if;
 if not exists(select 1 from public.owner_members where store_id=sid and auth_user_id=actor and role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action='patch' then
  command:=(input->>'requestId')::uuid;
  if command is null or input->>'expectedVersion' is null or not(input ?| array['acceptingOrders','acceptDineIn','acceptTakeaway'])
   or exists(select 1 from jsonb_each(input) x where x.key in('acceptingOrders','acceptDineIn','acceptTakeaway') and jsonb_typeof(x.value)<>'boolean') then return public.p2_fail('VALIDATION_ERROR'); end if;
  fingerprint:=encode(extensions.digest((input-'storeId'-'ownerId'-'requestId')::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(sid::text||':'||command,0));
  select * into op from public.operation_requests where store_id=sid and request_id=command;
  if found then
   if op.actor_id<>actor then return public.p2_fail('FORBIDDEN'); end if;
   if op.operation<>'ordering.patch' or op.request_fingerprint<>fingerprint then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
   return jsonb_build_object('data',op.result_json);
  end if;
 end if;
 retry:=public.p2_rate('owner:'||actor||':'||case action when 'get' then 'read' else 'write' end,case action when 'get' then 120 else 30 end);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 select * into st from public.stores where id=sid for no key update;
 if not exists(select 1 from public.owner_members where store_id=sid and auth_user_id=actor and role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action='get' then return jsonb_build_object('data',public.p6_ordering_view(st)); end if;
 if st.version is distinct from (input->>'expectedVersion')::bigint then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
 update public.stores set accepting_orders=coalesce((input->>'acceptingOrders')::boolean,accepting_orders),
  accept_dine_in=coalesce((input->>'acceptDineIn')::boolean,accept_dine_in),accept_takeaway=coalesce((input->>'acceptTakeaway')::boolean,accept_takeaway),
  ordering_paused_at=case when coalesce((input->>'acceptingOrders')::boolean,accepting_orders)
   and coalesce((input->>'acceptDineIn')::boolean,accept_dine_in) and coalesce((input->>'acceptTakeaway')::boolean,accept_takeaway) then null else clock_timestamp() end
 where id=sid returning * into st;
 result:=public.p6_ordering_view(st); event_uuid:=gen_random_uuid();
 insert into public.operation_requests(store_id,request_id,actor_id,operation,request_fingerprint,result_json)
 values(sid,command,actor,'ordering.patch',fingerprint,result);
 insert into public.outbox_events(id,topic,aggregate_id,version,payload)
 values(event_uuid,'store.updated',sid,st.version,jsonb_build_object('eventId',event_uuid,'aggregateId',sid,'version',st.version,'type','store.updated'));
 return jsonb_build_object('data',result);
end; $$;

-- Narrow source transformations after the exact-body/config audit above.
-- pg_get_functiondef preserves invoker mode, signature and existing ACLs.
do $admission$
declare def text;
begin
 def:=pg_get_functiondef('public.p3_order_execute(text,jsonb)'::regprocedure);
 execute replace(def,'if not st.accepting_orders then','if not (st.accepting_orders and st.accept_dine_in) then');
 def:=pg_get_functiondef('public.p4_checkout(jsonb)'::regprocedure);
 execute replace(def,'if not st.accepting_orders then','if not (st.accepting_orders and st.accept_takeaway) then');
 def:=pg_get_functiondef('public.p5_session_bill(uuid)'::regprocedure);
 execute replace(def,'st.id=s.store_id and st.accepting_orders','st.id=s.store_id and st.accepting_orders and st.accept_dine_in');
 def:=pg_get_functiondef('public.p4_payment_execute(text,jsonb)'::regprocedure);
 -- Expiry housekeeping must never block payment recovery if it fails.
 execute replace(def,'if action=''jobs'' then','if action=''jobs'' then begin perform public.p6_rate_cleanup(); exception when others then null; end;');
end; $admission$;
alter function public.p3_order_execute(text,jsonb) set lock_timeout='3s';

create or replace function public.p2_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $$
declare result jsonb; st public.stores; kind text; availability jsonb;
begin
 if action in('open','verify') then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
 result:=public.p2_execute_legacy(action,input);
 if action='resolve' and not(result ? 'error') then
  select * into st from public.stores where id=(result->'data'->'store'->>'id')::uuid;
  kind:=case result->'data'->>'type' when 'table' then 'dine_in' else 'takeaway' end;
  availability:=public.p6_availability(st,kind);
  result:=jsonb_set(result,'{data,store,acceptingOrders}',availability->'acceptingOrders');
 end if;
 return result;
end; $$;

-- PIN: source/QR ceilings count WRONG verifiers only. A known-good verifier
-- bypasses shared source counters; a device with five failures stays locked.
do $pin$
declare def text; block_start integer; block_end integer; wrong_limits text;
begin
 def:=replace(pg_get_functiondef('public.p2_pin_execute(text,jsonb)'::regprocedure),chr(13),'');
 block_start:=strpos(def,'  -- Uniform key order.');
 block_end:=strpos(def,'  -- Keep the existing five WRONG');
 wrong_limits:=substring(def from strpos(def,'  retry:=public.p2_pin_rate(''pin-table-burst:') for block_end-strpos(def,'  retry:=public.p2_pin_rate(''pin-table-burst:'));
 def:=substring(def from 1 for block_start-1)||substring(def from block_end);
 def:=replace(def,'and attempts>=5 and resets_at>clock_timestamp()',
  'and attempts>=coalesce((select maximum from public.capacity_rate_policy where prefix=''verify:''),5) and resets_at>clock_timestamp()');
 def:=replace(def,'   perform public.p2_rate(''verify:''||browser||'':''||q.id,5);',
  wrong_limits||E'\n   n:=public.p2_rate(''verify:''||browser||'':''||q.id,5); retry:=greatest(retry,n);\n   if retry>0 then return jsonb_build_object(''error'',''RATE_LIMITED'',''retryAfterSeconds'',retry); end if;');
 def:=replace(def,'return public.p2_execute_legacy(''resolve'',','return public.p2_execute(''resolve'',');
 if block_start=0 or block_end=0 or wrong_limits is null then raise exception 'P6-C02 PIN source markers missing'; end if;
 execute def;
end; $pin$;

-- Conditional reads still authenticate/check QR/rate on EVERY request. A weak
-- validator ignores serverTime but includes menu revision + store version.
-- No shared HTTP cache, capability data, stale prices, or negative caching.
do $menu$
declare def text;
begin
 def:=replace(pg_get_functiondef('public.p2_menu_execute(text,jsonb)'::regprocedure),chr(13),'');
 def:=replace(def,' sid uuid; actor uuid;', ' st public.stores; tag text; sid uuid; actor uuid;');
 def:=replace(def,'  return jsonb_build_object(''data'',public.menu_snapshot(sid,false,false));', $replacement$
  select * into st from public.stores where id=sid;
  tag:='W/"p6-menu-v1-'||st.id||'-'||st.menu_revision||'-'||st.version||'-'||(resolved->'data'->>'type')||'"';
  if tag=input->>'ifNoneMatch' then return jsonb_build_object('data',jsonb_build_object('notModified',true,'etag',tag)); end if;
  -- Full projection and validator use one statement snapshot, including edits
  -- that committed between authorization and this SELECT.
  select public.menu_snapshot(sid,false,false)||jsonb_build_object('etag',
   'W/"p6-menu-v1-'||s.id||'-'||s.menu_revision||'-'||s.version||'-'||(resolved->'data'->>'type')||'"',
   'orderingAvailability',public.p6_availability(s,case resolved->'data'->>'type' when 'table' then 'dine_in' else 'takeaway' end))
   into result from public.stores s where s.id=sid;
  return jsonb_build_object('data',result);
$replacement$);
 execute def;
end; $menu$;

revoke all on function public.p6_rate_cleanup(),public.p6_availability(public.stores,text),public.p6_ordering_view(public.stores),public.p6_ordering_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p6_rate_cleanup(),public.p6_availability(public.stores,text),public.p6_ordering_view(public.stores),public.p6_ordering_execute(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
