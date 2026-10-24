# VOICE_NOTIFICATION_EVENT_PROPOSAL

> **PROPOSAL ONLY — không phải production contract.**
> Tài liệu này chỉ mô tả event envelope và policy đề xuất cho một lượt IMPLEMENT sau khi chủ dự án duyệt. Nó không thay đổi API, migration, listener, provider hay UI hiện tại.

## 1. Mục tiêu và nguyên tắc

Thông báo giọng nói chỉ là lớp phụ trợ best-effort cho các chuyển trạng thái nghiệp vụ đã commit. Database vẫn là nguồn sự thật; voice không ack event, không claim đơn, không xác nhận thanh toán, không kiểm pickup code và không được làm transaction thất bại.

Mọi event phải được authorize theo audience trước delivery. Owner chỉ nhận event thuộc `storeId` của membership; guest chỉ nhận event thuộc `tableSessionId` hoặc `orderId` mà browser capability/proof hiện tại cho phép. Không gửi event public chứa dữ liệu của tenant khác.

## 2. Những gì đã tồn tại trong source

| Existing event/topic | Source of truth | Payload hiện có | Tình trạng delivery |
|---|---|---|---|
| `order.created`, `order.accepted` (dine-in) | `supabase/migrations/20261023000700_dine_in_orders_fifo.sql:263-268` | event id, aggregate/order id, version, type | Ghi DB/outbox; **chưa có publisher/subscriber**. |
| `order.preparing`, `order.ready`, `order.completed` | `supabase/migrations/20261024001200_payment_review_queue.sql:176-185` | id, aggregate, version, type; order event còn actor/before/after ở owner transition | Ghi DB/outbox; client hiện polling. |
| `payment.updated`, `order.accepted` (Takeaway paid) | `supabase/migrations/20261024001200_payment_review_queue.sql:246-257` | id, intent/order aggregate, version, type | Ghi cùng transaction payment/ticket; chưa private delivery. |
| `payment.exception`, `payment.review_required`, `payment.expired`, `payment.instructions` | `supabase/migrations/20261024001200_payment_review_queue.sql:229-245,300-323` | metadata topic/aggregate/version; không chứa instructions body trong outbox | Ghi DB/outbox; owner exception view polling; instructions chỉ visual. |
| `table_session.opened` | `supabase/migrations/20261024000900_six_digit_table_pin.sql:188-189` (thay đường mở phiên legacy 003) | id, session aggregate, version, type | Ghi DB/outbox; chưa subscriber. |
| `table_session.closed`, `table_session.updated` | `supabase/migrations/20261024001500_dinein_session_settlement.sql:251-256` | id, session aggregate, version, type | Ghi DB/outbox; client re-fetch. |
| `table_session.receipt_ready` | `supabase/migrations/20261024001600_closed_session_receipts.sql:115-123` | id, session/receipt id, receipt version, type | Ghi sau immutable receipt; receipt route kiểm capability. |
| `order.payment_updated` | `supabase/migrations/20261024001500_dinein_session_settlement.sql:242-247` | order id/version/type qua `p4_emit` | Invalidation khi chốt bill; không thêm câu nếu receipt đã thông báo. |
| `pickup.issued`, `order.completed` | `supabase/migrations/20261024001100_takeaway_pickup.sql:180-219` | metadata; pickup code không nằm trong payload | Ghi DB/outbox; private tracking/owner API polling. |

`store.updated`, `menu.updated`, `qr.updated` và admission state có thể hữu ích cho UI sync nhưng mặc định không phải voice notification. Guest assistance và overload threshold event **chưa tồn tại**.

`payment.succeeded` còn được ghi trong `order_events` ở `supabase/migrations/20261024001200_payment_review_queue.sql:252`; outbox tương ứng dùng `payment.updated` và `order.accepted` (`:253-255`). Không subscribe một topic outbox `payment.succeeded` mà source chưa phát. Dedupe id lấy từ outbox; id của order event không luôn bằng id outbox. Việc schema có `published_at`/`attempt_count` không có nghĩa publisher đang chạy.

## 3. Event envelope đề xuất

Đây là shape logical cho publisher/private delivery tương lai; chưa phải schema production.

```json
{
  "eventId": "uuid-from-outbox",
  "type": "order.accepted",
  "aggregateId": "uuid",
  "aggregateType": "order",
  "storeId": "uuid-owner-routing-only",
  "version": 12,
  "occurredAt": "2026-10-24T10:44:44.000Z",
  "audience": "owner_store",
  "metadata": {
    "ticketNo": 26,
    "orderType": "takeaway"
  }
}
```

Required/semantic fields:

- `eventId`: immutable outbox id; primary dedupe key.
- `type`: allowlisted domain event, never arbitrary client text.
- `aggregateId`, `aggregateType`: resource being changed (`order`, `table_session`, `payment_intent`).
- `storeId`: required for owner routing; do not expose to guest unless a future contract needs it.
- `version`: DB aggregate version; do not substitute client timestamp.
- `occurredAt`: server/DB timestamp for display and diagnostics only, not ordering by itself.
- `audience`: `owner_store`, `guest_order`, `guest_table_session`, or `internal`; publisher must enforce it.
- `metadata`: allowlisted, minimal, non-secret fields only.

Forbidden in envelope, metadata and generated speech: PIN, pickup code/ciphertext, guest/browser token, grant proof, payment reference/account number, webhook body/signature, customer identity not explicitly approved, full bill, and secrets from logs. `ticketNo` và table label trong ví dụ là metadata đề xuất cần duyệt; nếu chưa duyệt hoặc thiếu nhãn an toàn thì dùng “Có đơn mới trong hàng đợi.” / “Đơn của bạn đã sẵn sàng.” Không đọc amount mặc định. Không đưa ghi chú hoặc tên bàn tùy ý vào câu dài; normalize, giới hạn độ dài và dùng generic template nếu không hợp lệ.

Một envelope chỉ dành cho **một audience** đã authorize. Khi fan-out owner và guest phải tạo projection riêng, giữ nguyên `eventId`; guest payload bỏ `storeId`/owner routing fields. Server derive `orderId`/`tableSessionId` từ aggregate và quan hệ DB, không lấy từ ticket hay QR công khai. Mất/expire/revoke capability đồng nghĩa không delivery và phải hủy queue tương ứng. Nếu event chỉ là hint thì GET authorized snapshot trước speech; event payload không tự cấp quyền.

## 4. Proposed event catalog and eligibility

| Type | Audience | Eligible for voice | Priority | Safe metadata | Vietnamese template |
|---|---|---:|---:|---|---|
| `order.accepted` from dine-in commit | `owner_store`; opted-in matching `guest_table_session` | Owner yes; guest optional | P0 owner / P1 guest | `ticketNo`, approved `tableLabel` | Owner: “Có đơn mới tại bàn {table}, số {ticket}.” Guest: “Đặt món thành công, số {ticket}.” |
| `order.accepted` after verified Takeaway payment | `owner_store`, matching `guest_order` | Yes | P0 | `ticketNo`, `orderType` | Owner: “Có đơn mang đi mới, số {ticket}, đã thanh toán.” Guest: “Thanh toán thành công, đơn số {ticket}.” |
| `order.ready` (Takeaway) | matching `guest_order` or eligible owner visual | Guest yes; owner visual | P0 guest / visual owner | `ticketNo` | “Đơn số {ticket} đã sẵn sàng, vui lòng đến quầy nhận món.” |
| `order.ready` (dine-in) | matching `guest_table_session` | Default visual; P1 only if self-pickup workflow is approved | visual / P1 | none required | “Món của bạn đã sẵn sàng.” |
| `table_session.receipt_ready` | matching `guest_table_session` | Yes if guest opt-in | P0 | no bill detail; optional approved table label | “Bàn của bạn đã thanh toán. Cảm ơn quý khách!” |
| `payment.exception` / `payment.review_required` | `owner_store` | Yes with cooldown | P1 | order/ticket identifier only | “Có giao dịch cần đối soát.” |
| `order.completed` after verified pickup or dine-in service | matching `guest_order` | Optional | P1 | no pickup code | “Cảm ơn quý khách, hẹn gặp lại!” |
| `order.preparing` | guest/owner | Default visual | — | none | — |
| Payment state `pending`, timeout, failed, expired (không phải mọi nhãn này đều là event) | guest/owner | Default visual | — | none | — |
| `table_session.opened/closed` | guest/owner | Default visual | — | session id not spoken | — |
| `guest_assistance.requested` | owner store | **NOT IMPLEMENTED** | P0/P1 after design | to be defined | — |
| `capacity.overload` | owner store/guest type | **NOT IMPLEMENTED** | P1 after policy | to be defined | — |

Eligibility is evaluated against the latest server snapshot. A delivered event that no longer matches a legal transition becomes visual reconciliation only; it must not be spoken based on stale/optimistic state.

**Gates cụ thể:** Takeaway paid cần `intentStatus='succeeded'`, `reconciliationRequired=false`, order/ticket hợp lệ và không `paymentReviewRequired`; `status='paid'` đơn độc vẫn có thể là review-held. Ready cần đúng order status và không hold. Dine-in paid cần authorized final `kind='paid_receipt'`, session `closed`/payment `paid`, `receiptId`, `receiptVersion`, `settledAt` hợp lệ từ server; không suy paid chỉ từ `settledAt !== null`. Pickup complete lấy từ backend verified completion, không từ việc người dùng copy/nhập code.

## 5. Dedupe and ordering identity

Primary identity:

```text
(eventId, principalId, audience)
```

If a legacy event has no trusted `eventId`, use:

```text
(principalId, audience, aggregateType, aggregateId, type/transition, version)
```

The client must never use a timestamp or toast text as identity. The key is recorded only after server authorization and accepted snapshot/event validation. Initial snapshot, hydration, reload, focus, visibility recovery, reconnect and webhook duplicate are non-triggering paths: establish a new baseline and suppress backlog. A future authorized event poll may notify only live events after that baseline/cursor, not newly visible rows in a filtered snapshot. Timestamp freshness can reject an old event, but cannot prove a new transition or ordering.

Một nghiệp vụ có thể phát nhiều topic: map `payment.updated` + `order.accepted` về một semantic notification `takeaway_payment_accepted:<orderId>:<acceptanceVersion>` cho guest; `table_session.closed` + `receipt_ready` về một key receipt; `order.created` không đọc. Primary event key chống duplicate transport, semantic key chống hai component/topic đọc cùng một nghiệp vụ. Version watermark phải gồm aggregate/type; không drop topic khác chỉ vì cùng version. `payment.updated.version` hiện lấy order version (`supabase/migrations/20261024001200_payment_review_queue.sql:254`), không phải intent version độc lập.

For owner multi-tab, a future coordinator elects one audible leader per store/user with `BroadcastChannel` or Web Locks, heartbeat and lease expiry. All tabs may retain visual badges. A new leader must start at the current cursor, not replay old delivered events. Guests opt in per device/tab after a user gesture; scanning a new QR never turns speech on automatically.

Đề xuất cache tối đa 512 keys/24 giờ, leader heartbeat 2 giây/lease 6 giây, freshness 120 giây và P1 cooldown 60 giây cần được duyệt/test. Ghi claim trước speech để ưu tiên không đọc trùng; crash giữa claim và playback có thể mất một câu, chấp nhận best-effort. Không hứa exactly-once playback, background playback hoặc chống trùng giữa nhiều thiết bị. Nếu không có Web Locks và không chứng minh được lease exclusivity thì fallback visual. Storage chỉ giữ opaque identity/preferences, không token/code; logout/scope switch xóa namespace và cancel queue.

## 6. Priority, queue and fallback

- **P0:** verified payment/accepted, ready pickup, paid receipt, owner new order. Speak once, short sentence.
- **P1:** payment review, completed pickup, optional guest accepted. Cooldown and batching apply.
- **Visual only:** pending, preparing, network, validation, session expiry, own owner action.
- **Never speak:** refresh, history, search, menu edits, duplicate webhook, secrets, arbitrary server errors.

Queue rules: P0 được xếp trước P1 chưa phát; không cắt một P0 đang nói. Maximum one short sentence around 120 characters, debounce 1–2 seconds (đề xuất 1.5 giây để khớp UX), batch same-store order bursts (“Có 3 đơn mới trong hàng đợi”), tối đa 5 câu/15 giây pending, and never block order/payment/pickup commands. Revalidate auth/scope/latest state before dequeue; discard stale/revoked/review-held announcements. When voice is unsupported, Vietnamese voice is unavailable, browser activation is denied, or tab is backgrounded, show the existing toast/banner/badge. Âm báo ngắn chỉ là fallback tương lai nếu chính nó đã được user cho phép, chưa có asset/runtime hiện tại. Voice failures không retry vô hạn; diagnostics chỉ mã lỗi, không text/payload nhạy cảm.

Owner và guest đều OFF khi truy cập lần đầu; preference owner tách guest, preference không chứng minh browser đang cho phát tiếng. Enable/test từ click thật; `getVoices()` + `voiceschanged` và retry hữu hạn (đề xuất 3 lần/2 giây), thiếu vi-VN thì visual. `AudioContext.resume()` không được giả định mở khóa TTS. Không xin quyền microphone. Screen reader/ARIA vẫn có feedback, cần test tránh hai nguồn tiếng cùng đọc; không tự tắt thông báo accessibility cốt lõi khi bật voice.

## 7. Existing versus proposed fields/events

| Item | Existing | Proposed change status |
|---|---|---|
| `eventId`, `aggregateId`, `version`, `type` | Present in main outbox payloads. | Reuse; do not replace with client-generated identity. |
| DB `created_at` / `updated_at` | Present on event/order/session tables. | Map to `occurredAt` only after agreeing server timestamp semantics. |
| `storeId` | Present in DB rows; often absent from current outbox JSON. | Add to private routing envelope only after contract approval; never trust client input. |
| `aggregateType` | Implicit from topic/table. | Proposed explicit field for allowlist/routing. |
| `audience` | Not present. | New delivery-layer field; requires publisher authorization. |
| Safe `ticketNo`/table label | Present in authorized projections, not current outbox payload. | Optional derived metadata, never public broadcast. |
| Guest assistance / overload event | Not implemented. | Do not fabricate in this phase; define source/policy first. |
| Cursor/delivery audit | Not found. | Future migration/API only if needed for reliable dedupe; separate approval. |

## 8. Acceptance gates before this proposal becomes production

1. Approve event allowlist, audience, metadata redaction and message templates.
2. Implement/test outbox publisher after commit and private delivery authorization.
3. Prove owner store isolation and guest old/current session isolation with negative tests.
4. Add cursor/dedupe and cross-tab leader behavior without changing order/payment transitions.
5. Add opt-in/gesture/volume/fallback UI and a browser capability probe; do not request microphone permission.
6. Run the 24-case matrix in `docs/audits/VOICE_A01_CODEX_EVENT_TECHNICAL_AUDIT.md` on supported target devices and record PASS/NOT TESTED/BLOCKED.

Until every gate is reviewed, this file remains a proposal and voice remains **not integrated**.

## 9. Đối chiếu với đặc tả UX song song

`docs/audits/VOICE_A01_GEMINI_NOTIFICATION_UX_AUDIT.md` và `docs/design/VOICE_A01_SPEECH_UX_SPEC.md` là tài liệu UX/spec, không phải production implementation. Contract này giữ các quyết định UX phù hợp: silent-by-default cho guest, owner opt-in, nút nghe thử bằng user gesture, batching, visual fallback và cấm đọc secret. Những đề xuất UX gắn với `checkout_pending`, overload hoặc hook `knownOrderIdsRef` chỉ được coi là điểm neo trình bày; chúng không tạo ra event backend và không đủ làm dedupe identity. Event source, audience, version và capability trong contract này là điều kiện bắt buộc trước khi biến spec thành code.

`checkout_pending` là kết quả owner gọi `begin_checkout` (`supabase/migrations/20261024001500_dinein_session_settlement.sql:226-231`), không phải khách yêu cầu thanh toán; MSG-OWN-04 phải loại khỏi MVP cho đến khi có nghiệp vụ/request/event riêng. `counts.paymentException > 0` chỉ là tổng snapshot, không phải event review mới. Receipt toast là visual 4.5 giây, không phải persistent delivery ledger; order toast là 4 giây. UX cần chốt một batching window (catalog nói 3 giây nhưng phần algorithm nói 1.5 giây), voice opt-in ở payment/bill trước khi guest chuyển tracking, và tương tác với screen reader. Không đổi runtime hay sửa file Gemini trong audit này.

Quyết định hiện tại: **NO-GO cho tích hợp runtime** cho tới khi các acceptance gate trên và technical audit được duyệt. Proposal này không đánh dấu voice đã tích hợp.
