-- OWNER HF01. Forward-only archive and durable Storage object lifecycle.
-- No order, payment, session, receipt or ticket rows rewritten.
begin;
set local lock_timeout='3s';
do $audit$
declare e record; p record;
begin
 for e in select * from (values
 ('public.p2_table_qr_execute(text,jsonb)','ace9e40801d38815a8c1ba1ffe3c2b2b',false),
 ('public.p2_menu_execute(text,jsonb)','f480e88653cef2806b02f73d9e9b667c',false),
 ('public.menu_snapshot(uuid,boolean,boolean)','2d489c8faf25d722c6c2009005869e4c',false),
 ('public.menu_item_view(public.menu_items,boolean)','2ddd93bf60c3f53e6244f621e152ec66',false),
 ('public.menu_category_view(public.menu_categories)','151eff88b69a802998b9a56c387b9961',false),
 ('public.p3_order_execute(text,jsonb)','cab0b5762e4737f7ad829ca2aa3a902a',true),
 ('public.p4_checkout(jsonb)','c6a8c6955c88446af1174e3dd48d6303',true)
 ) x(signature,digest,timed) loop
  select * into p from pg_proc where oid=to_regprocedure(e.signature);
  if not found or md5(replace(p.prosrc,chr(13),'')) is distinct from e.digest or p.prosecdef
   or p.proconfig is distinct from (case when e.timed then array['search_path=pg_catalog','lock_timeout=3s'] else array['search_path=pg_catalog'] end) then
   raise exception 'OWNER HF01 preflight: audit deployed definition for % before retry',e.signature;
  end if;
 end loop;
end; $audit$;

alter table public.dining_tables add column archived_at timestamptz,
 add constraint archived_table_inactive check(archived_at is null or not active);
alter table public.menu_categories add column archived_at timestamptz,
 add constraint archived_category_inactive check(archived_at is null or not active);
alter table public.menu_items add column archived_at timestamptz, add column image_path text,
 add constraint archived_item_inactive check(archived_at is null or (not active and not available));

-- Registry is created BEFORE network upload, so even ambiguous Storage timeouts
-- leave a durable cleanup record. Object bytes are written/removed by Storage API.
create table public.menu_image_assets (
 path text primary key, store_id uuid not null references public.stores(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict, public_url text not null unique,
 state text not null default 'uploading' check(state in('uploading','ready','deleting','deleted')),
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 next_attempt_at timestamptz not null default clock_timestamp(), attempts integer not null default 0,
 created_at timestamptz not null default clock_timestamp(), deleted_at timestamptz,
 check(path ~ ('^stores/'||store_id::text||'/uploads/[a-f0-9-]{36}[.](jpg|png|webp)$')),
 check(public_url ~ '^https?://[^[:space:]#]+/storage/v1/object/public/menu-images/stores/')
);
create index menu_image_cleanup_due on public.menu_image_assets(next_attempt_at,expires_at) where state<>'deleted';
create index menu_items_image_reference on public.menu_items(image_path) where image_path is not null;
alter table public.menu_image_assets enable row level security;
revoke all on public.menu_image_assets from public,anon,authenticated,service_role;
grant select,insert,update on public.menu_image_assets to service_role;
alter table public.menu_items drop constraint menu_items_image_url_check;
alter table public.menu_items add constraint menu_items_image_source check(
 image_url is null and image_path is null or image_url is not null and char_length(image_url)<=2048 and
 (image_path is not null or image_url ~ '^https://images[.]unsplash[.]com(/|\?)[^#[:space:]]*$'));

-- App mutation paths serialize at store -> entity. Never obtain network IO
-- inside these transactions. Historical data remains addressable after archive.
create function public.hf01_archive_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise check_violation using message='Archive only'; end if;
 if tg_op='UPDATE' and old.archived_at is not null then
  -- A retired item may be moved out of a category without changing snapshots.
  if tg_table_name<>'menu_items' or (to_jsonb(new)-'category_id'-'updated_at') is distinct from (to_jsonb(old)-'category_id'-'updated_at') then
   raise check_violation using message='Archived resource is immutable';
  end if;
 end if;
 if tg_table_name='menu_items' then
  if tg_op='INSERT' or new.category_id is distinct from old.category_id then
   if not exists(select 1 from public.menu_categories c where c.id=new.category_id and c.store_id=new.store_id and c.active and c.archived_at is null) then
    raise check_violation using message='Category unavailable';
   end if;
  end if;
 end if;
 return new;
end; $$;
create trigger hf01_table_archive_guard before update on public.dining_tables for each row execute function public.hf01_archive_guard();
create trigger hf01_category_archive_guard before update or delete on public.menu_categories for each row execute function public.hf01_archive_guard();
create trigger hf01_item_archive_guard before insert or update or delete on public.menu_items for each row execute function public.hf01_archive_guard();

create function public.hf01_image_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare asset public.menu_image_assets;
begin
 if tg_op='UPDATE' and new.image_url is not distinct from old.image_url then new.image_path:=old.image_path; return new; end if;
 new.image_path:=null;
 if new.image_url is not null and new.image_url !~ '^https://images[.]unsplash[.]com(/|\?)[^#[:space:]]*$' then
  select * into asset from public.menu_image_assets a where a.public_url=new.image_url and a.store_id=new.store_id for update;
  if not found or asset.state<>'ready' or asset.expires_at<=clock_timestamp() then
   raise check_violation using message='Upload unavailable';
  end if;
  new.image_path:=asset.path;
 end if;
 if tg_op='UPDATE' and old.image_path is not null and old.image_path is distinct from new.image_path then
  update public.menu_image_assets set expires_at=clock_timestamp(),next_attempt_at=clock_timestamp() where path=old.image_path;
 end if;
 return new;
end; $$;
create trigger hf01_item_image_guard before insert or update on public.menu_items for each row execute function public.hf01_image_guard();

create function public.hf01_owner_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
#variable_conflict use_variable
declare sid uuid:=(input->>'storeId')::uuid; actor uuid:=(input->>'ownerId')::uuid; target uuid:=(input->>'id')::uuid;
 t public.dining_tables; c public.menu_categories; i public.menu_items; a public.menu_image_assets;
 stamp timestamptz; result jsonb; n integer; event_uuid uuid; v bigint; topic text:='menu.updated';
begin
 if action not in('archive_table','archive_category','archive_item','reserve_image','ready_image','abort_image') then return public.p2_fail('VALIDATION_ERROR'); end if;
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 n:=case when action in('ready_image','abort_image') then 0 else public.p2_rate('owner:'||actor||':write',30) end;
 if n>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',n); end if;
 perform 1 from public.stores where id=sid for no key update;
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action='reserve_image' then
  insert into public.menu_image_assets(path,store_id,actor_id,public_url) values(input->>'path',sid,actor,input->>'url') returning * into a;
  return jsonb_build_object('data',jsonb_build_object('expiresAt',a.expires_at));
 elsif action in('ready_image','abort_image') then
  select * into a from public.menu_image_assets where path=input->>'path' and store_id=sid and actor_id=actor for update;
  if not found or a.state<>'uploading' then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  update public.menu_image_assets set state=case action when 'ready_image' then 'ready' else state end,
   expires_at=case action when 'abort_image' then clock_timestamp() else expires_at end where path=a.path;
  return jsonb_build_object('data',true);
 elsif action='archive_table' then
  topic:='qr.updated';
  select * into t from public.dining_tables where id=target and store_id=sid for update;
  if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  stamp:=t.archived_at;
  if stamp is null then
   if exists(select 1 from public.table_sessions s where s.table_id=t.id and s.status in('open','checkout_pending'))
    or exists(select 1 from public.orders o where o.table_id=t.id and o.store_id=sid and
     (o.status not in('completed','cancelled') or (o.status<>'cancelled' and not public.p5_session_paid(o.table_session_id)))) then
    return jsonb_build_object('error','TABLE_IN_USE','details',jsonb_build_object('tableId',target));
   end if;
   stamp:=clock_timestamp();
   update public.qr_codes set active=false,retired_at=stamp where table_id=t.id and store_id=sid and retired_at is null;
   update public.dining_tables set active=false,archived_at=stamp where id=t.id;
  end if;
 elsif action='archive_category' then
  select * into c from public.menu_categories where id=target and store_id=sid for update;
  if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  stamp:=c.archived_at;
  if stamp is null then
   select count(*) into n from public.menu_items where category_id=c.id and store_id=sid;
   if n>0 then return jsonb_build_object('error','CATEGORY_NOT_EMPTY','details',jsonb_build_object('count',n)); end if;
   stamp:=clock_timestamp(); update public.menu_categories set active=false,archived_at=stamp where id=c.id;
  end if;
 else
  select * into i from public.menu_items where id=target and store_id=sid for update;
  if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
  stamp:=i.archived_at;
  if stamp is null then
   stamp:=clock_timestamp();
   update public.menu_items set active=false,available=false,archived_at=stamp where id=i.id;
   update public.menu_item_options set active=false where item_id=i.id and store_id=sid and active;
  end if;
 end if;
 result:=jsonb_build_object('success',true,'id',target,'archivedAt',stamp);
 -- An archived state is its own idempotency key. Repeats don't emit twice.
 if (action='archive_table' and t.archived_at is null) or (action='archive_category' and c.archived_at is null) or (action='archive_item' and i.archived_at is null) then
  if action='archive_table' then
   update public.stores set updated_at=clock_timestamp() where id=sid;
   insert into public.table_qr_audit_log(store_id,actor_id,operation,entity_id,result_json) values(sid,actor,action,target,result);
  else
   insert into public.menu_audit_log(store_id,actor_id,operation,entity_id,result_json) values(sid,actor,action,target,result);
  end if;
  select version into v from public.stores where id=sid; event_uuid:=gen_random_uuid();
  insert into public.outbox_events(id,topic,aggregate_id,version,payload) values(event_uuid,topic,sid,v,jsonb_build_object('eventId',event_uuid,'aggregateId',sid,'version',v,'type',topic));
 end if;
 return jsonb_build_object('data',result);
end; $$;

-- Worker obtains store before asset, just like item writers. Marking deleting
-- fences all future attachment; retries after network/worker failure are safe.
create function public.hf01_image_cleanup(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog set lock_timeout='3s' as $$
declare a public.menu_image_assets; result jsonb:='[]';
begin
 if action='done' then
  update public.menu_image_assets set state='deleted',deleted_at=clock_timestamp() where path=input->>'path' and state='deleting';
  return jsonb_build_object('data',true);
 elsif action<>'claim' then return public.p2_fail('VALIDATION_ERROR'); end if;
 for a in select * from public.menu_image_assets asset where state<>'deleted' and expires_at<=clock_timestamp() and next_attempt_at<=clock_timestamp()
  and not exists(select 1 from public.menu_items where image_path=asset.path)
  and (input->>'storeId' is null or store_id=(input->>'storeId')::uuid) order by next_attempt_at,path limit 10 loop
  perform 1 from public.stores where id=a.store_id for no key update;
  select * into a from public.menu_image_assets where path=a.path for update;
  if a.state='deleted' or a.expires_at>clock_timestamp() or a.next_attempt_at>clock_timestamp()
   or exists(select 1 from public.menu_items where image_path=a.path) then continue; end if;
  update public.menu_image_assets set state='deleting',attempts=attempts+1,next_attempt_at=clock_timestamp()+interval '15 minutes' where path=a.path;
  result:=result||jsonb_build_array(a.path);
 end loop;
 return jsonb_build_object('data',result);
end; $$;

-- Narrow patches only after exact source/config audit. Existing FIFO, payment,
-- idempotency, limiter, and auth logic remain unchanged.
do $patch$
declare d text;
begin
 d:=replace(pg_get_functiondef('public.p2_table_qr_execute(text,jsonb)'::regprocedure),chr(13),'');
 d:=replace(d,'where x.store_id=sid)','where x.store_id=sid and x.archived_at is null)');
 execute d;
 d:=replace(pg_get_functiondef('public.p2_menu_execute(text,jsonb)'::regprocedure),chr(13),'');
 d:=replace(d,'from public.menu_categories x where x.store_id=sid','from public.menu_categories x where x.store_id=sid and x.archived_at is null');
 -- Return stable API errors rather than raising from the defense-in-depth trigger.
 d:=replace(d,'if c.updated_at<>', 'if c.archived_at is not null then return public.p2_fail(''RESOURCE_NOT_FOUND''); end if;'||chr(10)||'   if c.updated_at<>');
 d:=replace(d,'if i.updated_at<>', 'if i.archived_at is not null and (input-''ownerId''-''storeId''-''requestId''-''id''-''expectedUpdatedAt''-''categoryId'')<>''{}''::jsonb then return public.p2_fail(''RESOURCE_NOT_FOUND''); end if;'||chr(10)||'   if i.updated_at<>');
 d:=replace(d,' if action like ''%category'' then', $guard$
 if input ? 'imageUrl' and input->>'imageUrl' is not null and input->>'imageUrl' !~ '^https://images[.]unsplash[.]com(/|\?)[^#[:space:]]*$' then
  perform 1 from public.menu_image_assets a where a.store_id=sid and a.public_url=input->>'imageUrl' and a.state='ready'
   and (a.expires_at>clock_timestamp() or exists(select 1 from public.menu_items existing where existing.id=(input->>'id')::uuid and existing.store_id=sid and existing.image_path=a.path)) for update;
  if not found then return public.p2_fail('VALIDATION_ERROR'); end if;
 end if;
 if action like '%category' then$guard$);
 -- The trigger derives image_path and refuses unready/cross-store upload URLs.
 execute d;
 foreach d in array array['public.p3_order_execute(text,jsonb)','public.p4_checkout(jsonb)'] loop
  execute replace(pg_get_functiondef(d::regprocedure),
   'if not found then return public.p2_fail(''OUT_OF_STOCK''); end if;',
   'if not found then
    if exists(select 1 from public.menu_items removed where removed.id=(line->>''menuItemId'')::uuid and removed.store_id=st.id and removed.archived_at is not null) then
     return jsonb_build_object(''error'',''ITEM_UNAVAILABLE'',''menuItemIds'',jsonb_build_array(line->>''menuItemId''));
    end if;
    return public.p2_fail(''OUT_OF_STOCK'');
   end if;');
 end loop;
end; $patch$;

create or replace function public.menu_snapshot(sid uuid,owner_view boolean,include_inactive boolean) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('menuRevision',st.menu_revision::text,'serverTime',statement_timestamp(),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sortOrder',c.sort_order)||case when owner_view then jsonb_build_object('active',c.active) else '{}'::jsonb end order by c.sort_order,c.name,c.id)
  from public.menu_categories c where c.store_id=sid and c.archived_at is null and (include_inactive or c.active)),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(public.menu_item_view(i,owner_view) order by c.sort_order,c.name,c.id,i.sort_order,i.name,i.id)
  from public.menu_items i join public.menu_categories c on c.store_id=i.store_id and c.id=i.category_id
  where i.store_id=sid and i.archived_at is null and c.archived_at is null and (include_inactive or (i.active and c.active))),'[]'::jsonb)) from public.stores st where st.id=sid;
$$;
do $views$
declare d text;
begin
 d:=pg_get_functiondef('public.menu_item_view(public.menu_items,boolean)'::regprocedure);
 execute replace(d,'jsonb_build_object(''active'',i.active)','jsonb_build_object(''active'',i.active,''imagePath'',i.image_path,''archivedAt'',i.archived_at)');
end; $views$;
revoke all on function public.hf01_archive_guard(),public.hf01_image_guard(),public.hf01_owner_execute(text,jsonb),public.hf01_image_cleanup(text,jsonb) from public,anon,authenticated;
grant execute on function public.hf01_archive_guard(),public.hf01_image_guard(),public.hf01_owner_execute(text,jsonb),public.hf01_image_cleanup(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
