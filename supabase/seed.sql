-- DEV ONLY: run as a trusted SQL administrator, never via anon/owner HTTP client.
-- No auth users, passwords, arbitrary auth UUIDs, membership, menu or orders.
begin;
select pg_advisory_xact_lock(hashtextextended('qr-ordering-demo-seed',0));
insert into public.stores (id, name)
values ('c0200000-0000-4000-8000-000000000001', 'Quán Demo P1-C02')
on conflict (id) do nothing;

insert into public.dining_tables (store_id, label)
select 'c0200000-0000-4000-8000-000000000001'::uuid, label
from (values ('Bàn 01'), ('Bàn 02'), ('Bàn 03')) as demo(label)
on conflict (store_id, label) do nothing;

-- Public locators use CSPRNG UUID defaults, never a session secret. Preserve
-- existing locators on rerun so printed dev QR links remain stable.
insert into public.qr_codes(store_id,type,table_id)
select dt.store_id,'table',dt.id from public.dining_tables dt
where dt.store_id='c0200000-0000-4000-8000-000000000001'::uuid
 and dt.label in ('Bàn 01','Bàn 02')
 and not exists(select 1 from public.qr_codes q where q.table_id=dt.id and q.type='table');
insert into public.qr_codes(store_id,type)
select 'c0200000-0000-4000-8000-000000000001'::uuid,'takeaway'
where not exists(select 1 from public.qr_codes q where q.store_id='c0200000-0000-4000-8000-000000000001'::uuid and q.type='takeaway');
commit;
