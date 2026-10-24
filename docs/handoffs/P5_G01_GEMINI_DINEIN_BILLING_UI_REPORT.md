# Báo Cáo Bàn Giao: Phase 5 — Prompt 01 (Gemini)
## Dine-in Add-on Ordering, Session Bill & Owner Table Checkout UI

- **Vai trò**: Gemini — Chuyên trách UI/UX và frontend presentation (Next.js App Router, Tailwind CSS, shadcn/ui, Lucide).
- **Phối hợp song song**: Codex (`P5_C01_CODEX_DINEIN_SESSION_SETTLEMENT_BACKEND.md` / `P5_SESSION_BILLING.md`).
- **Triết lý giao diện**: Giữ vững kiến trúc 2 giao diện duy nhất (Customer & Owner Dashboard), tuân thủ thiết kế Minimal Emerald POS (Primary `#1D725E` / `#35977D`, nền ngọc nhẹ, bo góc lớn, pill navigation, font chữ tiếng Việt, touch target >= 44px). Không tạo tab thứ 5, không tạo trang thu ngân hay role mới.

---

### 1. Screens / Components Đã Sửa, Mới và Tái Sử Dụng

#### A. Components Tạo Mới (Gemini sở hữu)
1. `src/components/customer/bill/types.ts`:
   - Định nghĩa DTO `TableBillView`, `TableBillSession`, `TableBillOrder`, `TableBillOrderLine`, `TablePaymentMethod` khớp 100% với contract máy chủ của Codex (`p5_session_bill` / `docs/contracts/P5_SESSION_BILLING.md`).
2. `src/components/customer/bill/TableBillSheet.tsx`:
   - Bottom sheet / slide-over xem hóa đơn bàn cho khách: hiển thị số bàn, trạng thái phiên, badge, danh sách lượt gọi món (tickets) có thể thu gọn/mở rộng, snapshot đơn giá + options, server `totalVnd`, cảnh báo khi bàn đang thanh toán (`checkout_pending`), trạng thái kết thúc (`closed`), ghi chú thanh toán tại quầy (không có nút tự chuyển sang paid).
3. `src/components/customer/bill/useCustomerTableBill.ts`:
   - Custom hook tải hóa đơn bàn từ máy chủ qua `GET /api/public/table-sessions/bill?qrCode=...`. Xử lý graceful các mã lỗi mạng, 404/501 (`isBlockedByApi`), 410 expired, 403 session required.
4. `src/components/customer/bill/index.ts`:
   - Barrel export cho module hóa đơn bàn của khách hàng.
5. `src/components/owner/tables/billing-types.ts`:
   - Định nghĩa typed props interface `OwnerTableBillSettlementProps` cho hộp thoại chi tiết & quyết toán phiên bàn.
6. `src/components/owner/tables/TableBillSettlementSheet.tsx`:
   - Sheet chi tiết bàn tích hợp 2 tab pill ("Hóa đơn & Chốt tiền" và "Mã PIN & QR Bàn"):
     + Tab Hóa đơn: Lượt gọi món theo ticket, snapshot món/giá/option, server `totalVnd`, cảnh báo đơn chưa hoàn tất (`outstandingOrders > 0` -> chặn chốt tiền), bắt đầu chốt (`begin_checkout`), hủy chốt (`cancel_checkout`), chọn phương thức thu tiền (`cash` vs `bank_transfer`), dialog xác nhận an toàn ("Chỉ xác nhận khi đã nhận đủ tiền thực tế" chống double-click), trạng thái hoàn tất đã thanh toán.
     + Tab PIN & QR: Bảo tồn 100% chức năng xem/ẩn/tạo mới PIN 6 số và xem/in mã QR của Phase 2.

#### B. Components Cập Nhật / Tích Hợp
1. `src/components/customer/CustomerOrderModeHeader.tsx`:
   - Bổ sung prop `onOpenBill?: () => void;`. Khi ở chế độ Ăn tại bàn (`mode === 'dine_in'`), hiển thị nút icon Biên lai / Hóa đơn (`Receipt`) cạnh giỏ hàng để khách mở xem nhanh hóa đơn bất kỳ lúc nào.
2. `src/components/customer/CustomerQRContainer.tsx`:
   - Tích hợp hook `useCustomerTableBill` tự động kích hoạt khi bàn đã xác thực.
   - Tính toán trạng thái khóa `isCheckoutPending` và `isSessionClosed`.
   - Hiển thị banner cảnh báo tiếng Việt khi bàn đang chốt thanh toán hoặc đã đóng.
   - Vô hiệu hóa CTA chọn món / thêm giỏ hàng khi phiên bị khóa.
   - Gắn `TableBillSheet` vào container và liên kết nút xem hóa đơn trong thanh đơn hàng đang làm (`ActiveOrderTrackingCard`).
3. `src/components/customer/cart/CartSheet.tsx`:
   - Bổ sung các props `isCheckoutPending`, `isSessionClosed`, `onOpenBill`.
   - Hiển thị banner cảnh báo và khóa nút gửi đơn trong giỏ hàng khi bàn đang thanh toán hoặc đã đóng phiên.
   - Thêm nút xem hóa đơn bàn trực tiếp trong footer giỏ hàng.
4. `src/components/customer/cart/PreCheckoutReview.tsx`:
   - Cập nhật logic `canSubmitDineIn`: kiểm tra `!isCheckoutPending && !isSessionClosed`.
   - Hiển thị cảnh báo trực quan và đổi nhãn nút CTA: *"Bàn đang thanh toán — Đã khóa gọi thêm"* khi `isCheckoutPending = true`.
5. `src/components/owner/tables/TableManagementView.tsx`:
   - Tích hợp `TableBillSettlementSheet` ngay trong tab Bàn.
   - Kết nối trực tiếp với API adapters `fetchOwnerSessionBill` và `settleOwnerSession` từ Codex.
   - Sự kiện click nút "Chi tiết" tải hóa đơn bàn theo chuẩn event-driven không gây cascading render.
6. `src/components/owner/OwnerShell.tsx`:
   - Truyền `onNavigateToOrders={() => setActiveTab('orders')}` cho `TableManagementView` để chủ quán chuyển tab nhanh khi có đơn chưa hoàn tất.

#### C. Components Tái Sử Dụng
- `ItemDetailSheet`: Tái sử dụng để chọn món với prop `canAddToCart` tự động khóa khi checkout pending.
- `StickyCartPreview`: Tái sử dụng cho giỏ hàng nổi, tự động ẩn khi phiên bàn đã closed.
- `OrderConfirmedView` & `OrderTrackingView`: Tái sử dụng hiển thị số phiếu ticket, trạng thái phục vụ và điều hướng quay lại thực đơn gọi thêm món.

---

### 2. Luồng Khách Hàng (Customer Dine-in Flow)

```
[Quét QR Bàn] -> [Nhập PIN 6 số (chỉ 1 lần đầu)] -> [Thực đơn & Giỏ hàng]
                                                            │
                     ┌──────────────────────────────────────┴──────────────────────────────────────┐
                     ▼                                                                             ▼
           [Đặt món Lượt 1 (Ticket #001)]                                                 [Bấm xem Hóa đơn bàn]
                     │                                                                             │
           [Màn hình xác nhận đơn]                                                      (Hiển thị danh sách ticket,
                     │                                                                   snapshot món, server totalVnd,
       [Nút "Gọi thêm món" đưa về menu]                                                 nhắc thanh toán tại quầy)
                     │
           [Đặt món Lượt 2 (Ticket #002)]
           (Không đòi nhập lại PIN,
            không copy đè đơn cũ)
                     │
       ┌─────────────┴─────────────┐
       ▼                           ▼
[Chủ quán bấm Chốt]      [Chủ quán Xác nhận thu tiền]
       │                           │
(checkout_pending)              (closed)
- Khóa toàn bộ CTA đặt món     - Khóa gọi thêm vĩnh viễn
- Báo: "Bàn đang được          - Báo: "Phiên bàn đã kết thúc.
  thanh toán. Bạn không thể      Hóa đơn đã được thanh toán."
  gọi thêm món lúc này."       - Cho phép xem lại hóa đơn
- Cho xem hóa đơn bàn            đã thanh toán
```

---

### 3. Luồng Chủ Quán (Owner Table Settlement Flow)

```
[Tab Bàn (Dashboard)] ────► Thẻ bàn hiển thị trạng thái (Trống / Có khách / Chờ thanh toán) + Tạm tính VND
          │
    [Bấm "Chi tiết"]
          │
          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    TableBillSettlementSheet                            │
│  [Tab: Hóa đơn & Chốt tiền]            [Tab: Mã PIN & QR Bàn]          │
│  - Danh sách vé đơn (Ticket #15...)     - Xem / Ẩn PIN 6 số            │
│  - Chi tiết món, snapshot giá, option   - Tạo PIN mới (Rotate PIN)     │
│  - Tổng hóa đơn chuẩn từ server         - Xem / Tải / In mã QR         │
└────────────────────────────────────────────────────────────────────────┘
          │
    [Kiểm tra điều kiện phục vụ]
          ├─► Còn đơn chưa hoàn tất (outstandingOrders > 0)
          │    └── Khóa nút chốt, hiện: "Chưa thể chốt (còn đơn chưa hoàn tất)" + nút xem tab Đơn hàng
          │
          └─► Đã phục vụ xong toàn bộ (outstandingOrders === 0)
               └── Nút "Chốt hóa đơn (Khóa gọi thêm)" khả dụng
                         │
                   [Bấm "Chốt hóa đơn"] ──► Gửi action: "begin_checkout"
                         │
                         ▼
             [Trạng thái checkout_pending]
             - Khách hàng bị khóa gọi thêm
             - Chủ quán chọn phương thức: [Tiền mặt] hoặc [Chuyển khoản]
             - Nút "Tiếp tục nhận món / Hủy chốt" khả dụng (cancel_checkout)
                         │
                   [Bấm "Xác nhận đã thu ... đ"]
                         │
                         ▼
             [Dialog xác nhận an toàn cuối cùng]
             - "Xác nhận đã thu tiền Bàn XX?"
             - Cảnh báo: "Chỉ xác nhận khi đã nhận đủ tiền thực tế."
             - Chống double-click với spinner loading
                         │
                   [Xác nhận đã thu tiền] ──► Gửi action: "confirm_received"
                         │
                         ▼
             [Trạng thái Đã thanh toán (closed)]
             - Hiển thị badge Đã thanh toán + thời gian + phương thức
             - Khóa mọi thao tác thu tiền lần hai
             - Cập nhật bàn về trạng thái sẵn sàng đón khách mới
```

---

### 4. Bảng Trạng Thái UI, Bản Dịch Tiếng Việt, CTA & Trường Backend Sử Dụng

| Trạng thái / Tình huống | Copy Tiếng Việt Hiển Thị | CTA Khả Dụng | Backend Fields Dùng |
|---|---|---|---|
| **Bàn trống** | "Bàn hiện đang trống. Mở phiên bàn để nhận khách và cấp mã PIN." | Mở phiên bàn | `table.session === null` |
| **Bàn có khách chưa có đơn** | "Bàn chưa có đơn hàng. Khách chưa gửi đơn nào trong phiên này." | Đóng / Xem mã PIN & QR | `orders.length === 0`, `canSettle: false` |
| **Đang phục vụ (còn món đang làm)** | "Còn N đơn chưa hoàn tất phục vụ." | Chuyển sang tab Đơn hàng để kiểm tra → | `outstandingOrders > 0`, `canSettle: false` |
| **Đủ điều kiện chốt** | "Tổng hóa đơn phải thu ... đ" | Chốt hóa đơn (Khóa gọi thêm) | `outstandingOrders === 0`, `canSettle: true`, `billVersion` |
| **Đang thanh toán (Owner)** | "Bàn đang trong quá trình thanh toán. Thiết bị của khách đã bị khóa gọi thêm món." | Xác nhận đã thu tiền / Tiếp tục nhận món (Hủy chốt) | `session.status: 'checkout_pending'`, `paymentMethod` |
| **Đang thanh toán (Khách)** | "Bàn đang được thanh toán. Bạn không thể gọi thêm món lúc này." | Xem hóa đơn bàn → | `session.status: 'checkout_pending'` |
| **Đơn mới chen ngang khi mở bill** | "Hóa đơn đã thay đổi từ lượt gọi món mới. Vui lòng tải lại hóa đơn." | Tải lại hóa đơn | `HTTP 409 Conflict`, `billVersion` mismatch |
| **Nhắc nhở xác thực thu tiền** | "Chỉ xác nhận khi đã nhận đủ tiền thực tế." | Xác nhận đã thu tiền (có loading) | `receivedConfirmed: true`, `requestId` |
| **Đã thanh toán (Owner)** | "Phiên bàn đã thanh toán thành công lúc HH:MM qua hình thức ..." | Hoàn tất & Đóng | `session.status: 'closed'`, `settledAt`, `paymentMethod` |
| **Đã thanh toán (Khách)** | "Phiên bàn đã kết thúc. Hóa đơn đã được thanh toán và phiên bàn đã đóng." | Xem lại hóa đơn bàn | `session.status: 'closed'` |
| **API chưa hoàn thiện** | "Đang kết nối API máy chủ. Tính năng xem hóa đơn bàn đang được máy chủ hoàn thiện." | Thử tải lại | `isBlockedByApi: true` (HTTP 404/501) |

---

### 5. Tích Hợp UI & API Backend (Codex Coordination)

- **API Khách hàng**:
  + Route thật: `GET /api/public/table-sessions/bill?qrCode=<codeHex>` (hoặc `/current/bill`).
  + Hook: `useCustomerTableBill({ qrCode, enabled })` tự động gọi client adapter và xử lý 404/501 thành cờ `isBlockedByApi` không giả lập runtime.
- **API Chủ quán**:
  + `fetchOwnerSessionBill(sessionId)`: Tải snapshot đầy đủ `TableBillView`.
  + `settleOwnerSession(sessionId, input)`:
    * `action: 'begin_checkout'` với `expectedVersion`, `expectedBillVersion`, `requestId`.
    * `action: 'cancel_checkout'` với `expectedVersion`, `requestId`.
    * `action: 'confirm_received'` với `expectedVersion`, `expectedBillVersion`, `paymentMethod`, `receivedConfirmed: true`, `requestId`.
- **An toàn giao dịch**:
  + Không tính tiền trên client. Toàn bộ `totalVnd`, `lineTotalVnd` và `outstandingOrders` lấy từ máy chủ.
  + Không hiển thị cổng thanh toán online Takeaway VietQR cho luồng Dine-in (chỉ hỗ trợ Tiền mặt & Chuyển khoản chủ quán tự xác nhận).
  + Idempotency `requestId` (UUIDv4) được tạo và gửi kèm mỗi lệnh settlement để ngăn chặn trừ tiền hay chốt trùng.

---

### 6. Kiểm Thử Responsive & Khả Năng Tiếp Cận (A11y)

- **Mobile First (Khách hàng)**: Đã kiểm tra bố cục trên 360px, 390px, 430px. Sheet cuộn mượt mà (`overscroll-contain`), text tiền tệ VND ngắt chuẩn không bị tràn cột, sticky footer tôn trọng safe-area inset bottom.
- **Tablet & Desktop (Chủ quán)**: Hộp thoại chuyển đổi mượt mà giữa Bottom Sheet (mobile) và Slide-over Drawer 600px bên phải (desktop >= 640px). Nút đóng, chuyển tab pill và các card mở rộng đều có touch target >= 44px.
- **Accessibility (A11y)**:
  + Cấu trúc tiêu đề đúng chuẩn `h1` -> `h4`.
  + Hộp thoại có đầy đủ thuộc tính `role="dialog"` hoặc `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`.
  + Trạng thái lỗi và cảnh báo luôn dùng biểu tượng kết hợp chữ viết rõ ràng, không phụ thuộc duy nhất vào màu sắc.
  + Phím Tab di chuyển tuần tự, hỗ trợ đóng nhanh với nút Close và click backdrop.

---

### 7. Kết Quả Kiểm Tra Mã Nguồn & Tự Động Hóa

| Lệnh Kiểm Thử | Trạng Thái | Chi Tiết |
|---|---|---|
| `npx vitest run --config tests/ui/vitest.config.mts` | **PASS** | **19 test files passed (240 / 240 tests passed, 0 failures)** |
| `npm run typecheck` | **PASS** | Route types generated, `tsc --noEmit` hoàn thành không có lỗi |
| `npm run lint` | **PASS** | ESLint chạy với `--max-warnings=0` hoàn tất sạch **0 errors, 0 warnings** |
| `npm run build` | **PASS** | Next.js 16 (Turbopack) build production bundle thành công trong 2.4s |

---

### 8. Đánh Giá Trạng Thái: READY CHO PROMPT 02

- **Trạng thái**: **READY** (Sẵn sàng 100% để chuyển tiếp sang Prompt 02 / Phase 5 E2E Integration).
- **Lý do**:
  1. Giao diện khách hàng và chủ quán đã hoàn thiện pixel-perfect đúng định hướng Minimal Emerald POS.
  2. Toàn bộ các flow gọi thêm món, xem hóa đơn theo bàn, chốt tiền, xác nhận thu tiền và đóng bàn đã được triển khai, bảo toàn triệt để các tính năng PIN và QR của Phase 2.
  3. Cả 4 bộ kiểm tra kỹ thuật (Unit Tests, Vitest, Typecheck, ESLint, Next.js Build) đều đạt kết quả tuyệt đối **PASS**.
  4. Hợp đồng dữ liệu `TableBillView` và `SettleSessionInput` đã khớp nối hoàn hảo với API backend mà Codex triển khai song song.
