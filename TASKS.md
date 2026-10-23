# TASKS — Backlog checklist thực thi

**Mục tiêu:** checklist giao việc để triển khai **2 UI / 2 quyền / 4 tab owner**, bám `PRD.md`, `UI.md` và `ARCHITECTURE.md`.

**Trạng thái:** `[ ]` chưa làm · `[x]` xong (chỉ tick sau khi đã kiểm thử).  
**P0:** chặn release · **P1:** nên có trước pilot đông khách.  
**Agent:** `C` = Codex (logic), `G` = Gemini (UI), `I` = Integration/Review (chủ dự án điều phối, Codex thực hiện phần nối API).

> Không coi một công việc là `Done` chỉ vì AI sinh mã. Phải build/test và đối chiếu acceptance criteria.

## Phase 0 — Phạm vi & contracts

- [ ] **T-001 · C · P0** Chốt enum `OrderType`, `OrderStatus`, `TableSessionStatus`, `PaymentIntentStatus` (tham chiếu PRD §6). **Done:** TS types đồng nhất backend/fixture.
- [ ] **T-002 · C · P0** Tạo shared contracts `MenuItem`, `CartLine`, `OrderDetail`, `TableSummary`, `PaymentViewState`, `ApiError`. **Done:** compile fixtures mẫu.
- [ ] **T-003 · G · P0** Xây styleboard theo `assets/ui-reference.png` và token của UI.md. **Done:** được duyệt 1 palette + font.
- [ ] **T-004 · G · P0** Vẽ wireframe menu customer, tracking, 4 tab owner; không thêm vai trò/màn hình. **Done:** breakpoint mobile/tablet/desktop rõ.
- [ ] **T-005 · I · P0** Khóa file ownership và response examples giữa 2 agent. **Done:** contract-first handoff xác nhận.

## Phase 1 — Hạ tầng & auth

- [ ] **T-006 · C · P0** Khởi tạo Next.js App Router TypeScript, lint, env validation. **Done:** build & typecheck pass.
- [ ] **T-007 · C · P0** Thiết lập Supabase dev & migration runner; seeds sample store, owner, tables, menu. **Done:** DB sạch migrate thành công.
- [ ] **T-008 · C · P0** Tạo owner auth/login guard, middleware/API guard và mapping store. **Done:** guest không mở được owner endpoint.
- [ ] **T-009 · C · P0** Thiết lập RLS tối thiểu, xử lý lỗi API chuẩn, logger redaction. **Done:** test access cross-store & secret safety.
- [ ] **T-010 · G · P0** Cài shadcn/ui chọn lọc, design tokens, font, icon. **Done:** style consistent và screenshot reference được phản ánh.
- [ ] **T-011 · G · P0** Dựng owner header pill + dashboard responsive shell. **Done:** 4 tabs, không có nav thừa.
- [ ] **T-012 · G · P0** Dựng màn login owner (presentation only). **Done:** đầy đủ loading/error/validation UI.
- [ ] **T-013 · I · P0** Nối login UI ↔ auth API; smoke test và lint. **Done:** owner đăng nhập/đăng xuất đúng.

## Phase 2 — QR, menu, bàn

- [ ] **T-014 · C · P0** Migration `dining_tables`, `qr_codes`, `table_sessions`, unique live session. **Done:** không mở hai phiên cùng bàn.
- [ ] **T-015 · C · P0** API QR resolve 2 loại; disable QR; giới hạn rate. **Done:** code sai/bị khóa trả lỗi.
- [ ] **T-016 · C · P0** Tạo/đóng phiên và mã phiên ngẫu nhiên, hash/TTL. **Done:** phiên cũ không đặt được.
- [ ] **T-017 · C · P0** Xác thực guest session & opaque access token; lưu scope rõ. **Done:** guest bàn A không đọc được bàn B.
- [ ] **T-018 · C · P0** Menu categories/items/options, snapshots/availability, API public/owner. **Done:** chỉ sản phẩm hợp lệ vào giỏ/đơn.
- [ ] **T-019 · G · P0** Customer menu mobile: header theo QR, search, chip category, item cards. **Done:** 375px dùng tốt.
- [ ] **T-020 · G · P0** Item options và cart Sheet: quantity/note/tổng tiền hiển thị. **Done:** empty/out-of-stock state đầy đủ.
- [ ] **T-021 · G · P0** Tab Bàn: grid card + side detail, mở/đóng/hiện mã phiên. **Done:** giống tinh thần bố cục tham chiếu.
- [ ] **T-022 · G · P0** Tab Menu: list, add/edit sheet, availability switch. **Done:** form states/validation UX đầy đủ.
- [ ] **T-023 · I · P0** Nối QR/menu/session owner UI với API thật. **Done:** không còn hardcode data production.

## Phase 3 — Dine-in, FIFO, chủ quán xử lý đơn

- [ ] **T-024 · C · P0** Migration `orders`, `order_items`, `ticket_counters`, constraints/index. **Done:** các unique constraint thực thi.
- [ ] **T-025 · C · P0** Server validate giỏ và snapshot giá/tùy chọn. **Done:** giá giả từ client không có tác dụng.
- [ ] **T-026 · C · P0** Idempotent `POST public/orders` dine-in. **Done:** submit retry cùng key trả cùng order.
- [ ] **T-027 · C · P0** Transaction cấp ticket per store/day. **Done:** 100 concurrent inserts không trùng ticket.
- [ ] **T-028 · C · P0** API owner `claim-next` FIFO + operation request idempotency. **Done:** hai tab/double-click không claim sai thứ tự.
- [ ] **T-029 · C · P0** Transition `accepted → preparing → ready → completed`; audit. **Done:** illegal transition bị 409.
- [ ] **T-030 · G · P0** Checkout dine-in Sheet/step và màn thành công có ticket. **Done:** lỗi session/giá thay đổi hiển thị đúng.
- [ ] **T-031 · G · P0** Order tracking dùng shared props/status, skeleton/reconnect view. **Done:** hiển thị ticket và tiến trình rõ.
- [ ] **T-032 · G · P0** Tab Đơn hàng: list card left + detail right 70/30, filter dine/takeaway. **Done:** desktop/tablet/mobile hoàn chỉnh.
- [ ] **T-033 · G · P0** CTA owner `Nhận đơn tiếp theo`, `Sẵn sàng`, `Đã giao`. **Done:** button states phản ánh trạng thái API, không cho chọn sai đơn.
- [ ] **T-034 · I · P0** Nối checkout/tracking/owner queue; E2E dine-in. **Done:** luồng từ bàn → hoàn thành trên DB.

## Phase 4 — Takeaway & payment automation

- [ ] **T-035 · C · P0** Chọn payOS **hoặc** SePay sau kiểm chứng API/webhook/sandbox. **Done:** ghi rõ provider + điều kiện tích hợp.
- [ ] **T-036 · C · P0** Migration payment_intents/transactions/webhook_events/pickup_credentials. **Done:** event/txn dedupe ở DB.
- [ ] **T-037 · C · P0** `POST orders` takeaway tạo `pending_payment` **không ticket**. **Done:** không hiện ở chế biến.
- [ ] **T-038 · C · P0** PaymentGateway adapter `createCheckout`, `verifyWebhook`, `getPaymentStatus`. **Done:** kiểm chữ ký theo provider thật.
- [ ] **T-039 · C · P0** Webhook verifies signature + merchantRef + amount + VND currency. **Done:** forgery/wrong amount bị từ chối.
- [ ] **T-040 · C · P0** Transaction webhook paid → ghi ledger → cấp một ticket FIFO → outbox. **Done:** duplicate webhook 1 ticket.
- [ ] **T-041 · C · P0** Theo dõi payment status + đối soát callback bị mất/tiền muộn. **Done:** exception không tự vào bếp.
- [ ] **T-042 · C · P0** Mã nhận món hash/verify/rate limit. **Done:** không giao hàng với code sai.
- [ ] **T-043 · G · P0** Takeaway checkout VietQR + amount + pending/expiry. **Done:** hiển thị rõ không trả tiền lặp.
- [ ] **T-044 · G · P0** Takeaway tracking ticket & pickup code private. **Done:** UI không lộ code trong danh sách owner công khai.
- [ ] **T-045 · G · P0** Owner order card thể hiện `Mang đi`, badge paid, pickup verify sheet. **Done:** đủ thao tác hoàn tất.
- [ ] **T-046 · I · P0** Sandbox E2E paid/unpaid/duplicate/mismatch/expiry/late. **Done:** unpaid không claim được; paid chỉ một ticket.

## Phase 5 — Dine-in thanh toán cuối phiên & cài đặt

- [ ] **T-047 · C · P0** Migration `session_settlements` + tổng hợp bill từ snapshot orders. **Done:** không cộng trùng.
- [ ] **T-048 · C · P0** API checkout/settle session có transaction khóa thêm đơn mới. **Done:** race thêm món và thu tiền được xử lý.
- [ ] **T-049 · C · P0** Đóng phiên, revoke guest tokens, bàn sẵn sàng. **Done:** QR/mã phiên cũ không còn hợp lệ.
- [ ] **T-050 · G · P0** Tab Bàn: bill sheet, xác nhận tiền mặt/chuyển khoản, trạng thái closed. **Done:** confirmation rõ, không click trùng.
- [ ] **T-051 · C · P1** Settings API: tên quán, QR, bật/tắt nhận đơn; chỉ trả metadata provider. **Done:** không lộ secret.
- [ ] **T-052 · G · P1** Tab Cài đặt: thông tin, QR view/print, toggle nhận đơn, account. **Done:** UX tối giản.
- [ ] **T-053 · I · P0** E2E một bàn đặt nhiều lần → quyết toán → đóng bàn. **Done:** bill đúng và khóa bàn cũ.

## Phase 6 — Realtime, an toàn, lỗi mạng

- [ ] **T-054 · C · P0** Realtime owner private store channel + version & snapshot re-fetch. **Done:** guest không subscribe được owner channel.
- [ ] **T-055 · C · P0** Guest scoped updates hoặc secure polling fallback; owner/guest reconnect. **Done:** refresh khớp DB.
- [ ] **T-056 · C · P0** Outbox + retry event publish; tránh mất notify sau commit. **Done:** test publish lỗi rồi khôi phục.
- [ ] **T-057 · C · P0** Rate limit QR/verify/order/webhook access; logging/security. **Done:** test brute force/rate limit.
- [ ] **T-058 · G · P0** Skeleton/empty/offline/retry/payment pending UX cho customer. **Done:** khách không bị yêu cầu trả thêm tiền khi đang chờ.
- [ ] **T-059 · G · P0** Owner toast/alert/reconnect states và trạng thái nút rõ. **Done:** không double-click khi loading.
- [ ] **T-060 · G · P1** Accessibility/contrast/keyboard/touch-size audit. **Done:** kiểm ít nhất mobile + tablet.
- [ ] **T-061 · I · P0** End-to-end mạng yếu, reload, mất realtime, bấm submit lặp. **Done:** state đúng, không duplicate.

## Phase 7 — Test, staging, deploy

- [ ] **T-062 · C · P0** Unit test order amount/state, validate price/options, token. **Done:** các failure path chính pass.
- [ ] **T-063 · C · P0** Integration test concurrent ticket, claim, payment replay, settlement race. **Done:** không race logic.
- [ ] **T-064 · C · P0** Security tests guest cross-session, cross-store, fake webhook, token leak. **Done:** không có high severity issue.
- [ ] **T-065 · C · P0** k6 test 100 khách đồng thời + retry/webhook burst. **Done:** ghi p95/error/timeouts; điều chỉnh theo capacity target thực tế.
- [ ] **T-066 · C · P0** Môi trường staging/prod, env secret, callback URL, monitoring. **Done:** smoke test trên URL thật.
- [ ] **T-067 · C · P0** Backup, migration rollback approach, reconciliation runbook. **Done:** kịch bản sự cố có bước xử lý.
- [ ] **T-068 · G · P0** UI QA 375/768/1280px, ảnh món, fonts, tab states. **Done:** không overflow/CTA bị che.
- [ ] **T-069 · I · P0** Pilot tại quán: bàn + quầy, khách thật, owner thao tác toàn chu trình. **Done:** owner nghiệm thu cả 2 QR.
- [ ] **T-070 · I · P0** Release checklist: P0 đầy đủ, payment sandbox/live được xác nhận, công bố cách xử lý sự cố. **Done:** sẵn sàng go-live.

---

## Bảng tiến độ (tự cập nhật)

| Phase | Mốc kiểm soát | Trạng thái |
|---|---|---|
| 0 | Contracts & visual direction | Chưa bắt đầu |
| 1 | Foundation | Chưa bắt đầu |
| 2 | QR & Menu | Chưa bắt đầu |
| 3 | Dine-in FIFO | Chưa bắt đầu |
| 4 | Takeaway Auto Payment | Chưa bắt đầu |
| 5 | Table Settlement | Chưa bắt đầu |
| 6 | Realtime Reliability | Chưa bắt đầu |
| 7 | QA & Launch | Chưa bắt đầu |

## Các nguyên tắc nghiệm thu bất biến

- `[ ]` Một **QR bàn** phải có phiên hợp lệ; QR quầy là công khai, không tạo quyền xem đơn khác.
- `[ ]` Khách **không login**, chỉ Owner login.
- `[ ]` **Takeaway unpaid không có ticket và không được chế biến**.
- `[ ]` **FIFO chung** cho dine-in và takeaway dựa trên khi đơn được chấp nhận tại server.
- `[ ]` Mỗi submit/payment/webhook idempotent; không có duplicate ticket do concurrent race.
- `[ ]` Không tạo dashboard cho bếp/bar/nhân viên; dashboard owner có đúng **4 tab**.
- `[ ]` UI hiện đại tối giản, nền sáng và accent emerald giống tinh thần ảnh tham chiếu.
- `[ ]` Sau reload, guest/owner thấy đúng dữ liệu DB và trạng thái thanh toán.
- `[ ]` Mọi thao tác trạng thái/chuyển tiền bắt buộc server enforce.

## Ghi chú vận hành checklist

Nếu quyết định scope thay đổi (thêm nhân viên, nhiều quán, checkout bàn tự động, phân bếp/bar), hãy thêm changelog/phase mới; **không mở rộng ngầm** trong lúc đang làm P0. Các nhiệm vụ `I` cần được điều phối; Codex chịu trách nhiệm nối API/logic, Gemini chịu trách nhiệm chỉnh presentation trong vùng file riêng.
