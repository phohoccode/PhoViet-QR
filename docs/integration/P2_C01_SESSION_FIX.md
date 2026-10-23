# Lỗi mở phiên bàn — 23/10/2026

## Nguyên nhân đã xác minh trên project đang cấu hình

- `.env.local` thiếu `TABLE_SESSION_ENCRYPTION_KEYS`: mở phiên dừng ở bước mã hóa và trả `500 INTERNAL_ERROR` với thông báo “Dịch vụ tạm thời không khả dụng”. Đã sinh key AES-256 riêng, lưu bền trong file env bị Git ignore; không in key hoặc ghi vào tài liệu.
- RPC resolver trả PostgreSQL `42501 permission denied for table qr_codes` dù service-role SELECT thành công. `FOR SHARE`/`FOR UPDATE` còn cần quyền UPDATE ít nhất một cột. Template local có default grants nên test cũ không phát hiện khác biệt hosted này.
- Project có 1 quán nhưng 0 bàn/0 QR; R11/R17 trả danh sách rỗng. Fixture trên UI không phải bản ghi DB để mở phiên.

## Bản sửa

`supabase/migrations/20261023000400_session_row_lock_privileges.sql` cấp UPDATE một cột trên stores/dining_tables/qr_codes cho service_role. Không cấp thêm quyền cho anon/authenticated, không thay RLS hoặc dùng SECURITY DEFINER để né quyền.

Fresh migration regression thu hồi default grants Phase1 trước khi apply các migration tiếp theo, rồi gọi resolver và mở phiên thực dưới `SET ROLE service_role`. Kiểm chứng cả khóa đọc và khóa ghi trên PostgreSQL thật, không chỉ kiểm metadata hay chạy RPC dưới postgres.

## Cách hoàn tất trên Supabase hosted

1. Trong SQL Editor của đúng project, chạy migration004 ở trên. Không chạy lại CREATE TABLE của foundation001/003.
2. Chạy `supabase/seed.sql` với quyền quản trị. Với quán demo hiện tại, script giữ tên quán, thêm 3 bàn và QR còn thiếu; chạy lại không nhân bản dữ liệu.
3. Next dev thường tự nạp lại `.env.local`; nếu chưa nạp, khởi động lại `npm run dev`. Production cần restart process sau cập nhật env.
4. Dashboard → Bàn → Làm mới; chỉ mở bàn thật từ R11. Thành công phải nhận HTTP201 và hộp thoại mã phiên private.

Service-role JWT không có quyền chạy GRANT/SQL tùy ý qua REST. Người dùng đã xác nhận chạy migration004 và seed trong SQL Editor. Kiểm chứng lại target: R11/R17 trả 3 bàn/3 QR; resolver không còn lỗi quyền. Trên Chrome đang mở `localhost:3000/dashboard` với Supabase hosted hiện tại, thao tác mở Bàn01 thành công, lưới đổi sang Có khách và hộp thoại hiện mã private cùng expiry24giờ. Giữ hộp thoại mở để người dùng ghi nhận; không sao chép mã vào tài liệu.

## Kiểm chứng sau sửa

- `npm run db:migrate`: PASS local, apply004.
- Vitest integration: PASS15/15, bao gồm fresh database với default grants bị thu hồi.
- `node tests/integration/qr-http.mjs`: PASS; production build, open/replay/race/verify/close trên Supabase local thật.
- `npm run lint`, `npm run typecheck`, `git diff --check`: PASS.
- Browser hiện tại + Supabase hosted: mở phiên thành công như mô tả trên; không cần giả lập fixture hoặc nới RLS.
