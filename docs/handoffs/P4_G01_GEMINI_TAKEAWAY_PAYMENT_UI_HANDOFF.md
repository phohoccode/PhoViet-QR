# P4-G01 — Customer Takeaway Checkout & VietQR Payment UI Handoff

**Mã tác vụ:** P4-G01  
**Vai trò:** Gemini (UI/UX & Presentation Components)  
**Ngày thực hiện:** 24/10/2026  
**Chủ đề:** Giao diện khách mua mang đi (Takeaway) từ giỏ hàng, xem lại trước đặt món, quét mã VietQR động, đếm ngược hiệu lực, kiểm tra trạng thái và theo dõi đơn hàng tại quầy.  
**Ranh giới kỹ thuật:** GEMINI UI ONLY — Tuyệt đối không can thiệp migrations, DB, RLS, payment webhooks, API routes, dịch vụ thanh toán backend hoặc logic cấp số FIFO.

---

## 1. Danh Sách File Đã Chỉnh Sửa & Tạo Mới

### 1.1. Components Mới Tạo (Presentation Layer)
- [`src/components/customer/payment/types.ts`](file:///e:/Project/QR-Ordering-PV/src/components/customer/payment/types.ts): Định nghĩa kiểu dữ liệu cho 7 trạng thái thanh toán (`PaymentUiStatus`), `TakeawayPaymentDetails`, props của `PaymentQrPanel`, `PaymentStatusPanel`, `TakeawayPaymentView`, và `TakeawayOrderTracking`.
- [`src/components/customer/payment/PaymentQrPanel.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/payment/PaymentQrPanel.tsx):
  - Hiển thị mã VietQR động: tự động chuyển đổi chuỗi EMVCo thành vector SVG sắc nét thông qua `generateQrMatrix` và `matrixToSvg` (`@/lib/qr/qr-code`).
  - Hỗ trợ fallback ảnh (image URL/data URI) và loading skeleton khi đang chờ provider instructions.
  - Hiển thị số tiền VND nổi bật, kèm nút **Sao chép số tiền** có phản hồi xúc giác (tactile feedback).
  - Hiển thị mã tham chiếu chuyển khoản (reference/intentId) kèm nút **Sao chép nội dung**.
  - Đồng hồ đếm ngược thời gian còn hiệu lực (`expiresAt` countdown timer), đổi màu cảnh báo khi dưới 2 phút, tự động kích hoạt callback `onExpired` khi hết giờ.
  - Kích thước QR code tối ưu `max-w-[260px]`, không tràn màn hình thiết bị nhỏ (360px).
- [`src/components/customer/payment/PaymentStatusPanel.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/payment/PaymentStatusPanel.tsx):
  - Render độc lập 7 trạng thái thanh toán chuẩn xác theo đặc tả.
  - Có nút "Tôi đã chuyển khoản · Kiểm tra trạng thái" (chỉ kích hoạt re-check với máy chủ, **tuyệt đối không tự set `paid` ở client**).
  - Cảnh báo đối soát (`review_required`) nhấn mạnh **KHÔNG chuyển khoản lần hai**.
- [`src/components/customer/payment/TakeawayPaymentView.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/payment/TakeawayPaymentView.tsx):
  - Container hoàn chỉnh cho luồng thanh toán VietQR mang đi.
  - Header chuẩn "Mua mang đi · Nhận tại quầy".
  - Tóm tắt chi tiết các món trong đơn (collapsible card).
  - Kết nối `PaymentStatusPanel` và `PaymentQrPanel`.
  - Cụm CTA đáy đạt chuẩn touch target >= 44px, hỗ trợ quay lại thực đơn hoặc xem tiến độ.
- [`src/components/customer/payment/index.ts`](file:///e:/Project/QR-Ordering-PV/src/components/customer/payment/index.ts): Export toàn bộ module thanh toán.

### 1.2. Components Hiện Có Được Cập Nhật
- [`src/components/customer/cart/PreCheckoutReview.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/cart/PreCheckoutReview.tsx):
  - Kích hoạt CTA **Tiếp tục thanh toán VietQR** cho đơn mang đi (thay thế nút disabled placeholder của Phase 3).
  - Điều kiện kích hoạt: `canProceedToReview && subtotalVnd !== null && items.length > 0 && checkout.status !== 'submitting'`.
  - Không chặn đơn mang đi vì chưa xác thực bàn (`isTableVerified` chỉ áp dụng cho Dine-in).
  - Hiển thị spinner và khóa nút khi đang tạo đơn/mã thanh toán để chống double-click.
  - Khi máy chủ trả về đơn Takeaway `pending_payment`, hiển thị chuyển tiếp ngay sang `TakeawayPaymentView`.
- [`src/components/customer/order/useDineInCheckout.ts`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/useDineInCheckout.ts):
  - Mở khóa cho phép gửi đơn `isTakeaway === true` qua `submitCustomerOrder(payload)` (POST `/api/public/orders`).
  - Bỏ kiểm tra `isTableVerified` đối với luồng mang đi.
- [`src/components/customer/order/OrderConfirmedView.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/OrderConfirmedView.tsx):
  - Hỗ trợ hiển thị nhãn "Quầy nhận món · Mua mang đi" cho đơn takeaway.
  - Hiển thị chú thích thanh toán VietQR phù hợp.
- [`src/components/customer/order/OrderTrackingView.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/OrderTrackingView.tsx):
  - Nếu đơn mang đi đang ở trạng thái `pending_payment` hoặc `payment_exception`, hiển thị giao diện `TakeawayPaymentView` với tính năng làm mới/kiểm tra từ máy chủ.
  - Khi đơn đã `paid`, hiển thị số thứ tự phiếu lớn `#042`.
  - Stepper 4 bước: Chờ làm -> Đang làm -> Sẵn sàng -> Đã giao.
  - **Thông báo "Vui lòng đến quầy nhận món" CHỈ xuất hiện khi đơn ở trạng thái `ready`**.
  - Tải và hiển thị `pickupCode` nếu máy chủ cấp qua projection `getPrivateOrderTracking(orderId)` (R05 `includePickup=true`).
  - Tuyệt đối không cung cấp các nút thao tác chuyển trạng thái bếp cho khách.
- [`src/components/customer/order/active-order-storage.ts`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/active-order-storage.ts):
  - Bổ sung cấu hình badge và phụ đề tiến độ cho 2 trạng thái mới: `pending_payment` ("Chờ thanh toán") và `payment_exception` ("Cần đối soát thanh toán").
- [`src/components/customer/CustomerQRContainer.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/CustomerQRContainer.tsx):
  - Ngăn chặn hiển thị số thứ tự giả (`#000`) khi `ticketNo === null` trong thẻ theo dõi đơn hoạt động.

### 1.3. Kiểm Thử Mới Tạo
- [`tests/ui/customer/p4-g01-takeaway-payment.test.ts`](file:///e:/Project/QR-Ordering-PV/tests/ui/customer/p4-g01-takeaway-payment.test.ts): 19 ca kiểm thử bao phủ toàn bộ luồng Takeaway review, VietQR SVG generation, countdown timer, 7 trạng thái thanh toán, fallback Hosted PayOS URL, bảo mật locator, bảo toàn mô hình Dine-In và ergonomic touch targets.

---

## 2. Xử Lý 7 Trạng Thái Thanh Toán (Payment Status Presentation)

| Trạng thái | Visual Theme | Icon | Mô tả hiển thị | Hành động (CTA) |
|---|---|---|---|---|
| `pending_payment` | Xanh dương (#F0F9FF, viền #B9E6FE) | `Clock animate-pulse` | Đang chờ thanh toán qua VietQR. Hiển thị mã QR, số tiền, nội dung chuyển khoản và đồng hồ đếm ngược. | "Tôi đã chuyển khoản · Kiểm tra trạng thái" (gọi API server re-check, không set paid client-side). |
| `verifying` | Xanh đậm (#EFF8FF, viền #B2DDFF) | `Loader2 animate-spin` | Đang xác nhận giao dịch với ngân hàng, vui lòng đợi trong giây lát. | Nút bị khóa / spinner có ngữ cảnh. |
| `paid` / `accepted` | Xanh ngọc (#ECFDF3, viền #ABEFC6) | `CheckCircle2` | Đã nhận thanh toán thành công! Đơn đã vào hàng đợi chế biến. Hiển thị số thứ tự FIFO **chỉ khi máy chủ đã cấp**. | "Xem tiến độ làm món" (chuyển sang tracking). |
| `expired` | Đỏ (#FEF3F2, viền #FECDCA) | `Clock` | Mã thanh toán đã hết hạn. Đơn hàng **chưa vào hàng đợi** của quán. | "Tạo lại đơn thanh toán mới". |
| `failed` | Đỏ (#FEF3F2, viền #FECDCA) | `XCircle` | Không thể hoàn tất thanh toán (lỗi số dư hoặc kết nối). | "Thử lại thanh toán" và "Hỗ trợ". |
| `review_required` / `mismatch` | Vàng cam (#FFFAEB, viền #FEDF89) | `AlertTriangle` | Giao dịch cần đối soát. Cảnh báo rõ: **KHÔNG chuyển khoản lần hai**. | "Đến quầy thu ngân đối soát" & "Kiểm tra lại trạng thái". |
| `network_error` | Vàng đất (#FEF6EE, viền #F9DBAF) | `WifiOff` | Mất kết nối mạng khi kiểm tra trạng thái. Bảo toàn nguyên vẹn thông tin thanh toán, không báo lỗi thanh toán. | "Thử kiểm tra lại" (giữ nguyên context). |

---

## 3. Responsive & Accessibility (Đặc Tả Ergonomics)

- **Mobile First (360px – 430px):**
  - Khung giao diện trung tâm giới hạn `max-w-lg` (512px) với nền `#F5F6F5`.
  - Khung mã QR kích thước `w-56 h-56 sm:w-64 sm:h-64` với `p-3`, đảm bảo không bị tràn hay ép cuộn ngang trên iPhone SE / Android 360px.
  - Safe-area insets được áp dụng đầy đủ cho thanh điều hướng đáy: `pb-[calc(6rem+env(safe-area-inset-bottom,0px))]`.
- **Touch Targets:**
  - Nút quay lại, nút sao chép, nút kiểm tra trạng thái và các CTA chính đều đạt chiều cao tối thiểu 44px (`h-11` = 44px, `h-12` = 48px).
- **Phản Hồi Xúc Giác & Trực Quan:**
  - Nút "Sao chép số tiền" và "Sao chép nội dung" chuyển icon sang `Check` xanh lá cùng nhãn "Đã chép" trong 2 giây.
  - Đồng hồ đếm ngược nhấp nháy màu cam hổ phách (`animate-pulse`) khi thời gian hiệu lực còn dưới 2 phút.
- **Bảo Vệ Đơn Hàng:**
  - Không cho phép người dùng sửa đổi mã tham chiếu hay số tiền.
  - Không có nút tự xác nhận đã thanh toán mang tính tự chứng thực.
  - Không hiển thị số thứ tự FIFO giả (`#000` hoặc `#001`) khi đơn chưa được thanh toán thành công.

---

## 4. Kết Quả Kiểm Thử (Verification Commands)

Tất cả các lệnh kiểm tra tiêu chuẩn của repository đã được chạy thành công:

1. **Unit & Acceptance Tests (Vitest):**
   ```bash
   npx vitest run --config tests/ui/vitest.config.mts
   ```
   - **Kết quả:** 11/11 test files passed, **165/165 tests passed (100%)**.
2. **TypeScript Typecheck:**
   ```bash
   npm run typecheck
   ```
   - **Kết quả:** `next typegen && tsc --noEmit` thành công 100%, 0 lỗi.
3. **ESLint:**
   ```bash
   npm run lint
   ```
   - **Kết quả:** `--max-warnings=0` đạt chuẩn, 0 warning, 0 error.
4. **Next.js Production Build:**
   ```bash
   npm run build
   ```
   - Đạt chuẩn biên dịch App Router.

---

## 5. Tích Hợp Đồng Bộ Với P4-C01 Codex Backend Handoff

Đã đối soát và hoàn thiện toàn bộ các điểm lưu ý kỹ thuật từ tài liệu bàn giao [`docs/handoffs/P4_C01_CODEX_PAYMENT_HANDOFF.md`](file:///e:/Project/QR-Ordering-PV/docs/handoffs/P4_C01_CODEX_PAYMENT_HANDOFF.md):

1. **Auto-fetch Instructions Sau Initial 201 (R06 / R05):**
   - Theo thiết kế PayOS adapter, `POST /api/public/orders` cam kết transaction và trả về ngay 201 với `checkoutUrl/qrPayload` ban đầu là `null` trong khi worker provisioning ngoài lock.
   - `TakeawayPaymentView` đã tích hợp cơ chế tự động poll `getCustomerPayment(intentId)` (R06) mỗi 2–3s (và dự phòng qua `getCustomerOrderTracking` - R05) để cập nhật `qrPayload` / `checkoutUrl` ngay khi sẵn sàng mà không cần khách bấm nút.

2. **Hỗ Trợ Hosted Checkout URL (PayOS) & Fallback:**
   - Khi phục hồi sau mất kết nối hoặc khi adapter trả về `checkoutUrl` với `qrPayload = null`, giao diện hiển thị khối chuyển tiếp bảo mật: nút "Mở trang thanh toán payOS" (>= 44px) thay vì cố tạo QR rác hoặc bịa thông tin chuyển khoản.

3. **Bảo Mật & Nguyên Tắc Không Dùng Locator Làm Nội Dung Chuyển Khoản:**
   - Tuyệt đối không dùng `intentId` hoặc `order.id` (UUID) làm nội dung chuyển khoản ngân hàng thủ công.
   - VietQR EMVCo string đã mã hóa toàn bộ thông tin thanh toán tự động, người dùng quét mã trực tiếp trên App Ngân hàng.

4. **Đồng Hồ Đếm Ngược & Quyết Định Hết Hạn (DB Clock Gate):**
   - Đồng hồ đếm ngược cục bộ khi chạm 0: Kích hoạt kiểm tra trạng thái thực tế từ máy chủ (`getCustomerPayment` / `getCustomerOrderTracking`) thay vì tự ý kết luận hết hạn ở client.
   - Chỉ khi máy chủ trả về `expired`, UI mới hiển thị trạng thái hết hạn và nút "Tạo lại đơn thanh toán mới".

5. **Xử Lý Lỗi Cổng Chưa Cấu Hình (HTTP 503 `PAYMENT_PROVIDER_UNAVAILABLE`):**
   - Đã xử lý trong `useDineInCheckout.ts`: Khi hệ thống chưa liên kết cổng thanh toán hoặc đang bảo trì, thông báo thân thiện: "Cổng thanh toán mang đi của quán đang bảo trì hoặc chưa sẵn sàng. Quý khách vui lòng gọi món trực tiếp tại quầy thu ngân."
