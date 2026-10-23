# P2-G01 — TÀI LIỆU BÀN GIAO GIAO DIỆN QR ENTRY, TABLE VERIFICATION, TAKEAWAY & OWNER TABLES
## UI Component Contract, State Matrix & API Connection Guide (Updated with P2-C01 Integration)

> **Phiên bản:** 1.1 (Phase 2 — Prompt 01 Integration) · **Ngày:** 23/10/2026  
> **Tác giả:** Gemini (Senior Product UI/UX Engineer)  
> **Đối tượng bàn giao:** Codex (Backend / Domain Engineer) & Chủ dự án  
> **Trạng thái:** `DONE` · Đáp ứng 100% mục Gemini Integration Requests trong `docs/integration/P2_C01_QR_HANDOFF.md`  
> **Mã quy chuẩn thiết kế:** Minimal Emerald POS (`assets/ui-reference.png`)  
> **Route phục vụ:** `/q/[code]` (Customer QR Entry) & `/dashboard` (Owner Dashboard — Tab Bàn)

---

## 1. Danh Sách Route & Component Thực Tế

Toàn bộ các component đã được tích hợp với API endpoint thực tế từ Codex (R01, R02, R11, R12, R17), không còn phụ thuộc vào mock trong môi trường production:

```
src/
├── app/
│   ├── (customer)/
│   │   └── q/
│   │       └── [code]/
│   │           └── page.tsx                # Route Next.js /q/[code] (Server Component, gate demoState theo NODE_ENV)
│   └── (owner)/
│       └── dashboard/
│           └── page.tsx                    # Route Next.js /dashboard (Owner Shell kết nối R11/R12/R17)
├── components/
│   ├── customer/
│   │   ├── CustomerOrderModeHeader.tsx     # Header chuẩn hóa: Tên quán, Badge loại đơn, Giỏ hàng
│   │   ├── TableVerificationCard.tsx       # Khối nhập mã phiên bàn (sessionCode 1–64 ký tự, a11y, inline error)
│   │   ├── QRResolutionStateView.tsx       # Hiển thị các trạng thái đặc biệt: invalid_qr, rate_limited, offline...
│   │   ├── MenuPreviewSection.tsx          # Vỏ khung xem trước menu: search, chip danh mục, thẻ món, skeleton
│   │   └── CustomerQRContainer.tsx         # Container điều phối kết nối API R01 & R02 với credentials: 'include'
│   └── owner/
│       ├── OwnerShell.tsx                  # Dashboard chủ quán: Tab Bàn kết nối R11 & R17, gọi R12 mở phiên bàn
│       └── TableSessionDialog.tsx          # Dialog hiển thị sessionCode từ phản hồi private R12 & Dialog chi tiết bàn
└── lib/
    └── mocks/
        └── ui-preview.ts                   # Fixtures chuẩn hóa toàn bộ ID sang UUID RFC 4122 (khớp DB Seed P2-C01)
```

---

## 2. Đáp Ứng Các Yêu Cầu Tích Hợp Từ Codex (Gemini Integration Requests)

Theo tài liệu bàn giao `docs/integration/P2_C01_QR_HANDOFF.md`, Gemini đã thực hiện đầy đủ các hạng mục:

### 1. Tách Biệt Fallback Mock & `demoState` Sang Dev/Preview; Production Giữ Lỗi API Thật (UI_INTEGRATION_REQUEST P2-01)
- **Gate Environment:** `src/app/(customer)/q/[code]/page.tsx` và `CustomerQRContainer.tsx` kiểm tra nghiêm ngặt `process.env.NODE_ENV !== 'production'`.
  - Tham số URL `?demoState=...` chỉ được kích hoạt trong môi trường `development` hoặc `test`. Trong môi trường `production`, query này bị bỏ qua hoàn toàn.
  - Thanh gạt chuyển trạng thái demo (`Dev Toolbar`) chỉ hiển thị khi `isDev = true`.
- **Hiển thị lỗi API thật trong Production:**
  - `GET /api/public/qr/:code` (R01): Khi server trả về mã lỗi HTTP, UI chuyển sang trạng thái lỗi chính xác:
    - HTTP 404 (`INVALID_QR`) hoặc HTTP 400 (`VALIDATION_ERROR`): hiển thị `invalid_qr`.
    - HTTP 410 (`SESSION_EXPIRED`): hiển thị `session_locked_or_closed`.
    - HTTP 429 (`RATE_LIMITED`): đọc `details.retryAfterSeconds` hoặc header `Retry-After` để đếm ngược chính xác, hiển thị `rate_limited`.
    - HTTP 500 / Network Error: hiển thị `offline`.
    - **Tuyệt đối không fallback sang mock data trong môi trường production!**
  - `POST /api/public/table-sessions/verify` (R02):
    - Đọc chính xác `error.message` từ server response:
      - HTTP 422 (`INVALID_SESSION_CODE`): "Mã phiên không chính xác. Vui lòng kiểm tra lại với nhân viên quán."
      - HTTP 410 (`SESSION_EXPIRED`): "Phiên bàn này đã đóng hoặc mã đã hết hạn. Vui lòng nhờ nhân viên mở bàn mới."
      - HTTP 429 (`RATE_LIMITED`): "Thao tác quá thường xuyên. Vui lòng đợi trong giây lát rồi thử lại."
      - HTTP 409 (`INVALID_STATE_TRANSITION`): "Bàn đang ở trạng thái không thể nhận thêm thao tác."
      - HTTP 400 (`VALIDATION_ERROR`): "Định dạng mã phiên không hợp lệ. Vui lòng kiểm tra lại."
    - **Không cho phép vượt qua xác thực bằng mã demo trong production.**

### 2. Nối Tab Bàn Với R11/R17, Dùng UUID Thật; Gọi R12 Mở Phiên Và Chỉ Hiển Thị Mã Từ Phản Hồi Private (UI_INTEGRATION_REQUEST P2-02)
- **Kết nối R11 (`GET /api/owner/tables`) & R17 (`GET /api/owner/qr-codes`):**
  - Khi chủ quán mở tab "Bàn", `OwnerShell` tự động gọi song song R11 và R17 với `credentials: 'include'` và `cache: 'no-store'`.
  - Toàn bộ danh sách bàn sử dụng UUID thật từ database (ví dụ: `c0200000-0000-4000-8000-000000000002` cho Bàn 01).
  - Khớp mã QR của từng bàn từ danh sách R17 để hiển thị đường dẫn `/q/[publicCode]`.
  - Hiển thị khối mã QR Mang đi tại quầy thu ngân (Takeaway QR từ R17).
- **Mở phiên bàn qua R12 (`POST /api/owner/tables/:id/sessions`):**
  - Với các bàn đang trống (`t.session === null && t.active`), hiển thị nút **"Mở phiên bàn"**.
  - Khi chủ quán bấm mở:
    - Tạo `requestId = crypto.randomUUID()` cho tính lũy thừa (idempotency).
    - Gửi request `POST /api/owner/tables/${table.id}/sessions` kèm header `Content-Type: application/json` và `credentials: 'include'`.
    - Nhận phản hồi HTTP 201 với dữ liệu private `OwnerSessionOpenedView`.
    - Cập nhật tức thì trạng thái bàn trên giao diện thành "Có khách" / "Đang phục vụ".
- **Chỉ hiển thị mã phiên từ phản hồi private (`TableSessionOpenedDialog`):**
  - Hộp thoại nổi bật hiển thị `sessionCredential.sessionCode` dạng monospace lớn, dễ đọc, kèm nút sao chép nhanh và hiển thị thời gian hết hạn (`expiresAt`).
  - **Cảnh báo bảo mật bắt buộc:** Thông báo rõ ràng cho chủ quán rằng mã phiên này chỉ xuất hiện DUY NHẤT một lần trong phản hồi private của lệnh mở phiên. Hệ thống bảo mật không lưu văn bản thuần và không thể hiển thị lại sau khi đóng hộp thoại.
  - Sau khi đóng hộp thoại, `sessionCode` bị xóa khỏi bộ nhớ client, không lưu vào state lâu dài hay localStorage.
  - Khi bấm vào bàn đang phục vụ, `TableDetailDialog` hiển thị thông tin phiên (orderCount, totalVnd, openedAt) nhưng tuân thủ triệt để không có nút đoán/đọc lại mã phiên cũ.

### 3. Gọi Verify Với `credentials: 'include'`, Xử Lý Reload Và Lỗi Theo Handoff
- Cả R01 (`GET /api/public/qr/[code]`) và R02 (`POST /api/public/table-sessions/verify`) đều truyền `{ credentials: 'include', cache: 'no-store' }`.
- **Hành vi khi Reload (F5):**
  - Cookie khách (`__Host-qr_guest` trong production, `qr_guest` trong dev) được tự động gửi kèm.
  - R01 kiểm tra grant trong database: nếu cookie hợp lệ, R01 trả về `requiresSessionCode: false` cùng session ID.
  - `CustomerQRContainer` lập tức render trạng thái bàn đã xác nhận (`isTableVerified = true`), khách không phải nhập lại mã.
  - Nếu phiên đã đóng hoặc hết hạn, R01 trả về `requiresSessionCode: true` và `session: null`, giao diện yêu cầu xác minh lại.

---

## 3. Ma Trận Trạng Thái Giao Diện (State Matrix)

| Màn hình / Endpoint | State | Điều kiện kích hoạt | Giao diện hiển thị | Hành vi tương tác / Nút bấm |
|---|---|---|---|---|
| Customer `/q/[code]` | `resolving` | Đang gọi R01 | Skeleton loading gọn gàng | Khóa tương tác tạm thời |
| Customer `/q/[code]` | `table_unverified` | R01 trả `requiresSessionCode: true` | Header Bàn XX, Form nhập mã phiên bàn, Menu preview | Nút `[ Xác nhận bàn ]` (48px); Thêm món bị vô hiệu hóa |
| Customer `/q/[code]` | `verifying` | Đang gửi R02 verify | Spinner `Loader2`, "Đang kiểm tra..." | Nút disabled chống bấm lặp |
| Customer `/q/[code]` | `table_verified` | R02 thành công hoặc R01 đã có cookie grant | Banner xanh ngọc "Đã xác nhận Bàn XX" | Mở khóa nút thêm món `+`, giỏ hàng sẵn sàng |
| Customer `/q/[code]` | `invalid_session_code`| R02 trả 422 | Báo lỗi viền đỏ cạnh input | Giữ nguyên mã và focus để sửa |
| Customer `/q/[code]` | `session_expired` | R02 trả 410 | Báo lỗi phiên hết hạn | Yêu cầu liên hệ nhân viên mở bàn |
| Customer `/q/[code]` | `rate_limited` | R01/R02 trả 429 | Card đếm ngược chờ retry | Nút `[ Thử lại ]` đếm ngược theo giây |
| Customer `/q/[code]` | `invalid_qr` | R01 trả 404/400 | Card đỏ: Mã QR không hợp lệ | Nút `[ Thử quét lại ]` |
| Customer `/q/[code]` | `takeaway_ready` | R01 type `takeaway` | Header Mang đi, vào thẳng menu | Thêm món kích hoạt ngay |
| Owner `/dashboard` | `tables_ready` | R11/R17 trả 200 | Lưới bàn trực quan: Trống / Có khách / Chờ tính tiền | Bàn trống có nút `[ Mở phiên bàn ]` |
| Owner `/dashboard` | `session_opened` | R12 trả 201 private | Modal nổi bật hiển thị mã phiên bàn | Sao chép mã, cảnh báo mã hiển thị 1 lần duy nhất |
| Owner `/dashboard` | `tables_error` | R11 trả lỗi | `OwnerErrorState` hiển thị thông báo lỗi thật | Nút `[ Thử lại ]` gọi lại R11 & R17 |

---

## 4. Kiểm Chứng Kỹ Thuật & Tuân Thủ Bộ Quy Chuẩn

1. **Lint (`npm run lint`):** PASS (0 errors, 0 warnings, ESLint max-warnings=0).
2. **Typecheck (`npm run typecheck`):** PASS (TypeScript noEmit & Next.js typegen).
3. **Unit Tests UI (`npx vitest run --config tests/ui/vitest.config.mts`):** PASS (10/10 tests passed).
4. **Unit Tests Auth (`npm run test:auth`):** PASS (46/46 tests passed).
5. **Production Build (`npm run build`):** PASS (Next.js Turbopack build thành công 100% routes).
6. **File Boundaries:** Tuyệt đối không chạm vào code backend, contracts, migrations, hay dependencies. Không nối order/payment sớm.
