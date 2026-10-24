# VOICE — AUDIT 01 — CODEX: audit kỹ thuật sự kiện và khả năng thông báo bằng giọng nói

**Phạm vi:** `AUDIT_ONLY` — khảo sát source hiện có và đề xuất contract; chưa tích hợp voice/TTS.

**Thời điểm audit:** 2026-10-24 10:44 UTC
**Commit được kiểm tra:** `32bf0319081ff4efd688ec895274c73f02229cf1`
**Working tree khi audit:** có thay đổi từ công việc khác ở `README.md`, `src/components/owner/orders/OwnerOrdersView.tsx` và file mới `tests/ui/owner/owner-orders-filter-reset.test.ts`; audit này không sửa các file đó.
**Kết luận bước tích hợp:** `NO-GO` ở trạng thái hiện tại. Database đã ghi event metadata và các màn hình có polling/re-sync, nhưng chưa có publisher/subscriber Realtime riêng, chưa có private event delivery contract và chưa có UX/permission contract cho speech.

Đây là audit của **source checkout**, không phải audit catalog PostgreSQL đang deploy. Không kết nối production, không phát webhook/provider payment, không đo audio thật. Các PASS dưới đây chứng minh code path/definition đang có trong repo; kết quả QA cũ trong report không được coi là test đã chạy lại trong audit này.

## 1. Phạm vi và cách kiểm tra

Tài liệu này thực hiện đúng prompt `VOICE — AUDIT 01 — CODEX`. Tôi đã đọc `README.md`, `PRD.md`, `UI.md`, `ARCHITECTURE.md`, các handoff/report Phase 3–6, source client/server, migrations chứa state transition và `package.json`. Tôi tìm các điểm ghi `order_events`/`outbox_events`, các route API, polling/reconnect, auth scope, toast/audio và browser speech API. Không cài package, không sửa migration, không thêm API/listener/cron/UI.

Các nhãn trong báo cáo:

- **PASS:** có bằng chứng trực tiếp trong source đã kiểm tra.
- **NOT IMPLEMENTED:** nghiệp vụ hoặc hạ tầng chưa tồn tại trong code hiện tại.
- **NOT TESTED:** chưa có bằng chứng test ở phạm vi đó; không suy đoán thành hỗ trợ.
- **BLOCKED:** chưa thể an toàn để tích hợp vì thiếu điều kiện bắt buộc.

Package manager hiện là `npm@10.9.2`, Node `>=22.13.1 <23` (`package.json:6-10`). Scripts gồm `lint`, `typecheck`, `test:auth`, `test:db`, `test:http`; unit/UI/integration có Vitest config riêng trong `tests`. Audit không chạy build hay test DB vì không thay runtime, không tạo fixture nghiệp vụ. Kiểm tra bàn giao chỉ gồm whitespace, UTF-8, link/path và phạm vi file thay đổi.

Nguồn lịch sử đã đối chiếu: `docs/integration/P3_C01_ORDER_FIFO_HANDOFF.md`, `P3_C02_OWNER_QUEUE_HANDOFF.md`, `P3_C03_CODEX_E2E_HANDOFF.md`; `docs/handoffs/P4_C01_CODEX_PAYMENT_HANDOFF.md`, `P4_C03_CODEX_PICKUP_HANDOFF.md`, `P4_C04_CODEX_TAKEAWAY_E2E_QA_REPORT.md`; các report P5-C01/C02, P5-G01/G02, P6-C02/G02; các report pickup HF02, closed-session receipt HF01 và owner HF01 trong `docs/reports`. Report cũ có thể dùng tên “Sonner” hoặc “Realtime” rộng hơn implementation; kết luận bên dưới ưu tiên source hiện tại.

Tài liệu UX thực tế tìm thấy là `docs/audits/VOICE_A01_GEMINI_NOTIFICATION_UX_AUDIT.md`; tên `VOICE_A01_GEMINI_AUDIT_NOTIFICATION_UX.md` trong prompt không tồn tại. Không tìm thấy source runtime voice để chạy thử. Không thiếu repository hoặc source nghiệp vụ chính.

## 2. Tóm tắt phát hiện

1. PostgreSQL là nguồn sự thật. `order_events` lưu `id`, `event_type`, `version`, `created_at`; `outbox_events` lưu event id/topic/aggregate/version và payload metadata. Nhiều transaction đã ghi event sau khi thay đổi trạng thái.
2. Không tìm thấy `supabase.channel`, `postgres_changes`, broadcast subscriber, publisher outbox, `speechSynthesis`, `SpeechSynthesisUtterance`, audio player, TTS provider, notification permission hay push integration trong source hiện tại. **Realtime voice delivery: NOT IMPLEMENTED.**
3. Owner orders, customer order tracking, bill và takeaway payment đang refetch/polling. Toast hiện là React state hoặc ref key cục bộ; không phải event identity bền vững.
4. Guest có cookie browser context, grant proof và route authorization; owner có Supabase Auth + membership/store check. Mọi future speech delivery phải tái kiểm tra `store_id`, `table_session_id` và `order_id` tại server/private channel.
5. Event payload hiện chỉ có metadata an toàn (`eventId`, aggregate, version, type); không nên mở rộng payload bằng PIN, pickup code, token, payment reference/account hoặc full bill.

## 3. Đường đi event thực trong source

| Nghiệp vụ | Nguồn/DB state đã xác minh | Cách client nhận hiện tại | Đối tượng dự kiến | Notification hiện có |
|---|---|---|---|---|
| Dine-in submit được chấp nhận | `supabase/migrations/20261023000700_dine_in_orders_fifo.sql:169-269`: kiểm tra guest scope, cấp FIFO trong transaction, insert `orders.status='accepted'`, `order.created` + `order.accepted` vào `order_events`/`outbox_events`. | `src/components/customer/order/OrderTrackingView.tsx` refetch theo chu kỳ khi tab visible; không có channel subscriber. | Guest đúng table session; owner đúng store. | UI order confirmation/tracking; **không có speech**. |
| Owner claim FIFO | `supabase/migrations/20261024001200_payment_review_queue.sql:176-185` (cùng logic owner queue): cập nhật `accepted → preparing`, ghi `order.preparing`, version/before/after state và outbox. | `src/components/owner/orders/OwnerOrdersView.tsx:214-324` polling owner orders; thao tác POST trả snapshot. | Owner của store. | Toast cục bộ dùng cho đơn mới; hành động của chính owner không được đọc lại. |
| Owner đánh dấu ready/completed | Cùng function ở `supabase/migrations/20261024001200_payment_review_queue.sql:176-185`, topic theo action là `order.ready` hoặc `order.completed`; takeaway complete được chặn trong owner queue để đi qua pickup flow. | Owner view refetch sau command và timer; customer tracking poll snapshot. | Owner; guest đúng order/session. | Visual status/ toast; **không có speech**. |
| Takeaway tạo payment intent | `supabase/migrations/20261024001000_takeaway_payments.sql:210-271` tạo order `pending_payment` và intent; chưa có FIFO. | `src/components/customer/payment/TakeawayPaymentView.tsx:83-195` polling payment (5 giây, nhanh hơn khi thiếu instructions). | Guest đúng browser/order capability; owner store view. | Nhãn pending/QR; **không đọc “đã thanh toán” từ redirect**. |
| Takeaway webhook hợp lệ → paid + FIFO | `supabase/migrations/20261024001200_payment_review_queue.sql:198-257`: lock inbox/store/intent/order, kiểm tra merchant/link/amount/currency/time, insert payment, set intent succeeded, set order accepted/ticket, ghi `payment.succeeded`, `order.accepted`, outbox `payment.updated`/`order.accepted`. | Takeaway payment view tiếp tục poll backend status; owner orders poll. | Guest đúng order; owner đúng store. | Visual paid/accepted; **chưa có event delivery hay speech**. |
| Payment exception/review | `supabase/migrations/20261024001200_payment_review_queue.sql:229-245`: set reconciliation/exception và phát `payment.exception` hoặc `payment.review_required`; không downgrade payment đã paid. | Owner queue `exceptions` qua poll; guest thấy trạng thái payment/review. | Owner đúng store; guest chỉ status của order mình. | Visual exception; voice chỉ đề xuất P1. |
| Takeaway expiry | `supabase/migrations/20261024001200_payment_review_queue.sql:300-307`: pending hết hạn chuyển expired/exception, order cancelled/payment_exception, emit `payment.expired` hoặc `payment.exception`. | Payment polling và owner polling. | Guest order; owner store. | Visual expiry; **không đọc mặc định**. |
| Mở table session | `supabase/migrations/20261023000300_table_sessions_guest_access.sql:172-186`: mở session, tạo guest access và outbox `table_session.opened`. | QR resolver/session verification request; không có event subscriber. | Owner và guest được cấp session. | Visual session state. |
| Dine-in begin/confirm settlement, close | `supabase/migrations/20261024001500_dinein_session_settlement.sql:242-256`: settlement thành công, close session, emit order payment updates và `table_session.closed`/updated. | Owner settlement refetch; customer bill polling/recovery listener (`src/components/customer/bill/useCustomerTableBill.ts:180-238`). | Owner store; khách đã có capability phiên. | Bill paid toast ở `TableBillSheet.tsx:122-135`; không có speech. |
| Paid receipt sau close | `supabase/migrations/20261024001600_closed_session_receipts.sql:78-123`: tạo immutable `session_receipts`, copy đúng guest access trước revoke ordering, outbox `table_session.receipt_ready` chỉ chứa metadata. | `src/features/customer/api-client.ts:83-90` gọi receipt route; billing service kiểm tra browser/proof; recovery qua visibility/online. | Chỉ browser capability của session cũ; khách mới bị từ chối. | Receipt/thank-you UI; **không đọc mặc định**. |
| Pickup credential được cấp | `supabase/migrations/20261024001100_takeaway_pickup.sql:180-180` (và alias repair 013): `pickup.issued`; credential ciphertext không đưa vào outbox. | `src/server/pickup/service.ts` issue/recovery, `OrderTrackingView` private tracking fallback. | Guest đúng order; owner chỉ dùng verification path. | Visual pickup card; **không bao giờ đọc code**. |
| Pickup hoàn tất | `supabase/migrations/20261024001100_takeaway_pickup.sql:216-219` (alias repair tương ứng): verify HMAC/code server-side, set `completed`, emit `order.completed`. | Owner action response + guest order poll. | Owner đúng store; guest đúng order. | Visual completed/thank-you; voice chỉ P1 tùy opt-in. |
| Stop accepting orders / capacity | `supabase/migrations/20261024001700_capacity_admission_rate_limits.sql:58-73,108-155` thêm admission flags/rate policy; `p6_ordering_execute` và `p6_availability` trả state. Không có domain event riêng cho overload/cooldown. | Settings/menu/order API refetch; không có overload event stream. | Guest theo order type; owner store. | Availability banner/validation; **voice event NOT IMPLEMENTED**. |
| Guest assistance / yêu cầu nhân viên | Tìm toàn bộ source/migrations không thấy bảng, route, function hay topic assistance. | Không có. | Guest/owner. | **NOT IMPLEMENTED.** |

`order_events` và `outbox_events` là evidence sau commit trong transaction, nhưng repository chưa có worker/publisher đọc outbox. Vì vậy hiện tại không thể coi outbox là một luồng notification đã giao tới trình duyệt.

### 3.1 Điểm đọc và client/server boundary

| Bề mặt | Evidence hiện tại | Giới hạn đối với speech |
|---|---|---|
| Owner orders | `src/components/owner/orders/OwnerOrdersView.tsx:230-245,287-324,452-470`: snapshot mới qua API, gộp `freshAccepted`, poll 6 giây, backoff và online/visibility. `:135-143` là Set ID/toast state. | Đổi filter có thể lộ một accepted order chưa từng có trong Set dù đơn đã cũ. Pagination/refresh và reconnect không phải new business event. |
| Owner tables | `src/components/owner/OwnerShell.tsx:94-175`: fetch tables/QR khi vào tab, manual refresh/retry và callbacks sau mutation; `TableManagementView.tsx:171-179` là toast local. `TableBillSettlementSheet.tsx:194-202,292-319` refetch bill sau command/conflict. | Không thấy continuous table event subscription hoặc polling loop riêng tại các điểm này; không được giả định mọi thay đổi bàn đang được push. |
| Guest tracking | `src/components/customer/order/OrderTrackingView.tsx:239-305,320-366,405-431`: private tracking, fallback authorized order GET, bounded retries, visible/online re-sync; dừng khi terminal. | Private pickup failure không đồng nghĩa order sai; không đọc pickup delivery hoặc giữ code cũ. |
| Guest bill/receipt | `src/components/customer/bill/useCustomerTableBill.ts:87-123,142-171,180-238`: pin sessionId, giữ paid snapshot khi gặp stale unpaid, clear data khi auth/expiry lỗi; dừng interval khi paid nhưng giữ recovery listeners. | Không phát từ stale cache; lúc dequeue phải còn capability. Receipt của session cũ khác ordering grant đã revoke. |
| Guest payment | `src/components/customer/payment/TakeawayPaymentView.tsx:94-105,145-180`: 2/5 giây poll DB payment, sau paid fetch order. | Hai response riêng biệt có thể khác thời điểm; trước speech phải kiểm paid **và** reconciliation/accepted/ticket trên snapshot phù hợp. |
| Browser-local sync | `src/components/customer/order/active-order-storage.ts:16-23,55-64,104-123`: `sessionStorage`, `CustomEvent`, `storage` handler. | Chỉ sync cục bộ, không phải backend broadcast. `sessionStorage` không chia sẻ giữa mọi tab độc lập; không dùng làm cross-tab audible leader hay authority. |

`src/app/(owner)/dashboard/page.tsx:29-69` là async Server Component lấy owner/store; `src/components/owner/OwnerShell.tsx:1` là client boundary. `src/app/(customer)/order/[id]/page.tsx:24-37` chỉ render client `OrderTrackingView`; các tracking/payment/bill component có `use client`. Browser speech chỉ được probe sau mount trong client effect/explicit click handler, không truy cập `window` khi import module hay trong SSR/render. Server services dùng `server-only` (ví dụ `src/server/orders/service.ts:1`); không được kéo chúng vào client hook.

`supabase/config.toml:20-21` đặt local Realtime `enabled=false`; script `supabase:start` cũng loại realtime. Bật dịch vụ không tự tạo publisher, private authorization hoặc listener.

### 3.2 Event identity và timestamp thực

`outbox_events` có `id`, `topic`, `aggregate_id`, `version`, `payload`, `created_at`, `published_at`, `attempt_count` (`supabase/migrations/20261023000300_table_sessions_guest_access.sql:63-72`). `order_events` có id/version/created_at và unique `(order_id,version,event_type)` (`supabase/migrations/20261023000700_dine_in_orders_fifo.sql:82-87`). `orders.version` tăng qua guard; `updated_at` được DB gán (`:99-104`). Không có field `changedAt` thống nhất trên mọi DTO.

- `p4_emit` dùng **cùng UUID** cho order event và outbox (`supabase/migrations/20261024001200_payment_review_queue.sql:43-48`), nhưng dine-in create và Takeaway success sinh UUID độc lập cho hai bảng (`supabase/migrations/20261023000700_dine_in_orders_fifo.sql:265-268`, `supabase/migrations/20261024001200_payment_review_queue.sql:252-255`). Không join hai bảng bằng giả định event id bằng nhau.
- Dine-in `order.created` và `order.accepted` có cùng order version 1, nhưng là hai topic; chỉ `order.accepted` tạo new-order speech.
- Takeaway `payment.updated` có aggregate là **intent id nhưng version lấy từ order** (`supabase/migrations/20261024001200_payment_review_queue.sql:253-255`), không phải intent revision độc lập. Chỉ dùng nó làm invalidation hint; không dùng watermark đó như payment state machine.
- `pickup.issued` có thể dùng cùng order version với status trước đó; `table_session.closed` và `table_session.receipt_ready` cũng có thể cùng session version. Dedupe/watermark phải gồm topic hoặc semantic notification kind; không drop mọi event chỉ vì aggregate version bằng nhau.
- `created_at` là thời điểm insert DB, không chứng minh commit order giữa transaction. `paid_at`/provider occurredAt là evidence giao dịch, không thay FIFO acceptance order. Dùng `eventId` để dedupe, version theo đúng aggregate và GET snapshot để quyết định trạng thái; cần thiết kế cursor/replay, không lấy `created_at` đơn độc làm global sequence.

## 4. Ma trận sự kiện đã chỉnh theo code

### 4.1 Owner

| Event/điều kiện | Mức đề xuất | Mẫu tiếng Việt an toàn | Điều kiện phát |
|---|---|---|---|
| Dine-in `order.accepted` mới | **P0 MUST SPEAK** | “Có đơn mới tại bàn 5, số 25.” | Chỉ sau event/snapshot server mới, đúng store; không phát initial snapshot/hydration/refresh. |
| Takeaway payment verified + `order.accepted` | **P0 MUST SPEAK** | “Có đơn mang đi mới, số 26, đã thanh toán.” | Chỉ sau webhook/DB commit thành công; không phát lúc tạo intent, redirect hoặc webhook lặp. |
| Khách yêu cầu thanh toán bàn | **NOT IMPLEMENTED** | “Bàn 5 yêu cầu thanh toán.” | Chưa có event thật; không tạo event trong audit. |
| Quá tải/hàng đợi vượt ngưỡng | **NOT IMPLEMENTED / VISUAL ONLY** | “Quán đang có nhiều đơn chờ.” | Có admission/rate limit nhưng chưa có threshold event/policy delivery; chỉ banner khi có state thật. |
| `payment.exception`/`payment.review_required` | **P1 OPTIONAL** | “Có giao dịch cần đối soát.” | Đúng store, event mới, không đọc amount/reference/account/code. Cooldown dài. |
| `order.ready`/`order.completed` do chính owner vừa bấm | **VISUAL ONLY** | — | Tránh đọc lại thao tác của người vừa thực hiện. |
| Menu/search/tab/refresh/reconnect/history | **NEVER SPEAK** | — | Không phải domain event cần tiếng. |

### 4.2 Khách dine-in

| Event/điều kiện | Mức đề xuất | Mẫu tiếng Việt an toàn | Điều kiện phát |
|---|---|---|---|
| Server commit order accepted | **P1 OPTIONAL** | “Đặt món thành công, số 25.” | Chỉ khi thiết bị đã opt-in; đúng guest capability/session; không dùng optimistic response. |
| `order.ready` | **P1 OPTIONAL / VISUAL ONLY** | “Món của bạn đã sẵn sàng.” | Chỉ khi quán có quy trình để khách tự nhận; nếu nhân viên mang món thì visual đủ. |
| Paid closed session / `table_session.receipt_ready` | **P0 nếu bật tiếng** | “Bàn của bạn đã thanh toán. Cảm ơn quý khách!” | Chỉ capability của session cũ; paid receipt phải được server xác thực; không yêu cầu PIN mới. |
| Preparing/waiting/add item/PIN sai | **VISUAL ONLY** | — | Tránh đọc liên tục và tránh lộ secret. |
| Session expired/offline/reload | **VISUAL ONLY** | — | Banner/toast và nút retry. |

### 4.3 Khách takeaway

| Event/điều kiện | Mức đề xuất | Mẫu tiếng Việt an toàn | Điều kiện phát |
|---|---|---|---|
| Verified payment + accepted ticket | **P0 nếu bật tiếng** | “Thanh toán thành công, đơn số 26.” | Đúng browser/order capability; server status succeeded; không tin redirect. |
| `order.ready` | **P0 nếu bật tiếng** | “Đơn số 26 đã sẵn sàng, vui lòng đến quầy nhận món.” | Đúng order; không đọc pickup code. |
| Pickup completed | **P1 OPTIONAL** | “Cảm ơn quý khách, hẹn gặp lại!” | Sau backend completion; một lần. |
| Pending/timeout/failed/reconciliation | **VISUAL ONLY** | — | Không gây hiểu nhầm đã trả tiền hoặc thúc trả lại. |
| Preparing/polling/refresh/copy code/add to cart | **VISUAL ONLY** | — | Không phải notification cần speech. |

## 5. Ma trận điều kiện kích hoạt tiếng

| Tình huống | Hành vi hiện tại | Policy voice đề xuất | Trạng thái |
|---|---|---|---|
| Initial page load/hydration | API trả snapshot; owner dùng `hasLoadedOnceRef`, customer render snapshot. | Không phát; chỉ event transition mới sau khi baseline đã đặt. | PASS cho baseline hiện tại; voice **NOT IMPLEMENTED**. |
| Reload | Poll/refetch lại cùng state. | Không phát lại; event identity phải nằm ngoài render lifecycle. | BLOCKED cho tích hợp nếu chưa có cursor/dedupe. |
| Reconnect/online/visibility | `OwnerOrdersView` và bill/order tracking fetch lại; bill giữ recovery listeners. | Fetch snapshot để reconcile, không phát snapshot cũ; chỉ phát event có sequence/version mới. | PASS cho re-sync visual; speech **NOT IMPLEMENTED**. |
| Tab focus | Gọi refetch khi visible. | Không phát do focus riêng. | NOT IMPLEMENTED. |
| Payment webhook lặp | DB processor trả duplicate/transaction replay; không tạo ledger/ticket mới. | Không đọc; chỉ event first accepted mới đủ điều kiện. | PASS DB idempotency; voice delivery **NOT IMPLEMENTED**. |
| Hai owner tab | Cùng polling cùng store; toast có thể hiện ở mỗi tab. | Một audible leader qua `BroadcastChannel`/Web Locks + heartbeat; visual vẫn ở mọi tab. | NOT IMPLEMENTED. |
| Guest current và old session | Receipt path giữ capability cũ và chặn guest mới; QR là locator, không phải quyền. | Speech chỉ theo `sessionId/orderId` đã authorize trong event; old guest có thể nghe receipt của chính session cũ khi opt-in. | PASS authorization evidence; voice channel NOT IMPLEMENTED. |
| Event out-of-order/stale | UI refetch snapshot, version có trong DB event; không có subscriber áp ordering. | Không đọc event nếu version không phải transition hợp lệ; re-fetch rồi so version/status. | BLOCKED cho direct event speech. |
| Background tab | Poll dừng/giãn khi hidden; browser behavior khác nhau. | Không cam kết đọc nền/khóa màn hình; giữ badge/toast để đọc khi user quay lại. | NOT TESTED trên thiết bị thật. |
| Owner tự hoàn thành action | Command response cập nhật snapshot. | Không đọc lại “ready/completed” do chính actor vừa bấm. | Policy đề xuất. |

## 6. Auth, isolation và dữ liệu được phép nói

**Owner.** `src/server/auth/verify-owner.ts:1-35` xác minh Auth từ server rồi kiểm `owner_members` với role/store. Mọi private event route tương lai phải derive store từ membership, không tin `storeId` trong payload trình duyệt. Owner chỉ nhận event của store mình.

**Guest.** `src/server/security/request-context.ts:7-28` cấp/đọc HttpOnly browser cookie, hash và grant proof. Order route (`src/app/api/public/orders/[id]/route.ts`), bill route (`src/app/api/public/table-sessions/current/bill/route.ts`) và receipt service (`src/server/table-sessions/billing.ts:43-55`) kiểm capability/proof. Takeaway private tracking (`src/server/pickup/service.ts`) kiểm browser grant trước khi giải mã delivery. Future event broker phải lặp lại scope theo `table_session_id`/`order_id`, không map quyền bằng ticket number.

**Không được đưa vào speech text hoặc event payload:** PIN phiên bàn, pickup code, browser token/grant proof, payment reference, account number, webhook payload, customer identity chưa được duyệt, full bill và thông tin khách khác. Ticket number/table label chỉ được dùng khi đã scope đúng và policy đã duyệt; amount cũng không đọc mặc định.

**Điểm cần khóa trước tích hợp:** verify event authorization tại delivery time; không dùng outbox public broadcast; không coi localStorage/sessionStorage/custom event là nguồn sự thật; không để speech ack/claim/complete hay thay đổi payment/order state.

| Gap trước khi bật speech | Mức/hiện trạng | Reproduction hoặc kiểm chứng cần làm |
|---|---|---|
| Chưa có private event delivery auth | **BLOCKED cho integration**, không phải bằng chứng API GET đang hở. Outbox table bị revoke khỏi anon/authenticated (`supabase/migrations/20261023000300_table_sessions_guest_access.sql:101-106`); chưa có channel policy để audit. | Hai owner khác store và hai guest khác order/session thử subscribe/tự sửa id; phải bị từ chối, kể cả revoke/expiry sau subscribe. |
| Thanh toán đã paid nhưng review-held | `supabase/migrations/20261024001200_payment_review_queue.sql:53-65` giữ `status='succeeded'` khi có reconciliation; paid text đơn độc không đủ cho “vào hàng”. | Paid order nhận extra/late payment → `needs_reconciliation=true`; inject hint accepted cũ → không đọc “đã vào hàng”/“đến nhận món”. |
| Old receipt so với session đang mở lại | `supabase/migrations/20261024001600_closed_session_receipts.sql:195-231` authorize receipt cũ theo browser/proof; active ordering không còn hiệu lực sau close. | Khách A session S1, close/settle, mở S2 cho B: A chỉ đọc receipt S1; B không nhận event S1. Không dùng tableId hay QR chung làm audience. |
| Code pickup trong authorized private GET | `src/server/pickup/service.ts:126-167` giải mã code cho buyer đúng scope; GET fallback không cấp quyền đọc code. | Speech mapper nhận full private tracking DTO phải loại pickup field trước queue/log. Missing credential vẫn chỉ visual retry, không nói code hay tự xác nhận giao. |
| Toast mount/filter/reconnect bị tưởng là new event | `OwnerOrdersView.tsx:230-245`, `TableBillSheet.tsx:122-135` là local refs/state. | Owner xem filter dine-in rồi chuyển all có accepted Takeaway cũ; hoặc remount paid bill → toast có thể hiện lại. Không dùng các toast đó làm speech trigger. |
| Queue tồn tại sau logout/revoke/session switch | Voice chưa có; future gap cần thiết kế cancellation. | Enqueue rồi logout/expire grant/đổi order → hủy queue, xóa scope, reauthorize trước khi dequeue. Không phát backlog ở principal mới. |

Không phát hiện và xác nhận một exploit production mới trong audit source này. Các dòng BLOCKED là gate kỹ thuật trước triển khai voice; không tự sửa nghiệp vụ trong phạm vi audit.

## 7. Dedupe, ordering và hàng đợi âm thanh đề xuất

1. **Identity:** ưu tiên `eventId` từ DB outbox. Nếu event legacy thiếu id tin cậy, dùng `(principalId, audience, aggregateId, transition, version)`. Không dùng timestamp đơn độc.
2. **Cấp quyền phát:** chỉ thêm key sau khi event/snapshot đã qua server authorization, đúng aggregate và transition. Không thêm key từ optimistic UI, toast, hydration, cache hay redirect payment.
3. **Bộ nhớ:** đề xuất 512 semantic notification keys, TTL 24 giờ, namespace theo principal/store hoặc session/order (không chứa token). Khóa này là best-effort tối ưu cache, không phải quyền truy cập. Khởi động/reload/reconnect luôn đặt baseline mới và không nói backlog. Nếu cursor bị mất/reset/evict thì fallback visual; không dựa riêng vào TTL để cho phép nói event cũ. Freshness tối đa đề xuất 120 giây theo server event time sau cursor hợp lệ, không dùng device clock để quyết định thứ tự.
4. **Queue:** `P0 > P1`; một message ngắn, tối đa khoảng 120 ký tự; debounce 1–2 giây. Gộp burst owner thành “Có 3 đơn mới trong hàng đợi” khi các event cùng store xuất hiện trong cửa sổ; không chặn nút claim hoặc transaction.
5. **Out-of-order:** kiểm `aggregateId`, `version`, trạng thái hiện tại và quyền. Nếu version bị bỏ qua hoặc snapshot cũ, refetch authoritative state; không đoán câu đọc.
6. **Cross-tab owner:** ưu tiên Web Locks độc quyền + `BroadcastChannel` cho election/dedupe cùng origin, namespace theo owner/store; heartbeat 2 giây, lease 6 giây là đề xuất cần thử thiết bị. Nếu chỉ có localStorage lease, race/suspend có thể tạo hai leader; khi không chứng minh được exclusivity thì chỉ visual, không hứa exactly-once. Ghi key/claim trước khi gọi speech, failover bỏ backlog: có thể mất một câu khi crash, chấp nhận vì best-effort. Hai thiết bị không được điều phối bằng browser lock; owner chọn thiết bị chính, không cam kết chống trùng toàn quán. Visual vẫn ở mọi tab.
7. **Guest tabs:** opt-in riêng trên từng thiết bị/tab sau user gesture; không tự bật tiếng chỉ vì quét QR. Hai người cùng bàn không bị cưỡng bức phát trên mọi máy.
8. **Fallback:** nếu không có voice `vi-VN`, speech bị browser chặn hoặc tab background, giữ toast/banner/badge và optional âm báo ngắn; voice layer best-effort, không làm fail checkout/order.
9. **Volume/permission:** có nút “Bật thông báo giọng nói”, preview một câu không chứa dữ liệu; slider/mute cục bộ; không xin microphone permission. Quyền push nếu triển khai sau là phạm vi riêng, cần HTTPS và permission riêng.

10. **Một nghiệp vụ, một câu:** `payment.updated` + `order.accepted` chỉ tạo một semantic key `takeaway_payment_accepted:<orderId>:<acceptanceVersion>` cho guest; `table_session.closed` + `receipt_ready` chỉ tạo một key paid-receipt. `order.created`/`payment.instructions` chỉ invalidation, không thêm câu. Không để payment screen và tracking screen cùng đọc lại khi navigation.
11. **Hủy và revalidate:** mute/logout/scope switch/revoke phải cancel pending utterance/queue. Trước dequeue, xác minh scope còn hạn và snapshot vẫn đủ điều kiện; review-held, completed hoặc stale accepted không được phát câu “mới nhận/đến nhận món”. Không retry speech lỗi thành vòng lặp. P0 chỉ ưu tiên phần queue chưa nói; không cắt giữa một P0 đang nói để tránh gây khó hiểu. P1 cooldown đề xuất 60 giây; queue tối đa 5 câu, tổng thời lượng mục tiêu dưới 15 giây, stale items bỏ sang visual.

## 8. Khảo sát TTS/browser (tài liệu, không chạy thiết bị thật)

| Giải pháp | Chi phí/độ trễ | Riêng tư/phụ thuộc mạng | Kết luận audit |
|---|---|---|---|
| `window.speechSynthesis` / Web Speech API | Không có phí TTS theo request từ app; latency/độ rõ phụ thuộc voice OS/browser. | Không cần microphone. Một số voice có thể dùng dịch vụ mạng; không mặc định xem mọi voice là offline hoặc text chỉ ở máy. | **Ứng viên MVP**, nhưng voice `vi-VN` không đảm bảo. `getVoices()` có thể rỗng lúc đầu; đề xuất nghe `voiceschanged`, retry tối đa 3 lần trong 2 giây rồi fallback. Chất lượng giọng Việt chưa đo. |
| Âm báo ngắn + văn bản | Rẻ, ít phụ thuộc voice; latency thấp. | Không đọc dữ liệu nhạy cảm; có thể hoạt động khi thiếu Vietnamese voice nếu audio được phép. | **Fallback nên có** cùng toast/banner. |
| Cloud TTS | Có chi phí, network round-trip và vận hành key/cache. | Event/text rời thiết bị; cần policy PII, retention, outage. | **Đề xuất tương lai**, chưa đăng ký/tích hợp/đánh giá chất lượng thực. |

Tham khảo kỹ thuật: [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis), [`getVoices()`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices), [`voiceschanged`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event), [Chrome autoplay](https://developer.chrome.com/blog/autoplay).

- **SUPPORTED (API-level):** Web Speech API và `speechSynthesis` là API trình duyệt phổ biến; không cần microphone permission.
- **NOT TESTED:** iOS Safari voice list/user activation, Android Chrome voice `vi-VN`, desktop Chrome/Edge voice availability, background tab/locked screen, thiết bị loa thật. Audit này không tuyên bố hỗ trợ các trường hợp đó.
- **BLOCKED:** tự động đọc ngay khi mở trang/QR mới khi chưa có user gesture; speech không phải push/background notification.

| Target | Web Speech / âm báo / cloud | Trạng thái kiểm chứng |
|---|---|---|
| iOS Safari | API support không đồng nghĩa có vi-VN hoặc chạy background; voice names/user activation phụ thuộc iOS. Âm báo/cloud audio cũng chịu hạn chế media playback. | **UNKNOWN / NOT TESTED** trên iPhone/iPad thật; không khẳng định có sẵn tên voice cụ thể. |
| Chrome Android | Phụ thuộc voice pack/TTS engine và network của máy. Cloud có thể chuẩn hóa giọng nhưng thêm latency/chi phí. | **NOT TESTED** thiết bị/tiếng Việt/offline; cần nghe thật trong quán. |
| Chrome desktop | MDN ghi API broadly available; voice list tùy OS/browser. Autoplay sound có ngoại lệ theo engagement nên không diễn giải là mọi máy luôn chặn giống nhau. | **NOT TESTED** playback/volume/multi-tab ở audit này. |

Bốn URL tham khảo đã đọc thành công qua HTTP 200 trong audit này. Tài liệu Chrome autoplay chủ yếu nói media/Web Audio; đó là cơ sở thiết kế gesture chủ động, không phải chứng cứ việc resume `AudioContext` sẽ mở khóa `speechSynthesis` trên mọi browser. Nút thử giọng phải gọi speech trong click và xử lý lỗi riêng; B/C cũng không vượt qua được media/autoplay restriction. Không benchmark, không báo giá cloud cụ thể và không gửi text đến cloud. Chọn vendor/chính sách retention chỉ ở bước sau nếu MVP local voice không đạt.

## 9. Những phần thiếu và thứ tự implementation sau khi được duyệt

Đây là kế hoạch đề xuất, **không phải thay đổi trong audit**.

| Bước | Ownership đề xuất | Việc cần làm | Rủi ro |
|---|---|---|---|
| 1 | Codex/backend | Chốt event envelope, audience/eligibility, private delivery và cursor; xác định publisher outbox sau commit. | Cao: sai scope có thể lộ event tenant/guest. |
| 2 | Codex/database | Nếu cần, thêm consumer cursor/delivery audit và index/migration forward-only; giữ event payload tối thiểu. | Cao: migration phải idempotent và không thay evidence payment/order. |
| 3 | Codex/API | Route hoặc adapter private cho owner store và guest order/session; re-sync snapshot khi reconnect. | Cao: guest current/old session và revoke phải fail closed. |
| 4 | Gemini/UI | Voice opt-in, mute/volume, toast/badge fallback, message templates; không sở hữu state transition. | Trung bình: autoplay/iOS UX khác nhau. |
| 5 | Codex + Gemini | Client coordinator/dedupe/cross-tab leader và queue; chỉ phát event server-authorized. | Trung bình: tab crash/lease và duplicate delivery. |
| 6 | QA/owner | Test matrix dưới đây trên local, staging, desktop/mobile thật; đo event-to-speech latency và duplicate rate. | Cao: chưa có thiết bị/browser evidence hiện tại. |

## 10. Ma trận kiểm thử bắt buộc cho lượt IMPLEMENT sau

| # | Kịch bản | Expected | Bằng chứng |
|---:|---|---|---|
| 1 | Load owner lần đầu với order accepted cũ | Không phát tiếng; snapshot chỉ render visual. | Browser log + audio spy không có call. |
| 2 | Dine-in order commit mới | Một câu P0 đúng store/ticket. | DB event id/version + client log + audio spy. |
| 3 | Takeaway intent mới nhưng chưa paid | Không đọc “đã thanh toán”. | Payment status pending + no speech. |
| 4 | Webhook valid lần đầu | Một câu paid/accepted sau commit. | `payments` một row, ticket một row, one delivery key. |
| 5 | Gửi cùng webhook hai lần | Không phát lần hai, không thêm ledger/ticket. | Inbox/payment/outbox audit + audio count. |
| 6 | Payment amount/reference mismatch | Visual exception; không đọc dữ liệu thanh toán. | `payment.exception` + sanitized message. |
| 7 | Owner tab refresh sau event | Không replay event đã đọc. | Reload trace + dedupe store. |
| 8 | Hai owner tab cùng store | Chỉ audible leader phát; cả hai tab có visual. | Broadcast/Web Lock trace + audio count. |
| 9 | Leader tab đóng đột ngột | Tab takeover không đọc backlog cũ; event mới đọc một lần. | Lease timeline + audio count. |
| 10 | Owner khác store cố nghe event | Không nhận/không phát. | Authorization response/log không có payload. |
| 11 | Guest khác table session dùng URL order | 401/403/404 tùy contract; không event/speech. | HTTP + DB audit + audio spy. |
| 12 | Old guest session sau close paid receipt | Được đọc đúng receipt nếu opt-in/capability còn hạn; guest mới bị chặn. | Receipt route scope + event audience. |
| 13 | Takeaway guest order khác cùng ticket number | Không nhận event; ticket không phải capability. | Browser contexts + HTTP authorization. |
| 14 | Ready event đến trước accepted trong client | Không đọc; refetch authoritative state rồi mới quyết định. | Out-of-order injection + version trace. |
| 15 | Duplicate/out-of-date version | Bỏ qua speech, vẫn reconcile visual. | Version guard log. |
| 16 | Reconnect/online/visibility | Refetch, không replay snapshot cũ. | Network throttling + audio count. |
| 17 | Background tab/phone lock | Không cam kết speech; visual/badge vẫn an toàn. | Desktop/mobile device observation; ghi NOT TESTED nếu chưa. |
| 18 | Không có `vi-VN` voice / `getVoices()` rỗng | Retry hữu hạn rồi fallback toast/banner; không crash. | Stub voices + console/error capture. |
| 19 | Chưa có user gesture | Nút bật tiếng yêu cầu gesture; blocked audio không làm fail order. | Autoplay test + order HTTP remains 2xx. |
| 20 | Bursts 3–10 accepted orders | Gộp câu theo policy/cooldown; không chặn claim. | Timed event fixture + queue trace. |
| 21 | Speech text inspection | Không có PIN, pickup code, token, account, reference hoặc full bill. | Redaction assertion trên envelope và utterance. |
| 22 | Owner tự bấm ready/completed | Visual update, không đọc lại hành động của actor. | Actor id + audio spy. |
| 23 | Guest opt-out/mute | Không gọi speech; visual fallback vẫn hiện. | Preference state + audio spy. |
| 24 | Voice adapter lỗi/throw | Toast/banner fallback, transaction/order unaffected. | Injected adapter failure + DB state. |

## 11. Gap, blocker và quyết định

### PASS

- Domain state transitions và outbox metadata tồn tại cho order, payment, settlement, receipt, pickup; event id/version xuất hiện ở các đường dẫn chính.
- Dine-in/Takeaway backend phân biệt đúng điều kiện vào FIFO; payment webhook là nguồn xác nhận Takeaway.
- Guest/owner authorization có server-side evidence; receipt cũ được scope theo browser/session capability.
- Polling, visibility/online recovery, visual toast và no-store API paths có trong client.

### NOT IMPLEMENTED

- Outbox publisher/consumer, private Supabase Realtime subscription, event cursor/delivery acknowledgement.
- Voice/TTS/audio adapter, `speechSynthesis` integration, user permission/opt-in, cross-tab audible leader.
- Guest assistance event và overload threshold event.

### NOT TESTED

- Thiết bị iOS Safari, Android Chrome, desktop voice list; Vietnamese voice availability; autoplay/user activation ngoài browser test.
- Background/locked-screen speech, real private realtime delivery, production provider/webhook-to-browser latency.

### BLOCKED / NO-GO

Không được tích hợp voice ngay từ polling/toast hiện tại: làm vậy sẽ đọc lại khi refresh/reconnect, có thể phát ở hai owner tab, và không chứng minh được private audience. Cần duyệt event contract ở `docs/contracts/VOICE_NOTIFICATION_EVENT_PROPOSAL.md`, sau đó xây publisher/private delivery + dedupe trước khi thêm UI/TTS.

**Audit hoàn tất; voice chưa được tích hợp.**

## 12. Bàn giao và đối chiếu với audit UX song song

Audit UX song song ở `docs/audits/VOICE_A01_GEMINI_NOTIFICATION_UX_AUDIT.md` và đặc tả trình bày ở `docs/design/VOICE_A01_SPEECH_UX_SPEC.md` thống nhất các điểm sau: khách tắt tiếng mặc định, owner có nút opt-in, toast/banner vẫn là fallback, không đọc PIN hoặc pickup code, batching đơn mới, và không đọc lại thao tác do owner tự bấm.

Các điểm cần giữ trong bước IMPLEMENT sau khi đối chiếu:

- `knownOrderIdsRef` ở `OwnerOrdersView.tsx` là cơ chế gộp toast hiện tại, **không phải** durable `eventId`/cursor. Không nối speech trực tiếp vào `showToast` nếu chưa có event delivery và dedupe server-authorized.
- `toastedRef` của `TableBillSheet.tsx` chống lặp trong một component lifecycle, **không thay thế** session/device delivery identity và cross-tab leader.
- UX audit đánh dấu “GO” cho việc thiết kế đặc tả; technical audit này đánh dấu **NO-GO cho tích hợp runtime ngay bây giờ** vì publisher/private subscriber, audience và cursor còn thiếu. Hai kết luận không mâu thuẫn: có thể tiếp tục review UX, nhưng chưa được viết voice runtime.
- Câu đọc đề xuất từ UX phải đi qua allowlist/eligibility của contract này; những dòng dựa trên `checkout_pending` hoặc overload chỉ được triển khai sau khi có event thật, hiện vẫn `NOT IMPLEMENTED`.

Đây là các field/status thực cần bàn giao cho Gemini: `eventId`, `aggregateId`, `version`, `type`, `order.status`, `payment_intents.status`, `needs_reconciliation`, `table_sessions.status`, `receiptVersion`, `ticketNo`, `order.type`, và capability scope theo browser/session/order. Không dùng visual toast, redirect payment hay client timestamp làm nguồn sự thật.
