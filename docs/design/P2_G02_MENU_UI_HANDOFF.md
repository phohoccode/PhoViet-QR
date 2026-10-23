# BÀN GIAO GIAO DIỆN THỰC ĐƠN KHÁCH HÀNG & CHỦ QUÁN (P2-G02 UI HANDOFF)

**Mã công việc:** P2-G02  
**Agent phụ trách:** Gemini (Frontend UI/UX, shadcn/ui, Tailwind CSS)  
**Phiên bản:** 1.0 — Minimal Emerald Design System  
**Ngày hoàn thành:** 23/10/2026  
**Trạng thái kiểm thử:** LINT: PASS (0 errors, 0 warnings) | TYPECHECK: PASS | TESTS: PASS (21/21 UI tests, 46/46 Auth tests) | BUILD: PASS  

---

## 1. Tổng quan & Kiến trúc giao diện

P2-G02 hoàn thiện toàn diện giao diện thực đơn cho cả 2 phân hệ theo đúng ảnh tham chiếu [ui-reference.png](../../assets/ui-reference.png):
1. **Customer Menu (`/q/[code]`):** Dùng chung cho cả 2 chế độ QR Tại bàn (Dine-in) và Mang đi (Takeaway).
   - Tự động nạp menu từ backend endpoint R03 qua typed client `fetchPublicMenu(qrCode)`.
   - Tìm kiếm thời gian thực chuẩn hóa không phân biệt hoa/thường và dấu tiếng Việt (unaccent).
   - Dải chip danh mục dạng pill cuộn ngang mượt mà trên mobile.
   - Danh sách thẻ món ăn (`MenuItemPreviewCard`) với badge trạng thái còn/hết hàng rõ ràng.
   - Tự động lọc bỏ các món `active: false` (bảo vệ khách không nhìn thấy món đã ẩn).
2. **Item Detail Sheet (`ItemDetailSheet`):**
   - Bottom sheet trên mobile (< 640px) và Dialog căn giữa trên desktop (>= 640px).
   - Ảnh lớn tỷ lệ 16:9 kèm placeholder ấm cúng, tên món, giá cơ bản, mô tả chi tiết.
   - Danh sách tùy chọn (Options) additive lấy trực tiếp từ contract dữ liệu (`item.options`).
   - Bộ chọn số lượng (1–99), ô ghi chú món ăn (tối đa 500 ký tự).
   - Tính toán trực tiếp giá tạm tính số nguyên VND (`previewTotalVnd`).
   - Cảnh báo rõ ràng khi bàn chưa xác thực ("Cần xác nhận bàn để chọn món").
   - Callback an toàn `onSelectItem({ menuItemId, quantity, optionIds, note, previewTotalVnd })` — KHÔNG tự tạo cart store, không tạo toast giả mạo.
3. **Owner Menu Tab (`OwnerMenuView`):**
   - Tích hợp trực tiếp vào Tab 3 Thực đơn trên Owner Dashboard (`/dashboard`).
   - Bố cục responsive chuẩn: Desktop (lg+) chia 65–70% danh sách bên trái và 30–35% Side Panel biên tập bên phải; Mobile/Tablet hiển thị danh sách 1 cột kèm Modal/Sheet biên tập.
   - Bộ lọc đa chiều: Tìm kiếm, lọc theo danh mục, lọc theo trạng thái (Tất cả / Đang bán / Hết hàng / Đã ẩn).
   - Công tắc chuyển nhanh tình trạng còn hàng (Còn hàng / Hết hàng) gọi trực tiếp PATCH mutation R16 kèm optimistic UI và phục hồi khi lỗi.
   - Biểu mẫu Thêm/Sửa món ăn (`OwnerMenuItemForm`): Tên, danh mục, giá VND định dạng tiếng Việt, mô tả, URL ảnh kèm live preview, 2 công tắc `available` / `active`, và trình chỉnh sửa danh sách tùy chọn (Options).
   - Hộp thoại Thêm danh mục (`OwnerCategoryDialog`): Nối trực tiếp endpoint `createCategory`.

---

## 2. Danh mục Component & Files Sở Hữu

| Đường dẫn Component | Vai trò | Trạng thái Live / Mock |
| :--- | :--- | :--- |
| `src/components/customer/ItemDetailSheet.tsx` | Khung trượt chi tiết & tùy chọn món cho khách | **LIVE WIRED** (Presentation callback) |
| `src/components/customer/MenuItemPreviewCard.tsx` | Thẻ món ăn trong danh sách thực đơn | **LIVE WIRED** (Hỗ trợ click mở chi tiết) |
| `src/components/customer/MenuPreviewSection.tsx` | Khung hiển thị menu, tìm kiếm tiếng Việt, lọc danh mục | **LIVE WIRED** (Lọc inactive, unaccent search) |
| `src/components/customer/CustomerQRContainer.tsx` | Container điều phối QR, Menu API R03, Table verify | **LIVE WIRED** (Kết nối `fetchPublicMenu`) |
| `src/components/owner/menu/OwnerMenuView.tsx` | Giao diện chính Tab Thực đơn Chủ quán (Split 65/35) | **LIVE WIRED** (Kết nối R16 `fetchOwnerMenu`, R15 patch) |
| `src/components/owner/menu/OwnerMenuItemForm.tsx` | Biểu mẫu Thêm/Sửa món ăn kèm live preview ảnh | **LIVE WIRED** (Kết nối `createMenuItem`, `updateMenuItem`) |
| `src/components/owner/menu/OwnerCategoryDialog.tsx` | Hộp thoại thêm danh mục mới | **LIVE WIRED** (Kết nối `createCategory`, fallback preview) |
| `src/components/owner/OwnerShell.tsx` | Tích hợp OwnerMenuView vào Tab 3 của Shell | **LIVE WIRED** (Đã thay thế placeholder cũ) |
| `src/lib/mocks/ui-preview.ts` | Bổ sung `MOCK_OWNER_MENU_ITEMS`, `MOCK_OWNER_CATEGORIES` | **DEV FIXTURES** |
| `tests/ui/menu-flow.test.ts` | 11 unit tests kiểm tra unaccent search, VND preview, contracts | **PASS (11/11)** |

---

## 3. Ánh xạ Contract Dữ liệu (Codex P2-C02 vs Gemini UI)

| Trường Contract (Codex) | Kiểu dữ liệu | Biểu diễn trên UI Gemini | Ghi chú & Ràng buộc |
| :--- | :--- | :--- | :--- |
| `item.id` | `string (UUID)` | Key & payload ID | Giữ nguyên UUID thật |
| `item.name` | `string (1-120 chars)` | Tiêu đề thẻ & Input form | Bắt buộc, không để trống |
| `item.categoryId` | `string (UUID)` | Select dropdown | Ánh xạ danh mục cùng store |
| `item.priceVnd` | `MoneyVnd (Safe Integer >= 0)` | Định dạng `vi-VN` (vd: `35.000 đ`) | Số nguyên VND, không lưu float |
| `item.description` | `string \| null` | Mô tả ngắn / Textarea | Tùy chọn, tối đa 500-1000 ký tự |
| `item.imageUrl` | `string (HTTPS) \| null` | `Image` Next.js hoặc placeholder | URL Unsplash HTTPS; live preview |
| `item.available` | `boolean` | Badge "Hết hàng" / Công tắc nhanh | `false` khóa chọn món trên customer |
| `item.active` | `boolean` | Badge "Đã ẩn" / Công tắc hiển thị | `false` ẩn hoàn toàn trên customer |
| `item.options` | `MenuOption[]` | Danh sách checkbox chọn thêm | Tùy chọn cộng dồn (`priceDeltaVnd`) |
| `item.updatedAt` | `IsoTimestamp` | Khóa CAS `expectedUpdatedAt` | Gửi nguyên vẹn trong mutation PATCH |

### Khẳng định ranh giới nghiệp vụ:
1. **Item Selection ≠ Cart:** Khi khách bấm "Chọn món", `ItemDetailSheet` chỉ phát event `onSelectItem(payload)` để container cập nhật giá trị tạm tính trên giao diện preview. Gemini tuyệt đối KHÔNG tự tạo cart store, không gửi request tạo order, không giả mạo thanh toán.
2. **Owner Save ≠ Success:** Nút lưu hiển thị trạng thái `isSubmitting` với spinner. Toast thành công chỉ xuất hiện SAU KHI server phản hồi HTTP 200/201. Nếu server báo lỗi (400, 409 CAS mismatch, 422, 500), UI hiển thị alert lỗi chi tiết ngay trên form và giữ nguyên dữ liệu nhập để chủ quán điều chỉnh.

---

## 4. Bảng Trạng thái Giao diện & Tiếng Việt Chuẩn Hóa

| Tình huống / Trạng thái | Biểu diễn Giao diện | Hành vi Nút / CTA |
| :--- | :--- | :--- |
| **Bàn chưa xác thực (Unverified)** | Menu mở xem bình thường, có dải hướng dẫn | Nút "Chọn món" bị khóa, hiển thị "Cần xác nhận bàn để chọn món" |
| **Món hết hàng (`available=false`)** | Thẻ mờ nhẹ, badge đỏ "Hết hàng" trên ảnh | Nút chọn món disabled, text "Hết hàng", aria-disabled="true" |
| **Món bị ẩn (`active=false`)** | Ẩn hoàn toàn khỏi menu khách hàng | Không xuất hiện; trên Owner hiển thị badge "Đã ẩn" |
| **Không tìm thấy món (Search)** | Card rỗng hình ly cà phê, thông báo rõ ràng | Nút "Xóa bộ lọc tìm kiếm" đưa về toàn bộ menu |
| **Lỗi tải menu (Error)** | Hộp cảnh báo màu đỏ nhạt, nêu lý do | Nút "Thử tải lại" (`onRetry`) gọi lại API R03/R16 |
| **Lỗi cập nhật món (409 CAS)** | Alert đỏ "Dữ liệu món đã được sửa bởi phiên khác" | Giữ nguyên form, cho phép tải lại hoặc chỉnh sửa tiếp |

---

## 5. Hướng dẫn Chạy Thử & Kiểm Thử Môi trường

1. **Khách hàng Quét QR:**
   - URL mang đi: `/q/COUNTER_TAKEAWAY_CODE`
   - URL tại bàn: `/q/BAN01_DEMO_CODE` (Mã phiên demo: `8821` hoặc `MOC88`)
   - Thử nghiệm tìm kiếm không dấu: Gõ "ca phe", "tra", "banh" vào ô tìm kiếm.
   - Thử nghiệm xem chi tiết: Bấm vào món "Cà phê muối xứ Huế", chọn thêm kem muối (+8.000 đ), số lượng 2 -> Tạm tính 86.000 đ.
2. **Dashboard Chủ quán:**
   - URL: `/dashboard` -> Chuyển sang Tab "Thực đơn".
   - Bấm "Thêm món" -> Nhập tên món, chọn danh mục, gõ giá "45.000", thêm tùy chọn -> Bấm "Thêm vào thực đơn".
   - Bấm nút "Còn hàng / Hết hàng" trực tiếp trên danh sách món để kiểm tra phản hồi nhanh.
   - Thử nghiệm responsive: Co nhỏ trình duyệt về kích thước 375px (iPhone SE) để kiểm tra giao diện 1 cột và Sheet biên tập.

---

## 6. Điểm Phối hợp & Nghiệm thu Tích hợp Codex (P2-C02 Integration Hand-off)

Toàn bộ các yêu cầu từ `docs/integration/P2_C02_MENU_HANDOFF.md` đã được Gemini xử lý và nghiệm thu:
1. **Chấp nhận giá 0 đ (`priceVnd = 0`):** `OwnerMenuItemForm` chấp nhận các món giá 0 VND (món tặng kèm, nước tráng miệng) theo chuẩn safe integer `>= 0`.
2. **Kiểm tra URL ảnh chặt chẽ:** Chỉ chấp nhận giao thức HTTPS với hostname `images.unsplash.com` và độ dài `<= 2048`, báo lỗi ngay tại client.
3. **Idempotency qua RequestId:** `pendingRequestIdRef` giữ nguyên cùng 1 `requestId` khi retry/timeout và chỉ xóa khi thành công hoặc người dùng sửa dữ liệu.
4. **Giữ nguyên độ chính xác Microsecond:** Trường `expectedUpdatedAt` được truyền nguyên chuỗi ISO timestamp từ server trong mutation PATCH R16, không qua `Date.toISOString()` làm mất microsecond.
5. **Không optimistic toggle sớm:** Công tắc nhanh trong `OwnerMenuView` hiển thị `Loader2` spinner và chỉ đổi trạng thái khi server trả 200 OK. Khi gặp 409 CAS conflict, hệ thống tự động tải lại thực đơn mới nhất.
6. **Token CAS cho Danh mục:** Nạp song song `fetchCategories()` cùng `fetchOwnerMenu(true)` để bảo đảm `OwnerMenuCategory` có đầy đủ `updatedAt`.
7. **Đóng kín môi trường Production:** Trong production (`NODE_ENV === 'production'`), tuyệt đối không rơi vào mock data hay giả vờ thành công. Mọi mã lỗi API (400, 409, 422, 429, 500) được phản ánh trực tiếp và danh mục/món ăn bị lỗi nạp sẽ không rò rỉ fixture giả.
