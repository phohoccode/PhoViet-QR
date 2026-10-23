# P2-C01 — QR, table session và guest access

23/10/2026 (Asia/Saigon). Backend/API đã chạy với Supabase local thật và production Next HTTP. Contract v1-draft giữ nguyên; UI Gemini không được sửa bởi Codex. Chưa deploy/apply migration lên remote.

## Paths và exports

| Path | Exports / vai trò |
| --- | --- |
| `src/server/qr/service.ts` | `resolvePublicQr(code,context)`, `listOwnerQrCodes(owner)` |
| `src/server/table-sessions/service.ts` | `openTableSession(owner,tableId,{requestId})`, `verifyTableSession(qrCode,sessionCode,context)`, `listOwnerTables(owner,tableId?)`, `requireGuestTableSession(qrCode,context,options?)` |
| `src/server/security/owner.ts` | `requireApiOwner()` xác minh Auth.getUser + owner_members từng request; JSON401/403, không page redirect |
| `src/server/security/request-context.ts` | `guestRequestContext(NextRequest,allowCreate?,forceNew?)`, `setGuestCookie`, `GUEST_COOKIE` |
| `src/server/security/database.ts` | `executePhase2` gọi service-role-only SQL RPC; không phải API public cho client gọi tùy action |
| `src/server/security/{api,crypto}.ts` | Envelope/Origin/body limit, hash/CSPRNG/AES-GCM; server-only |
| `src/lib/validations/table-sessions.ts` | strict Zod QR/path/input/query schemas |

API routes R01/R02/R11/R12/R17 lần lượt ở `src/app/api/public/qr/[code]/route.ts`, `src/app/api/public/table-sessions/verify/route.ts`, `src/app/api/owner/tables/route.ts`, `src/app/api/owner/tables/[id]/sessions/route.ts`, `src/app/api/owner/qr-codes/route.ts`. Tất cả Node runtime, private/no-store. Thành công `{data,error:null}`, lỗi `{data:null,error:{code,message,details?}}`.

## R01 / R02 — JSON và UI fields

Ví dụ DTO dưới đây là dữ liệu minh họa, không phải credential hay ID đã seed. API thực trả UUID DB, ISO UTC; `publicCode` URL-safe1–128, mã phiên opaque1–64. Không nhận storeId/tableId/isOwner từ body verify. `StoreView` chỉ id/name/timezone/acceptingOrders.

`GET /api/public/qr/<publicCode>`: không query/body. QR table public chưa verify:

```json
{"data":{"type":"table","mode":"dine_in","store":{"id":"c0200000-0000-4000-8000-000000000001","name":"Quán Demo P1-C02","timezone":"Asia/Ho_Chi_Minh","acceptingOrders":true},"table":{"id":"c0200000-0000-4000-8000-000000000002","label":"Bàn 01"},"requiresSessionCode":true,"session":null},"error":null}
```

Takeaway không cần xác minh phiên bàn:

```json
{"data":{"type":"takeaway","mode":"takeaway","store":{"id":"c0200000-0000-4000-8000-000000000001","name":"Quán Demo P1-C02","timezone":"Asia/Ho_Chi_Minh","acceptingOrders":true},"table":null,"requiresSessionCode":false,"session":null},"error":null}
```

`POST /api/public/table-sessions/verify`, Content-Type application/json:

```json
{"qrCode":"PUBLIC_QR_LOCATOR","sessionCode":"DEMO-ONLY-NOT-REAL"}
```

Mã hợp lệ trả200 + Set-Cookie, vẫn type QRResolution:

```json
{"data":{"type":"table","mode":"dine_in","store":{"id":"c0200000-0000-4000-8000-000000000001","name":"Quán Demo P1-C02","timezone":"Asia/Ho_Chi_Minh","acceptingOrders":true},"table":{"id":"c0200000-0000-4000-8000-000000000002","label":"Bàn 01"},"requiresSessionCode":false,"session":{"id":"c0200000-0000-4000-8000-000000000003","status":"open"}},"error":null}
```

Session ID chỉ xuất hiện khi đúng grant. R01 đọc lại cookie sau reload và trả nhánh đã verify; cookie revoked/expired hoặc phiên mới trả nhánh public, không lộ session mới. Quán acceptingOrders=false vẫn resolve200 với flagfalse theo R01 (stores không có cột active); QR disabled/table inactive/missing trả404. Takeaway chuẩn bị vào menu R03 của P2-C02; hiện chưa có menu API, giỏ/order/payment chưa triển khai.

```ts
const resolved = await fetch(`/api/public/qr/${encodeURIComponent(qrCode)}`, {
  credentials: 'include', cache: 'no-store',
});
const verified = await fetch('/api/public/table-sessions/verify', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ qrCode, sessionCode }),
});
```

Browser tự gửi Origin cùng site; request không Origin/foreign Origin bị403. Không cấu hình CORS wildcard. `APP_ORIGIN` là origin chuẩn tùy chọn khi reverse proxy; không tin arbitrary X-Forwarded-Host. JSON tối đa4096bytes, field ngoài schema400. Không đưa sessionCode vào query/history/localStorage/analytics; không đọc cookie bằng JS.

## Owner API

R11 `GET /api/owner/tables?tableId=<UUID>`: query tableId optional, UUID DB, không mock opaque ID. Luôn trả `{tables,detail}`; detail nullable; grid có active true/false và live session/null. Mọi membership/store lấy từ Auth server. Ví dụ thành công:

```json
{"data":{"tables":[{"id":"c0200000-0000-4000-8000-000000000002","label":"Bàn 01","active":true,"session":{"id":"c0200000-0000-4000-8000-000000000003","status":"open","openedAt":"2026-10-23T03:00:00+00:00","closedAt":null,"orderCount":0,"totalVnd":0,"paymentStatus":"unpaid","version":1}}],"detail":null},"error":null}
```

Có tableId với live session thì detail `{table,session,orders:[]}`. Phase này DB chưa có orders: orderCount0/totalVnd0/unpaid và orders[] phản ánh chưa có đơn, không phải bill API hoàn chỉnh. Phase3 phải thay `p2_session_view`/owner snapshot để aggregate order snapshots; không giữ hằng0 sau khi thêm orders.

R12 `POST /api/owner/tables/<UUID>/sessions` body **bắt buộc** `{"requestId":"<UUID mới của command>"}`.201 private delivery:

```json
{"data":{"table":{"id":"c0200000-0000-4000-8000-000000000002","label":"Bàn 01"},"session":{"id":"c0200000-0000-4000-8000-000000000003","status":"open","openedAt":"2026-10-23T03:00:00+00:00","closedAt":null,"orderCount":0,"totalVnd":0,"paymentStatus":"unpaid","version":1},"sessionCredential":{"sessionCode":"DEMO-ONLY-NOT-REAL","expiresAt":"2026-10-24T03:00:00+00:00"}},"error":null}
```

UI chỉ hiển thị mã trong kết quả command private để owner đưa khách. Lưu requestId + tableId của command trước gửi, retry cùng ID khi timeout; không sinh ID mới tự động. Replay cùng owner/store/table/requestId trả cùng snapshot201 + giải mã đúng code còn hạn, không tạo phiên/event mới. Khác table/operation409; khác owner403 kể cả cùng store; sau closed/expiry410. Lệnh mới khi bàn đã mở409, tuyệt đối không lấy mã phiên cũ. Không endpoint đọc/rotate lại code hoặc close mới.

R17 `GET /api/owner/qr-codes`: trả QRCodeView[] của đúng store, bao gồm inactive. Ví dụ:

```json
{"data":[{"id":"c0200000-0000-4000-8000-000000000004","publicCode":"PUBLIC_QR_LOCATOR","path":"/q/PUBLIC_QR_LOCATOR","active":true,"type":"table","table":{"id":"c0200000-0000-4000-8000-000000000002","label":"Bàn 01"}},{"id":"c0200000-0000-4000-8000-000000000005","publicCode":"COUNTER_PUBLIC_LOCATOR","path":"/q/COUNTER_PUBLIC_LOCATOR","active":true,"type":"takeaway","table":null}],"error":null}
```

## Errors / UI mapping theo frozen contract

| HTTP/code | Hành vi |
| --- | --- |
|400 VALIDATION_ERROR|Thiếu/sai kiểu/field lạ, QR format sai, body quá lớn; sửa input|
|401 UNAUTHORIZED|Owner thiếu session hoặc browser context không còn hợp lệ; R01/R02 tự cấp context mới thay context không nhận diện, không khôi phục grant cũ|
|403 FORBIDDEN|Không membership/khác actor command/Origin sai; không redirect HTML|
|403 SESSION_REQUIRED|Cookie chưa có grant đúng bàn/phiên; xác minh lại|
|404 INVALID_QR|QR unknown/disabled/table inactive; không phân biệt nhánh để tránh dò|
|404 RESOURCE_NOT_FOUND|Owner yêu cầu bàn ngoài scope hoặc không tồn tại|
|409 INVALID_STATE_TRANSITION|Bàn inactive/đã có live session (gồm checkout_pending); không tự cấp lại code|
|409 DUPLICATE_REQUEST_CONFLICT|Cùng requestId khác target/payload; giữ command cũ để xử lý|
|409 SESSION_CHECKOUT_PENDING|Helper yêu cầu ghi khi bàn đang checkout; disable đặt thêm|
|410 SESSION_EXPIRED|Không có live session/code expired, credential expired/revoked, replay closed; liên hệ owner|
|422 INVALID_SESSION_CODE|Mã đúng schema nhưng sai; giữ input, không cấp grant|
|429 RATE_LIMITED|JSON details.retryAfterSeconds và header Retry-After; backoff|
|500 INTERNAL_ERROR|Lỗi cấu hình/key/DB/provider đã sanitize; retry command cùng ID nếu chưa rõ kết quả|

Không thêm NO_ACTIVE_TABLE_SESSION/SESSION_LOCKED/ACTIVE_SESSION_EXISTS vì không có trong ApiErrorCode v1. `checkout_pending` **cho verify/đọc** theo R02; chỉ từ chối ghi theo helper. Đây là lựa chọn contract chính thức ưu tiên hơn ví dụ prompt. R01 public không trả “bàn chưa mở” vì session=null trước verify; UI chỉ biết expired khi verify410. Store/table UUID là locator công khai có trong DTO đã duyệt; không owner IDs/hash/key/token.

## Cookie, TTL, rate limits và helper Phase3

- Cookie **__Host-qr_guest** khi production (**qr_guest** khi dev), host-only Path=/, HttpOnly, SameSite=Lax, Secure khi production; maxAge30ngày. Prefix __Host- ngăn sibling subdomain đặt Domain cookie để cố định context. Cookie chỉ256-bit CSPRNG browser bearer. DB lưu hash, không raw token; separate domain proof dẫn xuất từ raw token tạo token_hash theo session. Không thể suy credential từ browser_context_hash bị đọc lộ. Context không tự cấp quyền; bundle chứa nhiều grant độc lập server-side, một grant cho một phiên/store. Giữ context đã bootstrap hợp lệ qua verify để không mất grant/retry binding; context không nhận diện/hết hạn được thay bằng token mới do server sinh, không nhận token từ URL/body. Cookie không tên table_session: đó là scope_type của grant.
- Q5 được người dùng chấp thuận trong phiên23/10: mã128-bit base64url22ký tự/24giờ; guest grant tối đa12giờ và không vượt code expiry. Nhiều thiết bị có token_hash/grant riêng; verify lại không tạo thêm grant của cùng browser/phiên. Browser expiry30ngày không kéo dài grant; context hết hạn được thay mới, cần verify lại.
- Phiên closed atomically revoke mọi grant và xóa ciphertext delivery bằng trigger; expired/revoked không cấp quyền. Không có endpoint đóng/checkout ở task này; integration setup dùng trusted SQL để test status, không coi là settlement API.
- Postgres fixed60s buckets và advisory lock: browser+QR **5 sai/phút**; retry verify đúng không tính sai. QR1000/IP+QR300 attempts/phút soft ceilings; owner read120/write30 mỗi user/phút; resolve60/browser/QR/phút. Mọi limiter commit kể cả lỗi nghiệp vụ; trả429/Retry-After. Một browser sai5lần không khóa browser khác chung Wi-Fi. Global ceilings vẫn cần tune/load test; không cam kết chống DDoS chỉ bằng app limiter.
- IP chỉ đọc khi VERCEL=1 hoặc TRUST_PROXY_IP=true sau proxy ghi đè X-Forwarded-For; self-host không proxy thì không tin header client, dùng browser/QR caps. Không lưu raw IP. Không dùng in-memory Map làm rate limiter.
- `requireGuestTableSession(qrCode, guestRequestContext(request,false), {forWrite:true,expectedSessionId?})` trả server context `{storeId,tableId,sessionId,guestAccessId,browserContextHash,expiresAt}`. Scope lấy từ QR+grant DB, không tin tableId/storeId browser. `forWrite:false` cho checkout_pending read; mặc định true từ chối409. Không serialize context helper ra client. Phase3 vẫn phải recheck grant/session/table/store/menu/pause dưới transaction lock khi tạo đơn: helper riêng lẻ không chống TOCTOU cho command tương lai.

## Migration, env, seed và key lifecycle

`20261023000300_table_sessions_guest_access.sql` thêm table_sessions, guest_browser_contexts, guest_access, session_code_deliveries, operation_requests, outbox_events, security_rate_buckets. Không drop/rename Phase1. Same-store composite FK; unique live session open/checkout_pending; QR lookup unique public_code hiện hữu. RLS deny anon/authenticated trực tiếp cả bảng/RPC; chỉ service_role truy cập. Outbox chỉ metadata invalidation, chưa publisher/realtime.

`p2_execute` chạy action nguyên tử trong DB. Open lock operation→store→table; unique index chặn race; snapshot/result không plaintext credential. Resolve/verify lấy share locks QR/table/session để không phát quyền sau một concurrent close; close trigger thu hồi cùng commit. R11 grid/detail từ một materialized CTE/snapshot. RPC helper functions không SECURITY DEFINER và đã revoke PUBLIC execute; không cho browser truyền ownerId rồi tự gọi RPC.

```powershell
npm run supabase:start
npm run db:migrate
npm run db:seed
```

Migration runner/seed là **local**; remote phải admin apply SQL/migration theo history, không chạy lại foundation CREATE trên project đã có. Không tự remote push trong task. Seed giữ demo store/ba bàn Phase1, thêm hai table QR (Bàn01/02) và một takeaway bằng default UUIDv4 bỏ dấu gạch (122-bit entropy), serialize seed bằng advisory lock, chạy lặp giữ publicCode cũ. Không seed account/password/membership/sessioncode. Lấy QR thật qua R17 sau login hoặc trusted SQL:

```sql
select q.public_code, '/q/' || q.public_code as path, q.type, t.label
from public.qr_codes q left join public.dining_tables t on t.id=q.table_id
where q.store_id='c0200000-0000-4000-8000-000000000001';
```

Để thêm QR bàn khác bằng admin: INSERT ... SELECT id/store_id từ dining_tables đúng store, type='table', bỏ public_code để DB sinh random; kiểm NOT EXISTS để không thêm trùng khi chạy lại. Không dùng mock `table-05` như DB ID/credential. Chưa có route QR write R18 trong P2-C01.

Server env: Supabase URL/public key + SUPABASE_SERVICE_ROLE_KEY của cùng project; **TABLE_SESSION_ENCRYPTION_KEYS** là JSON keyring `{ "v1": "<32 random bytes base64>" }`, **TABLE_SESSION_ACTIVE_KEY_ID=v1**. Generate bằng Node crypto trong môi trường admin riêng; không dán key vào log/commit. Chỉ .env.example có tên/shape; Codex không sửa .env.local ở P2-C01. Missing/invalid key không fallback ephemeral: open500, build/resolve không cần key.

AES-256-GCM nonce96-bit mới mỗi artifact; AAD gồm purpose/generation1/store/table/session/owner/request. Giữ key trong secret store có backup/ACL; đổi active ID sang v2 nhưng giữ key v1 tối thiểu đến hết24giờ của artifact cuối đã tạo bằng v1. Xóa key cũ chỉ khi không còn delivery chưa hết hạn. Mất key không đọc lại code; không reset/rotate ngầm; liên hệ owner, phase sau qua close/settlement hợp lệ rồi mở mới. Không đổi TABLE_SESSION_ACTIVE_KEY_ID giữa các instance khi chưa phân phối keyring thống nhất. Không tái sử dụng key này làm Supabase/provider key. Không đảm bảo erasure tức thời trong backups.

Operational cleanup: xóa rate buckets sau resets_at khi không còn cần, contexts sau30ngày (xóa/revoke expired guest_access trước FK), expired ciphertext theo expires_at. Không purge operation/outbox history để né retry; giữ đến retention được chốt ở phase vận hành. Chưa có cron/publisher/monitoring trong task này.

## Gemini integration requests / kiểm chứng

- **CR-P2-01 và CR-P2-02 của P2_G01_UI_HANDOFF đã đáp ứng:** R01 reload giữ scope,429 có cả details và header.
- **UI_INTEGRATION_REQUEST P2-01:** `CustomerQRContainer.tsx` đang fallback fixture khi fetch lỗi/500/403 và verify thử mã demo sau lỗi không được xử lý. `q/[code]/page.tsx` truyền demoState không gate environment. Gemini tách preview sang dev-only/explicit preview, production giữ lỗi thật và không chuyển “verified” bằng mã demo. Backend không công nhận mock session; nhưng UI production acceptance còn chờ việc này.
- **UI_INTEGRATION_REQUEST P2-02:** owner tab Bàn chuyển fixture IDs sang R11/R17 DB UUID trước nối R12; hiển thị code chỉ từ private result. Không tạo read-current/rotate endpoint hay đoán PIN4. Menu vẫn fixture đến P2-C02, không báo có API menu thật.
- Source Gemini mới/P2_G01 report xuất hiện đồng thời; Codex chỉ đọc, không sửa UI/CSS/mocks/docs/design. Không có browser E2E/visual/hydration verification ở Codex task.

Kết quả command/check đầy đủ và giới hạn ở [P2_C01_REVIEW](P2_C01_REVIEW.md). Không blocker backend local; cần admin apply migration/env/keyring trên project đích trước smoke remote. P2-C02 tiếp theo: menu public và owner CRUD theo contract, không nối order/payment sớm.
