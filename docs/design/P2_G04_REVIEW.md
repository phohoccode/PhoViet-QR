# P2-G04 — OWNER TABLES & QR MANAGEMENT REVIEW

> **Báo cáo hoàn thành nhiệm vụ P2-G04**  
> **Nhiệm vụ:** Owner Tables & QR Management UI — Create, Preview, Download, Print.  
> **Phụ trách:** Gemini (UI/UX Frontend Engineer).

---

## 1. Tóm tắt kết quả triển khai

P2-G04 đã hoàn thành toàn bộ yêu cầu về giao diện và tương tác quản lý bàn và mã QR trong Dashboard Chủ quán (`/dashboard`):

1. **Tab Bàn (`activeTab === 'tables'`):**
   - Header "Quản lý bàn" với tổng số bàn, thanh tìm kiếm theo tên bàn, bộ lọc trạng thái (Tất cả / Có khách / Đang trống / Ngưng sử dụng), nút "Làm mới", và CTA "Thêm bàn".
   - Lưới card bàn chuẩn Minimal Emerald POS (1–2 cột mobile, 3 cột tablet, 4–5 cột desktop).
   - Từng card hiển thị rõ ràng: Nhãn bàn, Badge trạng thái bàn (Đang trống, Có khách, Chờ tính tiền, Ngưng sử dụng), Badge QR (Đã có QR, Chưa có QR, QR bị khóa), thông tin phiên gọi món (tổng tiền, số đơn), và các nút tương tác nhanh $\ge 40\text{px}$–$44\text{px}$.
   - Tích hợp liền mạch luồng mở phiên bàn R12 (`POST /api/owner/tables/:id/sessions`) với hộp thoại hiển thị mã phiên private.
   - Menu tùy chọn phụ cho từng bàn: Đổi tên bàn, Xem/In mã QR, Bật/tắt trạng thái bàn (có bảo vệ chống tắt bàn khi có phiên hoạt động).

2. **Hộp thoại Thêm / Sửa bàn (`AddEditTableDialog`):**
   - Responsive Dialog (Desktop) / Sheet (Mobile).
   - Input kiểm tra tính hợp lệ: bắt buộc nhập, tối đa 50 ký tự.
   - Nhận diện và hiển thị lỗi server `TABLE_LABEL_CONFLICT` / `VALIDATION_ERROR` (field `label`) ngay dưới ô nhập, giữ nguyên dữ liệu đã gõ.
   - Trạng thái submitting với spinner, chống bấm đúp, gắn `requestId` UUID chống trùng lặp.
   - Khi tạo bàn thành công, lập tức hiển thị nút CTA xem và in mã QR vừa sinh.

3. **Xem, Tải & In mã QR bàn (`TableQrModal`):**
   - Hiển thị ảnh QR chuẩn ISO sắc nét được tạo trực tiếp tại frontend từ `publicUrl` (`/q/[code]`).
   - Tuyệt đối không chứa token, mã phiên hay thông tin nhạy cảm.
   - Nút sao chép liên kết dự phòng có phản hồi "Đã chép".
   - **Tải QR SVG:** Xuất file vector chất lượng in ấn chuyên nghiệp, tên file chuẩn hóa tiếng Việt (VD: `QR_Ban_05.svg`).
   - **Tải QR PNG:** Render canvas và xuất ảnh PNG 1024x1024px với quiet zone 4 modules.
   - **In phiếu QR:** Kích hoạt print stylesheet chuẩn khổ A6/A7.
   - **Đổi mã QR (Rotate):** Đặt trong menu phụ collapsible, có AlertDialog xác nhận cảnh báo mã cũ mất hiệu lực; chặn thao tác khi bàn đang có phiên hoạt động (`activeSession`).

4. **Tab Cài đặt — QR Mua mang đi tại quầy (`TakeawayQrCard`):**
   - Đặt ngay trong tab Cài đặt hiện hữu, không tạo màn hình admin mới.
   - Nút "Tạo mã QR mang đi" nếu quán chưa có QR quầy.
   - Card xem trước QR quầy, tải SVG/PNG, in phiếu quầy chuẩn A6/A7, sao chép liên kết.
   - Phiếu in quầy hiển thị tiêu đề tên quán, "MUA MANG ĐI", hướng dẫn *"Quét mã • Chọn món • Thanh toán • Nhận số thứ tự"*.
   - Xác nhận đổi mã QR quầy an toàn.

5. **Print Stylesheet (`src/app/globals.css`):**
   - Bổ sung quy tắc `@media print` cách ly vùng `#qr-printable-area`.
   - Ẩn toàn bộ thanh điều hướng, shell, buttons, footer khi in.
   - Đảm bảo in mực đen trên nền giấy trắng tinh, căn giữa trang, không bị cắt góc hay tràn lề.

---

## 2. Danh sách tệp tin thay đổi và tạo mới

| Trạng thái | Đường dẫn tệp | Mô tả |
|---|---|---|
| **Tạo mới** | `src/lib/qr/qr-code.ts` | Module pure TypeScript sinh ma trận QR ISO/IEC 18004, xuất SVG và Canvas PNG |
| **Tạo mới** | `src/components/owner/qr/QrCodeView.tsx` | Component SVG hiển thị mã QR client-side |
| **Tạo mới** | `src/components/owner/qr/PrintQrVoucher.tsx` | Phiếu in chuẩn A6/A7 cho Bàn và Quầy mang đi |
| **Tạo mới** | `src/components/owner/tables/AddEditTableDialog.tsx` | Hộp thoại thêm/sửa nhãn bàn kèm validation conflict |
| **Tạo mới** | `src/components/owner/tables/TableQrModal.tsx` | Modal xem QR, tải SVG/PNG, in và rotate an toàn |
| **Tạo mới** | `src/components/owner/tables/TableManagementView.tsx` | View quản lý lưới bàn cho Tab Bàn |
| **Tạo mới** | `src/components/owner/settings/TakeawayQrCard.tsx` | Card quản lý QR Mang đi tại quầy cho Tab Cài đặt |
| **Tạo mới** | `tests/ui/tables-qr-flow.test.ts` | Bộ kiểm thử UI 14 test cases cho QR generator, URLs, print templates và guardrails |
| **Tạo mới** | `docs/design/P2_G04_UI_HANDOFF.md` | Tài liệu bàn giao chi tiết specs, props, API mapping, a11y checklist |
| **Tạo mới** | `docs/design/P2_G04_REVIEW.md` | Báo cáo kiểm chứng kết quả triển khai |
| **Cập nhật** | `src/components/owner/OwnerShell.tsx` | Nối Tab Bàn với `TableManagementView` và Tab Cài đặt với `TakeawayQrCard` |
| **Cập nhật** | `src/app/globals.css` | Thêm print stylesheet `@media print` cách ly `#qr-printable-area` |

*Ghi chú: Toàn bộ tệp backend (`src/app/api/**`, `src/server/**`, `supabase/**`, `package.json`) được giữ nguyên, không chỉnh sửa.*

---

## 3. Kết quả Kiểm thử & Chất lượng mã nguồn

### A. Kiểm tra ESLint
```bash
npm run lint
> eslint . --max-warnings=0
# Kết quả: THÀNH CÔNG (0 lỗi, 0 cảnh báo)
```

### B. Kiểm tra TypeScript
```bash
npm run typecheck
> next typegen && tsc --noEmit
# Kết quả: THÀNH CÔNG (0 lỗi type)
```

### C. Kiểm tra Git Whitespace
```bash
git diff --check
# Kết quả: THÀNH CÔNG (Exit code 0, không có trailing whitespace hay lỗi EOF)
```

### D. Kiểm tra Vitest UI Suite
```bash
npx vitest run -c tests/ui/vitest.config.mts
# Kết quả: 4 passed files (50/50 tests passed)
# - tests/ui/menu-flow.test.ts (11 tests)
# - tests/ui/tables-qr-flow.test.ts (14 tests)
# - tests/ui/qr-flow.test.ts (10 tests)
# - tests/ui/cart/cart-flow.test.ts (15 tests)
```

### E. Kiểm tra Next.js Production Build
```bash
npm run build
> next build
# Kết quả: THÀNH CÔNG
# Compiled successfully in 1214ms
# Generated 12/12 static & dynamic routes
```

---

## 4. Bảng tiêu chí hoàn thành (Definition of Done)

- [x] Tab Bàn có danh sách bàn, bộ lọc, thêm/sửa nhãn bàn và các hành động QR cơ bản.
- [x] Xem QR tại bàn sử dụng URL công khai thật `/q/[code]`, không chứa session code/token.
- [x] Tải QR SVG (vector) và PNG (1024px) thực sự hoạt động, in QR cách ly không kèm sidebar/navbar.
- [x] Tab Cài đặt có card QR Mua mang đi tại quầy, hỗ trợ xem/tải/in mẫu mang đi.
- [x] AlertDialog xác nhận rotate/vô hiệu QR; xử lý chặn đổi mã khi có phiên hoạt động (`activeSession`).
- [x] Responsive mượt mà trên các viewport (375px, 430px, 768px, 1024px, 1440px) và a11y đầy đủ.
- [x] Duy trì đồng nhất phong cách Minimal Emerald POS theo ảnh tham chiếu.
- [x] Tài liệu bàn giao đầy đủ tại `docs/design/P2_G04_UI_HANDOFF.md`.
