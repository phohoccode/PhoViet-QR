# P1-C03 — Readiness sang Phase 2

23/10/2026 · Nền backend đủ bắt đầu Phase 2 theo contracts v1-draft; chưa phải tuyên bố MVP/visual gate đã nghiệm thu.

## Cài đặt và chạy dev

Node 22.13.1/npm10.9.2 (engines Node22/npm10), dùng duy nhất package-lock.json. Next16.4.2/React19.3.1/Tailwind4.3.3/Supabase JS2.118.0/SSR0.12.7; CLI2.121.0 và Vitest5.0.5 đã pin, không cần global CLI.

```powershell
# Dừng dev của chính bạn trước npm ci trên Windows để tránh native-module file locks.
npm ci
npm run supabase:start
npm run db:migrate
npm run db:seed
npm run test:auth
npm run test:db
npm run test:http
npm run lint
npm run typecheck
npm run build
npm run dev
```

Windows có thể dùng npm.cmd thay npm nếu PowerShell wrapper làm sai argument forwarding. Với host/port: `npm.cmd run dev -- --hostname=127.0.0.1 --port=3000`. Production sau build: `npm run start`. `npm run supabase:stop` dừng stack local và giữ volume; không tự reset/drop. Không chạy hai next dev trong cùng workspace; server hiện hữu PID9536/port3000 được giữ nguyên trong phiên kiểm tra. Sau đổi env/font, chủ server restart dev của mình để tránh hot-reload config cũ.

Local config đã ở `supabase/config.toml`: project_id **qr-ordering-p1c02-local** giữ tên từ P1-C02 để tiếp quản đúng stack hiện hữu; đây là tên dev, không remote project ref. API15421, DB15422, shadow15420, PostgreSQL17. Không dùng dải554xx bị Windows reserve trên máy này. CLI start bỏ Realtime/Storage/Studio/email viewer/edge/analytics/pooler vì chưa dùng; bật có chủ ý ở phase tương ứng. Auth email/password bật nhưng global signup=false; không có signup UI/auto-owner trigger.

`db:migrate` chỉ `migration up --local`, không remote push/reset. Thứ tự hiện tại: `20261023000100_foundation.sql` → seed.sql. Bốn bảng stores/owner_members/dining_tables/qr_codes, RLS/constraints/grants theo P1_C02_DB_NOTES. Không chạy lại SQL CREATE trên DB đã apply; dùng migration history. `db:seed` chạy Node helper local-only → docker psql với UTF-8/ON_ERROR_STOP, idempotent demo store và ba bàn; không Auth user/password/membership/menu. CLI db query không hỗ trợ seed nhiều câu trong một prepared statement ở version này nên không dùng cho seed.

Nếu local đang chạy từ harness P1-C02 ngoài repo, cùng project_id/ports sẽ được nhận đúng. Repo config hiện là nguồn cho lần start tiếp theo; migration/seed lấy từ repository. Không start stack thứ hai cùng tên/ports. `test:db` và `test:http` mặc định workdir repo; P1C02_LOCAL_WORKDIR chỉ là override tương thích harness cũ. Cả hai cố ý giới hạn local URL/container, không chạy remote. HTTP suite dùng port13002 riêng, từ chối dừng server khác; tạo/xóa user/store random và dừng child server ở finally.

## Env và bootstrap owner

Copy .env.example sang .env.local nếu **chưa có**, không ghi đè file hiện có. Lấy API URL và public publishable/legacy anon key từ local CLI status hoặc dev Dashboard. Status có cả admin secrets: chỉ xem riêng, không dán log/commit. Đặt hai NEXT_PUBLIC_SUPABASE_* trước build; chúng được Next inline. Không đặt service-role/sb_secret trong biến public. Runtime validation chỉ nhận publishable hoặc legacy JWT role anon; đó là kiểm cấu hình, không thay xác thực JWT của Supabase.

SUPABASE_SERVICE_ROLE_KEY không cần cho app Phase1, được giữ rỗng trong example; không thêm payment keys. .env.local đang có hai public values do người dùng cấu hình, khác URL stack local đã test; Codex giữ nguyên, chưa kiểm login/DB project đích. Local tests dùng env riêng trong process, không dùng project đích.

Tạo user Auth bằng admin Dashboard/SDK tin cậy với email/password riêng, confirm email; **không hardcode password/UUID user**. Lấy UUID thật trả về rồi INSERT owner_members vào store dev đã seed bằng admin SQL. Template đầy đủ ở [P1_C02_AUTH_HANDOFF](P1_C02_AUTH_HANDOFF.md#bootstrap-owner-bằng-admin-tin-cậy). Xác nhận tạo đúng một membership; unique auth_user_id chỉ một assigned store/login. Public/owner không được tự INSERT/UPDATE/DELETE membership. Không có public create-owner endpoint.

Tài khoản sử dụng lâu dài: **OWNER_BOOTSTRAP_REQUIRED cho project đích**. User tạm do suite tạo có password random trong memory và đã bị xóa; đó không phải account bàn giao. Với remote dev, admin tự apply migration đã review, tắt public signup và bootstrap; không có script tự deploy/link remote trong P1-C03.

## Contracts Phase 2 cần dùng (chưa có API chạy thật)

Nguồn chính xác: [API_CONTRACT_V1](../contracts/API_CONTRACT_V1.md), [types.ts](../contracts/types.ts), [UI_DATA_HANDOFF](../contracts/UI_DATA_HANDOFF.md), [SECURITY_AND_CONCURRENCY](../contracts/SECURITY_AND_CONCURRENCY.md). Dùng export canonical; alias @contracts đã có. Không copy pseudo DTO từ screen spec hoặc request cũ thiếu menuRevision.

| ID / method / path | Input → output và invariant |
| --- | --- |
| R01 GET /api/public/qr/:code | QRResolution; active table/takeaway đúng store, QR chỉ locator; table chưa verify không có session/order; bootstrap opaque browser cookie; no-store |
| R02 POST /api/public/table-sessions/verify | TableSessionVerifyInput {qrCode,sessionCode} → QRResolution + HttpOnly grant cookie; sessionCode opaque1–64, không hardcode PIN4; wrong422/expired410; TTL/revoke/rate/origin |
| R03 GET /api/public/menu?qrCode=… | MenuV1View(categories/items/menuRevision/serverTime); chỉ active category/item/options, unavailable vẫn render hết hàng; không grant/order data |
| R11 GET /api/owner/tables?tableId=… | OwnerTablesView {tables,detail}; detail bắt buộc nullable, không sessionCode trong grid; đúng membership/store |
| R12 POST /api/owner/tables/:id/sessions | OpenTableSessionInput(requestId) → private OwnerSessionOpenedView, 201; unique live session gồm open/checkout_pending; code chỉ private delivery, hash DB, replay bảo vệ |
| R14 GET /api/owner/menu?includeInactive=… | OwnerMenuView; owner thấy inactive/unavailable; menuRevision/serverTime |
| R15 POST /api/owner/menu | CreateMenuItemInput(requestId + MenuItemFields) → OwnerMenuItem201; integer VND, category cùng store, DB IDs, revision/audit/idempotency atomic |
| R16 PATCH /api/owner/menu/:id | PatchMenuItemInput(requestId,expectedUpdatedAt,≥1 changed field) → OwnerMenuItem; stale409; options replacement/deactivate giữ lịch sử |
| R17 GET /api/owner/qr-codes | QRCodeView[]; public locator/path, không code phiên, không PDF endpoint |
| R18 POST /api/owner/qr-codes | QRCodeWriteInput discriminator action=create/set_active + requestId; type table iff tableId; server sinh publicCode, đúng store; 201/200 |
| R19/R20 GET/PATCH /api/owner/settings | StoreSettingsView / PatchStoreSettingsInput(requestId,expectedUpdatedAt,name?/acceptingOrders?); secrets/provider/timezone không được ghi qua UI |

R13 POST /api/owner/table-sessions/:id/settle là contract đóng/checkout: SettleSessionInput với begin_checkout/cancel_checkout/confirm_received, expectedVersion và requestId; không invent /close endpoint. Full billing/settlement triển khai Phase5, không giả hoàn tất nó trong Phase2; nếu Phase2 cần đóng phiên trống phải chốt phạm vi và Q6 trước. R04 order/FIFO thuộc Phase3/4; client cart chuẩn bị menuRevision/CartLine nhưng không fake order success.

Migrations Phase2 bổ sung table_sessions/guest_access/menu_categories/menu_items/menu_item_options và menu revision khi được giao; không tạo lại dining_tables/qr_codes hiện có. Bổ sung unique live session, same-store composite FK, hashed scoped credentials/expiry/revocation, RLS/admin RPC tối thiểu. Mỗi owner API xác minh user+membership độc lập, không dựa layout hoặc browser storeId. Tiếp tục integer VND, server-computed price, fixed lock order, operation idempotency. Option v1 chỉ additive, không required/exclusive size/sugar groups.

## Gate và việc còn lại

- [x] Backend Phase1 inventory, auth UI contract, guard không JS, refresh, RLS/cross-store, migration runner/seed, log redaction, lint/typecheck/build và local HTTP smoke.
- [x] Không endpoint nghiệp vụ giả; không mở anon SELECT để preview; không thay contract/UI của Gemini.
- [ ] Gemini P1-G03 visual/responsive/hydration review và owner UX acceptance. Report chưa có ở lần đọc; không suy ra visual pass từ HTTP. Requests preview/inline logout error ở UI_HANDOFF.
- [ ] Chủ dự án cấu hình/bootstrap account trên project đích và smoke lại đó; local PASS không chứng minh remote PASS.
- [ ] Trước **live table-session delivery**: chốt Q5 entropy/TTL/hash/encrypted replay/key lifecycle/recovery, không đoán 4 số/đọc ngược hash. Q6 empty/close policy và scope Phase2 vs Phase5 cần xác nhận trước bật đóng bàn.
- [ ] Contract gaps: chưa có category CRUD, physical table create/edit endpoint, rotate/read session code, upload ảnh/logo/address/PDF. Nếu UI cần, ghi CONTRACT_REQUEST riêng và chờ quyết định; không tự thêm route hoặc sửa contracts frozen.
- [ ] Phase4 mới chốt payOS/SePay, TTL payment/pickup/provider webhook schema; Phase3 cần concurrency FIFO, không coi foundation đủ cho release.

Npm production audit0; full audit5 high thuộc dev ESLint/braces chain đã biết, chưa có bản vá upstream được áp dụng. Không force downgrade Next/ESLint để đổi báo cáo. T-007 root còn nhắc seed menu/owner: Phase1 này seed chỉ store/bàn + admin bootstrap; menu seed chờ Phase2. Không tick root TASKS hoặc nhận toàn bộ T-007/T-010/MVP done khi các phần ngoài scope chưa được kiểm chứng.
