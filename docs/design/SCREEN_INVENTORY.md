# SCREEN INVENTORY & UI STATES — QR Ordering Minimal MVP

> **Phiên bản:** 1.0 · **Ngày:** 23/10/2026  
> **Tác giả:** Senior Product Designer + UI Engineer (Gemini)  
> **Mục tiêu:** Bảng kiểm kê chi tiết toàn bộ màn hình, thành phần, trạng thái giao diện và yêu cầu hợp đồng dữ liệu gửi Codex.

---

## 1. Bảng Kiểm kê Toàn bộ Màn hình & Thành phần UI

| ID | Tên Màn hình / Thành phần | Vai trò & Chế độ | Mục đích chính | Hành động chính (Primary Action) | Nhóm Dữ liệu Yêu cầu (Expected Contract) | Các Trạng thái UI (States) | Breakpoint | Nhóm shadcn/ui |
|---|---|---|---|---|---|---|---|---|
| **SCR-C01** | `CustomerMenuPage` (Trang thực đơn chính) | Khách (Guest) · Cả Dine-in & Takeaway | Hiển thị thông tin quán, ngữ cảnh bàn/quầy, danh mục, thanh tìm kiếm và danh sách món ăn | Chọn món, thêm vào giỏ, bấm xem giỏ hàng | `MenuPayload`, `StoreContext`, `TableSessionContext?` | **Loading:** Skeleton thẻ món<br>**Empty:** "Chưa có món nào"<br>**Error:** Banner mất mạng/QR sai<br>**Success:** Danh sách phân nhóm | 375px (Chính), 768px, 1280px | `Card`, `Badge`, `Input`, `ScrollArea`, `Button`, `Skeleton` |
| **SCR-C02** | `ItemDetailDrawer` (Sheet tùy chọn món) | Khách (Guest) · Cả 2 chế độ | Xem ảnh to, mô tả, chọn size/đường/đá/topping, nhập ghi chú riêng của món | Bấm `Thêm vào giỏ hàng (+xx.000 đ)` | `MenuItem`, `MenuItemOption[]` | **Loading:** Spinner tải chi tiết<br>**Disabled:** Món hết hàng (`available=false`) | 375px (Bottom Sheet), >=768px (Dialog) | `Sheet`, `RadioGroup`, `Checkbox`, `Textarea`, `Button` |
| **SCR-C03** | `CartDrawer` (Ngăn kéo Giỏ hàng) | Khách (Guest) · Cả 2 chế độ | Xem lại danh sách món đã chọn, điều chỉnh số lượng (+/-), xóa món, nhập ghi chú chung | Bấm `Tiếp tục đặt hàng (xx.000 đ)` | `CartState`, `CartLine[]` | **Empty:** "Giỏ hàng đang trống"<br>**Error:** Báo món vừa hết hàng / đổi giá | 375px (Bottom Sheet), >=768px (Sheet Right) | `Sheet`, `Button`, `Separator`, `Textarea` |
| **SCR-C04** | `CheckoutDineInModal` (Xác nhận gọi món tại bàn) | Khách (Guest) · Chỉ Dine-in | Xác nhận số bàn, tổng tiền tạm tính, cam kết phục vụ | Bấm `Xác nhận gọi món (Cấp ticket ngay)` | `TableSessionContext`, `CartSummary` | **Loading:** Button loading "Đang gửi đơn..."<br>**Error:** Phiên bàn hết hạn (`SESSION_EXPIRED`) | 375px (Full Sheet), >=768px (Dialog) | `Dialog` hoặc `Sheet`, `Button`, `Card` |
| **SCR-C05** | `CheckoutTakeawayModal` (Thanh toán VietQR) | Khách (Guest) · Chỉ Takeaway | Hiển thị mã VietQR động, số tiền, mã tham chiếu, hướng dẫn không chuyển khoản lần 2 | Quét mã QR thanh toán trên App Ngân hàng | `PaymentViewState` (`qrPayload`, `merchantRef`, `expiresAt`) | **Pending:** Đồng hồ đếm ngược + Pulse<br>**Expired:** Báo quá hạn<br>**Success:** Chuyển sang Tracking | 375px (Full Sheet), >=768px (Dialog) | `Card`, `Badge`, `Button`, `Alert` |
| **SCR-C06** | `CustomerTrackingPage` (Theo dõi đơn hàng) | Khách (Guest) · Cả 2 chế độ | Hiển thị số Ticket lớn (FIFO), tiến trình làm món, mã nhận món mang đi (bảo mật) | Xem trạng thái; Gọi thêm món (Dine-in); Xuất trình mã nhận (Takeaway) | `OrderDetail`, `PickupCredential?` (chỉ khi có token) | **Loading:** Skeleton tracking<br>**Preparing:** Đang làm món<br>**Ready:** Sẵn sàng nhận<br>**Completed:** Đã giao | 375px (Chính), 768px, 1280px | `Card`, `Badge`, `Progress`, `Button` |
| **SCR-OWN-00** | `OwnerLoginPage` (Màn hình Đăng nhập) | Chủ quán (Owner) | Xác thực danh tính chủ quán để vào Dashboard quản trị | Nhập email/password và bấm `Đăng nhập` | `AuthCredentials` | **Loading:** Button loading state<br>**Error:** Sai mật khẩu / không thuộc store | 375px, 768px, 1280px | `Card`, `Input`, `Button`, `Alert` |
| **SCR-OWN-01** | `OwnerDashboardTabOrders` (Tab 1: Đơn hàng - Mặc định) | Chủ quán (Owner) | Quản lý hàng đợi đơn hàng theo chuẩn FIFO, hiển thị danh sách đơn và chi tiết đơn đang chọn | Bấm `▶ Nhận đơn tiếp theo (FIFO)`, `Đánh dấu Sẵn sàng`, `Xác nhận Đã giao` | `OrderQueuePayload`, `OrderDetail` | **Empty:** "Hiện không có đơn nào"<br>**Active:** Đang xử lý đơn #xxx<br>**Error:** Xung đột claim (`409 Conflict`) | 1024-1440px (70/30), 768px/375px (1 cột + Sheet) | `Tabs`, `Card`, `Badge`, `ScrollArea`, `Button`, `Sheet` |
| **SCR-OWN-02** | `OwnerDashboardTabTables` (Tab 2: Bàn) | Chủ quán (Owner) | Xem lưới các bàn phục vụ, mở phiên mới, xem tổng tiền các đơn trong phiên, quyết toán đóng bàn | Bấm `Mở phiên bàn`, `Quyết toán đã thu tiền & Đóng bàn` | `TableSummary[]`, `TableSessionDetail` | **Empty:** Không có bàn nào<br>**Loading:** Skeleton lưới bàn<br>**Occupied:** Bàn đang có khách | 1024-1440px (70/30), 768px/375px (1 cột + Sheet) | `Card`, `Badge`, `Button`, `Dialog`, `RadioGroup` |
| **SCR-OWN-03** | `OwnerDashboardTabMenu` (Tab 3: Menu) | Chủ quán (Owner) | Quản lý danh mục, danh sách món ăn, gạt nhanh Còn hàng / Hết hàng, thêm hoặc sửa thông tin món | Bật/tắt switch Còn hàng; Bấm `Lưu thay đổi món` | `MenuAdminPayload`, `MenuItemEditDto` | **Loading:** Skeleton list<br>**Success:** Toast "Đã cập nhật trạng thái"<br>**Error:** Báo lỗi lưu dữ liệu | 1024-1440px (70/30), 768px/375px (1 cột + Sheet) | `Card`, `Input`, `Switch`, `Button`, `Select`, `Textarea` |
| **SCR-OWN-04** | `OwnerDashboardTabSettings` (Tab 4: Cài đặt) | Chủ quán (Owner) | Quản lý thông tin quán, công tắc đóng/mở nhận đơn, tải mã QR bàn/quầy, xem trạng thái webhook cổng thanh toán | Gạt switch `Đang nhận đơn / Tạm ngừng`, Bấm `Tải trọn bộ QR bàn (PDF)` | `StoreSettingsPayload`, `PaymentProviderMetadata` | **Active:** Quán đang mở<br>**Paused:** Tạm ngưng nhận đơn<br>**Webhook Connected:** Đã kết nối | 1024-1440px (1 cột), 768px/375px (1 cột) | `Card`, `Switch`, `Input`, `Button`, `Separator` |

---

## 2. Chi tiết Yêu cầu Hợp đồng Dữ liệu (CONTRACT REQUEST CHO CODEX)

Dưới đây là các DTO và trường dữ liệu (fields) mà giao diện (UI) **yêu cầu bắt buộc phải có** từ Backend do Codex phụ trách. Mọi định nghĩa dưới đây là `EXPECTED CONTRACT` để hai bên tích hợp thông suốt:

### 2.1 Hợp đồng Menu Khách hàng (`EXPECTED CONTRACT: MenuItem`)
Giao diện khách hàng cần các trường sau để hiển thị thẻ sản phẩm, tính toán giỏ hàng và lọc danh mục:

```typescript
// EXPECTED CONTRACT FOR CODEX: MenuItem & Options
export interface MenuItemOption {
  id: string;              // UUID
  name: string;            // Ví dụ: "Ít ngọt (70%)", "Trân châu trắng"
  priceDeltaVnd: number;   // Chênh lệch giá, ví dụ: 5000 hoặc 0
  active: boolean;         // true/false
}

export interface MenuItem {
  id: string;              // UUID
  categoryId: string;      // UUID tham chiếu MenuCategory
  categoryName: string;    // Tên danh mục (để render chip/nhóm)
  name: string;            // Tên món ăn/đồ uống
  description?: string;    // Mô tả ngắn gọn nguyên liệu/hương vị
  priceVnd: number;        // Giá số nguyên VND (ví dụ: 35000)
  imageUrl?: string;       // Đường dẫn ảnh món ăn (nén tối ưu WebP)
  available: boolean;      // true: còn bán, false: hết hàng (hiển thị mờ + badge hết món)
  options?: MenuItemOption[]; // Danh sách tùy chọn đi kèm
}
```

### 2.2 Hợp đồng Tạo Đơn hàng Khách (`EXPECTED CONTRACT: OrderSubmission`)
Khách hàng submit giỏ hàng gửi lên API `POST /api/public/orders`:

```typescript
// CONTRACT REQUEST: Payload gửi từ Client lên Server
export interface SubmitOrderPayload {
  qrCode: string;          // Mã public_code quét từ QR
  clientRequestId: string; // UUID v4 idempotency do client tự sinh
  note?: string;           // Ghi chú chung cho toàn đơn
  items: {
    menuItemId: string;
    quantity: number;      // Số lượng (> 0)
    optionIds: string[];   // Mảng UUID các tùy chọn đã tích
    note?: string;         // Ghi chú riêng cho từng món
  }[];
}
```

### 2.3 Hợp đồng Phản hồi Chi tiết Đơn hàng (`EXPECTED CONTRACT: OrderDetail`)
Dữ liệu trả về cho màn hình Tracking của Khách và Panel Chi tiết Đơn của Chủ quán:

```typescript
export type OrderType = 'dine_in' | 'takeaway';
export type OrderStatus = 
  | 'pending_payment'   // Takeaway chờ thanh toán (chưa có ticket)
  | 'accepted'          // Đã vào hàng đợi, chờ chủ quán làm (đã có ticket)
  | 'preparing'         // Chủ quán đang chế biến
  | 'ready'             // Đã làm xong, sẵn sàng phục vụ
  | 'completed'         // Đã phục vụ ra bàn hoặc đã giao cho khách mang đi
  | 'cancelled'         // Đã hủy hợp lệ
  | 'payment_exception';// Lỗi thanh toán ngoại lệ

export interface OrderItemSnapshot {
  id: string;
  nameSnapshot: string;
  unitPriceVnd: number;
  qty: number;
  lineTotalVnd: number;
  optionsSnapshot?: string[];
  note?: string;
}

export interface OrderDetail {
  id: string;              // UUID đơn hàng
  publicId: string;        // Opaque ID để xem màn hình tracking
  type: OrderType;         // 'dine_in' | 'takeaway'
  status: OrderStatus;     // Trạng thái đơn hiện tại
  ticketNo: number | null; // Số thứ tự FIFO (BẮT BUỘC LÀ NULL KHI status='pending_payment')
  serviceDate: string;     // Ngày phục vụ theo timezone quán (YYYY-MM-DD)
  tableLabel?: string;     // Ví dụ: "Bàn 05" (nếu là dine_in)
  totalVnd: number;        // Tổng tiền đơn hàng
  items: OrderItemSnapshot[];
  note?: string;
  createdAt: string;       // ISO 8601
  acceptedAt?: string;     // ISO 8601
  
  // Dành riêng cho Takeaway khi thanh toán
  payment?: {
    intentId: string;
    status: 'pending' | 'succeeded' | 'failed' | 'expired';
    qrPayload?: string;    // Chuỗi VietQR chuẩn EMVCo để render mã QR
    merchantRef: string;   // Mã tham chiếu thanh toán (Ví dụ: "MOC-TK029")
    amountVnd: number;
    expiresAt: string;     // Thời điểm hết hạn thanh toán
  };

  // Dành riêng cho Khách xác minh nhận món Takeaway (CHỈ TRẢ VỀ CHO THIẾT BỊ CÓ TOKEN HỢP LỆ)
  pickupCode?: string;     // Ví dụ: "TK-8821" (Tuyệt đối không lộ ra feed công khai)
}
```

### 2.4 Hợp đồng Quản lý Bàn Chủ quán (`EXPECTED CONTRACT: TableSummary`)
Dành cho Tab Bàn trên Dashboard Chủ quán:

```typescript
export type TableSessionStatus = 'open' | 'checkout_pending' | 'closed';

export interface TableSummary {
  id: string;              // UUID bàn vật lý
  label: string;           // Ví dụ: "Bàn 01", "Bàn 02"
  active: boolean;         // true: đang kinh doanh, false: ngừng dùng
  currentSession?: {
    id: string;            // UUID phiên bàn hiện tại
    sessionCode: string;   // Mã phiên ngắn (ví dụ: "8821") để đối soát
    status: TableSessionStatus;
    openedAt: string;      // Thời gian mở phiên
    orderCount: number;    // Tổng số lượt gọi món trong phiên
    totalVnd: number;      // Tổng tiền tích lũy của bàn đang chờ quyết toán
  } | null;                // null nếu bàn đang trống
}
```

---

## 3. Checklist Phối hợp Biên Giao diện — Backend (UI Gateways)

- [x] **Nguyên tắc Ticket Bất Biến:** Client UI không bao giờ tự tính toán hoặc tự sinh `ticketNo`. Trường `ticketNo` chỉ được hiển thị khi Backend trả về số nguyên hợp lệ (`accepted` trở đi).
- [x] **Takeaway Payment Gate:** Không bao giờ chuyển màn hình sang trạng thái "Đang chờ chế biến" nếu `OrderDetail.status === 'pending_payment'`. Giao diện giữ nguyên đồng hồ đếm ngược và trạng thái kiểm tra thanh toán.
- [x] **Idempotency Client Key:** Khi gọi API submit đơn, UI sinh sẵn `clientRequestId` (UUID v4) trong React state. Nếu người dùng bấm nhiều lần do lag, cùng một key sẽ được gửi đi, đảm bảo không tạo 2 đơn trùng.
- [x] **Xử lý Ngoại lệ Realtime:** Khi kết nối Supabase Realtime bị đứt, giao diện hiển thị banner cảnh báo và kích hoạt cơ chế an toàn: tự động Fetch lại toàn bộ snapshot dữ liệu qua API polling mỗi 5 giây cho đến khi mạng hồi phục.
