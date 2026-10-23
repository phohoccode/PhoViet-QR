# DESIGN FOUNDATION — QR Ordering Minimal MVP

> **Phiên bản:** 1.0 · **Ngày:** 23/10/2026  
> **Tác giả:** Senior Product Designer + UI Engineer (Gemini)  
> **Nguồn tham chiếu gốc:** `assets/ui-reference.png`, `UI.md`, `PRD.md`, `ARCHITECTURE.md`, `PLAN.md`  
> **Phạm vi áp dụng:** Thiết kế giao diện Next.js + Tailwind CSS + shadcn/ui (Giai đoạn Phase 0)

---

## 1. Phân tích hình mẫu thẩm mỹ (`assets/ui-reference.png`)

Hình mẫu tham chiếu chính thức do chủ dự án phê duyệt thể hiện phong cách **Minimal Emerald POS** mang tính chuyên nghiệp, thoáng đãng, sắc sảo và hiện đại.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  VỎ TRANG NGOÀI: Xám trắng rất nhạt (#F5F6F5)                                                    │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ PANEL CHÍNH TRẮNG TINH KHIẾT (#FFFFFF) · Bo góc lớn 24-28px · Viền mảnh 1px (#E9ECEA)       │  │
│  │ ┌────────────────────────────────────────────────────────────────────────────────────────┐ │  │
│  │ │ HEADER: [Logo thương hiệu]      [ Pill Navigation căn giữa ]      [Tài khoản / Ca làm] │ │  │
│  │ └────────────────────────────────────────────────────────────────────────────────────────┘ │  │
│  │ ┌──────────────────────────────────────────────────────┬─────────────────────────────────┐ │  │
│  │ │ KHỐI NỘI DUNG CHÍNH (Chiếm ~70% chiều ngang)        │ KHỐI CHI TIẾT (~30% chiều ngang)│ │  │
│  │ │ - Hàng đợi đơn hàng / Sơ đồ lưới bàn / Danh mục món │ - Thẻ thông tin ngữ cảnh        │ │  │
│  │ │ - Màu Emerald (#35977D) tạo điểm nhấn nhận diện     │ - Nút tác vụ trực tiếp          │ │  │
│  │ │ - Nhiều khoảng trắng, đường nét thanh thoát         │ - Trực quan hóa tiến độ tròn    │ │  │
│  │ └──────────────────────────────────────────────────────┴─────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Các đặc trưng thẩm mỹ cốt lõi từ ảnh:
1. **Khung làm việc "Đảo nổi" (Floating Canvas):** Panel trắng tinh khiết `#FFFFFF` nằm nổi bật trên lớp nền tổng thể xám sáng nhạt `#F5F6F5`. Bo góc lớn (24–28px) và viền mảnh 1px mang lại cảm giác thiết bị POS cảm ứng nguyên khối cao cấp.
2. **Thanh điều hướng viên thuốc căn giữa (Centered Pill Navigation):** Menu chính đặt trong một capsule bo tròn hoàn toàn (`rounded-full`), nền xám dịu `#F7F8F7`. Tab đang chọn phủ nền màu xanh ngọc `#35977D` với chữ và biểu tượng màu trắng nổi bật.
3. **Tỷ lệ phân chia kinh điển 70/30:** Không gian làm việc chia thành 2 cột bất đối xứng: 70% bên trái dành cho danh sách/lưới dữ liệu vận hành chính; 30% bên phải dành cho thông tin chi tiết của đối tượng đang chọn kèm các nút hành động trực tiếp.
4. **Màu Emerald/Teal đặc trưng:** Tông màu chủ đạo là xanh ngọc `#35977D` mang tính tự nhiên, tươi mới, tạo cảm giác tin cậy và thư thái cho môi trường dịch vụ ẩm thực (F&B).
5. **Tiết chế tối đa hiệu ứng thị giác:** Tuyệt đối không dùng gradient cầu kỳ, không hiệu ứng kính mờ (glassmorphism), không bóng đổ dày đặc, không minh họa 3D hay viền neon rực rỡ. Độ tương phản đến từ viền 1px tinh tế và khoảng cách đệm (whitespace) hào phóng.

---

## 2. 7 Nguyên tắc thiết kế rút ra từ hình mẫu

| STT | Nguyên tắc | Áp dụng trực tiếp cho Owner (Desktop/Tablet) | Biến đổi cho Customer (Mobile-first) |
|---|---|---|---|
| **1** | **Floating Island Canvas** *(Đảo nổi tập trung)* | Giữ nguyên vỏ xám `#F5F6F5` với panel trắng bo góc 24-28px, giới hạn chiều rộng 1440px tạo cảm giác POS chuyên dụng cao cấp. | Bỏ lề xám ngoài để tận dụng 100% diện tích màn hình 375–430px. Chuyển cảm giác "đảo nổi" thành các Card bo góc 16px và Bottom Floating Cart Bar. |
| **2** | **Central Pill Navigation** *(Điều hướng viên thuốc)* | Thanh 4 tab căn giữa trên Header: `Đơn hàng` · `Bàn` · `Menu` · `Cài đặt` nằm trong capsule xám nhạt `#F7F8F7`. | Chuyển đổi thành **Category Chips** cuộn ngang ngay dưới thanh tìm kiếm, cho phép lọc món tức thì bằng 1 ngón tay. |
| **3** | **70/30 Contextual Split** *(Bố cục ngữ cảnh 70/30)* | Cột trái 70% (Hàng đợi/Lưới bàn/Menu) + Cột phải 30% (Chi tiết đơn/Phiên bàn/Form món). Xem và xử lý cùng lúc. | **Thay thế cột 30% bằng Bottom Sheet (Drawer)** trượt từ dưới lên (Cart Sheet, Topping Sheet, Tracking). Thao tác ngón cái tự nhiên, không che khuất ngữ cảnh. |
| **4** | **Selective Emerald Accent** *(Nhấn màu có kiểm soát)* | Dùng `#1D725E` cho nút bấm chính (CTA `Nhận đơn tiếp theo`), viền chọn active dùng `#35977D`, nền highlight dùng `#E8F4F0`. | Dùng `#1D725E` cho các nút bấm chuyển đổi cao (`Thêm món`, `Xem giỏ`, `Xác nhận gọi món`, `Thanh toán VietQR`). |
| **5** | **Strict Semantic Status** *(Trạng thái tách bạch màu brand)* | Phân định rõ 5 màu: Chờ (xám trung tính), Đang làm (xanh dương info), Sẵn sàng (xanh ngọc success), Chờ tiền/Cảnh báo (hổ phách warning), Hủy/Lỗi (đỏ error). Luôn kèm chữ và icon. | Tương tự owner, khách nhìn thấy trạng thái đơn minh bạch: Chờ làm → Đang làm → Sẵn sàng → Đã nhận. Không dùng màu xanh brand cho trạng thái chờ tiền. |
| **6** | **High Whitespace & Tactile Clarity** *(Khoảng trắng rộng & chạm chuẩn)* | Mật độ thông tin vừa phải, các nút bấm tối thiểu 44px để thao tác cảm ứng trên máy POS/tablet không bị ấn nhầm lúc quán đông. | Vùng chạm (tap target) tối thiểu 44–48px cho nút tăng giảm số lượng, thêm món, thanh toán. Padding cạnh tối thiểu 16px. |
| **7** | **Zero Visual Noise** *(Loại bỏ yếu tố gây nhiễu)* | Đường viền 1px mảnh `#E9ECEA`, shadow cấp 1 nhẹ nhàng. Không hiệu ứng giật lag khi realtime cập nhật đơn hàng. | Giao diện cực nhẹ, ưu tiên tải nhanh trên mạng 3G/4G yếu tại quán. Không dùng ảnh nền nặng, không animation thừa. |

---

## 3. Hệ thống Color Tokens (Chuẩn shadcn/ui & CSS Variables)

Hệ màu được xây dựng dựa trên bảng mã HEX đã được phê duyệt trong `UI.md`, tinh chỉnh tương phản đạt chuẩn WCAG AA cho văn bản và nút bấm tương tác.

### 3.1 Bảng mã màu HEX & Ý nghĩa sử dụng

| Tên Token UI | Giá trị HEX | Vai trò & Ứng dụng | Tiêu chuẩn tương phản (Accessibility) |
|---|---|---|---|
| `--qr-brand-accent` | `#35977D` | Màu xanh ngọc chủ đạo: Viền chọn, icon nhấn, badge sẵn sàng, thanh tiến trình | Dùng cho chi tiết đồ họa, icon, viền. Không dùng chữ trắng nhỏ trên nền này (contrast 3.2:1). |
| `--qr-brand-strong` | `#1D725E` | Màu xanh ngọc đậm: **Nút CTA chính có chữ trắng**, text link tương phản cao | Đạt tỉ lệ tương phản **5.2:1** với chữ trắng (Đạt chuẩn WCAG AA). |
| `--qr-brand-soft` | `#E8F4F0` | Nền xanh ngọc nhạt: Nền highlight thẻ được chọn, badge Sẵn sàng | Đạt tỉ lệ tương phản cao với chữ màu `#1D725E` (tỉ lệ > 7:1). |
| `--qr-bg` | `#F5F6F5` | Nền ngoài cùng của ứng dụng (nền vỏ ngoài bao quanh panel POS) | Sắc độ xám ngả lục rất nhẹ, dịu mắt, làm nổi bật panel trắng. |
| `--qr-surface` | `#FFFFFF` | Nền bề mặt chính: Panel làm việc, thẻ món, popup, bottom sheet | Trắng tinh khiết tạo cảm giác sạch sẽ, cao cấp. |
| `--qr-surface-muted` | `#F7F8F7` | Nền bề mặt phụ: Thanh viên thuốc nav, ô nhập liệu search, thẻ thứ cấp | Tạo phân cấp thị giác nhẹ nhàng với surface chính. |
| `--qr-border` | `#E9ECEA` | Viền ngăn cách: Đường phân chia 1px giữa các cột, viền card, separator | Tinh tế, không gây gắt mắt. |
| `--qr-text` | `#1D2522` | Màu văn bản chính: Tiêu đề, tên món, giá tiền, số ticket | Đạt tương phản tối đa trên nền trắng (> 12:1). |
| `--qr-text-muted` | `#727B77` | Màu văn bản phụ: Mô tả món, nhãn thứ cấp, thời gian chờ | Đạt tương phản chuẩn WCAG AA (> 4.5:1) trên nền trắng. |
| `--qr-warning` | `#A76200` | Cảnh báo / Chờ thanh toán: Badge pending_payment, cảnh báo không chuyển khoản 2 lần | Luôn đi kèm nền hổ phách nhạt `#FEF6EE` và icon AlertCircle. |
| `--qr-info` | `#2563A6` | Thông tin / Đang làm: Badge trạng thái `preparing` | Đi kèm nền xanh dương nhạt `#EBF3FB` và icon Clock/ChefHat. |
| `--qr-danger` | `#B42318` | Lỗi / Đã hủy: Báo lỗi hết món, phiên hết hạn, nút hủy ngoại lệ | Đi kèm nền đỏ nhạt `#FEF3F2` và icon XCircle. |

### 3.2 Mapping vào CSS Theme Variables của shadcn/ui

```css
/* src/styles/theme.css hoặc src/app/globals.css */
:root {
  /* Vỏ nền và chữ tổng thể */
  --background: 100 5% 96%;           /* #F5F6F5 */
  --foreground: 153 12% 13%;          /* #1D2522 */

  /* Panel, Card và Popover */
  --card: 0 0% 100%;                  /* #FFFFFF */
  --card-foreground: 153 12% 13%;     /* #1D2522 */
  --popover: 0 0% 100%;               /* #FFFFFF */
  --popover-foreground: 153 12% 13%;  /* #1D2522 */

  /* Primary Action (CTA Chính - Sử dụng Brand Strong #1D725E để đạt WCAG AA) */
  --primary: 166 60% 28%;             /* #1D725E */
  --primary-foreground: 0 0% 100%;    /* #FFFFFF */

  /* Brand Accent (#35977D) cho viền, icon, đồ họa */
  --brand-accent: 164 48% 41%;        /* #35977D */
  --brand-soft: 160 33% 93%;          /* #E8F4F0 */

  /* Secondary & Muted Surfaces */
  --secondary: 120 5% 97%;            /* #F7F8F7 */
  --secondary-foreground: 153 12% 13%;/* #1D2522 */
  --muted: 120 5% 97%;                /* #F7F8F7 */
  --muted-foreground: 157 4% 46%;     /* #727B77 */

  /* Accent Highlight */
  --accent: 160 33% 93%;              /* #E8F4F0 */
  --accent-foreground: 166 60% 28%;   /* #1D725E */

  /* Trạng thái nguy hiểm / Lỗi */
  --destructive: 4 86% 41%;           /* #B42318 */
  --destructive-foreground: 0 0% 100%;/* #FFFFFF */

  /* Đường viền & Input Focus */
  --border: 135 7% 92%;               /* #E9ECEA */
  --input: 135 7% 92%;                /* #E9ECEA */
  --ring: 164 48% 41%;                /* #35977D */

  /* Bo góc chuẩn hệ thống */
  --radius-shell: 1.75rem;            /* 28px: Panel chính Owner */
  --radius-card: 1rem;                /* 16px: Card món, Card đơn */
  --radius-button: 0.75rem;           /* 12px: Nút bấm, Ô input */
  --radius-pill: 9999px;              /* 9999px: Nav pill, Status badge */

  /* Semantic Status Tokens (Dùng trực tiếp qua utility classes) */
  --status-waiting-bg: #F1F3F2;
  --status-waiting-fg: #55605C;
  --status-waiting-border: #DDE2E0;

  --status-preparing-bg: #EBF3FB;
  --status-preparing-fg: #1D528A;
  --status-preparing-border: #CFE2F5;

  --status-ready-bg: #E8F4F0;
  --status-ready-fg: #165B4B;
  --status-ready-border: #C6E7DC;

  --status-pending-bg: #FEF6EE;
  --status-pending-fg: #8A4D00;
  --status-pending-border: #F9DBAF;

  --status-error-bg: #FEF3F2;
  --status-error-fg: #912018;
  --status-error-border: #FECDCA;
}
```

> **QUY TẮC CỐT LÕI:** Tuyệt đối không hardcode mã màu HEX trong từng component JSX/TSX. Tất cả thành phần giao diện phải sử dụng biến CSS theme qua các utility class của Tailwind (ví dụ: `bg-primary`, `text-primary-foreground`, `bg-muted`, `border-border`, `text-muted-foreground`).

---

## 4. Typography, Spacing, Radius & Hiệu ứng

### 4.1 Typography: Be Vietnam Pro
Dự án chọn **Be Vietnam Pro** (Google Fonts) làm font chữ tiêu chuẩn vì:
- Hiển thị trọn vẹn bộ dấu tiếng Việt mà không bị lỗi nhảy dòng, lệch chân chữ hay gãy dấu thanh.
- Kiểu dáng hình học hiện đại, nét tròn trịa tương đồng hoàn hảo với phong cách bo góc mềm mại của ảnh mẫu.
- Phông dự phòng: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.

| Cấp bậc (Hierarchy) | Kích thước / Line-height | Font Weight | Ứng dụng cụ thể |
|---|---|---|---|
| **Display / H1** | `24px / 32px` (`text-2xl font-bold`) | Bold (700) | Số Ticket lớn (`#028`), Tiêu đề chính màn hình |
| **Section Title / H2** | `18px / 26px` (`text-lg font-semibold`) | SemiBold (600) | Tên danh mục món, Tiêu đề tab Owner, Tiêu đề Sheet |
| **Card Title / H3** | `16px / 24px` (`text-base font-semibold`)| SemiBold (600) | Tên món ăn, Tên khách / Số bàn, Giá tiền sản phẩm |
| **Body Primary** | `14px / 20px` (`text-sm font-normal`) | Regular (400) | Tùy chọn món, Ghi chú đơn hàng, Nội dung form |
| **Body Secondary** | `13px / 18px` (`text-xs font-normal`) | Regular (400) | Mô tả chi tiết món ăn, Thời gian tạo đơn, Helper text |
| **Badge / Caption** | `12px / 16px` (`text-[12px] font-medium`)| Medium (500) | Nhãn trạng thái (Badge), Chip danh mục, Số lượng giỏ |

### 4.2 Hệ thống Spacing & Tap Target (Thang 4px)
- **Base Unit:** `4px`.
- **Thang kích thước:** `4px` (`p-1`), `8px` (`p-2`), `12px` (`p-3`), `16px` (`p-4`), `20px` (`p-5`), `24px` (`p-6`), `32px` (`p-8`).
- **Mục tiêu chạm (Touch Target Rules):**
  - Mọi nút bấm tương tác chính trên thiết bị di động (Mobile) và máy tính bảng (Tablet) phải có chiều cao tối thiểu **44px – 48px** (`h-11` đến `h-12`).
  - Nút bấm tăng giảm số lượng (+ / -): Kích thước vùng bấm tối thiểu **36x36px** (kèm padding mở rộng hit area lên 44x44px).
  - Khoảng cách giữa hai nút tương tác cạnh nhau tối thiểu **8px** để ngăn chặn việc bấm nhầm lúc đông khách.

### 4.3 Bo góc (Border Radius)
- **Shell ngoài cùng (Owner Dashboard Panel):** `rounded-[28px]` (khớp chính xác với góc bo lớn trong ảnh mẫu).
- **Thẻ nội dung (Cards, Modals, Drawers):** `rounded-2xl` (`16px`).
- **Nút bấm & Ô nhập liệu (Buttons, Inputs, Selects):** `rounded-xl` (`12px`).
- **Viên thuốc & Nhãn (Pill Navigation, Category Chips, Status Badges):** `rounded-full` (`9999px`).

### 4.4 Bóng đổ (Elevation & Shadows)
Giữ độ nông tối đa, chỉ tạo chiều sâu tinh tế để phân lớp giao diện:
- `shadow-sm`: `0 1px 2px 0 rgba(29, 37, 34, 0.04)` (Viền card món ăn).
- `shadow-card`: `0 2px 8px -2px rgba(29, 37, 34, 0.06), 0 1px 4px -1px rgba(29, 37, 34, 0.04)` (Thẻ đơn hàng active).
- `shadow-shell`: `0 8px 30px -4px rgba(29, 37, 34, 0.08)` (Panel lớn Owner trên nền xám).
- `shadow-sticky`: `0 -4px 16px 0 rgba(29, 37, 34, 0.06)` (Sticky bottom cart bar của Customer).

### 4.5 Biểu tượng (Iconography)
- Thư viện: **Lucide React**.
- Stroke width chuẩn: `1.75px` (nét thanh mảnh, hiện đại, tương thích hoàn hảo với font Be Vietnam Pro).
- Kích thước icon:
  - Mini / Badge: `14px`
  - Inline / Button text: `16px`
  - Navigation / Header: `18px` hoặc `20px`
  - Empty state / Illustration: `32px` đến `40px`

### 4.6 Breakpoints đáp ứng (Responsive Grid)
- **Mobile (`375px` - `639px`):** Điểm vào chính của Customer. Layout 1 cột dọc, bottom sticky bar, sheet drawer.
- **Tablet (`640px` - `1023px`):** Thiết bị POS cầm tay của quán. Layout 1 cột thích ứng, panel chi tiết chuyển thành Sheet trượt mở nhanh.
- **Desktop (`1024px` - `1439px`):** Điểm vào chính của Owner. Layout cố định 2 cột 70/30 theo đúng ảnh tham chiếu.
- **Wide Desktop (`>= 1440px`):** Giới hạn `max-w-[1440px]` căn giữa màn hình, viền lề ngoài xám rộng rãi, thoáng mắt.

---

## 5. Bảng Mapping Thành phần shadcn/ui Chọn lọc

Để giữ tính tối giản và hiệu năng cao, dự án chỉ cài đặt đúng các component shadcn/ui phục vụ trực tiếp cho trải nghiệm người dùng:

| Thành phần shadcn/ui | Mục đích sử dụng cụ thể | Giao diện áp dụng |
|---|---|---|
| **Button** | Nút bấm CTA chính (`Nhận đơn tiếp theo`, `Xác nhận gọi món`, `Thanh toán`), nút tăng/giảm số lượng | Cả 2 giao diện |
| **Card** | Thẻ món ăn (ảnh + tên + giá), thẻ đơn hàng trong hàng đợi, thẻ bàn trong lưới phòng | Cả 2 giao diện |
| **Badge** | Hiển thị nhãn trạng thái (`Chờ làm`, `Đang làm`, `Sẵn sàng`, `Chờ thanh toán`, `Hết hàng`) | Cả 2 giao diện |
| **Sheet** | Cart Sheet của khách, Panel chi tiết đơn hàng trên Mobile/Tablet, Sheet chỉnh sửa món ăn | Cả 2 giao diện |
| **Dialog** | Hộp thoại xác nhận hành động quan trọng (Xác nhận hủy đơn ngoại lệ, Xác nhận đóng phiên bàn) | Owner Dashboard |
| **Tabs** | Thanh điều hướng 4 tab dạng viên thuốc của Owner (`Đơn hàng`, `Bàn`, `Menu`, `Cài đặt`) | Owner Dashboard |
| **Input** | Ô tìm kiếm món ăn, ô nhập mã phiên bàn, ô nhập tên/giá món trong menu editor | Cả 2 giao diện |
| **Textarea** | Ô nhập ghi chú món ăn của khách, ghi chú phiên bàn | Cả 2 giao diện |
| **Switch** | Nút bật/tắt nhanh trạng thái Còn hàng / Hết hàng của món, bật/tắt nhận đơn | Owner Dashboard |
| **Skeleton** | Khung xương tải trang khi đang load danh sách menu, chi tiết đơn hàng hoặc trạng thái bàn | Cả 2 giao diện |
| **ScrollArea** | Cuộn danh sách hàng đợi đơn hàng, cuộn danh mục món ăn không hiện thanh cuộn thô | Cả 2 giao diện |
| **Separator** | Đường phân cách mảnh 1px giữa các khu vực nội dung | Cả 2 giao diện |
| **Sonner (Toast)** | Thông báo phản hồi nhanh: "Đã thêm vào giỏ", "Đã nhận đơn", "Đã cập nhật trạng thái món" | Cả 2 giao diện |

---

## 6. Cam kết Thực thi của Senior UI Engineer

1. Mọi bản thiết kế Wireframe tại `docs/design/WIREFRAMES.md` đều bám sát 100% các nguyên tắc thị giác từ `assets/ui-reference.png`.
2. Không sinh thêm bất kỳ giao diện, vai trò hoặc màn hình phụ nào ngoài 2 khu vực: Customer Mobile-First và Owner Dashboard 4-Tab.
3. Giữ vững tính trung thực của dữ liệu: Mọi trạng thái thanh toán và ticket đều do Backend xác nhận; giao diện chỉ phản ánh đúng sự thật thông qua contracts của Codex.
