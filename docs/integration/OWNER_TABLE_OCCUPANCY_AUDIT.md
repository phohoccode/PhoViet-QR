# Audit tab Bàn: trạng thái trống, số lượng và Ngưng dùng

Ngày 24/10/2026, Asia/Saigon. Phạm vi: audit source hiện tại, đối chiếu dữ liệu Supabase cấu hình bằng SELECT, kiểm tra guard trên PostgreSQL local. Không thay đổi runtime, migration hoặc dữ liệu Production.

## Kết luận

1. **Bàn trống = bàn đang dùng và không có phiên open/checkout_pending.** Không căn cứ số món hoặc đơn đã completed. Hiện cả7 bàn trên project cấu hình đều có phiên open nên0 bàn trống là đúng theo trạng thái DB.
2. **Số đơn và tạm tính bị trả cố định0 trong SQL projection.** Đây là khoảng trống tích hợp thật, không phải khách chưa đặt đơn. Bấm Làm mới không khắc phục được SQL đang hardcode.
3. **UI ghi sai đơn vị:** `orderCount` là số đơn, nhưng card ghi “món”. Một đơn có thể có nhiều phần món. Cần tách rõ số đơn và tổng quantity.
4. **Tab Bàn không polling/refetch theo đơn mới.** Hiện tải khi vào tab, bấm Làm mới hoặc sau một số thao tác bàn/QR. Khi sửa projection, cần cơ chế cập nhật có giới hạn để nhận số liệu mới khi đang đứng ở tab.
5. **Ngưng dùng bị khóa có chủ ý khi còn phiên.** Guard tồn tại ở cả UI và SQL; không nên bỏ để ép bàn về trống. Luồng kết thúc phiên/thanh toán chưa có endpoint/UI nên hiện thiếu cách trả bàn về trống qua ứng dụng.

## Dữ liệu thực tế đối chiếu

SELECT trên `dining_tables`, `table_sessions`, `orders` của project trong cấu hình hiện hành. Chỉ đọc public identifiers, status, quantity và tổng tiền; không đọc/hiển thị PIN, cookie, key hay ghi chú khách. Số liệu là snapshot tại thời điểm audit, không là dữ liệu mock hoặc dự báo.

| Bàn | Phiên | Số đơn thật | Tổng phần món không cancelled | Tổng tạm tính không cancelled |
| --- | --- | --- | --- | --- |
| Bàn01 |open|0|0|0đ|
| Bàn02 |open|0|0|0đ|
| Bàn03 |open|0|0|0đ|
| Bàn5 |open|0|0|0đ|
| bàn6 |open|5|16|490.000đ|
| Bàn7 |open|0|0|0đ|
| Bàn8 |open|2|4|81.000đ|

Cả7 bàn active=true, PIN chưa hết hạn tại lúc đọc. Bàn không có đơn vẫn có thể đang phục vụ vì chủ quán đã mở phiên. Dữ liệu này chứng minh việc card bàn6/Bàn8 hiển thị0 không phản ánh các đơn đã lưu. Không thể dùng việc chưa có đơn để tự kết luận khách đã rời bàn.

Không có quyền đọc pg_catalog từ kết nối REST đang dùng; định nghĩa hàm Production chưa được xuất trong audit này. Vị trí hardcode dưới đây được xác nhận trong source migration, không tuyên bố đã tải function body Production.

## Đường đi và nguyên nhân gốc

`GET /api/owner/tables` → `listManagedTables` → RPC `p2_table_qr_execute('tables',...)` → `p2_managed_table_view` → `p2_session_view`.

- `supabase/migrations/20261023000300_table_sessions_guest_access.sql`: projection Phase2 khởi đầu trả `orderCount=0`, `totalVnd=0`, vì lúc đó chưa có orders.
- `supabase/migrations/20261024000900_six_digit_table_pin.sql:70`: hotfix PIN vẫn giữ hai hằng0, chỉ bổ sung pinState. Migration007/008 đã thêm orders/FIFO nhưng chưa nối tổng hợp phiên vào projection này. Đây là phần nối còn thiếu giữa Phase2 và Phase3, không phải do định dạng PIN.
- `supabase/migrations/20261023000600_owner_table_qr_lifecycle.sql:140`: managed table lấy phiên chỉ theo status open/checkout_pending. PIN hết hạn chỉ ngăn xác minh, không tự đóng phiên hoặc giải phóng bàn.
- Cùng migration006, nhánh tables trả `detail.orders=[]` cố định. Cần nối dữ liệu đơn thật cho phần bill/detail khi triển khai, không chỉ sửa số trên card.
- `src/components/owner/tables/TableManagementView.tsx`: filter empty dùng `t.active && t.session === null`; occupied dùng `t.active && t.session !== null`. Card dùng `session.orderCount` rồi ghi nhãn “món”, trong khi `docs/contracts/types.ts` định nghĩa orderCount là mọi đơn trong phiên, kể cả cancelled; totalVnd loại cancelled.
- `src/components/owner/OwnerShell.tsx`: effect tải một lần lúc chuyển tab; không có chu kỳ poll, listener online/visibility hoặc invalidation từ đơn mới cho danh sách bàn. Nút Làm mới có gọi API thật nhưng API vẫn trả hai hằng0.
- Chi tiết bàn giữ nguyên object được chọn trong state `selectedTableForDetail`; chỉ refresh danh sách cha chưa đảm bảo dialog đang mở nhận snapshot mới. Cần tìm bản ghi mới theo id khi props tables đổi.

## Khi nào Ngưng dùng được bật?

UI: `disabled={isToggling || isOccupied}`, với `isOccupied = t.session !== null`.

SQL: migration006, action update_table từ chối active=false khi tồn tại phiên open/checkout_pending, trả409 `INVALID_STATE_TRANSITION`, `details.field='activeSession'`. Việc disable đúng ở cả hai lớp, kể cả phiên0 đơn; không có lỗ hổng đơn giản bằng cách gọi PATCH trực tiếp.

“Ngưng dùng bàn” là đưa bàn ra khỏi phục vụ, không phải xác nhận đã thanh toán hoặc kết thúc lượt khách. `completed` chỉ nghĩa món đã phục vụ, không chuyển paid/đóng phiên. Bàn phải kết thúc phiên hợp lệ trước rồi mới được ngưng dùng. PIN hết hạn cũng không tự xóa khoản phải thu.

## Phần chưa được triển khai

Source `src/app/api/owner` chưa có R13 settle/close runtime route. TableDetailDialog chưa có hành động thanh toán/kết thúc phiên. Nút “Đóng” ở footer chỉ chạy `handleAnimatedClose` để đóng hộp thoại, không gọi API và không đổi status bàn.

PLAN Phase5 và TASKS T-047/T-048/T-050 dành cho tổng bill, checkout/settlement và đóng bàn. Vòng đời dự kiến là open → checkout_pending → confirm_received/settlement → closed; chỉ sau đó table.session=null trên grid. Theo policy hiện có, không tự đóng khi còn khoản phải thu hay đơn chưa hoàn tất. Đóng phiên phải revoke guest cùng transaction; phiên closed không mở lại, lượt khách sau dùng session mới.

## Hướng sửa đúng

1. Backend: migration additive sau009 thay projection bằng tổng hợp theo **store_id + table_session_id**, từ snapshot orders. Giữ orderCount theo contract; bổ sung itemCount rõ nghĩa nếu muốn hiển thị “phần món”; total loại cancelled. Dữ liệu phiên không được dựa giá menu hiện tại. Tránh per-order network calls; aggregate cho cả grid trong DB, giữ tenant/auth/ACL và PIN metadata.
2. Backend/detail: nối orders thật vào TableSessionDetail; kiểm tra tổng tiền an toàn và semantics cancelled/paid. Không suy paymentStatus=paid từ completed/closed khi chưa có ledger settlement.
3. Gemini UI: dùng đúng nhãn “đơn” hoặc itemCount cho “phần món”; refetch visible/online có dedupe/backoff/Retry-After hoặc nút cập nhật rõ ràng; đồng bộ dialog theo table id; giải thích tại nút khóa “Cần kết thúc phiên trước khi ngưng dùng”. Không gọi tính năng này realtime khi chưa có subscription.
4. Luồng trả bàn: triển khai checkout/settlement/close theo scope Phase5, có auth, idempotency/version, khóa cùng create-order, guard đơn chưa giao và thu tiền, audit/revoke atomic. Có thể thiết kế kết thúc phiên trống riêng nhưng phải nêu rõ policy; không tự đóng7 phiên hiện có hoặc biến zero-order thành quyền xóa phiên.

Audit này không yêu cầu sửa/triển khai Production, vì vậy không tự chạy migration mới, đóng phiên hoặc đổi số liệu tài chính để làm màn hình trông đúng.

## Kiểm tra đã thực thi

```text
node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts tests/integration/table-qr.test.ts -t "renames without|blocks disabling" --disableConsoleIntercept
Test Files:1 passed
Tests:2 passed,11 skipped
```

Hai test dùng PostgreSQL/Supabase local, random fixtures, không Production: chứng minh bàn không có phiên disable/re-enable được; bàn open/checkout_pending bị chặn disable/QR lifecycle; sau SQL close trong fixture, guard được giải phóng. Đây không là bằng chứng ứng dụng đã có API đóng bàn. Runtime UI/browser cho việc số liệu cập nhật tự động chưa có vì tính năng chưa được nối; không đánh dấu PASS.
