-- P4-C04. Review holds must never enter preparation or delivery. No rows rewritten.
-- Atomic: errors before COMMIT restore all definitions/ACLs. After deployment use
-- forward remediation; never erase payment, ticket or pickup evidence.
begin;
do $preflight$
declare expected record; actual text;
begin
 for expected in select * from (values
 ('public.p3_owner_orders_execute(text,jsonb)','2d2b2449e48d6aa856cd32f7436b9ec5'),
 -- Audited operator export: the legacy process body differs from 010 only by
 -- an uninitialized event_id variable (which shadows the outbox column) and the
 -- absence of p4_emit(...,'payment.exception'). The replacement below fixes
 -- both and adds C04 review holds. Accept only this exact legacy digest too;
 -- all other function bodies, including missing functions, must still abort.
 ('public.p4_process(uuid)','bb613db3481e0b14d6f301cd56451a7b'),
 -- Audited Production legacy payment executor. It is replaced below with the
 -- C04 executor; no legacy behavior is retained after COMMIT.
 ('public.p4_payment_execute(text,jsonb)','8682e54a5aeede8d6c8cb0af378fa5e3'),
 ('public.p4_payment_view(public.payment_intents)','329692ee360449a041d25ca4c91d65fc'),
 ('public.p3_order_summary(public.orders)','7ea0fd702a3d8bcf8ae1cd7acc45f4bc')) x(signature,body_md5) loop
  select md5(replace(p.prosrc,chr(13),'')) into actual from pg_proc p where p.oid=to_regprocedure(expected.signature);
  if actual is distinct from expected.body_md5
     and (expected.signature<>'public.p4_process(uuid)'
          or actual is distinct from '67364a173189c8d1f482723223b61c68')
     and (expected.signature<>'public.p4_payment_execute(text,jsonb)'
          or actual is distinct from 'e415f94cbf8ab1f5ac7d34242239a1ca') then
   raise exception 'P4-C04 preflight: unexpected function body for %; audit deployed definition before retry',expected.signature;
  end if;
 end loop;
 -- Some legacy deployments predate this helper entirely. Create it below if
 -- absent; never overwrite an existing emitter with unreviewed behavior.
 if to_regprocedure('public.p4_emit(public.orders,text)') is not null then
  select md5(replace(p.prosrc,chr(13),'')) into actual from pg_proc p
   where p.oid=to_regprocedure('public.p4_emit(public.orders,text)');
  if actual is distinct from 'cf84bf7a41a9224e15ba26fc44ee473f' then
   raise exception 'P4-C04 preflight: unexpected function body for public.p4_emit(public.orders,text); audit deployed definition before retry';
  end if;
 end if;
end;
$preflight$;

-- Same audited emitter as 010. Legacy deployments may not have installed it.
create or replace function public.p4_emit(o public.orders,topic text) returns void language plpgsql set search_path=pg_catalog as $$
declare event_uuid uuid:=gen_random_uuid();
begin
 insert into public.order_events(id,store_id,order_id,event_type,version) values(event_uuid,o.store_id,o.id,topic,o.version);
 insert into public.outbox_events(id,topic,aggregate_id,version,payload)
 values(event_uuid,topic,o.id,o.version,jsonb_build_object('eventId',event_uuid,'aggregateId',o.id,'version',o.version,'type',topic));
end; $$;
revoke all on function public.p4_emit(public.orders,text) from public,anon,authenticated;
grant execute on function public.p4_emit(public.orders,text) to service_role;

create function public.p4_order_payment_held(o public.orders) returns boolean language sql stable set search_path=pg_catalog as $$
 select o.type='takeaway' and exists(select 1 from public.payment_intents i where i.order_id=o.id and i.store_id=o.store_id
  and (i.status='exception' or (i.status='succeeded' and i.needs_reconciliation)));
$$;
revoke all on function public.p4_order_payment_held(public.orders) from public,anon,authenticated;
grant execute on function public.p4_order_payment_held(public.orders) to service_role;

create or replace function public.p4_payment_view(i public.payment_intents) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('kind','takeaway','intentId',i.id,'amountVnd',i.amount_vnd,'currency','VND','updatedAt',i.updated_at,'expiresAt',i.expires_at,
  'status',case i.status when 'succeeded' then 'paid' else i.status end,'intentStatus',i.status,
  'statusLabel',case i.status when 'pending' then 'Đang xác nhận thanh toán' when 'succeeded' then 'Đã thanh toán' when 'expired' then 'Thanh toán hết hạn' else 'Cần đối soát' end,
  'reconciliationRequired',i.status='exception' or (i.status='succeeded' and i.needs_reconciliation)) || case when i.status='pending' then
  jsonb_build_object('checkoutUrl',i.checkout_url,'qrPayload',i.qr_payload) else '{}'::jsonb end;
$$;

create or replace function public.p3_order_summary(o public.orders) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare i public.payment_intents;
begin
 if o.type='dine_in' then return public.p4_dine_in_summary(o); end if;
 select * into i from public.payment_intents where order_id=o.id;
 return public.p4_dine_in_summary(o)||jsonb_build_object('table',null,'paymentReviewRequired',public.p4_order_payment_held(o),'paymentStatus',case i.status when 'succeeded' then 'paid' else i.status end,
  'statusLabel',case o.status when 'pending_payment' then 'Chờ thanh toán' when 'payment_exception' then 'Cần đối soát thanh toán' else public.p4_dine_in_summary(o)->>'statusLabel' end,
  'fulfillmentStatus',case when o.status in('pending_payment','payment_exception') then 'awaiting_preparation' when o.status='completed' then 'collected' else public.p4_dine_in_summary(o)->>'fulfillmentStatus' end);
end; $$;

create or replace function public.p3_owner_orders_execute(action text,input jsonb) returns jsonb
language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare
 sid uuid:=(input->>'storeId')::uuid; actor uuid:=(input->>'ownerId')::uuid;
 command uuid; fingerprint text; op public.operation_requests; o public.orders;
 locator public.orders; previous jsonb; result jsonb; event_id uuid; topic text; retry integer;
 q jsonb:=coalesce(input->'query','{}'::jsonb); cursor_key jsonb:=q->'after';
 view_name text:=coalesce(q->>'view','queue'); status_filter text:=q->>'status';
 type_filter text:=q->>'type'; page_size integer:=coalesce((q->>'limit')::integer,50);
 allowed text[];
begin
 if action not in('list','claim','ready','complete') then return public.p2_fail('VALIDATION_ERROR'); end if;
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action='list' then
  allowed:=case view_name when 'queue' then array['accepted','preparing','ready']
   when 'exceptions' then array['pending_payment','payment_exception','accepted','preparing','ready','completed'] when 'history' then array['completed','cancelled'] end;
  if allowed is null or page_size not between 1 and 100 or (status_filter is not null and not status_filter=any(allowed))
   or (type_filter is not null and type_filter not in('dine_in','takeaway')) then return public.p2_fail('VALIDATION_ERROR'); end if;
  retry:=public.p2_rate('owner:'||actor||':read',120);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  -- One SQL statement / MVCC snapshot for page, counts and independent detail.
  with candidates as materialized (
   select x.* from public.orders x where x.store_id=sid and x.status=any(allowed)
    and (view_name='history' or (view_name='queue' and not public.p4_order_payment_held(x))
      or (view_name='exceptions' and (x.status in('pending_payment','payment_exception') or public.p4_order_payment_held(x))))
    and (status_filter is null or x.status=status_filter) and (type_filter is null or x.type=type_filter)
    and (cursor_key is null or case when view_name='queue' then
     (x.service_date,x.ticket_no,x.id)>((cursor_key->>'day')::date,(cursor_key->>'ticket')::bigint,(cursor_key->>'id')::uuid)
     else (x.created_at,x.id)<((cursor_key->>'createdAt')::timestamptz,(cursor_key->>'id')::uuid) end)
   order by case when view_name='queue' then x.service_date end,
    case when view_name='queue' then x.ticket_no end,case when view_name='queue' then x.id end,
    case when view_name<>'queue' then x.created_at end desc,case when view_name<>'queue' then x.id end desc
   limit page_size+1
  ), numbered as materialized (
   select c.*,row_number() over(order by case when view_name='queue' then c.service_date end,
    case when view_name='queue' then c.ticket_no end,case when view_name='queue' then c.id end,
    case when view_name<>'queue' then c.created_at end desc,case when view_name<>'queue' then c.id end desc) n from candidates c
  )
  select jsonb_build_object('storeId',sid,
   'orders',coalesce((select jsonb_agg(public.p3_order_summary(x) order by n) from public.orders x join numbered p on x.id=p.id where p.n<=page_size),'[]'::jsonb),
   'detail',(select public.p3_order_view(x) from public.orders x where x.store_id=sid and x.id=(q->>'orderId')::uuid),
   'counts',(select jsonb_build_object('accepted',count(*) filter(where x.status='accepted' and not public.p4_order_payment_held(x)),
    'preparing',count(*) filter(where x.status='preparing' and not public.p4_order_payment_held(x)),'ready',count(*) filter(where x.status='ready' and not public.p4_order_payment_held(x)),
    'paymentException',count(*) filter(where x.status='payment_exception' or public.p4_order_payment_held(x))) from public.orders x where x.store_id=sid),
   'after',case when (select count(*) from numbered)>page_size then
    (select case when view_name='queue' then jsonb_build_object('day',p.service_date,'ticket',p.ticket_no,'id',p.id)
     else jsonb_build_object('createdAt',p.created_at,'id',p.id) end from numbered p where n=page_size) else null end,
   'updatedAt',statement_timestamp()) into result;
  if q ? 'orderId' and result->'detail'='null'::jsonb then return public.p2_fail('ORDER_NOT_FOUND'); end if;
  return jsonb_build_object('data',result);
 end if;
 -- Reject the unimplemented pickup flow BEFORE hashing/persisting proof.
 if action='complete' and input->>'type'='takeaway' then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
 command:=(input->>'requestId')::uuid;
 if command is null then return public.p2_fail('VALIDATION_ERROR'); end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('operation',action,'body',input-'storeId'-'ownerId'-'requestId')::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(sid::text||':'||command,0));
 select * into op from public.operation_requests r where r.store_id=sid and r.request_id=command;
 if found then
  if op.actor_id<>actor then return public.p2_fail('FORBIDDEN'); end if;
  if op.operation<>'owner_order.'||action or op.request_fingerprint<>fingerprint then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
  return jsonb_build_object('data',op.result_json);
 end if;
 retry:=public.p2_rate('owner:'||actor||':write',30);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 -- Same acceptance gate as C01. NO KEY UPDATE permits FK KEY SHARE during
 -- session close, avoiding the store/session cycle caused by FOR UPDATE.
 perform 1 from public.stores where id=sid for no key update;
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action='claim' then
  loop
   select * into locator from public.orders x where x.store_id=sid and x.status='accepted' and not public.p4_order_payment_held(x)
    order by x.service_date,x.ticket_no,x.id limit 1;
   if not found then result:='null'::jsonb; exit; end if;
   -- Never invert guest tracking / settlement's session -> order lock order.
   perform 1 from public.table_sessions where id=locator.table_session_id and store_id=sid for share;
   select * into o from public.orders x where x.id=locator.id and x.store_id=sid for update;
   -- An external maintenance transaction may change the head while we wait.
   if not found or o.status<>'accepted' then continue; end if;
   -- Review-held orders are explicitly ineligible. Among eligible orders the
   -- earliest head is locked and never bypassed with SKIP LOCKED.
   if o.type<>'dine_in' and not(o.type='takeaway' and exists(select 1 from public.payment_intents i join public.payments p on p.intent_id=i.id where i.order_id=o.id and i.status='succeeded' and not i.needs_reconciliation and p.amount_vnd=o.total_vnd)) then return public.p2_fail('INTERNAL_ERROR'); end if;
   exit;
  end loop;
 else
  select * into locator from public.orders x where x.id=(input->>'orderId')::uuid and x.store_id=sid;
  if not found then return public.p2_fail('ORDER_NOT_FOUND'); end if;
  perform 1 from public.table_sessions where id=locator.table_session_id and store_id=sid for share;
  select * into o from public.orders x where x.id=locator.id and x.store_id=sid for update;
  if not found then return public.p2_fail('ORDER_NOT_FOUND'); end if;
  if o.type='takeaway' and public.p4_order_payment_held(o) then return public.p2_fail('PAYMENT_REVIEW_REQUIRED'); end if;
  if o.version<>(input->>'expectedVersion')::bigint or input->>'expectedVersion' is null
   or (action='ready' and o.status<>'preparing')
   or (action='complete' and (o.status<>'ready' or (input->>'type') is distinct from 'dine_in' or o.type<>'dine_in')) then
   return public.p2_fail('INVALID_STATE_TRANSITION');
  end if;
 end if;
 if result is distinct from 'null'::jsonb then
  previous:=jsonb_build_object('status',o.status,'version',o.version);
  topic:=case action when 'claim' then 'order.preparing' when 'ready' then 'order.ready' else 'order.completed' end;
  update public.orders set status=case action when 'claim' then 'preparing' when 'ready' then 'ready' else 'completed' end
   where id=o.id returning * into o;
  result:=public.p3_order_view(o); event_id:=gen_random_uuid();
  insert into public.order_events(id,store_id,order_id,event_type,version,actor_id,before_state,after_state)
   values(event_id,sid,o.id,topic,o.version,actor,previous,jsonb_build_object('status',o.status,'version',o.version));
  insert into public.outbox_events(id,topic,aggregate_id,version,payload)
   values(event_id,topic,o.id,o.version,jsonb_build_object('eventId',event_id,'aggregateId',o.id,'version',o.version,'type',topic));
 end if;
 insert into public.operation_requests(store_id,request_id,actor_id,operation,request_fingerprint,result_json)
  values(sid,command,actor,'owner_order.'||action,fingerprint,result);
 return jsonb_build_object('data',result);
end; $$;

create or replace function public.p4_process(event_uuid uuid) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare e public.payment_webhook_inbox; i public.payment_intents; locator public.payment_intents; o public.orders; st public.stores;
 ev jsonb; reason text; acceptance timestamptz; outcome text; already public.payments;
begin
 -- Receipt lock -> store admission gate -> intent -> order -> transaction key.
 -- Other writers never take an inbox lock after a store/order lock.
 select * into e from public.payment_webhook_inbox where id=event_uuid for update;
 if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
 if e.state in('processed','exception','ignored') then return jsonb_build_object('data',jsonb_build_object('received',true,'outcome','duplicate')); end if;
 begin
  ev:=e.event;
  select * into locator from public.payment_intents where provider=e.provider and provider_reference=ev->>'reference';
  if not found then
   update public.payment_webhook_inbox set state='exception',reason='UNKNOWN_REFERENCE',attempts=attempts+1,processed_at=clock_timestamp() where id=e.id;
   return jsonb_build_object('data',jsonb_build_object('received',true,'outcome','recorded_exception'));
  end if;
  select * into st from public.stores where id=locator.store_id for no key update;
  select * into i from public.payment_intents where id=locator.id for update;
  select * into o from public.orders where id=i.order_id for update;
  perform pg_advisory_xact_lock(hashtextextended('payos:transaction:'||e.transaction_id,0));
  select * into already from public.payments where provider=e.provider and transaction_id=e.transaction_id;
  if found then
   outcome:=case when already.intent_id=i.id and already.amount_vnd=(ev->>'amountVnd')::bigint and ev->>'currency'='VND'
    and ev->>'accountNumber'=i.account_number and e.channel_hash=i.channel_hash and (ev->>'paid')::boolean then 'duplicate' else 'recorded_exception' end;
   update public.payment_webhook_inbox set state=case when outcome='duplicate' then 'processed' else 'exception' end,
    reason=case when outcome='duplicate' then 'TRANSACTION_REPLAY' else 'TRANSACTION_CONFLICT' end,attempts=attempts+1,processed_at=clock_timestamp() where id=e.id;
   return jsonb_build_object('data',jsonb_build_object('received',true,'outcome',outcome));
  end if;
  reason:=case
   when e.channel_hash<>i.channel_hash or ev->>'accountNumber'<>i.account_number then 'MERCHANT_MISMATCH'
   when i.provider_link_id is not null and ev->>'paymentLinkId'<>i.provider_link_id then 'LINK_MISMATCH'
   when not (ev->>'paid')::boolean then 'NON_SUCCESS'
   when ev->>'currency'<>'VND' or (ev->>'amountVnd')::bigint<>i.amount_vnd then 'AMOUNT_CURRENCY_MISMATCH'
   when (ev->>'occurredAt')::timestamptz<i.created_at-interval '5 minutes' or (ev->>'occurredAt')::timestamptz>e.received_at+interval '5 minutes' then 'TRANSACTION_TIME_INVALID'
   when i.status<>'pending' or o.status<>'pending_payment' or e.received_at>=i.expires_at or (ev->>'occurredAt')::timestamptz>=i.expires_at then 'LATE_OR_EXTRA_PAYMENT'
   else null end;
  if reason is not null then
   -- A failure or an invalid merchant cannot downgrade an already paid order.
   if reason not in('NON_SUCCESS','MERCHANT_MISMATCH','LINK_MISMATCH') then
    update public.payment_intents set needs_reconciliation=true, status=case when status='succeeded' then status else 'exception' end,updated_at=clock_timestamp() where id=i.id;
    if o.ticket_no is null then
     update public.orders set status='payment_exception' where id=o.id returning * into o;
     perform public.p4_emit(o,'payment.exception');
    elsif not i.needs_reconciliation then
     -- Preserve the original ticket/status and invalidate clients once on hold.
     update public.orders set status=status where id=o.id returning * into o;
     perform public.p4_emit(o,'payment.review_required');
    end if;
   end if;
   update public.payment_webhook_inbox set state=case when reason='NON_SUCCESS' then 'ignored' else 'exception' end,
    reason=reason,attempts=attempts+1,processed_at=clock_timestamp() where id=e.id;
   return jsonb_build_object('data',jsonb_build_object('received',true,'outcome',case when reason='NON_SUCCESS' then 'ignored' else 'recorded_exception' end));
  end if;
  acceptance:=clock_timestamp();
  insert into public.payments(store_id,intent_id,provider,transaction_id,amount_vnd,currency,inbox_id,paid_at)
   values(i.store_id,i.id,e.provider,e.transaction_id,i.amount_vnd,'VND',e.id,(ev->>'occurredAt')::timestamptz);
  update public.payment_intents set status='succeeded',needs_reconciliation=false,provider_link_id=coalesce(provider_link_id,ev->>'paymentLinkId'),updated_at=acceptance where id=i.id;
  update public.orders set status='accepted',accepted_at=acceptance,service_date=public.p3_service_date(acceptance,st.timezone),
   ticket_no=public.p3_next_ticket(st.id,public.p3_service_date(acceptance,st.timezone)) where id=o.id returning * into o;
  insert into public.order_events(store_id,order_id,event_type,version) values(st.id,o.id,'payment.succeeded',o.version),(st.id,o.id,'order.accepted',o.version);
  insert into public.outbox_events(id,topic,aggregate_id,version,payload)
   select event_id,topic,aggregate,o.version,jsonb_build_object('eventId',event_id,'aggregateId',aggregate,'version',o.version,'type',topic)
   from (values('payment.updated'::text,i.id,gen_random_uuid()),('order.accepted'::text,o.id,gen_random_uuid())) x(topic,aggregate,event_id);
  update public.payment_webhook_inbox set state='processed',attempts=attempts+1,processed_at=acceptance where id=e.id;
  return jsonb_build_object('data',jsonb_build_object('received',true,'outcome','accepted'));
 exception when others then
  -- Inner subtransaction rolls back ledger/ticket together; outer receipt is durable.
  -- Store no SQLERRM/payload in logs or errors. Retry the same immutable evidence.
  update public.payment_webhook_inbox set state='failed',reason='PROCESSING_FAILED',attempts=attempts+1 where id=e.id;
  return public.p2_fail('INTERNAL_ERROR');
 end;
end; $$;
create or replace function public.p4_payment_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare i public.payment_intents; o public.orders; result jsonb; retry integer; token uuid;
begin
 if action='jobs' then
  return jsonb_build_object('data',jsonb_build_object(
   'events',(select coalesce(jsonb_agg(id),'[]') from (select id from public.payment_webhook_inbox where state in('received','failed') order by received_at,id limit 100) x),
   'intents',(select coalesce(jsonb_agg(id),'[]') from (select id from public.payment_intents where status='pending'
    and store_id=(input->>'configuredStoreId')::uuid and channel_hash=input->>'channelHash'
    order by last_checked_at nulls first,created_at,id limit 10) x)));
 end if;
 select * into i from public.payment_intents where id=(input->>'intentId')::uuid;
 if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
 if action in('get','order') then
  -- Authorization and projection share one MVCC statement. A webhook cannot
  -- expose a pre-acceptance order combined with a post-acceptance paid intent.
  select case when action='get' then public.p4_payment_view(pi) else
   case when coalesce((input->>'includePickup')::boolean,false) then
    jsonb_build_object('order',public.p3_order_view(ord),'pickup',null) else public.p3_order_view(ord) end end
  into result from public.payment_intents pi join public.orders ord on ord.id=pi.order_id and ord.store_id=pi.store_id
   join public.takeaway_requests tr on tr.order_id=ord.id and tr.store_id=ord.store_id
   join public.guest_browser_contexts b on b.token_hash=tr.browser_context_hash and b.expires_at>clock_timestamp()
  where pi.id=i.id and tr.browser_context_hash=input->>'browserHash' and tr.access_expires_at>clock_timestamp()
   and tr.proof_hash=encode(extensions.digest((input->>'grantProof')||':'||ord.id::text,'sha256'),'hex');
  if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  retry:=public.p2_rate('payment-read:'||(input->>'browserHash')||':'||i.id,60);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  return jsonb_build_object('data',result);
 end if;
 -- All maintenance takes the same store -> intent -> order lock order.
 perform 1 from public.stores where id=i.store_id for no key update;
 select * into i from public.payment_intents where id=i.id for update;
 if action='inspect' then
  if i.channel_hash<>input->>'channelHash' then return public.p2_fail('FORBIDDEN'); end if;
  update public.payment_intents set last_checked_at=clock_timestamp() where id=i.id;
  return jsonb_build_object('data',jsonb_build_object('reference',i.provider_reference,'hasInstructions',i.checkout_url is not null,'pending',i.status='pending'));
 elsif action='expire' then
  if i.status='pending' and i.expires_at<=clock_timestamp() and not exists(
   select 1 from public.payment_webhook_inbox e where e.provider=i.provider and e.event->>'reference'=i.provider_reference
    and e.state in('received','failed') and e.received_at<i.expires_at) then
   update public.payment_intents set status=case when needs_reconciliation then 'exception' else 'expired' end,updated_at=clock_timestamp() where id=i.id;
   update public.orders set status=case when i.needs_reconciliation then 'payment_exception' else 'cancelled' end where id=i.order_id and status='pending_payment' returning * into o;
   if found then perform public.p4_emit(o,case when i.needs_reconciliation then 'payment.exception' else 'payment.expired' end); end if;
  end if;
  return jsonb_build_object('data',jsonb_build_object('ok',true));
 elsif action='prepare' then
  if i.status<>'pending' or i.expires_at<=clock_timestamp() or i.checkout_url is not null or i.channel_hash<>input->>'channelHash'
   or i.lease_until>clock_timestamp() then return jsonb_build_object('data',null); end if;
  token:=gen_random_uuid();
  update public.payment_intents set create_lease=token,lease_until=clock_timestamp()+interval '30 seconds',create_attempts=create_attempts+1 where id=i.id returning * into i;
  return jsonb_build_object('data',jsonb_build_object('id',i.id,'orderId',i.order_id,'reference',i.provider_reference,'amountVnd',i.amount_vnd,'expiresAt',i.expires_at,
   'lease',token,'attempt',i.create_attempts,'accountNumber',i.account_number));
 elsif action='attach' then
  if i.create_lease is distinct from (input->>'lease')::uuid or i.channel_hash<>input->>'channelHash' then return public.p2_fail('FORBIDDEN'); end if;
  if i.status='pending' and i.expires_at>clock_timestamp() and i.account_number=input->>'accountNumber' and
   (i.provider_link_id is null or i.provider_link_id=input->>'paymentLinkId') then
   update public.payment_intents set provider_link_id=input->>'paymentLinkId',checkout_url=input->>'checkoutUrl',qr_payload=input->>'qrPayload',updated_at=clock_timestamp(),lease_until=null where id=i.id;
   update public.orders set status=status where id=i.order_id returning * into o;
   perform public.p4_emit(o,'payment.instructions');
  end if;
  return jsonb_build_object('data',jsonb_build_object('ok',true));
 elsif action='observe' then
  if i.channel_hash<>input->>'channelHash' then return public.p2_fail('FORBIDDEN'); end if;
  update public.payment_intents set last_observed_status=input->>'status',needs_reconciliation=needs_reconciliation or input->>'status' in('PAID','UNDERPAID') where id=i.id and status='pending';
  -- Querying the provider is evidence only; it NEVER accepts an order.
  return jsonb_build_object('data',jsonb_build_object('ok',true));
 end if;
 return public.p2_fail('VALIDATION_ERROR');
end; $$;
commit;
