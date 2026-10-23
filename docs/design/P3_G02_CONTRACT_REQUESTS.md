# P3-G02 — Contract Requests Review

2026-10-23, Asia/Saigon. **STATUS: NO_NEW_CONTRACT_REQUESTS**

Tất cả các kiểu dữ liệu, endpoint và tham số nghiệp vụ được công bố tại `docs/contracts/API_CONTRACT_V1.md` (R07–R10) và `docs/integration/P3_C02_OWNER_QUEUE_HANDOFF.md` đã đáp ứng đầy đủ 100% nhu cầu giao diện của chủ quán (Owner Orders FIFO Queue UI):

1. **GET `/api/owner/orders` (R07):**
   - Hỗ trợ đầy đủ `view` (`queue` | `exceptions` | `history`), `type` (`dine_in` | `takeaway`), `status`, `orderId`, `limit`, `cursor`.
   - Cung cấp `counts` toàn quán độc lập với bộ lọc.
   - Trả về `detail` tương ứng với `orderId` trong cùng một MVCC snapshot duy nhất, loại bỏ hoàn toàn hiện tượng network N+1.
2. **POST `/api/owner/queue/claim-next` (R08):**
   - Chỉ nhận `{ requestId }`, server tự quyết định đơn cũ nhất theo nguyên tắc FIFO nghiêm ngặt.
   - Trả về `OrderDetail` khi có đơn hoặc `null` khi hàng đợi rỗng.
3. **POST `/api/owner/orders/:id/ready` (R09):**
   - Nhận `{ requestId, expectedVersion }`, chuyển đơn từ `preparing` sang `ready`.
4. **POST `/api/owner/orders/:id/complete` (R10):**
   - Nhận `{ requestId, expectedVersion, type: 'dine_in' }`, chuyển đơn `ready` Dine-in sang `completed`.
   - Nghiêm ngặt từ chối Takeaway hoàn thành trực tiếp khi chưa xác minh mã nhận món.

Không có trường nào bị thiếu hoặc cần mở rộng thêm từ phía backend trong phạm vi Phase 3.
