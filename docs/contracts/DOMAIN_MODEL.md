# Domain model v0.1 — P0-C01

Ngày: 23/10/2026. Phạm vi: Phase 0, single-store MVP; không phải migration hay API implementation.

## Nguồn và thứ tự áp dụng

Đã đọc `README.md`, `PRD.md`, `ARCHITECTURE.md`, `PLAN.md`, `TASKS.md` (T-001, T-002, T-005) và `UI.md` tại thư mục gốc. Không có thư mục `REFERENCE/` hoặc sáu file tại đường dẫn `REFERENCE/*` được prompt nhắc đến; sáu tài liệu tương ứng đều có ở root. PRD quyết định nghiệp vụ, ARCHITECTURE quyết định data contract; UI chỉ dùng để xác định dữ liệu cần render. Các file nguồn được giữ nguyên.

Chỉ hai vai trò: guest không login và owner đăng nhập Supabase Auth, gắn đúng store. Owner kiêm bếp, phục vụ và thu ngân. Stack vẫn Next.js + TypeScript + Supabase PostgreSQL/Auth/Realtime; một adapter payOS hoặc SePay sẽ được chọn sau. Không thêm nhân viên, KDS/station, kho, loyalty, đa chi nhánh hoặc split bill.

`types.ts` giữ DTO v0.1 và bổ sung **v1-draft P0-C02** để Gemini import read-only; chưa sao chép sang `src/types/contracts`. T-005 mới có phần handoff tài liệu, chưa thay cho xác nhận tích hợp của Gemini/chủ dự án. Delta kỹ thuật ở API_CONTRACT_V1/P0_C02_REVIEW; các lựa chọn còn mở ở OPEN_QUESTIONS, mọi default vẫn là **ASSUMPTION chưa được duyệt**.

## Quy ước chung

- Domain/API dùng camelCase; tên bảng và cột DB dùng snake_case. Các trường dưới đây là **domain fields bắt buộc**; dấu `nullable` là trường phải tồn tại nhưng cho phép null. ID là opaque string (DB dự kiến UUID); ID/ticket/public QR không cấp quyền.
- Entity có `id` trừ khóa ghép được ghi rõ. Thời gian là UTC `timestamptz`, DTO là ISO 8601 UTC. Ngày vận hành `serviceDate` là ngày địa phương của store tại lúc **chấp nhận** đơn; không lấy ngày checkout hay giờ client. Theo ARCHITECTURE, mặc định nửa đêm, timezone `Asia/Ho_Chi_Minh`; cấu hình ngày vận hành cần xác nhận trước implementation.
- Tiền `MoneyVnd` là số nguyên VND không âm, kiểm `Number.isSafeInteger` ở server, giới hạn tổng/số lượng; DB dùng integer/bigint và không float. Chỉ serialize bigint sang number sau kiểm giới hạn an toàn. Không VAT/phí/chiết khấu ngầm trong v0.1.
- Mọi quan hệ xuyên bảng phải cùng store, kể cả FK qua order/session/menu. RLS + server authorization; service-role chỉ ở server. Guest không đọc bảng DB trực tiếp bằng anon tùy ý.
- Trường secret/hash và audit raw payload **không nằm trong DTO dùng chung/list/public**. V1 chỉ cho phép plaintext code ở DTO giao credential riêng đã kiểm quyền (OwnerSessionOpenedView/PrivateOrderTrackingView), không trong OrderDetail/TableSummary. Bảng mô tả lưu trữ dự kiến, không cho phép tạo schema ở bước này.

## Danh mục entity

| Entity / bảng vật lý | Vai trò và trường domain bắt buộc | Quan hệ và ràng buộc | Quyền truy cập |
|---|---|---|---|
| **Store** / `stores` | `id, name, timezone, acceptingOrders` | Một quán MVP; parent tenant của dữ liệu. `timezone` là IANA, không đổi để sắp lại ticket cũ. | Public chỉ `StoreView`; owner của quán sửa metadata; secret provider lưu riêng phía server. |
| **OwnerMember** / `owner_members` | Khóa `(storeId, authUserId)`, `role='owner'` | FK Store và Supabase `auth.users`; không enum vai trò nhân viên. Mapping là nguồn quyền, không tin storeId do client gửi. | Server đọc mapping xác thực; owner chỉ scope quán; không public danh sách tài khoản. |
| **DiningTable** / `dining_tables` | `id, storeId, label, active` | Một store có nhiều bàn; duy nhất label trong store; bất hoạt không xóa lịch sử phiên/đơn. | Owner CRUD, guest chỉ TableRef của QR/phiên hợp lệ. |
| **QRCode** / `qr_codes` | `id, storeId, type, tableId(nullable), publicCode, active` | `type=table` iff tableId khác null; takeaway không bàn. `publicCode` unique, là locator công khai, không secret. | Resolve public chỉ metadata, không phiên/đơn trước verify; owner quản lý. |
| **TableSession** / `table_sessions` | `id, storeId, tableId, status, codeHash, codeExpiresAt, openedAt, closedAt(nullable), version` | Một bàn tối đa **một phiên chưa đóng**, tính cả `open` và `checkout_pending`. Đóng chỉ mở phiên mới; close + revoke atomic. | Owner mở/checkout/đóng; guest scope phiên đọc snapshot đã lọc; code/hash không public. Mã mới chỉ phát qua thao tác owner được ủy quyền ngoài DTO dùng chung. |
| **GuestAccess** / `guest_access` | `id, storeId, scopeType, scopeId, tokenHash, browserContextHash, expiresAt, revokedAt(nullable)` | scopeType=`table_session` hoặc `order`; scopeId phải thuộc store. Token ngẫu nhiên, hash DB, TTL/revoke; browser bundle có nhiều grant độc lập, không suy rộng ra quán. Browser context bootstrap trước create để bind retry kể cả mất response. | Server-only kiểm chứng. Secure HttpOnly cookie bundle opaque, kiểm CSRF/origin; không token JSON/log/analytics. Mỗi grant chỉ đúng một scope; context rỗng không đọc đơn. |
| **MenuCategory** / `menu_categories` | `id, storeId, name, sortOrder, active` | Danh mục inactive không công khai, không xóa snapshot cũ. | Public đọc active; owner sửa đúng quán. |
| **MenuItem** / `menu_items` | `id, storeId, categoryId, name, description(nullable), priceVnd, imageUrl(nullable), available, active, updatedAt` | Category cùng store; active nhưng unavailable vẫn hiện hết hàng; inactive không hiện/không đặt. Giá >=0; đơn cũ không phụ thuộc giá mới. | Public menu DTO đã lọc; owner CRUD/đổi availability. |
| **MenuOption** / `menu_item_options` | `id, menuItemId, name, priceDeltaVnd, active` | Thuộc đúng một item; selection không lặp. v0.1 tùy chọn cộng thêm, không group bắt buộc; delta >=0 theo ASSUMPTION A2. | Owner sửa; public DTO `available` được map từ active. Submit không nhận option inactive/sai item. |
| **Order** / `orders` | `id, storeId, type, tableSessionId(nullable), status, ticketNo(nullable), serviceDate(nullable), acceptedAt(nullable), totalVnd, clientRequestId, requestFingerprint, guestAccessId, note(nullable), createdAt, updatedAt, version` | Dine-in iff session khác null; takeaway session null. Request unique `(storeId, clientRequestId)`. Một order có nhiều OrderItem; ticket đã cấp bất biến. Payment của dine-in lấy từ settlement phiên, takeaway từ intent/ledger. | Guest phiên xem đơn cùng phiên, guest order chỉ đúng order; owner đúng store. Chỉ backend tạo/tính tiền; owner chỉ qua command hợp lệ. |
| **OrderItem** / `order_items` | `id, orderId, menuItemId, nameSnapshot, baseUnitPriceVnd, unitPriceVnd, quantity, optionsSnapshot, lineTotalVnd, note(nullable)` | Snapshot option gồm `menuOptionId, name, priceDeltaVnd`; unit=base+sum(delta), line=unit*quantity; tổng order=sum(line). quantity nguyên dương. Không hard-delete menu đang được tham chiếu. | Scope kế thừa Order; không sửa giá/snapshot sau submit. |
| **TicketCounter** / `ticket_counters` | Khóa `(storeId, serviceDate)`, `lastTicket` | Row lock transaction, tăng từ 0 thành 1; unique `(storeId, serviceDate, ticketNo)` ở order. Rollback cả counter/order; không tái sử dụng số đã commit. | Server-only; owner/client không set số. |
| **PaymentIntent** / `payment_intents` | `id, orderId, provider, merchantRef, amountVnd, currency='VND', status, expiresAt, createdAt, updatedAt` | Chỉ takeaway. v0.1 một intent/order; unique orderId và `(provider, merchantRef)`; provider là payOS hoặc SePay qua adapter. Amount snapshot khớp order, không lấy từ client. | Server write; guest đúng order đọc PaymentViewState, owner xem metadata. Không có provider credentials/raw payload trong DTO. |
| **PaymentTransaction** / `payment_transactions` | `id, paymentIntentId, provider, providerTransactionId, amountVnd, currency, occurredAt, verifiedAt, rawEventRef, reconciliationRequired` | Ledger immutable, unique `(provider, providerTransactionId)`; FK intent đã match. Có thể nhiều giao dịch cho một intent (tiền lặp là ngoại lệ, không cấp ticket mới). Unknown reference giữ ở webhook evidence trước khi gắn intent. | Server ghi sau verify; owner được xem đối soát đã lọc, guest chỉ trạng thái/tổng của mình. |
| **PaymentWebhookEvent** / `payment_webhook_events` | Khóa `(provider, providerEventId)`, `receivedAt, processedAt(nullable), result, evidenceRef` | Dedupe event **và** transaction ID; evidence được bảo vệ/retention, không log nguyên payload. Signature sai không trở thành ledger đáng tin. | Server-only, owner chỉ metadata đối soát khi có quyền. |
| **SessionSettlement** / `session_settlements` | `id, tableSessionId, totalVnd, paymentMethod, status, settledAt(nullable), confirmedByAuthUserId(nullable), requestId` | Chỉ dine-in, method cash/bank_transfer, status pending/succeeded/failed. Một success/phiên; total từ snapshot non-cancelled, không tổng menu hiện tại. Không dùng takeaway intent để tính bill bàn. | Owner đúng store xác nhận thu tiền; guest chỉ tổng/trạng thái phiên. Không guest tự set paid. |
| **PickupCredential** / `pickup_credentials` | Khóa `orderId`, `pickupCodeHash, attempts, verifiedAt(nullable), consumedAt(nullable), expiresAt` | Chỉ takeaway, cấp khi accepted; mã ngẫu nhiên độc lập ticket/token, hash DB, rate-limit. Verify+consume+complete cùng transaction; phát lại/khôi phục plaintext cần quyết định Q5. | Server verify khi owner giao; chỉ người mua được ủy quyền nhận plaintext qua kênh riêng trong giai đoạn tích hợp. Không trả hash/code trong DTO chung, owner queue hoặc public feed. |
| **OrderEvent** / `order_events` | `id, orderId, actorType, actorId(nullable), eventType, beforeJson, afterJson, createdAt` | actorType guest/owner/system, không phải role mới; append-only, snapshot được redact. Cùng transaction với state change. | Server ghi, owner đọc lịch sử lọc; guest chỉ trạng thái đơn, không audit raw. |
| **OutboxEvent** / `outbox_events` | `id, topic, aggregateId, version, payload, createdAt, publishedAt(nullable), attemptCount` | Ghi cùng transaction; publish sau commit, retry at-least-once. Payload realtime tối thiểu `{eventId, aggregateId, version, type}`, không secret. | Server-only publisher; private channel kiểm scope; UI re-fetch snapshot. Publisher thực thi ở phase sau. |
| **OperationRequest** / `operation_requests` | Khóa `(storeId, requestId)`, `operation, actorId, requestFingerprint, resultJson, createdAt` | Dedupe owner claim/ready/complete/settle; cùng key khác actor/operation/payload => conflict hoặc từ chối quyền. Lưu cả kết quả không có đơn; kết quả không chứa secret. | Server-only, replay vẫn kiểm owner/store. |

## Invariant cần thực thi phía server và DB

1. `type=dine_in` iff `tableSessionId != null`; order session/table/guest scope cùng store. Dine-in được persist ở accepted (không có pending_payment) và đã có ticket. Gọi thêm là order mới.
2. Takeaway pending_payment hoặc payment_exception chưa accepted có `ticketNo = serviceDate = acceptedAt = null`. accepted/preparing/ready/completed có đủ ba trường; ticket nguyên dương an toàn. Cancelled giữ đủ ba trường nếu từng accepted, hoặc cả ba null nếu chưa accepted. Không xóa/tái cấp ticket đã commit.
3. Takeaway chỉ được accepted khi webhook đã xác thực, đúng merchant/reference/amount/currency và intent còn hợp lệ **được kiểm lại trong transaction**. Paid + intent success + ledger + ticket + accepted + pickup hash + audit/outbox commit cùng nhau. Return URL/ảnh chuyển khoản không phải bằng chứng. Đồng bộ provider phục hồi webhook mất cần quyết định Q1, chưa tự bật.
4. Một counter chung cho hai loại đơn per store+serviceDate. Thứ tự do DB serialize counter tại lúc chấp nhận; acceptedAt do DB ghi sau khi lấy lock (không dùng timestamp client hoặc `now()` đầu transaction để xếp hàng). V1 thêm store admission gate chung với claim, trước các resource locks và giữ đến commit để không vượt old-day acceptance qua nửa đêm. Ticket là thứ tự quyết định trong ngày, thời gian chỉ để hiển thị/audit. Giữ serviceDate khi đơn được xử lý qua nửa đêm.
5. Claim lấy accepted nhỏ nhất theo `(serviceDate, ticketNo, id)` ở toàn store, kể cả đơn ngày trước; không lọc theo filter UI/ngày hiện tại. Store claim lock tuần tự, không `SKIP LOCKED`. Thứ tự bắt đầu FIFO; thứ tự hoàn tất có thể khác.
6. Giá/tên/options snapshot khi backend submit. Client gửi ID, quantity, note, key và **menuRevision trong request v1**. Không tin client về tổng/paid/status/ticket. Menu revision thay atomically với menu/options/category; snapshot read/submit dùng cùng revision lock; server tính lại từ menu hiện hành, stale revision yêu cầu xác nhận lại (Q3 draft protocol).
7. Một live session/bàn gồm open và checkout_pending. Submit và checkout cùng lock session. Checkout_pending từ chối đơn mới; settlement thành công/close/revoke token nguyên tử. Chỉ mở lại checkout khi chưa có settlement success.
8. Guest session token có quyền xem các đơn cùng phiên như ARCHITECTURE §6; không phải toàn quán. Takeaway token chỉ một order. Mỗi request kiểm hash/token, scope, expiresAt, revokedAt và trạng thái phiên; verify mã phiên cũng kiểm codeExpiresAt và giới hạn lượt. Public QR không cấp quyền đọc order/payment. Opaque order ID không thay cho kiểm scope. Owner scope lấy qua Auth mapping tại từng lệnh.
9. Không đưa codeHash, tokenHash, pickupCodeHash, raw webhook hay service-role vào DTO/log/realtime. Plaintext code v1 chỉ giao qua OwnerSessionOpenedView đúng owner hoặc PrivateOrderTrackingView đúng buyer, tuyệt đối không DTO list/public/log/realtime. Payment checkout instructions cũng chỉ đúng order scope, `Cache-Control: private, no-store`; ciphertext delivery có ACL/TTL/key lifecycle là ASSUMPTION Q5, chưa migrate.
10. Version tăng với thay đổi aggregate; realtime chỉ gợi ý re-fetch. Consumer bỏ version cũ, reload/reconnect/poll đọc lại DB; không cập nhật paid từ event client.
11. V1 settle success làm paymentStatus của order dine-in suy ra paid; phải tăng version/updatedAt order và invalidation cùng transaction close/revoke, không đổi ticket/status completed.

## Naming và khác biệt domain/DB có chủ ý

Ngoài quy tắc camelCase → snake_case một-một cho các trường còn lại, danh sách khác biệt có chủ ý của v0.1 là:

| Domain / DTO | DB / nguồn thật | Giải thích |
|---|---|---|
| `MenuOption`, `menuItemId` | `menu_item_options`, `item_id` | Giữ tên bảng/cột baseline; DTO options lồng trong MenuItem nên không cần parent ID. |
| `OrderLine`, `menuItemId`, `quantity` | `order_items`, `item_id`, `qty` | Line là DTO snapshot; domain OrderItem giữ tên nghiệp vụ. |
| `OrderLine.name`, `.options` | `name_snapshot`, `options_snapshot` | DTO dễ render nhưng luôn là snapshot, không live join. JSON keys bên trong options_snapshot lưu snake_case; serializer chuyển sang camelCase. |
| `OrderOptionSnapshot.menuOptionId` | `options_snapshot[].menu_option_id` | Option ID giữ để audit, tên/giá đã snapshot. |
| `MenuOption.available` | `menu_item_options.active` | Không thêm inventory/stock option; inactive option có thể hiện disabled trên UI đang giữ menu cũ. |
| `PaymentTransaction.providerTransactionId` | `provider_tx_id` | Giữ tên cột baseline. `currency`, `occurred_at`, `reconciliation_required` là field bổ sung được mô tả, chưa migrate. |
| `TableSession.codeHash` | `code_hash` | Chỉ domain/server, không có trường tương ứng trong UI DTO. |
| `Order.type` | `orders.type` | Giá trị dine_in/takeaway giữ nguyên. `QRResolution.mode` là alias suy ra: table→dine_in, takeaway→takeaway; không thêm DB mode. |
| `Order.paymentStatus`, `OrderDetail.payment` | Derived từ intent/ledger hoặc settlement phiên | Không lưu thêm bản sao dễ lệch ở orders. `paid` map intent `succeeded`; không đổi tên enum DB thành paid. |
| `Order.fulfillmentStatus` | Derived từ type+orders.status | Không tạo station/task hoặc cột workflow thứ hai. Bảng mapping ở STATE_MACHINES. |
| `statusLabel` | Bảng nhãn trong types.ts | Không lưu DB, không dùng nhãn làm điều kiện nghiệp vụ. |
| `Order.table`, `TableSessionDetail.table` | Join session→dining_tables | TableRef không mang mã phiên. |
| `Order.itemCount` | Sum order_items.qty | Không phải số dòng; `lines` lấy từ order_items. |
| `TableSessionView.orderCount/totalVnd/paymentStatus` | Aggregate orders + settlement | Đếm mọi order; tổng payable bỏ cancelled. Không cộng lại giá menu. |
| `TableSummary.session`, `TableSessionView` | View của table_sessions | Grid chỉ live session hoặc null; chi tiết lịch sử có thể có closed. |
| `QRResolution.store/table/session/requiresSessionCode` | Join đã kiểm scope | Public session=null; session ID chỉ xuất hiện sau verify hợp lệ. |
| `PaymentViewState.intentId/intentStatus/kind` | payment_intents.id/status hoặc session settlement | Dine-in intentId/intentStatus=null; kind không là cột. CheckoutUrl/qrPayload lấy từ adapter đã lọc và chỉ để hướng dẫn thanh toán. |
| `PaymentViewState.reconciliationRequired` | Derived từ intent exception | Ngoại lệ ledger phát sinh sau success không hạ paid; owner xử lý evidence riêng. |
| `OrderBase.version`, `TableSessionView.version` | `orders.version`, `table_sessions.version` | Field bổ sung phục vụ optimistic concurrency/re-sync, không khóa bằng giờ client. |
| `CreateOrderInput`, `CartLine`, `Api*`, `OwnerQueueView`, `MenuView` | Không có bảng tương ứng | Request/envelope/view. `nextCursor` chỉ phân trang, không cấp quyền. `Id`, ISO/service date là scalar serialization. |

Các domain fields bổ sung như requestFingerprint, guestAccessId, note, baseUnitPriceVnd, version, codeExpiresAt, expiresAt/consumedAt của pickup là yêu cầu lưu trữ ở phase sau, không phải khẳng định DB đã tồn tại. Khi implementation phải ghi rõ schema/migration mapping này; không sinh migration trong P0-C01.

### Bổ sung mapping v1-draft (P0-C02)

`MenuV1View.menuRevision` và `OwnerMenuView.menuRevision` map store-scoped `menu_revision` cần thêm ở persistence (không sửa StoreView hoặc trả revision như quyền). `GuestAccess.browserContextHash` map `browser_context_hash` chỉ server. ServerTime là DB/request clock, không cột mới. OwnerOrdersView.counts/detail và OwnerTablesView.detail là projection, không bảng mới. MenuOptionWrite/MenuItemFields dùng camelCase, options.available map active như cũ; expectedUpdatedAt là precondition, không dữ liệu tin cậy để lưu đè timestamp.

StoreSettingsView.updatedAt map `stores.updated_at` bổ sung; store metadata có internal `stores.version` tăng khi settings/menu/QR thay đổi. Event menu.updated/qr.updated/store.updated dùng aggregateId=store.id và version nội bộ này để invalidate các GET liên quan; không cần lộ version vào StoreView. Order/session events dùng version đã có của order/session. Mutation menu/QR/settings lấy store row trước menu/resource rows khi cập nhật revision/version để không đảo chiều lock với admission/claim.

OwnerSessionOpenedView.sessionCredential và PrivateOrderTrackingView.pickup là **private delivery projection**, không cột plaintext; schema ciphertext/encryption metadata cần Q5 trước implementation. WebhookReceipt là ACK internal application, raw wire body/ACK do adapter mapping theo provider chưa chọn; không áp camelCase vào raw bytes đã ký. R13 action discriminator không là session status mới. QRCodeView.path là relative public URL suy ra, không session secret; settings paymentProvider là metadata, không credentials. Chi tiết mọi BEFORE→AFTER tại P0_C02_REVIEW.md.

## Ví dụ ba khách cùng bàn

Owner mở phiên `session-05` ở Bàn 05. Ba thiết bị A/B/C verify cùng mã phiên nhưng nhận ba GuestAccess riêng, scope đều là session-05. A gửi order-A được DB chấp nhận lúc `2026-10-23T03:00:00Z`, ticket 28; một takeaway đã verified xen giữa nhận 29; B gửi order-B nhận 30 lúc `03:00:02Z`; C gửi order-C nhận 31 lúc `03:00:03Z`. Tất cả ba dine-in đều tableSessionId=session-05, nhưng mỗi order một ticket riêng. Nếu tổng của A/B/C là 29.000/58.000/35.000 VND thì bill bàn là 122.000 VND; takeaway 29 không thuộc bill này. A retry cùng key/payload vẫn là order-A/ticket 28. Cả ba có thể đọc đơn cùng phiên, không đọc takeaway xen giữa. `EXAMPLES.md` dùng snapshot hai order trước khi C gọi thêm.
