# Handoff Giao Diện Khách Hàng Phase 3 — P3-G01
## Dine-in Checkout Confirmation & Customer Order Tracking UI

`Tài liệu bàn giao UI cho luồng Đặt món Tại bàn (Dine-in) & Theo dõi đơn hàng`  
`Dự án: QR Ordering Minimal MVP` · `Ngày hoàn thành: 23/10/2026` · `Tác giả: Gemini (UI/UX Engineering)`

---

## 1. Danh Sách Màn Hình, Route & Component Thực Tế

### 1.1 Các Route URL Hoạt Động
- `/q/[code]`: Trang chính của khách hàng (quét QR bàn hoặc quầy). Tích hợp toàn diện: Menu, Giỏ hàng, Xem lại đơn (Pre-checkout review), và Xác nhận đặt món (Order Confirmed View).
- `/order/[id]`: Trang theo dõi tiến độ đơn hàng theo thời gian thực (Order Tracking Route). Hỗ trợ query `?qrCode=[code]` để khách gọi thêm món quay về đúng bàn ban đầu.

### 1.2 Danh Sách File / Component Đã Xây Dựng & Cập Nhật
1. [`src/components/customer/order/order-api.ts`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/order-api.ts):
   - Client adapter kết nối API chuẩn:
     - R04: `POST /api/public/orders` -> `submitDineInOrder(input: CreateOrderV1Input): Promise<OrderDetail>`.
     - R05: `GET /api/public/orders/:id` -> `fetchCustomerOrder(orderId: string): Promise<OrderDetail>`.
   - Cung cấp fixture typed an toàn cho chế độ dev / preview và unit tests.
2. [`src/components/customer/order/useDineInCheckout.ts`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/useDineInCheckout.ts):
   - React hook quản lý toàn bộ vòng đời đặt món Dine-in: `idle` -> `submitting` -> `uncertain` -> `confirmed` / `error`.
   - Quản lý `clientRequestId` (UUID v4) ổn định: tái sử dụng qua các lần retry khi mạng chập chờn; chỉ hủy khi hoàn tất hoặc khi người dùng thay đổi giỏ hàng.
3. [`src/components/customer/cart/PreCheckoutReview.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/cart/PreCheckoutReview.tsx):
   - Nâng cấp màn hình xem lại: hiển thị tên quán, bàn, danh sách món kèm đơn giá tạm tính.
   - Nút CTA thông minh:
     - Chưa xác thực bàn: "Vui lòng nhập mã bàn để đặt món" (mở / focus form xác thực).
     - Đang gửi: Khóa nút, hiển thị spinner `Loader2`, "Đang gửi đơn...".
     - Mạng gián đoạn: Hiển thị banner cảnh báo, cung cấp nút "Kiểm tra lại / Thử lại gửi đơn" dùng cùng `clientRequestId`.
     - Đơn thành công: Tự động chuyển sang `OrderConfirmedView`.
4. [`src/components/customer/order/OrderConfirmedView.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/OrderConfirmedView.tsx):
   - Màn hình vé đơn sau khi server trả `201 Created`: hiển thị số phiếu lớn (ví dụ `#028`), tên bàn, trạng thái `Chờ làm`, tổng tiền chốt và thời gian nhận đơn.
   - Nhắc nhở thanh toán tại bàn; không hiện QR thanh toán hay yêu cầu trả trước cho Dine-in.
   - Hai nút CTA: "Theo dõi tiến độ đơn" (chuyển sang `/order/[id]`) và "Gọi thêm món" (quay về menu với giỏ hàng mới, tiếp tục dùng phiên bàn đã verify).
5. [`src/components/customer/order/OrderTrackingView.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/OrderTrackingView.tsx):
   - Màn hình theo dõi tiến độ đơn hàng: Progress stepper 4 bước (`accepted` -> `preparing` -> `ready` -> `completed` hoặc cảnh báo `cancelled`).
   - Tự động polling tiết chế (12 giây) khi tab đang active; tự động dừng khi tab ẩn (`visibilitychange`) hoặc khi đơn đã kết thúc.
   - Nút "Gọi thêm món khác" dẫn khách về `/q/[code]`.
6. [`src/app/(customer)/order/[id]/page.tsx`](file:///e:/Project/QR-Ordering-PV/src/app/(customer)/order/[id]/page.tsx):
   - Server page App Router render `OrderTrackingView` với dynamic route `/order/[id]`.
7. [`src/components/customer/cart/CartSheet.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/cart/CartSheet.tsx) & [`src/components/customer/CustomerQRContainer.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/CustomerQRContainer.tsx):
   - Truyền ngữ cảnh `qrCode`, `storeName`, `isDemo` và điều phối luồng người dùng mượt mà.

---

## 2. UX State Matrix (Ma Trận Trạng Thái Giao Diện)

| Trạng thái UX | Điều kiện kích hoạt | Hành vi giao diện & Nút bấm CTA | Chính sách giỏ hàng |
| :--- | :--- | :--- | :--- |
| **Cart Ready (Dine-in)** | Bàn đã verify + giỏ có món + không lỗi giá | Nút "Xác nhận đặt món" màu Emerald `#1D725E`, cho phép bấm gửi | Giữ nguyên món trong giỏ |
| **Table Verify Needed** | Bàn chưa verify (`requiresSessionCode=true`) | Nút cam nhạt: "Vui lòng nhập mã bàn để đặt món", click focus vào input mã phiên | Bảo lưu giỏ hàng, không xóa |
| **Empty Cart** | Giỏ hàng không có món nào (`totalQuantity=0`) | Nút CTA bị disabled, hiển thị thông báo "Giỏ hàng rỗng" | Giỏ rỗng |
| **Submitting** | Khách vừa bấm "Xác nhận đặt món" | CTA disabled, spinner xoay, chữ "Đang gửi đơn...". Chống double-click tuyệt đối | Giữ nguyên chờ server trả kết quả |
| **Uncertain (Timeout/Net Error)** | Fetch ném TypeError hoặc timeout mạng | Hiển thị banner cam "Kết nối gián đoạn. Chưa rõ quán đã nhận đơn hay chưa." Nút "Kiểm tra lại / Thử lại" replay với cùng `clientRequestId` | **Tuyệt đối KHÔNG xóa giỏ** |
| **Accepted (201 Confirmed)** | Server trả `201 Created` kèm `OrderDetail` | Chuyển sang `OrderConfirmedView`: vé số `#028`, Bàn 05, tổng tiền server chốt, nút "Theo dõi đơn" & "Gọi thêm món" | **Xóa sạch giỏ hàng** để sẵn sàng gọi lượt tiếp theo |
| **Menu / Price Changed** | Server trả 409 `PRICE_CHANGED` hoặc `OUT_OF_STOCK` | Banner đỏ thông báo thay đổi, nút "Cập nhật lại thực đơn", hủy `clientRequestId` cũ | Kích hoạt `cartActions.refresh()` để reconcile |
| **Session Expired** | Server trả 410 `SESSION_EXPIRED` | Banner cảnh báo phiên đã hết, nút "Nhập lại mã bàn" | Giữ nguyên món để khách không phải chọn lại |
| **Tracking: Accepted** | API R05 trả `status='accepted'` | Stepper sáng bước 1: "Đã nhận đơn", mô tả "Quán đã tiếp nhận" | N/A |
| **Tracking: Preparing** | API R05 trả `status='preparing'` | Stepper sáng bước 2: "Đang chế biến", mô tả "Bếp đang làm món" | N/A |
| **Tracking: Ready** | API R05 trả `status='ready'` | Stepper sáng bước 3: "Sẵn sàng", mô tả "Món đã sẵn sàng phục vụ" | N/A |
| **Tracking: Completed** | API R05 trả `status='completed'` | Stepper sáng bước 4: "Đã phục vụ", dừng polling tự động | N/A |
| **Tracking: Cancelled** | API R05 trả `status='cancelled'` | Hiển thị thẻ đỏ "Đơn hàng đã bị hủy", dừng polling | N/A |
| **Takeaway Review** | QR loại Takeaway (`type='takeaway'`) | Nút disabled: "Thanh toán mang đi (Sẽ mở ở Phase 4)". Không gửi đơn Dine-in giả | Giữ nguyên |

---

## 3. Tích Hợp API Thực Tế & Ranh Giới Kỹ Thuật

- **API Integration:**
  - **R04** (`POST /api/public/orders`): **REAL** (Kết nối trực tiếp handler thực tế do Codex triển khai).
  - **R05** (`GET /api/public/orders/:id`): **REAL** (Kết nối trực tiếp handler thực tế do Codex triển khai).
- **Quyền & Phân Tách:**
  - Client gọi qua `fetch` trình duyệt với cờ `credentials: 'include'`. Quyền đọc và ghi phiên bàn do HttpOnly session cookie quản lý độc lập trên server.
  - Tuyệt đối không lưu plaintext token, session code hay privileged keys trong LocalStorage/SessionStorage.

---

## 4. Quản Lý Idempotent ClientRequestId

- Cơ chế thực hiện:
  - Khi bắt đầu gửi đơn, UI sinh `clientRequestId = crypto.randomUUID()` và lưu trong `clientRequestIdRef` và state.
  - Khi gặp lỗi mạng gián đoạn (`uncertain`), UI giữ nguyên `clientRequestId` này cùng payload snapshot.
  - Khách bấm "Kiểm tra lại / Thử lại", lệnh `submitDineInOrder` gửi lại chính xác cùng một `clientRequestId`. Phía backend Codex nhờ đó nhận diện được duplicate request và trả về kết quả đã commit mà không bị tạo 2 đơn.
  - Khi khách quay lại chỉnh sửa món (thay đổi ý định) hoặc server báo giá đổi (`PRICE_CHANGED`), `clientRequestId` được reset về `null` để lệnh tiếp theo được cấp UUID mới hoàn toàn.

---

## 5. Kết Quả Kiểm Thử & Tiêu Chuẩn Kỹ Thuật

```bash
# 1. ESLint kiểm tra tĩnh (yêu cầu nghiêm ngặt 0 warnings, 0 errors)
npm run lint
# Output: ESLint passed with 0 warnings and 0 errors.

# 2. TypeScript typecheck
npm run typecheck
# Output: next typegen && tsc --noEmit -> 0 errors.

# 3. Toàn bộ 6 test files Vitest phía UI (bao gồm 12 bài test mới cho P3-G01)
npx vitest run --config tests/ui/vitest.config.mts
# Output:
# ✓ tests/ui/menu-flow.test.ts (11 tests)
# ✓ tests/ui/qr-flow.test.ts (10 tests)
# ✓ tests/ui/tables-qr-flow.test.ts (17 tests)
# ✓ tests/ui/p2-g05-acceptance.test.ts (23 tests)
# ✓ tests/ui/customer/p3-g01-dine-in-checkout.test.ts (12 tests)
# ✓ tests/ui/cart/cart-flow.test.ts (15 tests)
# Test Files: 6 passed (6) | Tests: 88 passed (88)

# 4. Kiểm tra Auth Tests
npm run test:auth
# Output: 7 test files passed, 46 passed (46)

# 5. Build kiểm tra sản phẩm hoàn chỉnh
npm run build
# Output: Compiled successfully in 1988ms. All 13 dynamic/static routes generated.
```

### Tiêu Chuẩn Responsive & Accessibility (a11y):
- **Touch targets:** Toàn bộ nút chính (CTA, Back, Refresh, More) có chiều cao tối thiểu 44px–48px (`h-11`, `h-12`).
- **Mobile-first:** Giao diện tối ưu hoàn hảo trên kích thước mobile (320px, 375px, 430px) và giới hạn container `max-w-lg` (512px) trên desktop.
- **Tương phản & Màu sắc:** Phối màu Minimal Emerald (#F5F6F5, #1D725E, #1D2522) tương phản đạt chuẩn WCAG AA; không chỉ dùng màu sắc đơn lẻ để phân biệt trạng thái đơn hàng.

---

## 6. Danh Sách Các Mục Nằm Ngoài Phạm Vi (Out of Scope)
Các chức năng dưới đây theo thiết kế được giữ nguyên hoặc chờ các Phase tiếp theo:
1. **Thanh toán VietQR cho Takeaway:** Giữ cho Phase 4 theo đúng kế hoạch kiến trúc.
2. **Realtime WebSocket / Supabase Subscriptions:** Sẽ thực hiện ở Phase 6; hiện tại UI dùng polling tiết chế 12 giây khi tab active.
3. **Owner Claim-Next / KDS Kitchen Screen:** Sẽ triển khai ở Phase 3 Prompt 02.
4. **Báo cáo doanh thu & Phân quyền nhân viên nâng cao:** Không thuộc MVP.
