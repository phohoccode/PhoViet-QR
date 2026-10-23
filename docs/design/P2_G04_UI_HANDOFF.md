# P2-G04 — OWNER TABLES & QR MANAGEMENT UI HANDOFF

> **Tài liệu bàn giao UI/UX (Frontend Presentation & Lifecycle Integration)**  
> **Nhiệm vụ:** P2-G04 — Owner Tables & QR Management UI: Create, Preview, Download, Print.  
> **Tác giả:** Gemini (UI/UX Frontend Specialist).  
> **Dựa trên:** Ảnh tham chiếu `assets/ui-reference.png`, Design System Minimal Emerald POS, và Contract Addendum P2-C04 (`src/types/contracts/table-qr.ts`, `docs/integration/P2_C04_CONTRACT_CHANGE_REQUEST.md`).

---

## 1. Danh sách Components, Paths & Props

| Component | Đường dẫn tệp | Vai trò & Điểm nổi bật | Props chính |
|---|---|---|---|
| `TableManagementView` | `src/components/owner/tables/TableManagementView.tsx` | View chính Tab Bàn trong Owner Dashboard: Lưới bàn, bộ lọc, đếm trạng thái, hành động mở phiên, xem/in QR, bật/tắt bàn | `tables: TableSummary[]`, `qrCodes: QRCodeView[]`, `storeName?: string`, `isLoading?: boolean`, `errorMessage?: string \| null`, `onRefresh?: () => void`, `onTableCreated?`, `onTableUpdated?` |
| `AddEditTableDialog` | `src/components/owner/tables/AddEditTableDialog.tsx` | Modal responsive (Desktop Dialog / Mobile Sheet) thêm hoặc đổi tên bàn; xử lý inline conflict `TABLE_LABEL_CONFLICT` | `isOpen: boolean`, `mode: 'create' \| 'edit'`, `tableToEdit?: TableSummary \| null`, `onClose: () => void`, `onSuccess: (table, qrPath?) => void`, `onViewQr?: (table) => void` |
| `TableQrModal` | `src/components/owner/tables/TableQrModal.tsx` | Dialog xem QR bàn: tải SVG vector, tải PNG 1024px, in phiếu A6/A7, xác nhận rotate đổi mã QR an toàn | `table: TableSummary`, `qrCode?: QRCodeView \| null`, `storeName?: string`, `isOpen: boolean`, `onClose: () => void`, `onQrRotated?: (newQr) => void` |
| `TakeawayQrCard` | `src/components/owner/settings/TakeawayQrCard.tsx` | Card quản lý QR Mang đi tại quầy trong Tab Cài đặt: Preview QR, tải SVG/PNG, in phiếu quầy, xác nhận đổi mã | `storeName?: string`, `initialQrCode?: QRCodeView \| null`, `onQrUpdated?: (qr) => void` |
| `PrintQrVoucher` | `src/components/owner/qr/PrintQrVoucher.tsx` | Phiếu in chuẩn A6/A7 cách ly qua `@media print` (`#qr-printable-area`), mực đen nền trắng, quiet zone chuẩn | `type: 'table' \| 'takeaway'`, `storeName: string`, `title: string`, `publicUrl: string`, `subtitle?: string` |
| `QrCodeView` | `src/components/owner/qr/QrCodeView.tsx` | Component SVG hiển thị QR Code client-side chuẩn ISO/IEC 18004 không cần thư viện ngoài | `value: string`, `size?: number`, `margin?: number`, `fgColor?: string`, `bgColor?: string`, `alt?: string` |
| `qr-code.ts` | `src/lib/qr/qr-code.ts` | Module pure TypeScript sinh ma trận QR (Byte mode, Version 1–6, ECC M/L), xuất SVG và render Canvas sang PNG | `generateQrMatrix(text)`, `matrixToSvg(matrix, opts)`, `downloadSvgString()`, `downloadPngFromMatrix()`, `sanitizeQrFilename()` |

---

## 2. Điểm thiết kế đã áp dụng (Minimal Emerald POS)

- **Màu sắc & Tokens:**
  - Nền tổng thể: `#F5F6F5` (Xám nhạt tối giản).
  - Khung Panel trắng: `#FFFFFF`, viền `#E9ECEA`, bo góc lớn `rounded-[28px]`.
  - Brand accents: `#35977D` (Emerald sáng viền/icon), `#1D725E` (Emerald đậm cho nút CTA chữ trắng đạt WCAG AA 5.2:1).
  - Trạng thái bàn tách bạch:
    - Bàn trống: Nền xám mềm `#F7F8F7`, text `#727B77`.
    - Có khách: Nền ngọc nhạt `#E8F4F0`, viền `#35977D`, text `#1D725E`.
    - Chờ tính tiền: Nền cam nhạt `#FEF6EE`, viền `#F9DBAF`, text `#8A4D00`.
    - Ngưng sử dụng: Nền `#F1F3F2`, opacity 75%, text `#A0A8A5`.
- **Responsive Layout:**
  - Mobile (375px–430px): 1 đến 2 cột linh hoạt, chạm dễ dàng (touch targets $\ge 44\text{px}$).
  - Tablet (768px): 3 cột thoáng đãng.
  - Desktop (1024px–1440px): 4 đến 6 cột tối ưu diện tích quan sát.
- **Bảo mật URL QR công khai:**
  - URL mã QR hoàn toàn sạch: `https://[domain]/q/[code]` (hoặc relative `/q/[code]`).
  - **Tuyệt đối không chứa:** mã phiên bàn (`sessionCode`), token đăng nhập owner, số tài khoản ngân hàng, mã thanh toán hay giá cố định.

---

## 3. Mapping DTO & Kết nối API Adapter (Codex P2-C04)

| Thao tác người dùng | API Endpoint / Client Method | Request Payload | Response Mapping | Trạng thái |
|---|---|---|---|---|
| Tải danh sách bàn | `GET /api/owner/tables` (`fetchOwnerTables`) | None (query `tableId` optional) | `OwnerTableList { tables: OwnerTable[], detail }` | **LIVE** |
| Tải danh sách QR | `GET /api/owner/qr-codes` (`fetchOwnerQrCodes`) | None | `OwnerQrCode[]` | **LIVE** |
| Mở phiên bàn R12 | `POST /api/owner/tables/:id/sessions` | `{ requestId: UUID }` | `201 OwnerSessionOpenedView` (Private modal delivery) | **LIVE** |
| Thêm bàn mới | `POST /api/owner/tables` (`createOwnerTable`) | `{ label, requestId }` | `201 OwnerTable` kèm `qr` | **LIVE** |
| Sửa nhãn bàn | `PATCH /api/owner/tables/:id` (`updateOwnerTable`) | `{ label, expectedUpdatedAt, requestId }` | `200 OwnerTable` | **LIVE** |
| Bật / tắt bàn | `PATCH /api/owner/tables/:id` (`updateOwnerTable`) | `{ active: boolean, expectedUpdatedAt, requestId }` | `200 OwnerTable` | **LIVE** |
| Tạo QR Mang đi | `POST /api/owner/qr-codes` (`writeOwnerQrCode`) | `{ action: 'create', type: 'takeaway', tableId: null, requestId }` | `201 OwnerQrCode` | **LIVE** |
| Đổi mã QR (Rotate) | `POST /api/owner/qr-codes/:id/rotate` (`rotateOwnerQrCode`) | `{ expectedUpdatedAt, confirm: true, requestId }` | `201 OwnerQrCode` | **LIVE** |

---

## 4. Hướng dẫn Xem trước, Tải & In QR

### A. Tải mã QR (SVG & PNG)
- **SVG Vector:** Bấm **"Tải SVG"** trong modal QR của bàn hoặc card mang đi. Xuất file vector độ nét vô cực, in ấn khổ lớn không vỡ hình. Tên file tự động chuẩn hóa tiếng Việt: ví dụ `QR_Ban_05.svg`, `QR_Mang_Di_Tai_Quay.svg`.
- **PNG 1024px:** Bấm **"Tải PNG"** để xuất file raster độ phân giải cao 1024x1024px với quiet zone 4 modules đạt chuẩn ISO.

### B. In phiếu QR (A6 / A7 Print Stylesheet)
- Bấm **"In phiếu QR"** hoặc **"In phiếu quầy"**. Hệ thống kích hoạt print stylesheet `@media print`.
- Vùng `#qr-printable-area` được cô lập:
  - Ẩn 100% header, footer, sidebar, pills navigation và các nút bấm màn hình.
  - Chỉ in duy nhất khung phiếu vuông vức khổ A6/A7:
    - **Phiếu Bàn:** Tiêu đề tên quán, Nhãn bàn (VD: "BÀN 05"), mã QR đen trắng sắc nét, hướng dẫn *"Quét mã để xem menu và gọi món"*, dòng nhắc *"Chủ quán sẽ mở phiên bàn và cung cấp mã phiên cho quý khách"*, và link dự phòng.
    - **Phiếu Quầy:** Tiêu đề tên quán, Nhãn "MUA MANG ĐI", mã QR quầy, hướng dẫn *"Quét mã • Chọn món • Thanh toán • Nhận số thứ tự"*, và link dự phòng.

---

## 5. DEPENDENCY_REQUEST (Thư viện QR Code)

> [!NOTE]
> **Hiện trạng:** Để tuân thủ quy tắc không tự ý sửa `package.json`, Gemini đã cài đặt một module tạo mã QR pure TypeScript `src/lib/qr/qr-code.ts` theo chuẩn ISO/IEC 18004. Module này hoạt động 100% độc lập, không phụ thuộc thư viện ngoài, xuất ra SVG và PNG scannable thật.
>
> **Đề xuất (Tùy chọn):** Nếu đội ngũ muốn dùng thư viện chuẩn của hệ sinh thái npm trong các Phase sau:
> - Package đề xuất: `qrcode.react` (hoặc `qrcode`).
> - Lệnh cài đặt: `npm install qrcode.react @types/qrcode`.

---

## 6. Xử lý Lỗi & Mã HTTP Server

| Mã lỗi HTTP | Code / Field | Phản hồi giao diện người dùng (UX) |
|---|---|---|
| **400** | `VALIDATION_ERROR` (field `label`) / `TABLE_LABEL_CONFLICT` | Hiển thị thông báo inline màu đỏ dưới trường nhập tên: *"Tên bàn này đã tồn tại trong quán. Vui lòng chọn tên khác."*, giữ nguyên input của chủ quán. |
| **409** | `INVALID_STATE_TRANSITION` (field `activeSession`) | Báo lỗi rõ ràng: *"Không thể đổi mã QR khi bàn đang có phiên hoạt động. Vui lòng đóng hoặc kết thúc phiên bàn trước."*, chặn thao tác rotate. |
| **409** | `INVALID_STATE_TRANSITION` (field `expectedUpdatedAt`) | Thông báo dữ liệu bàn đã được cập nhật từ thiết bị khác, tự động refetch lại danh sách bàn mới nhất. |
| **401** | `UNAUTHORIZED` | Chuyển hướng hoặc yêu cầu đăng nhập lại qua Auth guard đã có. |
| **403** | `FORBIDDEN` | Hiển thị cảnh báo không có quyền quản lý bàn của quán này. |
| **429** | `RATE_LIMITED` | Giữ nguyên form, yêu cầu chờ ít giây trước khi thử lại mà không reset requestId. |
| **500 / Network Timeout** | `INTERNAL_ERROR` / Lỗi mạng | Giữ nguyên dữ liệu form, cảnh báo máy chủ chưa chắc đã nhận được lệnh, tránh người dùng bấm lặp tạo dữ liệu trùng. |

---

## 7. Viewport & Accessibility Checklist

- [x] **Touch Targets:** Tất cả nút hành động (Mở phiên, Chi tiết, Xem QR, Thêm bàn, In, Tải) đều có chiều cao $\ge 40\text{px}$–$44\text{px}$.
- [x] **Focus-Visible:** Viền focus màu `#1D725E` / `#35977D` rõ nét khi điều hướng bằng bàn phím (Tab).
- [x] **Keyboard Navigation:** Hỗ trợ phím Escape và Tab trap trên toàn bộ Dialog và Modal.
- [x] **Semantic Status:** Phối hợp màu sắc, icon (`QrCode`, `KeyRound`, `Power`, `AlertTriangle`) và nhãn chữ tiếng Việt rõ ràng, không dùng màu đơn lẻ để báo trạng thái.
- [x] **Viewports Verified:** 375px (iPhone SE), 430px (iPhone 16 Pro Max), 768px (iPad Mini), 1024px (iPad Pro / Laptop), 1280px–1440px (Desktop Full HD).
