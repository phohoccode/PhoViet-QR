-- P2-C01 additive migration; no reset, rename, orders, billing or payment schema.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to service_role;
grant execute on function extensions.digest(text,text) to service_role;
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  table_id uuid not null,
  status text not null default 'open' check (status in ('open','checkout_pending','closed')),
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  code_expires_at timestamptz not null,
  opened_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique (store_id,id),
  foreign key (store_id,table_id) references public.dining_tables(store_id,id),
  check ((status='closed') = (closed_at is not null)),
  check (code_expires_at > opened_at)
);
create unique index table_sessions_one_live on public.table_sessions(table_id) where status in ('open','checkout_pending');
create index table_sessions_table_status on public.table_sessions(store_id,table_id,status);

create table public.guest_browser_contexts (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default clock_timestamp()+interval '30 days',
  created_at timestamptz not null default clock_timestamp()
);
create table public.guest_access (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  scope_type text not null default 'table_session' check (scope_type='table_session'),
  scope_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  browser_context_hash text not null references public.guest_browser_contexts(token_hash),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (store_id,scope_id) references public.table_sessions(store_id,id),
  unique (browser_context_hash,scope_id)
);
create index guest_access_scope on public.guest_access(store_id,scope_id);
create index guest_access_expiry on public.guest_access(expires_at);

create table public.session_code_deliveries (
  session_id uuid primary key references public.table_sessions(id),
  key_id text not null,
  artifact jsonb not null check (jsonb_typeof(artifact)='object'),
  expires_at timestamptz not null
);
create table public.operation_requests (
  store_id uuid not null references public.stores(id),
  request_id uuid not null,
  actor_id uuid not null references auth.users(id),
  operation text not null,
  request_fingerprint text not null,
  result_json jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (store_id,request_id)
);
create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  aggregate_id uuid not null,
  version bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  attempt_count integer not null default 0
);
create table public.security_rate_buckets (
  key_hash text primary key,
  attempts integer not null,
  resets_at timestamptz not null
);
create index security_rate_bucket_expiry on public.security_rate_buckets(resets_at);

-- Foundation safety for future close commands: revoke in the same transaction.
-- No close/checkout API or settlement implementation is introduced here.
create function public.p2_session_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status='closed' and new is distinct from old then raise exception using errcode='23514',message='Closed session is immutable'; end if;
 if new.store_id<>old.store_id or new.table_id<>old.table_id or new.code_hash<>old.code_hash then raise exception using errcode='23514',message='Session scope/code is immutable'; end if;
 if new.status<>old.status then new.version:=old.version+1; end if;
 if new.status='closed' then
  new.closed_at:=coalesce(new.closed_at,clock_timestamp());
  update public.guest_access set revoked_at=coalesce(revoked_at,clock_timestamp()) where scope_id=new.id;
  delete from public.session_code_deliveries where session_id=new.id;
 end if;
 return new;
end; $$;
create trigger table_session_guard before update on public.table_sessions for each row execute function public.p2_session_guard();

alter table public.table_sessions enable row level security;
alter table public.guest_browser_contexts enable row level security;
alter table public.guest_access enable row level security;
alter table public.session_code_deliveries enable row level security;
alter table public.operation_requests enable row level security;
alter table public.outbox_events enable row level security;
alter table public.security_rate_buckets enable row level security;
revoke all on public.table_sessions,public.guest_browser_contexts,public.guest_access,
 public.session_code_deliveries,public.operation_requests,public.outbox_events,public.security_rate_buckets from public,anon,authenticated;
grant select,insert,update,delete on public.table_sessions,public.guest_browser_contexts,public.guest_access,
 public.session_code_deliveries,public.operation_requests,public.outbox_events,public.security_rate_buckets to service_role;
grant select on public.stores,public.owner_members,public.dining_tables,public.qr_codes to service_role;

create function public.p2_fail(p_code text) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('error',p_code);
$$;
create function public.p2_session_view(s public.table_sessions) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',s.id,'status',s.status,'openedAt',s.opened_at,'closedAt',s.closed_at,
  'orderCount',0,'totalVnd',0,'paymentStatus','unpaid','version',s.version);
$$;
-- Constant-work comparison for 32-byte SHA-256 digests, independent of mismatch position.
create function public.p2_equal_hash(a text,b text) returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare delta integer:=0; i integer;
begin
 if length(a)<>64 or length(b)<>64 or a is null or b is null then return false; end if;
 for i in 1..64 loop delta:=delta | (ascii(substr(a,i,1)) # ascii(substr(b,i,1))); end loop;
 return delta=0;
end; $$;
create function public.p2_rate(p_key text,p_limit integer) returns integer language plpgsql set search_path=pg_catalog as $$
declare b public.security_rate_buckets;
begin
 insert into public.security_rate_buckets(key_hash,attempts,resets_at)
 values(encode(extensions.digest(p_key,'sha256'),'hex'),1,clock_timestamp()+interval '1 minute')
 on conflict(key_hash) do update set
  attempts=case when security_rate_buckets.resets_at<=clock_timestamp() then 1 else security_rate_buckets.attempts+1 end,
  resets_at=case when security_rate_buckets.resets_at<=clock_timestamp() then clock_timestamp()+interval '1 minute' else security_rate_buckets.resets_at end
 returning * into b;
 if b.attempts>p_limit then return greatest(1,ceil(extract(epoch from b.resets_at-clock_timestamp()))::integer); end if;
 return 0;
end; $$;

-- All API DB work is a single statement/transaction and a consistent snapshot.
-- Only the server service_role can invoke it. Owner identity is independently
-- verified via Auth in the handler and membership is rechecked here.
create function public.p2_execute(action text,input jsonb) returns jsonb
language plpgsql set search_path=pg_catalog as $$
#variable_conflict use_variable
declare
 q public.qr_codes; t public.dining_tables; st public.stores; s public.table_sessions;
 op public.operation_requests; delivery public.session_code_deliveries;
 grant_row public.guest_access;
 owner_id uuid; store_id uuid; browser_hash text:=input->>'browserHash';
 ref jsonb; result jsonb; grid jsonb; detail jsonb:=null; snapshot jsonb;
 retry integer:=0; n integer; scoped_hash text;
begin
 if action like 'owner_%' or action='open' then
  owner_id:=(input->>'ownerId')::uuid; store_id:=(input->>'storeId')::uuid;
  if not exists(select 1 from public.owner_members m where m.auth_user_id=owner_id and m.store_id=store_id and m.role='owner') then
   return public.p2_fail('FORBIDDEN');
  end if;
  if action='open' then
   -- Reserve command before taking store/resource locks; also serializes replays.
   perform pg_advisory_xact_lock(hashtextextended(store_id::text||':'||(input->>'requestId'),0));
   select * into op from public.operation_requests r where r.store_id=store_id and r.request_id=(input->>'requestId')::uuid;
   if found then
    if op.actor_id<>owner_id then return public.p2_fail('FORBIDDEN'); end if;
    if op.operation<>'open_table_session' or op.request_fingerprint<>input->>'fingerprint' then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
    select * into s from public.table_sessions where id=(op.result_json->'session'->>'id')::uuid for share;
    select * into delivery from public.session_code_deliveries where session_id=s.id;
    if s.status='closed' or s.code_expires_at<=clock_timestamp() or delivery.expires_at<=clock_timestamp() then return public.p2_fail('SESSION_EXPIRED'); end if;
    if s.status<>'open' then return public.p2_fail('SESSION_CHECKOUT_PENDING'); end if;
    return jsonb_build_object('data',op.result_json,'delivery',delivery.artifact,'keyId',delivery.key_id,'expiresAt',delivery.expires_at);
   end if;
  end if;
  retry:=public.p2_rate('owner:'||owner_id||':'||case when action='open' then 'write' else 'read' end,case when action='open' then 30 else 120 end);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  if action='open' then
   select * into st from public.stores where id=store_id for update;
   select * into t from public.dining_tables where id=(input->>'tableId')::uuid and dining_tables.store_id=store_id for update;
   if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
   if not t.active then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
   if exists(select 1 from public.table_sessions where table_id=t.id and status in ('open','checkout_pending')) then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
   insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at)
    values((input->>'sessionId')::uuid,store_id,t.id,input->>'codeHash',clock_timestamp()+interval '24 hours') returning * into s;
   snapshot:=jsonb_build_object('table',jsonb_build_object('id',t.id,'label',t.label),'session',public.p2_session_view(s));
   insert into public.session_code_deliveries values(s.id,input->>'keyId',input->'artifact',s.code_expires_at);
   insert into public.operation_requests(store_id,request_id,actor_id,operation,request_fingerprint,result_json)
    values(store_id,(input->>'requestId')::uuid,owner_id,'open_table_session',input->>'fingerprint',snapshot);
   ref:=jsonb_build_object('eventId',gen_random_uuid(),'aggregateId',s.id,'version',s.version,'type','table_session.opened');
   insert into public.outbox_events(id,topic,aggregate_id,version,payload) values((ref->>'eventId')::uuid,'table_session.opened',s.id,s.version,ref);
   return jsonb_build_object('data',snapshot,'delivery',input->'artifact','keyId',input->>'keyId','expiresAt',s.code_expires_at);
  elsif action='owner_tables' then
   if input->>'tableId' is not null and not exists(select 1 from public.dining_tables where id=(input->>'tableId')::uuid and dining_tables.store_id=store_id) then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
   with rows as materialized (
    select dt.id,dt.label,dt.active,case when ts.id is null then null else public.p2_session_view(ts) end session
     from public.dining_tables dt left join public.table_sessions ts on ts.table_id=dt.id and ts.status in ('open','checkout_pending') where dt.store_id=store_id
   )
   select coalesce((select jsonb_agg(to_jsonb(r) order by r.label,r.id) from rows r),'[]'::jsonb),
    (select jsonb_build_object('table',jsonb_build_object('id',r.id,'label',r.label),'session',r.session,'orders','[]'::jsonb) from rows r where r.id=(input->>'tableId')::uuid and r.session is not null)
    into grid,detail;
   return jsonb_build_object('data',jsonb_build_object('tables',grid,'detail',detail));
  elsif action='owner_qrs' then
   select coalesce(jsonb_agg(jsonb_build_object('id',qr.id,'publicCode',qr.public_code,'path','/q/'||qr.public_code,'active',qr.active,'type',qr.type,
    'table',case when dt.id is null then null else jsonb_build_object('id',dt.id,'label',dt.label) end) order by qr.created_at,qr.id),'[]'::jsonb)
    into grid from public.qr_codes qr left join public.dining_tables dt on dt.id=qr.table_id where qr.store_id=store_id;
   return jsonb_build_object('data',grid);
  end if;
 elsif action in ('resolve','verify','guest') then
  if browser_hash !~ '^[a-f0-9]{64}$' or browser_hash is null or input->>'grantProof' is null or input->>'grantProof' !~ '^[a-f0-9]{64}$' then return public.p2_fail('UNAUTHORIZED'); end if;
  select * into q from public.qr_codes where public_code=input->>'qrCode' and active for share;
  if not found then return public.p2_fail('INVALID_QR'); end if;
  select * into st from public.stores where id=q.store_id;
  if not found then return public.p2_fail('INVALID_QR'); end if;
  if q.type='table' then
   select * into t from public.dining_tables where id=q.table_id and dining_tables.store_id=q.store_id and active for share;
   if not found then return public.p2_fail('INVALID_QR'); end if;
  end if;
  if action='resolve' then
   retry:=public.p2_rate('read:'||browser_hash||':'||q.id,60);
   if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  end if;
  if action in ('resolve','verify') and coalesce((input->>'newBrowser')::boolean,false) then
   insert into public.guest_browser_contexts(token_hash) values(browser_hash) on conflict do nothing;
  end if;
  if not exists(select 1 from public.guest_browser_contexts where token_hash=browser_hash and expires_at>clock_timestamp()) then return public.p2_fail('UNAUTHORIZED'); end if;
  ref:=jsonb_build_object('store',jsonb_build_object('id',st.id,'name',st.name,'timezone',st.timezone,'acceptingOrders',st.accepting_orders));
  if q.type='takeaway' then
   if action<>'resolve' then return public.p2_fail('INVALID_QR'); end if;
   return jsonb_build_object('data',ref||jsonb_build_object('type','takeaway','mode','takeaway','table',null,'requiresSessionCode',false,'session',null));
  end if;
  select * into s from public.table_sessions where table_id=t.id and status in ('open','checkout_pending') for share;
  if action='verify' then
   -- Serialize attempts per browser/QR. Counter writes commit even on failure.
   perform pg_advisory_xact_lock(hashtextextended('verify:'||browser_hash||':'||q.id,0));
   select greatest(1,ceil(extract(epoch from b.resets_at-clock_timestamp()))::integer) into retry
    from public.security_rate_buckets b where b.key_hash=encode(extensions.digest('verify:'||browser_hash||':'||q.id,'sha256'),'hex')
     and b.resets_at>clock_timestamp() and b.attempts>=5;
   retry:=coalesce(retry,0);
   n:=public.p2_rate('verify-qr:'||q.id,1000); retry:=greatest(retry,n);
   if input->>'ipHash' is not null then n:=public.p2_rate('verify-ip:'||(input->>'ipHash')||':'||q.id,300); retry:=greatest(retry,n); end if;
   if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
   if s.id is null or s.code_expires_at<=clock_timestamp() then return public.p2_fail('SESSION_EXPIRED'); end if;
   if not public.p2_equal_hash(s.code_hash,input->>'codeHash') then
    perform public.p2_rate('verify:'||browser_hash||':'||q.id,5);
    return public.p2_fail('INVALID_SESSION_CODE');
   end if;
   scoped_hash:=encode(extensions.digest((input->>'grantProof')||':'||s.id::text,'sha256'),'hex');
   insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at)
    values(q.store_id,s.id,scoped_hash,browser_hash,least(s.code_expires_at,clock_timestamp()+interval '12 hours'))
    on conflict(browser_context_hash,scope_id) do update set expires_at=excluded.expires_at
     where guest_access.revoked_at is null;
   -- Explicit revoke cannot be undone by reusing the code on that browser.
  end if;
  select * into grant_row from public.guest_access g where g.scope_id=s.id and g.store_id=q.store_id and g.browser_context_hash=browser_hash
   and g.token_hash=encode(extensions.digest((input->>'grantProof')||':'||s.id::text,'sha256'),'hex');
  if s.id is null or s.status='closed' or s.code_expires_at<=clock_timestamp() or grant_row.id is null or grant_row.revoked_at is not null or grant_row.expires_at<=clock_timestamp() then
   if action='guest' or action='verify' then return public.p2_fail(case when s.id is null or s.code_expires_at<=clock_timestamp() or grant_row.revoked_at is not null or grant_row.expires_at<=clock_timestamp() then 'SESSION_EXPIRED' else 'SESSION_REQUIRED' end); end if;
   return jsonb_build_object('data',ref||jsonb_build_object('type','table','mode','dine_in','table',jsonb_build_object('id',t.id,'label',t.label),'requiresSessionCode',true,'session',null));
  end if;
  if action='guest' then
   if coalesce((input->>'forWrite')::boolean,true) and s.status<>'open' then return public.p2_fail('SESSION_CHECKOUT_PENDING'); end if;
   if input->>'expectedSessionId' is not null and (input->>'expectedSessionId')::uuid<>s.id then return public.p2_fail('SESSION_REQUIRED'); end if;
   return jsonb_build_object('data',jsonb_build_object('storeId',q.store_id,'tableId',t.id,'sessionId',s.id,'guestAccessId',grant_row.id,'browserContextHash',browser_hash,'expiresAt',grant_row.expires_at));
  end if;
  return jsonb_build_object('data',ref||jsonb_build_object('type','table','mode','dine_in','table',jsonb_build_object('id',t.id,'label',t.label),'requiresSessionCode',false,'session',jsonb_build_object('id',s.id,'status',s.status)));
 end if;
 return public.p2_fail('INTERNAL_ERROR');
end; $$;

revoke all on function public.p2_session_guard(),public.p2_fail(text),public.p2_session_view(public.table_sessions),public.p2_equal_hash(text,text),public.p2_rate(text,integer),public.p2_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p2_session_guard() to service_role;
grant execute on function public.p2_fail(text),public.p2_session_view(public.table_sessions),public.p2_equal_hash(text,text),public.p2_rate(text,integer),public.p2_execute(text,jsonb) to service_role;
commit;
