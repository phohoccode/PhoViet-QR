# COMPONENT MAP & RESPONSIVE ARCHITECTURE — QR Ordering Minimal MVP

> **Phiên bản:** 1.0 (Phase 0 — Handoff Phase 1) · **Ngày:** 23/10/2026  
> **Tác giả:** Senior Product Designer / UI Engineer (Gemini)  
> **Nguồn tham chiếu:** `docs/contracts/types.ts`, `assets/ui-reference.png`, `DESIGN_FOUNDATION.md`  
> **Nguyên tắc cốt lõi:** Phân tách triệt để giữa Component Trình diễn (Presentational / Dumb UI) và Tầng Quản lý Dữ liệu (Container / Page). Tuyệt đối không import Supabase Client trực tiếp vào trong các component hiển thị UI.

---

## 1. Cấu trúc Cây Component Tổng thể

```
src/components/
├── ui/                              # shadcn/ui nguyên bản (Button, Card, Sheet, Dialog, Input...)
├── shared/                          # Dùng chung cho cả Khách hàng & Chủ quán
│   ├── StatusBadge.tsx              # Huy hiệu trạng thái đơn / thanh toán / bàn
│   ├── OrderTicket.tsx              # Hiển thị số Ticket lớn (FIFO)
│   ├── PriceTag.tsx                 # Định dạng tiền tệ VND chuẩn
│   ├── NetworkBanner.tsx            # Banner cảnh báo mất mạng / reconnect
│   ├── EmptyState.tsx               # Trạng thái rỗng (không có đơn / giỏ trống)
│   └── LoadingSkeleton.tsx          # Khung xương tải trang
├── customer/                        # Dành riêng cho Khách hàng (Mobile-first)
│   ├── CustomerHeader.tsx           # Header ngữ cảnh (Tên quán + Bàn/Quầy)
│   ├── CategoryPills.tsx            # Dải chip danh mục cuộn ngang
│   ├── MenuItemCard.tsx             # Thẻ món ăn trong danh sách
│   ├── ItemDetailSheet.tsx          # Sheet chọn tùy chọn/topping món
│   ├── StickyCartBar.tsx            # Thanh giỏ hàng nổi cố định đáy
│   ├── CartDrawer.tsx               # Ngăn kéo giỏ hàng (tăng giảm, ghi chú)
│   ├── CheckoutDineInSheet.tsx      # Xác nhận gọi món tại bàn
│   ├── CheckoutTakeawaySheet.tsx    # Hiển thị VietQR động & đếm ngược
│   ├── TrackingProgress.tsx         # Thanh tiến trình chế biến 4 bước
│   ├── PickupCodeCard.tsx           # Hộp mã nhận món bảo mật
│   └── TableSessionPinModal.tsx     # Modal nhập mã PIN phiên bàn
└── owner/                           # Dành riêng cho Chủ quán (Dashboard 4 Tabs)
    ├── OwnerHeader.tsx              # Header thanh trắng bo tròn
    ├── OwnerHeaderPills.tsx         # Thanh 4 tab viên thuốc căn giữa
    ├── OrderQueueList.tsx           # Danh sách hàng đợi đơn hàng (Cột trái 70%)
    ├── OrderCard.tsx                # Thẻ đơn hàng đơn lẻ trong hàng đợi
    ├── OrderDetailPanel.tsx         # Chi tiết đơn & nút hành động (Cột phải 30%)
    ├── TableGrid.tsx                # Lưới thẻ bàn phục vụ (Tab Bàn - Trái 70%)
    ├── TableCard.tsx                # Thẻ bàn đơn lẻ hiển thị phiên & tổng tiền
    ├── TableSessionDetailPanel.tsx  # Chi tiết phiên bàn & Settle (Tab Bàn - Phải 30%)
    ├── MenuAdminList.tsx            # Danh sách món & Toggle Còn/Hết (Tab Menu - Trái 70%)
    ├── MenuItemEditPanel.tsx        # Form sửa/thêm món ăn (Tab Menu - Phải 30%)
    └── StoreSettingsPanel.tsx       # Bảng cài đặt quán & Xuất QR (Tab Cài đặt - 1 cột)
```

---

## 2. Đặc tả Chi tiết Thành phần & Props (Ánh xạ `types.ts`)

### 2.1 Nhóm Thành phần Dùng chung (Shared Components)

#### `StatusBadge` (Tái sử dụng toàn hệ thống)
- **Mục đích:** Render huy hiệu trạng thái với màu sắc ngữ nghĩa chuẩn (không dùng màu brand tùy tiện), luôn đi kèm icon và chữ tiếng Việt.
- **Props đề xuất:**
```typescript
interface StatusBadgeProps {
  status: OrderStatus | PaymentStatus | TableSessionStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}
```
- **Hành vi hiển thị:** Tự động map backend enum sang nhãn và màu sắc tương ứng từ `UX_STATE_MATRIX.md` (ví dụ: `preparing` → màu xanh dương `#2563A6`, icon `ChefHat`, text "Đang làm").

#### `OrderTicket`
- **Mục đích:** Hiển thị số thứ tự phục vụ FIFO.
- **Props đề xuất:**
```typescript
interface OrderTicketProps {
  ticketNo: number | null; // BẮT BUỘC RENDER NULL NẾU LÀ TAKEAWAY CHƯA PAID
  type: OrderType;
  tableLabel?: string | null;
  size?: 'inline' | 'card' | 'hero'; // 'hero' dùng cho màn hình Tracking của khách (36px Bold)
}
```
- **Quy tắc an toàn:** Nếu `ticketNo === null`, component render badge `Chờ thanh toán` hoặc `Đang cấp số...`, tuyệt đối không render số 0 hoặc số giả định.

#### `NetworkBanner`
- **Mục đích:** Thông báo trạng thái mạng khi kết nối Supabase Realtime bị ngắt.
- **Props:** `{ isOnline: boolean; isReconnecting: boolean; lastSyncTime?: string }`.

---

### 2.2 Nhóm Thành phần Khách hàng (Customer Components)

#### `MenuItemCard`
- **Mục đích:** Hiển thị thẻ món ăn trong danh sách thực đơn của khách.
- **Props đề xuất:**
```typescript
interface MenuItemCardProps {
  item: MenuItem; // { id, name, priceVnd, description, imageUrl, available, options }
  onQuickAdd: (item: MenuItem) => void;      // Dành cho món KHÔNG có options
  onOpenOptions: (item: MenuItem) => void;  // Dành cho món CÓ options
}
```
- **Hành vi:**
  - Nếu `item.available === false`: Hiển thị overlay mờ, badge đỏ `Hết hàng`, nút chuyển thành `Hết món` (Disabled).
  - Ảnh dùng component `next/image` với `aspect-square`, `object-cover`, fallback placeholder khi `imageUrl` là null.

#### `StickyCartBar`
- **Mục đích:** Thanh giỏ hàng nổi cố định ở đáy màn hình điện thoại.
- **Props:** `{ itemCount: number; totalVnd: MoneyVnd; onOpenCart: () => void }`.
- **Styling:** Nền `#1D725E`, chữ trắng, bo góc 16px, padding `env(safe-area-inset-bottom)`.

#### `CheckoutTakeawaySheet`
- **Mục đích:** Hiển thị mã VietQR động, bộ đếm ngược và cảnh báo chuyển khoản.
- **Props đề xuất:**
```typescript
interface CheckoutTakeawaySheetProps {
  isOpen: boolean;
  payment: TakeawayPaymentViewState; // { amountVnd, qrPayload, merchantRef, expiresAt, intentStatus }
  onClose: () => void;
  onRetryNewIntent?: () => void;     // Khi mã 15 phút hết hạn
}
```

---

### 2.3 Nhóm Thành phần Chủ quán (Owner Dashboard Components)

#### `OwnerHeaderPills`
- **Mục đích:** Thanh điều hướng 4 tab dạng viên thuốc căn giữa header theo đúng ảnh mẫu `ui-reference.png`.
- **Props:**
```typescript
interface OwnerHeaderPillsProps {
  activeTab: 'orders' | 'tables' | 'menu' | 'settings';
  counts?: { ordersWaiting?: number; tablesOccupied?: number };
  onTabChange: (tab: 'orders' | 'tables' | 'menu' | 'settings') => void;
}
```
- **Styling:** Capsule bo tròn hoàn toàn (`rounded-full`), nền xám `#F7F8F7`. Tab active phủ nền `#35977D` với chữ và biểu tượng màu trắng.

#### `OrderQueueList` (Cột trái 70% của Tab Đơn hàng)
- **Mục đích:** Hiển thị nút FIFO Claim và danh sách các thẻ đơn hàng đang xử lý.
- **Props:**
```typescript
interface OrderQueueListProps {
  orders: (OrderSummary & { status: 'accepted' | 'preparing' | 'ready' })[];
  selectedOrderId: string | null;
  filter: 'all' | 'dine_in' | 'takeaway';
  isClaiming: boolean;
  onSelectOrder: (id: string) => void;
  onFilterChange: (filter: 'all' | 'dine_in' | 'takeaway') => void;
  onClaimNext: () => void; // Gọi POST /api/owner/queue/claim-next
}
```
- **Quy tắc FIFO:** Nút `[ ▶ NHẬN ĐƠN TIẾP THEO ]` nằm ở vị trí đầu tiên. Bị `disabled` khi không có đơn nào ở trạng thái `accepted`.

#### `OrderDetailPanel` (Cột phải 30% của Tab Đơn hàng)
- **Mục đích:** Hiển thị toàn bộ chi tiết món, ghi chú, trạng thái tiền và các nút hành động hợp lệ.
- **Props:**
```typescript
interface OrderDetailPanelProps {
  order: OrderDetail | null;
  isActionLoading: boolean;
  onMarkReady: (orderId: string) => void;
  onCompleteDineIn: (orderId: string) => void;
  onCompleteTakeaway: (orderId: string, pickupCode: string) => void;
}
```

---

## 3. Bảng Phân bổ Breakpoints & Hành vi Thích ứng (Responsive Matrix)

| Khu vực / Màn hình | Breakpoint Mobile (`375px – 639px`) | Breakpoint Tablet (`640px – 1023px`) | Breakpoint Desktop (`1024px – 1440px`) |
|---|---|---|---|
| **Customer Menu** | Danh sách 1 cột dọc; Sticky Cart Bar cố định đáy | Lưới Grid 2 cột món ăn; Sticky Cart chuyển thành Floating Pill góc phải | Container tối đa 960px căn giữa; Grid 2 cột; Giỏ hàng mở dạng Sheet bên phải |
| **Customer Cart** | Bottom Sheet trượt từ đáy màn hình lên (chiếm 85% chiều cao) | Bottom Sheet hoặc Right Drawer trượt từ cạnh phải (rộng 400px) | Right Sheet trượt từ cạnh phải (rộng 440px) |
| **Customer Tracking**| Thẻ Ticket chiếm trọn màn hình, nút bấm lớn dưới chân | Khung Ticket căn giữa rộng 480px | Khung Ticket căn giữa rộng 540px, bóng đổ mềm |
| **Owner Dashboard Shell** | Header co gọn; thanh Tab cuộn ngang; Padding vỏ 8px | Header đầy đủ; Tab ở trên; Padding vỏ 16px | Shell trắng `rounded-[28px]` trên nền xám `#F5F6F5`; Max-width 1440px |
| **Owner Tab Đơn hàng** | **1 cột duy nhất:** Danh sách đơn full-width. Bấm đơn → Mở Sheet chi tiết trượt lên | **1 cột hoặc Collapsible Drawer:** Bấm đơn → Drawer chi tiết trượt từ phải | **2 cột cố định 70 / 30:** Cột trái hàng đợi cuộn độc lập; Cột phải chi tiết cố định |
| **Owner Tab Bàn** | Lưới 2 cột thẻ bàn. Chi tiết mở qua Sheet | Lưới 3 cột thẻ bàn. Chi tiết mở qua Sheet | Lưới 4 cột thẻ bàn bên trái (70%); Panel quyết toán bên phải (30%) |
| **Owner Tab Menu** | Danh sách món 1 cột. Nút sửa mở Full Sheet | Danh sách món 1 cột. Form sửa mở Right Sheet | Danh sách món bên trái (70%); Form sửa món bên phải (30%) |

---

## 4. Nguyên tắc Hiệu suất & Tối ưu Giao diện (UI Performance Rules)

1. **Lazy Loading Ảnh món:** Toàn bộ ảnh món ăn sử dụng `next/image` với format WebP, kích thước hiển thị cố định, áp dụng thuộc tính `loading="lazy"` cho các món nằm dưới màn hình đầu tiên (below the fold).
2. **Khung xương (Skeleton) Siêu Nhẹ:** Trong lúc chờ API hoặc Reconnect, hiển thị Skeleton khối xám phẳng không chứa text hoặc icon phức tạp. Thời gian chuyển trạng thái không dùng animation dài làm lag thiết bị cảm ứng yếu.
3. **Ảo hóa Danh sách (Virtualization Threshold):** Đối với hàng đợi đơn hàng của chủ quán, nếu số lượng thẻ đơn vượt quá 40 thẻ, áp dụng kỹ thuật ảo hóa danh sách để tránh render hàng trăm thẻ DOM cùng lúc làm chậm thao tác cảm ứng.
4. **Cô lập Đăng ký Realtime (Isolated Subscription):** Tuyệt đối không gắn listener Supabase Realtime vào từng component con (như `OrderCard` hay `MenuItemCard`). Toàn bộ việc nhận sự kiện Realtime chỉ thực hiện ở cấp Container / Page (`dashboard/page.tsx` và `order/[publicId]/page.tsx`), sau đó truyền dữ liệu xuống các component con qua Props sạch sẽ.
5. **Nguồn Sự Thật Theme Duy Nhất:** Tất cả biến màu sắc, bán kính bo góc và khoảng cách chỉ định nghĩa 1 lần duy nhất trong `DESIGN_FOUNDATION.md` và file CSS gốc (`globals.css`). Tuyệt đối không hardcode mã HEX rải rác trong các file JSX/TSX.
