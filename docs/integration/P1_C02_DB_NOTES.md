# P1-C02 — Database foundation

## Migration và dữ liệu

Thứ tự: `supabase/migrations/20261023000100_foundation.sql` → `supabase/seed.sql` (chỉ dev). Migration có transaction; đã apply thành công bằng Supabase CLI trên PostgreSQL 17 local sạch ngày 23/10/2026. Không có order/payment/FIFO/session/menu schema trong bước này.

| Bảng | Ràng buộc chính |
| --- | --- |
| stores | UUID PK; tên không rỗng; timezone mặc định Asia/Ho_Chi_Minh; accepting_orders; version dương; timestamps |
| owner_members | PK(store_id, auth_user_id); FK stores và auth.users; role chỉ owner; unique auth_user_id |
| dining_tables | UUID PK; FK store; unique(store_id,label); unique(store_id,id) phục vụ composite FK |
| qr_codes | UUID PK; public_code unique/URL-safe, DB tự sinh; type table/takeaway; table bắt buộc table_id, takeaway cấm table_id; FK(store_id,table_id) tới dining_tables cùng quán |

Một login chỉ được gán một store trong MVP, có thể nhiều owner login cùng store. Đây là lựa chọn triển khai cho phép lookup membership duy nhất, không nhận tenant từ client. Index unique(auth_user_id) phục vụ lookup theo user; các PK/composite unique phục vụ membership/FK; qr_codes có index(store_id,table_id).

Trigger cập nhật updated_at tăng đơn điệu và tăng stores.version ở mỗi update. Function chạy invoker, search_path=pg_catalog; không có security-definer/RPC cấp quyền. Type persistence nằm ở `src/lib/supabase/database.ts`, không thay DTO contract. `menuRevision` chưa thành DB field vì chưa triển khai menu.

## RLS và grants

RLS bật cả bốn bảng. Revoke mặc định PUBLIC/anon/authenticated trước khi grant tối thiểu; không có anon policy/grant.

| Actor/bảng | Quyền trực tiếp |
| --- | --- |
| anon | Không đọc/ghi cả bốn bảng |
| authenticated/owner_members | SELECT membership của chính auth.uid(), role owner; cấm INSERT/UPDATE/DELETE |
| owner/stores | SELECT quán có membership; UPDATE name, accepting_orders trong quán đó |
| owner/dining_tables | SELECT; INSERT store_id,label,active; UPDATE label,active trong quán đó |
| owner/qr_codes | SELECT; INSERT store_id,type,table_id,active; UPDATE active trong quán đó |

Không cấp owner quyền hard delete, tạo store, đổi ID/store_id/timestamps/version/public locator hay tự cấp membership. WITH CHECK chặn tạo dữ liệu cho store khác; composite FK vẫn chặn bàn khác store kể cả admin insert sai. User đăng nhập không có membership thấy tập rỗng qua SELECT RLS và bị app guard từ chối. Mọi API owner tương lai phải xác minh lại membership; layout không thay authorization API. Public QR/menu cần API scoped ở phase sau.

Seed idempotent tạo store demo `c0200000-0000-4000-8000-000000000001` và Bàn 01–03; không tạo user/password/membership/QR. Bootstrap bằng UUID Auth thật theo [AUTH_HANDOFF](P1_C02_AUTH_HANDOFF.md). Không dùng UUID seed làm auth user.

## Local harness đã dùng

Docker Desktop 29.1.3, CLI 2.121.0; project local riêng **qr-ordering-p1c02-local**, workdir `C:\Users\Pho\AppData\Local\Temp\qr-ordering-p1c02-local`. Không tạo config.toml ngoài ownership trong repository. Local stack còn chạy để dùng lại; không đụng project remote hay container khác.

Để dựng harness tương tự, init thư mục trống ngoài repo bằng `npx.cmd supabase --workdir <local-dir> init`, copy migrations và seed từ repo vào `<local-dir>/supabase/`. Chỉnh config local trước start:

- project_id = qr-ordering-p1c02-local; db.major_version = 17.
- api.port=15421; db.port=15422; db.shadow_port=15420; studio.port=15423; local_smtp.port=15424; db.pooler.port=15429. Dải 554xx bị Windows reserved ports trên máy này.
- auth.enable_signup=false; auth.email.enable_signup=true; auth.sms.enable_signup=false; minimum_password_length=12. Global false cấm signup; email true cần để **đăng nhập email** hoạt động. Không đặt email.enable_signup=false vì CLI ánh xạ nó thành tắt provider email.

Lệnh đã dùng (chạy ở repository, thay local-dir nếu cần):

```powershell
npx.cmd supabase --workdir <local-dir> start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
$env:P1C02_LOCAL_WORKDIR = '<local-dir>'
npx.cmd vitest run --config tests/db/vitest.config.mts
node tests/db/http-smoke.mjs
```

CLI start/status có thể in key local: giữ output riêng, không dán vào log/commit. Integration suite tự đọc status JSON trong memory và chỉ chấp nhận API `http://127.0.0.1:15421` cùng container cố định `supabase_db_qr-ordering-p1c02-local`. Suite dùng admin key **chỉ ở test** tạo hai Auth user với password random, gán một user bằng UUID trả về thật; dùng public key + session để kiểm tra RLS/actions/guard. Cleanup dữ liệu đúng UUID của lần chạy và xóa Auth users. Không đọc `.env.local` hoặc hỗ trợ remote URL.

Để chạy seed thủ công trên harness Windows, tránh mất dấu tiếng Việt qua pipe:

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-Content -Raw -Encoding utf8 supabase/seed.sql |
  docker exec -i supabase_db_qr-ordering-p1c02-local psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Đã chạy seed lặp, cuối cùng còn đúng 1 store/3 bàn/0 Auth users/0 membership. Một lần pipe mặc định PowerShell tạo nhãn mất dấu; đã sửa chỉ các nhãn lỗi trên DB disposable này và chạy lại UTF-8. File seed nguồn không đổi.

## Kết quả và giới hạn

8 integration tests PASS: SQLSTATE unique/check/FK; anon denied; membership không tự mutate; owner đúng tenant và cột; cross-store denied; signup disabled; action login/logout và cookie thật; RSC refresh redirect rồi route persist cookie/cache headers; thông báo sai mật khẩu và thiếu quyền giống nhau. Next cookies/redirect transport được mock trong Vitest suite, Supabase Auth/PostgREST/PostgreSQL là thật.

Sau Gemini tích hợp, `tests/db/http-smoke.mjs` bổ sung production Next HTTP không mock: build public env local trong process, POST form Server Action từ HTML thật; guest→login, owner→dashboard, nonmember/sai password denied, refresh session→Set-Cookie→dashboard, logout/reload denied, cookie malformed fail closed. Suite từ chối remote/project không đúng tên và port13002 đang được dùng; tạo/xóa Auth users/store random và dừng đúng server child. Không có password/key cố định hoặc log credential. HTTP cookie jar tự chuyển cookie; không claim kiểm thử JS hydration/visual hoặc hành vi cookie của browser. Sau smoke chạy lại build mặc định nếu không muốn giữ public local config trong .next; .env.local không bị suite sửa.

DB/Auth local đã VERIFIED. Dev project thực của quán chưa cấu hình: `.env.local` giữ nguyên, credential rỗng; **OWNER_BOOTSTRAP_REQUIRED**. Cần tắt public signup trên project đích; migration không cấu hình hosted Auth settings. Chưa nối browser Realtime với session HttpOnly.

## Repair/rollback

Không sửa migration đã apply hoặc tự drop dữ liệu thật. Nếu apply transaction lỗi thì sửa nguyên nhân trên DB dev và chạy lại migration chưa ghi history. Nếu đã apply, tạo migration bổ sung có thứ tự và backup trước thay đổi. Reset/drop chỉ dành harness disposable đã xác nhận, không chạy tự động trên remote. Dừng local bằng `npx.cmd supabase --workdir <local-dir> stop` (giữ volume). Khi cần gỡ schema khỏi DB có dữ liệu, đánh giá FK và backup, thu hồi quyền trước, có kế hoạch migration riêng; không cung cấp rollback destructive tự động.
