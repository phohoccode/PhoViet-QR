# P2-G01 REVIEW REPORT — CUSTOMER QR ENTRY, TABLE VERIFICATION & OWNER TABLES INTEGRATION
## Báo Cáo Nghiệm Thu Kỹ Thuật Giao Diện Khách Hàng Quét QR & Tích Hợp API Bàn Chủ Quán

> **Mã công việc:** P2-G01 (Gemini Phase 2 — Prompt 01 Integration)  
> **Kỹ sư:** Gemini (UI/UX Frontend Engineer)  
> **Ngày hoàn thành:** 23/10/2026  
> **Trạng thái:** `DONE` (Hoàn thành đầy đủ các tiêu chuẩn nghiệm thu DoD và yêu cầu tích hợp từ Codex P2-C01)  
> **Tham chiếu hợp đồng:** `docs/contracts/types.ts`, `docs/contracts/API_CONTRACT_V1.md`, `docs/integration/P2_C01_QR_HANDOFF.md`

---

## 1. Danh Sách File Tạo Mới & Chỉnh Sửa

| Thao tác | Đường dẫn file | Vai trò & Trách nhiệm |
|---|---|---|
| **Cập nhật** | `src/app/(customer)/q/[code]/page.tsx` | Route Next.js App Router `/q/[code]`, phân định môi trường: gate `demoState` chỉ cho phép trong dev/test, production buộc phân giải API thật. |
| **Cập nhật** | `src/components/customer/CustomerQRContainer.tsx` | Container điều phối: gọi R01 & R02 với `credentials: 'include'` và `cache: 'no-store'`, tách biệt fallback mock (dev-only), hiển thị mã lỗi và thời gian retry chính xác từ backend trong production. |
| **Cập nhật** | `src/components/customer/TableVerificationCard.tsx` | Cập nhật placeholder trung tính "Nhập mã phiên (do quán cung cấp)", xử lý xác thực phiên bàn với API R02 thật. |
| **Cập nhật** | `src/components/owner/OwnerShell.tsx` | Nối Tab Bàn với `GET /api/owner/tables` (R11) và `GET /api/owner/qr-codes` (R17). Gọi `POST /api/owner/tables/:id/sessions` (R12) kèm `requestId` UUID mới để mở phiên bàn. |
| **Tạo mới** | `src/components/owner/TableSessionDialog.tsx` | Hộp thoại hiển thị mã phiên bàn từ phản hồi private R12 (`OwnerSessionOpenedView`) với cảnh báo bảo mật một lần duy nhất, cùng hộp thoại xem chi tiết phiên bàn. |
| **Cập nhật** | `src/lib/mocks/ui-preview.ts` | Chuẩn hóa toàn bộ ID store và bàn thành UUID RFC 4122 (`c0200000-0000-4000-8000-000000000001`, `c0200000-0000-4000-8000-000000000002`...) khớp DB seed P2-C01; bổ sung `MOCK_QR_CODES_LIST`. |
| **Cập nhật** | `tests/ui/qr-flow.test.ts` | Bổ sung 4 unit tests mới (tổng cộng 10 tests) kiểm tra định dạng UUID RFC 4122, bảo vệ credential không bị rò rỉ trong `TableSummary`, và định dạng phản hồi private R12 / R17. |
| **Cập nhật** | `docs/design/P2_G01_UI_HANDOFF.md` | Tài liệu bàn giao kỹ thuật cập nhật chi tiết tích hợp R01, R02, R11, R12, R17. |
| **Cập nhật** | `docs/design/P2_G01_REVIEW.md` | Báo cáo nghiệm thu kỹ thuật và kết quả test suite. |

> **Bảo toàn ranh giới File Ownership:**  
> Tuyệt đối không can thiệp code backend của Codex: `src/app/api/**`, `src/server/**`, `src/lib/supabase/**`, `src/lib/validations/**`, `supabase/**`, `docs/contracts/**`, `docs/integration/**`, `package.json`. Không nối logic đặt món hay thanh toán.

---

## 2. Kết Quả Kiểm Tra Kỹ Thuật (QA Suite)

1. **Kiểm tra cú pháp & ESLint (`npm run lint`):**
   ```bash
   > qr-ordering-pv@0.1.0 lint
   > eslint . --max-warnings=0
   ```
   **Kết quả: PASS (0 errors, 0 warnings).**

2. **Kiểm tra kiểu dữ liệu (`npm run typecheck`):**
   ```bash
   > qr-ordering-pv@0.1.0 typecheck
   > next typegen && tsc --noEmit
   Generating route types...
   ✓ Types generated successfully
   ```
   **Kết quả: PASS (0 type errors).**

3. **Kiểm tra Unit Test UI (`npx vitest run --config tests/ui/vitest.config.mts`):**
   ```bash
   ✓ tests/ui/qr-flow.test.ts (10 tests) 9ms
   Test Files  1 passed (1)
        Tests  10 passed (10)
   ```
   **Kết quả: PASS (10/10 tests passed).**

4. **Kiểm tra Unit Test Auth (`npm run test:auth`):**
   ```bash
   Test Files  7 passed (7)
        Tests  46 passed (46)
   ```
   **Kết quả: PASS (46/46 tests passed).**

5. **Biên dịch sản xuất (`npm run build`):**
   ```
   ▲ Next.js 16.4.2 (Turbopack)
   ✓ Compiled successfully in 1148ms
   ✓ Generating static pages (9/9)
   
   Route (app)
   ┌ ○ /
   ├ ○ /_not-found
   ├ ƒ /api/owner/auth/refresh
   ├ ƒ /api/owner/qr-codes
   ├ ƒ /api/owner/tables
   ├ ƒ /api/owner/tables/[id]/sessions
   ├ ƒ /api/public/qr/[code]
   ├ ƒ /api/public/table-sessions/verify
   ├ ƒ /dashboard
   ├ ƒ /login
   └ ƒ /q/[code]
   ```
   **Kết quả: PASS (Toàn bộ 9 static & dynamic routes biên dịch hoàn hảo).**

---

## 3. Kiểm Chứng Các Mục Yêu Cầu Của Người Dùng

### Mục 1: Tách fallback mock và demoState sang chế độ dev/preview; production phải hiển thị lỗi API thật
- [x] `CustomerQREntryPage` (`src/app/(customer)/q/[code]/page.tsx`) kiểm tra `process.env.NODE_ENV !== 'production'`. Trong production, `demoState` luôn là `null`.
- [x] `CustomerQRContainer` (`src/components/customer/CustomerQRContainer.tsx`) chỉ cho phép `computeDemoResolution` hoạt động khi `NODE_ENV !== 'production'`.
- [x] Trong production, khi `GET /api/public/qr/:code` (R01) trả về lỗi (404, 400, 410, 429, 500), UI hiển thị trực tiếp mã lỗi tương ứng (`invalid_qr`, `session_locked_or_closed`, `rate_limited`, `offline`). Tuyệt đối không fallback sang mock resolution.
- [x] Khi xác minh bàn qua `POST /api/public/table-sessions/verify` (R02), trong production khi server trả 422, 410, 429, 409 hoặc lỗi mạng, UI hiển thị thông báo lỗi thật từ backend; không tự động chuyển sang "đã xác nhận" bằng mã demo.
- [x] Thanh công cụ Dev Toolbar (`Bàn chưa xác nhận`, `Bàn đã xác nhận`, `Mang đi`) được ẩn hoàn toàn trong môi trường production.

### Mục 2: Nối tab Bàn với R11/R17, dùng UUID thật; gọi R12 để mở phiên và chỉ hiển thị mã từ phản hồi private
- [x] `OwnerShell` (`src/components/owner/OwnerShell.tsx`) gọi song song `GET /api/owner/tables` (R11) và `GET /api/owner/qr-codes` (R17) khi mở tab "Bàn".
- [x] Toàn bộ mã bàn và store tuân thủ định dạng UUID RFC 4122 (khớp dữ liệu seed `c0200000-0000-4000-8000-000000000002`...).
- [x] Khối bàn hiển thị chính xác trạng thái: Bàn trống (có nút "Mở phiên bàn"), Có khách (kèm số đơn, tổng tiền tạm tính), và Chờ tính tiền.
- [x] Khi bấm "Mở phiên bàn", `OwnerShell` gọi `POST /api/owner/tables/:id/sessions` (R12) kèm UUID `requestId` mới (`crypto.randomUUID()`).
- [x] Phản hồi private HTTP 201 trả về `OwnerSessionOpenedView` chứa `sessionCredential: { sessionCode, expiresAt }`.
- [x] Hộp thoại `TableSessionOpenedDialog` hiển thị mã phiên bàn nổi bật kèm nút sao chép, thời gian hết hạn và cảnh báo bảo mật rằng mã chỉ hiển thị một lần duy nhất từ phản hồi private và không được lưu dạng văn bản thuần.
- [x] Sau khi đóng hộp thoại, `sessionCode` bị xóa khỏi client memory; không có tính năng đoán hoặc đọc lại mã phiên cũ.
- [x] Hiển thị mã QR Mang đi tại quầy thu ngân từ danh sách R17 (`type: 'takeaway'`).

### Mục 3: Gọi verify với `credentials: 'include'`; xử lý reload và lỗi theo handoff
- [x] Cả hai lệnh gọi API khách hàng (R01 GET và R02 POST) đều được cấu hình `{ credentials: 'include', cache: 'no-store' }`.
- [x] Khi khách reload trang (F5), browser tự động gửi kèm cookie khách (`__Host-qr_guest` / `qr_guest`). R01 đọc grant trong DB và trả về `requiresSessionCode: false` cùng session ID; giao diện tự động duy trì trạng thái đã xác nhận mà không cần nhập lại mã.
- [x] Xử lý lỗi HTTP 429: Trích xuất `details.retryAfterSeconds` từ JSON hoặc header `Retry-After` để kích hoạt đếm ngược thời gian chờ thử lại.
- [x] Xử lý lỗi HTTP 422: Thông báo mã phiên không chính xác, giữ nguyên giá trị người dùng đã nhập và duy trì focus.

---

## 4. Hướng Dẫn Kiểm Thử Trực Quan (Manual Verification)

Chủ dự án có thể kiểm thử trực tiếp trên local:
1. **Kiểm thử Customer QR Flow (Chế độ Dev):**
   - Mở `http://localhost:3000/q/table-05` -> Nhập mã bàn, kiểm tra phản hồi.
   - Thử các demo state: `?demoState=verified`, `?demoState=takeaway`, `?demoState=invalid_qr`, `?demoState=rate_limited`.
2. **Kiểm thử Customer QR Flow (Mã Thật):**
   - Đăng nhập chủ quán tại `http://localhost:3000/login`.
   - Vào tab "Bàn", bấm "Mở phiên bàn" cho một bàn trống (ví dụ Bàn 02).
   - Sao chép mã phiên bàn hiển thị trong hộp thoại thông báo.
   - Mở cửa sổ ẩn danh và truy cập đường dẫn QR của bàn đó (ví dụ `/q/BAN02_DEMO_CODE` hoặc mã QR thật sinh từ DB).
   - Nhập mã phiên vừa sao chép -> Bàn được xác nhận thành công!
   - Thử F5 (Reload) -> Trang vẫn giữ trạng thái đã xác nhận nhờ cookie grant!
