-- P4-C01. Atomic extension; no existing orders, sessions, tables or QR are rewritten.
-- Rollback before COMMIT restores all catalog definitions. After commit, use a
-- forward migration: dropping financial history is never a production rollback.
begin;

-- Fail closed on unexpected Phase3 drift. Body digests normalize CRLF/LF only;
-- no pg_get_functiondef string surgery or marker matching is used.
do $preflight$
declare expected record; actual text;
begin
 for expected in select * from (values ('public.p3_order_guard()','a2e553124ef4fc7c02a63a9301aa11fa'),
 ('public.p3_order_view(public.orders)','3427d4b5d2bf4e2f4b43d84335e6bc0f'),
 ('public.p3_order_summary(public.orders)','c7d60e0987eb5c3b1faae6216e52e7a9'),
 ('public.p3_owner_orders_execute(text,jsonb)','b8e8f56e9b11e3575b745a9e49576165')) x(signature,body_md5) loop
  select md5(replace(p.prosrc,E'\r\n',E'\n')) into actual from pg_proc p where p.oid=to_regprocedure(expected.signature);
  if actual is distinct from expected.body_md5 then
   raise exception 'P4-C01 preflight: unexpected function body for %; audit deployed Phase3 definition before retry',expected.signature;
  end if;
 end loop;
end;
$preflight$;

alter table public.orders
 drop constraint orders_type_check,
 drop constraint orders_status_check,
 alter column table_session_id drop not null,
 alter column table_id drop not null,
 alter column table_label_snapshot drop not null,
 alter column ticket_no drop not null,
 alter column service_date drop not null,
 alter column accepted_at drop not null,
 add constraint orders_type_check check(type in('dine_in','takeaway')),
 add constraint orders_status_check check(status in('pending_payment','accepted','preparing','ready','completed','cancelled','payment_exception')),
 add constraint orders_context_check check(
  (type='dine_in' and table_session_id is not null and table_id is not null and table_label_snapshot is not null
   and ticket_no is not null and service_date is not null and accepted_at is not null and status not in('pending_payment','payment_exception'))
  or (type='takeaway' and table_session_id is null and table_id is null and table_label_snapshot is null and total_vnd>0
   and ((status in('pending_payment','payment_exception','cancelled') and ticket_no is null and service_date is null and accepted_at is null)
    or (status in('accepted','preparing','ready') and ticket_no is not null and service_date is not null and accepted_at is not null))));
-- Takeaway completed/pickup is intentionally not enabled by this migration.

create sequence public.p4_payment_reference_seq as bigint minvalue 1000000000000 maxvalue 9007199254740991 no cycle;
create table public.payment_intents (
 id uuid primary key default gen_random_uuid(), store_id uuid not null, order_id uuid not null unique,
 provider text not null default 'payos' check(provider='payos'),
 provider_reference text not null default nextval('public.p4_payment_reference_seq')::text,
 channel_hash text not null check(channel_hash ~ '^[a-f0-9]{64}$'),
 account_number text not null check(account_number ~ '^\d{4,40}$'),
 amount_vnd bigint not null check(amount_vnd between 1 and 9007199254740991), currency text not null default 'VND' check(currency='VND'),
 status text not null default 'pending' check(status in('pending','succeeded','expired','exception')),
 expires_at timestamptz not null default (clock_timestamp()+interval '10 minutes'),
 provider_link_id text, checkout_url text, qr_payload text,
 create_attempts integer not null default 0, create_lease uuid, lease_until timestamptz,
 needs_reconciliation boolean not null default false, last_observed_status text, last_checked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(provider,provider_reference), unique(provider,provider_link_id), unique(store_id,id),
 foreign key(store_id,order_id) references public.orders(store_id,id) on delete restrict,
 check((checkout_url is null and qr_payload is null) or (checkout_url is not null and provider_link_id is not null))
);
create index payment_intents_pending on public.payment_intents(expires_at,id) where status='pending';
create table public.takeaway_requests (
 store_id uuid not null, client_request_id uuid not null, order_id uuid not null unique,
 browser_context_hash text not null references public.guest_browser_contexts(token_hash),
 proof_hash text not null check(proof_hash ~ '^[a-f0-9]{64}$'),
 request_fingerprint text not null, result_json jsonb not null,
 access_expires_at timestamptz not null default (clock_timestamp()+interval '12 hours'),
 primary key(store_id,client_request_id),
 foreign key(store_id,order_id) references public.orders(store_id,id) on delete restrict
);
create table public.payment_webhook_inbox (
 id uuid primary key default gen_random_uuid(), provider text not null check(provider='payos'),
 event_id text not null check(char_length(event_id) between 1 and 200),
 transaction_id text not null check(char_length(transaction_id) between 1 and 200),
 channel_hash text not null check(channel_hash ~ '^[a-f0-9]{64}$'),
 event jsonb not null, evidence jsonb not null,
 state text not null default 'received' check(state in('received','processed','exception','ignored','failed')),
 reason text, attempts integer not null default 0, received_at timestamptz not null default clock_timestamp(),
 processed_at timestamptz, unique(provider,event_id)
);
create index payment_inbox_retry on public.payment_webhook_inbox(received_at,id) where state in('received','failed');
create index payment_inbox_reference on public.payment_webhook_inbox((event->>'reference'),received_at) where state in('received','failed');
create table public.payments (
 id uuid primary key default gen_random_uuid(), store_id uuid not null, intent_id uuid not null unique,
 provider text not null check(provider='payos'), transaction_id text not null,
 amount_vnd bigint not null check(amount_vnd between 1 and 9007199254740991), currency text not null check(currency='VND'),
 inbox_id uuid not null unique references public.payment_webhook_inbox(id),
 paid_at timestamptz not null, recorded_at timestamptz not null default clock_timestamp(),
 unique(provider,transaction_id), foreign key(store_id,intent_id) references public.payment_intents(store_id,id)
);

create or replace function public.p3_order_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise check_violation using message='Order history cannot be deleted'; end if;
 if tg_op='INSERT' then
  if new.type='dine_in' and not exists(select 1 from public.table_sessions s where s.id=new.table_session_id and s.store_id=new.store_id and s.table_id=new.table_id) then
   raise check_violation using message='Order session/table mismatch';
  end if;
  return new;
 end if;
 if (to_jsonb(new)-'status'-'version'-'updated_at'-'ticket_no'-'service_date'-'accepted_at') is distinct from
    (to_jsonb(old)-'status'-'version'-'updated_at'-'ticket_no'-'service_date'-'accepted_at') then
  raise check_violation using message='Immutable order acceptance snapshot';
 end if;
 if (new.ticket_no,new.service_date,new.accepted_at) is distinct from (old.ticket_no,old.service_date,old.accepted_at) and
  not(old.type='takeaway' and old.status='pending_payment' and new.status='accepted' and old.ticket_no is null
   and new.ticket_no is not null and new.service_date is not null and new.accepted_at is not null) then
  raise check_violation using message='Ticket may only be assigned once on verified payment';
 end if;
 new.version:=old.version+1;
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 return new;
end; $$;

-- Cross-table invariant: even a service-role direct update cannot commit an
-- accepted takeaway without its verified immutable ledger and succeeded intent.
create function public.p4_paid_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare o public.orders; target uuid;
begin
 if tg_table_name='orders' then target:=new.id;
 elsif tg_table_name='payment_intents' then target:=new.order_id;
 else select order_id into target from public.payment_intents where id=new.intent_id; end if;
 select * into o from public.orders where id=target;
 if o.type='takeaway' and o.ticket_no is not null and not exists(
  select 1 from public.payment_intents i join public.payments p on p.intent_id=i.id and p.store_id=i.store_id
   where i.order_id=o.id and i.store_id=o.store_id and i.status='succeeded' and p.amount_vnd=o.total_vnd and i.amount_vnd=o.total_vnd
    and p.provider=i.provider and p.currency=i.currency) then raise check_violation using message='Takeaway requires verified payment'; end if;
 return null;
end; $$;
create constraint trigger takeaway_paid_order after insert or update on public.orders deferrable initially deferred for each row execute function public.p4_paid_guard();
create constraint trigger takeaway_paid_intent after insert or update on public.payment_intents deferrable initially deferred for each row execute function public.p4_paid_guard();
create constraint trigger takeaway_paid_ledger after insert on public.payments deferrable initially deferred for each row execute function public.p4_paid_guard();
create trigger payment_immutable before update or delete on public.payments for each row execute function public.p3_item_guard();

create function public.p4_evidence_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise check_violation using message='Financial evidence cannot be deleted'; end if;
 if tg_table_name='payment_intents' then
  if (to_jsonb(new)-array['status','provider_link_id','checkout_url','qr_payload','create_attempts','create_lease','lease_until','needs_reconciliation','last_observed_status','last_checked_at','updated_at']) is distinct from
     (to_jsonb(old)-array['status','provider_link_id','checkout_url','qr_payload','create_attempts','create_lease','lease_until','needs_reconciliation','last_observed_status','last_checked_at','updated_at']) then
   raise check_violation using message='Immutable payment intent'; end if;
  if old.status='succeeded' and new.status<>'succeeded' then raise check_violation using message='Paid is terminal'; end if;
  if old.provider_link_id is not null and new.provider_link_id is distinct from old.provider_link_id then raise check_violation using message='Immutable provider link'; end if;
 else
  if (to_jsonb(new)-array['state','reason','attempts','processed_at']) is distinct from (to_jsonb(old)-array['state','reason','attempts','processed_at']) then
   raise check_violation using message='Immutable webhook evidence'; end if;
 end if;
 return new;
end; $$;
create trigger payment_intent_evidence before update or delete on public.payment_intents for each row execute function public.p4_evidence_guard();
create trigger payment_inbox_evidence before update or delete on public.payment_webhook_inbox for each row execute function public.p4_evidence_guard();

create function public.p4_emit(o public.orders,topic text) returns void language plpgsql set search_path=pg_catalog as $$
declare event_uuid uuid:=gen_random_uuid();
begin
 insert into public.order_events(id,store_id,order_id,event_type,version) values(event_uuid,o.store_id,o.id,topic,o.version);
 insert into public.outbox_events(id,topic,aggregate_id,version,payload)
 values(event_uuid,topic,o.id,o.version,jsonb_build_object('eventId',event_uuid,'aggregateId',o.id,'version',o.version,'type',topic));
end; $$;

create function public.p4_payment_view(i public.payment_intents) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('kind','takeaway','intentId',i.id,'amountVnd',i.amount_vnd,'currency','VND','updatedAt',i.updated_at,'expiresAt',i.expires_at,
  'status',case i.status when 'succeeded' then 'paid' else i.status end,'intentStatus',i.status,
  'statusLabel',case i.status when 'pending' then 'Đang xác nhận thanh toán' when 'succeeded' then 'Đã thanh toán' when 'expired' then 'Thanh toán hết hạn' else 'Cần đối soát' end,
  'reconciliationRequired',i.status='exception') || case when i.status='pending' then
  jsonb_build_object('checkoutUrl',i.checkout_url,'qrPayload',i.qr_payload) else '{}'::jsonb end;
$$;

create function public.p4_dine_in_view(o public.orders) returns jsonb language sql stable set search_path=pg_catalog as $$
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
create function public.p4_dine_in_summary(o public.orders) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',o.id,'storeId',o.store_id,'type',o.type,'tableSessionId',o.table_session_id,
 'table',jsonb_build_object('id',o.table_id,'label',o.table_label_snapshot),
 'status',o.status,'statusLabel',case o.status when 'accepted' then 'Chờ làm' when 'preparing' then 'Đang làm' when 'ready' then 'Sẵn sàng' when 'completed' then 'Đã giao' else 'Đã hủy' end,
 'ticketNo',o.ticket_no,'serviceDate',o.service_date,'acceptedAt',o.accepted_at,
 'paymentStatus','unpaid','fulfillmentStatus',case o.status when 'accepted' then 'awaiting_preparation' when 'completed' then 'served' else o.status end,
 'totalVnd',o.total_vnd,'itemCount',o.item_count,'createdAt',o.created_at,'updatedAt',o.updated_at,'version',o.version);
$$;

create or replace function public.p3_order_summary(o public.orders) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare i public.payment_intents;
begin
 if o.type='dine_in' then return public.p4_dine_in_summary(o); end if;
 select * into i from public.payment_intents where order_id=o.id;
 return public.p4_dine_in_summary(o)||jsonb_build_object('table',null,'paymentStatus',case i.status when 'succeeded' then 'paid' else i.status end,
  'statusLabel',case o.status when 'pending_payment' then 'Chờ thanh toán' when 'payment_exception' then 'Cần đối soát thanh toán' else public.p4_dine_in_summary(o)->>'statusLabel' end,
  'fulfillmentStatus',case when o.status in('pending_payment','payment_exception') then 'awaiting_preparation' else public.p4_dine_in_summary(o)->>'fulfillmentStatus' end);
end; $$;
create or replace function public.p3_order_view(o public.orders) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare i public.payment_intents;
begin
 if o.type='dine_in' then return public.p4_dine_in_view(o); end if;
 select * into i from public.payment_intents where order_id=o.id;
 return public.p4_dine_in_view(o)||public.p3_order_summary(o)||jsonb_build_object('payment',public.p4_payment_view(i));
end; $$;

create function public.p4_checkout(input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare browser_hash text:=input->>'browserHash'; proof text:=input->>'grantProof'; cmd jsonb:=input->'command';
 q public.qr_codes; st public.stores; o public.orders; r public.takeaway_requests;
 item public.menu_items; opt public.menu_item_options; line jsonb; oid jsonb; opts jsonb; snapshots jsonb:='[]';
 result jsonb; fingerprint text; retry integer; qty integer; line_ordinal integer:=0;
 unit numeric; line_total numeric; total numeric:=0; quantity integer:=0;
begin
 if browser_hash is null or browser_hash !~ '^[a-f0-9]{64}$' or proof is null or proof !~ '^[a-f0-9]{64}$'
  or not exists(select 1 from public.guest_browser_contexts where token_hash=browser_hash and expires_at>clock_timestamp()) then return public.p2_fail('UNAUTHORIZED'); end if;
 select * into q from public.qr_codes where public_code=cmd->>'qrCode';
 if not found then return public.p2_fail('INVALID_QR'); end if;
 if q.type<>'takeaway' then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
 if q.store_id is distinct from (input->>'configuredStoreId')::uuid then return public.p2_fail('PAYMENT_PROVIDER_UNAVAILABLE'); end if;
 fingerprint:=encode(extensions.digest((cmd-'clientRequestId')::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('order:'||q.store_id::text||':'||(cmd->>'clientRequestId'),0));
 select * into r from public.takeaway_requests where store_id=q.store_id and client_request_id=(cmd->>'clientRequestId')::uuid;
 if found then
  if r.browser_context_hash<>browser_hash or r.proof_hash<>encode(extensions.digest(proof||':'||r.order_id::text,'sha256'),'hex') then return public.p2_fail('FORBIDDEN'); end if;
  if r.access_expires_at<=clock_timestamp() then return public.p2_fail('UNAUTHORIZED'); end if;
  if r.request_fingerprint<>fingerprint then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
  return jsonb_build_object('data',r.result_json);
 end if;
 if exists(select 1 from public.orders where store_id=q.store_id and client_request_id=(cmd->>'clientRequestId')::uuid) then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
 select * into st from public.stores where id=q.store_id for no key update;
 select * into q from public.qr_codes where id=q.id and active and retired_at is null for share;
 if not found then return public.p2_fail('INVALID_QR'); end if;
 perform 1 from public.guest_browser_contexts where token_hash=browser_hash and expires_at>clock_timestamp() for share;
 if not found then return public.p2_fail('UNAUTHORIZED'); end if;
 retry:=public.p2_rate('takeaway-create:'||browser_hash||':'||st.id,10);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 retry:=public.p2_rate('takeaway-create-store:'||st.id,300);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 if not st.accepting_orders then return public.p2_fail('STORE_NOT_ACCEPTING_ORDERS'); end if;
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

 if total<=0 then return public.p2_fail('VALIDATION_ERROR'); end if;
 insert into public.orders(store_id,type,status,client_request_id,total_vnd,item_count,note)
 values(st.id,'takeaway','pending_payment',(cmd->>'clientRequestId')::uuid,total,quantity,cmd->>'note') returning * into o;
 insert into public.order_items(store_id,order_id,ordinal,item_id,name_snapshot,base_unit_price_vnd,options_snapshot,unit_price_vnd,qty,line_total_vnd,note)
 select st.id,o.id,(x->>'ordinal')::integer,(x->>'item_id')::uuid,x->>'name',(x->>'base')::bigint,x->'options',(x->>'unit')::bigint,(x->>'qty')::integer,(x->>'total')::bigint,x->>'note'
 from jsonb_array_elements(snapshots) x;

 insert into public.payment_intents(store_id,order_id,amount_vnd,channel_hash,account_number)
 values(st.id,o.id,total,input->>'channelHash',input->>'accountNumber');
 result:=public.p3_order_view(o);
 insert into public.takeaway_requests(store_id,client_request_id,order_id,browser_context_hash,proof_hash,request_fingerprint,result_json)
 values(st.id,o.client_request_id,o.id,browser_hash,encode(extensions.digest(proof||':'||o.id::text,'sha256'),'hex'),fingerprint,result);
 perform public.p4_emit(o,'order.created');
 return jsonb_build_object('data',result);
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
   if o.type<>'dine_in' and not(o.type='takeaway' and exists(select 1 from public.payment_intents i join public.payments p on p.intent_id=i.id where i.order_id=o.id and i.status='succeeded' and p.amount_vnd=o.total_vnd)) then return public.p2_fail('INTERNAL_ERROR'); end if;
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

create function public.p4_ingest(input jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $$
declare inbox public.payment_webhook_inbox; ev jsonb:=input->'event';
begin
 insert into public.payment_webhook_inbox(provider,event_id,transaction_id,channel_hash,event,evidence)
 values('payos',ev->>'eventId',ev->>'transactionId',input->>'channelHash',ev,input->'evidence')
 on conflict(provider,event_id) do nothing returning * into inbox;
 if inbox.id is null then
  select * into inbox from public.payment_webhook_inbox where provider='payos' and event_id=ev->>'eventId';
  if inbox.event<>ev or inbox.channel_hash<>input->>'channelHash' then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
 end if;
 return jsonb_build_object('data',jsonb_build_object('id',inbox.id));
end; $$;

create function public.p4_process(event_uuid uuid) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
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
    end if;
   end if;
   update public.payment_webhook_inbox set state=case when reason='NON_SUCCESS' then 'ignored' else 'exception' end,
    reason=reason,attempts=attempts+1,processed_at=clock_timestamp() where id=e.id;
   return jsonb_build_object('data',jsonb_build_object('received',true,'outcome',case when reason='NON_SUCCESS' then 'ignored' else 'recorded_exception' end));
  end if;
  acceptance:=clock_timestamp();
  insert into public.payments(store_id,intent_id,provider,transaction_id,amount_vnd,currency,inbox_id,paid_at)
   values(i.store_id,i.id,e.provider,e.transaction_id,i.amount_vnd,'VND',e.id,(ev->>'occurredAt')::timestamptz);
  update public.payment_intents set status='succeeded',provider_link_id=coalesce(provider_link_id,ev->>'paymentLinkId'),updated_at=acceptance where id=i.id;
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

create function public.p4_payment_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare i public.payment_intents; o public.orders; r public.takeaway_requests; retry integer; token uuid;
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
  select * into r from public.takeaway_requests where order_id=i.order_id and browser_context_hash=input->>'browserHash'
   and proof_hash=encode(extensions.digest((input->>'grantProof')||':'||i.order_id::text,'sha256'),'hex') and access_expires_at>clock_timestamp();
  if not found or not exists(select 1 from public.guest_browser_contexts where token_hash=input->>'browserHash' and expires_at>clock_timestamp()) then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  retry:=public.p2_rate('payment-read:'||(input->>'browserHash')||':'||i.id,60);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  if action='get' then return jsonb_build_object('data',public.p4_payment_view(i)); end if;
  select * into o from public.orders where id=i.order_id;
  return jsonb_build_object('data',case when coalesce((input->>'includePickup')::boolean,false) then
   jsonb_build_object('order',public.p3_order_view(o),'pickup',null) else public.p3_order_view(o) end);
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
  update public.payment_intents set last_observed_status=input->>'status',needs_reconciliation=needs_reconciliation or input->>'status' in('PAID','UNDERPAID') where id=i.id;
  -- Querying the provider is evidence only; it NEVER accepts an order.
  return jsonb_build_object('data',jsonb_build_object('ok',true));
 end if;
 return public.p2_fail('VALIDATION_ERROR');
end; $$;

alter table public.payment_intents enable row level security;
revoke all on public.payment_intents from public,anon,authenticated,service_role;
alter table public.takeaway_requests enable row level security;
revoke all on public.takeaway_requests from public,anon,authenticated,service_role;
alter table public.payment_webhook_inbox enable row level security;
revoke all on public.payment_webhook_inbox from public,anon,authenticated,service_role;
alter table public.payments enable row level security;
revoke all on public.payments from public,anon,authenticated,service_role;
grant select,insert,update on public.payment_intents,public.payment_webhook_inbox to service_role;
grant select,insert on public.takeaway_requests,public.payments to service_role;
revoke all on sequence public.p4_payment_reference_seq from public,anon,authenticated;
grant usage on sequence public.p4_payment_reference_seq to service_role;
revoke all on function public.p4_paid_guard(),public.p4_payment_view(public.payment_intents),public.p4_dine_in_view(public.orders),public.p4_dine_in_summary(public.orders),public.p4_checkout(jsonb),public.p4_ingest(jsonb),public.p4_process(uuid),public.p4_payment_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p4_paid_guard(),public.p4_payment_view(public.payment_intents),public.p4_dine_in_view(public.orders),public.p4_dine_in_summary(public.orders),public.p4_checkout(jsonb),public.p4_ingest(jsonb),public.p4_process(uuid),public.p4_payment_execute(text,jsonb) to service_role;
revoke all on function public.p4_evidence_guard(),public.p4_emit(public.orders,text) from public,anon,authenticated;
grant execute on function public.p4_evidence_guard(),public.p4_emit(public.orders,text) to service_role;
commit;
