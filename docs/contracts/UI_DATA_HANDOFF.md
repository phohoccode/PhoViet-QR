# UI data handoff — P0-C02

**Delta P2-C02:** R03/R14/R15/R16 và category CRUD đã có backend local; xem [MENU_ADDENDUM](P2_C02_MENU_ADDENDUM.md) và [integration handoff](../integration/P2_C02_MENU_HANDOFF.md). Các dòng “chưa có API/category CRUD” bên dưới mô tả checkpoint P0, không thay trạng thái implementation mới. Không suy ra remote/UI/browser acceptance từ local tests.

`contractVersion: v1-draft` · Cập nhật 23/10/2026 · Trạng thái: **READY cho mock UI theo draft; chưa có API runtime; production integration còn gate bên dưới**.

Đọc API_CONTRACT_V1.md, types.ts, EXAMPLES.md và P0_C02_REVIEW.md theo bộ cùng version. JSON trong API là request/response đầy đủ đã gắn type, không dùng pseudo DTO trong P0-G01 làm schema production. Codex chỉ sửa `docs/contracts/**`; P0-G01 chỉ đọc. Gemini sở hữu presentation/mock trong phase được giao, không sửa contract/logic/FIFO.

## 1. Mỗi vùng UI dùng dữ liệu nào

| Vùng UI / P0-G01 ID | Endpoint tối thiểu | Type và field cần dùng | State / giới hạn |
|---|---|---|---|
| Customer Menu / SCR-C01 | R01 QR resolve → R02 verify nếu table → R03 menu | QRResolution: store.name/timezone/acceptingOrders, mode, table.label, requiresSessionCode, session.status; MenuV1View: categories, items, menuRevision, serverTime | Loading/empty/error; available=false disable thêm; không hiển thị mã phiên lấy từ resolve |
| Item detail / SCR-C02 | Dùng dữ liệu R03, không endpoint chi tiết món mới | MenuItem.options: MenuOption.id/name/priceDeltaVnd/available; description/imageUrl nullable | Chỉ options cộng thêm; size/sugar bắt buộc/radio groups chưa có contract, giữ note hoặc yêu cầu CR |
| Cart / SCR-C03 | State cục bộ từ R03; lỗi R04 refetch R03 | CartLine.menuItemId/quantity/optionIds/note, note chung nullable; revision lần xem menu | Tổng client tạm tính, không authority; empty/offline; PRICE_CHANGED/OUT_OF_STOCK giữ cart và xin xác nhận |
| Dine-in Checkout / SCR-C04 | R04 CreateOrderV1Input, sau đó R05 | qrCode/clientRequestId/menuRevision/items/note; response OrderDetail.type/status/ticketNo/serviceDate/table/lines/totalVnd | Submitting disable nút; accepted mới thành công; scope phiên/cookie không JSON token |
| Takeaway Payment / SCR-C05 | R04 → R06 intent snapshot → R05 order snapshot | TakeawayPaymentViewState.status/intentStatus/amountVnd/currency/expiresAt/checkoutUrl/qrPayload; R05 ticketNo/status | Pending instructions có thể null, hiển thị chờ adapter; không hardcode provider/link/15 phút. MerchantRef/bank details chưa được trả |
| Tracking / SCR-C06 | R05 mặc định OrderDetail; R05 includePickup=true cho buyer takeaway | id/type/status/statusLabel/paymentStatus/fulfillmentStatus/ticketNo/acceptedAt/lines/updatedAt/version; PrivateOrderTrackingView.order/pickup | Ticket gate bên dưới. Code chỉ projection buyer, null trước paid/terminal/expired; không dùng code làm token |
| Owner Orders / SCR-OWN-01 | R07 list+orderId detail; R08 claim; R09 ready; R10 complete | OwnerOrdersView.orders/detail/counts/nextCursor; OrderDetail.lines/note/payment; requestId/expectedVersion | Queue khác exceptions/history. Không bắt đầu per-card; không lấy count từ trang đang mở. Owner nhập pickup proof, server verify |
| Owner Tables / SCR-OWN-02 | R11 tables?tableId; R12 open; R13 begin/cancel/confirm settle | OwnerTablesView.tables/detail, TableSessionDetail.session/orders; OwnerSessionOpenedView.sessionCredential **private**, SettleSessionView | Grid không mã phiên. Mở mới nhận mã qua command; mã cũ đọc/rotate chưa có route; bill server và checkout_pending |
| Owner Menu / SCR-OWN-03 | R14 read, R15 create, R16 patch | OwnerMenuView.categories/items/menuRevision; OwnerMenuItem.active vs available; request DTO null đúng schema/expectedUpdatedAt | Update thành công mới đổi switch confirmed; stale409 refetch. No upload/category CRUD API giả |
| Owner Settings / SCR-OWN-04 | R19/R20 settings, R17/R18 QR | StoreSettingsView.store/paymentProvider/updatedAt, QRCodeView.path/publicCode/table/active; metadata không secret | Pause chỉ new order; provider=null hợp lệ. No provider-key form; PDF/probe/address/logo là CR, không thêm route vì wireframe |
| Owner Login / SCR-OWN-00 | Supabase Auth phase sau | Session auth, owner_members kiểm server | Ngoài 21 route draft; không thêm AuthCredentials có password vào shared response/types/examples |

## 2. API response → type → UI view state

UI trạng thái cục bộ không thêm enum DB. Không dịch status thành ý nghĩa ngược với trạng thái tiền.

| Response / tình huống | Type / field chuẩn | UI view state và hành vi |
|---|---|---|
| Chưa có response GET/POST | Không DTO giả | loading/submitting, skeleton/disable command; không fake ticket |
| 200 items=[], orders=[], tables=[] | MenuV1View / OwnerOrdersView / OwnerTablesView | empty theo ngữ cảnh; claim null cũng là empty success |
| 200 QR table requiresSessionCode=true | QRResolution | session_required form; verify R02, không đặt trước |
| 201 order pending_payment hoặc R06 pending | OrderDetail + TakeawayPaymentViewState.status=pending, intentStatus=pending | pending: chưa vào hàng, không ticket; instruction null→đang tạo, có QR/link mới hiển thị tương ứng |
| R06 paid nhưng R05 chưa refetch | PaymentStatus=paid, intentStatus=succeeded | pending đồng bộ snapshot, refetch R05; chưa tự dựng ticket |
| R05 accepted, valid ticket và payment guard | OrderDetail.status=accepted | accepted/Chờ làm, dùng backend ticket. Dine-in unpaid hợp lệ |
| R05 preparing | OrderDetail.status/preparing, fulfillmentStatus=preparing | preparing/Đang làm; owner chỉ ready |
| R05 ready | OrderDetail.status=ready, fulfillmentStatus=ready | ready/Sẵn sàng; dine-in phục vụ bàn; takeaway yêu cầu code buyer trình ra |
| R05 completed | OrderDetail.status=completed | completed; dine-in served/Đã phục vụ, takeaway collected/Đã giao |
| R05 cancelled | OrderDetail.status=cancelled | cancelled; không coi cancelled là đã refund, không tự tạo intent thay thế |
| 200 R06 expired hoặc 410 command expired | PaymentViewState.status=expired / ApiFailure | expired; refetch kết quả cuối, giữ thông báo không chuyển tiền lần hai, không auto-retry new payment |
| 200 R05 payment_exception/R06 exception | OrderStatus.payment_exception, PaymentStatus.exception | error/needs_reconciliation, không queue hoặc button cấp số |
| 410 SESSION_EXPIRED | ApiFailure | phiên hết hiệu lực, giữ cart, owner hỗ trợ phiên mới; không alias SESSION_CLOSED |
| 409 SESSION_CHECKOUT_PENDING | ApiFailure | đang thu tiền, disable submit mới, giữ cart |
| Không có mạng/timeout/WS disconnected | State local; version snapshot cũ | offline/reconnecting: cảnh báo dữ liệu cũ, không set failed/paid; reconnect GET/replay cùng key |
| 400/401/403/404/409/422/429/500 | ApiFailure/ApiError.details allowlist | error theo bảng lỗi API; không 200 fake failure/success; 429 backoff |

Canonical labels ở ORDER_STATUS_LABELS/PAYMENT_STATUS_LABELS. “Đã nhận đơn” có thể là nhãn step customer cho accepted, không map completed thành accepted. PaymentStatus.paid là aggregate, PaymentIntentStatus.succeeded là raw intent; không so `payment.status==='succeeded'` ở v1.

## 3. Sự kiện / ý định → hành động hợp lệ → endpoint

| Sự kiện/ý định | UI action hợp lệ | Endpoint / guard |
|---|---|---|
| Quét QR table chưa grant | Resolve, yêu cầu code rồi verify | R01→R02, code gửi body không URL query |
| Thêm/sửa giỏ | Cập nhật CartLine cục bộ, tính tạm theo menu | Không gọi API tiền/không ghi giá authoritative |
| Xác nhận gọi món / tạo payment | Persist input+UUID+revision trước gửi, disable repeated button | R04; cùng command retry cùng key, không UUID mới vì timeout |
| Reload có pending create command | Khôi phục input/key, POST lại với cookie đã bootstrap | R04 replay; có id thì GET R05, không find-by-key public |
| Return URL provider / đồng hồ hết giờ | Refetch payment/order, giữ pending nếu DB chưa kết luận | R06→R05; không endpoint client set-paid/expire |
| order.accepted/preparing/ready/completed | Invalidate/refetch snapshot đúng scope | Customer R05; owner R07 với orderId; không patch state từ event payload |
| payment.updated | Refetch intent + order | R06/R05, gate ticket theo snapshot order |
| table_session.updated/closed | Refetch tables, khóa form nếu guest scope revoked | R11 owner; guest R01/R05 theo scope, xử lý 410; không mở lại phiên cũ |
| Owner bấm Nhận tiếp | Sinh một requestId/command, retry giữ ID | R08, không truyền orderId hoặc filter đang chọn |
| Owner bấm Sẵn sàng | Gửi version đúng snapshot, đợi response | R09 preparing→ready; 409 refetch |
| Owner giao dine-in | Xác nhận phục vụ đúng bàn | R10 type=dine_in, chỉ ready, không cần paid trước |
| Owner giao takeaway | Nhập code khách xuất trình, gửi server, xóa proof khỏi memory form sau xong | R10 type=takeaway, code required; không bỏ verify, không render code có sẵn trên owner list |
| Owner bắt đầu / bỏ thu tiền | Command action rõ ràng, chờ bill | R13 begin_checkout / cancel_checkout; mỗi ý định mới requestId riêng |
| Owner xác nhận đã thu đủ | Gửi method, expectedVersion, không tổng client | R13 confirm_received, response close/revoke; failed guard không hiện đã thu |
| Owner đổi menu/QR/settings | Đợi success rồi render snapshot confirmed, giữ input nếu lỗi | R15/R16/R18/R20, idem command/CAS |
| WebSocket reconnect/tab visible | Full re-fetch từ page đầu, dedupe IDs và version | GET đang dùng; polling fallback jitter/backoff, không sinh command mới |

Optimistic **giỏ cục bộ** được phép; status tiền/ticket/claim/settlement không optimistic success. State HTTP 500/timeout chưa chứng minh command thất bại: retry cùng key. Replay snapshot cũ không overwrite version mới đã có. RequestId chỉ giữ React state chưa đủ qua reload: persist draft command không secret, cleanup sau khi lấy kết quả chắc chắn.

## 4. Ticket, số tiền, ngày giờ và private credentials

- Dine-in accepted phải ticket nguyên dương, serviceDate/acceptedAt có giá trị. Takeaway pending_payment/payment_exception luôn ticket/serviceDate/acceptedAt=null.
- Chỉ show ticket takeaway khi snapshot server có `paymentStatus==='paid'`, ticket integer>0 và status thuộc accepted/preparing/ready/completed (cancelled có thể show ticket lịch sử với badge hủy rõ ràng). `R06 paid` riêng lẻ, QR scan, redirect hoặc timer không đủ.
- OrderDetail.lines là snapshot với name, quantity, options[].name/priceDeltaVnd, unitPriceVnd/lineTotalVnd. Không rename thành items/qty/nameSnapshot trong wire DTO. Nối categoryName từ categories bằng categoryId, không yêu cầu duplicate field.
- Tiền: `Intl.NumberFormat('vi-VN', {style:'currency',currency:'VND',maximumFractionDigits:0})`. Không chia 100. Input giá editor parse số nguyên và server validate; không gửi chuỗi “29.000 đ”.
- ISO server UTC hiển thị theo store.timezone, ngày kinh doanh serviceDate giữ literal server. Ticket reset ngày mới có thể trùng số ngày cũ nên luôn giữ serviceDate trong identity/context. acceptedAt/createdAt để thời gian chờ, không sort FIFO bằng clock client.
- Timer = max(0,expiresAt−mốc giờ server + elapsed monotonic), refetch khi về zero. TTL C01=10 phút/G01=15 phút chưa chốt; không hardcode vào mock behavior. Không auto “Tạo lại QR” khi còn chưa rõ tiền cũ.
- Pickup code chỉ buyer projection PrivateOrderTrackingView, riêng với cookie/token access và ticket; không default OrderDetail/OwnerOrdersView/TableSummary/QR public. Owner form chỉ nhập proof, R10 verify; không input “tự xác nhận không có mã”.
- Session code chỉ private result R12, không ở TableSummary.session/currentSession/public header từ API. Giao mã cho khách qua owner thao tác được ủy quyền; read/rotate lại cần CR bên dưới. Không đưa code vào URL query hoặc analytics/logs/screenshot công khai.

## 5. Đối soát P0-G01 và CONTRACT_REQUEST

Không sửa docs/design. **ACCEPTED DRAFT** nghĩa kỹ thuật đã có chỗ trong contract để mock, không nghĩa owner đã duyệt chính sách. **BLOCKER** ghi mốc chặn cụ thể, không báo cả P0-C02 bị dừng nếu phần tài liệu đã hoàn tất.

| ID / nguồn yêu cầu | Phân loại | Quyết định / Gemini dùng gì / người chốt |
|---|---|---|
| CR-UI-01 SCREEN_INVENTORY §2.1 categoryName/MenuItemOption.active/optionals | READY | Dùng categories join; MenuOption.available; description/imageUrl/note nullable, options luôn array. Không tự copy pseudo interfaces |
| CR-UI-02 §2.3 publicId/items/qty/tableLabel/serviceDate nonnull/payment.status=succeeded | READY | publicId alias UI của id; lines/quantity/table.label; serviceDate null trước ticket; payment.status=paid, intentStatus=succeeded. Không đổi route hoặc field gốc |
| CR-UI-03 SCR-C05 merchantRef/bank account/manual copy payment data | OPEN / BLOCKER trước Phase 4 instruction UI thật | v1 đã có amount/expiry/checkoutUrl/qrPayload nullable; chưa provider nên không bịa manual bank details. Owner chọn provider, Codex kiểm adapter rồi bổ sung DTO nếu cần; không endpoint mới |
| CR-UI-04 G01 OQ §3 TTL15/new QR và C01 Q2 TTL10 | ASSUMPTION / BLOCKER trước Phase 4 expiry policy | UI chỉ đọc expiresAt; default C01 10 phút chưa duyệt. Hết giờ refetch, không API regenerate/cancel payment. Owner chọn TTL sau kiểm provider; Codex cập nhật |
| CR-UI-05 TableSummary.currentSession.sessionCode + wireframe mã phiên/QR động | ACCEPTED DRAFT một phần; OPEN trước hỗ trợ đọc/rotate mã | Dùng session, grid không code; R12 private command delivery có code. Muốn đọc/rotate lại không giả hash đọc được; tái sử dụng action route session phải review riêng, không thêm API trong task. Dynamic QR query code bị từ chối; UI nhập code từ owner |
| CR-UI-06 PickupCredential?/pickupCode + wireframe “Opaque guest access token” | ACCEPTED DRAFT projection; BLOCKER Q5 trước Phase 4 | R05 includePickup=true trả PrivateOrderTrackingView riêng; code khác access cookie. R10 proof bắt buộc, không bỏ verify bằng mắt. Cần owner/security chốt entropy/TTL/encrypted delivery hoặc phương án phục hồi trước live |
| CR-UI-07 G01 OQ §7 SESSION_CLOSED/HTTP400/409 | READY | Giữ SESSION_EXPIRED HTTP410 từ C01; checkout_pending409; không thêm SESSION_CLOSED. Closed chỉ mở phiên mới, không “reopen” ID cũ |
| CR-UI-08 Settings address/logo/PDF/download/probe/payment-health | OPEN, không thuộc API hiện tại | name/acceptingOrders/store timezone read-only + QR path + last verified metadata đủ phần cốt lõi. Browser QR render/print là presentation, không khẳng định PDF endpoint có sẵn; address/logo/upload/hours/probe cần owner scope và Codex protocol riêng |
| CR-UI-09 OQ §8 “Chấp nhận & Cấp Ticket”, refund/raw received amount | BLOCKER nếu muốn bật chức năng đó | Không tồn tại API tự accept exception/refund trong v1. Giữ read-only exception filter và liên hệ đối soát; nhận tiền muộn không tự vào queue. Owner quyết định Q4 trước mở ngoại lệ P1, Codex bổ sung ledger projection đã redact |
| CR-UI-10 SCR-C02 groups size/sugar/ice bắt buộc | OPEN | MenuOption v1 là additive lựa chọn độc lập; note cho tùy chỉnh không tính phí. Exclusive/required groups cần owner chốt scope rồi Codex chỉnh types, không fake validation frontend |
| CR-UI-11 SCR-C06/G01 cart retry chỉ React state, guest bill toàn phiên | READY retry; OPEN guest bill P1 | Persist command/key qua reload. Tổng bill owner từ R11/R13; guest R05 từng order. TableSessionDetail có type từ C01 nhưng chưa public read endpoint; không bịa API bill chỉ vì có type |
| CR-UI-12 G01 polling 3/8/5 giây, countdown/transitions | ASSUMPTION | Cho mock jitter/backoff trong range ở Security; refetch reconnect; không hứa tải chưa test. Không dừng pending chỉ vì hardcoded15 phút |

## 6. Gate bàn giao

READY FOR INTEGRATION MOCK: route schemas/21 success examples + error semantics, type names, queue/command actions, status/ticket/privacy guards, category/nullable mapping, menuRevision request v1, owner detail/table detail projections. EXAMPLES v0.1 vẫn giữ để tham chiếu; v1 requests bắt buộc menuRevision từ R03, không lấy request cũ làm request production hoàn chỉnh.

OPEN/BLOCKED FOR LIVE: PG-01 provider/real signature/wire ACK, TTL và format credentials (owner), Q5 encrypted delivery/recovery/key lifecycle, Q6 close-empty/open-order policy, Q7 day boundary/pause policy, Q4 nếu bật hủy/refund/exception decisions, CR UI ngoài baseline. Backend implementation/tests, Supabase policies/sandbox, live UI và xác nhận nghiệm thu của Gemini/chủ dự án chưa diễn ra; không ghi Phase 0/MVP đã được duyệt chỉ vì file có sẵn.

### Ghi nhận tài liệu P0-G02 xuất hiện trong lúc hoàn thiện C02

Đã đọc thêm P0_G02_REVIEW.md, không chỉnh file Gemini. CONTRACT_REQUEST_01 nhận mã qua endpoint mới được đáp ứng bằng **R05 includePickup=true / PrivateOrderTrackingView**, không `/pickup-credential`; CONTRACT_REQUEST_02 dùng sẵn ApiErrorDetails.currentPrices/menuItemIds và menuRevision handshake. Các route `/api/owner/tables/:id/sessions/current` hoặc payload cũ được ghi CONFIRMED trong G02 không là route đã duyệt ở đây: dùng R11 query tableId; R07 wrapper OwnerOrdersView, R04 CreateOrderV1Input, R09/R10 requestId+expectedVersion, R13 action và R16/R20 CAS. Các checkbox G02 là báo cáo từ UI, chưa thay thế xác nhận tích hợp chéo v1-draft. Phần đối soát screen/component specs G02 chi tiết vẫn để phiên Integration, không mở rộng task C02 thành sửa design.
