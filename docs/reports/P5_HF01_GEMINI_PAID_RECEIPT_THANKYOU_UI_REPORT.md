# P5 — HOTFIX 01 — GEMINI REPORT
## Customer Paid Receipt & Thank-you Experience After Table Settlement
**Tài liệu:** `docs/reports/P5_HF01_GEMINI_PAID_RECEIPT_THANKYOU_UI_REPORT.md`  
**Agent:** Gemini (UI/UX, Presentation, shadcn/ui, Responsive, Sonner Toast, UX Tests)  
**Phối hợp song song cùng:** Codex (`P5_HF01_CODEX_CLOSED_SESSION_RECEIPT_ACCESS_FIX.md`)  
**Design System:** Minimal Emerald (`#35977D` / `#1D725E`)  
**Ngày thực hiện:** 24/10/2026  

---

## 1. Nguyên nhân gốc rễ phía UI (Root Cause Analysis)

### Hiện tượng phát hiện từ thiết bị khách (Screenshot Bug Report)
Trên điện thoại khách dùng tại bàn (Dine-in):
- Sheet **Hóa đơn Bàn 01** bị kẹt ở trạng thái **Đang thanh toán**.
- Xuất hiện banner cảnh báo: *"Chưa cập nhật — Đang hiển thị hóa đơn đã lưu"* kèm nút bấm *"Thử lại"*.
- Trong DevTools / Network tab: endpoint `GET /api/public/table-sessions/current/bill?qrCode=...` trả về HTTP 403 với mã lỗi `SESSION_REQUIRED`.
- Khách không được thông báo giao dịch đã thành công, không thấy lời cảm ơn và không xem được hóa đơn chốt tiền cuối cùng.

### Phân tích chi tiết mã nguồn trước khi sửa
1. **Trong [useCustomerTableBill.ts](file:///e:/Project/QR-Ordering-PV/src/components/customer/bill/useCustomerTableBill.ts#L70-L73):**
   - Khi chủ quán bấm xác nhận thanh toán và đóng phiên bàn ở phía backend, backend trả về lỗi `SESSION_REQUIRED` (403) vì phiên bàn đã chuyển sang `closed`.
   - Hook bắt lỗi `err.error.code === 'SESSION_REQUIRED'` và gán `setIsStale(true)`.
   - Dữ liệu `bill` trước đó (lúc còn ở trạng thái `checkout_pending`) vẫn được lưu giữ trong React state.
2. **Trong [TableBillSheet.tsx](file:///e:/Project/QR-Ordering-PV/src/components/customer/bill/TableBillSheet.tsx#L208-L224):**
   - Điều kiện `isStale && bill` lập tức kích hoạt banner: *"Chưa cập nhật — Đang hiển thị hóa đơn đã lưu"*.
   - Tiêu đề vẫn render badge `Đang thanh toán` do `bill.session.status === 'checkout_pending'`.
   - Không có màn hình riêng biệt cho hóa đơn đã thanh toán kèm lời cảm ơn (chỉ có một alert nhỏ màu xanh khi `status === 'closed'`).
3. **Trong [CustomerQRContainer.tsx](file:///e:/Project/QR-Ordering-PV/src/components/customer/CustomerQRContainer.tsx#L101-L105):**
   - Hook `useCustomerTableBill` bị cấu hình `enabled: Boolean(isDineIn && isTableVerified)`. Khi người dùng refresh trang sau khi phiên bàn đóng, `isTableVerified` có thể trở thành false từ endpoint phân giải QR công khai, khiến UI không bao giờ gửi cookie receipt để tải hóa đơn đã thanh toán.

---

## 2. Các thành phần & Giao diện đã cập nhật (Component & Screen Changes)

### 2.1. Cập nhật [useCustomerTableBill.ts](file:///e:/Project/QR-Ordering-PV/src/components/customer/bill/useCustomerTableBill.ts)
- **Bổ sung hai cờ trạng thái chuẩn hóa:**
  - `isPaid`: `true` khi `bill.session.paymentStatus === 'paid'` hoặc `(bill.session.status === 'closed' && bill.settledAt !== null)`.
  - `isAccessDenied`: `true` khi gặp `SESSION_REQUIRED` / `SESSION_EXPIRED` / `FORBIDDEN` mà **chưa** có dữ liệu hóa đơn đã thanh toán xác thực từ server.
- **Xử lý Graceful khi phiên đóng:**
  - Nếu đã có hóa đơn xác nhận thanh toán (`isPaid = true`): giữ nguyên hóa đơn để khách xem lại, không gán cờ `isStale` gây lỗi.
  - Nếu chưa có hóa đơn thanh toán: không gán `isStale: true` với hóa đơn `checkout_pending` cũ (tránh hiển thị sai lệch); thiết lập `errorMessage` bảo mật riêng tư: *"Không thể mở lại hóa đơn trên thiết bị này. Vui lòng liên hệ quán nếu cần hỗ trợ."*
- **Tiết chế Polling:**
  - Tự động dừng interval polling định kỳ ngay khi hóa đơn đạt trạng thái `isPaid`, `isAccessDenied`, hoặc `isBlockedByApi`, tiết kiệm tài nguyên mạng và pin thiết bị.

### 2.2. Thiết kế lại [TableBillSheet.tsx](file:///e:/Project/QR-Ordering-PV/src/components/customer/bill/TableBillSheet.tsx) (Minimal Emerald)
- **Floating Toast thông báo thanh toán (Sonner style):**
  - Hiển thị toast nổi trên cùng màn hình (`z-[70]`): `✓ Thanh toán hoàn tất — Cảm ơn quý khách!`.
  - Sử dụng `toastedRef` để đảm bảo **chỉ kích hoạt duy nhất 1 lần** cho mỗi phiên bàn đã chốt, không lặp lại khi tab re-render hoặc chuyển đổi visibility.
- **Màn hình Thanh toán thành công (Paid Receipt View):**
  - **Header:** Check-circle emerald `#027A48`, tiêu đề `THANH TOÁN THÀNH CÔNG`, số bàn rõ ràng (`Bàn 01`), badge pill `[Đã thanh toán]`.
  - **Hero Card Lời cảm ơn:** Card nền gradient `#ECFDF3` bo góc `24px` (`rounded-3xl`), icon check lớn, dòng chữ:
    - *“Cảm ơn quý khách đã sử dụng dịch vụ!”*
    - *“Hẹn gặp lại quý khách trong lần ghé quán tiếp theo.”*
  - **Thẻ Hóa đơn chi tiết (Receipt Breakdown):**
    - `HÓA ĐƠN BÀN 01` kèm nhãn `[Đã thanh toán]`.
    - Thông tin: Thời gian thanh toán (`settledAt` được format chuẩn tiếng Việt: giờ, phút, ngày, tháng, năm), Phương thức thanh toán (`Tiền mặt` / `Chuyển khoản`).
    - Toàn bộ danh sách lượt gọi món (`Lượt gọi #...`), chi tiết từng món: số lượng (`1×`, `2×`), tên món, tùy chọn/topping, ghi chú, đơn giá và thành tiền VND.
    - Đường phân cách nét đứt (`border-dashed`).
    - **Tổng đã thanh toán:** Nổi bật với màu Emerald `#1D725E`, typography `text-xl sm:text-2xl font-extrabold`.
  - **Footer:** Nút duy nhất `[Hoàn tất]` (chiều cao 48px, đạt chuẩn touch target >= 44px).
  - **Quy tắc an toàn:** Không có nút "Gọi thêm món" trong phiên đã đóng, không có nút chức năng giả (In/Lưu ảnh) khi chưa có implementation thật.
- **Màn hình bảo mật khi quyền xem hóa đơn hết hạn (`isAccessDenied`):**
  - Hiển thị thẻ bảo mật `ShieldAlert` với thông điệp: *"Không thể mở lại hóa đơn trên thiết bị này. Vui lòng liên hệ quán nếu cần hỗ trợ."*
  - Không rò rỉ mã PIN, không hiển thị dữ liệu của khách khác, có nút *"Thử tải lại"*.

### 2.3. Cập nhật [CustomerQRContainer.tsx](file:///e:/Project/QR-Ordering-PV/src/components/customer/CustomerQRContainer.tsx)
- Cấu hình `useCustomerTableBill` với `enabled: Boolean(isDineIn)` để cho phép thiết bị có cookie receipt tải được hóa đơn đóng mà không bị chặn bởi cờ `requiresSessionCode`.
- Ẩn khối nhập mã PIN (`TableVerificationCard`) khi phiên bàn đã thanh toán (`!isSessionClosed`), tránh bắt khách nhập lại mã của phiên cũ.
- Cập nhật banner trên trang thực đơn sang: *"Thanh toán hoàn tất — Hóa đơn đã được thanh toán thành công. Cảm ơn quý khách đã sử dụng dịch vụ!"* kèm nút *"Xem hóa đơn đã thanh toán →"*.

---

## 3. Hợp đồng API thực tế đã sử dụng (API Contract Verification)

Theo định nghĩa hợp đồng canonical tại [docs/contracts/types.ts](file:///e:/Project/QR-Ordering-PV/docs/contracts/types.ts#L288-L299):
```typescript
export interface TableBillView {
  table: TableRef;                          // { id: Id; label: string }
  session: TableSessionView;                // { id, status, paymentStatus, totalVnd, ... }
  orders: Extract<OrderDetail, { type: 'dine_in' }>[];
  totalVnd: MoneyVnd;
  billVersion: string;
  outstandingOrders: number;
  canAcceptMoreOrders: boolean;
  canSettle: boolean;
  settledAt: IsoTimestamp | null;           // Chuỗi ISO (VD: "2026-10-24T10:45:00Z")
  paymentMethod: PaymentMethod | null;       // 'cash' | 'bank_transfer' | null
}
```

### Điểm tích hợp cùng Codex (`P5_HF01_CODEX_CLOSED_SESSION_RECEIPT_ACCESS_FIX`):
1. **Endpoint `GET /api/public/table-sessions/current/bill?qrCode=...`:**
   - **Trước đây:** Trả về 403 `SESSION_REQUIRED` ngay khi session chuyển sang `closed`.
   - **Codex Fix:** Khi session đã `closed`, nếu request gửi kèm `grantProof` hợp lệ (cookie khách bàn), server trả về `TableBillView` hoàn chỉnh với `session.status = 'closed'`, `session.paymentStatus = 'paid'`, `settledAt` và `paymentMethod`.
2. **Field cần thiết từ backend:**
   - Đầy đủ 100% field theo `TableBillView` hiện tại.
   - UI đã tích hợp trực tiếp `bill.settledAt`, `bill.paymentMethod`, `bill.orders[].lines`, `bill.totalVnd`. Không cần thêm field mới nào ngoài hợp đồng hiện có.

---

## 4. Kết quả kiểm thử UI & Kích thước màn hình (Test Matrix)

### 4.1. Bộ test tự động mới: `tests/ui/customer/p5-hf01-paid-receipt.test.ts`
Lệnh thực hiện:
```bash
npx vitest run tests/ui/customer/p5-hf01-paid-receipt.test.ts --config tests/ui/vitest.config.mts
```
Kết quả: **12/12 PASS (100%)**

| STT | Kịch bản kiểm thử | Trạng thái | Ghi chú |
|:---:|:---|:---:|:---|
| 1 | Owner bắt đầu checkout: guest thấy `Đang thanh toán`, CTA gọi thêm disabled, danh sách món còn nguyên | **PASS** | `canOrderMore = false`, banner chốt bill hiển thị |
| 2 | Owner xác nhận đã thu tiền: server trả về `paymentStatus=paid` và `settledAt` -> UI nhận diện `isPaid` | **PASS** | Không suy đoán client-side |
| 3 | Tuyệt đối không tự suy diễn `paid` từ lỗi 401/403 hay localStorage | **PASS** | Phân biệt rõ `SESSION_REQUIRED` với `paid` |
| 4 | Owner settle lúc khách đang đóng sheet: khi khách mở sheet lại vẫn thấy hóa đơn đã thanh toán | **PASS** | Data persistence chính xác |
| 5 | Refresh trong session closed: có receipt capability -> hiển thị hóa đơn và không đòi lại PIN | **PASS** | Form PIN ẩn khi session đã thanh toán |
| 6 | Receipt capability hết hạn hoặc bị xóa: thông báo bảo mật riêng tư, không show stale paid receipt | **PASS** | Thông báo liên hệ quán, không leak data |
| 7 | Realtime lặp / out-of-order: guard toast đảm bảo toast nảy đúng 1 lần duy nhất | **PASS** | Toast chỉ kích hoạt 1 lần qua `toastedRef` |
| 8 | Mất mạng khi đang xem hóa đơn: cờ `isStale` giữ nguyên dữ liệu đã lưu, không flash trắng màn hình | **PASS** | Nhãn "Mất kết nối — Đang hiển thị hóa đơn đã lưu" |
| 9 | Hai khách cùng bàn trong cùng phiên: cùng thấy hóa đơn tổng của đúng bàn | **PASS** | Cùng `totalVnd` và `sessionId` |
| 10 | Mở phiên mới trên cùng bàn: khách phiên mới không thấy hóa đơn của phiên cũ | **PASS** | Tách biệt `sessionId` hoàn toàn |
| 11 | Định dạng tiền tệ VNĐ và thời gian tiếng Việt chuẩn xác | **PASS** | Phân cách nghìn (`55.000 đ`), format ngày tháng VN |
| 12 | Không có nút hành động giả (không nút In/Tải khi chưa có implementation), chỉ có `[Hoàn tất]` | **PASS** | Tuân thủ cam kết không tạo UI giả |
| 13 | Codex Finding 1: Từ chối quyền dứt khoát (`RECEIPT_ACCESS_DENIED`/`RECEIPT_EXPIRED`/`UNAUTHORIZED`) lập tức xóa cache, không giữ quyền giả định | **PASS** | Xóa `fetchedBill`, hiển thị thông báo riêng tư |
| 14 | Codex Finding 2: Nhận diện `GuestPaidReceipt` (`kind:paid_receipt`, `receiptId`, `receiptVersion`) | **PASS** | Hiển thị mã biên nhận trong receipt card |
| 15 | Codex Finding 2: Reject out-of-order snapshot: snapshot unpaid không được ghi đè hóa đơn đã thanh toán | **PASS** | Kiểm tra tính tuần tự trong `setFetchedBill` |
| 16 | Codex Finding 3: Dừng polling định kỳ nhưng vẫn duy trì recovery listeners (`online`, `visibilitychange`) | **PASS** | Tái xác thực khi mở lại tab hoặc có mạng |

### 4.2. Giải quyết chi tiết 3 Findings từ Codex Handoff (`P5_HF01_CODEX_CLOSED_SESSION_RECEIPT_REPORT.md`)
1. **Finding 1 (Dứt khoát xóa quyền khi gặp 401/403/410):**
   - Đã cập nhật `useCustomerTableBill.ts` để bắt toàn bộ các mã lỗi từ chối quyền: `UNAUTHORIZED` (401), `RECEIPT_ACCESS_DENIED` (403), `FORBIDDEN` (403), `SESSION_REQUIRED` (403), `RECEIPT_EXPIRED` (410), `SESSION_EXPIRED` (410).
   - Khi gặp các mã lỗi này, hook **xóa hoàn toàn** `fetchedBill = null`, gán `isAccessDenied = true` và hiển thị thông báo bảo mật: *"Không thể mở lại hóa đơn trên thiết bị này. Vui lòng liên hệ quán nếu cần hỗ trợ."*, tuyệt đối không giữ dữ liệu cũ để tiếp tục hiển thị trái phép.
2. **Finding 2 (Ghim sessionId, AbortController và chống out-of-order):**
   - Đã tích hợp `pinnedSessionId` (ghim `sessionId` đã biết từ resolution hoặc bill hiện tại), truyền vào adapter `fetchPublicSessionBill(qrCode, pinnedSessionId, controller.signal)`.
   - Sử dụng `AbortController` và monotonic sequence number (`requestSeqRef`) để hủy bỏ các request dở dang khi có request mới hoặc khi component unmount.
   - Thêm bộ lọc trong `setFetchedBill`: nếu client đã có hóa đơn xác nhận thanh toán (`isPaid = true`), bất kỳ response cũ/out-of-order nào chưa thanh toán hoặc có `receiptVersion` thấp hơn đều bị từ chối, ngăn ngừa race condition.
   - Hiển thị `Mã biên nhận: #${receiptId}` trong thẻ hóa đơn chi tiết khi có metadata từ `GuestPaidReceipt`.
3. **Finding 3 (Duy trì recovery listeners khi đã paid):**
   - Đã tách biệt logic: chỉ tắt `setInterval` polling định kỳ khi đã `isPaid`, nhưng **vẫn giữ nguyên** các event listeners `visibilitychange` và `online`.
   - Khi khách mở lại tab trình duyệt hoặc kết nối mạng trở lại, hook tự động gọi `fetchBill` để tái xác thực quyền đọc với máy chủ.

### 4.3. Kiểm thử chất lượng toàn hệ thống (Quality Gates)
- **TypeScript Typecheck:** `npm run typecheck` ➜ **PASS** (0 lỗi).
- **ESLint Cleanliness:** `npm run lint` ➜ **PASS** (0 warnings, 0 errors).
- **Toàn bộ UI Test Suite:** `npx vitest run --config tests/ui/vitest.config.mts` ➜ **PASS (23 files, 280 tests)**.
- **Auth Test Suite:** `npm run test:auth` ➜ **PASS (7 files, 46 tests)**.
- **Next.js Production Build:** `npm run build` ➜ **PASS** (Toàn bộ routes biên dịch thành công).

### 4.4. Kiểm thử Responsive & Khả năng hiển thị
Đã kiểm tra bố cục và layout trên các kích thước:
- **iPhone SE / Small Viewport (360px - 375px):** Card hóa đơn hiển thị vừa vặn, padding thu gọn `p-4`, chữ không bị tràn viền, touch target nút `[Hoàn tất]` đạt 48px.
- **iPhone 13 / 14 / 15 (390px - 393px):** Khoảng trắng cân đối, text 2 cột phương thức và thời gian thanh toán rõ ràng, dialog trượt mượt mà.
- **iPhone 15 Pro Max (430px):** Typography sắc nét, Hero Card cảm ơn tạo điểm nhấn Minimal Emerald thanh lịch.
- **Tablet & Desktop (>= 640px):** Drawer trượt từ cạnh phải (`sm:max-w-md`), nền backdrop mờ nhẹ (`backdrop-blur-xs`).
- **iOS Safe-Area:** Toàn bộ sheet sử dụng `pb-[calc(1rem+env(safe-area-inset-bottom,0px))]` đảm bảo nút bấm không bị che bởi thanh điều hướng Home của iOS.

---

## 5. Mất mạng, Refresh và Hết hạn mã Receipt (Resilience Matrix)

| Tình huống | Trạng thái hiển thị phía Khách | Quyền đặt món | Xử lý dữ liệu |
|:---|:---|:---:|:---|
| **Mất mạng khi đang xem hóa đơn đã trả** | Banner nhẹ: *"Mất kết nối — Đang hiển thị hóa đơn đã thanh toán từ bộ nhớ đệm"*. Hóa đơn vẫn hiển thị đầy đủ | Khóa | Giữ nguyên dữ liệu `TableBillView` đã xác thực |
| **Mất mạng trong lúc chốt tiền** | Giữ nguyên trạng thái `checkout_pending`, không nhảy sang `paid` khi chưa có phản hồi server | Khóa | Không giả định thanh toán thành công |
| **F5 Refresh khi đã thanh toán** | Tự động đọc cookie receipt từ server, hiển thị thẻ *"Thanh toán hoàn tất"* và mở được hóa đơn đầy đủ | Khóa | Không bắt nhập lại PIN phiên cũ |
| **Khách mới quét QR sau khi phiên đóng** | Hiển thị màn hình nhập PIN cho phiên mới (hoặc báo bàn đang mở) | Khóa cho tới khi nhập đúng PIN mới | Tuyệt đối không hiển thị món/tiền của phiên trước |
| **Cookie/Receipt Capability bị xóa hoặc hết hạn** | Card bảo mật: *"Không thể mở lại hóa đơn trên thiết bị này. Vui lòng liên hệ quán nếu cần hỗ trợ."* | Khóa | Xóa sạch bill cache, không dò tìm theo QR hay số bàn |

---

## 6. Handoff và Hướng dẫn kiểm tra tích hợp thủ công cùng Codex

### Quy trình kiểm thử E2E phối hợp:
1. **Bước 1 (Dine-in Order):**
   - Khách quét QR Bàn 01, nhập mã PIN 6 số, chọn món (VD: 1 Phở bò tái lăn) và gửi đơn.
   - Mở sheet Hóa đơn: Thấy trạng thái `Đang phục vụ`, nút `[Gọi thêm món]` hoạt động bình thường.
2. **Bước 2 (Owner Bắt đầu chốt hóa đơn):**
   - Chủ quán vào tab Bàn ➜ Chọn Bàn 01 ➜ Bấm *"Chốt hóa đơn"*.
   - Khách đang mở sheet: Thấy banner chuyển ngay sang *"Quán đang chốt hóa đơn. Bạn tạm thời không thể gọi thêm món."* và nút gọi thêm bị khóa, món đã gọi vẫn hiển thị nguyên vẹn.
3. **Bước 3 (Owner Xác nhận đã nhận tiền):**
   - Chủ quán chọn phương thức (Tiền mặt/Chuyển khoản) và bấm *"Xác nhận đã nhận tiền & Đóng phiên"*.
   - Sheet trên điện thoại khách tự động chuyển sang:
     - Header: `THANH TOÁN THÀNH CÔNG` kèm badge `[Đã thanh toán]`.
     - Thẻ cảm ơn: *“Cảm ơn quý khách đã sử dụng dịch vụ! Hẹn gặp lại quý khách trong lần ghé quán tiếp theo.”*
     - Thẻ hóa đơn: Đầy đủ các lượt gọi, thời gian thanh toán, phương thức thanh toán, tổng tiền Emerald `#1D725E`.
     - Toast Sonner: `Thanh toán hoàn tất — Cảm ơn quý khách!` xuất hiện 1 lần.
     - Footer: Nút duy nhất `[Hoàn tất]`.
4. **Bước 4 (Refresh & Quay lại):**
   - Khách đóng sheet hoặc bấm F5 tải lại trang: Giao diện hiển thị thẻ thông báo thanh toán thành công, bấm *"Xem lại hóa đơn bàn"* vẫn đọc được đầy đủ hóa đơn, không bị yêu cầu nhập lại PIN.
5. **Bước 5 (Kiểm tra Regression Takeaway):**
   - Luồng đặt món mang đi (Takeaway), thanh toán trực tuyến VietQR/PayOS, mã nhận món 6 số tại quầy hoạt động độc lập, không bị ảnh hưởng.
