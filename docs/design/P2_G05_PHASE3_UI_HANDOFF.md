# Handoff Thiết Kế UI Phase 3 — P2-G05

`Tài liệu bàn giao UI từ Phase 2 (P2-G05) sang Phase 3 (Đơn hàng & Hàng đợi Bếp FIFO)`  
`Dự án: QR Ordering Minimal MVP` · `Ngày cập nhật: 23/10/2026` · `Tác giả: Gemini (UI/UX Engineering)`

---

## 1. Mục Đích & Phạm Vi Handoff
Tài liệu này xác định điểm kết nối kỹ thuật và giao diện (UI integration boundary) giữa kết quả hoàn thành của **Phase 2 (Menu, Table Verification, QR Management, Cart)** và các yêu cầu sắp tới của **Phase 3 (Order Creation, Kitchen FIFO Queue, Order Tracking)**.

### Nguyên Tắc Bất Biến (Non-negotiables)
1. **Không tạo đơn giả / thanh toán giả ở Phase 2**: Mọi nút kích hoạt đơn hàng ở Phase 2 hiện được giữ ở trạng thái vô hiệu hóa (disabled) kèm ghi chú rõ ràng.
2. **Tách bạch luồng Ăn tại bàn (Dine-in) và Mang đi (Takeaway)**: Không bao giờ gộp màn hình thanh toán tức thì vào luồng ăn tại bàn.
3. **Tuân thủ API Contract V1 (`docs/contracts/API_CONTRACT_V1.md`)**: Sử dụng đúng DTOs, HTTP status codes, mã lỗi idempotent, và grant cookies do Codex backend cấp.

---

## 2. Điểm Gắn Phase 3 Vào Cart Review (Customer UX)

### 2.1 Vị trí gắn component
Trong component [`CartSheet.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/customer/cart/CartSheet.tsx), phần `footer` chứa nút CTA chính:
```tsx
// Phase 2:
<Button 
  disabled 
  className="w-full h-12 bg-emerald-600/60 text-white font-medium cursor-not-allowed"
>
  Sẽ kích hoạt ở Phase 3 (Đặt món & Hàng đợi)
</Button>
```

### 2.2 Trạng thái UI trong Phase 3
Khi bước sang Phase 3, nút CTA sẽ chuyển đổi hành vi theo chế độ đơn hàng (`orderType`):
- **Dine-in (Tại bàn)**:
  - Nhãn nút: `"Xác nhận đặt món"` (khi bàn đã xác thực phiên `isVerified = true`).
  - Nếu bàn chưa xác thực: Nút hiển thị `"Vui lòng nhập mã bàn để đặt món"`, click sẽ mở Sheet xác thực mã phiên (`TableSessionVerifyForm`).
- **Takeaway (Mang đi)**:
  - Nhãn nút: `"Tiến hành thanh toán mang đi"`.

### 2.3 Quá trình Submit & Idempotency (`clientRequestId`)
1. **Pending State**:
   - Khi khách nhấn CTA, kích hoạt `isSubmitting = true`.
   - Nút chuyển sang trạng thái loading với spinner Lucide `Loader2`, text: `"Đang gửi đơn hàng..."`, `disabled = true` để chống double click.
   - Sinh `clientRequestId` (chuẩn UUID v4) và lưu tạm vào `sessionStorage` cùng giỏ hàng đã chuẩn hóa để hỗ trợ replay nếu mất kết nối mạng.
2. **Payload gửi lên R04 (`POST /api/public/orders`)**:
   ```json
   {
     "qrCode": "TABLE_05_PUBLIC",
     "clientRequestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
     "menuRevision": "menu-r7",
     "items": [
       {
         "menuItemId": "uuid-item-1",
         "quantity": 2,
         "optionIds": ["uuid-opt-1"],
         "note": "Ít ngọt"
       }
     ],
     "note": "Không lấy ống hút"
   }
   ```
3. **Xử lý Error States từ Server**:
   - **409 `PRICE_CHANGED`**: Hiển thị inline alert cảnh báo *"Giá hoặc món ăn trong giỏ đã thay đổi. Vui lòng xem lại giỏ hàng."* $\rightarrow$ UI tự động kích hoạt `reconcileWithMenu` từ Cart facade và yêu cầu khách xác nhận lại.
   - **409 `OUT_OF_STOCK`**: Hiển thị banner *"Một số món trong giỏ hiện đã hết hàng."* $\rightarrow$ Đánh dấu đỏ các dòng món hết hàng trong giỏ.
   - **410 `SESSION_EXPIRED`**: Hiển thị popup *"Phiên bàn đã kết thúc hoặc bị đóng bởi nhân viên. Vui lòng liên hệ phục vụ."* $\rightarrow$ Vô hiệu hóa giỏ hàng.
   - **403 `SESSION_REQUIRED`**: Mở form nhập mã phiên bàn.
   - **Network Error / 500**: Giữ nguyên `clientRequestId`, hiển thị nút *"Thử lại"* để gửi lại đúng payload cũ (idempotent replay).
4. **Success State Transition**:
   - Làm rỗng giỏ hàng sau khi nhận HTTP 201 (`clearCart()`).
   - Đóng `CartSheet` và chuyển hướng (hoặc mở Drawer toàn màn hình) tới trang theo dõi đơn hàng: `/order/:id`.

---

## 3. Khác Biệt Giữa UI Dine-In và Takeaway Trong Phase 3 & 4

| Tiêu chí | Ăn tại bàn (Dine-in) — Phase 3 | Mang đi (Takeaway) — Phase 3/4 |
|---|---|---|
| **Điều kiện đặt món** | Yêu cầu phiên bàn hợp lệ (`session.status === 'open'`) | Không yêu cầu phiên bàn, không cần số bàn |
| **Trạng thái khởi tạo** | `status: "accepted"`, `statusLabel: "Chờ làm"` | `status: "pending_payment"`, `statusLabel: "Chờ thanh toán"` |
| **Cấp số thứ tự (Ticket)** | Có ngay `ticketNo` (ví dụ: `#28`), lưu theo ngày phục vụ | Chưa có `ticketNo` (`ticketNo: null`), chưa vào hàng đợi |
| **Trạng thái thanh toán** | `paymentStatus: "unpaid"`, thanh toán sau tại bàn | `paymentStatus: "pending"`, bắt buộc thanh toán trước |
| **Màn hình tiếp theo** | Màn hình **Theo dõi đơn bàn**: hiển thị Ticket No, danh sách món, trạng thái "Chờ làm" | Màn hình **Thanh toán VietQR**: hiển thị mã QR động VietQR, countdown hết hạn (10 phút) |
| **Gia nhập hàng đợi bếp** | Đơn được đưa ngay vào FIFO Kitchen Queue của chủ quán | Chỉ vào FIFO Queue sau khi Webhook ngân hàng xác nhận đã nhận đủ tiền |
| **Trách nhiệm Phase 3** | **TRIỂN KHAI TOÀN BỘ LUỒNG DINE-IN** | **TẠO ĐƠN PENDING & HƯỚNG DẪN THANH TOÁN (Phase 4 chốt Webhook/VietQR)** |

> [!IMPORTANT]
> **Tuyệt đối không trộn màn hình thanh toán Takeaway vào Phase 3 Dine-In**: Khách ăn tại bàn gọi món không bao giờ bị chặn bởi cổng thanh toán chuyển khoản trước khi đơn được gửi vào bếp.

---

## 4. Owner Dashboard: Tab "Đơn Hàng" (Kitchen FIFO Queue)

### 4.1 Hiện trạng Phase 2
Tab Đơn hàng tại [`OwnerShell.tsx`](file:///e:/Project/QR-Ordering-PV/src/components/owner/OwnerShell.tsx) đang hiển thị **Waiting Shell**:
- Không hiển thị số liệu doanh thu / đơn hàng giả lập.
- Badge: *"Sẽ kích hoạt ở Phase 3 (Đơn hàng & Hàng đợi Bếp)"*.
- Khối mô tả trực quan giới thiệu cơ chế FIFO và quy trình 3 bước xử lý đơn.

### 4.2 Thiết kế UI Phase 3 (KDS - Kitchen Display System)
Trong Phase 3, Tab Đơn hàng sẽ nhận dữ liệu thực từ `GET /api/owner/orders` (R07) với cấu trúc như sau:

```
+-----------------------------------------------------------------------------------------+
| [TAB ĐƠN HÀNG]   (●) Tự động cập nhật                                                  |
+-----------------------------------------------------------------------------------------+
| [ Hàng đợi FIFO: 3 đơn chờ ]            [ NÚT CHÍNH: Nhận đơn tiếp theo (FIFO) -> ]   |
+-----------------------------------------------------------------------------------------+
| CỘT 1: CHỜ LÀM (accepted)    | CỘT 2: ĐANG LÀM (preparing) | CỘT 3: SẴN SÀNG (ready)    |
|                              |                             |                            |
| +--------------------------+ | +-------------------------+ | +------------------------+ |
| | TICKET #28   [Bàn 05]    | | | TICKET #27   [Mang đi]  | | | TICKET #26   [Bàn 02]  | |
| | 12:30 (Chờ 5 phút)       | | | 12:25 (Đang làm 8 ph)   | | | 12:15                  | |
| | 2x Phở Bò Tái Nạm        | | | 1x Cà phê sữa đá        | | | 1x Phở Gà Đặc Biệt     | |
| | - Note: Không hành       | | |                         | | |                        | |
| |                          | | | [Nút: Xong món -> Ready]| | | [Nút: Đã giao -> Hoàn tất]
| +--------------------------+ | +-------------------------+ | +------------------------+ |
| +--------------------------+ |                             |                            |
| | TICKET #29   [Mang đi]   | |                             |                            |
| | 12:32 (Đã TT VietQR)     | |                             |                            |
| +--------------------------+ |                             |                            |
+-----------------------------------------------------------------------------------------+
```

### 4.3 Các hành động chuyển trạng thái của Chủ quán
1. **Nhận đơn (FIFO Claim)**:
   - Gọi `POST /api/owner/queue/claim-next` (R08) với body `{ requestId: UUID }`.
   - Backend tự động serialize và chuyển đơn có `ticketNo` nhỏ nhất sang `preparing`.
   - UI chuyển Card đơn hàng sang Cột "Đang làm".
2. **Báo xong món (Mark Ready)**:
   - Gọi `POST /api/owner/orders/:id/ready` (R09) với body `{ requestId: UUID, expectedVersion: number }`.
   - Backend chuyển trạng thái sang `ready`.
   - UI phát âm thanh thông báo nhẹ (chime) và chuyển Card sang Cột "Sẵn sàng".
3. **Hoàn tất / Giao món (Complete)**:
   - Gọi `POST /api/owner/orders/:id/complete` (R10).
   - **Đối với Dine-in**: Gọi với `{ requestId: UUID, expectedVersion: number, type: "dine_in" }` $\rightarrow$ Một chạm hoàn tất.
   - **Đối với Takeaway**: Mở Dialog yêu cầu nhập mã nhận món 4 ký tự do khách đọc (`pickupCode`): `{ requestId: UUID, expectedVersion: number, type: "takeaway", pickupCode: "..." }`. Nếu mã sai $\rightarrow$ Hiển thị lỗi inline `422 INVALID_PICKUP_CODE`.

---

## 5. Danh Sách Interface & Props Yêu Cầu Cho Phase 3

### 5.1 Các kiểu dữ liệu từ Contract (`docs/contracts/types.ts`)
```typescript
// Input tạo đơn
export interface CreateOrderV1Input {
  qrCode: string;
  clientRequestId: string; // UUID v4
  menuRevision: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    optionIds: string[];
    note: string | null;
  }>;
  note: string | null;
}

// Chi tiết đơn hàng trả về cho Customer & Owner
export interface OrderDetail {
  id: string;
  storeId: string;
  type: 'dine_in' | 'takeaway';
  tableSessionId: string | null;
  table: { id: string; label: string } | null;
  status: 'pending_payment' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'payment_exception';
  statusLabel: string;
  ticketNo: number | null;
  serviceDate: string | null;
  acceptedAt: string | null;
  paymentStatus: 'unpaid' | 'pending' | 'paid' | 'refunded';
  fulfillmentStatus: 'awaiting_preparation' | 'preparing' | 'ready' | 'served' | 'collected';
  totalVnd: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  lines: Array<{
    id: string;
    menuItemId: string;
    name: string;
    baseUnitPriceVnd: number;
    options: Array<{ menuOptionId: string; name: string; priceDeltaVnd: number }>;
    unitPriceVnd: number;
    quantity: number;
    lineTotalVnd: number;
    note: string | null;
  }>;
  note: string | null;
  payment: {
    kind: 'table_session' | 'takeaway';
    intentId: string | null;
    intentStatus: string | null;
    status: string;
    statusLabel: string;
    amountVnd: number;
    currency: 'VND';
    qrPayload?: string | null;
    expiresAt?: string | null;
  };
}
```

### 5.2 Client Functions Cần Bổ Sung Trong `api-client.ts`
Các hàm sau được kỳ vọng Codex backend cung cấp trong module client:

```typescript
// Customer Order Client (Guest Scope)
export function submitCustomerOrder(input: CreateOrderV1Input): Promise<ApiResponse<OrderDetail>>;
export function getCustomerOrderTracking(orderId: string): Promise<ApiResponse<OrderDetail>>;
export function getTakeawayPaymentStatus(intentId: string): Promise<ApiResponse<TakeawayPaymentViewState>>;

// Owner Kitchen & Queue Client (Owner Scope)
export function getOwnerOrders(query?: { view?: 'queue' | 'exceptions' | 'history'; limit?: number }): Promise<ApiResponse<OwnerOrdersView>>;
export function claimNextOrder(requestId: string): Promise<ApiResponse<OrderDetail | null>>;
export function markOrderReady(orderId: string, input: { requestId: string; expectedVersion: number }): Promise<ApiResponse<OrderDetail>>;
export function completeOrder(orderId: string, input: { requestId: string; expectedVersion: number; type: 'dine_in' } | { requestId: string; expectedVersion: number; type: 'takeaway'; pickupCode: string }): Promise<ApiResponse<OrderDetail>>;
```

---

## 6. Tiêu Chí Nghiệm Thu UI Khi Triển Khai Phase 3
1. [ ] Khách ăn tại bàn gửi đơn thành công nhận ngay Ticket No và chuyển sang màn hình theo dõi đơn hàng.
2. [ ] Khách mang đi nhận mã thanh toán và hướng dẫn trước khi đơn được đưa vào bếp.
3. [ ] Chủ quán nhận đơn theo đúng thứ tự FIFO khi ấn nút "Nhận đơn tiếp theo".
4. [ ] Khách không thể tự đánh dấu đơn "Đã làm xong" hay "Đã thanh toán".
5. [ ] Mọi thao tác cập nhật trạng thái đơn của chủ quán đều có bảo vệ chống stale state (`expectedVersion`).
