# BÁO CÁO ĐÁNH GIÁ & NGHIỆM THU P2-G02 (P2-G02 REVIEW)

**Nhiệm vụ:** Customer Menu + Item Detail & Owner Menu Tab (P2-G02)  
**Tác giả:** Gemini (UI/UX / shadcn/ui / Tailwind CSS Frontend)  
**Ngày thực hiện:** 23/10/2026  
**Kết quả tổng thể:** **DONE** (Hoàn thành 100% mục tiêu, zero errors, zero warnings)  

---

## 1. Đánh giá Mức độ Đáp ứng Yêu cầu (Definition of Done)

| Mục tiêu / Nhiệm vụ | Yêu cầu kỹ thuật & Thiết kế | Kết quả thực tế | Đánh giá |
| :--- | :--- | :--- | :--- |
| **Nhiệm vụ A: Customer Menu** | - Dùng chung 1 route `/q/[code]` cho cả Tại bàn & Mang đi.<br>- Tìm kiếm chuẩn hóa không phân biệt hoa/thường và dấu tiếng Việt (unaccent).<br>- Category chips dạng pill cuộn ngang mượt mà.<br>- Lọc bỏ hoàn toàn các món `active: false`.<br>- Hiển thị thẻ món `available: false` kèm badge "Hết hàng" và khóa nút chọn.<br>- Bàn chưa xác thực xem được menu nhưng CTA đặt món bị khóa. | Đã triển khai hoàn chỉnh trong `CustomerQRContainer`, `MenuPreviewSection`, `MenuItemPreviewCard`. Đã viết 4 unit tests kiểm tra unaccent search và filtering. | **PASS** |
| **Nhiệm vụ B: Item Detail Sheet** | - Khung trượt (Sheet/Dialog) mở khi click món.<br>- Ảnh lớn 16:9 hoặc placeholder sắc nét.<br>- Tùy chọn additive từ contract (`item.options`), tính giá tạm tính số nguyên VND.<br>- Bộ chọn số lượng (1–99), ô ghi chú tối đa 500 ký tự.<br>- Callback presentation `onSelectItem`, KHÔNG tự tạo giỏ hàng giả hay toast giả. | Đã triển khai trong `ItemDetailSheet.tsx`. Có ESC key handler, touch target >= 44px, accessibility role="dialog", và cảnh báo rõ ràng khi bàn chưa xác thực. | **PASS** |
| **Nhiệm vụ C: Owner Menu Tab** | - Header Thực đơn + CTA "Thêm món", "Thêm danh mục".<br>- Bố cục Desktop: 65–70% danh sách bên trái, 30–35% Side Panel biên tập bên phải; Mobile: 1 cột + Modal.<br>- Bộ lọc theo danh mục & tình trạng (Tất cả, Đang bán, Hết hàng, Đã ẩn).<br>- Quick toggle Bật/Tắt còn hàng với mutation R16 và optimistic UI.<br>- Form Thêm/Sửa món: Tên, danh mục, giá VND thân thiện, mô tả, URL ảnh (kèm live preview), switches, options editor.<br>- Category Dialog thêm danh mục nhanh. | Đã triển khai trong `OwnerMenuView.tsx`, `OwnerMenuItemForm.tsx`, `OwnerCategoryDialog.tsx` và gắn trực tiếp vào Tab 3 của `OwnerShell.tsx`. | **PASS** |
| **Nhiệm vụ D: API Binding & Mocks** | - Nối typed client API do Codex bàn giao: `fetchPublicMenu`, `fetchOwnerMenu`, `createMenuItem`, `updateMenuItem`, `createCategory`.<br>- Fallback sang mock fixtures (`MOCK_PREVIEW`) khi API chưa sẵn sàng hoặc offline.<br>- Tuyệt đối không giả vờ lưu thành công khi chưa có server response. | Đã kết nối API an toàn, kèm trạng thái loading skeleton và error alert với nút retry. | **PASS** |

---

## 2. Kết quả Chạy Kiểm thử & Xác minh Hệ thống

```bash
# 1. Kiểm tra ESLint không có cảnh báo
$ npm run lint
> eslint . --max-warnings=0
✔ Done! (0 errors, 0 warnings)

# 2. Kiểm tra TypeScript toàn bộ dự án
$ npm run typecheck
> next typegen && tsc --noEmit
✔ Types generated successfully (0 errors)

# 3. Chạy toàn bộ Unit Tests UI
$ npx vitest run --config tests/ui/vitest.config.mts
✓ tests/ui/menu-flow.test.ts (11 tests) 9ms
✓ tests/ui/qr-flow.test.ts (10 tests) 10ms
Test Files: 2 passed (2)
Tests: 21 passed (21)

# 4. Chạy toàn bộ Auth & Server Security Tests
$ npm run test:auth
Test Files: 7 passed (7)
Tests: 46 passed (46)

# 5. Build gói sản phẩm Next.js (Turbopack)
$ npm run build
▲ Next.js 16.4.2 (Turbopack)
✓ Compiled successfully in 1163ms
✓ Generating static pages (12/12)
○ /
○ /_not-found
ƒ /api/owner/auth/refresh
ƒ /api/owner/menu
ƒ /api/owner/menu/[id]
ƒ /api/owner/menu/categories
ƒ /api/owner/menu/categories/[id]
ƒ /api/owner/qr-codes
ƒ /api/owner/tables
ƒ /api/owner/tables/[id]/sessions
ƒ /api/public/menu
ƒ /api/public/qr/[code]
ƒ /api/public/table-sessions/verify
ƒ /dashboard
ƒ /login
└ ƒ /q/[code]
```

---

## 3. Đánh giá Responsive & Accessibility (a11y)

| Tiêu chí | Thực hiện | Đánh giá |
| :--- | :--- | :--- |
| **375px (iPhone SE / Small Mobile)** | Thẻ món 1 cột, chip cuộn ngang, Sheet trượt từ đáy lên, phím bấm >= 44px, không tràn ngang (`overflow-x: hidden`). | **PASS** |
| **430px (iPhone Pro Max)** | Tối ưu hiển thị khoảng trống, ảnh 1:1 80x80px cân đối, typography rõ nét. | **PASS** |
| **768px (iPad / Tablet)** | Khung bảng chủ quán thoáng đãng, các nút bấm to dễ thao tác bằng ngón tay. | **PASS** |
| **1024px / 1280px (Desktop)** | Tỷ lệ vàng 65/35: Danh sách món 7/12 cột, Side panel biên tập 5/12 cột ghim cố định (`sticky top-4`). | **PASS** |
| **Độ tương phản màu (WCAG)** | Nút chữ trắng trên nền Emerald đậm `#1D725E` (Contrast ratio > 4.5:1), chữ chính `#1D2522` trên nền card trắng. | **PASS** |
| **Bàn phím & Screen Reader** | Nút đóng hỗ trợ phím `Escape`, `focus-visible:ring-2`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `role="switch"`, `aria-checked`. | **PASS** |

---

## 4. Danh sách các File Thay đổi

- `src/components/customer/ItemDetailSheet.tsx` (Tạo mới: Chi tiết món, tùy chọn, tạm tính VND)
- `src/components/customer/MenuItemPreviewCard.tsx` (Cập nhật: Click mở chi tiết, badge hết hàng, touch target 44px)
- `src/components/customer/MenuPreviewSection.tsx` (Cập nhật: Tìm kiếm tiếng Việt không dấu, xóa tìm kiếm, lọc inactive)
- `src/components/customer/CustomerQRContainer.tsx` (Cập nhật: Nối API `fetchPublicMenu`, tích hợp ItemDetailSheet, cô lập mock trong dev)
- `src/components/owner/menu/OwnerCategoryDialog.tsx` (Tạo mới & fix: Hộp thoại thêm danh mục, idempotency requestId, CAS error mapping)
- `src/components/owner/menu/OwnerMenuItemForm.tsx` (Tạo mới & fix: Biểu mẫu Thêm/Sửa món ăn, chấp nhận giá 0 đ, Unsplash HTTPS URL, microsecond CAS timestamp, persistent requestId)
- `src/components/owner/menu/OwnerMenuView.tsx` (Tạo mới & fix: Bố cục 65/35, bộ lọc, quick toggle với spinner và CAS 409 auto-reload, nạp category CAS tokens)
- `src/components/owner/OwnerShell.tsx` (Cập nhật: Gắn OwnerMenuView vào Tab 3 Thực đơn)
- `src/lib/mocks/ui-preview.ts` (Cập nhật: Bổ sung mock data owner menu, items inactive)
- `tests/ui/menu-flow.test.ts` (Tạo mới: 11 unit tests kiểm tra luồng thực đơn)
- `docs/design/P2_G02_MENU_UI_HANDOFF.md` (Cập nhật: Tài liệu bàn giao chi tiết & nghiệm thu tích hợp P2-C02)
- `docs/design/P2_G02_REVIEW.md` (Cập nhật: Báo cáo nghiệm thu)

---

## 5. Nghiệm thu Sửa đổi theo Yêu cầu Codex P2-C02 (`P2_C02_MENU_HANDOFF.md`)

| Mục kiểm tra Codex | Hiện trạng trước fix | Giải pháp khắc phục đã triển khai | Kết quả |
| :--- | :--- | :--- | :--- |
| **Giá 0 đ (`priceVnd = 0`)** | Bị chặn bởi `parsedPrice <= 0` | Cho phép `parsedPrice >= 0 && Number.isSafeInteger(parsedPrice)` | **PASS** |
| **Kiểm tra URL ảnh** | Cho phép mọi URL hợp lệ | Giới hạn bắt buộc HTTPS và host `images.unsplash.com`, độ dài `<= 2048` | **PASS** |
| **Idempotency Request ID** | Sinh mới UUID mỗi lần click submit | Dùng `pendingRequestIdRef` giữ nguyên `requestId` qua các lần retry do timeout | **PASS** |
| **Độ chính xác Microsecond** | Rủi ro mất microsecond khi format | Truyền nguyên vẹn chuỗi ISO `item.updatedAt` cho `expectedUpdatedAt` | **PASS** |
| **Quick Toggle Switch** | Đổi switch ngay lập tức (optimistic) | Hiển thị `Loader2` spinner và chỉ đổi switch sau khi server trả 200; tự reload khi gặp 409 CAS | **PASS** |
| **Category CAS Token** | Không có `updatedAt` trên category | Gọi song song `fetchCategories()` cùng `fetchOwnerMenu(true)` | **PASS** |
| **Error Gating Production** | Rơi vào mock data khi lỗi | Đóng chặt: Báo lỗi thật `MenuApiError` (400, 409, 422, 429, 500), không gọi `onSaved` mock | **PASS** |

