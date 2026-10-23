# UI — Design Specification & UX Flow

**Mục đích:** tài liệu giao cho **Gemini** thiết kế giao diện; phải bám ảnh `assets/ui-reference.png` do chủ dự án cung cấp.  
**Giới hạn:** 2 giao diện lớn (Customer/Owner), Owner **chỉ 4 tab**, không thêm màn hình bếp riêng.

## 1. Giải mã phong cách từ ảnh tham chiếu

Trong ảnh: một panel trắng lớn bo tròn nằm trên nền xám nhạt; header nằm trong thanh trắng với logo trái, tab menu **pill bo tròn căn giữa**, người dùng bên phải; nội dung chia **khối chính lớn bên trái** và **sidebar thông tin hẹp bên phải**; layout bảng kiểu sơ đồ minh họa bằng khối xanh, các thẻ thứ cấp xám rất nhạt, nhiều khoảng trắng, biểu tượng tuyến tính mảnh. Tông nổi bật là **xanh ngọc thiên lục (emerald/teal)**.

Áp dụng tinh thần, **không sao chép nguyên xi nội dung** của mockup:
- Owner **tab Đơn hàng**: khu vực trái (~68–72%) là hàng đợi dạng danh sách/thẻ; khu vực phải (~28–32%) là chi tiết đơn đang chọn.
- Owner **tab Bàn**: dùng grid bàn đơn giản (không floorplan kéo thả), bên phải là chi tiết phiên bàn.
- Owner **tab Menu**: danh sách món trái, editor dạng panel phải.
- Owner **tab Cài đặt**: nội dung cấu hình theo section; không cần sidebar phức tạp.
- Customer: chuyển cùng ngôn ngữ thẩm mỹ sang mobile — ảnh món trong card trắng, CTA xanh ngọc, bottom cart bar; không ép mô hình desktop hai cột lên điện thoại.

## 2. Design tokens (gợi ý triển khai trực tiếp)

### 2.1. Màu sắc

Các màu dưới đây suy từ ảnh gần đúng (màu xanh nổi bật được lấy mẫu khoảng `#35977D`); điều chỉnh token để đạt tương phản tốt:

| Token | HEX | Ứng dụng |
|---|---|---|
| `--brand-accent` | `#35977D` | Viền chọn, minh họa, đồ họa phi văn bản, trạng thái thông tin tích cực |
| `--brand-strong` | `#1D725E` | Nút chính có chữ trắng, text link tương phản tốt |
| `--brand-soft` | `#E8F4F0` | Nền highlight, card selected |
| `--background` | `#F5F6F5` | Nền website ở ngoài panel |
| `--surface` | `#FFFFFF` | Panel chính, card, dialog |
| `--surface-muted` | `#F7F8F7` | Pill nav, nền input, card phụ |
| `--border` | `#E9ECEA` | Divider, border mảnh |
| `--text-primary` | `#1D2522` | Tiêu đề, giá, text chính |
| `--text-secondary` | `#727B77` | Mô tả, label phụ |
| `--danger` | `#B42318` | Lỗi, hủy |
| `--warning` | `#A76200` | Quá hạn/chờ tiền |
| `--info` | `#2563A6` | Đang làm |

Không sử dụng màu brand cho mọi trạng thái; **sẵn sàng** xanh, **chờ** trung tính, **đang làm** xanh dương, **cảnh báo** hổ phách, **lỗi** đỏ; luôn đi kèm chữ và icon.

```css
/* Tokens tham khảo: tinh chỉnh mapping theo shadcn/ui CSS variables khi triển khai */
:root {
  --qr-brand-accent: #35977d;
  --qr-brand-strong: #1d725e;
  --qr-brand-soft: #e8f4f0;
  --qr-bg: #f5f6f5;
  --qr-surface: #ffffff;
  --qr-surface-muted: #f7f8f7;
  --qr-border: #e9ecea;
  --qr-text: #1d2522;
  --qr-text-muted: #727b77;
}
```

**Accessibility:** trắng trên `#35977D` đạt tương phản chữ nhỏ chưa đủ cao; dùng **`#1D725E` cho CTA chữ trắng**, hoặc text đen đậm trên nền xanh nhạt. Không lấy màu từ ảnh bằng cách copy từng pixel làm token ở mọi nơi.

### 2.2. Kiểu chữ, khoảng cách, bo góc

- Font: **Inter** hoặc **Be Vietnam Pro** (được phép lựa chọn một, đảm bảo dấu tiếng Việt tốt); fallback `system-ui`.
- Desktop heading 22–28px, card title 16–18px, body 14–16px, label 12–14px; owner dashboard cần mật độ vừa phải.
- Hệ khoảng cách dựa trên bội số **4px** (4/8/12/16/20/24/32).
- Shell panel radius: **24–28px**; card radius **14–18px**; input/button **10–14px**; nav pill **999px**.
- Border 1px rất nhạt; shadow chỉ dùng mức thấp, không dùng glassmorphism, gradient lòe loẹt, 3D, motion dài.
- Icon Lucide 16/18/20px, stroke trung bình; menu owner tối đa 4 mục.
- Button tương tác chính cao tối thiểu 44–48px trên mobile.

## 3. Sitemap thật — tối giản màn hình

```text
PUBLIC
/q/[code]          → Customer page (QR table hoặc takeaway resolve tự động)
/order/[publicId]   → Theo dõi đơn; server yêu cầu access token hợp lệ

OWNER
/login             → Đăng nhập chủ quán
/dashboard         → Dashboard chủ quán (4 tabs trong 1 page)
  ?tab=orders      → Default
  ?tab=tables
  ?tab=menu
  ?tab=settings

HỖ TRỢ TRONG CÙNG PAGE
Cart       → shadcn Sheet/Drawer
Checkout   → Sheet/Dialog/step view (mobile full-screen sheet)
Payment    → Step view hiện VietQR + trạng thái (không cần trang shell khác)
Order detail → Owner side panel / mobile Sheet
```

**Quy tắc:** Không tạo thêm `/kitchen`, `/bar`, `/employees`, `/inventory`, `/finance` trong MVP.

## 4. Customer UI — ưu tiên số 1

### 4.1. Mobile layout (375–430px trước, sau mở rộng)

```text
┌──────────────────────────────────┐
│  [Logo/Tên quán]      [Giỏ · 2] │
│  [Bàn 05] hoặc [Mang đi]         │
│  Chào mừng / hướng dẫn ngắn      │
│                                  │
│  [Tìm món.....................]  │
│  [Tất cả] [Cà phê] [Trà] ...    │
│                                  │
│  [Ảnh]  Tên món                  │
│         29.000đ       [+]       │
│  [Ảnh]  Tên món                  │
│         39.000đ       [+]       │
│  ...                             │
│                                  │
│ [Giỏ 2 món · 68.000đ   Xem giỏ] │ ← Sticky bottom
└──────────────────────────────────┘
```

**Giao diện chính:**
1. **Header:** tên quán, nhãn `Bàn 05` / `Mang đi`, giỏ có số món. QR bàn chưa xác thực → hiển thị form mã phiên trước khi đặt.
2. **Menu:** ô tìm, chip danh mục cuộn ngang, thẻ sản phẩm ảnh + tên + giá + tình trạng hết hàng.
3. **Cart Sheet:** danh sách món, tăng giảm số lượng, ghi chú/tùy chọn, tổng tiền, CTA; nếu giá/món thay đổi hiển thị yêu cầu kiểm tra lại.
4. **Checkout Step:**
   - Dine-in: tóm tắt bàn/món/tổng, CTA `Xác nhận gọi món`.
   - Takeaway: CTA `Tiếp tục thanh toán`, hiện VietQR, số tiền, thời hạn, mã giao dịch tóm tắt; trạng thái `Đang xác nhận...` và hướng dẫn **không chuyển khoản lần hai** khi chưa có kết quả.
5. **Order Tracking:** ticket lớn, nhãn đơn `Tại bàn`/`Mang đi`, các bước `Đã nhận → Đang làm → Sẵn sàng → Đã giao`; dùng polling fallback/re-sync. Chỉ hiển thị mã nhận takeaway trên kênh có token hợp lệ, không trên màn hình gọi số công khai.

**Các UI states phải thiết kế:** menu loading, menu trống, món hết, giỏ trống, đang submit, submit timeout/retry an toàn, phiên bàn hết hạn, thanh toán pending/succeeded/failed/expired/exception, không mạng, reconnect, đơn bị hủy, đơn đã giao.

### 4.2. Desktop customer

- Container menu tối đa ~980–1120px, grid 2–3 cột thẻ món khi đủ rộng.
- Chi tiết/cart có thể là sheet bên phải; không tái sử dụng shell dashboard owner cho trang khách.
- Trên màn hình lớn vẫn tối ưu thao tác, không thêm sidebar menu dài.

### 4.3. UX microcopy quan trọng

| Ngữ cảnh | Ví dụ nhãn |
|---|---|
| Guest table | `Bạn đang gọi món tại Bàn 05` |
| Takeaway | `Mua mang đi · Nhận tại quầy` |
| Submit dine-in | `Xác nhận gọi món` |
| Takeaway unpaid | `Thanh toán để quán bắt đầu làm món` |
| Verify processing | `Đang xác nhận thanh toán — vui lòng không trả tiền lần nữa` |
| FIFO accepted | `Số thứ tự #028` |
| Queue | `Đơn đã được nhận · Đang chờ chế biến` |
| Ready takeaway | `Món đã sẵn sàng · Đến quầy và xuất trình mã nhận` |
| Session invalid | `Phiên bàn không còn hiệu lực. Vui lòng liên hệ quán.` |
| Rate limited | `Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.` |

## 5. Owner dashboard — ưu tiên số 2

### 5.1. Desktop shell: lấy trực tiếp tinh thần bố cục từ ảnh

```text
┌─────────────────────────────────────────────────────────────────────┐
│ BRAND          [Đơn hàng] [Bàn] [Menu] [Cài đặt]           [Owner] │
├─────────────────────────────────────────────────────────────────────┤
│  KHU NỘI DUNG CHÍNH  ~70%                │ CHI TIẾT  ~30%           │
│                                         │                          │
│  [Chờ: 5] [Đang làm: 2] [Sẵn sàng: 1] │  Đơn #028                │
│  ┌─────────────────────────────────┐   │  Loại: Mang đi           │
│  │ #028  Mang đi   Trà sữa x2       │   │  Sản phẩm, ghi chú      │
│  │ [Chờ làm] [Nhận đơn tiếp theo]  │   │  Thanh toán: Đã trả     │
│  └─────────────────────────────────┘   │  [Bắt đầu] [Sẵn sàng]   │
│  ...                                    │                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Shell:** background sáng, panel trắng bo lớn có padding 12–20px, top navbar pill ở giữa (như ảnh), thông tin chủ quán góc phải, đường chia nhẹ. Max width ~1440px. Không bê nguyên sơ đồ bàn nhiều tầng nếu quán chưa có nhu cầu.

### 5.2. Bốn tab owner

**TAB 1 — Đơn hàng (default)**
- Thẻ tổng quan nhỏ: `Chờ`, `Đang làm`, `Sẵn sàng`; không cần 10 KPI.
- Bộ lọc `Tất cả | Tại bàn | Mang đi`, status filter đơn giản.
- Danh sách đơn tăng dần theo ticket trong nhóm còn xử lý. Ticket + thời gian chờ + bàn/mang đi + các món + trạng thái.
- **CTA chính `Nhận đơn tiếp theo`** gọi API atomic FIFO; không để nhấn `Bắt đầu` tùy ý với đơn sau còn chờ.
- Panel chi tiết chọn đơn: ghi chú, số lượng, trạng thái thanh toán (chỉ hiển thị), nút `Sẵn sàng` / `Đã giao`, lịch sử ngắn.
- Đơn waiting đã thanh toán Takeaway có badge `Đã thanh toán`; `pending_payment` chỉ xem được ở danh sách thanh toán ngoại lệ, **không xuất hiện như ticket đang chờ chế biến**.

**TAB 2 — Bàn**
- Lưới card `Bàn 01...` (3–5 cột tùy breakpoint), mỗi card: trạng thái, số đơn, tiền tạm tính.
- Mở phiên, tạo/hiển thị mã phiên, xem danh sách đơn và tổng tiền; checkout → xác nhận đã thu tiền → đóng phiên.
- Giữ lưới đơn giản; **không làm drag/drop sơ đồ tầng** dù ảnh tham chiếu có sơ đồ.

**TAB 3 — Menu**
- Danh sách theo danh mục, search, nút `Thêm món`.
- Sửa tên/giá/ảnh/mô tả/danh mục; chọn còn/hết; tùy chọn đơn giản.
- Sheet/side panel để edit; ảnh upload có preview, validation.

**TAB 4 — Cài đặt**
- Tên/logo quán; QR tại quầy; QR từng bàn; cấu hình giờ hoạt động/ngừng nhận đơn; trạng thái tích hợp cổng thanh toán (không hiển thị secret), đăng xuất.
- Nếu có ngoại lệ tiền về muộn: card **Cần đối soát** trong tab này hoặc một filter đơn hàng, **không tạo tab mới**.

### 5.3. Responsive owner

| Breakpoint | Hành vi |
|---|---|
| `<640px` | Header rút gọn; bottom nav hoặc tab ngang 4 mục; danh sách đơn full-width; chi tiết mở `Sheet` full-screen |
| `640–1023px` | Tabs ở trên; 1 cột chính, detail sheet hoặc panel thu gọn; nút thao tác lớn |
| `>=1024px` | Shell ngang; left 70% / right 30% (có min width cho detail) |
| `>=1440px` | Giới hạn chiều rộng shell, thêm whitespace hai bên; không kéo giãn text quá mức |

**Tablet thực tế vận hành:** yêu cầu nút `Nhận đơn tiếp theo`, `Sẵn sàng`, `Đã giao` tối thiểu 44px, có confirmation cho hành động khó phục hồi, tránh nút nhỏ sát nhau.

## 6. shadcn/ui component mapping

| Use case | Component |
|---|---|
| Shell owner/tab navigation | `Tabs`, `Button`, `Avatar`, `Separator` hoặc nav pill tùy biến |
| Cards/list đơn | `Card`, `Badge`, `ScrollArea`, `Skeleton` |
| Cart / chi tiết owner | `Sheet`, `Dialog`, `ScrollArea` |
| Danh mục/filter | `Tabs` hoặc `ToggleGroup` (nếu hỗ trợ), `Input` |
| Chỉnh sửa món/bàn | `Form`, `Input`, `Textarea`, `Select`, `Switch` |
| Feedback | `Sonner` toast hoặc hệ thông báo hiện hành, `Alert`, `AlertDialog` |
| Số lượng/price | `Button`, `Input` và validation |

Chỉ cài component nào dùng thật. Dùng theme tokens thay vì ghi giá trị HEX trong mỗi component.

## 7. Accessibility & UX rules

- Chữ tiếng Việt rõ, không text siêu nhỏ trên mobile; nút chính có nhãn trực quan.
- Không dùng chỉ màu để thể hiện `Chờ`, `Đang làm`, `Sẵn sàng`, `Đã giao`.
- Tương phản văn bản đạt WCAG AA khi khả thi; đảm bảo focus visible, bàn phím, screen reader label cho icon-only buttons.
- Trạng thái tiền **không đoán bằng frontend**; luôn hiển thị dữ liệu backend.
- Tách `pending payment` khỏi `đang chờ chế biến` để khách không hiểu lầm.
- Không ép người mua điền tên/số điện thoại cho MVP; code nhận món là đủ cho lấy hàng.
- Tránh animation realtime gây giật danh sách; cập nhật vị trí/thẻ hợp lý, ưu tiên dùng stable keys.
- Ảnh nén, lazy load, skeleton; không dùng ảnh stock lớn làm nền che nội dung.

## 8. Phân định file cho Gemini

**Gemini được phép thay đổi:**
- `src/components/ui/**` (theo shadcn), `src/components/customer/**`, `src/components/owner/**`.
- `src/app/(customer)/**` và UI của `src/app/(owner)/**` (chỉ page/layout/presentation).
- `src/styles/**`, `src/app/globals.css` **khi được giao sở hữu file**, ảnh minh họa trong `public/**`.
- `src/lib/mocks/**` (data mock UI đúng types).

**Gemini không được chỉnh:**
- `supabase/migrations/**`, `src/server/**`, `src/app/api/**`, `src/lib/payments/**`, policy/RLS, queue algorithm.
- `src/types/contracts/**` do Codex chốt; đề xuất thay đổi qua báo cáo contract, không sửa âm thầm.

**Bàn giao của Gemini:** owner/dashboard 4-tab responsive, customer menu/cart/payment/tracking responsive, UI states đầy đủ, không có API giả trả về thành công trong production; build/typecheck pass với mock adapter.

## 9. Chỉ thị ngắn gửi Gemini

> Hãy dùng `assets/ui-reference.png` làm **nguồn tham chiếu hình thức** (white rounded shell, subtle gray surfaces, emerald #35977D accent, center pill navigation, 70/30 content split, airy minimalist design). Tạo **Customer mobile-first** và **Owner single-dashboard 4 tabs**, không tạo vai trò/màn hình khác. Tất cả hành vi thanh toán, FIFO, RLS, API để Codex triển khai. Dùng shadcn/ui, Tailwind, TypeScript, mock fixtures khớp contract. Thiết kế đủ loading/empty/error/payment pending, đảm bảo responsive, accessibility, CTA rõ ràng và thao tác nhanh.
