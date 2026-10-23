-- P2-C04 additive. Never reconcile conflicting legacy rows by deleting/disabling.
begin;
lock table public.dining_tables, public.qr_codes in share row exclusive mode;

create function public.p2_normalize_table_label(value text) returns text
language sql immutable strict set search_path=pg_catalog as $$
 select btrim(regexp_replace(value,U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g'));
$$;
do $$ begin
 if exists(select 1 from public.dining_tables group by store_id,lower(public.p2_normalize_table_label(label)) having count(*)>1) then
  raise exception using errcode='23505',message='P2-C04 preflight: duplicate normalized table labels; resolve explicitly before retrying migration006';
 end if;
 if exists(select 1 from public.qr_codes where active and type='table' group by table_id having count(*)>1)
 or exists(select 1 from public.qr_codes where active and type='takeaway' group by store_id having count(*)>1) then
  raise exception using errcode='23505',message='P2-C04 preflight: multiple active QR codes; choose retained QR explicitly before retrying migration006';
 end if;
 if exists(select 1 from public.dining_tables where char_length(public.p2_normalize_table_label(label)) not between 1 and 80
   or public.p2_normalize_table_label(label) ~ U&'[\0001-\0008\000E-\001F\007F-\009F]') then
  raise exception using errcode='23514',message='P2-C04 preflight: invalid legacy label; resolve explicitly before retrying migration006';
 end if;
end $$;
create unique index dining_tables_normalized_label on public.dining_tables(store_id,lower(public.p2_normalize_table_label(label)));
alter table public.dining_tables add constraint dining_tables_normalized_label_valid check(
 char_length(public.p2_normalize_table_label(label)) between 1 and 80
 and public.p2_normalize_table_label(label) !~ U&'[\0001-\0008\000E-\001F\007F-\009F]');
create unique index qr_codes_one_active_table on public.qr_codes(table_id) where type='table' and active;
create unique index qr_codes_one_active_takeaway on public.qr_codes(store_id) where type='takeaway' and active;
alter table public.qr_codes add column retired_at timestamptz;
alter table public.qr_codes add constraint qr_retired_inactive check(retired_at is null or not active);
alter table public.qr_codes alter column public_code set default encode(extensions.gen_random_bytes(16),'hex');

-- Authenticated owners must use API commands, not bypass session/idempotency guards
-- via the foundation's direct PostgREST column grants. Reads retain original RLS.
revoke insert,update,delete on public.dining_tables,public.qr_codes from authenticated;
revoke insert(store_id,label,active),update(label,active) on public.dining_tables from authenticated;
revoke insert(store_id,type,table_id,active),update(active) on public.qr_codes from authenticated;
revoke all on public.dining_tables,public.qr_codes from service_role;
grant select,insert,update on public.dining_tables,public.qr_codes to service_role;
grant update(updated_at) on public.stores to service_role;
grant execute on function extensions.gen_random_bytes(integer) to service_role;

create table public.table_qr_audit_log (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 actor_id uuid not null references auth.users(id), operation text not null, entity_id uuid not null,
 result_json jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index table_qr_audit_entity on public.table_qr_audit_log(store_id,entity_id,created_at);
alter table public.table_qr_audit_log enable row level security;
revoke all on public.table_qr_audit_log from public,anon,authenticated,service_role;
grant select,insert on public.table_qr_audit_log to service_role;

create function public.p2_table_qr_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise check_violation using message='Soft disable only'; end if;
 if tg_table_name='dining_tables' then
  new.label:=public.p2_normalize_table_label(new.label);
  if tg_op='UPDATE' then
   if new.id<>old.id or new.store_id<>old.store_id then raise check_violation using message='Immutable table scope'; end if;
   if not new.active and old.active and exists(select 1 from public.table_sessions where table_id=old.id and status in('open','checkout_pending')) then
    raise check_violation using message='Active session blocks table disable';
   end if;
  end if;
 elsif tg_op='UPDATE' then
  if new.id<>old.id or new.store_id<>old.store_id or new.table_id is distinct from old.table_id or new.type<>old.type or new.public_code<>old.public_code
   or (old.retired_at is not null and new is distinct from old) then raise check_violation using message='Immutable QR identity or retired QR'; end if;
  if old.active and not new.active and new.type='table' and exists(select 1 from public.table_sessions where table_id=old.table_id and status in('open','checkout_pending')) then
   raise check_violation using message='Active session blocks QR disable';
  end if;
 end if;
 return new;
end; $$;
create trigger table_lifecycle_guard before insert or update or delete on public.dining_tables for each row execute function public.p2_table_qr_guard();
create trigger qr_lifecycle_guard before update or delete on public.qr_codes for each row execute function public.p2_table_qr_guard();

-- Align public R01/R02/menu lock order with lifecycle commands: table -> QR ->
-- session. The initial unlocked locator read grants no rights; QR is rechecked
-- under lock after the table. Avoid QR-share/table-update inversion deadlocks.
do $$ declare source text; body text; original text; replacement text; begin
 -- Fail closed on semantic/format drift beyond CRLF vs LF. This fingerprint is
 -- md5(LF-normalized prosrc) from migration003, NOT a replacement function body.
 -- Keep any unknown Production changes intact and inspect before proceeding.
 select replace(p.prosrc,E'\r\n',E'\n') into body from pg_proc p
 join pg_language l on l.oid=p.prolang
 where p.oid=to_regprocedure('public.p2_execute(text,jsonb)')
 and l.lanname='plpgsql' and not p.prosecdef and p.prokind='f'
 and p.prorettype='jsonb'::regtype and p.proconfig=array['search_path=pg_catalog'];
 if body is null or md5(body)<>'7fb5e08b689e4bd0f6f2ac1b98130396' then
  raise exception 'P2-C04 resolver preflight: unexpected p2_execute baseline (LF body md5=%)',coalesce(md5(body),'missing or incompatible metadata');
 end if;
 source:=replace(pg_get_functiondef('public.p2_execute(text,jsonb)'::regprocedure),E'\r\n',E'\n');
 original:=$old$select * into q from public.qr_codes where public_code=input->>'qrCode' and active for share;
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
  end if;$old$;
 replacement:=$new$select * into q from public.qr_codes where public_code=input->>'qrCode' and active;
  if not found then return public.p2_fail('INVALID_QR'); end if;
  select * into st from public.stores where id=q.store_id;
  if not found then return public.p2_fail('INVALID_QR'); end if;
  if q.type='table' then
   select * into t from public.dining_tables where id=q.table_id and dining_tables.store_id=q.store_id and active for share;
   if not found then return public.p2_fail('INVALID_QR'); end if;
  end if;
  select * into q from public.qr_codes where public_code=input->>'qrCode' and active for share;
  if not found then return public.p2_fail('INVALID_QR'); end if;
  if action='resolve' then
   retry:=public.p2_rate('read:'||browser_hash||':'||q.id,60);
   if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  end if;$new$;
 -- Dollar-quoted literals retain the SQL client's line endings too. Normalizing
 -- only pg_get_functiondef makes a CRLF marker fail against an LF source.
 original:=replace(original,E'\r\n',E'\n');
 replacement:=replace(replacement,E'\r\n',E'\n');
 if (length(source)-length(replace(source,original,'')))/length(original)<>1 then
  raise exception 'P2-C04 resolver preflight: expected exactly one resolver/rate block';
 end if;
 if md5(replace(body,original,replacement))<>'f80bcdba939630909ac8cf32cc8b8280' then
  raise exception 'P2-C04 resolver preflight: unexpected patched body';
 end if;
 execute replace(source,original,replacement);
 select replace(prosrc,E'\r\n',E'\n') into body from pg_proc
 where oid='public.p2_execute(text,jsonb)'::regprocedure;
 if md5(body)<>'f80bcdba939630909ac8cf32cc8b8280' then
  raise exception 'P2-C04 resolver postflight: unexpected installed body';
 end if;
end $$;

create function public.p2_managed_qr_view(q public.qr_codes) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',q.id,'type',q.type,'publicCode',q.public_code,'path','/q/'||q.public_code,
  'active',q.active,'updatedAt',q.updated_at,'retiredAt',q.retired_at,
  'table',case when q.type='table' then (select jsonb_build_object('id',t.id,'label',t.label) from public.dining_tables t where t.id=q.table_id and t.store_id=q.store_id) else null end);
$$;
create function public.p2_managed_table_view(t public.dining_tables) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',t.id,'label',t.label,'active',t.active,'updatedAt',t.updated_at,
  'session',(select public.p2_session_view(s) from public.table_sessions s where s.table_id=t.id and s.status in('open','checkout_pending')),
  'qr',(select public.p2_managed_qr_view(q) from public.qr_codes q where q.table_id=t.id and q.type='table' and q.active));
$$;
create function public.p2_table_qr_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $$
#variable_conflict use_variable
declare
 sid uuid:=(input->>'storeId')::uuid; actor uuid:=(input->>'ownerId')::uuid; command uuid;
 t public.dining_tables; q public.qr_codes; created_q public.qr_codes; op public.operation_requests;
 fingerprint text; result jsonb; grid jsonb; detail jsonb; retry integer; failed_constraint text;
 event_type text; event_id uuid; entity uuid; store_version bigint; is_mutation boolean;
begin
 if action not in('tables','qrs','create_table','update_table','write_qr','rotate_qr') then return public.p2_fail('VALIDATION_ERROR'); end if;
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 is_mutation:=action not in('tables','qrs');
 if not is_mutation then
  retry:=public.p2_rate('owner:'||actor||':read',120);
  if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
  if action='qrs' then
   select coalesce(jsonb_agg(public.p2_managed_qr_view(x) order by x.created_at,x.id),'[]'::jsonb) into result from public.qr_codes x where x.store_id=sid;
  else
   if input ? 'tableId' and not exists(select 1 from public.dining_tables where id=(input->>'tableId')::uuid and store_id=sid) then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
   with rows as materialized (select public.p2_managed_table_view(x) value from public.dining_tables x where x.store_id=sid)
   select coalesce((select jsonb_agg(value order by value->>'label',value->>'id') from rows),'[]'::jsonb),
    (select jsonb_build_object('table',jsonb_build_object('id',value->'id','label',value->'label'),'session',value->'session','orders','[]'::jsonb)
     from rows where value->>'id'=input->>'tableId' and value->'session'<>'null'::jsonb) into grid,detail;
   result:=jsonb_build_object('tables',grid,'detail',detail);
  end if;
  return jsonb_build_object('data',result);
 end if;
 command:=(input->>'requestId')::uuid;
 fingerprint:=encode(extensions.digest((jsonb_build_object('operation',action)||(input-'ownerId'-'storeId'-'requestId'))::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(sid::text||':'||command,0));
 select * into op from public.operation_requests r where r.store_id=sid and r.request_id=command;
 if found then
  if op.actor_id<>actor then return public.p2_fail('FORBIDDEN'); end if;
  if op.operation<>'table_qr.'||action or op.request_fingerprint<>fingerprint then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
  return jsonb_build_object('data',op.result_json);
 end if;
 retry:=public.p2_rate('owner:'||actor||':write',30);
 if retry>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',retry); end if;
 perform 1 from public.stores where id=sid for update;
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 -- An exception block rolls back the entire resource command, while the limiter
 -- above persists business failures. Never catch unique errors after retiring QR
 -- without rolling back that retirement and its related writes.
 begin
  if action='create_table' then
   insert into public.dining_tables(store_id,label) values(sid,input->>'label') returning * into t;
   insert into public.qr_codes(store_id,type,table_id) values(sid,'table',t.id) returning * into created_q;
   result:=public.p2_managed_table_view(t); entity:=t.id; event_type:='table.created';
  elsif action='update_table' then
   select * into t from public.dining_tables where id=(input->>'id')::uuid and store_id=sid for update;
   if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
   if t.updated_at<>(input->>'expectedUpdatedAt')::timestamptz then return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','expectedUpdatedAt'); end if;
   if input->>'active'='false' and exists(select 1 from public.table_sessions where table_id=t.id and status in('open','checkout_pending')) then
    return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','activeSession');
   end if;
   update public.dining_tables set label=case when input ? 'label' then input->>'label' else label end,
    active=case when input ? 'active' then (input->>'active')::boolean else active end where id=t.id returning * into t;
   result:=public.p2_managed_table_view(t); entity:=t.id;
   event_type:=case when input->>'active'='false' then 'table.disabled' else 'table.updated' end;
  else
   if action='write_qr' and input->>'action'='create' then
    if input->>'type'='table' then
     select * into t from public.dining_tables where id=(input->>'tableId')::uuid and store_id=sid for update;
     if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
     if not t.active then return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','tableActive'); end if;
    end if;
    if exists(select 1 from public.qr_codes where store_id=sid and active and type=input->>'type' and table_id is not distinct from (input->>'tableId')::uuid) then
     return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','activeQr');
    end if;
    insert into public.qr_codes(store_id,type,table_id) values(sid,input->>'type',(input->>'tableId')::uuid) returning * into q;
    event_type:='qr.created';
   else
    select * into q from public.qr_codes where id=(input->>'id')::uuid and store_id=sid;
    if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
    if q.type='table' then
     select * into t from public.dining_tables where id=q.table_id and store_id=sid for update;
    end if;
    select * into q from public.qr_codes where id=q.id and store_id=sid for update;
    if action='rotate_qr' then
     if not coalesce((input->>'confirm')::boolean,false) then return public.p2_fail('VALIDATION_ERROR'); end if;
     if q.updated_at<>(input->>'expectedUpdatedAt')::timestamptz then return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','expectedUpdatedAt'); end if;
     if not q.active or q.retired_at is not null then return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','rotation'); end if;
    elsif q.retired_at is not null and input->>'active'='true' then
     return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','retiredQr');
    end if;
    if q.type='table' then
     if (action='rotate_qr' or input->>'active'='true') and not t.active then return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','tableActive'); end if;
     if (action='rotate_qr' or input->>'active'='false') and exists(select 1 from public.table_sessions where table_id=t.id and status in('open','checkout_pending')) then
      return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','activeSession');
     end if;
    end if;
    if action='rotate_qr' then
     update public.qr_codes set active=false,retired_at=clock_timestamp() where id=q.id;
     insert into public.qr_codes(store_id,type,table_id) values(sid,q.type,q.table_id) returning * into created_q;
     result:=public.p2_managed_qr_view(created_q); event_type:='qr.rotated'; entity:=q.id;
    else
     if q.active is distinct from (input->>'active')::boolean then
      update public.qr_codes set active=(input->>'active')::boolean where id=q.id returning * into q;
     end if;
     event_type:=case when q.active then 'qr.enabled' else 'qr.disabled' end;
    end if;
   end if;
   if result is null then result:=public.p2_managed_qr_view(q); entity:=q.id; end if;
  end if;
  update public.stores set updated_at=clock_timestamp() where id=sid returning version into store_version;
  insert into public.table_qr_audit_log(store_id,actor_id,operation,entity_id,result_json) values(sid,actor,event_type,entity,result);
  if created_q.id is not null then
   insert into public.table_qr_audit_log(store_id,actor_id,operation,entity_id,result_json) values(sid,actor,'qr.created',created_q.id,public.p2_managed_qr_view(created_q));
  end if;
  event_id:=gen_random_uuid();
  insert into public.outbox_events(id,topic,aggregate_id,version,payload) values(event_id,'qr.updated',sid,store_version,
   jsonb_build_object('eventId',event_id,'type','qr.updated','aggregateId',sid,'version',store_version));
  insert into public.operation_requests(store_id,request_id,actor_id,operation,request_fingerprint,result_json)
   values(sid,command,actor,'table_qr.'||action,fingerprint,result);
  return jsonb_build_object('data',result);
 exception when unique_violation then
  get stacked diagnostics failed_constraint=constraint_name;
  if failed_constraint in('dining_tables_normalized_label','dining_tables_store_label_key') then return jsonb_build_object('error','VALIDATION_ERROR','field','label'); end if;
  if failed_constraint in('qr_codes_one_active_table','qr_codes_one_active_takeaway') then return jsonb_build_object('error','INVALID_STATE_TRANSITION','field','activeQr'); end if;
  raise;
 end;
end; $$;
revoke all on function public.p2_normalize_table_label(text),public.p2_table_qr_guard(),public.p2_managed_qr_view(public.qr_codes),public.p2_managed_table_view(public.dining_tables),public.p2_table_qr_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.p2_normalize_table_label(text),public.p2_table_qr_guard(),public.p2_managed_qr_view(public.qr_codes),public.p2_managed_table_view(public.dining_tables),public.p2_table_qr_execute(text,jsonb) to service_role;
commit;
