-- P2-HF01. Atomic/additive. Legacy sessions and existing grants are preserved.
begin;

-- Do not replace an unknown deployed guard/projection/resolver. All three
-- fingerprints refer to audited001-008 bodies, normalized for LF/CRLF only.
do $$ begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.p2_execute(text,jsonb)')
  and md5(replace(prosrc,E'\r\n',E'\n'))='f80bcdba939630909ac8cf32cc8b8280'
  and not prosecdef and proconfig=array['search_path=pg_catalog'])
 or not exists(select 1 from pg_proc where oid=to_regprocedure('public.p2_session_guard()')
  and md5(replace(prosrc,E'\r\n',E'\n'))='188803db150df7b436818407e8248725' and not prosecdef and proconfig=array['search_path=pg_catalog'])
 or not exists(select 1 from pg_proc where oid=to_regprocedure('public.p2_session_view(public.table_sessions)')
  and md5(replace(prosrc,E'\r\n',E'\n'))='077784347b61a30aef5c68be383a39df' and not prosecdef and proconfig=array['search_path=pg_catalog']) then
  raise exception 'P2-HF01 preflight: unexpected session/resolver baseline; inspect definitions before migrating';
 end if;
end; $$;

alter table public.table_sessions
 add column pin_key_id text,
 add column pin_generation bigint not null default 0,
 add column pin_issued_at timestamptz;
alter table public.table_sessions add constraint table_session_pin_metadata check (
 (pin_generation=0 and pin_key_id is null and pin_issued_at is null)
 or (pin_generation between 1 and 9007199254740991 and pin_key_id is not null and pin_key_id ~ '^[A-Za-z0-9_-]{1,40}$' and pin_issued_at is not null)
);
-- code_hash now holds the keyed, context-bound HMAC for PIN sessions.
-- The existing encrypted artifact table remains the only ciphertext storage.
alter table public.session_code_deliveries add column pin_generation bigint
 check(pin_generation between 1 and 9007199254740991);
alter table public.session_code_deliveries add constraint pin_delivery_shape check (
 pin_generation is null or (artifact ?& array['iv','tag','ciphertext']
 and jsonb_typeof(artifact->'iv')='string' and jsonb_typeof(artifact->'tag')='string' and jsonb_typeof(artifact->'ciphertext')='string'
 and artifact->>'iv' ~ '^[A-Za-z0-9+/]{16}$' and artifact->>'tag' ~ '^[A-Za-z0-9+/]{22}==$' and artifact->>'ciphertext' ~ '^[A-Za-z0-9+/]{8}$')
);
create table public.table_pin_audit_log (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 session_id uuid not null,
 actor_id uuid not null references auth.users(id) on delete restrict,
 action text not null check(action in('PIN_REVEALED','PIN_ROTATED')),
 generation bigint not null check(generation>0),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(store_id,session_id) references public.table_sessions(store_id,id) on delete restrict
);
alter table public.table_pin_audit_log enable row level security;
revoke all on public.table_pin_audit_log from public,anon,authenticated,service_role;
grant select,insert on public.table_pin_audit_log to service_role;

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
  update public.guest_access set revoked_at=coalesce(revoked_at,clock_timestamp()) where scope_id=new.id;
  delete from public.session_code_deliveries where session_id=new.id;
 end if;
 return new;
end; $$;

create or replace function public.p2_session_view(s public.table_sessions) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',s.id,'status',s.status,'openedAt',s.opened_at,'closedAt',s.closed_at,
  'orderCount',0,'totalVnd',0,'paymentStatus','unpaid','version',s.version,
  'pinState',case when s.status='closed' or s.code_expires_at<=statement_timestamp() then 'expired' when s.pin_generation=0 then 'legacy' else 'active' end);
$$;

-- Retain the audited resolver/guest reader verbatim; do not string-patch it.
alter function public.p2_execute(text,jsonb) rename to p2_execute_legacy;
create function public.p2_execute(action text,input jsonb) returns jsonb
language plpgsql set search_path=pg_catalog as $$
begin
 -- Old application instances must not create long codes or verify hash-only
 -- inputs after deployment. Read-only resolver/guest behavior is unchanged.
 if action in('open','verify') then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
 return public.p2_execute_legacy(action,input);
end; $$;

-- Durable fixed-window limiter with separate short burst and minute buckets.
create function public.p2_pin_rate(k text,maximum integer,seconds integer) returns integer
language plpgsql set search_path=pg_catalog as $$
declare b public.security_rate_buckets;
begin
 insert into public.security_rate_buckets(key_hash,attempts,resets_at)
 values(encode(extensions.digest(k,'sha256'),'hex'),1,clock_timestamp()+make_interval(secs=>seconds))
 on conflict(key_hash) do update set
  attempts=case when security_rate_buckets.resets_at<=clock_timestamp() then 1 else security_rate_buckets.attempts+1 end,
  resets_at=case when security_rate_buckets.resets_at<=clock_timestamp() then clock_timestamp()+make_interval(secs=>seconds) else security_rate_buckets.resets_at end
 returning * into b;
 if b.attempts>maximum then return greatest(1,ceil(extract(epoch from b.resets_at-clock_timestamp()))::integer); end if;
 return 0;
end; $$;

create function public.p2_pin_execute(action text,input jsonb) returns jsonb
language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare
 sid uuid:=(input->>'storeId')::uuid; actor uuid:=(input->>'ownerId')::uuid;
 s public.table_sessions; t public.dining_tables; q public.qr_codes; st public.stores;
 d public.session_code_deliveries; op public.operation_requests; g public.guest_access;
 command uuid; fingerprint text; result jsonb; snapshot jsonb; retry integer:=0; n integer; generation bigint;
 browser text:=input->>'browserHash'; proof text:=input->>'grantProof'; ref jsonb;
begin
 if action not in('open','inspect','reveal','rotate','locate','verify') then return public.p2_fail('VALIDATION_ERROR'); end if;
 if action in('locate','verify') then
  -- Both calls are server-only. Locator metadata is never an HTTP response.
  select * into q from public.qr_codes where public_code=input->>'qrCode' and active and retired_at is null;
  if not found or q.type<>'table' then return public.p2_fail('INVALID_QR'); end if;
  perform 1 from public.stores where id=q.store_id for key share;
  perform 1 from public.dining_tables where id=q.table_id and store_id=q.store_id and active for share;
  if not found then return public.p2_fail('INVALID_QR'); end if;
  select * into q from public.qr_codes where id=q.id and active and retired_at is null for share;
  if not found then return public.p2_fail('INVALID_QR'); end if;
  select * into s from public.table_sessions where table_id=q.table_id and store_id=q.store_id and status in('open','checkout_pending') for share;
  if action='locate' then
   return jsonb_build_object('data',case when s.id is null then null else jsonb_build_object('storeId',s.store_id,'sessionId',s.id,'generation',s.pin_generation,'pepperId',s.pin_key_id) end);
  end if;
  if browser is null or browser !~ '^[a-f0-9]{64}$' or proof is null or proof !~ '^[a-f0-9]{64}$' then return public.p2_fail('UNAUTHORIZED'); end if;
  if coalesce((input->>'newBrowser')::boolean,false) then insert into public.guest_browser_contexts(token_hash) values(browser) on conflict do nothing; end if;
  if not exists(select 1 from public.guest_browser_contexts where token_hash=browser and expires_at>clock_timestamp()) then return public.p2_fail('UNAUTHORIZED'); end if;
  -- Uniform key order. Source IP is supplied only by the trusted server ingress.
  -- No store-wide/shared-IP ban: source limits are scoped to this QR.
  retry:=public.p2_pin_rate('pin-table-burst:'||q.id,20,10);
  n:=public.p2_pin_rate('pin-table-minute:'||q.id,60,60);retry:=greatest(retry,n);
  if input->>'ipHash' is not null then
   n:=public.p2_pin_rate('pin-ip-burst:'||(input->>'ipHash')||':'||q.id,10,10);retry:=greatest(retry,n);
   n:=public.p2_pin_rate('pin-ip-minute:'||(input->>'ipHash')||':'||q.id,30,60);retry:=greatest(retry,n);
  end if;
  n:=public.p2_pin_rate('pin-device-burst:'||browser||':'||q.id,5,10);retry:=greatest(retry,n);
  -- Keep the existing five WRONG guesses/minute policy for each device+QR.
  select greatest(1,ceil(extract(epoch from resets_at-clock_timestamp()))::integer) into n from public.security_rate_buckets
   where key_hash=encode(extensions.digest('verify:'||browser||':'||q.id,'sha256'),'hex') and attempts>=5 and resets_at>clock_timestamp();
  retry:=greatest(retry,coalesce(n,0));
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  if s.id is null or s.code_expires_at<=clock_timestamp() then return public.p2_fail('SESSION_EXPIRED'); end if;
  if s.status<>'open' then return public.p2_fail('SESSION_CHECKOUT_PENDING'); end if;
  if s.pin_generation=0 or (input->>'sessionId')::uuid is distinct from s.id
   or (input->>'generation')::bigint is distinct from s.pin_generation
   or not public.p2_equal_hash(s.code_hash,input->>'verifier') then
   perform public.p2_rate('verify:'||browser||':'||q.id,5);
   return public.p2_fail('INVALID_SESSION_CODE');
  end if;
  insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at)
   values(s.store_id,s.id,encode(extensions.digest(proof||':'||s.id::text,'sha256'),'hex'),browser,least(s.code_expires_at,clock_timestamp()+interval '12 hours'))
   on conflict(browser_context_hash,scope_id) do update set expires_at=excluded.expires_at where guest_access.revoked_at is null;
  select * into g from public.guest_access where scope_id=s.id and browser_context_hash=browser;
  if g.revoked_at is not null then return public.p2_fail('SESSION_EXPIRED'); end if;
  return public.p2_execute_legacy('resolve',jsonb_build_object('qrCode',q.public_code,'browserHash',browser,'grantProof',proof));
 end if;
 if not exists(select 1 from public.owner_members where store_id=sid and auth_user_id=actor and role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action in('open','rotate') then
  command:=(input->>'requestId')::uuid;
  if command is null then return public.p2_fail('VALIDATION_ERROR'); end if;
  fingerprint:=encode(extensions.digest(jsonb_build_object('action',action,'tableId',input->>'tableId','sessionId',case when action='rotate' then input->>'sessionId' end,'expectedVersion',input->'expectedVersion')::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(sid::text||':'||command,0));
  select * into op from public.operation_requests where store_id=sid and request_id=command;
  if found then
   if op.actor_id<>actor then return public.p2_fail('FORBIDDEN'); end if;
   if op.operation<>'table_pin.'||action or op.request_fingerprint<>fingerprint then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
   select * into s from public.table_sessions where id=(op.result_json->>'sessionId')::uuid and store_id=sid for share;
   if s.status='closed' or s.code_expires_at<=clock_timestamp() then return public.p2_fail('SESSION_EXPIRED'); end if;
   if s.status<>'open' then return public.p2_fail('SESSION_CHECKOUT_PENDING'); end if;
   if s.pin_generation<>(op.result_json->>'generation')::bigint then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
   select * into d from public.session_code_deliveries where session_id=s.id;
   return jsonb_build_object('data',op.result_json,'delivery',d.artifact,'keyId',d.key_id);
  end if;
 end if;
 retry:=public.p2_rate('owner:'||actor||':'||case when action in('open','rotate') then 'write' else 'read' end,case when action in('open','rotate') then 30 else 120 end);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 -- Audit/operation FKs also touch stores; acquire the parent gate BEFORE table
 -- locks to avoid a cycle with lifecycle writers waiting for those tables.
 perform 1 from public.stores where id=sid for no key update;
 if action='open' then
  select * into t from public.dining_tables where id=(input->>'tableId')::uuid and store_id=sid for update;
  if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  if not t.active or exists(select 1 from public.table_sessions where table_id=t.id and status in('open','checkout_pending')) then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
  insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at,pin_key_id,pin_generation,pin_issued_at)
   values((input->>'sessionId')::uuid,sid,t.id,input->>'verifier',clock_timestamp()+interval '24 hours',input->>'pepperId',1,clock_timestamp()) returning * into s;
  insert into public.session_code_deliveries(session_id,key_id,artifact,expires_at,pin_generation) values(s.id,input->>'keyId',input->'artifact',s.code_expires_at,1);
  ref:=jsonb_build_object('eventId',gen_random_uuid(),'aggregateId',s.id,'version',s.version,'type','table_session.opened');
  insert into public.outbox_events(id,topic,aggregate_id,version,payload) values((ref->>'eventId')::uuid,'table_session.opened',s.id,s.version,ref);
 else
  -- Locator does not grant rights. Table before session matches QR lifecycle;
  -- reveal SHARE and rotate UPDATE serialize with close and one another.
  select * into s from public.table_sessions where id=(input->>'sessionId')::uuid and store_id=sid;
  if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  select * into t from public.dining_tables where id=s.table_id and store_id=sid for share;
  if action='rotate' then select * into s from public.table_sessions where id=s.id for update;
  else select * into s from public.table_sessions where id=s.id for share; end if;
  if s.status='closed' or s.code_expires_at<=clock_timestamp() then return public.p2_fail('SESSION_EXPIRED'); end if;
  if s.status<>'open' then return public.p2_fail('SESSION_CHECKOUT_PENDING'); end if;
  select * into d from public.session_code_deliveries where session_id=s.id;
  if action='rotate' then
   if s.version is distinct from (input->>'expectedVersion')::bigint then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
   generation:=s.pin_generation+1;
   if generation is distinct from (input->>'generation')::bigint then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
   update public.table_sessions set code_hash=input->>'verifier',pin_key_id=input->>'pepperId',pin_generation=generation,
    pin_issued_at=greatest(clock_timestamp(),coalesce(pin_issued_at,'-infinity'::timestamptz)+interval '1 microsecond') where id=s.id returning * into s;
   insert into public.session_code_deliveries(session_id,key_id,artifact,expires_at,pin_generation) values(s.id,input->>'keyId',input->'artifact',s.code_expires_at,generation)
    on conflict(session_id) do update set key_id=excluded.key_id,artifact=excluded.artifact,expires_at=excluded.expires_at,pin_generation=excluded.pin_generation;
   insert into public.table_pin_audit_log(store_id,session_id,actor_id,action,generation) values(sid,s.id,actor,'PIN_ROTATED',generation);
   ref:=jsonb_build_object('eventId',gen_random_uuid(),'aggregateId',s.id,'version',s.version,'type','table_session.updated');
   insert into public.outbox_events(id,topic,aggregate_id,version,payload) values((ref->>'eventId')::uuid,'table_session.updated',s.id,s.version,ref);
  elsif action='reveal' then
   if s.pin_generation=0 then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
   insert into public.table_pin_audit_log(store_id,session_id,actor_id,action,generation) values(sid,s.id,actor,'PIN_REVEALED',s.pin_generation);
  end if;
 end if;
 if not exists(select 1 from public.owner_members where store_id=sid and auth_user_id=actor and role='owner') then raise insufficient_privilege using message='Owner membership changed'; end if;
 snapshot:=jsonb_build_object('table',jsonb_build_object('id',t.id,'label',t.label),'session',public.p2_session_view(s));
 result:=snapshot||jsonb_build_object('storeId',sid,'sessionId',s.id,'tableId',t.id,'generation',s.pin_generation,'sessionVersion',s.version,'issuedAt',s.pin_issued_at,'expiresAt',s.code_expires_at);
 if action in('open','rotate') then
  insert into public.operation_requests(store_id,request_id,actor_id,operation,request_fingerprint,result_json) values(sid,command,actor,'table_pin.'||action,fingerprint,result);
  return jsonb_build_object('data',result,'delivery',input->'artifact','keyId',input->>'keyId');
 end if;
 return jsonb_build_object('data',result,'delivery',d.artifact,'keyId',d.key_id);
end; $$;

revoke all on public.table_sessions,public.session_code_deliveries from public,anon,authenticated;
revoke all on function public.p2_execute(text,jsonb),public.p2_execute_legacy(text,jsonb),public.p2_pin_execute(text,jsonb),public.p2_pin_rate(text,integer,integer) from public,anon,authenticated;
grant execute on function public.p2_execute(text,jsonb),public.p2_execute_legacy(text,jsonb),public.p2_pin_execute(text,jsonb),public.p2_pin_rate(text,integer,integer) to service_role;
commit;
