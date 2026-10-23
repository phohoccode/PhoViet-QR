-- P1-C02: foundation only. No order, session, payment or FIFO tables.
begin;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  timezone text not null default 'Asia/Ho_Chi_Minh'
    check (char_length(timezone) between 1 and 100),
  accepting_orders boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owner_members (
  store_id uuid not null references public.stores(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  created_at timestamptz not null default now(),
  primary key (store_id, auth_user_id),
  -- MVP: one assigned store per login; no client-selected tenant context.
  constraint owner_members_one_store_per_user unique (auth_user_id)
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dining_tables_store_label_key unique (store_id, label),
  constraint dining_tables_store_id_id_key unique (store_id, id)
);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  type text not null check (type in ('table', 'takeaway')),
  table_id uuid,
  public_code text not null default replace(gen_random_uuid()::text, '-', '')
    check (public_code ~ '^[A-Za-z0-9_-]{1,128}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_codes_public_code_key unique (public_code),
  constraint qr_codes_type_table_check check (
    (type = 'table' and table_id is not null)
    or (type = 'takeaway' and table_id is null)
  ),
  constraint qr_codes_table_same_store_fkey foreign key (store_id, table_id)
    references public.dining_tables(store_id, id) on delete restrict
);
create index qr_codes_store_table_idx on public.qr_codes(store_id, table_id);

create function public.set_foundation_updated_at()
returns trigger language plpgsql
set search_path = pg_catalog
as $$
begin
  -- Keep timestamps monotonic even for two updates in one clock tick.
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  if tg_table_name = 'stores' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
revoke all on function public.set_foundation_updated_at() from public, anon, authenticated;

create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_foundation_updated_at();
create trigger dining_tables_updated_at before update on public.dining_tables
  for each row execute function public.set_foundation_updated_at();
create trigger qr_codes_updated_at before update on public.qr_codes
  for each row execute function public.set_foundation_updated_at();

alter table public.stores enable row level security;
alter table public.owner_members enable row level security;
alter table public.dining_tables enable row level security;
alter table public.qr_codes enable row level security;

-- Remove Supabase default grants before granting only the intended operations.
revoke all on public.stores, public.owner_members, public.dining_tables, public.qr_codes
  from public, anon, authenticated;

grant select on public.owner_members to authenticated;
create policy owner_members_read_self on public.owner_members
  for select to authenticated using (auth_user_id = (select auth.uid()) and role = 'owner');
-- No INSERT/UPDATE/DELETE grants or policies: membership is admin-only.

grant select on public.stores to authenticated;
grant update (name, accepting_orders) on public.stores to authenticated;
create policy stores_read_member on public.stores for select to authenticated using (
  exists (select 1 from public.owner_members m
    where m.store_id = stores.id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
);
create policy stores_update_member on public.stores for update to authenticated using (
  exists (select 1 from public.owner_members m
    where m.store_id = stores.id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
) with check (
  exists (select 1 from public.owner_members m
    where m.store_id = stores.id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
);

grant select on public.dining_tables to authenticated;
grant insert (store_id, label, active) on public.dining_tables to authenticated;
grant update (label, active) on public.dining_tables to authenticated;
create policy dining_tables_read_member on public.dining_tables for select to authenticated using (
  exists (select 1 from public.owner_members m
    where m.store_id = dining_tables.store_id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
);
create policy dining_tables_insert_member on public.dining_tables for insert to authenticated with check (
  exists (select 1 from public.owner_members m
    where m.store_id = dining_tables.store_id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
);
create policy dining_tables_update_member on public.dining_tables for update to authenticated using (
  exists (select 1 from public.owner_members m
    where m.store_id = dining_tables.store_id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
) with check (
  exists (select 1 from public.owner_members m
    where m.store_id = dining_tables.store_id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
);

grant select on public.qr_codes to authenticated;
grant insert (store_id, type, table_id, active) on public.qr_codes to authenticated;
grant update (active) on public.qr_codes to authenticated;
create policy qr_codes_read_member on public.qr_codes for select to authenticated using (
  exists (select 1 from public.owner_members m
    where m.store_id = qr_codes.store_id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
);
create policy qr_codes_insert_member on public.qr_codes for insert to authenticated with check (
  exists (select 1 from public.owner_members m
    where m.store_id = qr_codes.store_id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
);
create policy qr_codes_update_member on public.qr_codes for update to authenticated using (
  exists (select 1 from public.owner_members m
    where m.store_id = qr_codes.store_id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
) with check (
  exists (select 1 from public.owner_members m
    where m.store_id = qr_codes.store_id and m.auth_user_id = (select auth.uid()) and m.role = 'owner')
);

-- No anon policy. No owner hard-delete/store-create or membership mutation.
commit;
