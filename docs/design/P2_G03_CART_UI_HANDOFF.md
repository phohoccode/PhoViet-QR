# BÀN GIAO GIAO DIỆN GIỎ HÀNG & XEM LẠI TRƯỚC GỌI MÓN (P2-G03 UI HANDOFF)

**Mã công việc:** P2-G03  
**Agent phụ trách:** Gemini (Frontend UI/UX, shadcn/ui, Tailwind CSS)  
**Phiên bản:** 1.0 — Minimal Emerald Design System  
**Ngày hoàn thành:** 23/10/2026  
**Trạng thái kiểm thử:** LINT: PASS (0 errors, 0 warnings) | TYPECHECK: PASS (0 errors) | TESTS: PASS (33/33 UI tests, 47/47 Unit tests, 46/46 Auth tests) | BUILD: PASS (Turbopack)  

---

## 1. Tổng quan Kiến trúc Giao diện Giỏ hàng (Customer Cart)

P2-G03 hoàn thiện toàn diện luồng tương tác từ màn hình thực đơn (P2-G02) vào giỏ hàng và màn hình xem lại trước khi đặt món cho khách hàng dùng mã QR:

1. **Kết nối Thêm món từ Menu (`ItemDetailSheet`):**
   - Khi khách hàng chọn món, tùy chọn (options), số lượng (1..99) và ghi chú → bấm **"Thêm vào giỏ · [Giá] đ"**.
   - Cung cấp phản hồi xúc giác/trực quan tức thời: nút chuyển sang trạng thái xanh kèm icon check `"Đã thêm vào giỏ hàng!"` trước khi đóng sheet sau 400ms.
   - Hỗ trợ xem menu và thêm món vào giỏ tạm ngay cả khi bàn chưa xác thực mã phiên (theo policy P2-C03), nhưng khóa bước đặt món ở màn hình review.

2. **Thanh Giỏ hàng Nổi Cố định (`StickyCartPreview`):**
   - Nằm cố định tại đáy màn hình mobile, tự động căn theo Safe-area inset bottom của thiết bị (Home indicator).
   - Hiển thị badge số lượng món, icon túi hàng, dòng chữ `"Tạm tính · [n] món"`, tổng tiền tạm tính VND định dạng `vi-VN`, và nút `"Xem giỏ"`.
   - Chiều cao chạm 56px (h-14), tương phản đạt chuẩn WCAG AA trên nền xanh ngọc đậm `#1D725E`.

3. **Khung Giỏ hàng Khách hàng (`CartSheet`):**
   - Thiết kế đáp ứng (Responsive Design): Bottom Sheet trượt từ đáy lên trên Mobile (<640px) và Slide-over Panel trượt từ cạnh phải trên Desktop (>=640px).
   - Hỗ trợ đóng bằng phím `Escape`, nhấp ngoài backdrop hoặc bấm nút đóng (X) đạt touch target >= 44px.
   - Điều phối 2 bước (Stepper):
     + **Bước 1 (`step = 'cart'`):** Danh sách món đã chọn, bộ điều khiển tăng/giảm số lượng đạt >=44px, nút chỉnh sửa tùy chọn/ghi chú (`EditCartItemDialog`), nút xóa món, và nút CTA `"Tiếp tục xem lại đơn"`.
     + **Bước 2 (`step = 'review'`):** Màn hình `PreCheckoutReview` tóm tắt chi tiết toàn bộ đơn hàng trước khi gửi.

4. **Bước Xem Lại Trước Gọi Món (`PreCheckoutReview`):**
   - **Dine-in (Tại bàn):** Hiển thị rõ số bàn (vd: `Bàn 05`), badge trạng thái xác thực phiên, và đoạn copy bắt buộc theo hợp đồng:  
     `"Sau khi xác nhận đơn, quán sẽ bắt đầu xử lý. Thanh toán cuối phiên tại bàn."`
   - **Takeaway (Mang đi):** Hiển thị badge `Mang đi · Nhận tại quầy` và đoạn copy bắt buộc:  
     `"Bạn sẽ thanh toán bằng VietQR và đơn chỉ được chuyển sang chế biến sau khi hệ thống xác nhận thanh toán."`
   - **Ranh giới Phase 2:** Nút cuối cùng bị khóa (`disabled`) với nhãn minh bạch:  
     `"Xác nhận & đặt món (Sẽ mở ở Phase 3)"` kèm giải thích chức năng đang hoàn thiện. **Tuyệt đối KHÔNG tạo order giả, không tạo số FIFO, không tạo mã thanh toán VietQR giả.**

---

## 2. Danh mục Component & Files Sở Hữu (P2-G03)

| File / Component | Đường dẫn | Vai trò | Trạng thái |
| :--- | :--- | :--- | :--- |
| `types.ts` | `src/components/customer/cart/types.ts` | Khai báo kiểu dữ liệu giỏ hàng, CartLine, Readiness | **MỚI** |
| `usePresentationCart.ts` | `src/components/customer/cart/usePresentationCart.ts` | Hook quản lý giỏ hàng, storage safety, grouping, readiness | **MỚI** |
| `CartLineItem.tsx` | `src/components/customer/cart/CartLineItem.tsx` | Hiển thị 1 dòng món, stepper >=44px, nút sửa, xóa, badges | **MỚI** |
| `EditCartItemDialog.tsx` | `src/components/customer/cart/EditCartItemDialog.tsx` | Hộp thoại chỉnh sửa tùy chọn, ghi chú và số lượng | **MỚI** |
| `PreCheckoutReview.tsx` | `src/components/customer/cart/PreCheckoutReview.tsx` | Màn hình xem lại trước đặt món, copy chuẩn Dine-in/Takeaway | **MỚI** |
| `CartSheet.tsx` | `src/components/customer/cart/CartSheet.tsx` | Sheet giỏ hàng 2 bước responsive (mobile sheet / desktop panel) | **MỚI** |
| `index.ts` | `src/components/customer/cart/index.ts` | Barrel export cho toàn bộ module cart | **MỚI** |
| `ItemDetailSheet.tsx` | `src/components/customer/ItemDetailSheet.tsx` | Nối nút "Thêm vào giỏ", hiệu ứng feedback "Đã thêm vào giỏ!" | **CẬP NHẬT** |
| `StickyCartPreview.tsx` | `src/components/customer/StickyCartPreview.tsx` | Cập nhật nhãn và liên kết mở CartSheet | **CẬP NHẬT** |
| `CustomerQRContainer.tsx` | `src/components/customer/CustomerQRContainer.tsx` | Điều phối Cart State, kết nối Header, Sticky bar và CartSheet | **CẬP NHẬT** |
| `ui-preview.ts` | `src/lib/mocks/ui-preview.ts` | Bổ sung mock fixtures: `MOCK_CART_ITEMS`, items hết hàng | **CẬP NHẬT** |
| `cart-flow.test.ts` | `tests/ui/cart/cart-flow.test.ts` | 11 unit tests kiểm tra tính tiền, line grouping, readiness | **MỚI (11/11 PASS)** |

---

## 3. Ma Trận Trạng Thái Giao Diện (Cart UI States)

| Trạng thái | Biểu hiện Giao diện | Hành vi Điều khiển / CTA |
| :--- | :--- | :--- |
| **Giỏ rỗng (Empty)** | Icon túi hàng, tiêu đề `"Giỏ hàng đang trống"`, lời mời chọn món thân thiện. | Nút `"Chọn món ngay"` đóng Sheet đưa khách về menu. Sticky bar ẩn hoàn toàn. |
| **Có 1 hoặc nhiều món** | Hiển thị danh sách thẻ món, ảnh thumbnail, danh sách options, note, đơn giá và thành tiền dòng. | Stepper (+ / −) tăng giảm số lượng (1..99). Bấm − khi số lượng là 1 sẽ xóa món. Nút Sửa mở dialog sửa options. |
| **Món hết hàng (`available = false`)** | Thẻ món mờ xám, ảnh có badge đỏ `"Hết hàng"`, cảnh báo `"Món ăn hiện đã hết hàng"`. | Khóa nút `"Tiếp tục xem lại đơn"`, yêu cầu khách xóa món hết hàng khỏi giỏ trước khi đi tiếp. |
| **Giá thay đổi (`priceChanged = true`)** | Badge vàng `"Giá thay đổi"` kèm thông báo `"Giá món đã cập nhật trên thực đơn mới nhất"`. | Cho phép xem lại giá mới trước khi đi tiếp. |
| **Tùy chọn không còn khả dụng** | Badge cảnh báo cạnh tên tùy chọn. | Nút Sửa cho phép khách chọn lại tùy chọn khác phù hợp. |
| **QR bàn chưa xác nhận phiên** | Banner vàng nhạt: `"Cần xác thực mã phiên bàn để gọi món"`. | Khách vẫn thêm món vào giỏ được; ở bước Review nút gửi bị khóa và có CTA `"Nhập mã phiên bàn ngay"`. |
| **QR mang đi (Takeaway)** | Badge xanh lam `Mang đi · Nhận tại quầy`. | Không yêu cầu xác thực bàn; hiển thị hướng dẫn thanh toán VietQR trước khi chế biến. |
| **Bộ nhớ bị hạn chế (Private Browsing)** | Banner thông báo nhẹ: `"Bộ nhớ tạm bị hạn chế. Giỏ hàng chỉ lưu tạm trong phiên này."` | Vẫn cho phép thao tác giỏ bình thường trong phiên (in-memory), không gây lỗi crash app. |
| **Thành công khi thêm món** | Nút trong Item Sheet đổi sang màu xanh đậm với icon Check: `"Đã thêm vào giỏ hàng!"`. | Tự động cập nhật badge giỏ trên Sticky bar và Header, đóng sheet sau 400ms. |

---

## 4. Ánh Xạ Contract Dữ Liệu (Codex vs Gemini UI)

Cấu trúc dòng giỏ hàng `CustomerCartItem` được chuẩn hóa để chuyển đổi 1-to-1 sang contract `CartLine` do Codex quy định trong [docs/contracts/types.ts](../../docs/contracts/types.ts#L65-L70):

```typescript
// Contract CartLine của Codex:
export interface CartLine {
  menuItemId: Id;
  quantity: number; // 1..99
  optionIds: Id[]; // unique, thuộc về món
  note: string | null; // tối đa 500 ký tự
}

// Chuyển đổi từ CustomerCartItem:
const contractLine: CartLine = {
  menuItemId: item.menuItemId,
  quantity: item.quantity,
  optionIds: item.selectedOptions.map((opt) => opt.id),
  note: item.note,
};
```

---

## 5. Điểm Phối Hợp Kỹ Thuật Với Codex (P2-C03) — ĐÃ TÍCH HỢP HOÀN TẤT

- **Tích hợp Cart Facade hoàn tất:** `CustomerQRContainer` đã tích hợp trực tiếp `createCartStore({ qrCode })` và `useCart` từ `@/features/cart`. Boundary được cách ly per-QR bằng `key={qrCode}`.
- **Presentation Adapter:** `usePresentationCart` đóng vai trò là presentation bridge mỏng, chuyển đổi 100% từ `CartView` / `CartLineView` / `CheckoutReadiness` sang presentation UI mà không giữ lại bất kỳ mock storage hay tính toán giả nào.
- **Xử lý tràn số an toàn:** `subtotalVnd === null` khi vượt quá giới hạn an toàn integer VND; UI hiển thị rõ thông báo lỗi overflow và chặn nút xem lại, tuyệt đối không hiển thị 0.
- **Vòng đời Refresh & Review:** Trước khi chuyển sang bước Review, UI gọi `await cart.refresh()` để lấy R01 và R03 mới nhất; khi có biến động giá, khách bấm xác nhận sẽ gọi `cart.confirmReview()`.
- **Tôn trọng quyền riêng tư (Note Privacy):** Ghi chú món chỉ lưu trong RAM, không ghi vào `sessionStorage`. Khi reload trang, dòng được gắn cờ `noteNeedsReview: true` và hiển thị cảnh báo yêu cầu khách kiểm tra lại.
- **Sẵn sàng chuyển giao Phase 3:** Màn hình `PreCheckoutReview` đã chuẩn bị sẵn vị trí kích hoạt mutation POST `CreateOrderInput` cho Phase 3. Ở Phase 2, nút hoàn toàn disabled kèm nhãn minh bạch: `"Xác nhận & đặt món (Sẽ mở ở Phase 3)"`.
- **Không có bất kỳ Order ID, số FIFO hay thanh toán giả nào được sinh ra.**
