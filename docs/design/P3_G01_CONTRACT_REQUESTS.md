# Contract Requests & Phản Hồi Kỹ Thuật UI — Phase 3 (P3-G01)

`Tài liệu ghi nhận yêu cầu & phản hồi contract giữa Gemini (UI/UX) và Codex (Backend/Domain)`  
`Dự án: QR Ordering Minimal MVP` · `Ngày lập: 23/10/2026` · `Tác giả: Gemini (UI/UX Engineering)`

---

## 1. Tổng Quan Tương Thích Contract R04 & R05
Trong giai đoạn P3-G01, giao diện khách hàng (Dine-in Checkout & Order Tracking) đã kết nối với hai route công khai của Codex:
- **R04**: `POST /api/public/orders` — Tiếp nhận command `CreateOrderV1Input` và trả về `201 Created` kèm `OrderDetail`.
- **R05**: `GET /api/public/orders/:id` — Trả về `200 OK` kèm `OrderDetail` (hoặc `PrivateOrderTrackingView` khi `includePickup=true`).

Toàn bộ các schema xác thực tại `src/lib/validations/orders.ts` (`createOrderInput`, `orderTrackingQuery`) và types tại `docs/contracts/types.ts` đã được UI tuân thủ 100%, không ép kiểu hay lách schema.

---

## 2. Các Đề Xuất & Ghi Nhận Cho Codex (Contract Notes)

### CR-P3-01: Định Dạng Trả Về Của R05 (Union vs Unwrap)
- **Hiện trạng:**
  - Khi gọi `GET /api/public/orders/:id` không kèm query (`includePickup=false`), server trả về payload `{ data: OrderDetail, error: null }`.
  - Khi gọi có query `includePickup=true`, server trả về `{ data: { order: OrderDetail, pickup: ... }, error: null }`.
- **Xử lý phía UI (Gemini):**
  - Adapter `fetchCustomerOrder` đã tự động chuẩn hóa:
    ```ts
    const resolvedOrder: OrderDetail =
      'order' in data ? (data as { order: OrderDetail }).order : (data as OrderDetail);
    ```
- **Khuyến nghị cho Codex:** Giữ nguyên quy ước phân biệt này, đảm bảo `order.table` luôn có `label` (ví dụ `Bàn 05`) để UI hiển thị nhất quán trên trang `/order/[id]`.

### CR-P3-02: Idempotent Replay Cùng Session Cookie
- **Ghi nhận:**
  - Khi kết nối mạng bị gián đoạn (`uncertain` state), UI bảo lưu nguyên vẹn `clientRequestId` (UUID v4) và payload ban đầu để gửi lại khi người dùng bấm "Kiểm tra lại / Thử lại".
  - Codex cần tiếp tục bảo đảm rằng replay cùng `clientRequestId` và cùng browser hash sẽ trả về đúng bản ghi `OrderDetail` đã commit, không tính thêm lượt ticket hay phát sinh order thứ hai.

### CR-P3-03: Dữ Liệu Cho Phase 4 (Takeaway VietQR Payment)
- **Ghi nhận:**
  - Trong Phase 3 (P3-G01), UI giữ nút Đặt món Takeaway ở trạng thái disabled kèm thông báo: *"Đơn mang đi sẽ thanh toán trước khi quán chế biến (Mở ở Phase 4)"*.
  - Đến Phase 4, `POST /api/public/orders` cho Takeaway sẽ cần trả về `payment.checkoutUrl` và `payment.qrPayload` theo đúng hợp đồng `TakeawayPaymentViewState`. UI đã sẵn sàng tích hợp khi Codex bước sang Phase 4.
