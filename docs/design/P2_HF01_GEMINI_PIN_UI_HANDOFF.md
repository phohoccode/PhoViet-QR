# HOTFIX P2-HF01 / GEMINI UI HANDOFF: 6-Digit Table PIN & Session Modals

> **Mã công việc:** P2-HF01  
> **Phạm vi trách nhiệm:** UI/UX React, Tailwind CSS, shadcn/ui patterns, accessibility (a11y), responsive, và tích hợp typed API client.  
> **Chủ quyền:** GEMINI ONLY (Không chỉnh sửa database migrations, server logic, auth guard, hay token cryptos).  
> **Backend tương ứng:** `P2_HF01_CODEX_6_DIGIT_TABLE_PIN_BACKEND.md` / `UI_DATA_HANDOFF.md` (Codex).

---

## 1. Tóm tắt thay đổi & Mục tiêu đạt được (Definition of Done)

### 1.1. Trước thay đổi (Legacy Problem)
- **Modal Chủ quán:** Hiển thị chuỗi mã phiên bí mật dài và phức tạp (ví dụ: `4VYfPbjltCCpgI_DeG8U7w`) trong hộp viền nét đứt kèm cảnh báo đỏ lớn *"chỉ hiển thị một lần"*. Chủ quán không thể xem lại mã khi đã đóng modal.
- **Khách quét QR bàn (`/q/[code]`):** Khách phải tự nhập chuỗi bí mật dài khó nhớ, dễ gõ sai trên màn hình cảm ứng di động.
- **Bảo mật & Trải nghiệm:** Chủ quán phải chụp màn hình hoặc ghi chép mã dài; khách bối rối và bỏ cuộc khi nhập sai.

### 1.2. Sau thay đổi (P2-HF01 Emerald Solution)
- **Khách hàng (`/q/[code]`):** Chỉ nhập mã PIN 6 chữ số (ví dụ: `482 619`). Giao diện gồm 6 ô số chia thành 2 cụm 3 ô trực quan (`[ _ _ _ ] [ _ _ _ ]`), bàn phím số ảo `inputMode="numeric"`, hỗ trợ paste tự động loại bỏ dấu cách và bảo toàn số 0 ở đầu (ví dụ: `012345`). Khách chỉ nhập 1 lần duy nhất cho mỗi thiết bị/phiên.
- **Chủ quán khi Mở bàn (`TableSessionOpenedDialog`):** Nhìn thấy mã PIN 6 chữ số lớn nổi bật định dạng `XXX XXX` với font monospace `tabular-nums`. Bấm nút **"Sao chép PIN"** sẽ sao chép chính xác 6 chữ số liền nhau. Cảnh báo đỏ được thay bằng ghi chú trung tính: *"PIN chỉ dùng cho phiên bàn hiện tại. Không đăng công khai mã."*.
- **Chủ quán xem lại PIN (`TableDetailDialog`):** Nút **"Hiện PIN"** gọi API protected `POST /api/owner/table-sessions/:id/pin/reveal`. PIN chỉ hiển thị khi có yêu cầu chủ động, có nút **"Ẩn PIN"**, và tự động xóa sạch khỏi RAM/state khi đóng dialog hoặc unmount (tuyệt đối không lưu vào `localStorage`/`sessionStorage`).
- **Tạo PIN mới (Rotate PIN):** Có nút **"Tạo PIN mới"** đi kèm hộp thoại xác nhận `AlertDialog` giải thích rõ: PIN cũ ngừng hiệu lực ngay, các thiết bị đã xác minh trước đó vẫn tiếp tục hoạt động.
- **Phiên cũ (Legacy Session Migration):** Nhận diện `session.pinState === 'legacy'` và hiển thị CTA **"Chuyển sang PIN 6 số"**, giải thích đơn hàng hiện tại của bàn vẫn được giữ nguyên.
- **QR Takeaway:** Khách quét QR Mang đi đi thẳng vào menu, tuyệt đối không xuất hiện bước nhập PIN.
- **QR Code công khai:** URL QR dán bàn là `/q/[publicCode]`, không chứa PIN trong URL, ảnh PNG/SVG hay poster in.

---

## 2. Danh sách File & Component đã thay đổi

| File | Thành phần | Mô tả thay đổi |
| :--- | :--- | :--- |
| `src/components/customer/TableVerificationCard.tsx` | UI Nhập PIN khách hàng | Redesign toàn diện: 6 ô số chia 2 cụm (3 + 3), `inputMode="numeric"`, `autoComplete="one-time-code"`, lọc paste ký tự số, giữ leading zeros, nút Xác nhận touch target 48px, thông báo lỗi tiếng Việt thân thiện, a11y đầy đủ. |
| `src/components/customer/CustomerQRContainer.tsx` | Điều phối QR & Xác minh | Xử lý payload 6 số, map mã lỗi server (`INVALID_SESSION_CODE`, `RATE_LIMITED`, `SESSION_EXPIRED`, `DUPLICATE_REQUEST_CONFLICT`, lỗi mạng) sang copy tiếng Việt chuẩn, xóa PIN khỏi state khi verify thành công. |
| `src/components/owner/TableSessionDialog.tsx` | `TableSessionOpenedDialog` | Hiển thị PIN 6 số lớn `XXX XXX` (font-mono tabular-nums), nút "Sao chép PIN" copy 6 chữ số liền, thay cảnh báo đỏ bằng ghi chú trung tính, hiển thị link QR công khai. |
| `src/components/owner/TableSessionDialog.tsx` | `TableDetailDialog` | Thêm tính năng Hiện PIN / Ẩn PIN, kết nối API `POST /api/owner/table-sessions/:id/pin/reveal`, nút Tạo PIN mới với `AlertDialog` kết nối `POST /pin/rotate`, CTA chuyển đổi phiên legacy sang PIN 6 số, tự động xóa PIN khỏi RAM khi đóng. |
| `src/components/owner/tables/TableManagementView.tsx` | Quản lý Tab Bàn | Bổ sung props lifecycle PIN (`onRevealTablePin`, `onRotateTablePin`, `onMigrateLegacyTablePin`), truyền vào `TableDetailDialog`, chặn thao tác PIN khi bàn trống hoặc chờ thanh toán. |
| `src/lib/mocks/ui-preview.ts` | Demo Fixtures | Thêm PIN 6 số (`'482619'`, `'012345'`) vào `DEMO_VALID_SESSION_CODES` cho môi trường dev preview. |
| `tests/ui/p2-hf01-pin.test.ts` | Test Suite Vitest | Thêm 21 test cases kiểm thử formatting, leading zeros, paste, guardrails, error mappings, và lifecycle PIN. |

---

## 3. Các UI States thực tế & API Mapping

| Trạng thái | Giao diện Khách hàng (Guest) | Giao diện Chủ quán (Owner) | Endpoint / Contract |
| :--- | :--- | :--- | :--- |
| **Initial (Chưa nhập / Chưa mở)** | QR Bàn: hiển thị form 6 ô `[ _ _ _ ] [ _ _ _ ]`<br>QR Takeaway: vào menu ngay | Bàn trống: nút **"Mở phiên"**<br>Bàn có khách: nút **"Chi tiết"** | Client state / QR Resolution |
| **Mở phiên thành công** | *(Chưa tham gia)* | Modal hiển thị PIN lớn `482 619`, nút "Sao chép PIN", ghi chú trung tính | `POST /api/owner/tables/:id/sessions` -> `OwnerSessionOpenedView` (`pinFormat: 'numeric_6'`) |
| **Xem lại PIN (Reveal)** | *(Không áp dụng)* | Bấm **"Hiện PIN"** -> Spinner -> Hiển thị `482 619`, nút Ẩn PIN, nút Tạo PIN mới | `POST /api/owner/table-sessions/:id/pin/reveal` -> `OwnerTablePinView` |
| **Đổi PIN mới (Rotate)** | Nhận thông báo PIN cũ hết hiệu lực nếu chưa verify | Bấm **"Tạo PIN mới"** -> `AlertDialog` xác nhận -> Server cấp PIN mới | `POST /api/owner/table-sessions/:id/pin/rotate` (`{ requestId, expectedVersion, confirm: true }`) |
| **Phiên cũ (Legacy Session)** | Hướng dẫn hỏi chủ quán nếu hệ thống yêu cầu đổi mã | Hiển thị thẻ cảnh báo vàng kèm CTA **"Chuyển sang PIN 6 số"** | `session.pinState === 'legacy'` |
| **Xác minh thành công** | Chuyển sang menu bàn đã xác nhận, giỏ hàng giữ nguyên | Cập nhật số đơn & tạm tính | `POST /api/public/table-sessions/verify` (`{ qrCode, sessionCode }`) |
| **Sai mã PIN** | Lỗi đỏ: *"Mã chưa đúng, vui lòng thử lại."* (giữ nguyên số đã nhập) | *(Không áp dụng)* | HTTP 401 / `INVALID_SESSION_CODE` |
| **Bị giới hạn (Rate Limited)** | Lỗi: *"Bạn thử quá nhiều lần. Hãy đợi một chút rồi thử lại."* | Xử lý lỗi 429 trên nút Hiện/Tạo PIN | HTTP 429 / `RATE_LIMITED` |
| **Phiên hết hạn / Đã đóng** | Lỗi: *"Phiên bàn đã kết thúc, vui lòng hỏi quán."* | Bàn chuyển trạng thái `checkout_pending` hoặc Đóng; chặn Hiện PIN | HTTP 410 / `SESSION_EXPIRED` |
| **Mất kết nối mạng** | Lỗi: *"Không thể kết nối. Kiểm tra mạng và thử lại."* | Không báo thành công giả; giữ nút thử lại an toàn | Network Error / Fetch Reject |

---

## 4. Báo cáo Kiểm thử Thực tế (Verification Evidence)

### 4.1. TypeScript Compilation (`npm run typecheck`)
```bash
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
Kết quả: 0 LỖI (Exit Code: 0).
```

### 4.2. Code Quality & Linting (`npm run lint`)
```bash
> eslint . --max-warnings=0
Kết quả: 0 LỖI, 0 CẢNH BÁO (Exit Code: 0).
```

### 4.3. UI Vitest Suites (`npx vitest run --config tests/ui/vitest.config.mts`)
```bash
 ✓ tests/ui/owner/p3-g02-owner-orders-fifo.test.ts (10 tests)
 ✓ tests/ui/menu-flow.test.ts (11 tests)
 ✓ tests/ui/tables-qr-flow.test.ts (17 tests)
 ✓ tests/ui/qr-flow.test.ts (10 tests)
 ✓ tests/ui/p2-g05-acceptance.test.ts (23 tests)
 ✓ tests/ui/customer/p3-g01-dine-in-checkout.test.ts (12 tests)
 ✓ tests/ui/cart/cart-flow.test.ts (15 tests)
 ✓ tests/ui/p2-hf01-pin.test.ts (21 tests)

 Test Files  8 passed (8)
      Tests  119 passed (119)
   Duration  602ms
```

### 4.4. Production Turbopack Build (`npm run build`)
```bash
▲ Next.js 16.4.2 (Turbopack)
✓ Compiled successfully in 3.1s
  Running TypeScript ...
  Finished TypeScript in 6.3s ...
✓ Generating static pages using 11 workers (15/15) in 436ms
Route (app)
├ ƒ /api/owner/table-sessions/[id]/pin/reveal
├ ƒ /api/owner/table-sessions/[id]/pin/rotate
├ ƒ /api/public/table-sessions/verify
├ ƒ /dashboard
└ ƒ /q/[code]
Kết quả: Production Build SUCCEEDED (Exit Code: 0).
```

---

## 5. Đánh giá Responsive & Accessibility (a11y)

| Yếu tố | Kết quả kiểm tra | Chi tiết kỹ thuật |
| :--- | :--- | :--- |
| **Mobile 320px - 375px** | ĐẠT | 6 ô số co giãn theo flexbox với gap 1.5 - 2.5, font text-xl, không bị tràn màn hình; modal có scroll khi bàn phím ảo hiển thị. |
| **Tablet 768px - Desktop 1280px** | ĐẠT | Modal căn giữa với backdrop blur, max-w-md, khoảng cách typography cân đối theo chuẩn Minimal Emerald POS. |
| **Touch Target** | ĐẠT | Nút "Xác nhận", "Sao chép PIN", "Hiện PIN", "Tạo PIN mới" đều đạt chiều cao tối thiểu 44px - 48px. |
| **Screen Readers (WCAG)** | ĐẠT | Thẻ `input` có `aria-label="Mã PIN 6 số của bàn"`, `aria-invalid`, `aria-describedby` trỏ tới `hintId` hoặc `errorId`, thông báo lỗi có `role="alert"` và `aria-live="polite"`. |
| **Bảo mật bộ nhớ** | ĐẠT | PIN không bao giờ ghi vào `localStorage` hay `sessionStorage`. State PIN tự động giải phóng khi unmount hoặc đóng modal. |

---

## 6. Trạng thái phối hợp cùng Backend Codex

- **Đã nối thành công:**
  1. `POST /api/public/table-sessions/verify` với body `{ qrCode, sessionCode: string }` (yêu cầu định dạng 6 chữ số `^\d{6}$`).
  2. `POST /api/owner/tables/:id/sessions` trả về `sessionCredential.sessionCode` là chuỗi 6 số, hiển thị định dạng `XXX XXX`.
  3. `POST /api/owner/table-sessions/:id/pin/reveal` trả về `OwnerTablePinView` với PIN 6 số.
  4. `POST /api/owner/table-sessions/:id/pin/rotate` nhận `{ requestId, expectedVersion, confirm: true }` và trả về mã mới.
- **Điểm lưu ý:**
  - `session.pinState === 'legacy'` được UI sử dụng để hiển thị banner và CTA chuyển đổi. Khi bấm chuyển đổi, UI tái sử dụng lệnh rotate để nâng cấp session sang mã 6 số an toàn.
  - Thiết bị đã xác minh trước đó vẫn giữ quyền gọi món theo đúng kiến trúc của Codex.
