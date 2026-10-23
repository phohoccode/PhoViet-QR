-- P2-C02 additive menu schema. No orders, cart, payment or UI changes.
begin;
alter table public.stores add column menu_revision uuid not null default gen_random_uuid();
create table public.menu_categories (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete restrict,
 name text not null check(char_length(btrim(name)) between 1 and 120), sort_order integer not null default 0,
 active boolean not null default true, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(store_id,id)
);
create unique index menu_category_normalized_name on public.menu_categories(store_id,lower(btrim(name)));
create index menu_category_public on public.menu_categories(store_id,active,sort_order);
create table public.menu_items (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete restrict,
 category_id uuid not null, name text not null check(char_length(btrim(name)) between 1 and 120),
 description text check(char_length(description)<=1000),
 price_vnd bigint not null check(price_vnd between 0 and 9007199254740991),
 image_url text check(image_url is null or (char_length(image_url)<=2048 and image_url ~ '^https://images[.]unsplash[.]com(/|\?)[^#[:space:]]*$')),
 available boolean not null default true, active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(store_id,id), foreign key(store_id,category_id) references public.menu_categories(store_id,id) on delete restrict
);
create index menu_item_public on public.menu_items(store_id,category_id,active,sort_order);
create table public.menu_item_options (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete restrict,
 item_id uuid not null, name text not null check(char_length(btrim(name)) between 1 and 120),
 price_delta_vnd bigint not null check(price_delta_vnd between 0 and 9007199254740991), active boolean not null default true,
 sort_order integer not null default 0, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 foreign key(store_id,item_id) references public.menu_items(store_id,id) on delete restrict
);
create index menu_option_item on public.menu_item_options(store_id,item_id,active,sort_order);
create table public.menu_audit_log (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id), actor_id uuid not null references auth.users(id),
 operation text not null, entity_id uuid not null, result_json jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_item_options enable row level security;
alter table public.menu_audit_log enable row level security;
revoke all on public.menu_categories,public.menu_items,public.menu_item_options,public.menu_audit_log from public,anon,authenticated,service_role;
grant select,insert,update on public.menu_categories,public.menu_items,public.menu_item_options to service_role;
grant select,insert on public.menu_audit_log to service_role;
grant update(menu_revision) on public.stores to service_role;

-- API commands lock the store before menu rows. Trusted bulk import/seed must
-- also lock the store first. Triggers cover price/availability/category/options
-- writes so SQL maintenance cannot silently leave the public revision stale.
create function public.menu_touch() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.store_id<>old.store_id then raise check_violation using message='Immutable menu scope'; end if;
  if tg_table_name='menu_item_options' then
   if new.item_id<>old.item_id then raise check_violation using message='Immutable option scope'; end if;
  end if;
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 end if;
 return new;
end; $$;
create function public.menu_revision_touch() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 update public.stores set menu_revision=gen_random_uuid() where id=new.store_id;
 return new;
end; $$;
create trigger menu_category_touch before update on public.menu_categories for each row execute function public.menu_touch();
create trigger menu_item_touch before update on public.menu_items for each row execute function public.menu_touch();
create trigger menu_option_touch before update on public.menu_item_options for each row execute function public.menu_touch();
create trigger menu_category_revision after insert or update on public.menu_categories for each row execute function public.menu_revision_touch();
create trigger menu_item_revision after insert or update on public.menu_items for each row execute function public.menu_revision_touch();
create trigger menu_option_revision after insert or update on public.menu_item_options for each row execute function public.menu_revision_touch();

create function public.menu_item_view(i public.menu_items,owner_view boolean) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',i.id,'categoryId',i.category_id,'name',i.name,'description',i.description,'priceVnd',i.price_vnd,'imageUrl',i.image_url,
  'available',i.available,'updatedAt',i.updated_at,'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'priceDeltaVnd',o.price_delta_vnd,'available',o.active) order by o.sort_order,o.name,o.id)
   from public.menu_item_options o where o.item_id=i.id and o.store_id=i.store_id and (owner_view or o.active)),'[]'::jsonb))
  ||case when owner_view then jsonb_build_object('active',i.active) else '{}'::jsonb end;
$$;
create function public.menu_category_view(c public.menu_categories) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',c.id,'name',c.name,'sortOrder',c.sort_order,'active',c.active,'updatedAt',c.updated_at);
$$;
create function public.menu_snapshot(sid uuid,owner_view boolean,include_inactive boolean) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('menuRevision',st.menu_revision::text,'serverTime',statement_timestamp(),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sortOrder',c.sort_order)||case when owner_view then jsonb_build_object('active',c.active) else '{}'::jsonb end order by c.sort_order,c.name,c.id)
  from public.menu_categories c where c.store_id=sid and (include_inactive or c.active)),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(public.menu_item_view(i,owner_view) order by c.sort_order,c.name,c.id,i.sort_order,i.name,i.id)
  from public.menu_items i join public.menu_categories c on c.store_id=i.store_id and c.id=i.category_id
  where i.store_id=sid and (include_inactive or (i.active and c.active))),'[]'::jsonb)) from public.stores st where st.id=sid;
$$;

create function public.p2_menu_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $$
#variable_conflict use_variable
declare
 sid uuid; actor uuid; entity uuid; command uuid; fingerprint text; op public.operation_requests;
 i public.menu_items; c public.menu_categories; result jsonb; resolved jsonb; option_row jsonb;
 ordinal bigint; rate integer; event_id uuid; store_version bigint;
begin
 if action='public' then
  -- Reuse P2-C01 QR/activity/browser/rate checks under the same DB transaction.
  resolved:=public.p2_execute('resolve',input);
  if resolved ? 'error' then return resolved; end if;
  sid:=(resolved->'data'->'store'->>'id')::uuid;
  return jsonb_build_object('data',public.menu_snapshot(sid,false,false));
 end if;
 if action not in ('owner','category_list','create_category','patch_category','create_item','patch_item') then return public.p2_fail('VALIDATION_ERROR'); end if;
 sid:=(input->>'storeId')::uuid; actor:=(input->>'ownerId')::uuid;
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action in ('owner','category_list') then
  rate:=public.p2_rate('owner:'||actor||':read',120);
  if rate>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',rate); end if;
  if action='owner' then return jsonb_build_object('data',public.menu_snapshot(sid,true,coalesce((input->>'includeInactive')::boolean,true))); end if;
  select coalesce(jsonb_agg(public.menu_category_view(x) order by x.sort_order,x.name,x.id),'[]'::jsonb) into result from public.menu_categories x where x.store_id=sid;
  return jsonb_build_object('data',result);
 end if;
 command:=(input->>'requestId')::uuid;
 fingerprint:=encode(extensions.digest((jsonb_build_object('action',action)|| (input-'ownerId'-'storeId'-'requestId'))::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(sid::text||':'||command,0));
 select * into op from public.operation_requests r where r.store_id=sid and r.request_id=command;
 if found then
  if op.actor_id<>actor then return public.p2_fail('FORBIDDEN'); end if;
  if op.operation<>'menu.'||action or op.request_fingerprint<>fingerprint then return public.p2_fail('DUPLICATE_REQUEST_CONFLICT'); end if;
  return jsonb_build_object('data',op.result_json);
 end if;
 rate:=public.p2_rate('owner:'||actor||':write',30);
 if rate>0 then return jsonb_build_object('error','RATE_LIMITED','retryAfterSeconds',rate); end if;
 perform 1 from public.stores where id=sid for update;
 -- Recheck scope after acquiring the admission lock.
 if not exists(select 1 from public.owner_members m where m.store_id=sid and m.auth_user_id=actor and m.role='owner') then return public.p2_fail('FORBIDDEN'); end if;
 if action like '%category' then
  if action='patch_category' then
   select * into c from public.menu_categories where store_id=sid and id=(input->>'id')::uuid for update;
   if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
   if c.updated_at<>(input->>'expectedUpdatedAt')::timestamptz then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
  end if;
  if input ? 'name' and exists(select 1 from public.menu_categories where store_id=sid and lower(btrim(name))=lower(btrim(input->>'name')) and id is distinct from c.id) then return public.p2_fail('VALIDATION_ERROR'); end if;
  if action='create_category' then
   insert into public.menu_categories(store_id,name,sort_order,active) values(sid,btrim(input->>'name'),(input->>'sortOrder')::integer,(input->>'active')::boolean) returning * into c;
  else
   update public.menu_categories set name=case when input ? 'name' then btrim(input->>'name') else name end,
    sort_order=case when input ? 'sortOrder' then (input->>'sortOrder')::integer else sort_order end,
    active=case when input ? 'active' then (input->>'active')::boolean else active end where id=c.id returning * into c;
  end if;
  entity:=c.id; result:=public.menu_category_view(c);
 else
  if action='patch_item' then
   select * into i from public.menu_items where store_id=sid and id=(input->>'id')::uuid for update;
   if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
   if i.updated_at<>(input->>'expectedUpdatedAt')::timestamptz then return public.p2_fail('INVALID_STATE_TRANSITION'); end if;
  end if;
  if action='create_item' or input ? 'categoryId' then
   select * into c from public.menu_categories where store_id=sid and id=(input->>'categoryId')::uuid;
   if not found then return public.p2_fail('RESOURCE_NOT_FOUND'); end if;
   if not c.active then return public.p2_fail('VALIDATION_ERROR'); end if;
  end if;
  -- Validate the entire replacement before touching any item/option rows.
  if input ? 'options' then
   if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(input->'options') x where x ? 'id') then return public.p2_fail('VALIDATION_ERROR'); end if;
   for option_row in select value from jsonb_array_elements(input->'options') loop
    if option_row ? 'id' and (action='create_item' or not exists(select 1 from public.menu_item_options where id=(option_row->>'id')::uuid and item_id=i.id and store_id=sid)) then return public.p2_fail('VALIDATION_ERROR'); end if;
   end loop;
  end if;
  if action='create_item' then
   insert into public.menu_items(store_id,category_id,name,description,price_vnd,image_url,available,active)
    values(sid,c.id,btrim(input->>'name'),input->>'description',(input->>'priceVnd')::bigint,input->>'imageUrl',(input->>'available')::boolean,(input->>'active')::boolean) returning * into i;
  else
   update public.menu_items set category_id=case when input ? 'categoryId' then (input->>'categoryId')::uuid else category_id end,
    name=case when input ? 'name' then btrim(input->>'name') else name end,
    description=case when input ? 'description' then input->>'description' else description end,
    price_vnd=case when input ? 'priceVnd' then (input->>'priceVnd')::bigint else price_vnd end,
    image_url=case when input ? 'imageUrl' then input->>'imageUrl' else image_url end,
    available=case when input ? 'available' then (input->>'available')::boolean else available end,
    active=case when input ? 'active' then (input->>'active')::boolean else active end where id=i.id returning * into i;
  end if;
  if input ? 'options' then
   update public.menu_item_options set active=false where item_id=i.id and store_id=sid and active
    and id not in(select (x->>'id')::uuid from jsonb_array_elements(input->'options') x where x ? 'id');
   for option_row,ordinal in select value,ordinality from jsonb_array_elements(input->'options') with ordinality loop
    if option_row ? 'id' then
     update public.menu_item_options set name=btrim(option_row->>'name'),price_delta_vnd=(option_row->>'priceDeltaVnd')::bigint,
      active=(option_row->>'available')::boolean,sort_order=ordinal::integer where id=(option_row->>'id')::uuid and item_id=i.id and store_id=sid;
    else
     insert into public.menu_item_options(store_id,item_id,name,price_delta_vnd,active,sort_order)
      values(sid,i.id,btrim(option_row->>'name'),(option_row->>'priceDeltaVnd')::bigint,(option_row->>'available')::boolean,ordinal::integer);
    end if;
   end loop;
  end if;
  entity:=i.id; result:=public.menu_item_view(i,true);
 end if;
 insert into public.operation_requests(store_id,request_id,actor_id,operation,request_fingerprint,result_json) values(sid,command,actor,'menu.'||action,fingerprint,result);
 insert into public.menu_audit_log(store_id,actor_id,operation,entity_id,result_json) values(sid,actor,action,entity,result);
 select version into store_version from public.stores where id=sid;
 event_id:=gen_random_uuid();
 insert into public.outbox_events(id,topic,aggregate_id,version,payload) values(event_id,'menu.updated',sid,store_version,
  jsonb_build_object('eventId',event_id,'aggregateId',sid,'version',store_version,'type','menu.updated'));
 return jsonb_build_object('data',result);
end; $$;
revoke all on function public.menu_touch(),public.menu_revision_touch(),public.menu_item_view(public.menu_items,boolean),public.menu_category_view(public.menu_categories),public.menu_snapshot(uuid,boolean,boolean),public.p2_menu_execute(text,jsonb) from public,anon,authenticated;
grant execute on function public.menu_touch(),public.menu_revision_touch(),public.menu_item_view(public.menu_items,boolean),public.menu_category_view(public.menu_categories),public.menu_snapshot(uuid,boolean,boolean),public.p2_menu_execute(text,jsonb) to service_role;
commit;
