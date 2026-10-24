# API contract v1-draft — P0-C02

`contractVersion: v1-draft` · Cập nhật: 23/10/2026 · **Đặc tả, chưa có API chạy thật**.

Nguồn: sáu tài liệu baseline ở root (không tồn tại `REFERENCE/`), P0-C01 và P0-G01. Type export trong `types.ts` là tên chính thức; changelog ở `P0_C02_REVIEW.md`. Mỗi JSON fence gắn `contract` để kiểm tĩnh. ID demo là opaque string, implementation DB dự kiến UUID. Các credential minh họa được đánh dấu riêng, không phải credential thật.

## Quy tắc chung áp dụng cho mọi route

- REST qua Next.js App Router Route Handlers; JSON camelCase; DB snake_case. Thành công `{data, error:null}`, lỗi `{data:null,error:{code,message,details?}}`; không HTTP 200 cho lỗi nghiệp vụ. Chỉ ACK webhook **đã lưu thành công evidence** có thể 200 kể cả outcome=recorded_exception: đó là nhận thông báo thành công, không phải xác nhận paid.
- Query/body strict: không nhận field ngoài schema; thiếu field required/sai kiểu/ID/enum trả **400 VALIDATION_ERROR**. Optional bỏ qua thì giữ default; nullable phải gửi null khi không có. Tiền integer VND trong safe integer range; quantity 1–99, tối đa 100 dòng, note <=500 ký tự là **ASSUMPTION giới hạn kỹ thuật**. ID path/query cần dạng opaque hợp lệ, không coi ID là quyền. Demo ID không áp UUID validator.
- Timestamp ISO UTC, ngày vận hành theo Asia/Ho_Chi_Minh, default nửa đêm (Q7). Trả header `Date` chuẩn HTTP làm mốc đồng hồ; menu trả thêm serverTime. Không sinh ticket ở client.
- **G** = guest scope hợp lệ trong cookie secure HttpOnly SameSite=Lax, host-only Path=/; origin/CSRF check cho POST/PATCH. **O** = Supabase Auth cookie + owner_members của store trên **từng** request, CSRF/origin check. **P** = public locator/menu, không quyền đọc đơn. **W** = chữ ký raw body provider, không cookie guest/owner.
- Một opaque browser cookie được bootstrap tại QR resolve trước submit. Server giữ bundle các grant `table_session`/`order`, mỗi grant vẫn đúng một scope, có TTL/revoke. Bundle rỗng **không có quyền đọc đơn**. Browser binding cho idempotency được lập trước POST để khôi phục create sau mất response; không dùng clientRequestId/QR/ticket như credential. Nếu cookie bị xóa, biết key/ID vẫn không khôi phục được order; cần quy trình hỗ trợ Q5, không tự tạo lại cùng đơn với key mới.
- POST create dùng clientRequestId UUID, owner command dùng requestId UUID. Auth + principal/store binding kiểm trước replay. Cùng principal/key/operation/payload chuẩn hóa → cùng status HTTP và cùng kết quả command đã commit, không chạy lần hai. Khác payload/operation → **409 DUPLICATE_REQUEST_CONFLICT**, principal khác → **403 FORBIDDEN**. Result là snapshot command cũ; GET mới lấy trạng thái hiện tại. Snapshot stale không được ghi đè version mới trên UI. Không lưu plaintext credential trong operation result: private delivery dùng protected encrypted reference (ASSUMPTION, Q5).
- Không side effect commit một nửa. Nếu DB chưa commit thì trả 500 INTERNAL_ERROR/timeout và retry cùng key; nếu đã commit nhưng mất response thì replay bằng key + browser cookie cũ. Replay create được kiểm trước menuRevision/store acceptingOrders/current session write guard, nhưng phải kiểm grant còn hiệu lực: phiên đóng →410, không phát lại quyền đã revoke.
- GET idempotent, không mutation nghiệp vụ; có thể bootstrap cookie/đọc snapshot. G/O/private payment dùng `Cache-Control: private, no-store`, không analytics/log body; QR resolve no-store vì có thể cá nhân hóa. Public menu có ETag/caching chỉ khi cache key đúng store/revision/QR active; v1 mặc định no-store để mock đơn giản.
- Rate limit profiles và concurrency tại `SECURITY_AND_CONCURRENCY.md`. Mọi route có thể **429 RATE_LIMITED** + Retry-After, **500 INTERNAL_ERROR** sanitized. Auth route O có **401 UNAUTHORIZED** hoặc **403 FORBIDDEN**. Không 200 với error trong body.
- Event ghi outbox trong cùng DB transaction; publish **sau commit** lên private channel. Payload `eventId,aggregateId,version,type` không body order/credential; UI refetch. Các route GET không phát event.

## Danh mục 21 route bắt buộc

| ID | Method / path | Auth | Request type / response data | HTTP success | Event sau commit |
|---|---|---|---|---|---|
| R01 | GET /api/public/qr/:code | P hoặc G | path code / QRResolution | 200 | Không |
| R02 | POST /api/public/table-sessions/verify | P + browser/origin | TableSessionVerifyInput / QRResolution | 200 | Không broadcast verify |
| R03 | GET /api/public/menu?qrCode=... | P | query qrCode / MenuV1View | 200 | Không |
| R04 | POST /api/public/orders | browser + G table khi dine-in | CreateOrderV1Input / OrderDetail | 201, replay 201 | order.created, order.accepted khi có ticket |
| R05 | GET /api/public/orders/:id | G (không owner fallback) | query includePickup? / OrderDetail hoặc PrivateOrderTrackingView | 200 | Không |
| R06 | GET /api/public/payments/:id | G order | path intentId / TakeawayPaymentViewState | 200 | Không |
| R07 | GET /api/owner/orders | O | OwnerOrdersQuery / OwnerOrdersView | 200 | Không |
| R08 | POST /api/owner/queue/claim-next | O | RequestCommand / OrderDetail hoặc null | 200 | order.preparing nếu có |
| R09 | POST /api/owner/orders/:id/ready | O | OrderTransitionInput / OrderDetail | 200 | order.ready |
| R10 | POST /api/owner/orders/:id/complete | O | CompleteOrderInput / OrderDetail | 200 | order.completed |
| R11 | GET /api/owner/tables | O | query tableId? / OwnerTablesView | 200 | Không |
| R12 | POST /api/owner/tables/:id/sessions | O | OpenTableSessionInput / OwnerSessionOpenedView (PRIVATE) | 201 | table_session.opened |
| R13 | POST /api/owner/table-sessions/:id/settle | O | SettleSessionInput / SettleSessionView | 200 | table_session.updated/closed |
| R14 | GET /api/owner/menu | O | query includeInactive? / OwnerMenuView | 200 | Không |
| R15 | POST /api/owner/menu | O | CreateMenuItemInput / OwnerMenuItem | 201 | menu.updated |
| R16 | PATCH /api/owner/menu/:id | O | PatchMenuItemInput / OwnerMenuItem | 200 | menu.updated |
| R17 | GET /api/owner/qr-codes | O | không query / QRCodeView[] | 200 | Không |
| R18 | POST /api/owner/qr-codes | O | QRCodeWriteInput / QRCodeView | 201 create, 200 set_active | qr.updated |
| R19 | GET /api/owner/settings | O | không query / StoreSettingsView | 200 | Không |
| R20 | PATCH /api/owner/settings | O | PatchStoreSettingsInput / StoreSettingsView | 200 | store.updated |
| R21 | POST /api/webhooks/payments/:provider | W | raw provider wire body / WebhookReceipt (application ACK) | 200 sau durable commit | order.accepted hoặc payment.updated |

Không thêm route cho chi tiết owner, chi tiết bàn, checkout begin/cancel hoặc pickup chỉ để chiều UI: dùng query projection hoặc action trên route đã có. Đây là contract bổ sung có changelog. Không có endpoint cancel/refund/accept-exception, upload ảnh, PDF hoặc kiểm tra trực tiếp provider ở draft này.

## R01 — GET /api/public/qr/:code

Schema: path `code:string` required, public locator 1–128 ký tự URL-safe. Không body/query. Lấy store/type từ QR active ở server; không nhận storeId. Bootstrap browser cookie rỗng nếu chưa có, không xoay cookie làm mất grant đang dùng.

Response: 200 QRResolution, ba nhánh public table chưa verify, table có G phiên hợp lệ, takeaway. Ví dụ public table và takeaway đầy đủ tại EXAMPLES §1/§3; dưới là table sau verify.

<!-- contract: ApiSuccess<QRResolution> -->
```json
{"data":{"type":"table","mode":"dine_in","store":{"id":"store-demo","name":"Quán Demo","timezone":"Asia/Ho_Chi_Minh","acceptingOrders":true},"table":{"id":"table-05","label":"Bàn 05"},"requiresSessionCode":false,"session":{"id":"session-05","status":"open"}},"error":null}
```

404 INVALID_QR nếu không tồn tại/bị khóa → UI QR lỗi; grant cũ/revoked không được lộ session mới, resolve public nhánh requiresSessionCode=true, verify/submit sẽ báo lỗi cụ thể. Quán ngừng nhận đơn vẫn resolve 200 acceptingOrders=false. Rate P-read; no-store; không event và không order access chỉ bằng QR.

## R02 — POST /api/public/table-sessions/verify

Schema `TableSessionVerifyInput` (P2-HF01): required qrCode như R01; sessionCode là string đúng sáu ASCII digits, giữ số 0 đầu. Giữ tên sessionCode để tương thích, không nhận pin alias. Browser cookie bootstrap hoặc cấp trong verify. Không requestId vì verify không tạo order/ticket; lặp PIN hợp lệ reuse grant, vẫn chịu burst limit. Never log body.

200 QRResolution + Set-Cookie opaque bundle cập nhật đúng table_session grant, không JSON token. P2-HF01 chỉ cấp grant mới khi open; checkout_pending trả409 SESSION_CHECKOUT_PENDING, grant cũ vẫn đọc được. Response minh họa:

<!-- contract: ApiSuccess<QRResolution> -->
```json
{"data":{"type":"table","mode":"dine_in","store":{"id":"store-demo","name":"Quán Demo","timezone":"Asia/Ho_Chi_Minh","acceptingOrders":true},"table":{"id":"table-05","label":"Bàn 05"},"requiresSessionCode":false,"session":{"id":"session-05","status":"open"}},"error":null}
```

404 INVALID_QR; **422 INVALID_SESSION_CODE** nếu sai mã → giữ form, không lộ đúng/sai table/session; **410 SESSION_EXPIRED** nếu phiên/code đã hết hiệu lực → liên hệ quán; 429 cho brute force. Rate verify dựa browser+QR và IP mềm có xét Wi-Fi chung. Rotating code phải version/check revoke theo Security; không đưa sessionCode vào URL query. Không realtime verify.

## R03 — GET /api/public/menu?qrCode=...

Schema query `qrCode:string` required; không body. P đọc món active và category active, gồm available=false để render hết hàng; option chỉ active, dữ liệu stale có thể đang disabled ở UI. Không guest session/order trong DTO. `menuRevision:string` required opaque 1–128 do server cấp theo store, thay atomically khi menu/category/options thay đổi; không dùng revision làm auth.

<!-- contract: ApiSuccess<MenuV1View> -->
```json
{"data":{"categories":[{"id":"category-coffee","name":"Cà phê","sortOrder":1}],"items":[{"id":"item-coffee","categoryId":"category-coffee","name":"Cà phê sữa","description":null,"priceVnd":29000,"imageUrl":null,"available":true,"options":[{"id":"option-extra","name":"Thêm cà phê","priceDeltaVnd":6000,"available":true}],"updatedAt":"2026-10-23T02:00:00Z"}],"menuRevision":"menu-r7","serverTime":"2026-10-23T03:00:00Z"},"error":null}
```

Empty 200 categories/items có thể []. 404 INVALID_QR → QR lỗi; 400 thiếu qrCode; rate P-read; không event. Dùng revision ở POST R04 để phát hiện giỏ stale. Đây là **ASSUMPTION protocol v1** thay đề xuất quote phức tạp Q3; revision đổi vì availability cũng yêu cầu refetch. Giá/tổng vẫn server tính lại, khách tự đổi revision không đổi giá DB.

## R04 — POST /api/public/orders

Schema `CreateOrderV1Input`: required `qrCode`, `clientRequestId:UUID`, `menuRevision:string`, `items:CartLine[1..100]`, `note:string|null`. Mỗi line required `menuItemId`, `quantity:integer 1..99`, `optionIds:Id[]` distinct và thuộc món, `note:string|null <=500`. Không type/tableSessionId/storeId/price/status/ticket từ client: mode lấy QR, phiên lấy grant hợp lệ khớp QR bàn. Takeaway cần browser cookie bootstrap để bind retry, không cần table session.

Ví dụ request v1 (JSON không credential):

<!-- contract: CreateOrderV1Input -->
```json
{"qrCode":"TABLE_05_PUBLIC","clientRequestId":"22d0ab58-300e-4f3a-ae7e-a4cc92238a49","menuRevision":"menu-r7","items":[{"menuItemId":"item-coffee","quantity":1,"optionIds":[],"note":null}],"note":null}
```

201 dine-in OrderDetail: kiểm quyền, menuRevision/menu dưới lock; snapshot+ticket counter per store/serviceDate+accepted+audit/outbox atomic. Mẫu đầy đủ (không cắt fields):

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{"data":{"id":"order-A","storeId":"store-demo","type":"dine_in","tableSessionId":"session-05","table":{"id":"table-05","label":"Bàn 05"},"status":"accepted","statusLabel":"Chờ làm","ticketNo":28,"serviceDate":"2026-10-23","acceptedAt":"2026-10-23T03:00:00Z","paymentStatus":"unpaid","fulfillmentStatus":"awaiting_preparation","totalVnd":29000,"itemCount":1,"createdAt":"2026-10-23T03:00:00Z","updatedAt":"2026-10-23T03:00:00Z","version":1,"lines":[{"id":"line-A","menuItemId":"item-coffee","name":"Cà phê sữa","baseUnitPriceVnd":29000,"options":[],"unitPriceVnd":29000,"quantity":1,"lineTotalVnd":29000,"note":null}],"note":null,"payment":{"kind":"table_session","tableSessionId":"session-05","intentId":null,"intentStatus":null,"status":"unpaid","statusLabel":"Chưa thanh toán","amountVnd":29000,"currency":"VND","updatedAt":"2026-10-23T03:00:00Z","reconciliationRequired":false}},"error":null}
```

201 takeaway OrderDetail: transaction chỉ tạo pending order+intent; **không ticket**, không vào queue. Browser bundle được cấp đúng order grant cùng commit để có thể khôi phục mất response bằng cookie cũ. Tạo checkout adapter ngoài lock theo cùng intent/reference; ví dụ qrPayload từ adapter demo, không khẳng định provider thật hay checkoutUrl tồn tại:

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{"data":{"id":"order-T","storeId":"store-demo","type":"takeaway","tableSessionId":null,"table":null,"status":"pending_payment","statusLabel":"Chờ thanh toán","ticketNo":null,"serviceDate":null,"acceptedAt":null,"paymentStatus":"pending","fulfillmentStatus":"awaiting_preparation","totalVnd":35000,"itemCount":1,"createdAt":"2026-10-23T02:59:00Z","updatedAt":"2026-10-23T02:59:00Z","version":1,"lines":[{"id":"line-T","menuItemId":"item-coffee","name":"Cà phê sữa","baseUnitPriceVnd":29000,"options":[{"menuOptionId":"option-extra","name":"Thêm cà phê","priceDeltaVnd":6000}],"unitPriceVnd":35000,"quantity":1,"lineTotalVnd":35000,"note":null}],"note":null,"payment":{"kind":"takeaway","intentId":"intent-T","intentStatus":"pending","status":"pending","statusLabel":"Đang xác nhận thanh toán","amountVnd":35000,"currency":"VND","expiresAt":"2026-10-23T03:09:00Z","updatedAt":"2026-10-23T02:59:00Z","checkoutUrl":null,"qrPayload":"DEMO-NOT-A-REAL-PAYMENT-QR","reconciliationRequired":false}},"error":null}
```

Nếu adapter đang chưa có instructions, cả checkoutUrl/qrPayload=null vẫn 201 pending đã persist; UI “Đang tạo hướng dẫn thanh toán”, refetch R06, không cho chuyển tiền lần hai. Menu revision stale→409 PRICE_CHANGED (sau khi kiểm OUT_OF_STOCK); re-fetch menu, giữ cart, người dùng xác nhận và sinh key mới vì payload/revision đã đổi. Không được tự sửa giá rồi submit lại không có xác nhận.

Lỗi: 403 SESSION_REQUIRED (chưa table grant); 410 SESSION_EXPIRED; 409 SESSION_CHECKOUT_PENDING, OUT_OF_STOCK, PRICE_CHANGED, STORE_NOT_ACCEPTING_ORDERS, DUPLICATE_REQUEST_CONFLICT; 422 VALIDATION_ERROR cho option sai item/giỏ total takeaway <=0; 400 sai schema. Trong mỗi lỗi không tạo order/ticket mới. Rate create; idem lookup cùng browser đi trước rate chi phí cao để retry hợp lệ không bị coi spam. Events order.created; dine-in thêm order.accepted.

### Khôi phục reload / lỗi mạng — không route tìm đơn bằng key công khai

UI persist **key + normalized input/revision** trong local storage hoặc session storage trước POST (không token/secret). Reload gửi đúng POST R04 + cookie cũ + payload cũ; replay 201 cùng order/ticket/intent và không tính tiền lại. Sau có orderId điều hướng `/order/:id` (publicId trong wireframe là alias UI của id) và GET R05. ID trong URL chỉ locator; không cookie→401, sai scope→404, không tự set paid. Nếu user đã đổi cart, không dùng key đang có kết quả chưa rõ; khôi phục lệnh cũ trước. UI back/cancel sheet chỉ đóng UI, không hủy payment đang tồn tại.

## R05 — GET /api/public/orders/:id

Path id required; optional query `includePickup:boolean` default false (chỉ chấp nhận literal true/false); không body. G order riêng hoặc G table_session chứa order, không read bằng QR/ticket/ID đơn lẻ. Owner dùng R07, không cấp owner fallback vào buyer secret projection.

200 mặc định **OrderDetail** như R04; cùng kiểu khi status pending/accepted/preparing/ready/completed/cancelled/payment_exception (examples có đủ nhánh chính). Ví dụ đầy đủ một đơn đã giao:

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{"data":{"id":"order-T","storeId":"store-demo","type":"takeaway","tableSessionId":null,"table":null,"status":"completed","statusLabel":"Đã giao","ticketNo":29,"serviceDate":"2026-10-23","acceptedAt":"2026-10-23T03:00:01Z","paymentStatus":"paid","fulfillmentStatus":"collected","totalVnd":35000,"itemCount":1,"createdAt":"2026-10-23T02:59:00Z","updatedAt":"2026-10-23T03:06:00Z","version":5,"lines":[{"id":"line-T","menuItemId":"item-coffee","name":"Cà phê sữa","baseUnitPriceVnd":29000,"options":[{"menuOptionId":"option-extra","name":"Thêm cà phê","priceDeltaVnd":6000}],"unitPriceVnd":35000,"quantity":1,"lineTotalVnd":35000,"note":null}],"note":null,"payment":{"kind":"takeaway","intentId":"intent-T","intentStatus":"succeeded","status":"paid","statusLabel":"Đã thanh toán","amountVnd":35000,"currency":"VND","expiresAt":"2026-10-23T03:09:00Z","updatedAt":"2026-10-23T03:00:01Z","reconciliationRequired":false}},"error":null}
```

Với includePickup=true: 200 **PrivateOrderTrackingView**, luôn `{order, pickup}`; pickup=null nếu dine-in/pending/exception/cancelled/completed/credential đã hết hạn, thiếu credential hoặc payment đang hold/review; chỉ accepted/preparing/ready takeaway paid và buyer grant mới được nhận private code. P4-C03 dùng mã CSPRNG sáu chữ số ASCII, HMAC verifier và ciphertext AES-256-GCM gắn store/order. Webhook cấp một lần sau paid; job nội bộ khôi phục nếu thiếu, GET không cấp/rotate. Mã hết hạn 24 giờ từ acceptedAt; guest grant tối đa 12 giờ. Xem docs/handoffs/P4_C03_CODEX_PICKUP_HANDOFF.md cho key lifecycle và bằng chứng local; Production/provider E2E chưa chạy.

Ví dụ **buyer-private** đầy đủ sau webhook (mã demo vô hiệu, không đưa vào fixture queue/public):

<!-- credential-example: buyer-pickup-delivery -->
<!-- contract: ApiSuccess<PrivateOrderTrackingView> -->
```json
{"data":{"order":{"id":"order-T","storeId":"store-demo","type":"takeaway","tableSessionId":null,"table":null,"status":"accepted","statusLabel":"Chờ làm","ticketNo":29,"serviceDate":"2026-10-23","acceptedAt":"2026-10-23T03:00:01Z","paymentStatus":"paid","fulfillmentStatus":"awaiting_preparation","totalVnd":35000,"itemCount":1,"createdAt":"2026-10-23T02:59:00Z","updatedAt":"2026-10-23T03:00:01Z","version":2,"lines":[{"id":"line-T","menuItemId":"item-coffee","name":"Cà phê sữa","baseUnitPriceVnd":29000,"options":[{"menuOptionId":"option-extra","name":"Thêm cà phê","priceDeltaVnd":6000}],"unitPriceVnd":35000,"quantity":1,"lineTotalVnd":35000,"note":null}],"note":null,"payment":{"kind":"takeaway","intentId":"intent-T","intentStatus":"succeeded","status":"paid","statusLabel":"Đã thanh toán","amountVnd":35000,"currency":"VND","expiresAt":"2026-10-23T03:09:00Z","updatedAt":"2026-10-23T03:00:01Z","reconciliationRequired":false}},"pickup":{"code":"DEMO-ONLY-NOT-A-REAL-CODE","expiresAt":"2026-10-24T17:00:00Z"}},"error":null}
```

401 UNAUTHORIZED thiếu cookie; 404 ORDER_NOT_FOUND nếu không tồn tại hoặc sai scope; 410 SESSION_EXPIRED với grant phiên đóng/revoked/TTL hết; pickup projection không có buyer order scope→403 FORBIDDEN. Rate scoped-read; no-store, Referrer-Policy:no-referrer cho tracking; không event. R05 không trả danh sách phiên guest: tổng bill guest P1 là CONTRACT_REQUEST, không thêm route trong v1-draft.

## R06 — GET /api/public/payments/:id

`:id` là **payment intent ID**, không order ID; G order mà intent thuộc, không anonymous/provider callback. Không body/query. 200 TakeawayPaymentViewState, status=paid khác intentStatus=succeeded. Pending **không phải lỗi HTTP**, lấy từ DB, không gọi provider mỗi lần poll:

<!-- contract: ApiSuccess<TakeawayPaymentViewState> -->
```json
{"data":{"kind":"takeaway","intentId":"intent-T","intentStatus":"pending","status":"pending","statusLabel":"Đang xác nhận thanh toán","amountVnd":35000,"currency":"VND","expiresAt":"2026-10-23T03:09:00Z","updatedAt":"2026-10-23T02:59:00Z","checkoutUrl":null,"qrPayload":null,"reconciliationRequired":false},"error":null}
```

Expired/failed/exception là 200 snapshot để UI render. Clock countdown hết không đủ đổi DB: refetch; không nút tạo payment mới tự động. 401 thiếu cookie; 404 RESOURCE_NOT_FOUND intent không tồn tại/sai scope; rate scoped-read, 429/backoff. Event không có khi GET; state change từ worker/webhook phát payment.updated. Sau paid, UI refetch R05 và chỉ hiện ticket khi order accepted có ticket thật. Không thêm merchantRef/bank account fields theo UI nếu chưa xác minh adapter; CONTRACT_REQUEST CR-UI-03 ở handoff.

## R07 — GET /api/owner/orders

O. Optional query: `view:queue|exceptions|history` default queue; `type:dine_in|takeaway`; `status:OrderStatus`; `cursor:string` opaque <=2048; `limit:int 1..100` default 50; `orderId:Id` lấy detail độc lập trang lọc. Reject tổ hợp filter vô nghĩa (400): queue chỉ accepted/preparing/ready; history chỉ completed/cancelled. P4-C04: exceptions gồm pending_payment/payment_exception và takeaway có paymentReviewRequired=true (có thể accepted/preparing/ready/completed, giữ ticket lịch sử). Queue/counts chế biến loại các đơn held; paymentException count gồm held. Không storeId query. Cursor gắn filter/store, sai hoặc đổi filter dùng cursor cũ→400. Sort queue `(serviceDate,ticketNo,id)` tăng; exceptions/history `(createdAt,id)` giảm. Không hứa snapshot phân trang bất biến khi realtime đổi, reconnect tải lại từ đầu, dedupe by ID.

200 OwnerOrdersView. `counts` tính toàn store cho queue và paymentException, không phải số trang, không theo type filter. Detail mặc định null; orderId trong store không tồn tại→404 ORDER_NOT_FOUND. Chi tiết không lấy buyer pickup code. Ví dụ gọn nhưng đầy đủ response cho trang rỗng:

<!-- contract: ApiSuccess<OwnerOrdersView> -->
```json
{"data":{"storeId":"store-demo","orders":[],"detail":null,"counts":{"accepted":0,"preparing":0,"ready":0,"paymentException":0},"nextCursor":null,"updatedAt":"2026-10-23T03:00:00Z"},"error":null}
```


Ví dụ v1 cùng queue C01 §11 với `orderId=order-T`, sidebar detail đầy đủ và counts server:

<!-- contract: ApiSuccess<OwnerOrdersView> -->
```json
{
  "data": {
    "storeId": "store-demo",
    "orders": [
      {
        "id": "order-A",
        "storeId": "store-demo",
        "type": "dine_in",
        "tableSessionId": "session-05",
        "table": {
          "id": "table-05",
          "label": "Bàn 05"
        },
        "status": "preparing",
        "statusLabel": "Đang làm",
        "ticketNo": 28,
        "serviceDate": "2026-10-23",
        "acceptedAt": "2026-10-23T03:00:00Z",
        "paymentStatus": "unpaid",
        "fulfillmentStatus": "preparing",
        "totalVnd": 29000,
        "itemCount": 1,
        "createdAt": "2026-10-23T03:00:00Z",
        "updatedAt": "2026-10-23T03:01:00Z",
        "version": 2
      },
      {
        "id": "order-T",
        "storeId": "store-demo",
        "type": "takeaway",
        "tableSessionId": null,
        "table": null,
        "status": "ready",
        "statusLabel": "Sẵn sàng",
        "ticketNo": 29,
        "serviceDate": "2026-10-23",
        "acceptedAt": "2026-10-23T03:00:01Z",
        "paymentStatus": "paid",
        "fulfillmentStatus": "ready",
        "totalVnd": 35000,
        "itemCount": 1,
        "createdAt": "2026-10-23T02:59:00Z",
        "updatedAt": "2026-10-23T03:05:00Z",
        "version": 4
      },
      {
        "id": "order-B",
        "storeId": "store-demo",
        "type": "dine_in",
        "tableSessionId": "session-05",
        "table": {
          "id": "table-05",
          "label": "Bàn 05"
        },
        "status": "accepted",
        "statusLabel": "Chờ làm",
        "ticketNo": 30,
        "serviceDate": "2026-10-23",
        "acceptedAt": "2026-10-23T03:00:02Z",
        "paymentStatus": "unpaid",
        "fulfillmentStatus": "awaiting_preparation",
        "totalVnd": 58000,
        "itemCount": 2,
        "createdAt": "2026-10-23T03:00:02Z",
        "updatedAt": "2026-10-23T03:00:02Z",
        "version": 1
      }
    ],
    "detail": {
      "id": "order-T",
      "storeId": "store-demo",
      "type": "takeaway",
      "tableSessionId": null,
      "table": null,
      "status": "ready",
      "statusLabel": "Sẵn sàng",
      "ticketNo": 29,
      "serviceDate": "2026-10-23",
      "acceptedAt": "2026-10-23T03:00:01Z",
      "paymentStatus": "paid",
      "fulfillmentStatus": "ready",
      "totalVnd": 35000,
      "itemCount": 1,
      "createdAt": "2026-10-23T02:59:00Z",
      "updatedAt": "2026-10-23T03:05:00Z",
      "version": 4,
      "payment": {
        "kind": "takeaway",
        "intentId": "intent-T",
        "intentStatus": "succeeded",
        "status": "paid",
        "statusLabel": "Đã thanh toán",
        "amountVnd": 35000,
        "currency": "VND",
        "expiresAt": "2026-10-23T03:09:00Z",
        "updatedAt": "2026-10-23T03:00:01Z",
        "reconciliationRequired": false
      },
      "lines": [
        {
          "id": "line-T",
          "menuItemId": "item-coffee",
          "name": "Cà phê sữa",
          "baseUnitPriceVnd": 29000,
          "options": [
            {
              "menuOptionId": "option-extra",
              "name": "Thêm cà phê",
              "priceDeltaVnd": 6000
            }
          ],
          "unitPriceVnd": 35000,
          "quantity": 1,
          "lineTotalVnd": 35000,
          "note": null
        }
      ],
      "note": null
    },
    "counts": {
      "accepted": 1,
      "preparing": 1,
      "ready": 1,
      "paymentException": 0
    },
    "nextCursor": null,
    "updatedAt": "2026-10-23T03:05:00Z"
  },
  "error": null
}
```

Ví dụ queue hai mode/ready tại EXAMPLES §11 vẫn là OwnerQueueView projection; v1 wrapper thêm detail/counts, không đổi OrderSummary. Pending chỉ ở view exceptions, không claim. Rate owner-read; GET không event. Không API đọc raw provider ledger để chiều dialog tiền thực nhận; CR-UI-09.

## R08 — POST /api/owner/queue/claim-next

O; required `requestId:UUID`, không orderId/filter/type/ngày. Store claim gate serialize các tab, chọn accepted nhỏ nhất **toàn store qua mọi serviceDate**, update preparing+version+operation result+audit/outbox atomic, không SKIP LOCKED. Cùng requestId trả cùng đơn hoặc null; hai key khác có thể nhận hai đơn liên tiếp hợp lệ.

200 OrderDetail, ví dụ dưới có ticket 28 đã nhận trước ticket 29. Empty là **200 `{data:null,error:null}`**, không phải failure; đó là ngoại lệ hợp lệ với `ApiSuccess<OrderDetail|null>`.

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{"data":{"id":"order-A","storeId":"store-demo","type":"dine_in","tableSessionId":"session-05","table":{"id":"table-05","label":"Bàn 05"},"status":"preparing","statusLabel":"Đang làm","ticketNo":28,"serviceDate":"2026-10-23","acceptedAt":"2026-10-23T03:00:00Z","paymentStatus":"unpaid","fulfillmentStatus":"preparing","totalVnd":29000,"itemCount":1,"createdAt":"2026-10-23T03:00:00Z","updatedAt":"2026-10-23T03:01:00Z","version":2,"lines":[{"id":"line-A","menuItemId":"item-coffee","name":"Cà phê sữa","baseUnitPriceVnd":29000,"options":[],"unitPriceVnd":29000,"quantity":1,"lineTotalVnd":29000,"note":null}],"note":null,"payment":{"kind":"table_session","tableSessionId":"session-05","intentId":null,"intentStatus":null,"status":"unpaid","statusLabel":"Chưa thanh toán","amountVnd":29000,"currency":"VND","updatedAt":"2026-10-23T03:00:00Z","reconciliationRequired":false}},"error":null}
```

409 DUPLICATE_REQUEST_CONFLICT key đổi payload; 400 nếu cố gửi orderId; 401/403 O; rate owner-write. Nếu DB thấy accepted takeaway chưa paid (dữ liệu bất biến bị vi phạm) fail transaction 500 + alert, không tự skip để vượt hàng. Event order.preparing sau commit, rỗng không event.

## R09 — POST /api/owner/orders/:id/ready

O; path id; body required `{requestId:UUID, expectedVersion:positive integer}`. Không arbitrary status. Lock order, kiểm preparing và version đúng rồi ready+audit+outbox. Replay lookup trước expectedVersion guard.

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{"data":{"id":"order-A","storeId":"store-demo","type":"dine_in","tableSessionId":"session-05","table":{"id":"table-05","label":"Bàn 05"},"status":"ready","statusLabel":"Sẵn sàng","ticketNo":28,"serviceDate":"2026-10-23","acceptedAt":"2026-10-23T03:00:00Z","paymentStatus":"unpaid","fulfillmentStatus":"ready","totalVnd":29000,"itemCount":1,"createdAt":"2026-10-23T03:00:00Z","updatedAt":"2026-10-23T03:04:00Z","version":3,"lines":[{"id":"line-A","menuItemId":"item-coffee","name":"Cà phê sữa","baseUnitPriceVnd":29000,"options":[],"unitPriceVnd":29000,"quantity":1,"lineTotalVnd":29000,"note":null}],"note":null,"payment":{"kind":"table_session","tableSessionId":"session-05","intentId":null,"intentStatus":null,"status":"unpaid","statusLabel":"Chưa thanh toán","amountVnd":29000,"currency":"VND","updatedAt":"2026-10-23T03:00:00Z","reconciliationRequired":false}},"error":null}
```

200; 404 ORDER_NOT_FOUND ngoài store/missing; 409 INVALID_STATE_TRANSITION stale version/sai current status → refetch, không optimistic success; 409 DUPLICATE_REQUEST_CONFLICT; O/rate owner-write; event order.ready.

## R10 — POST /api/owner/orders/:id/complete

O; path id; `CompleteOrderInput`: required requestId, expectedVersion và `type` discriminator **phải khớp DB**. Dine-in `{type:dine_in}` không pickup field; takeaway `{type:takeaway,pickupCode:string}` required, đúng sáu chữ số ASCII, giữ số 0 đầu. Không xác nhận bằng mắt thay server. Không lưu plaintext trong logs/audit/operation result; fingerprint nhạy cảm dùng keyed HMAC server của normalized command. Atomic ready→completed; takeaway phải paid + credential chưa consume/còn hạn, không hold/review; consume/completed/audit/outbox/command replay cùng transaction.

200 OrderDetail. Ví dụ dine-in chưa thanh toán nhưng đã phục vụ, hợp lệ:

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{"data":{"id":"order-A","storeId":"store-demo","type":"dine_in","tableSessionId":"session-05","table":{"id":"table-05","label":"Bàn 05"},"status":"completed","statusLabel":"Đã giao","ticketNo":28,"serviceDate":"2026-10-23","acceptedAt":"2026-10-23T03:00:00Z","paymentStatus":"unpaid","fulfillmentStatus":"served","totalVnd":29000,"itemCount":1,"createdAt":"2026-10-23T03:00:00Z","updatedAt":"2026-10-23T03:06:00Z","version":4,"lines":[{"id":"line-A","menuItemId":"item-coffee","name":"Cà phê sữa","baseUnitPriceVnd":29000,"options":[],"unitPriceVnd":29000,"quantity":1,"lineTotalVnd":29000,"note":null}],"note":null,"payment":{"kind":"table_session","tableSessionId":"session-05","intentId":null,"intentStatus":null,"status":"unpaid","statusLabel":"Chưa thanh toán","amountVnd":29000,"currency":"VND","updatedAt":"2026-10-23T03:00:00Z","reconciliationRequired":false}},"error":null}
```

Takeaway complete response đầy đủ như R05 completed/collected (không trả pickup). 422 INVALID_PICKUP_CODE sai/hết hạn; 400 thiếu proof, sai sáu số hoặc sai schema; 409 PICKUP_NOT_ALLOWED nếu takeaway chưa paid/ready, đang review hoặc type takeaway dùng cho dine-in; 409 INVALID_STATE_TRANSITION nếu stale version (hoặc type dine_in dùng cho takeaway); 503 PICKUP_CREDENTIAL_UNAVAILABLE nếu thiếu credential/key; 404 ORDER_NOT_FOUND nếu missing/outside store; 409 DUPLICATE_REQUEST_CONFLICT nếu key khác payload. Cùng requestId cùng actor/payload trả snapshot cũ; key mới completed → 409 ORDER_ALREADY_COMPLETED. Rate limit: 10 lần verify/owner/phút và 60 lệnh mới/owner/phút; 5 lần sai/order trong 15 phút khóa 15 phút. HTTP429 có Retry-After; replay lỗi cùng key không tăng attempts. Event order.completed.

## R11 — GET /api/owner/tables

O; query optional `tableId:Id`, không body. 200 OwnerTablesView: tables grid mọi bàn trong store, session live hoặc null; nếu có tableId, detail live session của bàn hoặc null nếu trống, không sessionCode. Missing/outside store→404 RESOURCE_NOT_FOUND. Toàn bộ detail orders cùng phiên được đọc trong một snapshot để bill nhất quán.

<!-- contract: ApiSuccess<OwnerTablesView> -->
```json
{"data":{"tables":[{"id":"table-05","label":"Bàn 05","active":true,"session":{"id":"session-05","status":"open","openedAt":"2026-10-23T02:50:00Z","closedAt":null,"orderCount":0,"totalVnd":0,"paymentStatus":"unpaid","version":1}}],"detail":{"table":{"id":"table-05","label":"Bàn 05"},"session":{"id":"session-05","status":"open","openedAt":"2026-10-23T02:50:00Z","closedAt":null,"orderCount":0,"totalVnd":0,"paymentStatus":"unpaid","version":1},"orders":[]}},"error":null}
```

Rate owner-read; không event. Chi tiết lịch sử closed do kết quả settle lưu trên UI hoặc history phase sau; không bịa sessionCode trong currentSession. P2-HF01 chốt reveal/rotate bên dưới, không dùng TableSummary làm credential delivery.

## R12 — POST /api/owner/tables/:id/sessions

O; path bàn; required body `{requestId:UUID}`. Store/table active, unique live session gồm open/checkout_pending; không guest mở phiên. 201 OwnerSessionOpenedView **PRIVATE** với mã phiên dành owner đưa khách; ví dụ dùng credential giả đánh dấu allowlist, không dùng trong grid/public resolve:

<!-- credential-example: owner-session-delivery -->
<!-- contract: ApiSuccess<OwnerSessionOpenedView> -->
```json
{"data":{"table":{"id":"table-05","label":"Bàn 05"},"session":{"id":"session-05","status":"open","openedAt":"2026-10-23T02:50:00Z","closedAt":null,"orderCount":0,"totalVnd":0,"paymentStatus":"unpaid","version":1},"sessionCredential":{"sessionCode":"000042","expiresAt":"2026-10-23T14:50:00Z","pinFormat":"numeric_6","generation":1,"issuedAt":"2026-10-23T03:00:00Z"}},"error":null}
```

P2-HF01: PIN CSPRNG sáu số, HMAC-SHA256 có pepper server riêng và context store/session/generation; AES-GCM có AAD cho replay/reveal owner. Replay sau phiên đóng trả410 SESSION_EXPIRED; sau rotate trả409 thay vì PIN lỗi thời. Hai key mở cùng bàn có một201, một409. Missing/outside table404 RESOURCE_NOT_FOUND; inactive409 INVALID_STATE_TRANSITION; rate owner-write. Event table_session.opened không chứa credential. Không secret URL query/print list.

### P2-HF01 — explicit owner PIN reveal/rotate

These two additive routes require owner Auth/membership, same-origin POST JSON<=4KiB, strict input, no query parameters, private/no-store and Vary Cookie/Origin. No GET or prefetch endpoint. Session IDs are UUIDs.

- POST `/api/owner/table-sessions/:id/pin/reveal`, body `{}` →200 `ApiSuccess<OwnerTablePinView>` with sessionId,sessionVersion,pin,pinFormat=numeric_6,generation,issuedAt,expiresAt. Only open/unexpired PIN sessions; legacy→409 INVALID_STATE_TRANSITION. Audits PIN_REVEALED without value.
- POST `/api/owner/table-sessions/:id/pin/rotate`, body `RotateTablePinInput` = `{requestId:UUID,expectedVersion:positiveSafeInteger,confirm:true}` →200 same private view. Converts legacy or changes PIN to a different value atomically; retains sessionId, orders, guest grants and original expiry. Stale version→409 INVALID_STATE_TRANSITION. Changed action/session/version with reused key→409 DUPLICATE_REQUEST_CONFLICT; another actor403. Same key replays current generation only; superseded key409; closed/expired410; checkout_pending409.

Errors use standard envelope:400 VALIDATION_ERROR,401 UNAUTHORIZED,403 FORBIDDEN,404 RESOURCE_NOT_FOUND,409 INVALID_STATE_TRANSITION/SESSION_CHECKOUT_PENDING/DUPLICATE_REQUEST_CONFLICT,410 SESSION_EXPIRED,429 RATE_LIMITED with Retry-After,500 INTERNAL_ERROR sanitized. No PIN in public/list/order/menu/URL/log/outbox. Optional owner session.pinState=legacy|active|expired contains no secret; checkout_pending is separate session.status. Full deployment, key/rate policy, typed exports and evidence: docs/integration/P2_HF01_CODEX_PIN_HANDOFF.md.

## R13 — POST /api/owner/table-sessions/:id/settle

O; path session; `SettleSessionInput` tagged union required requestId + action + expectedVersion. `action=begin_checkout`: open→checkout_pending, lock session chặn order mới, trả bill snapshot; `cancel_checkout`: checkout_pending→open nếu chưa settlement success; `confirm_received`: chỉ checkout_pending và mọi non-cancelled order completed theo ASSUMPTION Q6, required `paymentMethod:cash|bank_transfer`. Không nhận totalVnd client, không guest set paid. UI luôn begin trước confirm, không direct open→confirm. Tính bill từ snapshots, settlement success+close+revoke+version changes/audit/outbox cùng transaction; một success/phiên. Không thu tiền qua takeaway provider.

200 SettleSessionView. Ví dụ phiên trống được đóng 0 VND (ASSUMPTION Q6), còn phiên có đơn phải trả đầy đủ orders trong detail và tổng khớp:

<!-- contract: ApiSuccess<SettleSessionView> -->
```json
{"data":{"detail":{"table":{"id":"table-05","label":"Bàn 05"},"session":{"id":"session-05","status":"closed","openedAt":"2026-10-23T02:50:00Z","closedAt":"2026-10-23T04:00:00Z","orderCount":0,"totalVnd":0,"paymentStatus":"paid","version":3},"orders":[]},"settlement":{"id":"settlement-05","tableSessionId":"session-05","totalVnd":0,"paymentMethod":"cash","status":"succeeded","settledAt":"2026-10-23T04:00:00Z"}},"error":null}
```

Begin/cancel thành công cùng envelope, settlement=null, session status đúng transition; không tạo row settlement success. Duplicate same key sau close trả command result, không thu lại; khác key closed→409 INVALID_STATE_TRANSITION. 404 RESOURCE_NOT_FOUND; 409 stale version/open orders/already settled hoặc DUPLICATE_REQUEST_CONFLICT. Race gọi thêm dùng session lock, winner xác định rõ ở Security. Rate owner-write; event table_session.updated/closed; settlement success làm order.paymentStatus suy ra paid, phải tăng các order version/updatedAt và phát invalidation đúng scope, không đổi ticket/status completed.

## R14 — GET /api/owner/menu

O; optional query `includeInactive:boolean` default true; không body. 200 OwnerMenuView, giữ cả unavailable để owner bật lại; includeInactive=false lọc inactive items/categories. Categories là dữ liệu đã cấu hình, CRUD category bổ sung phải CONTRACT_REQUEST, không giả route generic làm được mọi thứ.

<!-- contract: ApiSuccess<OwnerMenuView> -->
```json
{"data":{"categories":[{"id":"category-coffee","name":"Cà phê","sortOrder":1,"active":true}],"items":[{"id":"item-coffee","categoryId":"category-coffee","name":"Cà phê sữa","description":null,"priceVnd":29000,"imageUrl":null,"available":true,"options":[],"updatedAt":"2026-10-23T02:00:00Z","active":true}],"menuRevision":"menu-r7","serverTime":"2026-10-23T03:00:00Z"},"error":null}
```

Empty 200 arrays []. 400 invalid query; O errors; rate owner-read; không event. Option.available map active giữ baseline; item.active riêng với available.

## R15 — POST /api/owner/menu

O; CreateMenuItemInput required requestId UUID và mọi MenuItemFields: categoryId ID, name trimmed 1–120, description string<=1000|null, priceVnd safe integer >=0, imageUrl HTTPS allowlisted approved asset|null, available bool, active bool, options array. Option write required name 1–120, priceDeltaVnd>=0, available bool; create option không id (nếu id ở create→422). Không file upload/multipart, không URL fetch tùy ý/SSRF. Category thuộc store và active; validation nghiệp vụ 422 VALIDATION_ERROR; outside/missing category 404 RESOURCE_NOT_FOUND. Backend sinh item/options IDs.

201 OwnerMenuItem; unique requestId chống item trùng; cùng transaction insert/bump menuRevision/audit/outbox. Ví dụ response:

<!-- contract: ApiSuccess<OwnerMenuItem> -->
```json
{"data":{"id":"item-coffee","categoryId":"category-coffee","name":"Cà phê sữa","description":null,"priceVnd":29000,"imageUrl":null,"available":true,"options":[],"updatedAt":"2026-10-23T02:00:00Z","active":true},"error":null}
```

400 sai schema, 409 DUPLICATE_REQUEST_CONFLICT, O/429/500; rate owner-write; menu.updated sau commit. UI refetch menu lấy revision mới; snapshot order cũ bất biến.

## R16 — PATCH /api/owner/menu/:id

O; PatchMenuItemInput required requestId, expectedUpdatedAt ISO từ lần GET; optional từng MenuItemFields nhưng **ít nhất một field thay đổi**. Null chỉ cho description/imageUrl. Nếu gửi options, replace danh sách active: option id existing phải cùng item/store; thiếu id tạo mới, option bị bỏ khỏi array được deactivate, giữ lịch sử. Không rename physical fields thành qty/active option trong DTO. CAS updatedAt dưới lock + menu revision khóa để serialize với submit; DB sinh updatedAt phân biệt mọi lần update, serialize đủ độ chính xác ISO.

<!-- contract: ApiSuccess<OwnerMenuItem> -->
```json
{"data":{"id":"item-coffee","categoryId":"category-coffee","name":"Cà phê sữa","description":null,"priceVnd":31000,"imageUrl":null,"available":false,"options":[],"updatedAt":"2026-10-23T03:10:00Z","active":true},"error":null}
```

200; 404 RESOURCE_NOT_FOUND item ngoài quán/missing; 409 INVALID_STATE_TRANSITION stale expectedUpdatedAt → refetch giữ editor, không đè tab khác; 409 key conflict; 422 option/category/price business validation; rate owner-write; event menu.updated. Không hard delete hoặc sửa snapshot đơn cũ. Replay kiểm trước timestamp stale guard.

## R17 — GET /api/owner/qr-codes

O; không query/body. 200 QRCodeView[] bao gồm active/inactive để quản lý. `path` relative `/q/<publicCode>` được server encode đúng, UI render QR từ path+origin trusted, không bearer secret. Table code fixed không chứa session secret. Không route download PDF; browser print existing QR là presentation, nếu muốn server PDF phải CONTRACT_REQUEST.

<!-- contract: ApiSuccess<QRCodeView[]> -->
```json
{"data":[{"id":"qr-table05","publicCode":"TABLE_05_PUBLIC","path":"/q/TABLE_05_PUBLIC","active":true,"type":"table","table":{"id":"table-05","label":"Bàn 05"}},{"id":"qr-counter","publicCode":"COUNTER_PUBLIC","path":"/q/COUNTER_PUBLIC","active":true,"type":"takeaway","table":null}],"error":null}
```

Empty 200 []; O errors/429; rate owner-read; không event.

## R18 — POST /api/owner/qr-codes

O; QRCodeWriteInput required requestId và action. Create: type=table + tableId required ID; hoặc type=takeaway + tableId=null; server sinh publicCode unique, client không chọn secret/code/store. Set_active: id+active bool, không đổi type/table/publicCode. Không xóa QR lịch sử. Một active QR chuẩn mỗi bàn và một active takeaway/store là **ASSUMPTION kỹ thuật**; tạo thêm khi đã active→409 INVALID_STATE_TRANSITION. Disable QR không tự hủy order đã commit hoặc revoke phiên đang dùng cho tracking; chặn resolve/new submit, webhook hợp lệ của intent cũ vẫn xử lý.

<!-- contract: ApiSuccess<QRCodeView> -->
```json
{"data":{"id":"qr-counter","publicCode":"COUNTER_PUBLIC","path":"/q/COUNTER_PUBLIC","active":false,"type":"takeaway","table":null},"error":null}
```

201 create/200 set_active; 404 RESOURCE_NOT_FOUND id/table ngoài store/missing; 409 conflict/live duplicate/key payload đổi; 422 inactive table; O/429/500; rate owner-write; event qr.updated. Idempotency mọi action.

## R19 — GET /api/owner/settings

O; không query/body, single-store lấy từ membership. 200 StoreSettingsView: metadata adapter đã lọc, provider nullable vì chưa chọn. connectionStatus=verified chỉ bằng chứng đã nhận event hợp lệ, **không cam kết kết nối đang khỏe**; lastVerifiedWebhookAt không chứa amount/account/credential.

<!-- contract: ApiSuccess<StoreSettingsView> -->
```json
{"data":{"store":{"id":"store-demo","name":"Quán Demo","timezone":"Asia/Ho_Chi_Minh","acceptingOrders":true},"paymentProvider":{"provider":null,"connectionStatus":"not_configured","lastVerifiedWebhookAt":null},"updatedAt":"2026-10-23T02:00:00Z"},"error":null}
```

O errors/429/500; rate owner-read; không event, không probe ngân hàng/provider. Logo/address/openingHours chưa có field được duyệt, ghi CR-UI-08; không bịa đủ data cho form.

## R20 — PATCH /api/owner/settings

O; PatchStoreSettingsInput required requestId + expectedUpdatedAt ISO; optional name:string 1–120, acceptingOrders:boolean; phải có ít nhất một field; timezone/provider/secrets không được ghi từ form này. Server config secrets ngoài API UI. CAS snapshot, update+audit+outbox+idempotency result atomic. Tạm ngừng chặn order mới nhưng không xóa queue/intent hoặc hủy tiền đang về; Q7 ASSUMPTION giữ nghĩa này.

<!-- contract: ApiSuccess<StoreSettingsView> -->
```json
{"data":{"store":{"id":"store-demo","name":"Quán Demo","timezone":"Asia/Ho_Chi_Minh","acceptingOrders":false},"paymentProvider":{"provider":null,"connectionStatus":"not_configured","lastVerifiedWebhookAt":null},"updatedAt":"2026-10-23T03:10:00Z"},"error":null}
```

200; 409 INVALID_STATE_TRANSITION stale updatedAt hoặc DUPLICATE_REQUEST_CONFLICT; 422 invalid name; 400 extra/disallowed fields; O/429/500; rate owner-write; store.updated sau commit. Toggle không optimistic success trước response.

## R21 — POST /api/webhooks/payments/:provider

W server-to-server. Path provider=payos|sepay nhưng chỉ provider configured được nhận; chưa chọn vendor. Body/headers là **raw wire schema theo tài liệu provider**, không ép camelCase vào chữ ký payload gốc; đó là ngoại lệ wire rõ ràng. Adapter normalize **nội bộ sau verify** các field bắt buộc: providerEventId:string, providerTransactionId:string, merchantRef:string, amountVnd:integer, currency:string (phải VND khi success), paid:boolean, occurredAt:ISO. Không định nghĩa fake chữ ký HMAC/SDK shape để pretend callable. Auth phải kiểm signature scheme + merchant account, timestamp/replay rule nếu provider hỗ trợ, raw bytes đúng trước parse tin cậy. Provider wire schema/ACK là **BLOCKER PG-01** trước integration thật, không chặn mock application contract.

Sau verify: transaction dedupe `(provider,eventId)` và `(provider,transactionId)`, lock intent/order, check amount/currency/ref/status/DB expiry, ledger + succeeded + FIFO counter + accepted + pickup hash/encrypted delivery + version + audit/outbox atomic. Cùng order chỉ một ticket; unknown ref/mismatch/late→protected evidence, không queue. Return URL không gọi endpoint set-paid. Success đã commit không bị failure event đến muộn hạ trạng thái.

200 application ACK ví dụ đầy đủ, không trả order/secret về provider:

<!-- contract: ApiSuccess<WebhookReceipt> -->
```json
{"data":{"received":true,"outcome":"accepted"},"error":null}
```

Duplicate committed→200 outcome=duplicate; recorded mismatch/late→200 recorded_exception **chỉ sau lưu evidence**, không paid. Unsupported/invalid schema→400 VALIDATION_ERROR; invalid signature/merchant auth→401 UNAUTHORIZED; provider không configured→404 RESOURCE_NOT_FOUND; DB transient→500 INTERNAL_ERROR để retry, không ACK sớm. Rate W tách public browser; 429 theo adapter Retry-After nếu hỗ trợ, không dùng bucket guest IP chung.

**ACK trên là application contract v1-draft; provider wire ACK mapping bắt buộc chốt PG-01 trước expose webhook.** Nếu provider yêu cầu format khác, adapter đổi ở boundary, không giả tất cả provider nhận cùng envelope. Webhook business rejection không báo lỗi cho browser bằng status webhook: browser GET R05/R06 thấy snapshot exception; command nghiệp vụ lỗi vẫn non-2xx. Không 200 chứa ApiFailure.

### Ca quan trọng: paid → accepted + ticket đúng một lần

Trước: R04 order-T pending, intent-T pending, ticket=null. Verified event E1/transaction TX1 khớp 35.000 VND trước expiresAt; DB cấp ticket 29 lúc 03:00:01Z. Sau commit, **GET R05** trả đầy đủ OrderDetail accepted/paid tại EXAMPLES §10 (không phải response webhook). Gửi lại E1 hoặc E2 cùng TX1 trả ACK duplicate, không tăng counter/order version/tạo credential mới. UI refetch từ private event `order.accepted`; không tự đổi sang accepted dựa ACK hoặc return URL.

## Bảng lỗi chung: HTTP → UI action

| HTTP | Code | Khi nào / UI |
|---|---|---|
| 400 | VALIDATION_ERROR | Schema/query sai; sửa input, không retry mù |
| 401 | UNAUTHORIZED | Thiếu/hết auth cookie hoặc signature; owner login lại; guest xác minh lại scope, webhook không qua browser |
| 403 | FORBIDDEN, SESSION_REQUIRED | Có credential nhưng sai quyền hoặc chưa verify bàn; giữ cart, verify/liên hệ quán |
| 404 | INVALID_QR, ORDER_NOT_FOUND, RESOURCE_NOT_FOUND | Locator missing/outside store/scope; không lộ tenant/resource |
| 409 | OUT_OF_STOCK, PRICE_CHANGED | Refetch menu, giữ cart, yêu cầu xác nhận trước key mới |
| 409 | SESSION_CHECKOUT_PENDING, INVALID_STATE_TRANSITION | Không tự chuyển status; refetch snapshot/owner hỗ trợ |
| 409 | PAYMENT_PENDING, PAYMENT_MISMATCH | Command không đủ điều kiện, đọc payment state/đối soát; không trả tiền thêm |
| 409 | DUPLICATE_REQUEST_CONFLICT, STORE_NOT_ACCEPTING_ORDERS | Khôi phục key/input cũ hoặc dừng submit mới, không sinh key tự động để né |
| 410 | SESSION_EXPIRED, PAYMENT_EXPIRED | Giữ HTTP P0-C01 để không drift; phiên/mã/payment đã hết hiệu lực. GET payment có snapshot expired vẫn 200; command đòi tài nguyên còn hiệu lực mới 410 |
| 422 | INVALID_SESSION_CODE, INVALID_PICKUP_CODE, VALIDATION_ERROR | Dữ liệu đúng schema nhưng không hợp lệ nghiệp vụ; giữ input theo UX, không lộ credential |
| 429 | RATE_LIMITED | Backoff theo header/details, không reset requestId |
| 500 | INTERNAL_ERROR | Lỗi đã sanitize; chưa biết commit thì retry **cùng key** rồi refetch |

Các status 410 được giữ từ P0-C01 ngoài danh sách status tối thiểu của prompt, lý do/changelog ở Review. Error details allowlist types.ts, không stack/SQL/raw provider/secret. Ví dụ failure đầy đủ:

<!-- contract: ApiFailure -->
```json
{"data":null,"error":{"code":"DUPLICATE_REQUEST_CONFLICT","message":"Mã yêu cầu đã được dùng với nội dung khác. Vui lòng khôi phục thao tác trước."}}
```
