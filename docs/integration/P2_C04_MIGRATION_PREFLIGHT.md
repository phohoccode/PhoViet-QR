# P2-C04 — preflight migration006

> Khi gặp `unexpected rate marker`: đọc [audit resolver](P2_C04_RESOLVER_MIGRATION_AUDIT.md) và chạy `supabase/diagnostics/p2_c04_resolver_preflight.sql` ở chế độ chỉ đọc. File trả một JSON duy nhất để Export → JSON trên SQL Editor. Chưa retry migration trước khi đối chiếu định nghĩa Production; không bỏ guard hoặc thay checksum để ép chạy.

Chạy sau001–005, backup/snapshot DB trước thay đổi deployment. Migration006 additive, không xóa/auto-disable bản ghi trùng, không thay code QR cũ, không tạo account. Local migration đã áp dụng; remote chưa apply từ task này. Không chạy seed để “sửa trùng” tự động.

## Kiểm tra read-only trước migration

Trên SQL Editor quản trị đúng project, chạy các truy vấn dưới đây. Regex dùng cùng whitespace normalization như migration.

```sql
with labels as (
 select id,store_id,label,
  btrim(regexp_replace(label,U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g')) normalized
 from public.dining_tables
)
select store_id,lower(normalized) normalized_label,array_agg(id) table_ids,array_agg(label) labels
from labels group by store_id,lower(normalized) having count(*)>1;

select table_id,array_agg(id) qr_ids,array_agg(public_code) public_codes
from public.qr_codes where type='table' and active group by table_id having count(*)>1;

select store_id,array_agg(id) qr_ids,array_agg(public_code) public_codes
from public.qr_codes where type='takeaway' and active group by store_id having count(*)>1;

with labels as (
 select id,label,btrim(regexp_replace(label,U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g')) normalized
 from public.dining_tables
)
select * from labels where char_length(normalized) not between 1 and 80
 or normalized ~ U&'[\0001-\0008\000E-\001F\007F-\009F]';

select t.id,t.label,s.id session_id,s.status
from public.dining_tables t join public.table_sessions s on s.table_id=t.id
where s.status in('open','checkout_pending');
```

Bốn truy vấn đầu phải trống. Danh sách phiên giúp đánh giá thao tác quản trị, không phải lỗi migration.

Nếu có trùng: chủ quán/admin quyết định giữ nhãn và QR nào dựa trên QR đã in và dữ liệu hiện có. Đổi tên bàn xung đột hoặc disable QR dư bằng transaction quản trị **sau khi đánh giá phiên active**, giữ bản ghi/lịch sử, không DELETE hay auto chọn “mới nhất”. Không tự close phiên để vượt guard. Sau sửa có chủ đích, rerun preflight rồi migration. Khi migration báo preflight error, toàn bộ006 rollback; xử lý nguồn dữ liệu thay vì chạy từng đoạn bỏ DO block.

## Apply và kiểm tra

Local: `npm run db:migrate`. Remote: chạy nguyên migration006 trong SQL Editor có quyền quản trị, hoặc CLI migration workflow đã liên kết đúng project. Không dùng service-role key thay cho quyền SQL admin. Không bỏ begin/commit/preflight. Migration đổi lock order resolver, có guard kiểm definition; lỗi unexpected definition phải đối chiếu migrations003/004 thay vì bỏ check.

```sql
select indexname,indexdef from pg_indexes
where schemaname='public' and indexname in
 ('dining_tables_normalized_label','qr_codes_one_active_table','qr_codes_one_active_takeaway');
select has_column_privilege('authenticated','public.qr_codes','active','update'); -- false
select has_function_privilege('anon','public.p2_table_qr_execute(text,jsonb)','execute'); -- false
select has_function_privilege('service_role','public.p2_table_qr_execute(text,jsonb)','execute'); -- true
select has_column_privilege('service_role','public.stores','updated_at','update'); -- true
```

Thêm APP_BASE_URL hợp lệ vào môi trường server rồi restart/redeploy. Kiểm ownerGETtables/qr, QR public cũ vẫn resolve, rename giữ URL; không rotate QR đang in chỉ để smoke test. Owner không còn direct INSERT/UPDATE/DELETE dining_tables/qr_codes qua Supabase authenticated SDK; mọi command phải đi API để có transaction, guard, rate limit và audit. Các test P1 kỳ vọng ghi trực tiếp cần cập nhật ở bước bảo trì test tương ứng.

Test `tests/integration/table-qr-migration.test.ts` dùng scratch DB riêng, tái hiện cả trùng nhãn/tableQR/takeawayQR/invalid label, chứng minh abort không mất data, sau đó áp dụng001–006 và gọi RPC thật dưới SET ROLE service_role. Không reset database đang dùng.
