-- P3-C02: additive owner queue. No data rewrite, payment or session close.
begin;

alter table public.order_events
 add column actor_id uuid references auth.users(id) on delete restrict,
 add column before_state jsonb,
 add column after_state jsonb;
alter table public.order_events add constraint order_events_owner_metadata check (
 (actor_id is null and before_state is null and after_state is null)
 or (actor_id is not null and before_state is not null and after_state is not null
  and jsonb_typeof(before_state)='object' and jsonb_typeof(after_state)='object')
);
create index orders_owner_queue on public.orders(store_id,service_date,ticket_no,id)
 where status in('accepted','preparing','ready');
create index orders_owner_history on public.orders(store_id,created_at desc,id desc)
 where status in('completed','cancelled');

-- Intentionally no item/note/payment-detail query for each list row.
create function public.p3_order_summary(o public.orders) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',o.id,'storeId',o.store_id,'type',o.type,'tableSessionId',o.table_session_id,
 'table',jsonb_build_object('id',o.table_id,'label',o.table_label_snapshot),
 'status',o.status,'statusLabel',case o.status when 'accepted' then 'Chờ làm' when 'preparing' then 'Đang làm' when 'ready' then 'Sẵn sàng' when 'completed' then 'Đã giao' else 'Đã hủy' end,
 'ticketNo',o.ticket_no,'serviceDate',o.service_date,'acceptedAt',o.accepted_at,
 'paymentStatus','unpaid','fulfillmentStatus',case o.status when 'accepted' then 'awaiting_preparation' when 'completed' then 'served' else o.status end,
 'totalVnd',o.total_vnd,'itemCount',o.item_count,'createdAt',o.created_at,'updatedAt',o.updated_at,'version',o.version);
$$;

-- Service-role-only invoker. Authenticated owner identity is supplied by the
-- server guard, then membership is checked again here; browser roles cannot RPC.
create function public.p3_owner_orders_execute(action text,input jsonb) returns jsonb
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
   when 'exceptions' then array['pending_payment','payment_exception'] when 'history' then array['completed','cancelled'] end;
  if allowed is null or page_size not between 1 and 100 or (status_filter is not null and not status_filter=any(allowed))
   or (type_filter is not null and type_filter not in('dine_in','takeaway')) then return public.p2_fail('VALIDATION_ERROR'); end if;
  retry:=public.p2_rate('owner:'||actor||':read',120);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  -- One SQL statement / MVCC snapshot for page, counts and independent detail.
  with candidates as materialized (
   select x.* from public.orders x where x.store_id=sid and x.status=any(allowed)
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
   'counts',(select jsonb_build_object('accepted',count(*) filter(where x.status='accepted'),
    'preparing',count(*) filter(where x.status='preparing'),'ready',count(*) filter(where x.status='ready'),
    'paymentException',count(*) filter(where x.status='payment_exception')) from public.orders x where x.store_id=sid),
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
   select * into locator from public.orders x where x.store_id=sid and x.status='accepted'
    order by x.service_date,x.ticket_no,x.id limit 1;
   if not found then result:='null'::jsonb; exit; end if;
   -- Never invert guest tracking / settlement's session -> order lock order.
   perform 1 from public.table_sessions where id=locator.table_session_id and store_id=sid for share;
   select * into o from public.orders x where x.id=locator.id and x.store_id=sid for update;
   -- An external maintenance transaction may change the head while we wait.
   if not found or o.status<>'accepted' then continue; end if;
   -- Phase4 must extend this check with authoritative paid eligibility. Do not
   -- silently skip an invalid/unpaid future takeaway head and break strict FIFO.
   if o.type<>'dine_in' then return public.p2_fail('INTERNAL_ERROR'); end if;
   exit;
  end loop;
 else
  select * into locator from public.orders x where x.id=(input->>'orderId')::uuid and x.store_id=sid;
  if not found then return public.p2_fail('ORDER_NOT_FOUND'); end if;
  perform 1 from public.table_sessions where id=locator.table_session_id and store_id=sid for share;
  select * into o from public.orders x where x.id=locator.id and x.store_id=sid for update;
  if not found then return public.p2_fail('ORDER_NOT_FOUND'); end if;
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

revoke all on function public.p3_order_summary(public.orders),public.p3_owner_orders_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p3_order_summary(public.orders),public.p3_owner_orders_execute(text,jsonb) to service_role;
commit;
