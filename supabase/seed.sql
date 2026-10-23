-- DEV ONLY: run as a trusted SQL administrator, never via anon/owner HTTP client.
-- No auth users, passwords, arbitrary auth UUIDs, membership, menu or orders.
begin;
insert into public.stores (id, name)
values ('c0200000-0000-4000-8000-000000000001', 'Quán Demo P1-C02')
on conflict (id) do nothing;

insert into public.dining_tables (store_id, label)
select 'c0200000-0000-4000-8000-000000000001'::uuid, label
from (values ('Bàn 01'), ('Bàn 02'), ('Bàn 03')) as demo(label)
on conflict (store_id, label) do nothing;
commit;
