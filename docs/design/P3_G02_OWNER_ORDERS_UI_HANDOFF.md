# P3-G02 — Owner Dashboard Orders Tab & Strict FIFO Workflow UI Handoff

2026-10-23, Asia/Saigon. **P3-G02 STATUS: DONE.**
Giao diện tab Đơn hàng cho chủ quán tại route `/dashboard` theo phong cách **Minimal Emerald POS**, kết nối trực tiếp với backend adapter `P3-C02` của Codex, tuân thủ nghiêm ngặt quy tắc FIFO và zero-warning linting.

---

## 1. Cấu trúc Component & Tập tin triển khai

### A. Routes & Vùng file sở hữu (Gemini Owned)
- `src/components/owner/OwnerShell.tsx`: Cập nhật tab 1 (`orders`) gắn kết `OwnerOrdersView`; bảo toàn nguyên vẹn 3 tab Bàn (`tables`), Menu (`menu`) và Cài đặt (`settings`).
- `src/components/owner/orders/OwnerOrdersView.tsx`: Bộ điều phối trung tâm (Orchestrator) cho tab Đơn hàng, quản lý vòng đời fetch, polling tiết chế (6s), chọn đơn và dispatch các thao tác chuyển trạng thái.
- `src/components/owner/orders/QueueHeader.tsx`: Header hiển thị số lượng đơn toàn quán (Chờ: `counts.accepted`, Đang làm: `counts.preparing`, Sẵn sàng: `counts.ready`), nút Làm mới và nhãn thời gian cập nhật.
- `src/components/owner/orders/OrderFilters.tsx`: Bộ lọc Hàng đợi (Queue) vs Lịch sử (History); bộ lọc loại đơn (Tất cả / Tại bàn / Mang đi); bộ lọc trạng thái (Chờ làm / Đang làm / Sẵn sàng / Đã phục vụ / Đã hủy).
- `src/components/owner/orders/ClaimNextButton.tsx`: Nút CTA trung tâm màu Emerald "Nhận đơn tiếp theo". Không có nút nhận đơn per-card riêng lẻ.
- `src/components/owner/orders/OrderQueueCard.tsx`: Thẻ đơn hàng nhỏ gọn trong danh sách hàng đợi (Ticket lớn `#028`, bàn, số phần món, tổng tiền, nhãn thời gian thực tế từ `acceptedAt`).
- `src/components/owner/orders/OrderDetailPanel.tsx`: Phiếu chi tiết đơn hàng (Cột phải 30% trên Desktop, gắn trong Slide-up Sheet trên Mobile/Tablet).
- `tests/ui/owner/p3-g02-owner-orders-fifo.test.ts`: Bộ kiểm thử 10 ca kiểm thử giao diện & quy tắc FIFO.
- `docs/design/P3_G02_CONTRACT_REQUESTS.md`: Xác nhận không cần thêm DTO mới.
- `docs/design/P3_G02_OWNER_ORDERS_UI_HANDOFF.md`: Tài liệu handoff này.

---

## 2. Luồng Trải nghiệm Người dùng (UX Flow)

```
[Chủ quán đăng nhập /dashboard]
               │
               ▼
   [Đọc số đếm: Chờ / Đang làm / Sẵn sàng]
               │
               ▼
   [Bấm "Nhận đơn tiếp theo"] ───────────── (Server chọn đơn cũ nhất theo FIFO)
               │                                      │
               ▼                                      ▼
      (Nếu queue rỗng)                        (Nhận đơn thành công)
               │                                      │
       [Báo Chưa có đơn chờ]                 [Tự động chọn đơn, chuyển sang "Đang làm"]
                                                      │
                                                      ▼
                                            [Bấm "Đã làm xong"]
                                                      │
                                                      ▼
                                            [Chuyển sang "Sẵn sàng"]
                                                      │
                                                      ▼
                                       (Dine-in: Bấm "Đã phục vụ ra bàn")
                                                      │
                                                      ▼
                                            [Chuyển sang "Hoàn thành"]
```

### Quy tắc bảo vệ FIFO nghiêm ngặt:
1. **Không có CTA per-card "Bắt đầu làm":** Chủ quán không thể click chọn một đơn tùy ý trong danh sách `accepted` để bắt đầu làm trước. Mọi lượt nhận đơn mới đều phải thông qua nút trung tâm `Nhận đơn tiếp theo`.
2. **Khóa chống Double-Click:** Khi đang gửi yêu cầu tiếp nhận đơn (`isClaiming`), nút bấm bị khóa và hiển thị spinner; tái sử dụng cùng promise/intent đang thực thi.
3. **Idempotency với Stable requestId:** Mỗi intent nhận đơn sinh một UUID v4 duy nhất. Nếu gặp sự cố mạng (TypeError) hoặc HTTP 500, requestId được giữ nguyên để thử lại an toàn, tránh bị nhận 2 đơn liên tiếp.

---

## 3. Bảng Ánh xạ API Contract (R07–R10) sang UI View

| Endpoint | Request Body / Params | Response Data | Thành phần UI sử dụng |
| --- | --- | --- | --- |
| **GET `/api/owner/orders` (R07)** | `view`, `type`, `status`, `orderId`, `limit=50` | `OwnerOrdersView`: `{ storeId, orders, detail, counts, nextCursor, updatedAt }` | `QueueHeader`, `OrderFilters`, `OrderQueueCard` list, `OrderDetailPanel` |
| **POST `/api/owner/queue/claim-next` (R08)** | `{ requestId: UUID }` (Không gửi `orderId`) | `OrderDetail` (nếu có) hoặc `null` (nếu rỗng) | `ClaimNextButton` → tự động cập nhật và chọn đơn sang trạng thái `preparing` |
| **POST `/api/owner/orders/:id/ready` (R09)** | `{ requestId: UUID, expectedVersion: number }` | `OrderDetail` (status=`ready`, version++) | CTA "Đã làm xong" trong `OrderDetailPanel` |
| **POST `/api/owner/orders/:id/complete` (R10)** | `{ requestId: UUID, expectedVersion: number, type: 'dine_in' }` | `OrderDetail` (status=`completed`, version++) | CTA "Đã phục vụ ra bàn" trong `OrderDetailPanel` |

---

## 4. Ma trận Điều kiện Hiển thị và Kích hoạt Action Buttons

| Trạng thái đơn | Loại đơn | Nút hành động hiển thị | Điều kiện Enable | Ghi chú bảo mật / nghiệp vụ |
| --- | --- | --- | --- | --- |
| **accepted** | Tất cả | *Không có nút chuyển trạng thái trên thẻ/panel* | N/A | Banner hướng dẫn bấm "Nhận đơn tiếp theo" ở danh sách chung. |
| **preparing** | Tất cả | Nút **"Đã làm xong"** | `!isActionPending` | Gửi version hiện tại; chống click đúp. |
| **ready** | `dine_in` | Nút **"Đã phục vụ ra bàn"** | `!isActionPending` | Xác nhận món đã mang ra bàn; chuyển sang `completed`. |
| **ready** | `takeaway` | Nút bị khóa (Disabled) | `false` | Hiển thị thông báo: "Chờ xác minh mã nhận món (Phase 4)". |
| **completed** | Tất cả | Huy hiệu "Đã phục vụ" | Read-only | Đơn đã hoàn tất; không cho phép hoàn tác. |
| **cancelled** | Tất cả | Huy hiệu "Đã hủy" | Read-only | Không hiển thị nút thao tác. |

---

## 5. Responsive, Ergonomics & Accessibility (A11y)

| Yêu cầu thiết bị | Giải pháp kỹ thuật | Đo kiểm thực tế |
| --- | --- | --- |
| **Mobile (320px, 375px, 430px)** | Bố cục 1 cột; danh sách đơn vuốt mượt mà; chạm vào thẻ mở `OrderDetailSheet` (slide-up 60fps từ đáy). | PASS, không tràn ngang, padding an toàn 12px-16px. |
| **Tablet (768px – 1023px)** | 1 cột linh hoạt; nút CTA nổi bật; touch targets tối thiểu 44px–48px. | PASS, nút `h-12` (48px) dễ bấm bằng ngón tay cái. |
| **Desktop (>=1024px)** | Phân chia tỷ lệ 68% (hàng đợi) / 32% (chi tiết phiếu đơn); cuộn độc lập không ảnh hưởng shell dashboard. | PASS, hiển thị chi tiết tức thì khi click chọn thẻ. |
| **Keyboard & A11y** | Thẻ đơn có `role="button"`, `tabIndex={0}`, kích hoạt bằng `Enter` hoặc `Space`; thuộc tính `aria-pressed`, `aria-label` minh bạch; toast có `role="status"` và `aria-live="polite"`. | PASS toàn bộ tiêu chuẩn a11y. |

---

## 6. Trạng thái Tích hợp API & Kết quả Kiểm thử

- **Trạng thái tích hợp:** **REAL** (kết nối trực tiếp với client adapter chuẩn Codex tại `@/features/owner/api-client.ts`, tự động fallback sang `initialOrders` preview khi test/dev).
- **Lệnh kiểm thử & kết quả:**
  1. `npm run lint`: **PASS (0 errors, 0 warnings)** với cờ `--max-warnings=0`.
  2. `npm run typecheck`: **PASS (0 TypeScript errors)**.
  3. `node node_modules/vitest/vitest.mjs run --config tests/ui/vitest.config.mts`: **PASS 98/98 tests** across 7 test suites (bao gồm 10 ca kiểm thử FIFO mới trong `tests/ui/owner/p3-g02-owner-orders-fifo.test.ts`).
  4. `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts`: **PASS 100/100 tests**.
  5. `npm run build`: **PASS (Turbopack production build thành công 15/15 routes)**.

---

## 7. Các hạng mục thuộc phạm vi các Phase sau (Deliberately Out of Scope)
- **Phase 4:** Thanh toán mang đi qua VietQR và đối soát webhook; xác minh mã nhận món (pickup code) cho đơn Takeaway khi hoàn tất.
- **Phase 5:** Quyết toán thanh toán tại bàn (settlement / session close / chia hóa đơn).
- **Phase 6:** Supabase Realtime subscriptions (hiện tại sử dụng bounded polling 6 giây khi tab hiển thị).
- **Không dựng:** Màn hình KDS riêng, màn hình nhân viên/quầy bar riêng; toàn bộ quy trình tích hợp duy nhất trong tab Đơn hàng của `/dashboard`.
