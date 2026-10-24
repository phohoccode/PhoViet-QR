# Báo Cáo Bàn Giao: Phase 5 — Prompt 02 (Gemini)
## Dine-in Billing & Table Lifecycle UI/UX Audit, Integration & Polish

- **Agent thực hiện**: Gemini — Thiết kế UI/UX, component shadcn/ui, Tailwind CSS, interaction và responsive.
- **Phối hợp song song**: Codex (`P5_C02_CODEX_DINEIN_SETTLEMENT_CONCURRENCY_E2E_QA.md` — Codex quản lý database, API, locks, RLS).
- **Trạng thái tổng thể**: **READY** (Hoàn thiện kiểm định UI/UX, 0 lỗi TypeScript, 0 cảnh báo ESLint, 21/21 UI test suites PASS).

---

### 1. Trạng Thái Tổng Thể & Các Màn Hình Đã Rà Soát

| Khu Vực / Màn Hình | Trạng Thái | Mô Tả & Kết Quả Rà Soát |
|---|---|---|
| **Khách hàng: Quét QR & Nhập PIN** (`/q/[code]`) | **READY** | Nhập mã PIN 6 số 1 lần duy nhất cho phiên ăn tại bàn; lưu trữ grant cookie an toàn; không đòi lại PIN khi về lại thực đơn. |
| **Khách hàng: Thực đơn & Gọi thêm món (Add-ons)** | **READY** | Gọi thêm món tạo vé đơn (ticket) độc lập có mã số riêng trong cùng phiên bàn; không copy đè đơn cũ; giỏ hàng tự động khóa khi bàn chuyển sang trạng thái chốt. |
| **Khách hàng: Hóa đơn bàn (Dine-in Session Bill)** | **READY** | Xem toàn bộ các lượt gọi trong cùng phiên bàn; hiển thị snapshot món/giá/option; tổng tiền VND lấy trực tiếp từ API server; hỗ trợ deep link `?view=bill`. |
| **Khách hàng: Tiến độ đơn hàng** (`/order/[id]`) | **READY** | Stepper 4 bước rõ ràng; footer tích hợp nút kép: "Gọi thêm món" và "Xem hóa đơn bàn". |
| **Chủ quán: Quản lý Bàn** (`/dashboard` - Tab Bàn) | **READY** | Lưới thẻ bàn hiển thị trực quan 4 trạng thái (Trống, Có khách, Chờ thanh toán, Ngưng dùng) kết hợp Chữ + Icon + Màu; touch target >= 40px; hiển thị tạm tính VND. |
| **Chủ quán: Hộp thoại Chi tiết & Chốt tiền** | **READY** | Sheet 2 tab pill ("Hóa đơn & Chốt tiền" và "Mã PIN & QR Bàn"); kiểm tra `outstandingOrders > 0` chặn chốt tiền; chốt (`begin_checkout`), hủy chốt (`cancel_checkout`), xác nhận thu tiền (`confirm_received`). |
| **Chủ quán: Xác nhận an toàn thu tiền** | **READY** | Checkbox cam kết bắt buộc `isAcknowledged` ("Tôi xác nhận đã nhận đủ tiền..."); chống double-click; bảo toàn idempotent `requestId` qua các lượt retry. |

---

### 2. Danh Sách File / Component / UI States Đã Cập Nhật

#### A. File & Component Cập Nhật
1. `src/components/customer/bill/useCustomerTableBill.ts`:
   - Bổ sung `useEffect` tự động tải dữ liệu ban đầu khi `enabled=true`.
   - Polling định kỳ có kiểm soát qua `refetchIntervalMs` (tự ngắt khi tab ẩn `document.visibilityState !== 'visible'`).
   - Xử lý mất mạng/offline: giữ nguyên hóa đơn cũ đã nạp kèm cờ `isStale = true` và thông báo *"Chưa cập nhật — Đang hiển thị hóa đơn đã lưu"*.
   - Xử lý mã lỗi HTTP 409 (`BILL_CHANGED`): hiển thị thông báo yêu cầu tải lại hóa đơn.
2. `src/components/customer/bill/TableBillSheet.tsx`:
   - Bổ sung prop `isStale` và banner cảnh báo mất kết nối kèm nút *"Thử lại"*.
   - Khung xương tải (Skeleton Loading) phong phú, không flash "0 đ" trước khi dữ liệu tải xong.
   - Bổ sung thuộc tính tiếp cận `aria-busy={isLoading}`.
   - Chuẩn hóa touch target các nút hành động (tối thiểu 40px - 48px).
3. `src/components/customer/CustomerQRContainer.tsx`:
   - Đọc query param `?view=bill` an toàn từ client để tự động mở Sheet hóa đơn bàn khi chuyển từ màn theo dõi đơn.
   - Truyền cờ `isStale` đồng bộ xuống `TableBillSheet`.
4. `src/components/customer/order/OrderTrackingView.tsx`:
   - Bổ sung biểu tượng `Receipt` từ `lucide-react`.
   - Khi đơn là Dine-in và có mã QR: hiển thị nút kép tại sticky footer: *"Gọi thêm món"* và *"Xem hóa đơn bàn"*, giúp khách kiểm tra hóa đơn tức thì mà không cần thoát ứng dụng.
5. `src/components/owner/tables/TableManagementView.tsx`:
   - Bổ sung icon cho từng badge trạng thái bàn: `Power` (Ngưng dùng), `Clock` (Chờ thanh toán - có hiệu ứng pulse nhẹ), `UtensilsCrossed` (Có khách / Bàn trống).
   - Nâng chiều cao nút chạm trên mobile/tablet từ `h-8` lên `h-9 sm:h-10 min-h-[36px]` kèm shadow nhẹ.
6. `src/components/owner/tables/TableBillSettlementSheet.tsx`:
   - Xử lý lỗi settlement timeout/mạng: ghi nhận thông điệp rõ ràng *"Chưa xác định kết quả thu tiền do kết nối mạng..."*, bảo toàn `settleRequestIdRef` để retry an toàn.
   - Cung cấp nút *"Tải lại"* trực tiếp trên banner lỗi thao tác khi gặp lỗi 409 hoặc xung đột phiên bản.
   - Nâng chiều cao các tab pill và nút đóng để tối ưu thao tác ngón tay.
7. Test suites mới:
   - `tests/ui/customer/p5-g02-dinein-ux-audit.test.ts` (8 bài test kiểm thử toàn diện UX khách hàng).
   - `tests/ui/owner/p5-g02-owner-settlement-concurrency-ux.test.ts` (7 bài test kiểm thử chốt tiền, race condition và chống double-click).

#### B. Bảng So Sánh Trước & Sau (Before / After)

| Tính Năng / Trạng Thái | Trước Khi Audit (Before) | Sau Khi Hoàn Thiện (After) |
|---|---|---|
| **Tải hóa đơn bàn tự động** | Hook chỉ định nghĩa hàm `fetchBill`, cần kích hoạt thủ công | Tự động tải ngay khi mở bàn và polling tiết chế khi tab active |
| **Mất kết nối mạng khi xem bill** | Xóa mất bill cũ và báo lỗi đỏ | Giữ nguyên dữ liệu hóa đơn đã lưu, gắn nhãn vàng "Chưa cập nhật" + nút "Thử lại" |
| **Loading hóa đơn** | Khung skeleton đơn giản, text header có thể hiện 0đ | Skeleton đầy đủ (header, danh sách món, tổng tiền, ghi chú), không flash 0đ |
| **Từ màn theo dõi đơn xem bill** | Khách chỉ có nút "Gọi thêm món khác" quay về menu | Nút kép: "Gọi thêm món" và "Xem hóa đơn bàn" (`?view=bill`) mở trực tiếp sheet |
| **Thẻ bàn chủ quán** | Chỉ hiển thị text badge đơn thuần | Kết hợp Text + Icon + Màu chuẩn Minimal Emerald POS |
| **Touch target nút bàn** | Chiều cao `h-8` (32px), khó bấm trên tablet | Chiều cao `h-9 sm:h-10 min-h-[36px]` dễ thao tác cảm ứng |
| **Timeout khi thu tiền** | Báo lỗi chung chung "Không thể xác nhận thanh toán" | Báo "Chưa xác định kết quả thu tiền do kết nối mạng", giữ nguyên `requestId` để retry |

---

### 3. Customer Flow & Owner Flow Thực Tế

#### A. Luồng Khách Hàng (Customer Flow)
1. **Quét QR & Mở bàn**: Khách quét mã QR tại bàn -> Nhập mã PIN 6 số do quán cung cấp -> Xác thực thành công -> Vào thực đơn.
2. **Đặt món Lượt 1**: Chọn món, thêm tùy chọn (options/ghi chú) -> Gửi đơn -> Nhận vé Ticket #001 -> Chuyển sang màn hình theo dõi đơn.
3. **Gọi thêm món (Add-ons)**: Bấm "Gọi thêm món" -> Quay về menu mà không mất quyền phiên (không đòi lại PIN) -> Đặt món Lượt 2 -> Nhận vé Ticket #002 độc lập.
4. **Xem Hóa đơn bàn**: Bấm "Xem hóa đơn bàn" (tại header hoặc footer màn theo dõi) -> Sheet hóa đơn hiển thị đầy đủ cả 2 lượt vé #001 & #002, chi tiết từng món và tổng tiền chuẩn từ server.
5. **Trạng thái Chốt & Đóng bàn**:
   - Khi quán bấm chốt: Giao diện khách hiển thị banner *"Bàn đang được thanh toán"*, giỏ hàng và nút đặt món bị khóa.
   - Khi quán xác nhận thu tiền: Phiên chuyển sang `closed`, khóa đặt món vĩnh viễn, khách xem được hóa đơn đã thanh toán.

#### B. Luồng Chủ Quán (Owner Flow)
1. **Theo dõi Tab Bàn**: Chủ quán theo dõi trạng thái các bàn qua grid thẻ bàn (Trống / Có khách / Chờ thanh toán / Ngưng dùng).
2. **Xem chi tiết bàn**: Bấm "Chi tiết" tại bàn có khách -> Mở sheet với 2 tab "Hóa đơn & Chốt tiền" và "Mã PIN & QR Bàn".
3. **Kiểm tra món đang làm**: Nếu còn đơn chưa hoàn tất (`outstandingOrders > 0`), nút chốt bị khóa kèm nhãn *"Chưa thể chốt (còn đơn chưa hoàn tất)"* và liên kết sang tab Đơn hàng.
4. **Bắt đầu chốt (`begin_checkout`)**: Khi các đơn đã phục vụ xong -> Bấm *"Chốt hóa đơn (Khóa gọi thêm)"* -> Khách bị khóa gọi thêm.
5. **Hủy chốt nếu cần (`cancel_checkout`)**: Nếu khách muốn gọi thêm -> Bấm *"Tiếp tục nhận món / Hủy chốt"* -> Phiên quay lại `open`.
6. **Xác nhận thu tiền (`confirm_received`)**: Chọn hình thức (Tiền mặt / Chuyển khoản) -> Bấm *"Xác nhận đã thu..."* -> Dialog cam kết hiện ra -> Chủ quán tích chọn `[x] Tôi xác nhận đã nhận đủ tiền...` -> Bấm xác nhận -> Đóng phiên thành công.

---

### 4. Bảng Tra Cứu UI Action ↔ API & Mã Lỗi Người Dùng

| UI Action | API Endpoint & Method | Input Payloads | Trạng Thái Loading / Success | Xử Lý Lỗi & Thông Báo Người Dùng |
|---|---|---|---|---|
| **Xem hóa đơn khách** | `GET /api/public/table-sessions/bill?qrCode=...` | Query `qrCode` | `isLoading=true` -> Render Skeleton -> Render `TableBillView` | • 404/501: "Tính năng đang được hoàn thiện"<br>• 410: "Phiên bàn đã kết thúc"<br>• 403: "Vui lòng quét QR và nhập PIN"<br>• Mạng: "Mất kết nối. Đang hiển thị hóa đơn đã lưu" (`isStale`) |
| **Xem hóa đơn chủ quán** | `GET /api/owner/table-sessions/:id/bill` | URL param `id` (sessionId) | `isLoadingBill=true` -> Spinner -> Hiển thị danh sách vé & tổng tiền | • 404: "Không tìm thấy phiên bàn"<br>• 403: "Không có quyền truy cập"<br>• Mạng: "Lỗi tải lại hóa đơn" |
| **Bắt đầu chốt bàn** | `POST /api/owner/table-sessions/:id/settle` | `action: "begin_checkout"`, `expectedVersion`, `expectedBillVersion`, `requestId` | `isSubmittingCheckout=true` -> Button loading -> Cập nhật `checkout_pending` | • 409: "Hóa đơn đã thay đổi từ lượt gọi món mới. Vui lòng tải lại"<br>• 400: "Không thể bắt đầu chốt" |
| **Hủy chốt bàn** | `POST /api/owner/table-sessions/:id/settle` | `action: "cancel_checkout"`, `expectedVersion`, `requestId` | `isSubmittingCancel=true` -> Button loading -> Cập nhật `open` | • 409: "Phiên bàn đã thay đổi"<br>• Mạng: "Không thể hủy chốt. Vui lòng thử lại" |
| **Xác nhận đã thu tiền** | `POST /api/owner/table-sessions/:id/settle` | `action: "confirm_received"`, `expectedVersion`, `expectedBillVersion`, `paymentMethod`, `receivedConfirmed: true`, `requestId` | `isSubmittingSettle=true` -> Spinner -> Badge "Đã thanh toán", đóng bàn | • 409: "Hóa đơn đã thay đổi hoặc đã được thanh toán bởi nhân viên khác"<br>• 400 (OUTSTANDING): "Còn món đang làm chưa hoàn tất phục vụ"<br>• Timeout/Mạng: "Chưa xác định kết quả thu tiền. Vui lòng tải lại hoặc thử lại" (giữ nguyên `requestId`) |

---

### 5. Kết Quả Kiểm Tra Concurrency, Race Condition & Duplicate Click

| Trường Hợp Kiểm Thử | Kỳ Vọng Kỹ Thuật & Trải Nghiệm | Kết Quả Thực Tế | Ghi Chú |
|---|---|---|---|
| **Khách gửi đơn đúng lúc quán chốt** | Server xử lý CAS/admission lock; nếu rejected thì giỏ hàng được giữ nguyên kèm giải thích bàn đang thanh toán | **PASS** | `PreCheckoutReview.tsx` và `CartSheet.tsx` khóa nút và báo rõ ràng |
| **Stale `billVersion` (409 Conflict)** | Giao diện phát hiện version mismatch, không dùng tổng cũ để chốt, hiển thị banner yêu cầu tải lại | **PASS** | Test case 4 trong `p5-g02-owner-settlement` xác minh chuẩn xác |
| **Chủ quán bấm nhanh 2 lần (Double-click)** | Vô hiệu hóa nút ngay tại click đầu tiên (`isSubmittingSettle = true`), không phát duplicate HTTP request | **PASS** | Test case 2 xác minh requestCount = 1 sau 2 lần click liên tiếp |
| **Lỗi mạng / Timeout khi settle** | Giữ nguyên UUIDv4 `requestId` trong React Ref qua các lượt thử lại; chỉ tạo ID mới khi giao dịch hoàn tất | **PASS** | Test case 3 xác minh `requestId` được bảo toàn xuyên suốt retry |
| **Hai tab chủ quán cùng thao tác chốt** | Tab thứ hai nhận phản hồi 409; tự động tải lại hóa đơn và hiển thị trạng thái đã đóng/đã thanh toán | **PASS** | Tích hợp handler `onRefreshBill` tự động kích hoạt khi gặp 409 |
| **Mất kết nối mạng khi khách xem bill** | Giữ nguyên dữ liệu hóa đơn cũ, gắn nhãn vàng "Chưa cập nhật", cung cấp nút "Thử lại", không xóa sạch màn hình | **PASS** | Cờ `isStale` trong `useCustomerTableBill` xử lý trơn tru |
| **Cam kết thu tiền thực tế** | Bắt buộc tích chọn checkbox cam kết `isAcknowledged` trước khi cho phép bấm nút xác nhận thanh toán | **PASS** | Test case 5 xác minh `canSubmit` chỉ true khi checkbox được tích |

---

### 6. Checklist Responsive & Accessibility (A11y)

| Viewport / Thiết Bị | Chi Tiết Kiểm Tra Bố Cục | Kết Quả |
|---|---|---|
| **Mobile 360px** | Màn hình hẹp; text tiêu đề và số tiền VND tự động xuống dòng mượt mà không bị vỡ khung; nút bấm đầy đủ touch area. | **PASS** |
| **Mobile 390px - 430px (iPhone / Android chuẩn)** | Bottom sheet mở cao 92vh; sticky footer có padding an toàn `env(safe-area-inset-bottom)`; cuộn vé đơn mượt mà. | **PASS** |
| **Tablet 768px (iPad)** | Grid bàn 2-3 cột; hộp thoại chi tiết bàn chuyển thành Drawer bên phải rộng 576px (`max-w-xl`), dễ quan sát toàn diện. | **PASS** |
| **Desktop 1024px / 1280px** | Grid bàn 4-6 cột; bố cục thoáng đãng, các nút thao tác nhanh (Xem QR / Chi tiết) phân bổ cân đối. | **PASS** |
| **Accessibility (A11y)** | • Phím Tab tuần tự, focus ring `#1D725E` rõ nét.<br>• Thuộc tính `role="dialog"`, `role="alertdialog"`, `aria-busy`, `aria-label` đầy đủ.<br>• Trạng thái lỗi và cảnh báo luôn dùng chữ kết hợp icon, không dựa duy nhất vào màu sắc.<br>• Touch target các nút chính đều >= 40px - 48px. | **PASS** |

---

### 7. Phối Hợp Kỹ Thuật Với Codex & Ranh Giới Trách Nhiệm

1. **Ranh giới tuân thủ nghiêm ngặt**:
   - Gemini chỉ chỉnh sửa tầng giao diện và presentation: `src/components/customer/**`, `src/components/owner/**`, `tests/ui/**`.
   - Không can thiệp vào `src/server/**`, `src/app/api/**`, migrations database, RLS policies, lock transactions hay business rules do Codex quản lý.
2. **Khớp nối dữ liệu (Data Coupling)**:
   - Toàn bộ DTO thanh toán tái sử dụng trực tiếp từ `@contracts` (`TableBillView`, `TablePaymentMethod`, `TableBillOrder`).
   - Sử dụng đúng API client adapters của Codex: `fetchPublicSessionBill`, `fetchOwnerSessionBill`, `settleOwnerSession`.
3. **Không có xung đột file**:
   - Các file UI do Gemini sở hữu hoạt động hoàn toàn tương thích và độc lập với các file API route và logic backend của Codex.

---

### 8. Xác Nhận Kiểm Thử Thực Tế & Cam Kết Không Mock Dữ Liệu

- **Cam kết không mock dữ liệu**: Toàn bộ logic giao diện trên môi trường chạy thực tế đều gọi qua các API adapter chính thức của dự án. Mock fixtures chỉ tồn tại biệt lập trong thư mục `tests/ui/` phục vụ kiểm thử đơn vị component.
- **Kết quả Quality Gate thực tế**:
  1. `npx vitest run --config tests/ui/vitest.config.mts`: **PASS 21/21 test files (255 / 255 tests passed, 0 failures)**.
  2. `npx vitest run --config tests/unit/vitest.config.mts`: **PASS 18/18 test files (131 / 131 tests passed)**.
  3. `npm run test:auth`: **PASS 7/7 test files (46 / 46 tests passed)**.
  4. `npm run test:db`: **PASS 2/2 test files (9 / 9 tests passed)**.
  5. `npm run typecheck`: **PASS (0 errors)**.
  6. `npm run lint`: **PASS (0 warnings với `--max-warnings=0`)**.
  7. `npm run build`: **PASS (Turbopack compile thành công trong 1.88s, 18 pages static + dynamic)**.

---

### 9. Tiếp Nhận & Khắc Phục Các Điểm Kiểm Toán Từ Codex (P5-C02 Remediation)

Dựa trên báo cáo kiểm toán đồng cấp `docs/handoffs/P5_C02_CODEX_DINEIN_SETTLEMENT_QA_REPORT.md`, Gemini đã rà soát và khắc phục triệt để 5 điểm then chốt:

| Vấn Đề (Codex Finding) | Nguyên Nhân Kỹ Thuật | Giải Pháp Khắc Phục & Cam Kết UX | Trạng Thái |
|---|---|---|---|
| **1. Snapshot bill cũ chặn thanh toán sau khi hoàn tất đơn (`TableBillSettlementSheet:88`)** | `actionBill ?? billProp` giữ snapshot cũ từ lệnh `begin_checkout`, bỏ qua `billProp` mới được GET sau khi hoàn tất phục vụ ở tab Đơn hàng. | Sử dụng `useMemo` so sánh `session.version`, `billVersion` và `outstandingOrders`. Snapshot có phiên bản cao hơn hoặc số món chưa phục vụ ít hơn sẽ được ưu tiên; bấm "Làm mới hóa đơn" lập tức xóa `actionBill` để nạp dữ liệu GET mới nhất. | **RESOLVED** |
| **2. Idempotency Key & Thay đổi payload (`TableBillSettlementSheet:230`)** | Ref chỉ lưu `requestId`; nếu timeout mạng rồi đổi `paymentMethod` (tiền mặt ↔ chuyển khoản), việc gửi cùng key với payload khác sẽ bị server từ chối `DUPLICATE_REQUEST_CONFLICT`. | Lưu trữ cấu trúc `settlePendingCommandRef` gồm cả key và payload (`paymentMethod, version, billVersion`). Khi thử lại cùng payload -> giữ nguyên `requestId`; khi đổi phương thức hoặc đổi version -> cấp `requestId` mới. Tự động GET bill kiểm tra trước khi thử lại khi mất mạng. | **RESOLVED** |
| **3. Không tự tổng hợp bill đã thanh toán khi thiếu phản hồi server (`TableBillSettlementSheet:160,200,236`)** | Nhánh `else` tự gán `{ status: 'closed', paymentStatus: 'paid', settledAt: ... }` nếu callback trả về `void` hoặc không có dữ liệu. | Loại bỏ hoàn toàn việc tự gán lạc quan. Bắt buộc có kết quả xác thực từ server; nếu không có kết quả, kích hoạt `onRefreshBill` để đối soát trạng thái thực tế từ server. | **RESOLVED** |
| **4. Ánh xạ mã lỗi máy `SESSION_ORDERS_OUTSTANDING` (`TableBillSettlementSheet:263`)** | Server trả về HTTP 409 cho `SESSION_ORDERS_OUTSTANDING`; điều kiện kiểm tra `err.status === 409` đặt trước khiến lỗi còn món bị biến thành lỗi xung đột chung chung. | Đảo thứ tự ưu tiên: kiểm tra `err.error.code === 'SESSION_ORDERS_OUTSTANDING'` trước `err.status === 409`, hiển thị chính xác: *"Còn món đang làm chưa hoàn tất phục vụ. Vui lòng kiểm tra lại trước khi chốt tiền."* | **RESOLVED** |
| **5. Hợp đồng thu hồi quyền khách & Bổ sung listener kết nối (`useCustomerTableBill.ts`)** | Khi phiên chốt, DB thu hồi quyền khách (GET trả về 403/410). Hook thiếu listener phục hồi khi tab active hoặc online trở lại. | Khi gặp 403/410, đánh dấu `isStale = true` cho dữ liệu cached cũ, khẳng định phiên đã đóng. Bổ sung listener sự kiện `visibilitychange` và `online` để tự động đồng bộ hóa đơn ngay khi khách quay lại ứng dụng. | **RESOLVED** |

---

### 10. Kết Quả Quality Gate Sau Khắc Phục
- **ESLint**: `eslint . --max-warnings=0` -> **PASS (0 warnings, 0 errors)**.
- **TypeScript**: `tsc --noEmit` -> **PASS (0 errors)**.
- **Vitest UI Tests**: `tests/ui/**/*.test.ts` -> **PASS 22/22 test files (264 / 264 tests passed)**.
- **Next.js Production Build**: `next build` -> **PASS (Turbopack compile thành công 100%)**.

---

### 11. Kết Luận: SẴN SÀNG NGHIỆM THU TỔNG THỂ (READY)

Toàn bộ các rủi ro về concurrency, stale snapshot, lỗi ánh xạ mã 409, an toàn idempotency theo payload và cơ chế khôi phục mạng đã được giải quyết triệt để trên cả hai giao diện Khách hàng và Chủ quán. Hệ thống sẵn sàng cho bước nghiệm thu tổng thể.
