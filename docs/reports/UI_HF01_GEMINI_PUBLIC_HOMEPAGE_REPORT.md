# Báo cáo UI Hotfix 01 — Xây dựng Trang chủ Công khai (/)

- **Người thực hiện:** Gemini (UI/UX Frontend Presentation)
- **Thời điểm hoàn thành:** 24/10/2026
- **Mục tiêu:** Thay thế màn hình tạm thời `QR Ordering — Ứng dụng đang được chuẩn bị.` tại `http://localhost:3000/` bằng một trang chủ công khai thân thiện, dễ hiểu, đạt chuẩn thẩm mỹ **Minimal Emerald POS** (`#35977D` / `#1D725E`), loại bỏ hoàn toàn thuật ngữ chuyên ngành (FIFO, POS, PIN phiên bàn...), giúp người dùng phổ thông và chủ quán hiểu ngay website làm gì và giúp gì cho họ.

---

## 1. Tóm tắt các tệp thay đổi

| STT | Tệp tin | Hành động | Mục đích |
|---|---|---|---|
| 1 | `src/app/page.tsx` | Sửa đổi | Thay thế màn hình tạm; tích hợp Metadata SEO và lắp ráp 6 section hoàn chỉnh. |
| 2 | `src/components/home/HomeHeader.tsx` | Tạo mới | Header cố định với hiệu ứng backdrop blur, logo QR Ordering, navigation pill và CTA dẫn đến `/login`. |
| 3 | `src/components/home/HomeHero.tsx` | Tạo mới | Hero 2 cột: Tiêu đề H1, mô tả ngôn ngữ đời thường, các pill lợi ích, CTA và thẻ điện thoại minh họa. |
| 4 | `src/components/home/OrderingOptionsSection.tsx` | Tạo mới | 2 card lớn phân biệt 2 cách gọi món: Dùng tại bàn (mã số bàn 6 số) và Mua mang về (chuyển khoản VietQR tự động). |
| 5 | `src/components/home/HomeBenefitsSection.tsx` | Tạo mới | Section trả lời trực tiếp câu hỏi *"Website này giúp gì cho bạn?"*, chia làm 2 cột: Dành cho Khách hàng & Dành cho Quán ăn. |
| 6 | `src/components/home/HowItWorksSection.tsx` | Tạo mới | Hướng dẫn 3 bước đơn giản (Quét QR → Chọn món yêu thích → Thong thả nhận món) kèm quy tắc thanh toán dễ hiểu. |
| 7 | `src/components/home/HomeFooter.tsx` | Tạo mới | Footer tinh giản: thương hiệu, copyright 2026, các anchor link và link `/login` cho chủ quán. Không dùng từ kỹ thuật. |
| 8 | `tests/ui/home/public-homepage.test.ts` | Tạo mới | 8 unit/UI tests kiểm tra toàn diện cấu trúc ngữ nghĩa, nội dung thân thiện, không có từ FIFO/Takeaway/Minimal POS. |

---

## 2. Tiêu chuẩn thiết kế & Ngôn ngữ thân thiện

1. **Loại bỏ từ ngữ chuyên ngành:**
   - Thay vì *"FIFO"*, viết: *"Phục vụ đúng thứ tự người đến trước làm trước"*.
   - Thay vì *"Takeaway"*, viết: *"Mua mang về (Đến lấy tại quầy)"*.
   - Thay vì *"Mã PIN phiên bàn do nhân viên quán kích hoạt"*, viết: *"Mã số bàn (6 số an toàn) do quán cung cấp khi vào bàn"*.
   - Thay vì *"Minimal Emerald POS"*, viết: *"Ứng dụng gọi món bằng mã QR trên điện thoại"*.
2. **Làm rõ 2 câu hỏi cốt lõi:**
   - **Web này đang làm gì?**
     - Cho phép khách hàng tự xem thực đơn, chọn món và gọi món trực tiếp bằng điện thoại tại quán qua mã QR, không cần cài app, không cần vẫy tay gọi nhân viên hay xếp hàng ở quầy.
   - **Web này giúp gì cho bạn?**
     - *Với Thực khách:* Chủ động xem ảnh món & giá tiền rõ ràng, thêm ghi chú (ít cay, không hành...), gọi thêm món linh hoạt và biết chính xác khi nào món nấu xong.
     - *Với Quán ăn & Bếp:* Giảm tải giờ cao điểm, đơn chuyển thẳng vào màn hình quản lý kèm số bàn và ghi chú chi tiết, không sợ nhầm bill hay sót bàn.
3. **Bảng màu & Design Tokens:**
   - Nền canvas xám sáng tinh tế `#F5F6F5`.
   - Các khối thẻ và bảng điều khiển màu trắng `#FFFFFF` với viền mỏng `#E9ECEA` và đổ bóng nhẹ (`shadow-xs`, `shadow-shell`).
   - Màu nhấn thương hiệu: Emerald sáng `#35977D` cho icon/tag, Emerald đậm `#1D725E` cho các nút bấm chính và text liên kết (đảm bảo độ tương phản cao WCAG AA).
   - Nền phụ / soft surface: `#E8F4F0` và `#FAFBFB`.

---

## 3. Phân định rõ ràng 2 nghiệp vụ gọi món

- **Dùng tại bàn (Ăn tại chỗ):**
  - Quét mã QR in cố định trên bàn ăn.
  - Nhập mã số bàn (6 chữ số) do nhân viên quán cung cấp khi vào bàn để mở thực đơn.
  - Khách thoải mái xem thực đơn, đặt món và gọi thêm bất kỳ lúc nào trong bữa ăn.
  - Thanh toán một lần trực tiếp tại quán khi dùng bữa xong.
- **Mua mang về:**
  - Quét mã QR dùng chung đặt tại quầy thu ngân.
  - Khách chọn món và chuyển khoản tự động qua mã VietQR hiển thị trên điện thoại.
  - Tiền vào tài khoản là bếp nhận đơn làm ngay, phục vụ công bằng theo thứ tự ai đến trước làm trước.
  - Nhận món tại quầy với mã nhận món 6 chữ số cá nhân.

---

## 4. Kết quả kiểm tra chất lượng (Verification Matrix)

| Lệnh kiểm tra | Kết quả | Chi tiết |
|---|---|---|
| `npm run typecheck` | **PASS (Code 0)** | Typescript biên dịch thành công 100%, không có lỗi type. |
| `npm run lint` | **PASS (Code 0)** | ESLint không có lỗi (0 errors) và không có cảnh báo (0 warnings). |
| `npx vitest run --config tests/ui/vitest.config.mts` | **PASS (Code 0)** | **17 test files, 226 tests PASSED** (kèm 8 tests trong `public-homepage.test.ts`). |
| `npm run build` | **PASS (Code 0)** | Next.js 16.4.2 Turbopack production build thành công; trang `/` được prerender thành Static Content (`○ /`). |

---

## 5. Đánh giá Responsive & Accessibility

- **Mobile (320px – 430px):**
  - Header thu gọn thanh thoát, ẩn nav text và giữ logo + nút đăng nhập chủ quán.
  - Hero hiển thị dạng 1 cột; nút bấm đạt chiều cao chuẩn `h-12` (48px) dễ bấm trên màn cảm ứng.
  - Các thẻ gọi món và lợi ích xếp chồng theo chiều dọc; không có hiện tượng cuộn ngang (horizontal overflow).
- **Tablet (768px):**
  - Hai thẻ gọi món hiển thị dạng lưới 2 cột cân xứng.
  - Ba bước quy trình xếp ngay ngắn với khoảng đệm thoáng đãng.
- **Desktop (≥ 1024px):**
  - Container tối đa `max-w-6xl` (1152px) căn giữa.
  - Hero chia bố cục 2 cột (7 phần nội dung bên trái, 5 phần thẻ minh họa bên phải).
  - Khối lợi ích 2 cột đối xứng: Cột dành cho Khách hàng & Cột dành cho Quán ăn.
  - Đầy đủ `focus-visible:ring-2 focus-visible:ring-[#1D725E]`, `aria-label` và tương phản màu sắc đạt chuẩn WCAG AA.
