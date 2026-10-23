# SCREEN SPECIFICATION V1 — QR Ordering Minimal MVP

> **Phiên bản:** 1.0 (Phase 0 — Handoff Phase 1) · **Ngày:** 23/10/2026  
> **Tác giả:** Senior Product Designer / UI Engineer (Gemini)  
> **Nguồn tham chiếu:** `assets/ui-reference.png`, `UI.md`, `PRD.md`, `ARCHITECTURE.md`, `docs/contracts/types.ts`  
> **Phạm vi:** Đặc tả chi tiết từng màn hình cho giai đoạn code UI Phase 1. Tuyệt đối không code React trong tài liệu này.

---

## 1. Khu vực Khách hàng (Customer — Mobile First)

---

### 1.1 Màn hình Xác thực QR & Phiên bàn (`SCR-C01-VERIFY`)
- **Route:** `/q/[code]` (khi `requiresSessionCode: true`)
- **Mục tiêu người dùng (User Goal):** Khách quét QR tĩnh tại bàn (`QRType = 'table'`), cần nhập mã phiên bàn do quán cung cấp để bắt đầu đặt món.
- **Entry / Exit:**
  - *Entry:* Quét mã QR dán tại bàn bằng camera điện thoại. Server trả về `ApiSuccess<QRResolution>` với `requiresSessionCode: true`.
  - *Exit:* Xác thực thành công → Lưu `guestAccess` cookie/token → Chuyển sang Menu với ngữ cảnh `Bàn XX`.
- **Primary CTA:** `[ Bắt đầu gọi món ]` (Disabled khi chưa đủ 4 ký tự mã phiên).
- **Secondary Actions:** `[ Quét lại QR ]`, `[ Gọi nhân viên hỗ trợ ]`.

#### Bố cục hiển thị (Layout Anatomy — Mobile 375px, Top → Bottom)
1. **Header thương hiệu:** Logo quán + Tên quán (`StoreView.name`).
2. **Icon & Huy hiệu ngữ cảnh:** Icon bàn ăn Lucide bo tròn, Tiêu đề `Xác thực Bàn 05`.
3. **Mô tả ngắn gọn:** "Vui lòng nhập mã phiên 4 số do nhân viên quầy cung cấp để mở thực đơn."
4. **Cụm nhập mã phiên (PIN Input):** 4 ô nhập số lớn (kích thước mỗi ô 56x56px, bo góc 12px, font 24px Bold, auto-focus vào ô đầu tiên).
5. **Thông báo lỗi (nếu có):** Alert inline màu đỏ `#FEF3F2`, chữ `#912018` khi mã sai hoặc phiên đã đóng.
6. **Nút CTA chính:** Nút `[ Bắt đầu gọi món ]` (cao 48px, bo góc 12px, màu `#1D725E`, chữ trắng).
7. **Trợ giúp dưới chân:** Link "Bạn chưa có mã phiên? Hãy báo nhân viên tại quầy".

#### Thành phần shadcn/ui
`Card`, `Input` (hoặc `InputOTP`), `Button`, `Alert`, `Skeleton`.

#### Dữ liệu Render tối thiểu (Khớp `docs/contracts/types.ts`)
```typescript
// Nguồn: QRResolution (loại 'table', requiresSessionCode = true)
store: StoreView; // { id, name, timezone, acceptingOrders }
table: TableRef;  // { id, label }
```

#### Trạng thái giao diện (UX States)
- **Default:** Ô nhập trống, con trỏ nhấp nháy tại ô số 1, CTA bị `disabled` (mờ 50%).
- **Loading:** Spinner tròn nhỏ bên trong CTA khi bấm gửi mã xác thực.
- **Error (Mã sai):** Lắc nhẹ 4 ô nhập (shake animation), viền đỏ `#B42318`, chữ báo lỗi "Mã phiên không chính xác. Vui lòng kiểm tra lại."
- **Error (Phiên hết hạn/đóng):** Alert cảnh báo "Bàn này chưa được mở phiên hoặc phiên đã kết thúc. Vui lòng liên hệ nhân viên."
- **Error (Quán tạm ngưng nhận đơn):** Banner "Quán hiện đang tạm ngưng nhận đơn mới (`acceptingOrders: false`)". CTA bị khóa hoàn toàn.
- **Offline:** Banner vàng/xám cố định đỉnh màn hình: "Mất kết nối mạng. Đang thử lại..."

#### Trợ năng (Accessibility)
- Input có nhãn `aria-label="Mã phiên bàn số 1 đến 4"`.
- Bàn phím số tự động kích hoạt trên mobile (`inputMode="numeric"`, `pattern="[0-9]*"`).
- Nút bấm và ô nhập đạt kích thước chạm tối thiểu 48x48px.
- Độ tương phản chữ lỗi trên nền trắng đạt 5.4:1 (chuẩn WCAG AA).

#### Đáp ứng màn hình (Responsive Spec)
- **375px – 430px:** Toàn màn hình (full-screen sheet), căn giữa theo chiều dọc.
- **768px (Tablet) & 1280px (Desktop):** Hộp thoại Dialog nhỏ gọn đặt ở giữa màn hình, chiều rộng cố định `max-w-md` (400px), bóng đổ `shadow-card`.

#### Bảng Tác vụ — Dữ liệu — Lỗi — Phản hồi UX
| Thao tác người dùng | Dữ liệu gửi đi | Lỗi tiềm ẩn | Phản hồi UX |
|---|---|---|---|
| Nhập đủ 4 số mã phiên | `{ qrCode, sessionCode }` | Mã sai (`SESSION_REQUIRED`) | Rung ô nhập, bôi đỏ, focus lại ô đầu tiên |
| Bấm xác thực khi phiên đã đóng | `{ qrCode, sessionCode }` | `SESSION_EXPIRED` | Hiển thị Dialog thông báo phiên đã đóng kèm nút gọi hỗ trợ |
| Nhập mã khi quán ngưng bán | `{ qrCode, sessionCode }` | `STORE_NOT_ACCEPTING_ORDERS` | Khóa nút, thông báo quán tạm ngưng phục vụ |

---

### 1.2 Màn hình Thực đơn & Duyệt món (`SCR-C02-MENU`)
- **Route:** `/q/[code]` (sau khi resolve thành công)
- **Mục tiêu người dùng:** Duyệt danh mục, tìm kiếm món, xem giá/ảnh, thêm món vào giỏ hàng với số lượng mong muốn.
- **Entry / Exit:**
  - *Entry:* Sau khi xác thực QR bàn thành công (Dine-in) HOẶC quét QR tại quầy (Takeaway).
  - *Exit:* Mở `CartDrawer` bằng thanh Sticky Cart ở đáy màn hình HOẶC bấm trực tiếp vào món để mở `ItemDetailDrawer`.
- **Primary CTA:** `[ 🛒 X món · XXX.000 đ — Xem giỏ ]` trên Sticky Cart Bar.
- **Secondary Actions:** Tìm kiếm món theo tên, lọc danh mục bằng chip viên thuốc, nút `[ + Thêm ]` nhanh trên từng card món.

#### Bố cục hiển thị (Layout Anatomy — Mobile 375px, Top → Bottom)
1. **Header ghim đỉnh (Sticky Top, cao 56px, nền `#FFFFFF`, viền đáy 1px `#E9ECEA`):**
   - Trái: Tên quán (`StoreView.name`) cắt gọn `truncate`.
   - Phải: Badge hiển thị vị trí: `Bàn 05` (màu xanh `#E8F4F0`, chữ `#1D725E`) hoặc `Mang đi` (màu xám `#F1F3F2`, chữ `#55605C`). Icon giỏ hàng nhỏ kèm số lượng.
2. **Khung tìm kiếm (Search Bar):** Input bo góc 12px, nền `#F7F8F7`, icon kính lúp Lucide bên trái, nút xóa nhanh "✕" khi có chữ.
3. **Dải Chip danh mục (Category Pills, cuộn ngang không lộ thanh scroll):**
   - Chip "Tất cả" (active: nền xanh `#35977D`, chữ trắng).
   - Các chip `MenuCategory.name` (inactive: nền xám nhạt `#F7F8F7`, chữ `#727B77`, viền 1px `#E9ECEA`).
4. **Danh sách nhóm món ăn theo danh mục (Menu Sections):**
   - Tiêu đề nhóm danh mục: Font 16px SemiBold, đếm số lượng món: `Cà phê (4 món)`.
   - Thẻ món ăn dạng danh sách ngang (Item Card):
     - Trái: Khung ảnh 1:1 (76x76px bo góc 10px). Nếu ảnh `null`, render khung placeholder xám nhạt kèm icon Lucide cà phê/đĩa ăn.
     - Giữa: Tên món (`MenuItem.name`, 15px SemiBold, `#1D2522`), Mô tả ngắn (`MenuItem.description`, tối đa 2 dòng, `#727B77`), Giá bán (`MenuItem.priceVnd`, font 15px Bold, format số `35.000 đ`).
     - Phải: Nút `[ + ]` hoặc `[ + Thêm ]` (nếu món có tùy chọn, bấm sẽ mở `ItemDetailDrawer`; nếu không có tùy chọn, bấm sẽ thêm thẳng 1 sản phẩm vào giỏ và hiện Toast Sonner).
     - Nếu `available = false`: Toàn bộ thẻ món mờ 50%, ảnh có overlay đen mờ kèm Badge chữ đỏ nhạt `Hết hàng`, nút chuyển thành `Hết món` (Disabled).
5. **Khoảng đệm an toàn đáy trang:** `pb-24` (96px) để nội dung cuối cùng không bị che khuất bởi Sticky Cart Bar.
6. **Thanh Giỏ hàng nổi cố định đáy (Sticky Bottom Cart Bar, cao 60px, cách đáy màn hình 8px, margin 2 bên 16px, bo góc 16px, nền `#1D725E`, shadow lớn):**
   - Trái: Icon giỏ hàng trắng, số lượng món, tổng tiền tạm tính (`67.000 đ`).
   - Phải: Chữ "Xem giỏ →" kèm icon mũi tên, vùng chạm 48px.

#### Thành phần shadcn/ui
`Card`, `Badge`, `Input`, `Button`, `ScrollArea`, `Skeleton`, `Separator`, `Sonner (Toast)`.

#### Dữ liệu Render tối thiểu (Khớp `docs/contracts/types.ts`)
```typescript
// Nguồn: MenuView & QRResolution
categories: MenuCategory[]; // { id, name, sortOrder }[]
items: MenuItem[];           // { id, categoryId, name, description, priceVnd, imageUrl, available, options }[]
context: QRResolution;      // Xác định mode 'dine_in' hay 'takeaway'
```

#### Trạng thái giao diện (UX States)
- **Loading:** Hiển thị 4 thẻ món dạng `Skeleton` (khung xám nhấp nháy mô phỏng vị trí ảnh, tiêu đề, giá tiền).
- **Empty (Menu trống):** Khung minh họa trống trải ở giữa màn hình: "Hiện quán chưa cập nhật món ăn trong danh mục này."
- **Empty Search (Không tìm thấy):** "Không tìm thấy món nào khớp với '[từ khóa]'. Hãy thử tìm từ khác." kèm nút xóa tìm kiếm.
- **Item Disabled (Hết món):** Nút thêm bị disabled, thẻ có viền xám nhạt, không mở được sheet chọn món.
- **Offline:** Thanh banner nổi màu cam nhạt `#FEF6EE`: "Đang ngoại tuyến. Dữ liệu menu đang hiển thị từ bộ nhớ tạm."

#### Trợ năng (Accessibility)
- Thẻ món có thuộc tính `role="article"`, nhãn đầy đủ cho trình đọc màn hình: `[Tên món], giá [X] đồng, [Còn hàng/Hết hàng]`.
- Nút `+ Thêm` có `aria-label="Thêm [Tên món] vào giỏ hàng"`.
- Đảm bảo tương phản chữ trên nền `#1D725E` của thanh giỏ hàng đạt 5.2:1.

#### Đáp ứng màn hình (Responsive Spec)
- **375px – 639px:** Danh sách 1 cột cuộn dọc, ảnh 76x76px.
- **640px – 1023px (Tablet):** Grid 2 cột thẻ món, Sticky Cart co về góc phải màn hình dạng Floating Pill rộng 320px.
- **1024px – 1440px (Desktop Customer):** Container menu tối đa `max-w-4xl` căn giữa, chia 2 cột thẻ món sang trọng, giỏ hàng có thể mở dạng Sheet bên phải.

---

### 1.3 Ngăn kéo Tùy chọn Món ăn (`SCR-C03-ITEM-DRAWER`)
- **Vị trí hiển thị:** Bottom Sheet (Drawer) trượt từ đáy màn hình lên trên Menu.
- **Mục tiêu người dùng:** Chọn size, topping hoặc tùy chọn thêm (`MenuOption[]`), nhập ghi chú chế biến riêng cho món.
- **Primary CTA:** `[ Thêm vào giỏ hàng — [Giá tổng] đ ]`.
- **Secondary Actions:** Nút `[ ✕ ]` hoặc gạt thanh Sheet handle để đóng, nút tăng giảm số lượng (+ / -).

#### Bố cục hiển thị (Mobile 375px)
1. **Thanh gạt Sheet handle:** Bo tròn nhỏ ở đỉnh drawer.
2. **Ảnh món to (Header ảnh, 16:9 hoặc bo tròn 120x120px):** Hiện ảnh rõ nét của món.
3. **Thông tin món:** Tên món (18px Bold), mô tả chi tiết, giá gốc cơ bản.
4. **Nhóm tùy chọn (Options List — Render từ `MenuItem.options`):**
   - Mỗi option là một hàng: Checkbox/Radio tròn, Tên tùy chọn (`MenuOption.name`), Chênh lệch giá nếu có (`+5.000 đ`).
   - Nếu `MenuOption.available = false`: Bị vô hiệu hóa, hiển thị nhãn "(Tạm hết)".
5. **Ô nhập ghi chú món:** Textarea cao 60px, placeholder: "Ghi chú cho quán (ví dụ: ít ngọt, nhiều đá, kem riêng...)". Giới hạn 100 ký tự.
6. **Bộ điều chỉnh số lượng:** Hàng nút `[ - ]` (36x36px) — `Số lượng` (16px Bold) — `[ + ]` (36x36px).
7. **Nút CTA cố định đáy Sheet:** `[ Thêm vào giỏ hàng — 40.000 đ ]` (cao 48px, màu `#1D725E`, tự động cộng dồn `priceDeltaVnd`).

#### Dữ liệu Render tối thiểu
```typescript
item: MenuItem; // Bao gồm options: MenuOption[]
```

---

### 1.4 Ngăn kéo Giỏ hàng (`SCR-C04-CART-DRAWER`)
- **Vị trí hiển thị:** Bottom Sheet trượt chiếm 85% chiều cao màn hình.
- **Mục tiêu người dùng:** Rà soát lại danh sách món, điều chỉnh số lượng, xóa món không muốn, nhập ghi chú đơn hàng và tiến hành checkout.
- **Primary CTA:** `[ Tiếp tục đặt hàng — [Tổng tiền] đ ]`.
- **Secondary Actions:** Nút `[ Xóa ]` từng món, `[ Xóa toàn bộ giỏ ]`, `[ Đóng giỏ hàng ]`.

#### Bố cục hiển thị
1. **Header giỏ:** Tiêu đề "Giỏ hàng của bạn", hiển thị số lượng món (`CartLine.length`), nút đóng `✕`.
2. **Danh sách dòng món (`CartLine[]`):**
   - Tên món (snapshot), danh sách tên tùy chọn đã chọn (chữ nhỏ màu `#727B77`).
   - Ghi chú riêng của món (nếu có).
   - Giá tiền của dòng món (`lineTotalVnd`).
   - Bộ tăng giảm số lượng `[ - ] [ Số lượng ] [ + ]`. Nếu số lượng = 1 và bấm trừ, hiển thị icon thùng rác để xóa dòng món.
3. **Ô ghi chú chung toàn đơn:** Input nhập lời nhắn cho quán ("Lấy thêm ống hút giấy", "Ngồi gần cửa sổ"...).
4. **Bảng tóm tắt thanh toán:**
   - Tạm tính món ăn: `XX.000 đ`
   - Phí dịch vụ / Khác: `0 đ`
   - **TỔNG CỘNG: `XX.000 đ`** (Font 18px Bold, màu `#1D2522`).
5. **CTA Tiến hành:** Nút to bản 48px `[ Tiếp tục đặt hàng — XX.000 đ ]`.

#### Trạng thái ngoại lệ đặc thù của Giỏ hàng
- **Món trong giỏ vừa bị đổi giá trên Server (`PRICE_CHANGED`):** Hiển thị Alert cảnh báo viền vàng: "Món [Tên món] đã được cập nhật giá từ 32.000 đ lên 35.000 đ. Vui lòng xác nhận lại tổng tiền." Nút CTA đổi thành `[ Cập nhật lại giá & Tiếp tục ]`.
- **Món trong giỏ vừa hết hàng trên Server (`OUT_OF_STOCK`):** Hiển thị Alert đỏ viền `#B42318`: "Món [Tên món] vừa hết hàng. Chúng tôi đã đánh dấu món này trong giỏ." Nút CTA bị khóa cho đến khi người dùng bấm xóa món hết hàng.

---

### 1.5 Xác nhận Gọi món Tại bàn — Dine-in (`SCR-C05-CHECKOUT-DINEIN`)
- **Vị trí hiển thị:** Step View hoặc Sheet xác nhận cuối cùng.
- **Mục tiêu người dùng:** Khách kiểm tra lại thông tin Bàn và xác nhận gửi đơn. Đơn vào thẳng hàng đợi bếp mà không cần thanh toán trước.
- **Primary CTA:** `[ Xác nhận gọi món ]` (Kèm nhãn phụ: *Quán sẽ bắt đầu làm món ngay*).
- **Secondary Actions:** `[ Quay lại giỏ hàng ]`.

#### Bố cục hiển thị
1. **Huy hiệu thông tin vị trí:**
   - Hộp viền nổi bật bo góc 14px, nền xanh ngọc rất nhạt `#E8F4F0`.
   - Text to rõ: `📍 Bạn đang gọi món tại BÀN 05`.
   - Mã phiên hiện tại: `#8821` (để đối chiếu).
2. **Tóm tắt đơn hàng:** Liệt kê số lượng và tên món vắn tắt (Ví dụ: `2x Cà phê muối, 1x Trà đào`).
3. **Tổng tiền tạm tính:** `67.000 đ` (kèm dòng chữ nhỏ: *Thanh toán khi kết thúc phiên tại quầy hoặc bàn*).
4. **Nút xác nhận hành động:** Nút cao 48px `[ Xác nhận gọi món ]`.
   - Khi bấm: Trạng thái loading "Đang gửi đơn..." kèm spinner. Client gửi kèm `clientRequestId` (UUID) để chống duplicate.
   - Khi server phản hồi thành công (`ApiSuccess<DineInOrderSummary>`): Phát âm thanh xúc giác nhẹ (Haptic), chuyển ngay sang màn hình Theo dõi đơn (`/order/[publicId]`) hiển thị số Ticket FIFO đã được cấp.

---

### 1.6 Thanh toán VietQR Mang đi — Takeaway (`SCR-C06-CHECKOUT-TAKEAWAY`)
- **Vị trí hiển thị:** Màn hình thanh toán độc quyền cho đơn mang đi (`type = 'takeaway'`).
- **Mục tiêu người dùng:** Xem mã VietQR, mở app ngân hàng quét mã chuyển tiền chính xác, theo dõi quá trình hệ thống tự động xác nhận qua webhook.
- **QUY TẮC SỐNG CÒN:** **TUYỆT ĐỐI KHÔNG CẤP TICKET FIFO Ở BƯỚC NÀY.** Đơn đang ở `status = 'pending_payment'`.

#### Bố cục hiển thị
1. **Tiêu đề & Nhãn loại đơn:** `🛍️ Đơn hàng mang đi — Nhận tại quầy`.
2. **Khung mã VietQR động chuẩn EMVCo:**
   - Khung vuông trắng viền 1px bo góc 16px, ở giữa là ảnh QR code tự động sinh (`qrPayload`).
   - Dưới mã QR: Logo Napas247 / VietQR, Số tài khoản, Tên chủ tài khoản, Tên ngân hàng.
   - Nút tiện ích: `[ Sao chép STK ]`, `[ Sao chép số tiền ]`, `[ Tải ảnh QR ]`.
3. **Số tiền thanh toán chính xác:** `67.000 đ` (Viết hoa to đậm).
4. **Mã nội dung chuyển khoản bắt buộc (`merchantRef`):** `MOC-TK029` (Bôi đậm kèm nút copy).
5. **Đồng hồ đếm ngược thời gian thanh toán:**
   - Dòng text: `⏱️ Mã thanh toán có hiệu lực trong: 14:45`.
   - Khi còn dưới 3 phút: Chuyển màu chữ sang đỏ cam `#B42318` nhấp nháy.
6. **Hộp cảnh báo giao dịch (Alert Warning — Nền hổ phách `#FEF6EE`, viền `#F9DBAF`):**
   - Icon đồng hồ cát đang quay Lucide.
   - Tiêu đề: **Đang chờ ngân hàng xác nhận giao dịch...**
   - Nội dung cảnh báo: *"Vui lòng KHÔNG chuyển khoản lần hai nếu bạn đã thực hiện chuyển tiền thành công trên ứng dụng ngân hàng. Hệ thống sẽ tự động cập nhật ngay khi nhận được tín hiệu tiền về."*
7. **Nút trạng thái khóa:** Nút `[ ⏳ Đang tự động kiểm tra... ]` (Disabled, không cho người dùng bấm lung tung).

#### Cơ chế chuyển trạng thái Webhook
- Client kích hoạt cơ chế Polling an toàn mỗi **3 giây/lần** gọi endpoint `GET /api/public/orders/:id`.
- Khi Webhook của cổng thanh toán gọi vào server và server xác nhận tiền về hợp lệ (`paid = true`):
  - Server commit transaction cấp số `ticketNo` và sinh `pickupCode`.
  - Polling của client nhận được `status = 'accepted'` và `ticketNo: 29`.
  - Giao diện ngay lập tức kích hoạt hiệu ứng thành công (Checkmark xanh) và chuyển sang màn hình `CustomerTrackingPage`.

---

### 1.7 Màn hình Theo dõi Đơn hàng — Tracking (`SCR-C07-TRACKING`)
- **Route:** `/order/[publicId]`
- **Mục tiêu người dùng:** Theo dõi số thứ tự của mình, biết đơn đang làm hay đã xong để đến quầy nhận hoặc chờ nhân viên mang ra bàn.
- **Bố cục hiển thị:**
  1. **Hộp số Ticket FIFO (Tâm điểm thị giác):**
     - Nền trắng bo góc 20px, viền 2px màu xanh ngọc `#35977D`.
     - Chữ phụ: `SỐ THỨ TỰ PHỤC VỤ CỦA BẠN`.
     - Số Ticket cực lớn: **`#028`** (Font 36px Bold, màu `#1D725E`).
     - Nhãn đi kèm: `📍 Bàn 05` HOẶC `🛍️ Mang đi — Đã thanh toán`.
  2. **Thanh tiến trình 4 giai đoạn chế biến:**
     - Bước 1: `Đã nhận đơn` (Icon check xanh).
     - Bước 2: `Đang làm món` (Nếu đang ở bước này: Icon nón đầu bếp xanh dương `#2563A6`, pulse animation).
     - Bước 3: `Sẵn sàng phục vụ` (Nếu đến bước này: Chuông reo, rung điện thoại, nền đổi sang xanh lục `#E8F4F0`).
     - Bước 4: `Đã giao / Hoàn tất` (Dine-in: đã mang ra bàn; Takeaway: đã nhận tại quầy).
  3. **Hộp Mã nhận món bảo mật (Chỉ hiển thị cho Takeaway trên thiết bị của người mua):**
     - Khung bảo mật viền nét đứt: `🔑 MÃ NHẬN MÓN: TK-8821`.
     - Dòng nhắc nhở: *"Hãy xuất trình mã này cho nhân viên tại quầy khi nhận đồ uống. Không chia sẻ mã này cho người khác."*
  4. **Chi tiết các món trong đơn:** Liệt kê món, số lượng, tùy chọn.
  5. **Nút tương tác phụ:**
     - Với Dine-in: Nút `[ + Gọi thêm món cho bàn này ]` (quay lại menu mà không mất phiên).
     - Với Takeaway: Nút `[ Cần hỗ trợ / Báo nhân viên ]`.

---

## 2. Khu vực Chủ quán (Owner Dashboard — Desktop & Responsive)

---

### 2.1 Màn hình Đăng nhập Chủ quán (`SCR-OWN-01-LOGIN`)
- **Route:** `/login`
- **Mục tiêu:** Màn hình xác thực tối giản dành riêng cho chủ quán truy cập hệ thống quản trị.
- **Layout:** Căn giữa màn hình trên nền xám `#F5F6F5`. Hộp Card trắng bo góc 24px (`max-w-md`), logo quán ở trên, 2 ô nhập liệu Email và Mật khẩu, nút `[ Đăng nhập vào Dashboard ]`.
- **Trạng thái:** Loading spinner khi xác thực Supabase Auth; Báo lỗi đỏ nếu sai tài khoản hoặc tài khoản không có quyền `owner` thuộc cửa hàng.

---

### 2.2 Dashboard — Tab 1: Đơn hàng (`SCR-OWN-02-ORDERS`)
- **Route:** `/dashboard?tab=orders` (Tab mặc định)
- **Mục tiêu:** Xử lý toàn bộ đơn hàng của quán theo nguyên tắc công bằng FIFO, kiểm soát đơn đang làm và xác minh giao hàng.

#### Bố cục 2 cột (Desktop 1024px – 1440px, Tỷ lệ 70 / 30)

```
┌─────────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────┐
│ CỘT TRÁI: HÀNG ĐỢI ĐƠN HÀNG (~70% CHIỀU RỘNG)                              │ CỘT PHẢI: CHI TIẾT ĐƠN (~30%)        │
│                                                                             │                                      │
│ [Bộ lọc: Tất cả | Tại bàn | Mang đi]        [Thống kê nhanh: Chờ 4·Làm 2]   │ ĐƠN HÀNG #028 · MANG ĐI              │
│                                                                             │ ⏱️ Đặt lúc: 14:28 (Đợi 4 phút)       │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │ Trạng thái: Đang làm món             │
│ │ ★ NÚT HÀNH ĐỘNG FIFO DUY NHẤT:                                          │ │ Thanh toán: [ Đã trả tiền - VietQR ] │
│ │ [ ▶ NHẬN ĐƠN TIẾP THEO (TỰ ĐỘNG CHỌN ĐƠN HỢP LỆ CŨ NHẤT)             ]  │ ├──────────────────────────────────────┤
│ └─────────────────────────────────────────────────────────────────────────┘ │ CHI TIẾT MÓN ĂN:                     │
│                                                                             │ • 2x Trà sữa trân châu hoàng kim     │
│ DANH SÁCH THẺ ĐƠN HÀNG (Sắp xếp tăng dần theo Ticket FIFO):                 │   - 50% đường, 70% đá                │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │ • 1x Bánh sừng bò phô mai            │
│ │ Thẻ đơn #028 · Mang đi · 3 món · 115.000 đ · [ Đang làm ] (Đang chọn)   │ ├──────────────────────────────────────┤
│ └─────────────────────────────────────────────────────────────────────────┘ │ HÀNH ĐỘNG XỬ LÝ HỢP LỆ:              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │ [ ✓ ĐÁNH DẤU ĐÃ LÀM XONG (SẴN SÀNG) ] │
│ │ Thẻ đơn #029 · Bàn 03 · 2 món · 67.000 đ · [ Chờ làm ]                  │ │                                      │
│ └─────────────────────────────────────────────────────────────────────────┘ │ Đối soát mã nhận món Takeaway:        │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │ [ Nhập mã TK-.... ]                  │
│ │ Thẻ đơn #030 · Mang đi · 1 món · 35.000 đ · [ Chờ làm ]                  │ │ [ 🛵 XÁC MINH & ĐÃ GIAO MÓN ]        │
│ └─────────────────────────────────────────────────────────────────────────┘ └──────────────────────────────────────┘
```

#### Quy tắc FIFO Tuyệt đối trong Thiết kế UI
1. **Không có nút "Bắt đầu làm" trên từng thẻ đơn lẻ trong hàng đợi.** Nếu chủ quán bấm tùy tiện vào đơn #030 trong khi đơn #028 đang chờ, thứ tự phục vụ sẽ bị phá vỡ.
2. **Nút `[ ▶ Nhận đơn tiếp theo ]`:**
   - Đặt ở vị trí nổi bật nhất đầu danh sách hàng đợi (chiều cao 48px, màu xanh `#1D725E`, chữ trắng in hoa).
   - Khi bấm, UI gọi API atomic `POST /api/owner/queue/claim-next`. Server dùng câu lệnh khóa hàng đợi và tự động gán đơn có ticket nhỏ nhất chuyển sang `preparing`.
   - Nếu không còn đơn nào ở trạng thái `accepted`: Nút chuyển sang trạng thái disabled (mờ và ghi text: *"Hàng đợi trống — Không có đơn chờ làm"*).
3. **Cột chi tiết bên phải chỉ hiển thị nút hành động tương ứng với trạng thái hợp lệ:**
   - Nếu đơn đang `accepted`: Không có nút làm xong; chỉ có thể chờ được claim hoặc chuyển qua claim tiếp theo.
   - Nếu đơn đang `preparing`: Hiển thị nút `[ ✓ Đánh dấu sẵn sàng ]`.
   - Nếu đơn đang `ready`: Với Dine-in, hiện nút `[ Đã phục vụ ra bàn ]`; với Takeaway, hiện ô nhập mã nhận món + nút `[ Xác minh & Đã giao ]`.

---

### 2.3 Dashboard — Tab 2: Quản lý Bàn (`SCR-OWN-03-TABLES`)
- **Route:** `/dashboard?tab=tables`
- **Mục tiêu:** Quản lý danh sách bàn ăn, mở phiên mới khi khách vào, theo dõi tổng tiền tạm tính, quyết toán thanh toán và đóng bàn.

#### Bố cục 70 / 30
- **Cột trái (70%):** Lưới các thẻ bàn (Grid 3–4 cột). Mỗi thẻ bàn là một Card bo góc 16px:
  - Header thẻ: Tên bàn (`Bàn 01`, `Bàn 02`...).
  - Huy hiệu trạng thái: `Trống` (màu xám), `Đang có khách` (màu xanh ngọc), `Chờ tính tiền` (màu vàng).
  - Thống kê phiên: Số lượng đơn đã gọi trong phiên, Tổng tiền tích lũy tạm tính (`185.000 đ`).
  - Nút nhanh: Nếu bàn trống → Nút `[ Mở phiên mới ]`.
- **Cột phải (30%):** Bảng chi tiết phiên bàn đang chọn (`TableSessionDetail`):
  - Thông tin phiên: Mã phiên bàn ngẫu nhiên (`sessionCode: "8821"`), thời gian mở phiên.
  - Danh sách toàn bộ các đơn hàng (`DineInOrderSummary[]`) thuộc phiên bàn này.
  - Tổng số tiền cần thanh toán của bàn (`TableSessionView.totalVnd`).
  - Lựa chọn hình thức thu tiền: `Tiền mặt` hoặc `Chuyển khoản`.
  - Nút hành động chính: `[ 💳 Xác nhận đã thu tiền & Đóng bàn ]`. Khi bấm, gọi API `POST /api/owner/table-sessions/:id/settle` để đóng phiên và đưa bàn về trạng thái trống.

---

### 2.4 Dashboard — Tab 3: Thực đơn (`SCR-OWN-04-MENU`)
- **Route:** `/dashboard?tab=menu`
- **Mục tiêu:** Quản lý các món ăn trong quán, bật/tắt nhanh tình trạng Còn hàng / Hết hàng, thêm món mới và sửa thông tin cơ bản.

#### Bố cục 70 / 30
- **Cột trái (70%):** Danh sách toàn bộ món ăn theo danh mục.
  - Mỗi hàng món gồm: Ảnh thumbnail nhỏ, Tên món, Giá bán VND.
  - **Công tắc Switch tức thì:** Switch gạt `Còn hàng 🟢 / Hết hàng 🔴`. Khi chủ quán gạt switch, UI lập tức gọi API `PATCH /api/owner/menu/:id` với `available: false/true` mà không cần bấm lưu form phức tạp.
  - Nút `[ Sửa ]` để load thông tin sang cột phải.
- **Cột phải (30%):** Form chỉnh sửa thông tin món ăn:
  - Các ô nhập: Tên món, Danh mục (Select box), Giá bán (VND), Mô tả món.
  - Khung tải lên / đổi ảnh món ăn.
  - Nút lưu: `[ Lưu thay đổi món ]`.

---

### 2.5 Dashboard — Tab 4: Cài đặt (`SCR-OWN-05-SETTINGS`)
- **Route:** `/dashboard?tab=settings`
- **Mục tiêu:** Thiết lập các thông số vận hành của quán, xuất mã QR để in ấn, kiểm tra trạng thái cổng thanh toán.

#### Bố cục 1 cột sạch sẽ (Khung rộng căn giữa)
1. **Trạng thái nhận đơn:** Switch lớn `[ Đang mở cửa nhận đơn / Tạm ngừng nhận đơn ]`. Khi tắt, API public sẽ chặn mọi lượt submit mới (`STORE_NOT_ACCEPTING_ORDERS`).
2. **Thông tin quán:** Tên quán, Địa chỉ, Số điện thoại, Múi giờ mặc định (`Asia/Ho_Chi_Minh`).
3. **Quản lý & Xuất mã QR:**
   - QR Mang đi tại quầy: Nút `[ Xem mã QR ]` và `[ Tải file in ảnh nét ]`.
   - QR Bàn: Nút `[ Tải toàn bộ file in QR 12 bàn (PDF) ]`.
4. **Trạng thái Cổng thanh toán (Metadata View-only — Tuyệt đối không có Secret Key):**
   - Tên nhà cung cấp tích hợp: `VietQR (payOS / SePay Adapter)`.
   - Trạng thái Webhook: `🟢 Đã kết nối thành công (Lần ping cuối: 3 phút trước)`.
   - Nút `[ Kiểm tra kết nối Webhook ]`.
5. **Đối soát giao dịch ngoại lệ (Payment Exceptions):**
   - Bảng hiển thị danh sách các giao dịch tiền về sai lệch hoặc chuyển sau khi mã thanh toán hết hạn, kèm lý do và chứng từ để chủ quán xử lý thủ công.
