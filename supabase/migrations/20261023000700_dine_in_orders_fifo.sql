-- P3-C01. Additive, atomic, dine-in only; no payment/claim/close API.
begin;

create table public.ticket_counters (
 store_id uuid not null references public.stores(id) on delete restrict,
 service_date date not null,
 last_ticket bigint not null check(last_ticket between 1 and 9007199254740991),
 primary key(store_id,service_date)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 type text not null check(type='dine_in'), -- Phase4 must explicitly extend this constraint.
 table_session_id uuid not null,
 table_id uuid not null,
 table_label_snapshot text not null check(char_length(table_label_snapshot) between 1 and 80),
 status text not null check(status in('accepted','preparing','ready','completed','cancelled')),
 client_request_id uuid not null,
 ticket_no bigint not null check(ticket_no between 1 and 9007199254740991),
 service_date date not null,
 accepted_at timestamptz not null,
 total_vnd bigint not null check(total_vnd between 0 and 9007199254740991),
 item_count integer not null check(item_count between 1 and 9900),
 note text check(char_length(note)<=500),
 version bigint not null default 1 check(version between 1 and 9007199254740991),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(store_id,id), unique(store_id,client_request_id),
 unique(store_id,service_date,ticket_no),
 foreign key(store_id,table_session_id) references public.table_sessions(store_id,id) on delete restrict,
 foreign key(store_id,table_id) references public.dining_tables(store_id,id) on delete restrict
);
create index orders_active_queue on public.orders(store_id,service_date,ticket_no) where status='accepted';
create index orders_session on public.orders(store_id,table_session_id,created_at,id);

-- Snapshot JSON uses physical snake_case, serialized to canonical wire keys below.
create function public.p3_valid_options(options jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare x jsonb; seen uuid[]:='{}'; oid uuid;
begin
 if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)>50 then return false; end if;
 for x in select value from jsonb_array_elements(options) loop
  if jsonb_typeof(x)<>'object' or (select count(*) from jsonb_object_keys(x))<>3
   or not (x ?& array['menu_option_id','name','price_delta_vnd'])
   or jsonb_typeof(x->'name')<>'string' or char_length(x->>'name') not between 1 and 120
   or jsonb_typeof(x->'price_delta_vnd')<>'number' then return false; end if;
  oid:=(x->>'menu_option_id')::uuid;
  if oid is null or oid=any(seen) or (x->>'price_delta_vnd')::numeric not between 0 and 9007199254740991
   or trunc((x->>'price_delta_vnd')::numeric)<>(x->>'price_delta_vnd')::numeric then return false; end if;
  seen:=array_append(seen,oid);
 end loop;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;
create table public.order_items (
 id uuid primary key default gen_random_uuid(), store_id uuid not null,
 order_id uuid not null, ordinal integer not null check(ordinal between 1 and 100), item_id uuid not null,
 name_snapshot text not null check(char_length(name_snapshot) between 1 and 120),
 base_unit_price_vnd bigint not null check(base_unit_price_vnd between 0 and 9007199254740991),
 options_snapshot jsonb not null check(public.p3_valid_options(options_snapshot)),
 unit_price_vnd bigint not null check(unit_price_vnd between 0 and 9007199254740991),
 qty integer not null check(qty between 1 and 99),
 line_total_vnd bigint not null check(line_total_vnd between 0 and 9007199254740991),
 note text check(char_length(note)<=500),
 unique(order_id,ordinal),
 foreign key(store_id,order_id) references public.orders(store_id,id) on delete restrict,
 foreign key(store_id,item_id) references public.menu_items(store_id,id) on delete restrict,
 check(line_total_vnd::numeric=unit_price_vnd::numeric*qty)
);
create table public.order_requests (
 store_id uuid not null, client_request_id uuid not null,
 browser_context_hash text not null references public.guest_browser_contexts(token_hash),
 guest_access_id uuid not null references public.guest_access(id),
 order_id uuid not null,
 request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 -- Protected command result, never audit/public logs. Preserves replay after later transitions.
 result_json jsonb not null check(jsonb_typeof(result_json)='object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(store_id,client_request_id), unique(order_id),
 foreign key(store_id,order_id) references public.orders(store_id,id) on delete restrict
);
create table public.order_events (
 id uuid primary key default gen_random_uuid(), store_id uuid not null, order_id uuid not null,
 event_type text not null, version bigint not null check(version>0),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(store_id,order_id) references public.orders(store_id,id) on delete restrict,
 unique(order_id,version,event_type)
);

create function public.p3_order_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise check_violation using message='Order history cannot be deleted'; end if;
 if tg_op='INSERT' then
  if not exists(select 1 from public.table_sessions s where s.id=new.table_session_id and s.store_id=new.store_id and s.table_id=new.table_id) then
   raise check_violation using message='Order session/table mismatch';
  end if;
  return new;
 end if;
 if (to_jsonb(new)-'status'-'version'-'updated_at') is distinct from (to_jsonb(old)-'status'-'version'-'updated_at') then
  raise check_violation using message='Immutable order acceptance snapshot';
 end if;
 new.version:=old.version+1;
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 return new;
end; $$;
create trigger order_guard before insert or update or delete on public.orders for each row execute function public.p3_order_guard();
create function public.p3_item_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare option_sum numeric;
begin
 if tg_op<>'INSERT' then raise check_violation using message='Order line snapshots are immutable'; end if;
 select coalesce(sum((x->>'price_delta_vnd')::numeric),0) into option_sum from jsonb_array_elements(new.options_snapshot) x;
 if new.unit_price_vnd::numeric<>new.base_unit_price_vnd::numeric+option_sum then raise check_violation using message='Order line arithmetic mismatch'; end if;
 return new;
end; $$;
create trigger order_item_guard before insert or update or delete on public.order_items for each row execute function public.p3_item_guard();
-- Deferred until the complete transaction has inserted all lines. No half-order can commit.
create function public.p3_order_totals_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare target uuid; o public.orders; total numeric; quantity bigint; lines bigint;
begin
 if tg_table_name='orders' then target:=new.id; else target:=new.order_id; end if;
 select * into o from public.orders where id=target;
 select coalesce(sum(line_total_vnd),0),coalesce(sum(qty),0),count(*) into total,quantity,lines from public.order_items where order_id=target;
 if total<>o.total_vnd or quantity<>o.item_count or lines not between 1 and 100 then raise check_violation using message='Order totals do not match snapshots'; end if;
 return null;
end; $$;
create constraint trigger order_totals_guard after insert or update on public.orders deferrable initially deferred
 for each row execute function public.p3_order_totals_guard();
create constraint trigger order_line_totals_guard after insert on public.order_items deferrable initially deferred
 for each row execute function public.p3_order_totals_guard();

create function public.p3_service_date(accepted_at timestamptz,timezone text) returns date
language sql stable set search_path=pg_catalog as $$ select (accepted_at at time zone timezone)::date $$;
create function public.p3_next_ticket(sid uuid,day date) returns bigint language sql set search_path=pg_catalog as $$
 insert into public.ticket_counters(store_id,service_date,last_ticket) values(sid,day,1)
 on conflict(store_id,service_date) do update set last_ticket=ticket_counters.last_ticket+1 returning last_ticket;
$$;
create function public.p3_order_view(o public.orders) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',o.id,'storeId',o.store_id,'type',o.type,'tableSessionId',o.table_session_id,
 'table',jsonb_build_object('id',o.table_id,'label',o.table_label_snapshot),
 'status',o.status,'statusLabel',case o.status when 'accepted' then 'Chờ làm' when 'preparing' then 'Đang làm' when 'ready' then 'Sẵn sàng' when 'completed' then 'Đã giao' else 'Đã hủy' end,
 'ticketNo',o.ticket_no,'serviceDate',o.service_date,'acceptedAt',o.accepted_at,
 'paymentStatus','unpaid','fulfillmentStatus',case o.status when 'accepted' then 'awaiting_preparation' when 'completed' then 'served' else o.status end,
 'totalVnd',o.total_vnd,'itemCount',o.item_count,'createdAt',o.created_at,'updatedAt',o.updated_at,'version',o.version,'note',o.note,
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'menuItemId',i.item_id,'name',i.name_snapshot,'baseUnitPriceVnd',i.base_unit_price_vnd,
  'options',coalesce((select jsonb_agg(jsonb_build_object('menuOptionId',x->>'menu_option_id','name',x->>'name','priceDeltaVnd',(x->>'price_delta_vnd')::bigint) order by ordinal)
   from jsonb_array_elements(i.options_snapshot) with ordinality as opts(x,ordinal)),'[]'::jsonb),
  'unitPriceVnd',i.unit_price_vnd,'quantity',i.qty,'lineTotalVnd',i.line_total_vnd,'note',i.note) order by i.ordinal)
  from public.order_items i where i.order_id=o.id),'[]'::jsonb),
 'payment',jsonb_build_object('kind','table_session','tableSessionId',o.table_session_id,'intentId',null,'intentStatus',null,
  'status','unpaid','statusLabel','Chưa thanh toán','amountVnd',o.total_vnd,'currency','VND','updatedAt',o.updated_at,'reconciliationRequired',false));
$$;

-- Caller holds session lock. A session grant authorizes all dine-in orders of that session.
create function public.p3_session_access(s public.table_sessions,browser_hash text,proof text) returns jsonb
language plpgsql set search_path=pg_catalog as $$
declare g public.guest_access;
begin
 if s.id is null or s.status='closed' or s.code_expires_at<=clock_timestamp() then return public.p2_fail('SESSION_EXPIRED'); end if;
 -- Recheck after lock waits, and keep expiry/revoke maintenance from racing commit.
 perform 1 from public.guest_browser_contexts where token_hash=browser_hash and expires_at>clock_timestamp() for share;
 if not found then return public.p2_fail('UNAUTHORIZED'); end if;
 select * into g from public.guest_access where store_id=s.store_id and scope_id=s.id and browser_context_hash=browser_hash
  and token_hash=encode(extensions.digest(proof||':'||s.id::text,'sha256'),'hex') for share;
 if not found then return public.p2_fail('SESSION_REQUIRED'); end if;
 if g.revoked_at is not null or g.expires_at<=clock_timestamp() then return public.p2_fail('SESSION_EXPIRED'); end if;
 return jsonb_build_object('accessId',g.id);
end; $$;

create function public.p3_order_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $$
#variable_conflict use_variable
declare
 browser_hash text:=input->>'browserHash'; proof text:=input->>'grantProof'; cmd jsonb:=input->'command';
 q public.qr_codes; t public.dining_tables; st public.stores; s public.table_sessions; o public.orders; r public.order_requests;
 item public.menu_items; opt public.menu_item_options; line jsonb; oid jsonb; opts jsonb; snapshots jsonb:='[]';
 access_result jsonb; result jsonb; fingerprint text; retry integer; qty integer; line_ordinal integer:=0;
 unit numeric; line_total numeric; total numeric:=0; quantity integer:=0; accepted timestamptz; day date; ticket bigint;
begin
 if action not in('create','get') then return public.p2_fail('VALIDATION_ERROR'); end if;
 if browser_hash is null or browser_hash !~ '^[a-f0-9]{64}$' or proof is null or proof !~ '^[a-f0-9]{64}$'
  or not exists(select 1 from public.guest_browser_contexts where token_hash=browser_hash and expires_at>clock_timestamp()) then return public.p2_fail('UNAUTHORIZED'); end if;
 if action='get' then
  select * into o from public.orders where id=(input->>'orderId')::uuid;
  if not found then return public.p2_fail('ORDER_NOT_FOUND'); end if;
  -- Check membership before exposing expired/current session state to outsiders.
  if not exists(select 1 from public.guest_access where scope_id=o.table_session_id and store_id=o.store_id and browser_context_hash=browser_hash
    and token_hash=encode(extensions.digest(proof||':'||o.table_session_id::text,'sha256'),'hex')) then return public.p2_fail('ORDER_NOT_FOUND'); end if;
  select * into s from public.table_sessions where id=o.table_session_id and store_id=o.store_id for share;
  access_result:=public.p3_session_access(s,browser_hash,proof);
  if access_result ? 'error' then return access_result; end if;
  retry:=public.p2_rate('order-read:'||browser_hash||':'||o.id,60);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  -- Lock order after session, then fetch a fresh projection for future transitions.
  select * into o from public.orders where id=o.id for share;
  result:=public.p3_order_view(o);
  if coalesce((input->>'includePickup')::boolean,false) then
   if not exists(select 1 from public.order_requests where order_id=o.id and browser_context_hash=browser_hash and guest_access_id=(access_result->>'accessId')::uuid) then return public.p2_fail('FORBIDDEN'); end if;
   result:=jsonb_build_object('order',result,'pickup',null);
  end if;
  return jsonb_build_object('data',result);
 end if;
 -- Locator is not a permission. Keep retired rows locatable for authenticated replay.
 select * into q from public.qr_codes where public_code=cmd->>'qrCode';
 if not found then return public.p2_fail('INVALID_QR'); end if;
 fingerprint:=encode(extensions.digest(jsonb_build_object('operation','create_order','command',cmd-'clientRequestId')::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('order:'||q.store_id::text||':'||(cmd->>'clientRequestId'),0));
 select * into r from public.order_requests where store_id=q.store_id and client_request_id=(cmd->>'clientRequestId')::uuid;
 if found then
  if r.browser_context_hash<>browser_hash then return public.p2_fail('FORBIDDEN'); end if;
  select * into o from public.orders where id=r.order_id;
  select * into s from public.table_sessions where id=o.table_session_id and store_id=o.store_id for share;
  access_result:=public.p3_session_access(s,browser_hash,proof);
  if access_result ? 'error' then return access_result; end if;
  if r.guest_access_id<>(access_result->>'accessId')::uuid then return public.p2_fail('FORBIDDEN'); end if;
  if r.request_fingerprint<>fingerprint then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
  return jsonb_build_object('data',r.result_json);
 end if;
 -- Uniform order: command advisory -> store -> table -> QR -> session -> grant -> rate -> counter/order.
 -- Serialize menu/settings writes without blocking FK KEY SHARE checks during
 -- a concurrent session close. FOR UPDATE here creates a store/session FK cycle.
 select * into st from public.stores where id=q.store_id for no key update;
 if q.type='table' then
  select * into t from public.dining_tables where id=q.table_id and store_id=q.store_id and active for share;
  if not found then return public.p2_fail('INVALID_QR'); end if;
 end if;
 select * into q from public.qr_codes where id=q.id and store_id=st.id and active and retired_at is null for share;
 if not found then return public.p2_fail('INVALID_QR'); end if;
 if q.type<>'table' then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
 select * into s from public.table_sessions where table_id=t.id and store_id=st.id and status in('open','checkout_pending') for update;
 access_result:=public.p3_session_access(s,browser_hash,proof);
 if access_result ? 'error' then return access_result; end if;
 if s.status<>'open' then return public.p2_fail('SESSION_CHECKOUT_PENDING'); end if;
 retry:=public.p2_rate('order-create:'||browser_hash||':'||st.id,10);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 if not st.accepting_orders then return public.p2_fail('STORE_NOT_ACCEPTING_ORDERS'); end if;
 -- All validation happens before any counter/order/resource writes. Options are optional/additive.
 for line in select value from jsonb_array_elements(cmd->'items') loop
  select i.* into item from public.menu_items i join public.menu_categories c on c.store_id=i.store_id and c.id=i.category_id
   where i.id=(line->>'menuItemId')::uuid and i.store_id=st.id and i.active and i.available and c.active;
  if not found then return public.p2_fail('OUT_OF_STOCK'); end if;
  opts:='[]'; unit:=item.price_vnd; qty:=(line->>'quantity')::integer;
  if qty not between 1 and 99 or jsonb_array_length(line->'optionIds')>50 then return public.p2_fail('VALIDATION_ERROR'); end if;
  for oid in select value from jsonb_array_elements(line->'optionIds') loop
   select * into opt from public.menu_item_options where id=(oid#>>'{}')::uuid and item_id=item.id and store_id=st.id and active;
   if not found or exists(select 1 from jsonb_array_elements(opts) x where x->>'menu_option_id'=opt.id::text) then return public.p2_fail('VALIDATION_ERROR'); end if;
   opts:=opts||jsonb_build_array(jsonb_build_object('menu_option_id',opt.id,'name',opt.name,'price_delta_vnd',opt.price_delta_vnd));
   unit:=unit+opt.price_delta_vnd;
  end loop;
  line_total:=unit*qty; total:=total+line_total; quantity:=quantity+qty; line_ordinal:=line_ordinal+1;
  if unit>9007199254740991 or line_total>9007199254740991 or total>9007199254740991 or line_ordinal>100 then return public.p2_fail('VALIDATION_ERROR'); end if;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('item_id',item.id,'name',item.name,'base',item.price_vnd,'options',opts,'unit',unit,'qty',qty,'total',line_total,'note',line->'note','ordinal',line_ordinal));
 end loop;
 if line_ordinal=0 then return public.p2_fail('VALIDATION_ERROR'); end if;
 -- Availability/option errors precede stale revision, per R04. Zero VND dine-in is valid; no provider involved.
 if cmd->>'menuRevision'<>st.menu_revision::text then return public.p2_fail('PRICE_CHANGED'); end if;
 accepted:=clock_timestamp(); day:=public.p3_service_date(accepted,st.timezone);
 ticket:=public.p3_next_ticket(st.id,day);
 insert into public.orders(store_id,type,table_session_id,table_id,table_label_snapshot,status,client_request_id,ticket_no,service_date,accepted_at,total_vnd,item_count,note,created_at,updated_at)
 values(st.id,'dine_in',s.id,t.id,t.label,'accepted',(cmd->>'clientRequestId')::uuid,ticket,day,accepted,total::bigint,quantity,cmd->>'note',accepted,accepted) returning * into o;
 insert into public.order_items(store_id,order_id,ordinal,item_id,name_snapshot,base_unit_price_vnd,options_snapshot,unit_price_vnd,qty,line_total_vnd,note)
 select st.id,o.id,(x->>'ordinal')::integer,(x->>'item_id')::uuid,x->>'name',(x->>'base')::bigint,x->'options',(x->>'unit')::bigint,(x->>'qty')::integer,(x->>'total')::bigint,x->>'note'
 from jsonb_array_elements(snapshots) x;
 result:=public.p3_order_view(o);
 insert into public.order_requests(store_id,client_request_id,browser_context_hash,guest_access_id,order_id,request_fingerprint,result_json)
 values(st.id,o.client_request_id,browser_hash,(access_result->>'accessId')::uuid,o.id,fingerprint,result);
 insert into public.order_events(store_id,order_id,event_type,version) values(st.id,o.id,'order.created',1),(st.id,o.id,'order.accepted',1);
 insert into public.outbox_events(id,topic,aggregate_id,version,payload)
 select event_id,topic,o.id,1,jsonb_build_object('eventId',event_id,'aggregateId',o.id,'version',1,'type',topic)
 from (values('order.created'::text,gen_random_uuid()),('order.accepted'::text,gen_random_uuid())) events(topic,event_id);
 return jsonb_build_object('data',result);
end; $$;

alter table public.ticket_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_requests enable row level security;
alter table public.order_events enable row level security;
revoke all on public.ticket_counters,public.orders,public.order_items,public.order_requests,public.order_events from public,anon,authenticated,service_role;
grant select,insert,update on public.ticket_counters,public.orders to service_role;
grant select,insert on public.order_items,public.order_requests,public.order_events to service_role;
-- FOR SHARE on grants requires at least one UPDATE column grant (no anonymous access).
grant update(revoked_at) on public.guest_access to service_role;
revoke all on function public.p3_valid_options(jsonb),public.p3_order_guard(),public.p3_item_guard(),public.p3_order_totals_guard(),
 public.p3_service_date(timestamptz,text),public.p3_next_ticket(uuid,date),public.p3_order_view(public.orders),
 public.p3_session_access(public.table_sessions,text,text),public.p3_order_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p3_valid_options(jsonb),public.p3_order_guard(),public.p3_item_guard(),public.p3_order_totals_guard(),
 public.p3_service_date(timestamptz,text),public.p3_next_ticket(uuid,date),public.p3_order_view(public.orders),
 public.p3_session_access(public.table_sessions,text,text),public.p3_order_execute(text,jsonb) to service_role;
commit;
