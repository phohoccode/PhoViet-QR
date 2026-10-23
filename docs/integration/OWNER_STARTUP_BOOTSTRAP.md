# Owner bootstrap khi khởi động server

`npm run dev` và `npm run start` chạy `scripts/bootstrap-owner.mjs` qua npm predev/prestart trước khi mở Next server. `npm run build` không tạo user hay ghi DB. Có thể chạy riêng `npm run bootstrap:owner`. Gọi `next dev/start` trực tiếp hoặc deploy serverless không chạy npm lifecycle này.

Đây là thay đổi theo yêu cầu sau P1-C03: trước đó owner phải được admin tạo thủ công. Auth login/guard và UI không đổi; tài khoản vẫn cần membership thật trong DB. Không có public signup/bootstrap endpoint.

## Cấu hình

Điền trong `.env.local` (ignored), hoặc biến môi trường của server:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=
OWNER_BOOTSTRAP_ENABLED=true
OWNER_BOOTSTRAP_EMAIL=
OWNER_BOOTSTRAP_PASSWORD=
OWNER_BOOTSTRAP_STORE_ID=c0200000-0000-4000-8000-000000000001
OWNER_BOOTSTRAP_STORE_NAME=Phở Việt
```

Giữ `NEXT_PUBLIC_SUPABASE_URL` và public key của cùng project. Lấy service-role key (JWT role service_role) hoặc secret key sb_secret từ phần API Keys của project, điền vào SUPABASE_SERVICE_ROLE_KEY. Key này chỉ script Node tin cậy sử dụng, không prefix NEXT_PUBLIC_, không gửi qua form hay commit. Email/mật khẩu thực chỉ lưu trong .env.local; .env.example để rỗng.

Áp dụng `supabase/migrations/20261023000100_foundation.sql` và `20261023000200_owner_bootstrap_privileges.sql` trên project trước. Migration thứ hai cấp schema usage và SELECT/INSERT trên stores/owner_members riêng cho service_role: hosted project có thể không có default grants như local, BYPASSRLS không thay thế table privileges. Không mở quyền membership cho anon/authenticated hoặc tắt RLS. Script chỉ tạo user/quán/membership, không tự chạy DDL hoặc seed các bàn. Thiếu config/migration hay lỗi provider khiến lệnh startup dừng với thông báo đã lọc; sửa cấu hình rồi chạy lại. `OWNER_BOOTSTRAP_ENABLED=false` bỏ qua toàn bộ bootstrap.

## Hành vi chạy lặp

- Chưa có email: tạo Supabase Auth user bằng admin API, xác nhận email và dùng password từ env. Mật khẩu phải đáp ứng chính sách của project (local config hiện yêu cầu ít nhất12 ký tự).
- Đã có email: giữ nguyên password/profile; không reset mỗi lần restart. Email chưa xác nhận cần admin xác nhận riêng.
- Chưa có store ID: tạo store theo tên cấu hình; có rồi giữ tên/dữ liệu. ID cố định tránh tạo quán mới mỗi lần restart.
- Chưa có membership: gắn user vào store với role owner. Có đúng membership thì không ghi DB; có store khác thì dừng, không tự chuyển quán.
- Hai startup đồng thời được unique constraints bảo vệ; chỉ chấp nhận bản ghi trùng có cùng user/store/role. Lỗi giữa các bước có thể để lại user hoặc store; chạy lại sẽ tiếp tục, không tự xóa dữ liệu.

Log chỉ event/status/code và thông báo cố định, không in email/password/key/token/provider details. Script không import vào app/client bundle. Server đang chạy cần được khởi động lại bằng npm để kích hoạt; có thể tắt opt-in sau lần bootstrap thành công. Thay password env không đổi password của user đã tồn tại; đổi trong Supabase Auth khi cần.

## Xác minh 23/10/2026

- `npm run test:auth`: 46 tests PASS (9 bootstrap unit cases).
- `npm run db:migrate`: migration quyền đã apply local; `npm run test:db`: 9 tests PASS, gồm bootstrap Auth thật + sign-in + membership + restart không đổi password/tên quán.
- `npm run lint`, `npm run typecheck`, `npm run build`: PASS. Build không bootstrap.
- Predev/prestart với opt-in false: PASS/disabled.
- Project remote: Auth admin endpoint200, nhưng SELECT stores/owner_members403 SQLSTATE42501 (permission denied for table). Chưa tạo user vì preflight dừng trước mọi mutation. Cần apply migration quyền trên remote bằng SQL Editor/admin SQL; service-role HTTP key không cấp quyền chạy DDL/GRANT. Không gọi local PASS là remote PASS.
