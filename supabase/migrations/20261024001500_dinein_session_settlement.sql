-- P5-C01. Atomic/additive. No existing rows rewritten; no provider calls.
-- Admission: command advisory -> store NO KEY UPDATE -> session UPDATE -> orders.
-- This matches dine-in creation/owner fulfillment. Never reverse session/order.
begin;
do $preflight$
declare expected record; actual text;
begin
 for expected in select * from (values
  ('public.p2_session_view(public.table_sessions)','ad5e37abd809b9d948adf60dc964d3b9'),
  ('public.p4_dine_in_view(public.orders)','3427d4b5d2bf4e2f4b43d84335e6bc0f'),
  ('public.p4_dine_in_summary(public.orders)','c7d60e0987eb5c3b1faae6216e52e7a9'),
  ('public.p3_order_summary(public.orders)','7c224b843662ad66e6b24f56d3d76752'),
  ('public.p3_order_view(public.orders)','709d3d22198a415ac36d8c10019dd6be'),
  ('public.p3_order_execute(text,jsonb)','7fe1ae6d69fff5288a647502ccc3b3a3')
 ) x(signature,body_md5) loop
  select md5(replace(p.prosrc,chr(13),'')) into actual from pg_proc p where p.oid=to_regprocedure(expected.signature);
  if actual is distinct from expected.body_md5 or exists(select 1 from pg_proc p where p.oid=to_regprocedure(expected.signature)
    and (p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog'])) then
   raise exception 'P5-C01 preflight: unexpected function body for %; audit deployed definition before retry',expected.signature;
  end if;
 end loop;
end; $preflight$;

-- Every prepare is retained, including attempts subsequently cancelled. Nothing
-- in this table represents money received. Session version selects the active one.
create table public.session_checkout_snapshots (
 id uuid primary key default gen_random_uuid(), store_id uuid not null,
 table_session_id uuid not null, session_version bigint not null check(session_version>0),
 bill_version text not null check(bill_version ~ '^[a-f0-9]{32}$'),
 total_vnd bigint not null check(total_vnd between 0 and 9007199254740991),
 bill jsonb not null check(jsonb_typeof(bill)='object'),
 actor_id uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(store_id,table_session_id) references public.table_sessions(store_id,id) on delete restrict,
 unique(table_session_id,session_version), unique(store_id,id)
);
create table public.session_settlements (
 id uuid primary key default gen_random_uuid(), store_id uuid not null,
 table_session_id uuid not null, checkout_id uuid not null,
 total_vnd bigint not null check(total_vnd between 0 and 9007199254740991),
 bill_version text not null check(bill_version ~ '^[a-f0-9]{32}$'),
 payment_method text not null check(payment_method in('cash','bank_transfer')),
 status text not null default 'succeeded' check(status='succeeded'),
 received_confirmed boolean not null check(received_confirmed),
 settled_at timestamptz not null default clock_timestamp(),
 actor_id uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null,
 foreign key(store_id,table_session_id) references public.table_sessions(store_id,id) on delete restrict,
 foreign key(store_id,checkout_id) references public.session_checkout_snapshots(store_id,id) on delete restrict,
 unique(store_id,request_id)
);
create unique index session_settlements_one_success on public.session_settlements(table_session_id) where status='succeeded';
create table public.session_settlement_audit_log (
 id uuid primary key default gen_random_uuid(), store_id uuid not null,
 table_session_id uuid not null, actor_id uuid not null references auth.users(id) on delete restrict,
 action text not null check(action in('begin_checkout','cancel_checkout','confirm_received')),
 request_id uuid not null, before_status text not null, after_status text not null,
 session_version bigint not null, bill_version text not null, total_vnd bigint not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(store_id,table_session_id) references public.table_sessions(store_id,id) on delete restrict
);
alter table public.session_checkout_snapshots enable row level security;
alter table public.session_settlements enable row level security;
alter table public.session_settlement_audit_log enable row level security;
revoke all on public.session_checkout_snapshots,public.session_settlements,public.session_settlement_audit_log from public,anon,authenticated,service_role;
grant select,insert on public.session_checkout_snapshots,public.session_settlements,public.session_settlement_audit_log to service_role;
create trigger session_checkout_immutable before update or delete on public.session_checkout_snapshots for each row execute function public.p3_item_guard();
create trigger session_settlement_immutable before update or delete on public.session_settlements for each row execute function public.p3_item_guard();
create trigger session_settlement_audit_immutable before update or delete on public.session_settlement_audit_log for each row execute function public.p3_item_guard();

create function public.p5_session_paid(sid uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from public.session_settlements where table_session_id=sid and status='succeeded');
$$;
-- Preserve the audited snapshot serializers, including the takeaway call path.
alter function public.p4_dine_in_view(public.orders) rename to p5_unpaid_order_view;
alter function public.p4_dine_in_summary(public.orders) rename to p5_unpaid_order_summary;
create function public.p4_dine_in_view(o public.orders) returns jsonb language sql stable set search_path=pg_catalog as $$
 select case when o.type='dine_in' and public.p5_session_paid(o.table_session_id) then
  public.p5_unpaid_order_view(o)||jsonb_build_object('paymentStatus','paid','payment',
   (public.p5_unpaid_order_view(o)->'payment')||jsonb_build_object('status','paid','statusLabel','Đã thanh toán'))
 else public.p5_unpaid_order_view(o) end;
$$;
create function public.p4_dine_in_summary(o public.orders) returns jsonb language sql stable set search_path=pg_catalog as $$
 select public.p5_unpaid_order_summary(o)||case when o.type='dine_in' and public.p5_session_paid(o.table_session_id)
  then jsonb_build_object('paymentStatus','paid') else '{}'::jsonb end;
$$;
create or replace function public.p2_session_view(s public.table_sessions) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',s.id,'status',s.status,'openedAt',s.opened_at,'closedAt',s.closed_at,
  'orderCount',count(o.id),'totalVnd',coalesce(sum(o.total_vnd) filter(where o.status<>'cancelled'),0),
  'paymentStatus',case when public.p5_session_paid(s.id) then 'paid' else 'unpaid' end,'version',s.version,
  'pinState',case when s.status='closed' or s.code_expires_at<=statement_timestamp() then 'expired' when s.pin_generation=0 then 'legacy' else 'active' end)
 from public.orders o where o.store_id=s.store_id and o.table_session_id=s.id and o.type='dine_in';
$$;
-- Rebind shared projections after renaming the audited unpaid helpers. Takeaway
-- review fields remain intact; dine-in payment is session-derived.
create or replace function public.p3_order_summary(o public.orders) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare i public.payment_intents;
begin
 if o.type='dine_in' then return public.p4_dine_in_summary(o); end if;
 select * into i from public.payment_intents where order_id=o.id;
 return public.p4_dine_in_summary(o)||jsonb_build_object('table',null,'paymentReviewRequired',public.p4_order_payment_held(o),
  'paymentStatus',case i.status when 'succeeded' then 'paid' else i.status end,
  'statusLabel',case o.status when 'pending_payment' then 'Chờ thanh toán' when 'payment_exception' then 'Cần đối soát thanh toán' else public.p4_dine_in_summary(o)->>'statusLabel' end,
  'fulfillmentStatus',case when o.status in('pending_payment','payment_exception') then 'awaiting_preparation' when o.status='completed' then 'collected' else public.p4_dine_in_summary(o)->>'fulfillmentStatus' end);
end; $$;
create or replace function public.p3_order_view(o public.orders) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare i public.payment_intents;
begin
 if o.type='dine_in' then return public.p4_dine_in_view(o); end if;
 select * into i from public.payment_intents where order_id=o.id;
 return public.p5_unpaid_order_view(o)||public.p3_order_summary(o)||jsonb_build_object('payment',public.p4_payment_view(i));
end; $$;

-- Financial revision excludes fulfillment/version changes: a prepared bill can
-- finish service without changing its price. IDs identify immutable line snapshots.
-- Cancellation is included; a later change requires cancel+prepare again.
create function public.p5_bill_version(sid uuid) returns text language sql stable set search_path=pg_catalog as $$
 select md5(coalesce(jsonb_agg(jsonb_build_object('id',o.id,'cancelled',o.status='cancelled','totalVnd',o.total_vnd,
  'lines',(select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name_snapshot,'base',i.base_unit_price_vnd,
   'options',i.options_snapshot,'unit',i.unit_price_vnd,'quantity',i.qty,'total',i.line_total_vnd) order by i.ordinal)
   from public.order_items i where i.order_id=o.id and i.store_id=o.store_id)) order by o.id),'[]'::jsonb)::text)
 from public.orders o where o.table_session_id=sid and o.type='dine_in';
$$;
create function public.p5_session_bill(sid uuid) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare s public.table_sessions; settlement public.session_settlements; result jsonb; total numeric;
begin
 select * into s from public.table_sessions where id=sid;
 if not found then return null; end if;
 select * into settlement from public.session_settlements where table_session_id=s.id and store_id=s.store_id;
 -- Exact numeric aggregate of committed line snapshots, never today's menu.
 select coalesce(sum(i.line_total_vnd),0) into total from public.orders o join public.order_items i on i.order_id=o.id and i.store_id=o.store_id
  where o.table_session_id=s.id and o.store_id=s.store_id and o.type='dine_in' and o.status<>'cancelled';
 if total>9007199254740991 then raise numeric_value_out_of_range using message='Session bill exceeds safe wire range'; end if;
 select jsonb_build_object('table',(select jsonb_build_object('id',t.id,'label',t.label) from public.dining_tables t where t.id=s.table_id and t.store_id=s.store_id),
  'session',public.p2_session_view(s),'orders',coalesce(jsonb_agg(public.p4_dine_in_view(o) order by o.service_date,o.ticket_no,o.id) filter(where o.id is not null),'[]'::jsonb),
  'totalVnd',total,'outstandingOrders',count(o.id) filter(where o.status not in('completed','cancelled')),
  'billVersion',public.p5_bill_version(s.id),'canAcceptMoreOrders',s.status='open' and s.code_expires_at>statement_timestamp()
   and exists(select 1 from public.stores st where st.id=s.store_id and st.accepting_orders),
  'canSettle',s.status='checkout_pending' and settlement.id is null and count(o.id) filter(where o.status not in('completed','cancelled'))=0
   and exists(select 1 from public.session_checkout_snapshots c where c.table_session_id=s.id and c.session_version=s.version
    and c.bill_version=public.p5_bill_version(s.id) and c.total_vnd=total),
  'settledAt',settlement.settled_at,'paymentMethod',settlement.payment_method)
 into result from public.orders o where o.table_session_id=s.id and o.store_id=s.store_id and o.type='dine_in';
 return result;
end; $$;

-- Constraint defense: even privileged accidental writes cannot commit a ledger
-- with an open session, unsettled service, or a different financial snapshot.
create function public.p5_settlement_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare target uuid; p public.session_settlements; s public.table_sessions; c public.session_checkout_snapshots; bill jsonb; total numeric;
begin
 target:=new.table_session_id;
 if target is null then return null; end if;
 select coalesce(sum(total_vnd) filter(where status<>'cancelled'),0) into total from public.orders where table_session_id=target and type='dine_in';
 if total>9007199254740991 then raise check_violation using message='Session bill exceeds safe wire range'; end if;
 select * into p from public.session_settlements where table_session_id=target;
 if not found then return null; end if;
 select * into s from public.table_sessions where id=p.table_session_id and store_id=p.store_id;
 select * into c from public.session_checkout_snapshots where id=p.checkout_id and store_id=p.store_id;
 bill:=public.p5_session_bill(s.id);
 if s.status<>'closed' or c.table_session_id is distinct from s.id or c.session_version<>s.version-1
  or p.bill_version is distinct from c.bill_version or p.total_vnd<>c.total_vnd
  or p.bill_version is distinct from bill->>'billVersion' or p.total_vnd<>(bill->>'totalVnd')::bigint
  or (bill->>'outstandingOrders')::bigint<>0 then raise check_violation using message='Invalid dine-in settlement'; end if;
 return null;
end; $$;
create constraint trigger session_settlement_consistency after insert on public.session_settlements deferrable initially deferred for each row execute function public.p5_settlement_guard();
create constraint trigger settled_order_consistency after insert or update on public.orders deferrable initially deferred for each row execute function public.p5_settlement_guard();

create function public.p5_session_execute(action text,input jsonb) returns jsonb
language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare target uuid:=(input->>'sessionId')::uuid; sid uuid:=(input->>'storeId')::uuid;
 actor uuid:=(input->>'ownerId')::uuid; command uuid:=(input->>'requestId')::uuid;
 s public.table_sessions; op public.operation_requests; p public.session_settlements; c public.session_checkout_snapshots;
 o public.orders; bill jsonb; result jsonb; fingerprint text; access_result jsonb; before_status text;
 retry integer; topic text; event_uuid uuid;
begin
 if action='guest_bill' then
  -- QR locates one current table; proof/cookie authorizes only that session.
  select ts.* into s from public.table_sessions ts join public.qr_codes q on q.table_id=ts.table_id and q.store_id=ts.store_id
   join public.dining_tables t on t.id=ts.table_id and t.store_id=ts.store_id
   join public.guest_access g on g.scope_id=ts.id and g.store_id=ts.store_id
  where q.public_code=input->>'qrCode' and q.type='table' and q.active and q.retired_at is null and t.active
   and ts.status in('open','checkout_pending') and g.browser_context_hash=input->>'browserHash'
   and g.token_hash=encode(extensions.digest((input->>'grantProof')||':'||ts.id::text,'sha256'),'hex') for share of ts;
  if not found then return public.p2_fail('SESSION_REQUIRED'); end if;
  access_result:=public.p3_session_access(s,input->>'browserHash',input->>'grantProof');
  if access_result ? 'error' then return access_result; end if;
  retry:=public.p2_rate('session-bill:'||(input->>'browserHash')||':'||s.id,60);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  return jsonb_build_object('data',public.p5_session_bill(s.id));
 end if;
 if action not in('owner_bill','begin_checkout','cancel_checkout','confirm_received') then return public.p2_fail('VALIDATION_ERROR'); end if;
 if actor is null or not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action='owner_bill' then
  select * into s from public.table_sessions where id=target and store_id=sid for share;
  if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  retry:=public.p2_rate('owner:'||actor||':read',120);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  return jsonb_build_object('data',public.p5_session_bill(s.id));
 end if;
 if command is null or target is null or input->>'expectedVersion' is null then return public.p2_fail('VALIDATION_ERROR'); end if;
 if action in('begin_checkout','confirm_received') and coalesce(input->>'expectedBillVersion','') !~ '^[a-f0-9]{32}$' then return public.p2_fail('VALIDATION_ERROR'); end if;
 if action='confirm_received' and (coalesce(input->>'paymentMethod','') not in('cash','bank_transfer') or input->'receivedConfirmed' is distinct from 'true'::jsonb) then return public.p2_fail('VALIDATION_ERROR'); end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('action',action,'body',input-'storeId'-'ownerId'-'requestId')::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(sid::text||':'||command,0));
 select * into op from public.operation_requests r where r.store_id=sid and r.request_id=command;
 if found then
  if op.actor_id<>actor then return public.p2_fail('FORBIDDEN'); end if;
  if op.operation<>'session.'||action or op.request_fingerprint<>fingerprint then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
  return jsonb_build_object('data',op.result_json);
 end if;
 retry:=public.p2_rate('owner:'||actor||':write',30);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 perform 1 from public.stores where id=sid for no key update;
 select * into s from public.table_sessions where id=target and store_id=sid for update;
 if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if s.status='closed' or s.version<>(input->>'expectedVersion')::bigint then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
 -- Session UPDATE excludes all compliant creation and fulfillment writers.
 -- Lock existing rows too, in stable order, before checking the final bill.
 perform 1 from public.orders x where x.table_session_id=s.id and x.store_id=sid order by x.id for update;
 bill:=public.p5_session_bill(s.id); before_status:=s.status;
 if action in('begin_checkout','confirm_received') and input->>'expectedBillVersion' is distinct from bill->>'billVersion' then return public.p2_fail('BILL_CHANGED'); end if;
 if action='begin_checkout' then
  if s.status<>'open' then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
  update public.table_sessions set status='checkout_pending' where id=s.id returning * into s;
  bill:=public.p5_session_bill(s.id);
  insert into public.session_checkout_snapshots(store_id,table_session_id,session_version,bill_version,total_vnd,bill,actor_id,request_id)
   values(sid,s.id,s.version,bill->>'billVersion',(bill->>'totalVnd')::bigint,bill,actor,command);
  bill:=public.p5_session_bill(s.id);
 elsif action='cancel_checkout' then
  if s.status<>'checkout_pending' or public.p5_session_paid(s.id) then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
  update public.table_sessions set status='open' where id=s.id returning * into s;
  bill:=public.p5_session_bill(s.id);
 else
  if s.status<>'checkout_pending' or public.p5_session_paid(s.id) then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
  if (bill->>'outstandingOrders')::bigint>0 then return public.p2_fail('SESSION_ORDERS_OUTSTANDING'); end if;
  select * into c from public.session_checkout_snapshots where table_session_id=s.id and session_version=s.version and store_id=sid;
  if not found or c.bill_version is distinct from bill->>'billVersion' or c.total_vnd<>(bill->>'totalVnd')::bigint then return public.p2_fail('BILL_CHANGED'); end if;
  insert into public.session_settlements(store_id,table_session_id,checkout_id,total_vnd,bill_version,payment_method,received_confirmed,actor_id,request_id)
   values(sid,s.id,c.id,c.total_vnd,c.bill_version,input->>'paymentMethod',true,actor,command) returning * into p;
  -- Existing session guard atomically revokes grants and removes expired PIN delivery.
  update public.table_sessions set status='closed' where id=s.id returning * into s;
  for o in update public.orders set status=status where table_session_id=s.id and store_id=sid returning * loop
   perform public.p4_emit(o,'order.payment_updated');
  end loop;
  bill:=public.p5_session_bill(s.id);
 end if;
 insert into public.session_settlement_audit_log(store_id,table_session_id,actor_id,action,request_id,before_status,after_status,session_version,bill_version,total_vnd)
  values(sid,s.id,actor,action,command,before_status,s.status,s.version,bill->>'billVersion',(bill->>'totalVnd')::bigint);
 topic:=case when action='confirm_received' then 'table_session.closed' else 'table_session.updated' end;
 event_uuid:=gen_random_uuid();
 insert into public.outbox_events(id,topic,aggregate_id,version,payload) values(event_uuid,topic,s.id,s.version,
  jsonb_build_object('eventId',event_uuid,'aggregateId',s.id,'version',s.version,'type',topic));
 result:=jsonb_build_object('detail',jsonb_build_object('table',bill->'table','session',bill->'session','orders',
  coalesce((select jsonb_agg(value-'lines'-'payment'-'note') from jsonb_array_elements(bill->'orders')),'[]'::jsonb)),
  'bill',bill,'settlement',case when p.id is null then null else jsonb_build_object('id',p.id,'tableSessionId',s.id,
   'totalVnd',p.total_vnd,'paymentMethod',p.payment_method,'status','succeeded','settledAt',p.settled_at) end);
 insert into public.operation_requests(store_id,request_id,actor_id,operation,request_fingerprint,result_json)
  values(sid,command,actor,'session.'||action,fingerprint,result);
 return jsonb_build_object('data',result);
end; $$;

revoke all on function public.p5_session_paid(uuid),public.p5_unpaid_order_view(public.orders),public.p5_unpaid_order_summary(public.orders),
 public.p4_dine_in_view(public.orders),public.p4_dine_in_summary(public.orders),public.p5_bill_version(uuid),public.p5_session_bill(uuid),public.p5_settlement_guard(),public.p5_session_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p5_session_paid(uuid),public.p5_unpaid_order_view(public.orders),public.p5_unpaid_order_summary(public.orders),
 public.p4_dine_in_view(public.orders),public.p4_dine_in_summary(public.orders),public.p5_bill_version(uuid),public.p5_session_bill(uuid),public.p5_settlement_guard(),public.p5_session_execute(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
