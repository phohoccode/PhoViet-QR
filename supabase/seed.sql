-- DEV ONLY: run as a trusted SQL administrator, never via anon/owner HTTP client.
-- No auth users, passwords, arbitrary auth UUIDs, membership or orders.
begin;
select pg_advisory_xact_lock(hashtextextended('qr-ordering-demo-seed',0));
insert into public.stores (id, name)
values ('c0200000-0000-4000-8000-000000000001', 'Quán Demo P1-C02')
on conflict (id) do nothing;

-- Serialize all menu writes with the same store gate used by owner commands.
select id from public.stores where id='c0200000-0000-4000-8000-000000000001' for update;

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

-- Menu demo has stable UUIDs; rerunning does not overwrite owner edits/prices.
insert into public.menu_categories(id,store_id,name,sort_order) values
 ('c0220000-0000-4000-8000-000000000001','c0200000-0000-4000-8000-000000000001','Cà phê',1),
 ('c0220000-0000-4000-8000-000000000002','c0200000-0000-4000-8000-000000000001','Trà và bánh',2)
on conflict do nothing;
insert into public.menu_items(id,store_id,category_id,name,description,price_vnd,image_url,available,sort_order) values
 ('c0220000-0000-4000-8000-000000000011','c0200000-0000-4000-8000-000000000001','c0220000-0000-4000-8000-000000000001','Cà phê sữa','Cà phê pha phin',29000,null,true,1),
 ('c0220000-0000-4000-8000-000000000012','c0200000-0000-4000-8000-000000000001','c0220000-0000-4000-8000-000000000001','Cà phê muối',null,35000,'https://images.unsplash.com/photo-1509042239860-f550ce710b93',false,2),
 ('c0220000-0000-4000-8000-000000000013','c0200000-0000-4000-8000-000000000001','c0220000-0000-4000-8000-000000000002','Trà đào','Trà đào thanh mát',32000,null,true,1),
 ('c0220000-0000-4000-8000-000000000014','c0200000-0000-4000-8000-000000000001','c0220000-0000-4000-8000-000000000002','Nước lọc',null,0,null,true,2)
on conflict do nothing;
insert into public.menu_item_options(id,store_id,item_id,name,price_delta_vnd,sort_order) values
 ('c0220000-0000-4000-8000-000000000021','c0200000-0000-4000-8000-000000000001','c0220000-0000-4000-8000-000000000011','Thêm cà phê',6000,1),
 ('c0220000-0000-4000-8000-000000000022','c0200000-0000-4000-8000-000000000001','c0220000-0000-4000-8000-000000000011','Thêm sữa',3000,2)
on conflict do nothing;
commit;
