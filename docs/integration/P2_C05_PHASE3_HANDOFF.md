# P2-C05 → Phase 3 — server/domain handoff

23/10/2026. **Phase 3 NOT_READY** theo [quality gate](P2_C05_CODEX_READINESS.md). Tài liệu này hướng dẫn phần triển khai tiếp theo; chưa tạo order, FIFO, payment hay realtime trong P2-C05.

## 1. Nguồn contract và ranh giới

Nguồn chính: `docs/contracts/types.ts`, API_CONTRACT_V1, SECURITY_AND_CONCURRENCY, STATE_MACHINES, menu/cart addenda và C04 lifecycle contract request. Dùng type imports `@contracts`, không copy lại DTO từ ví dụ UI. Handoff G05 có ý định UX hữu ích, nhưng OrderDetail/payment types rút gọn, persistence/TTL minh họa không ghi đè canonical model.

Giữ guest/owner, một customer route `/q/[code]`, dashboard4 tabs. Dine-in Phase3 nhận ticket sau create hợp lệ; takeaway Phase4 chỉ nhận ticket sau verified payment. Không thêm màn hình nhân viên/bếp riêng hoặc endpoint trùng contract.

## 2. Guest context server-side hiện có

Entry points:

```ts
import { guestRequestContext } from '@/server/security/request-context';
import { requireGuestTableSession } from '@/server/table-sessions/service';
```

- R01 tạo opaque HttpOnly browser cookie trước submit; server lưu hash, bundle grants độc lập. Cookie rỗng không có quyền order. R02 verify code đúng mới cấp grant session; R03 browse menu không cấp quyền submit.
- Handler cần `guestRequestContext(request, false)` khi không cho phép bootstrap bằng POST. Dine-in gọi `requireGuestTableSession(qrCode,context,{forWrite:true})` để lấy `storeId,tableId,sessionId,guestAccessId,browserContextHash,expiresAt` do server xác minh.
- Helper gọi RPC trong transaction riêng, **không giữ lock qua transaction tạo order**. Kết quả là prerequisite; order transaction phải resolve/recheck toàn bộ dưới lock tại thời điểm commit. Không gọi helper xong coi context không thể thay đổi.
- QR type/mode/store/table lấy từ DB. Không nhận isVerified/storeId/type/tableSessionId trong payload để chọn tenant hay bypass grant.
- Verify/cookie không lộ plaintext credential JSON ngoài R12 private code delivery. Không đưa session code/guest token vào localStorage, sessionStorage, URL, logs, audit hay outbox.
- Grant tối đa12h, không vượt code expiry24h; revoke/expiry/closed không được hồi sinh từ cookie. New session cùng bàn là ID mới và phải verify lại. Checkout-pending cho browse/read, write409 SESSION_CHECKOUT_PENDING. Closed/revoked/expired xử lý theo canonical errors, không mở lại phiên bằng mã cũ.
- Takeaway không cần table grant, nhưng vẫn cần browser context đã bootstrap để bind idempotency và order-read grant. QR public/UUID/key/ticket không phải credential.

## 3. Cart snapshot và submission command

Phase2 facade tại `@/features/cart`: `createCartStore`, `useCart`, `getCheckoutReadiness`, `prepareOrderDraft`. Snapshot draft chỉ xuất khi fresh/review hợp lệ; `ready_to_review` không phải server authorization.

```ts
type OrderDraft = Omit<CreateOrderV1Input, 'clientRequestId'>;
// qrCode, menuRevision, items: CartLine[], note
```

Phase3 mới tạo immutable command `CreateOrderV1Input` từ draft và thêm clientRequestId(UUID), ví dụ minh họa:

```json
{
  "qrCode":"example-public-qr",
  "clientRequestId":"c0500000-0000-4000-8000-000000000003",
  "menuRevision":"opaque-revision-from-R03",
  "items":[{
    "menuItemId":"c0500000-0000-4000-8000-000000000004",
    "quantity":2,
    "optionIds":[],
    "note":null
  }],
  "note":null
}
```

Không gửi giá client, labels, totals, storeId, type, tableId/sessionId, status, paymentStatus hay ticket. Top-level note Phase2 hiện null; line note transient trong RAM. Snapshot client không chứng minh menuRevision/QR/session vẫn còn hợp lệ.

Giữ nguyên clientRequestId + payload cho uncertain retry/network/500; không sinh key mới chỉ vì timeout. Server same key/different normalized payload409 DUPLICATE_REQUEST_CONFLICT, cùng key/đúng browser replay cùng result. Nếu người dùng sửa draft sau409 PRICE_CHANGED/OUT_OF_STOCK, refetch R01/R03, reconcile và yêu cầu xác nhận rồi mới tạo command mới.

**Persistence cần quyết định trước triển khai reload retry:** cart storage v1 hiện không persist note text và chưa có pending command/key. Không tự làm theo G05 gợi ý lưu toàn payload/notes vào sessionStorage. Phải có thiết kế giữ immutable fingerprint/key và khôi phục đúng payload mà không làm mất privacy; RAM-only retry có giới hạn khi reload cần UI hướng dẫn. Nếu không khôi phục đúng command, không lặng lẽ tạo đơn mới. Xóa browser cookie làm mất binding; biết requestId không đủ để nhận lại order.

## 4. Transaction tạo dine-in order phải bảo toàn

Thiết kế dưới đây chưa được triển khai. Review thống nhất lock order với resolver/menu/lifecycle trước viết migration; không lắp các helper RPC rời thành chuỗi được coi là atomic.

1. Strict input validation theo R04, unknown fields/size limits; UUID/id format,1–100 lines, quantity1–99, notes<=500, option IDs distinct/đúng item. Required-option/group policy chưa có; không invent.
2. Authenticate browser, resolve trusted tenant, bind command scope/browser; kiểm idempotency unique key và normalized fingerprint. Duplicate đúng key được replay trước nghiệp vụ thay đổi nhưng vẫn kiểm caller/binding. Key khác payload conflict, không order thứ hai.
3. Serialize với store/menu write gate trước khi lấy bàn/QR/phiên. Migration006 resolver giữ bàn → QR → phiên; lifecycle owner store → bàn → QR. Locator QR chưa khóa không thể dùng làm quyền. Dưới lock reread QR active/not retired, table active, same-store identity và accepting_orders.
4. Khóa session và kiểm grant/proof/expiry/revoke/session status đúng bàn. Serialize submit với begin_checkout/settle trên cùng session lock: submit thắng thì bill có order mới; checkout thắng thì reject, không ticket. Không dựa context client hoặc helper vừa gọi ở transaction trước.
5. Kiểm menuRevision và đọc category/item/options cùng store dưới serialization gate. Item/category active, available; option active/available/thuộc item. Định giá lại nguyên VND từ DB, kiểm overflow/max và chính sách zero-total checkout theo contract cần chốt; không tin subtotal preview.
6. Ghi immutable item/option/name/price/quantity/note snapshots; totals server. Xác định serviceDate bằng store timezone và DB acceptance time, không ngày client.
7. Ticket counter unique `(store_id,service_date)` có lock/upsert atomic; increment đúng một lần. Insert accepted order + ticket/serviceDate/acceptedAt + payment unpaid + fulfillment awaiting_preparation, version/updatedAt, grant đọc order, audit/outbox và operation result trong **cùng transaction**.
8. Commit rồi trả201 canonical OrderDetail; replay201 cùng ID/ticket/result, không tăng counter/version hay tạo grant ngoại scope. Không network provider call trong transaction khóa.

DB constraints cần hỗ trợ, không chỉ app check: tenant composite FKs, một order cho scope idempotency đã chọn, unique ticket/store/date, ticket-null coherent state, nonnegative safe integer money, order/item option scope. Idempotency tuple/fingerprint exact phải theo API/security canonical, không dùng `(requestId)` đơn lẻ hoặc cho client tự chọn store.

Tại Phase2 chưa có các bảng/constraint trên. Không báo đã có chỉ vì migration sessions/menu/lifecycle có operation_requests.

## 5. Takeaway và FIFO

- Takeaway pending_payment chưa có ticket/serviceDate/acceptedAt và chưa vào queue. Provider reference/intent phải ổn định qua retry; payment instructions có thể pending/null.
- Phase4 webhook xác minh chữ ký/raw payload, merchant/reference/amount/currency/expiry; durable dedupe event và transaction; verified payment + ledger + accepted + ticket + pickup credential + outbox atomic. Client return URL/countdown không set paid hoặc cấp ticket.
- Payment expiry đọc expiresAt server;10 phút trong G05 là ví dụ, chưa chốt TTL từ handoff. Không thêm countdown cứng vào nghiệp vụ.
- Claim-next canonical R08 phải chọn FIFO bằng DB, serialize concurrent owners và không skip head đang khóa chỉ để nhận đơn sau. Pending/exception không có ticket không tham gia queue. Có version/idempotency cho transitions theo contract.
- Pickup proof chỉ private buyer scope, không generic OrderDetail/owner list. Complete takeaway cần transient proof; không đưa code vào logs/operation result. Dùng canonical PrivateOrderTrackingView khi cần pickup.

## 6. API/client/UI tiếp theo

R04 POST `/api/public/orders` →201 OrderDetail; R05 tracking/private projections; R07 owner orders; R08 claim-next; R09 ready; R10 complete. Các endpoint **chưa tồn tại** trong Phase2. Tên hàm G05 là đề xuất, không phải API đã export. Theo convention hiện tại typed client trả data trực tiếp, MenuApiError cho API error; không trộn `Promise<ApiResponse<T>>` vào component đang chờ data.

Không tự copy paymentStatus union của G05 (`refunded`) vào frozen type; canonical hiện unpaid/pending/paid/failed/expired/exception. OrderDetail là discriminated union với ticket/status/payment invariants, không interface mọi field optional. Dùng labels canonical; không hiển thị trạng thái payment/fulfillment suy đoán từ UI.

Trước bật submit: sửa UI-01–04 ở readiness, đặc biệt edit cart không làm mất quantity và immutable command retry. Lúc201 mới clear cart/chuyển tracking; network error giữ intent và pending command. Refetch/invalidation theo resource scope và version, không cache grant. Không cần triển khai realtime sớm để che refresh logic sai.

## 7. Test bắt buộc khi triển khai Phase3

- R04 dine-in cần grant; cookie bàn A/QR B, tenant khác, expired/revoked/new session, checkout race đều reject và không order/counter row thừa.
-20 concurrent same-key creates/replays →1 order/1 ticket/1 operation result; lost response retry khôi phục đúng browser; wrong browser/payload không leak.
- Concurrent new orders cùng store/date → unique monotonic tickets; store/date rollover timezone; failure cuối transaction rollback counter/order/snapshots/outbox.
- Menu price/availability/option mutation race → consistent snapshot/revision hoặc canonical conflict; no stale client pricing.
- Begin checkout vs submit/settle dùng lock thống nhất, không deadlock ở test DB thật; timeout/fault không partial acceptance.
- Tracking chỉ đúng guest grant; owner membership/tenant guard; no code/token leakage/caching. HTTP production-mode cookie flags và real browser reload/retry acceptance.
- Takeaway chưa paid không ticket/claim; verified webhook duplicate/out-of-order/late/mismatch test ở Phase4, không mock để khẳng định concurrency.

Gate còn chặn: browser acceptance, UI findings, quyết định close-session/option contract gap và kiểm chứng Production thực tế. Người dùng báo lỗi migration đã ổn nhưng chưa có actual diagnostic JSON; không triển khai Production tự động từ tài liệu này.
