# State machines v0.1 — P0-C01

Mọi transition do backend kiểm quyền và current state trong transaction; UI không PATCH trạng thái tùy ý. Forbidden transition trả HTTP 409 `INVALID_STATE_TRANSITION`, trừ lỗi cụ thể bên dưới. Retry cùng command/key đã thành công trả kết quả cũ sau kiểm lại quyền. `types.ts` là nguồn literal enum; domain invariants ở `DOMAIN_MODEL.md`. **Delta v1-draft P0-C02** giữ nguyên enums; chi tiết endpoint/actions và changelog tại API_CONTRACT_V1.md/P0_C02_REVIEW.md.

## 1. OrderStatus

Giữ đủ enum của PRD §6: `pending_payment | accepted | preparing | ready | completed | cancelled | payment_exception`. `payment_exception` bổ sung so với danh sách đề xuất trong prompt vì PRD/ARCHITECTURE yêu cầu giữ riêng tiền về muộn/mismatch; không phải đơn chờ làm.

| Từ → đến | Ai kích hoạt | Điều kiện / tác dụng atomic | Lỗi khi không đạt |
|---|---|---|---|
| Không tồn tại → accepted | Guest dine-in qua backend | QR hợp lệ, guest scope phiên open, store nhận đơn, menu/giá hợp lệ; snapshot+order+ticket+audit/outbox cùng commit | INVALID_QR, SESSION_REQUIRED, SESSION_EXPIRED, SESSION_CHECKOUT_PENDING, STORE_NOT_ACCEPTING_ORDERS, OUT_OF_STOCK, PRICE_CHANGED |
| Không tồn tại → pending_payment | Guest takeaway qua backend | QR takeaway, không phiên; snapshot+order+intent pending, ticket/serviceDate/acceptedAt=null; tạo checkout ngoài DB lock | OUT_OF_STOCK, PRICE_CHANGED, STORE_NOT_ACCEPTING_ORDERS, VALIDATION_ERROR |
| pending_payment → accepted | Backend nhận webhook đã verify | Intent pending chưa expiry, ledger đúng reference/merchant/amount/VND; paid+ticket+pickup hash cùng commit | PAYMENT_MISMATCH, PAYMENT_EXPIRED; không lỗi nào được tự cấp ticket |
| pending_payment → payment_exception | Backend đã verify có bất thường | Sai tiền/currency hoặc success đến muộn, match được intent; evidence+intent exception; ticket vẫn null | PAYMENT_MISMATCH/PAYMENT_EXPIRED ở API đọc/command; webhook ACK theo adapter sau khi lưu evidence |
| pending_payment → cancelled | Backend expiry hoặc owner xử lý ngoại lệ | Recheck lock intent/order; chưa có payment success; giữ snapshot, không ticket. Default expiry Q2 | INVALID_STATE_TRANSITION, PAYMENT_PENDING nếu kết quả còn chưa rõ |
| cancelled (chưa ticket) → payment_exception | Backend webhook đã verify | Tiền đến sau hủy/expiry; không phục hồi đơn tự động, ghi evidence, không ticket | PAYMENT_MISMATCH/PAYMENT_EXPIRED; owner đối soát |
| accepted → preparing | Owner `claim-next` | Chọn accepted nhỏ nhất toàn quán; đủ điều kiện (takeaway paid). Không nhận orderId để vượt hàng | UNAUTHORIZED, FORBIDDEN, INVALID_STATE_TRANSITION; rỗng trả success data=null |
| preparing → ready | Owner đúng store | Toàn bộ đơn đã làm xong; check version/current state; audit/outbox | INVALID_STATE_TRANSITION |
| ready → completed (dine-in) | Owner đúng store | Xác nhận đã phục vụ đúng bàn; fulfillment=served. Không ép đã paid vì thanh toán cuối phiên | FORBIDDEN, INVALID_STATE_TRANSITION |
| ready → completed (takeaway) | Owner đúng store + pickup proof | Paid, verify code server-side, chưa consume; consume+complete cùng transaction, fulfillment=collected | INVALID_PICKUP_CODE, RATE_LIMITED, INVALID_STATE_TRANSITION |
| accepted/preparing/ready → cancelled | Owner ngoại lệ, không UI hành động thường | Có lý do/audit, xử lý tiền theo Q4; giữ nguyên ticket. Đây là contract cho ngoại lệ P1, không triển khai nút hủy/hoàn tiền trong P0 | INVALID_STATE_TRANSITION, FORBIDDEN |
| payment_exception → cancelled | Owner đối soát ngoại lệ | Giải quyết tiền theo Q4 và ghi lý do/evidence; không cấp ticket | FORBIDDEN, INVALID_STATE_TRANSITION |

Completed terminal. Cancelled không quay lại accepted; ngoại lệ duy nhất nêu trên là ghi nhận tiền đến muộn sang payment_exception khi chưa từng có ticket. Payment_exception không tự quay về accepted trong v0.1; xử lý thủ công không được giả webhook thành công. Callback failed/expired không hạ đơn đã accepted. Nếu đã ticket/paid mà có giao dịch lặp/sai tiếp theo, giữ order/payment success ban đầu, ghi anomaly ledger cho owner; không set payment_exception để làm mất ticket.

Order pending_payment có thể hiển thị payment failed/expired trong khoảng xử lý tác vụ expiry, sau đó cancelled; không được claim. Lỗi mạng adapter không phải bằng chứng failed: giữ pending và retry cùng intent/reference. Không tạo intent thứ hai ngầm.

## 2. PaymentIntentStatus và PaymentStatus

Intent chỉ dành takeaway, enum `pending | succeeded | failed | expired | exception`. `exception` là extension rõ ràng để biểu diễn nhánh reconciliation mà PRD yêu cầu và API payment trong ARCHITECTURE đã nêu. Đây không phải success.

P4-C04 runtime: paid là terminal nhưng có thể có review hold sau anomaly tài chính. Giữ `succeeded`/`paid` và ticket/status lịch sử; trả `paymentReviewRequired:true` trên takeaway summary/detail và `payment.reconciliationRequired:true`. Loại đơn held khỏi queue/counts chế biến, đưa vào exceptions; không claim/ready/giao món. Ready trả409 PAYMENT_REVIEW_REQUIRED; pickup complete tiếp tục gate PICKUP_NOT_ALLOWED. Lần đầu hold emit payment.review_required + version; không có API bypass/clear-review. Provisional provider status observation chỉ áp dụng pending, verified webhook success clear provisional flag; không biến query status thành xác nhận paid. Migration012 và bằng chứng local tại `docs/handoffs/P4_C04_CODEX_TAKEAWAY_E2E_QA_REPORT.md`; provider thật BLOCKED_PROVIDER_E2E.

| Intent từ → đến | Tác nhân | Guard / dữ liệu | Lỗi/ứng xử |
|---|---|---|---|
| Không tồn tại → pending | Backend create takeaway | Một intent/order, merchantRef unique, amount snapshot, expiry DB | DUPLICATE_REQUEST_CONFLICT nếu key đổi payload |
| pending → succeeded | Backend verified webhook | Merchant, amount, VND, ref, transaction ID đúng; check expiry dưới lock; ledger+accept+ticket cùng transaction | Mismatch/late → exception; signature sai từ chối, không ghi paid |
| pending → failed | Adapter backend xác nhận thất bại cuối cùng | Nguồn provider xác thực, không chỉ timeout/return URL | PAYMENT_PENDING khi chưa có kết luận |
| pending → expired | Tác vụ backend | DB time >= expiresAt, lock recheck chưa success; cancel pending order cùng transaction | Nếu webhook thắng trước thì giữ succeeded |
| pending/failed/expired → exception | Backend verified late/mismatch success | Lưu evidence, không tự queue; failed/expired đã chốt không tự trở lại pending/succeeded | PAYMENT_MISMATCH hoặc PAYMENT_EXPIRED |
| exception → exception | Backend evidence/owner đối soát | Append bằng chứng mới, không thay ledger đã có | Không tự nhận tiền hay cấp ticket |
| succeeded → succeeded | Backend duplicate/out-of-order | Dedupe event và transaction, no-op; giao dịch tiền mới thì ghi anomaly riêng | Không lùi failed/expired, không ticket thứ hai |

Failed/expired terminal đối với checkout tự động, ngoại trừ chuyển exception để bảo toàn bằng chứng tiền về muộn. Exception không tự thành succeeded; quy trình giải quyết Q4 chưa chốt. Invalid signature không ACK như sự kiện thanh toán hợp lệ; phản hồi theo tài liệu provider được chọn. DB failure phải cho provider retry, không trả success trước khi lưu xong.

`PaymentStatus` là trạng thái tiền tổng hợp của order/session, không phải `OrderStatus`:

| PaymentStatus | Nguồn chứng minh | UI label / intent |
|---|---|---|
| unpaid | Dine-in chưa settlement success | Chưa thanh toán; intentStatus=null |
| pending | Takeaway intent pending | Đang xác nhận thanh toán; intentStatus=pending |
| paid | Takeaway verified ledger+intent succeeded **hoặc** dine-in settlement succeeded | Đã thanh toán; takeaway intentStatus=succeeded |
| failed | Takeaway intent failed xác thực | Thanh toán thất bại |
| expired | Takeaway intent expired theo DB | Thanh toán hết hạn |
| exception | Takeaway intent exception, chưa accepted | Cần đối soát |

Dine-in: unpaid → paid chỉ khi owner ghi settlement thành công; thất bại thanh toán thủ công vẫn unpaid, không tự close. Takeaway: pending → paid/failed/expired/exception theo bảng intent; failed/expired → exception nếu có tiền bất thường; paid không lùi. Không có refund status trong v0.1 vì refund là P1/Q4; không gọi khoản đã hoàn là unpaid và không đoán paid từ completed. PaymentViewState.status dùng PaymentStatus; intentStatus giữ literal intent riêng. `statusLabel` phải khớp các bảng const trong types.ts.

User return URL chỉ mở màn refetch/poll đã kiểm scope; không được mutate order/payment/ticket. Provider status sync trong ARCHITECTURE cần chốt với yêu cầu webhook-only của P0-C01 ở Q1; default v0.1 chỉ webhook được chấp nhận làm trigger cấp ticket.

## 3. TableSessionStatus và settlement

| Từ → đến | Ai | Guard / atomic effects | Lỗi |
|---|---|---|---|
| Không tồn tại → open | Owner | Bàn active, cùng store, không có open/checkout_pending; sinh secret/hash, expiry | FORBIDDEN, INVALID_STATE_TRANSITION nếu đã có live session |
| open → checkout_pending | Owner bắt đầu thu tiền | Lock session; chặn submit, tính lại total từ non-cancelled snapshots, version snapshot | INVALID_STATE_TRANSITION |
| checkout_pending → open | Owner bỏ bước thu tiền | Chưa settlement success, không có lệnh thu đang chạy; hủy/fail settlement pending nếu có, tăng version | INVALID_STATE_TRANSITION |
| checkout_pending → closed | Owner xác nhận đã thu đủ tiền | Default Q6: mọi order non-cancelled completed; lock session + orders, recheck bill; settlement succeeded đúng total + close + revoke mọi session access + audit/outbox atomic | INVALID_STATE_TRANSITION, DUPLICATE_REQUEST_CONFLICT |

Không open→closed trực tiếp bỏ kiểm bill. **R13 v1** dùng action begin_checkout/cancel_checkout/confirm_received; confirm_received chỉ từ checkout_pending đã được persist, không tự gộp open→closed trong một command. Closed terminal, mã cũ vô hiệu dù TTL còn. Bàn trống sau đóng; mở lại là ID mới. Settlement success phải tăng order version/invalidate vì paymentStatus suy ra đổi sang paid, ticket/status giữ nguyên.

SettlementStatus: không tồn tại→pending khi chuẩn bị bill; pending→succeeded chỉ owner xác nhận thu đủ và close atomic; pending→failed nếu thao tác xác thực thất bại/hủy checkout. Failed terminal, thử lại bằng settlement attempt mới. Succeeded terminal và unique per session. Pending attempt không phải tiền đã thu, không mở lại khi command settle đang giữ lock. Session không có đơn vẫn có thể đóng với settlement succeeded 0 VND theo Q6, không gọi provider cho bill 0. Cancelled không tính tiền, không tự xóa ledger nếu từng thu tiền (Q4).

## 4. Fulfillment/pickup suy ra theo order

Không thêm queue bếp, station, shipment hay state machine DB độc lập. Không tồn tại lệnh cập nhật fulfillmentStatus trực tiếp.

| OrderStatus | dine_in fulfillment | takeaway fulfillment | Hành vi |
|---|---|---|---|
| pending_payment | Không hợp lệ | awaiting_preparation | Chưa vào hàng, chưa có ticket |
| payment_exception | Không hợp lệ | awaiting_preparation | Không làm món, owner đối soát |
| accepted | awaiting_preparation | awaiting_preparation | Chờ làm có ticket |
| preparing | preparing | preparing | Owner đã claim FIFO |
| ready | ready | ready | Có thể phục vụ / yêu cầu mã tại quầy |
| completed | served | collected | Dine-in đã phục vụ, takeaway đã verify+consume mã |
| cancelled | cancelled | cancelled | Không nhận/giao tiếp |

Mã nhận món là secret riêng, không phải ticket. Chỉ owner đã auth gửi mã người mua xuất trình để server verify; mã sai không đổi trạng thái, attempts/rate limit chống brute force. Retry cùng complete requestId trả thành công cũ dù mã đã consumed, sau khi kiểm quyền; key mới không được consume lần hai. V1 dùng PrivateOrderTrackingView riêng (R05 includePickup=true) cho buyer, không thêm pickupCode vào shared OrderDetail/list. P4-C03 triển khai HMAC verifier + ciphertext AES-256-GCM có ACL/TTL; GET không tạo mã. Credential cấp một lần sau paid, recovery qua job nội bộ; mã sáu số hạn 24 giờ, guest grant 12 giờ. Xem handoff P4_C03_CODEX_PICKUP_HANDOFF.md cho key lifecycle và bằng chứng local.

## 5. Transaction, idempotency và race cụ thể

### Submit/retry và counter

1. Verify quyền trước khi tìm/replay key. Normalize payload (option IDs sắp xếp, note chuẩn hóa có quy tắc) rồi fingerprint; không coi header/storeId client là quyền.
2. Unique `(storeId, clientRequestId)` giữ theo baseline. Replay chỉ khi **cùng browser context đã bootstrap trước submit và có grant của order/phiên**, cùng fingerprint và scope còn được phép; khách khác biết key không đọc được response. Cách bind trước POST này khôi phục được create khi response/Set-Cookie cuối bị mất. Không lưu/log secret trong fingerprint/result (proof dùng HMAC keyed). Khác payload cùng key→409 DUPLICATE_REQUEST_CONFLICT; principal khác→FORBIDDEN. Grant revoked không được hồi sinh qua replay.
3. Dine-in v1 lấy store admission gate trước session, recheck open và menu revision/menu trong transaction; serialize với cập nhật menu để snapshot giá/availability có điểm quyết định rõ. Lưu order/items, lock counter đúng ngày, tăng counter, acceptedAt bằng DB clock sau lock, audit/outbox, commit tất cả hoặc rollback tất cả. Gate cũng serialize claim và acceptance khác ngày.
4. ServiceDate được tính từ DB clock tại điểm acceptance, không từ lúc transaction bắt đầu. Nếu chờ counter qua boundary, recheck ngày, release/rollback và retry transaction ở ngày mới trước khi cấp; không lấy ngày cũ do transaction xếp hàng trước nửa đêm. Không dùng `MAX()+1`, sequence ngoài transaction hoặc client time. Ticket giữ nguyên qua retry/ngày mới.
5. Takeaway create kiểm quyền/menu revision tương tự nhưng chưa admission/counter. DB commit order+intent pending và browser-bound order grant trước khi gọi provider; dùng merchantRef/idempotency adapter để retry checkout ngoài lock, giữ cùng intent khi timeout. Response pending có thể chưa có checkoutUrl/qrPayload; UI chờ/refetch, không yêu cầu trả lần hai. V1 dùng MenuV1View/CreateOrderV1Input.menuRevision cho stale-menu handshake Q3 draft, không tin giá client.

### Duplicate/out-of-order webhook, expiry và tiền sai

Verify raw-body signature ngoài transaction; sau đó trong transaction dedupe event ID, lấy store admission gate trước intent rồi order, recheck expiry/state/amount/reference/currency, dedupe provider transaction ID. Success hợp lệ ghi ledger→counter→accepted/paid→pickup hash/delivery ciphertext→audit/outbox cùng commit. Dedupe hit chỉ no-op khi bản ghi xử lý trước đã commit; event đang processing hoặc transaction rollback vẫn phải retry. Event khác ID cùng transaction không tạo ledger/ticket thứ hai. Transaction ID đã thuộc intent khác→evidence/exception, tuyệt đối không gắn lại.

Expiry job cũng lock intent→order. Webhook thắng trước: expiry no-op. Expiry thắng trước: success muộn→exception, ticket null. Unknown merchantRef không được gán đại order: lưu protected webhook evidence, owner đối soát; không có guest DTO của một đơn đoán từ reference. Verified mismatch match được intent mới chuyển exception. Event failure đến sau success không hạ paid. Evidence/commit xong mới ACK; transient DB error trả retryable theo provider. Không gọi network khi giữ DB lock.

### Owner hai tab / fairness

Mỗi command có requestId; lấy store claim lock và kiểm operation_requests trong cùng transaction. Cùng requestId + actor/payload trả cùng kết quả, kể cả kết quả null. Hai requestId khác nhau từ hai tab được serialize và có thể claim **hai đơn liên tiếp**, không phải trùng một đơn; đây là hai thao tác khác nhau, UI chỉ chống double-click cùng command. Claim đọc accepted nhỏ nhất `(serviceDate, ticketNo, id)` không SKIP LOCKED, không nhận orderId/status filter từ client. Đơn đã accepted ở transaction chưa commit chỉ có hiệu lực sau commit; counter lock giữ thứ tự giữa các accept đồng ngày. Claim không bao giờ thấy ticket sau đã commit trong khi ticket trước cùng ngày còn chưa commit. Version/expected current state chặn ready/complete từ stale tab. Hoàn thành không bắt buộc FIFO.

### Gọi thêm đúng lúc quyết toán

Submit và checkout/settle đều lock TableSession trước khi chạm các order của phiên. Submit thắng: order/items/ticket commit rồi checkout tính bill mới. Checkout thắng: status checkout_pending commit, submit bị 409 SESSION_CHECKOUT_PENDING; closed trả 410 SESSION_EXPIRED. Owner quay về open chỉ nếu chưa settlement success. Settlement khóa lại session, orders và attempt, tính lại bill; không tin tổng UI. Nếu mọi guard đạt, settlement success + close + revoke + operation result commit cùng nhau. Retry cùng settle requestId không thu/ghi settlement lần hai.

Lock order v1: operation reservation (nếu có) → store admission/claim/metadata row (accept/claim/menu/QR/settings mutation) → session (dine-in/settle) hoặc intent (takeaway/expiry) → order → menu revision/menu rows theo ID khi cần → counter → audit/outbox. Webhook lấy gate **trước** intent; claim không lock intent/counter. Expiry/settle không quay lại lấy gate sau resource lock. Menu CRUD lấy store row trước menu rows, không khóa order theo chiều ngược. Deadlock/serialization failure retry bounded cùng key; unique constraints là chốt cuối. Concurrency tests phase sau, không khẳng định đã thử race thực tế. Chi tiết boundary tradeoff và test plan ở SECURITY_AND_CONCURRENCY.md.

## 6. Lỗi và rendering

Envelope giữ ARCHITECTURE: `{data: T, error: null}` hoặc `{data: null, error: {code, message, details?}}`. Không thêm cờ success khác. Các code mới tối thiểu: SESSION_CHECKOUT_PENDING để phân biệt đóng/đang thu, VALIDATION_ERROR cho input không hợp lệ, STORE_NOT_ACCEPTING_ORDERS cho tạm ngừng.

| HTTP | Code |
|---|---|
| 400 | VALIDATION_ERROR |
| 401 | UNAUTHORIZED (owner chưa login/thiếu credential bắt buộc) |
| 403 | FORBIDDEN, SESSION_REQUIRED |
| 404 | INVALID_QR, ORDER_NOT_FOUND, RESOURCE_NOT_FOUND (che tài nguyên ngoài scope) |
| 409 | SESSION_CHECKOUT_PENDING, OUT_OF_STOCK, PRICE_CHANGED, PAYMENT_PENDING, PAYMENT_MISMATCH, INVALID_STATE_TRANSITION, DUPLICATE_REQUEST_CONFLICT, STORE_NOT_ACCEPTING_ORDERS |
| 410 | SESSION_EXPIRED, PAYMENT_EXPIRED |
| 422 | INVALID_SESSION_CODE, INVALID_PICKUP_CODE, VALIDATION_ERROR cho semantic input hợp schema |
| 429 | RATE_LIMITED (details.retryAfterSeconds) |
| 500 | INTERNAL_ERROR (không trả trace/raw provider body) |

API đọc payment pending thường trả **200 PaymentViewState**; PAYMENT_PENDING 409 chỉ khi command đòi tiền đã xác nhận. Owner queue chỉ accepted/preparing/ready, gồm cả hai loại, đã sort theo serviceDate/ticket; pending/exception ở bộ lọc ngoại lệ riêng, không giả ticket đang chờ. Dine-in hiển thị unpaid vẫn được chế biến. UI nhãn/step từ code+type; loading/empty/offline/reconnect/submitting là state cục bộ, không thêm enum DB. Table QR chưa verify cần form; authenticated QR phiên checkout_pending được xem thông tin nhưng không submit. Sẵn sàng tại bàn và sẵn sàng tại quầy cùng ready, hoàn tất suy ra served/collected.

## P2-HF01 PIN generation amendment

P5-C01 implementation: begin creates an immutable `session_checkout_snapshots` record, not a pending payment. Only `confirm_received` creates a successful `session_settlements` ledger row. No failed financial record is invented for a cancelled checkout; all begin/cancel/confirm actions have append-only audit. See [P5_SESSION_BILLING.md](P5_SESSION_BILLING.md). Financial version excludes fulfillment transitions; final settlement also checks the exact prepared financial snapshot and all noncancelled orders completed. Zero-VND sessions retain Q6 behavior.

P5-HF01: successful confirm commits one immutable paid receipt and scoped historical read grants together with close/revoke/audit/outbox. `closed` still forbids ordering; `receipt:read` remains valid only for its proven browser/session within receipt TTL. Closed without a successful ledger is never paid. Checkout cancel creates no receipt. [Historical read contract](P5_CLOSED_SESSION_RECEIPTS.md).

While session.status=open, explicit owner conversion/rotation atomically changes PIN generation and session.version without a status transition; new PIN differs from prior PIN. Existing guest grants/orders persist. Fresh PIN verify is denied during checkout_pending; existing grants still allow reads, with dine-in writes denied as before. Closed sessions cannot reveal/rotate/verify and cannot be reopened; new session receives independently generated PIN/ciphertext. Replay of an older generation is rejected rather than exposing an obsolete PIN.
