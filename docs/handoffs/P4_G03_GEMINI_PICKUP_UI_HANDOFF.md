# P4-G03 — Takeaway Pickup UX: Hiển Thị Mã Nhận Món & Xác Minh Giao Đơn Handoff

**Mã tác vụ:** P4-G03  
**Vai trò:** Gemini (UI, Design, Frontend Presentation & UX)  
**Ngày thực hiện:** 24/10/2026  
**Chủ đề:** Khách Takeaway thấy mã nhận món 6 chữ số sau thanh toán; Chủ quán nhập mã để giao đơn khi ready trong tab Đơn hàng hiện hữu.  
**Ranh giới kỹ thuật:** GEMINI UI ONLY — Tuyệt đối không can thiệp migrations, database schema, RLS, payment webhooks, FIFO queue services, auth, hashing hay backend logic.

---

## 1. Danh Sách File Đã Tạo Mới & Chỉnh Sửa

### 1.1. Components Mới Tạo (Presentation Layer)
- [`src/components/customer/order/TakeawayPickupCard.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/TakeawayPickupCard.tsx):
  - Component hiển thị thẻ nhận món mang đi độc lập:
    * **Định dạng hiển thị:** Định dạng 6 chữ số thành cụm `012 345` dễ đọc qua hàm `formatPickupCodeDisplay`.
    * **Sao chép bảo toàn:** Nút "Sao chép mã" lưu vào clipboard đúng 6 ký tự số liên tiếp `012345` (bảo toàn số 0 ở đầu), kèm phản hồi xúc giác "Đã chép mã" trong 2 giây.
    * **Trạng thái `accepted` / `preparing`:** Hiển thị thẻ nhỏ độc lập với mã nhận món hoặc skeleton "Đang chuẩn bị mã nhận món..." nếu API đang cấp mã.
    * **Trạng thái `ready`:** Khối banner nổi bật màu xanh dương/ngọc với biểu tượng `BellRing` nhấp nháy, tiêu đề "Món của bạn đã sẵn sàng!" và "Vui lòng đến quầy nhận món", mã 6 số hiển thị to bản `text-3xl sm:text-4xl font-mono`.
    * **Trạng thái `completed`:** Chuyển sang "Đã nhận món tại quầy", hiển thị giờ hoàn thành (nếu có), mã nhận món được mask `••••••` kèm nhãn "Đã sử dụng", không tiếp tục thúc giục khách đến quầy.
    * **Bảo mật:** Không đưa mã vào URL, console log hay analytics; không thiết kế ô nhập mã ở phía khách.
- [`src/components/owner/orders/TakeawayPickupVerificationDialog.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/owner/orders/TakeawayPickupVerificationDialog.tsx):
  - Hộp thoại (Desktop) / Bottom Sheet (Mobile) xác minh mã nhận món mang đi:
    * **Tiêu đề:** "Xác nhận giao món mang đi".
    * **Tóm tắt đơn:** Số thứ tự FIFO (`#028`), danh sách món, số lượng, tổng tiền VND, huy hiệu "Đã thanh toán · Sẵn sàng".
    * **Ô nhập mã:** `inputMode="numeric"`, `pattern="[0-9]*"`, `maxLength={6}`, giữ nguyên số 0 ở đầu, hỗ trợ dán (paste), tự động lọc bỏ ký tự không phải số ở presentation layer (`replace(/\D/g, '').slice(0, 6)`), autofocus khi mở.
    * **Nút hành động:** "Xác nhận đã giao" chỉ kích hoạt khi mã đủ 6 số (`/^[0-9]{6}$/`) và đơn đang ở trạng thái `ready`.
    * **Chống double-submit:** Vô hiệu hóa nút và hiện spinner `Loader2` "Đang xác minh...".
    * **Báo lỗi inline:**
      - Sai mã (`INVALID_PICKUP_CODE` / HTTP 400 / 422): "Mã chưa chính xác, vui lòng kiểm tra lại." (không lộ mã đúng).
      - Quá giới hạn (`RATE_LIMITED` / HTTP 429): "Đã thử quá nhiều lần. Vui lòng thử lại sau X giây." (dựa trên `retryAfterSeconds` từ server).
      - Xung đột (`INVALID_STATE_TRANSITION` / HTTP 409): "Trạng thái đơn hàng đã thay đổi trên hệ thống." kèm nút làm mới danh sách.
      - Lỗi mạng / 500: "Máy chủ chưa xác nhận được kết quả. Bấm lại để kiểm tra lại trạng thái." (giữ nguyên `requestId` để retry an toàn).

### 1.2. Components Hiện Có Được Cập Nhật
- [`src/components/customer/order/OrderTrackingView.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/OrderTrackingView.tsx):
  - Tích hợp `TakeawayPickupCard` vào bố cục theo dõi đơn khách hàng.
  - Tự động gọi `getPrivateOrderTracking(orderId)` ngay lần mount đầu tiên và trong chu kỳ polling khi đơn mang đi ở trạng thái `accepted`, `preparing`, hoặc `ready`.
  - Phân lập hoàn toàn với Dine-in: Đơn ăn tại bàn giữ nguyên thông báo phục vụ tại bàn, tuyệt đối không hiển thị thẻ mã nhận món hay ảnh hưởng PIN xác thực bàn.
- [`src/components/owner/orders/OrderDetailPanel.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/owner/orders/OrderDetailPanel.tsx):
  - Bổ sung prop `onVerifyTakeawayPickup`.
  - Thay thế khối thông báo khóa cũ ở Phase 3 bằng nút CTA chính: **"Xác minh nhận món & Giao đơn"** (chiều cao 48px, touch target chuẩn).
  - Giữ nguyên nút "Đã phục vụ ra bàn (Hoàn thành)" cho đơn Dine-in.
- [`src/components/owner/orders/OwnerOrdersView.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/owner/orders/OwnerOrdersView.tsx):
  - Quản lý trạng thái `takeawayVerifyingOrder`.
  - Tích hợp `<TakeawayPickupVerificationDialog>` trên toàn bộ giao diện (cột phải Desktop và Sheet Mobile).
  - Thực thi `handleConfirmTakeawayPickup` gọi `completeOrder(order.id, { requestId, expectedVersion, type: 'takeaway', pickupCode })` theo hợp đồng `CompleteOrderInput`.

### 1.3. Bộ Kiểm Thử Mới Tạo
- [`tests/ui/customer/p4-g03-takeaway-pickup.test.ts`](file:///e:/Project/QR-Ordering-PV/tests/ui/customer/p4-g03-takeaway-pickup.test.ts): 15 ca kiểm thử bao phủ toàn diện Customer Pickup Card, phân biệt trạng thái, định dạng 6 số, bảo toàn số 0 ở đầu, cách ly Dine-In, Owner input validation, error mapping và replay contract.

---

## 2. Ma Trận Trạng Thái Giao Diện (State Presentation Matrix)

### 2.1. Phía Khách Hàng (Customer Takeaway Tracking)

| Trạng thái Server | Giao diện Khách Hàng | Chi tiết Mã Nhận Món |
|---|---|---|
| `pending_payment` / `verifying` | Giữ màn hình quét VietQR / chờ xác nhận (`TakeawayPaymentView`) | Không hiển thị mã nhận món, không tạo ticket giả |
| `paid` + `accepted` / `preparing` | Stepper thể hiện Đã tiếp nhận / Đang chế biến; Số phiếu FIFO `#028` | Thẻ nhỏ hiển thị `012 345`, nút sao chép, hoặc skeleton "Đang chuẩn bị mã..." |
| `paid` + `ready` | Banner nổi bật: "Món của bạn đã sẵn sàng!" & "Vui lòng đến quầy nhận món" | Mã 6 số to bản `012 345`, nút sao chép có tactile feedback, hướng dẫn xuất trình tại quầy |
| `paid` + `completed` | Thẻ hoàn tất: "Đã nhận món tại quầy" + thời điểm | Mask `••••••`, huy hiệu "Đã sử dụng", không thúc giục đến quầy |
| `payment_exception` / `failed` / `expired` | Giao diện lỗi thanh toán Phase 4 | Không hiển thị mã nhận món |
| Mất mạng / Timeout | Thông báo "Không thể cập nhật trạng thái" + Thử lại | Không tự ý chuyển trạng thái client-side |
| **Dine-in (Ăn tại bàn)** | Stepper ăn tại bàn, thông báo nhân viên mang món ra bàn | **Tuyệt đối không hiển thị thẻ mã nhận món** |

### 2.2. Phía Chủ Quán (Owner Dashboard — Tab Đơn Hàng)

| Trạng thái Đơn | Loại Đơn | Hành Động Khả Dụng | Thao Tác |
|---|---|---|---|
| `accepted` | Takeaway / Dine-in | Nút trung tâm "Nhận đơn tiếp theo" | Tuân thủ tuyệt đối hàng đợi FIFO |
| `preparing` | Takeaway / Dine-in | Nút "Đã làm xong (Chuyển sang Sẵn sàng)" | Chuyển đơn sang `ready` |
| `ready` | **Dine-in** | Nút "Đã phục vụ ra bàn (Hoàn thành)" | Gọi `completeOrder` với `{ type: 'dine_in' }`, không mở popup |
| `ready` | **Takeaway** | Nút **"Xác minh nhận món & Giao đơn"** | Mở Dialog/Sheet xác minh, nhập mã 6 số |
| `completed` / `cancelled` | Mọi loại đơn | Nhãn thông báo kết thúc (Read-only) | Khóa mọi thao tác chuyển trạng thái |

---

## 3. Tiêu Chuẩn Responsive & Accessibility

1. **Mobile First (360px – 430px):**
   - Dialog tự động thích ứng thành Bottom Sheet bo góc lớn `rounded-t-[28px]`, đệm an toàn `pb-[env(safe-area-inset-bottom)]`.
   - Ô nhập mã số lớn, căn giữa, dễ đọc, kích hoạt bàn phím số nguyên bản trên thiết bị di động (`inputMode="numeric"`).
   - Chiều cao các nút hành động đạt chuẩn ergonomics: `h-12` (48px) cho nút chính, `h-11` (44px) cho nút phụ/sao chép.
2. **Keyboard & Focus:**
   - Phím `Escape` đóng Dialog/Sheet an toàn.
   - Phím `Enter` tự động submit khi đã nhập đủ 6 chữ số hợp lệ.
   - Tự động autofocus vào ô nhập mã khi Dialog mở.
3. **Phản Hồi Xúc Giác & Trực Quan:**
   - Nút "Sao chép mã" chuyển biểu tượng `Copy` -> `Check` xanh lá cùng nhãn "Đã chép mã" trong 2 giây.

---

## 4. Kết Quả Kiểm Thử (Verification Commands)

Tất cả các lệnh kiểm thử và kiểm tra chất lượng mã nguồn trong repository đều vượt qua 100%:

1. **UI Tests (Vitest):**
   ```bash
   npx vitest run --config tests/ui/vitest.config.mts
   ```
   - **Kết quả:** 12/12 test files passed, **183/183 tests passed (100%)** (bao gồm 18 tests tại `tests/ui/customer/p4-g03-takeaway-pickup.test.ts`).
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
4. **Contract Validator:**
   ```bash
   python docs/contracts/validate_contracts.py
   ```
   - **Kết quả:** PASS 100%.
5. **Next.js Production Build:**
   ```bash
   npm run build
   ```
   - **Kết quả:** Biên dịch tối ưu App Router thành công trong 3.2s.

---

## 5. Tình Trạng Phụ Thuộc Tích Hợp (Integration Status)

- **Trạng thái UI:** **HOÀN THÀNH (READY_FOR_INTEGRATION)**.
- **Tình trạng tích hợp backend (Codex P4-C03):**
  * Codex đã hoàn thành migration `20261024001100_takeaway_pickup.sql` và backend service `src/server/pickup/service.ts`, xác nhận trạng thái **READY_FOR_UI_INTEGRATION**.
  * Frontend UI gọi trực tiếp client với `includePickup=true` qua `getPrivateOrderTracking(orderId)` gom đơn và mã nhận món trong 1 request duy nhất.
  * Hộp thoại xác minh của chủ quán gửi đúng payload `{ type: 'takeaway', pickupCode, expectedVersion, requestId }`, bảo toàn số 0 ở đầu (6 ASCII digits), mapping đầy đủ các mã lỗi backend:
    - `INVALID_PICKUP_CODE` (422) -> "Mã chưa chính xác, vui lòng kiểm tra lại."
    - `ORDER_ALREADY_COMPLETED` (409) -> "Đơn hàng này đã được xác nhận hoàn tất trước đó." + refresh orders.
    - `PICKUP_NOT_ALLOWED` (409) -> "Đơn hàng chưa đủ điều kiện giao món (chưa sẵn sàng hoặc chưa thanh toán)."
    - `PICKUP_CREDENTIAL_UNAVAILABLE` (503) -> "Dịch vụ mã nhận món tạm thời không khả dụng. Vui lòng liên hệ hỗ trợ."
    - `DUPLICATE_REQUEST_CONFLICT` (409) -> "Mã yêu cầu bị xung đột dữ liệu. Vui lòng kiểm tra lại thao tác."
    - `RATE_LIMITED` (429) -> "Đã thử quá nhiều lần. Vui lòng thử lại sau X giây."
    - Network timeout / 500 -> "Máy chủ chưa xác nhận được kết quả. Bấm lại để kiểm tra lại trạng thái." (tái sử dụng nguyên vẹn `requestId`).
  * Luồng Dine-in hoàn toàn độc lập và không ảnh hưởng: giữ nguyên xác thực PIN 6 số và nút "Đã phục vụ ra bàn" không mở modal nhận món.
