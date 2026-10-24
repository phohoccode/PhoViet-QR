-- P4-HF02. Repair audited legacy alias/record shadowing. No rows rewritten.
-- Transactional rollback before COMMIT; after deployment use forward remediation.
-- Credential recovery remains a trusted worker action, never a tracking GET.
begin;
do $preflight$
declare actual text;
begin
 select md5(replace(prosrc,chr(13),'')) into actual from pg_proc
 where oid=to_regprocedure('public.p4_pickup_execute(text,jsonb)');
 if actual is null or actual not in('3f34f992a922d5f4f108f0225edbe9b9','7c86603159699872946cc1625f510289') then
  raise exception 'P4-HF02 preflight: unexpected pickup executor; audit deployed definition before retry';
 end if;
end;
$preflight$;

-- Same executor as reviewed 011: SQL aliases take precedence over record
-- variables only where ambiguous. Restores the 24-hour recovery eligibility cap.
create or replace function public.p4_pickup_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
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

revoke all on function public.p4_pickup_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p4_pickup_execute(text,jsonb) to service_role;
commit;
