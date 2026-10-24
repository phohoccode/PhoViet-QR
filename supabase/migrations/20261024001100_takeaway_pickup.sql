-- P4-C03. Atomic additive pickup lifecycle. No historical data is rewritten.
begin;

-- Refuse to overwrite a projection that differs from the reviewed 010 baseline.
-- Normalize only line endings, so SQL Editor CRLF conversion is harmless.
do $$
begin
 if coalesce((select md5(replace(prosrc,chr(13),'')) from pg_proc
  where oid=to_regprocedure('public.p3_order_summary(public.orders)')),'missing')<>'8077dd8bb0dcd21be5c6c575deb5f615' then
  raise exception 'P4-C03 preflight: unexpected order summary baseline';
 end if;
 if to_regprocedure('public.p4_process(uuid)') is null or to_regclass('public.payments') is null then
  raise exception 'P4-C03 preflight: apply payment migration 010 first';
 end if;
end; $$;

alter table public.orders drop constraint orders_context_check,
 add constraint orders_context_check check(
  (type='dine_in' and table_session_id is not null and table_id is not null and table_label_snapshot is not null
   and ticket_no is not null and service_date is not null and accepted_at is not null and status not in('pending_payment','payment_exception'))
  or (type='takeaway' and table_session_id is null and table_id is null and table_label_snapshot is null and total_vnd>0
   and ((status in('pending_payment','payment_exception','cancelled') and ticket_no is null and service_date is null and accepted_at is null)
    or (status in('accepted','preparing','ready','completed') and ticket_no is not null and service_date is not null and accepted_at is not null))));

create table public.pickup_credentials (
 order_id uuid primary key, store_id uuid not null,
 code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
 code_ciphertext jsonb not null check(jsonb_typeof(code_ciphertext)='object'
  and code_ciphertext ?& array['iv','tag','ciphertext']
  and code_ciphertext-array['iv','tag','ciphertext']='{}'::jsonb
  and jsonb_typeof(code_ciphertext->'iv')='string' and code_ciphertext->>'iv' ~ '^[A-Za-z0-9+/]{16}$'
  and jsonb_typeof(code_ciphertext->'tag')='string' and code_ciphertext->>'tag' ~ '^[A-Za-z0-9+/]{22}==$'
  and jsonb_typeof(code_ciphertext->'ciphertext')='string' and code_ciphertext->>'ciphertext' ~ '^[A-Za-z0-9+/]{8}$'),
 encryption_key_id text not null check(encryption_key_id ~ '^[A-Za-z0-9_-]{1,40}$'),
 hmac_key_id text not null check(hmac_key_id ~ '^[A-Za-z0-9_-]{1,40}$'),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 failed_attempts integer not null default 0 check(failed_attempts>=0),
 window_failures integer not null default 0 check(window_failures between 0 and 5),
 window_started_at timestamptz not null default clock_timestamp(), locked_until timestamptz,
 verified_at timestamptz, verified_by uuid references auth.users(id) on delete restrict,
 completed_at timestamptz,
 foreign key(store_id,order_id) references public.orders(store_id,id) on delete restrict,
 check((verified_at is null and verified_by is null and completed_at is null)
  or (verified_at is not null and verified_by is not null and completed_at is not null and completed_at=verified_at)),
 check(expires_at>created_at)
);
create table public.pickup_attempt_log (
 id uuid primary key default gen_random_uuid(), store_id uuid not null, order_id uuid not null,
 actor_id uuid not null references auth.users(id) on delete restrict, request_id uuid not null,
 outcome text not null check(outcome in('invalid','locked','not_allowed','unavailable','already_completed')),
 created_at timestamptz not null default clock_timestamp(),
 unique(store_id,request_id), foreign key(store_id,order_id) references public.orders(store_id,id) on delete restrict
);

create function public.p4_pickup_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise check_violation using message='Pickup evidence cannot be deleted'; end if;
 if tg_op='INSERT' then
  if not exists(select 1 from public.orders o join public.payment_intents i on i.order_id=o.id
   join public.payments p on p.intent_id=i.id and p.store_id=o.store_id
   where o.id=new.order_id and o.store_id=new.store_id and o.type='takeaway' and o.status in('accepted','preparing','ready')
    and i.status='succeeded' and not i.needs_reconciliation and i.amount_vnd=o.total_vnd and p.amount_vnd=o.total_vnd) then
   raise check_violation using message='Pickup requires verified paid order'; end if;
  return new;
 end if;
 if (to_jsonb(new)-array['failed_attempts','window_failures','window_started_at','locked_until','verified_at','verified_by','completed_at']) is distinct from
    (to_jsonb(old)-array['failed_attempts','window_failures','window_started_at','locked_until','verified_at','verified_by','completed_at']) then
  raise check_violation using message='Immutable pickup credential'; end if;
 if old.verified_at is not null and (new.verified_at,new.verified_by,new.completed_at) is distinct from (old.verified_at,old.verified_by,old.completed_at) then
  raise check_violation using message='Pickup consumption is terminal'; end if;
 return new;
end; $$;
create trigger pickup_credential_guard before insert or update or delete on public.pickup_credentials for each row execute function public.p4_pickup_guard();
create function public.p4_pickup_attempt_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise check_violation using message='Pickup attempts cannot be deleted'; end if;
 if tg_op='UPDATE' then raise check_violation using message='Pickup attempts are immutable'; end if;
 return new;
end; $$;
create trigger pickup_attempt_immutable before update or delete on public.pickup_attempt_log for each row execute function public.p4_pickup_attempt_guard();

create function public.p4_pickup_completed_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare o public.orders; target uuid;
begin
 if tg_table_name='orders' then target:=new.id; else target:=new.order_id; end if;
 select * into o from public.orders where id=target;
 if o.type='takeaway' and ((o.status='completed') is distinct from exists(
  select 1 from public.pickup_credentials c where c.order_id=o.id and c.store_id=o.store_id and c.verified_at is not null and c.verified_by is not null and c.completed_at=c.verified_at)) then
  raise check_violation using message='Pickup consume and completion must commit together'; end if;
 return null;
end; $$;
create constraint trigger pickup_completed_order after insert or update on public.orders deferrable initially deferred for each row execute function public.p4_pickup_completed_guard();
create constraint trigger pickup_completed_credential after insert or update on public.pickup_credentials deferrable initially deferred for each row execute function public.p4_pickup_completed_guard();

-- Fixed-size comparison: all 32 bytes are visited; no prefix-dependent return.
create function public.p4_pickup_equal(a text,b text) returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare aa bytea; bb bytea; mismatch integer:=0; index integer;
begin
 if a is null or b is null or a !~ '^[a-f0-9]{64}$' or b !~ '^[a-f0-9]{64}$' then return false; end if;
 aa:=decode(a,'hex'); bb:=decode(b,'hex');
 for index in 0..31 loop mismatch:=mismatch | (get_byte(aa,index) # get_byte(bb,index)); end loop;
 return mismatch=0;
end; $$;

create or replace function public.p3_order_summary(o public.orders) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare i public.payment_intents;
begin
 if o.type='dine_in' then return public.p4_dine_in_summary(o); end if;
 select * into i from public.payment_intents where order_id=o.id;
 return public.p4_dine_in_summary(o)||jsonb_build_object('table',null,'paymentStatus',case i.status when 'succeeded' then 'paid' else i.status end,
  'statusLabel',case o.status when 'pending_payment' then 'Chờ thanh toán' when 'payment_exception' then 'Cần đối soát thanh toán' else public.p4_dine_in_summary(o)->>'statusLabel' end,
  'fulfillmentStatus',case when o.status in('pending_payment','payment_exception') then 'awaiting_preparation' when o.status='completed' then 'collected' else public.p4_dine_in_summary(o)->>'fulfillmentStatus' end);
end; $$;

create function public.p4_pickup_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_column
declare sid uuid:=(input->>'storeId')::uuid; actor uuid:=(input->>'ownerId')::uuid; target uuid:=(input->>'orderId')::uuid;
 request uuid:=(input->>'requestId')::uuid; fingerprint text:=input->>'fingerprint';
 o public.orders; i public.payment_intents; c public.pickup_credentials; op public.operation_requests;
 result jsonb; failure text; outcome text; retry integer; consumed_at timestamptz; event_uuid uuid; before_state jsonb;
begin
 if action='missing' then
  return jsonb_build_object('data',(select coalesce(jsonb_agg(id),'[]') from (
   select o.id from public.orders o join public.payment_intents i on i.order_id=o.id
    join public.payments p on p.intent_id=i.id and p.store_id=o.store_id
   where o.type='takeaway' and o.status in('accepted','preparing','ready') and o.accepted_at+interval '24 hours'>clock_timestamp()
    and i.status='succeeded' and not i.needs_reconciliation
    and p.amount_vnd=o.total_vnd and not exists(select 1 from public.pickup_credentials c where c.order_id=o.id)
   order by o.accepted_at,o.id limit 50) x));
 elsif action='issue_context' then
  select * into o from public.orders where id=target and type='takeaway' and status in('accepted','preparing','ready');
  if not found or exists(select 1 from public.pickup_credentials where order_id=target) or not exists(
   select 1 from public.payment_intents i join public.payments p on p.intent_id=i.id and p.store_id=o.store_id
   where i.order_id=o.id and i.status='succeeded' and not i.needs_reconciliation and p.amount_vnd=o.total_vnd and i.amount_vnd=o.total_vnd) then return jsonb_build_object('data',null); end if;
  return jsonb_build_object('data',jsonb_build_object('id',o.id,'storeId',o.store_id));
 elsif action='tracking' then
  -- Single statement: auth, order and delivery come from one MVCC snapshot.
  select jsonb_build_object('order',public.p3_order_view(o),'delivery',case when
   o.status in('accepted','preparing','ready') and i.status='succeeded' and not i.needs_reconciliation and c.order_id is not null and c.verified_at is null and c.expires_at>clock_timestamp()
   then jsonb_build_object('ciphertext',c.code_ciphertext,'encryptionKeyId',c.encryption_key_id,'expiresAt',c.expires_at) else null end)
  into result from public.orders o join public.payment_intents i on i.order_id=o.id
   join public.takeaway_requests r on r.order_id=o.id and r.store_id=o.store_id
   join public.guest_browser_contexts b on b.token_hash=r.browser_context_hash and b.expires_at>clock_timestamp()
   left join public.pickup_credentials c on c.order_id=o.id and c.store_id=o.store_id
  where o.id=target and o.type='takeaway' and r.browser_context_hash=input->>'browserHash' and r.access_expires_at>clock_timestamp()
   and r.proof_hash=encode(extensions.digest((input->>'grantProof')||':'||o.id::text,'sha256'),'hex');
  if not found then return public.p2_fail('ORDER_NOT_FOUND'); end if;
  retry:=public.p2_rate('payment-read:'||(input->>'browserHash')||':'||(result->'order'->'payment'->>'intentId'),60);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  return jsonb_build_object('data',result);
 end if;
 if action not in('issue','complete') then return public.p2_fail('VALIDATION_ERROR'); end if;
 if action='complete' then
  if not exists(select 1 from public.owner_members where store_id=sid and auth_user_id=actor and role='owner') then return public.p2_fail('FORBIDDEN'); end if;
  if request is null or target is null or fingerprint is null or fingerprint !~ '^[a-f0-9]{64}$' or input->>'codeProof' is null or input->>'codeProof' !~ '^[a-f0-9]{64}$' then return public.p2_fail('VALIDATION_ERROR'); end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text||':'||request,0));
  select * into op from public.operation_requests where store_id=sid and request_id=request;
  if found then
   if op.actor_id<>actor then return public.p2_fail('FORBIDDEN'); end if;
   if op.operation<>'owner_order.complete_takeaway' or not public.p4_pickup_equal(op.request_fingerprint,fingerprint) then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
   return op.result_json;
  end if;
  retry:=public.p2_rate('pickup-command:'||actor::text,60);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 end if;
 -- Match payment/owner lock order. No provider/crypto/network IO inside locks.
 perform 1 from public.stores where id=sid for no key update;
 if action='complete' and not exists(select 1 from public.owner_members where store_id=sid and auth_user_id=actor and role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 select * into i from public.payment_intents where order_id=target and store_id=sid for update;
 select * into o from public.orders where id=target and store_id=sid for update;
 if not found then return public.p2_fail('ORDER_NOT_FOUND'); end if;
 select * into c from public.pickup_credentials where order_id=target and store_id=sid for update;
 if action='issue' then
  if c.order_id is not null then return jsonb_build_object('data',jsonb_build_object('issued',false)); end if;
  if o.type<>'takeaway' or o.status not in('accepted','preparing','ready') or i.status is distinct from 'succeeded' or i.needs_reconciliation
   or not exists(select 1 from public.payments p where p.intent_id=i.id and p.store_id=sid and p.amount_vnd=o.total_vnd) then return public.p2_fail('PICKUP_NOT_ALLOWED'); end if;
  if o.accepted_at+interval '24 hours'<=clock_timestamp() then return public.p2_fail('PICKUP_CREDENTIAL_UNAVAILABLE'); end if;
  insert into public.pickup_credentials(order_id,store_id,code_hash,code_ciphertext,encryption_key_id,hmac_key_id,expires_at)
   values(o.id,sid,input->>'codeHash',input->'ciphertext',input->>'encryptionKeyId',input->>'hmacKeyId',o.accepted_at+interval '24 hours');
  perform public.p4_emit(o,'pickup.issued');
  return jsonb_build_object('data',jsonb_build_object('issued',true));
 end if;
 failure:=case
  when o.type<>'takeaway' then 'PICKUP_NOT_ALLOWED'
  when o.status='completed' then 'ORDER_ALREADY_COMPLETED'
  when o.status<>'ready' or i.status is distinct from 'succeeded' or i.needs_reconciliation or not exists(
   select 1 from public.payments p where p.intent_id=i.id and p.store_id=sid and p.amount_vnd=o.total_vnd) then 'PICKUP_NOT_ALLOWED'
  when input->>'expectedVersion' is null or o.version<>(input->>'expectedVersion')::bigint then 'INVALID_STATE_TRANSITION'
  when c.order_id is null or c.hmac_key_id is distinct from input->>'hmacKeyId' then 'PICKUP_CREDENTIAL_UNAVAILABLE'
  when c.verified_at is not null or c.expires_at<=clock_timestamp() then 'INVALID_PICKUP_CODE' else null end;
 if failure is null then
  if c.locked_until>clock_timestamp() then
   failure:='RATE_LIMITED';retry:=greatest(1,ceil(extract(epoch from c.locked_until-clock_timestamp()))::integer);
  else
   retry:=public.p2_rate('pickup-owner:'||actor::text,10);
   if retry>0 then failure:='RATE_LIMITED';
   elsif not public.p4_pickup_equal(c.code_hash,input->>'codeProof') then
    if c.window_started_at+interval '15 minutes'<=clock_timestamp() then c.window_failures:=0;c.window_started_at:=clock_timestamp(); end if;
    c.window_failures:=c.window_failures+1;
    update public.pickup_credentials set failed_attempts=failed_attempts+1,window_failures=c.window_failures,window_started_at=c.window_started_at,
     locked_until=case when c.window_failures>=5 then clock_timestamp()+interval '15 minutes' else null end where order_id=o.id;
    failure:='INVALID_PICKUP_CODE';
   end if;
  end if;
 end if;
 if failure is not null then
  outcome:=case failure when 'INVALID_PICKUP_CODE' then 'invalid' when 'RATE_LIMITED' then 'locked' when 'PICKUP_CREDENTIAL_UNAVAILABLE' then 'unavailable' when 'ORDER_ALREADY_COMPLETED' then 'already_completed' else 'not_allowed' end;
  insert into public.pickup_attempt_log(store_id,order_id,actor_id,request_id,outcome) values(sid,o.id,actor,request,outcome);
  result:=public.p2_fail(failure);
  if failure='RATE_LIMITED' then result:=result||jsonb_build_object('retryAfterSeconds',retry); end if;
 else
  consumed_at:=clock_timestamp(); before_state:=jsonb_build_object('status',o.status,'version',o.version);
  update public.orders set status='completed' where id=o.id returning * into o;
  update public.pickup_credentials set verified_at=consumed_at,verified_by=actor,completed_at=consumed_at where order_id=o.id;
  event_uuid:=gen_random_uuid();
  insert into public.order_events(id,store_id,order_id,event_type,version,actor_id,before_state,after_state)
   values(event_uuid,sid,o.id,'order.completed',o.version,actor,before_state,jsonb_build_object('status',o.status,'version',o.version));
  insert into public.outbox_events(id,topic,aggregate_id,version,payload)
   values(event_uuid,'order.completed',o.id,o.version,jsonb_build_object('eventId',event_uuid,'aggregateId',o.id,'version',o.version,'type','order.completed'));
  result:=jsonb_build_object('data',public.p3_order_view(o));
 end if;
 insert into public.operation_requests(store_id,request_id,actor_id,operation,request_fingerprint,result_json)
  values(sid,request,actor,'owner_order.complete_takeaway',fingerprint,result);
 return result;
end; $$;

alter table public.pickup_credentials enable row level security;
alter table public.pickup_attempt_log enable row level security;
revoke all on public.pickup_credentials,public.pickup_attempt_log from public,anon,authenticated,service_role;
grant select,insert,update on public.pickup_credentials to service_role;
grant select,insert on public.pickup_attempt_log to service_role;
revoke all on function public.p4_pickup_guard(),public.p4_pickup_attempt_guard(),public.p4_pickup_completed_guard(),public.p4_pickup_equal(text,text),public.p4_pickup_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p4_pickup_guard(),public.p4_pickup_attempt_guard(),public.p4_pickup_completed_guard(),public.p4_pickup_equal(text,text),public.p4_pickup_execute(text,jsonb) to service_role;
commit;
