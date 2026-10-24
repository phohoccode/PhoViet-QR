# OWNER HOTFIX 01 — GEMINI UI IMPLEMENTATION & QA REPORT
**Dự án**: QR Ordering Minimal MVP  
**Phạm vi**: Frontend / UI / UX trên Next.js App Router + shadcn/ui + Tailwind CSS  
**Thời gian hoàn thành**: 2026-10-24  
**Agent**: Gemini (Frontend/UI/UX Lead)  
**Contract tham chiếu**: [OWNER_HF01_CONTRACT.md](file:///e:/Project/QR-Ordering-PV/docs/contracts/OWNER_HF01_CONTRACT.md)

---

## 1. Tóm tắt kết quả triển khai

Gemini đã thực hiện đầy đủ 4 giao diện nghiệp vụ theo đúng yêu cầu mà không tạo layout mới, không phá vỡ phong cách **Minimal Emerald** (primary `#35977D`, nền trắng/xám nhạt `#F7F8F7`, bo góc lớn `rounded-2xl`, spacing thoáng, pill tabs, micro-interactions tinh gọn, responsive 390px - 1440px):

1. **Giao diện A — Xóa bàn trống**:
   - Tích hợp lựa chọn **Xóa bàn** (icon `Trash2`) vào menu thao tác `⋮` của mỗi card bàn.
   - Bàn đang có khách (`session !== null`, dù `0 món` hoặc `Chờ thanh toán`) bị **disabled** kèm chú thích rõ ràng; không cho phép xóa bàn đang hoạt động.
   - Bàn trống đủ điều kiện: bấm xóa mở **AlertDialog** xác nhận với nhãn bàn cụ thể và cảnh báo QR của bàn sẽ ngừng hoạt động nhưng không làm mất lịch sử đơn hàng cũ.
   - Xử lý trạng thái deleting (spinner `Loader2`, disabled nút), Sonner floating toast thông báo thành công, và xử lý mã lỗi 409 `TABLE_IN_USE` ("Bàn đang được sử dụng hoặc còn giao dịch chưa hoàn tất"), giữ nguyên card và refetch lại trạng thái từ máy chủ.

2. **Giao diện B — Xóa danh mục**:
   - Bổ sung thao tác xóa trực tiếp trên từng pill danh mục trong dải lọc (ngoại trừ chip "Tất cả danh mục").
   - Bấm xóa mở **AlertDialog** xác nhận.
   - Nếu danh mục còn món (`itemCount > 0`): hiển thị thông báo hướng dẫn *"Danh mục vẫn chứa món. Hãy chuyển hoặc xóa các món trước."* và nút "Đã hiểu".
   - Nếu danh mục rỗng (0 món): hiển thị xác nhận xóa, nút xóa màu đỏ, spinner khi đang xóa. Khi xóa thành công: cập nhật danh sách danh mục, tự động reset filter về "Tất cả danh mục" nếu danh mục đang chọn vừa bị xóa.
   - Empty state rõ ràng khi quán chưa có danh mục nào kèm nút "Thêm danh mục".

3. **Giao diện C — Xóa món ăn**:
   - Thêm nút xóa (`Trash2`) cạnh nút "Sửa" trên từng card món ăn tab Menu với kích thước và khoảng cách cân đối, chống chạm nhầm.
   - Bấm xóa mở **AlertDialog** xác nhận: *"Xóa món “{tên món}”?"*, nêu rõ món sẽ biến mất khỏi menu khách quét QR nhưng giữ nguyên lịch sử đơn đã đặt và doanh thu.
   - Gợi ý phân biệt rõ ràng giữa việc Ẩn món / Chuyển sang Hết hàng với Xóa hẳn món.
   - Xóa thành công: gỡ card món khỏi danh sách đang bán, cập nhật số lượng món và hiển thị thông báo toast.

4. **Giao diện D — Upload ảnh món trực tiếp lên Supabase**:
   - Gỡ bỏ hoàn toàn ô nhập URL HTTPS giới hạn Unsplash (`images.unsplash.com`).
   - Thay thế bằng khung **Image Upload** hiện đại:
     - Nút CTA *"Chọn ảnh từ thiết bị"* kèm icon tải ảnh lên, hỗ trợ kéo thả (drag & drop) trên desktop và duyệt file trên mobile/tablet.
     - Kiểm tra client-side: chỉ chấp nhận định dạng JPG, PNG, WebP với dung lượng tối đa 5 MB (5 MiB).
     - Xem trước thực tế bằng `URL.createObjectURL(file)`, tự động revoke object URL khi thay/bỏ ảnh hoặc unmount form để triệt tiêu memory leak.
     - Hiển thị tên file và dung lượng định dạng chuẩn (KB/MB), cặp nút *"Thay ảnh"* và *"Bỏ ảnh"*.
     - Máy trạng thái upload trung thực: `idle` → `validating` → `uploading` → `uploaded` / `failed` (kèm nút thử lại).
     - Vô hiệu hóa nút Lưu khi ảnh đang trong quá trình upload (`uploading` hoặc `validating`).
     - Khi chỉnh sửa món đã có ảnh: giữ nguyên preview ảnh hiện có, cho phép giữ nguyên hoặc tải ảnh mới thay thế.

---

## 2. Danh sách các tệp thay đổi

| Tệp | Thay đổi chính |
| --- | --- |
| [api-client.ts](file:///e:/Project/QR-Ordering-PV/src/features/owner/api-client.ts) | Bổ sung `deleteOwnerTable`, `deleteCategory`, `deleteMenuItem`, và `uploadMenuItemImage` (multipart POST `/api/owner/menu/upload`) unwrap envelope `{ data }`. |
| [TableManagementView.tsx](file:///e:/Project/QR-Ordering-PV/src/components/owner/tables/TableManagementView.tsx) | Thêm tùy chọn Xóa bàn vào menu `⋮` của card bàn, kiểm soát trạng thái disabled khi bàn có khách/thanh toán, AlertDialog xác nhận xóa, Sonner toast nổi và xử lý lỗi 409 `TABLE_IN_USE`. |
| [OwnerMenuView.tsx](file:///e:/Project/QR-Ordering-PV/src/components/owner/menu/OwnerMenuView.tsx) | Thêm nút xóa danh mục trên category pills, nút xóa món cạnh nút Sửa trên menu card, AlertDialog cho cả 2 thao tác, empty state khi hết danh mục, truyền prop `onUploadImage` xuống form. |
| [OwnerMenuItemForm.tsx](file:///e:/Project/QR-Ordering-PV/src/components/owner/menu/OwnerMenuItemForm.tsx) | Thay thế ô nhập URL Unsplash bằng Image Upload component: Drag & Drop, file picker JPG/PNG/WebP ≤ 5 MB, Object URL preview, revoke cleanup, state machine, hiển thị tên/dung lượng và nút Thay/Bỏ ảnh. |
| [owner-hotfix01.test.ts](file:///e:/Project/QR-Ordering-PV/tests/ui/owner/owner-hotfix01.test.ts) | Bộ 11 unit & acceptance UI tests bao phủ toàn diện 4 giao diện hotfix. |

---

## 3. Luồng trải nghiệm người dùng Trước & Sau

### 3.1. Tab Bàn (Xóa bàn trống)
- **Trước**: Menu ⋮ chỉ có *"Đổi tên bàn"*, *"Mã QR bàn"*, *"Ngưng dùng bàn"*. Không có cách nào xóa bàn trống thừa/tạo nhầm khỏi hệ thống.
- **Sau**:
  - Bàn trống: Menu ⋮ hiển thị *"Xóa bàn"* (chữ đỏ). Bấm vào mở AlertDialog xác nhận rõ ràng → Xác nhận → Server xử lý xóa mềm (`archived_at`), thẻ bàn biến mất, toast Sonner báo thành công.
  - Bàn có khách (kể cả 0 món) hoặc chờ thanh toán: Tùy chọn *"Xóa bàn"* bị disabled với màu xám và tooltip giải thích lý do không thể xóa.

### 3.2. Tab Menu (Xóa danh mục)
- **Trước**: Chỉ có nút *"Thêm danh mục"*, không có thao tác xóa danh mục rỗng.
- **Sau**:
  - Dải pill danh mục hiển thị nút thùng rác nhỏ tinh tế trên mỗi danh mục cụ thể (chip *"Tất cả danh mục"* không có nút xóa).
  - Danh mục còn món: Bấm xóa mở hộp thoại báo *"Danh mục vẫn chứa món. Hãy chuyển hoặc xóa các món trước."* kèm nút *"Đã hiểu"*.
  - Danh mục rỗng: Bấm xóa mở AlertDialog xác nhận → Xóa thành công → Danh mục biến mất, bộ lọc tự chuyển về *"Tất cả danh mục"* nếu đang xem danh mục đó.

### 3.3. Tab Menu (Xóa món ăn)
- **Trước**: Card món chỉ có nút *"Sửa"* và toggle *"Còn hàng"*. Không có nút xóa món.
- **Sau**:
  - Nút *"Xóa"* icon `Trash2` đặt cạnh nút *"Sửa"*, padding và hit area chuẩn mobile (h-8 w-8).
  - Bấm xóa mở AlertDialog giải thích món sẽ bị gỡ khỏi thực đơn khách nhưng giữ lịch sử đơn hàng → Xóa thành công → Card biến mất, cập nhật số lượng món và toast Sonner.

### 3.4. Dialog Món ăn (Upload ảnh từ thiết bị)
- **Trước**: Ô nhập URL HTTPS bắt buộc từ `images.unsplash.com`. Chủ quán không thể đưa ảnh thật của quán chụp từ điện thoại lên.
- **Sau**:
  - Khung tải ảnh trực quan *"Chọn ảnh từ thiết bị"*, kéo thả hoặc chạm để chọn ảnh từ thư viện/camera.
  - Hiện ảnh xem trước ngay lập tức với tỉ lệ 1:1, tên file, kích thước file.
  - Nút *"Thay ảnh"* và *"Bỏ ảnh"* linh hoạt.
  - Nút *"Lưu thay đổi / Thêm vào thực đơn"* tự động khóa khi ảnh đang tải lên, đảm bảo dữ liệu toàn vẹn.

---

## 4. Kiểm thử giao diện & Bảng nghiệm thu

### 4.1. Kết quả kiểm thử tự động (Automated UI Test Suite)
Chạy lệnh kiểm thử toàn diện:
- `npm run typecheck`: **PASS** (0 lỗi TypeScript)
- `npm run lint`: **PASS** (0 errors, 0 warnings với `eslint . --max-warnings=0`)
- `npm run build`: **PASS** (Biên dịch thành công toàn bộ App Router client và server)
- `npx vitest run --config tests/ui/vitest.config.mts`: **PASS 26/26 test files (306/306 tests)**

```
 Test Files  26 passed (26)
      Tests  306 passed (306)
   Duration  2.27s
```

### 4.2. Bảng ma trận nghiệm thu chi tiết

| Hạng mục kiểm tra | Trạng thái UI | Trạng thái Backend | Ghi chú nghiệm thu |
| --- | :---: | :---: | --- |
| Bàn thực sự trống có nút Xóa bàn + dialog xác nhận | **PASS** | **READY** | Hỗ trợ DELETE `/api/owner/tables/:id` |
| Bàn đang mở (kể cả 0 món) không xóa được | **PASS** | **READY** | Disabled trên UI, server trả 409 `TABLE_IN_USE` |
| Lỗi 409 `TABLE_IN_USE` hiện thông báo rõ ràng, không xóa lạc quan | **PASS** | **READY** | Hiển thị rõ, refetch lại danh sách bàn |
| Chip "Tất cả danh mục" không có nút xóa | **PASS** | N/A | Đúng thiết kế filter bar |
| Danh mục còn món chặn xóa và hiện hướng dẫn | **PASS** | **READY** | UI chặn và server trả 409 `CATEGORY_NOT_EMPTY` |
| Danh mục rỗng xóa được, reset filter về Tất cả | **PASS** | **READY** | Cập nhật filter state mượt mà |
| Empty state khi không còn danh mục | **PASS** | N/A | Có thông báo và giữ nút Thêm danh mục |
| Nút Xóa món trong card Menu | **PASS** | **READY** | Hỗ trợ DELETE `/api/owner/menu/:id` |
| AlertDialog xóa món giải thích giữ lịch sử đơn | **PASS** | N/A | Đúng yêu cầu nghiệp vụ POS |
| Bỏ ô nhập URL Unsplash, thay bằng khung upload thiết bị | **PASS** | **READY** | POST `/api/owner/menu/upload` multipart |
| Kiểm tra client-side JPG/PNG/WebP ≤ 5 MB | **PASS** | **READY** | Báo lỗi ngay không gửi request sai |
| Preview object URL thực tế, revoke cleanup không leak | **PASS** | N/A | Tự động dọn dẹp qua `cleanupPreview` |
| Sửa món giữ ảnh cũ, cho phép Thay ảnh hoặc Bỏ ảnh | **PASS** | **READY** | Hiển thị ảnh cũ từ `imageUrl`, không bắt chọn lại |
| Khóa nút Lưu khi upload đang diễn ra | **PASS** | N/A | Chống race condition |
| Responsive trên màn hình 390px, 768px, 1280px+ | **PASS** | N/A | Không bị tràn, không clipping, touch target ≥ 32px |

---

## 5. Kết luận
Toàn bộ frontend của **OWNER HOTFIX 01** đã hoàn thành đạt chuẩn chất lượng cao nhất, đồng bộ hoàn hảo với phong cách **Minimal Emerald**, hoàn thành toàn bộ 306/306 bài kiểm thử UI và tương thích 100% với contract backend do Codex bàn giao.
