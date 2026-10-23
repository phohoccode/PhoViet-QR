# P2-C04: resolver migration preflight audit

23/10/2026. Chưa chạy DDL, migration hay thay đổi dữ liệu trên Production trong task này.

## Bằng chứng và giới hạn kết luận

Lỗi báo cáo: `P0001: P2-C04 resolver preflight: unexpected rate marker`.

Đã tái hiện đúng lỗi trên PostgreSQL local với database tạm, thân hàm migration003 nguyên bản và SQL migration gửi dưới dạng CRLF. Nguyên nhân của trường hợp tái hiện là **chuẩn hóa xuống dòng không đối xứng**:

```text
source sau replace: if action='resolve' then<LF>   retry:=public.p2_rate('read:'
marker dollar quote: if action='resolve' then<CR><LF>   retry:=public.p2_rate('read:'
position(marker in source) = 0
```

PostgreSQL giữ CRLF bên trong dollar-quoted literal. `pg_get_functiondef()` không phải bộ chuẩn hóa source PL/pgSQL. Bản cũ chuẩn hóa CRLF → LF ở source nhưng không chuẩn hóa marker. Marker đầu tiên chỉ có một dòng nên vẫn khớp; marker rate nhiều dòng thất bại. Đây là lỗi của cách patch source, không phải bằng chứng rate limiter trên DB bị hỏng. LF ở file local không bảo đảm SQL được gửi qua editor/clipboard vẫn là LF.

**Chưa thể khẳng định Production chỉ có lỗi CRLF.** Hiện không có SQL admin connection, chỉ có service-role REST. Ảnh SQL Editor người dùng gửi chỉ chứa kết quả SELECT cuối: 3 bàn, 3 QR, 3 phiên; chưa có function definition, metadata hay marker diagnostics. Không suy ra rollback/schema/function đúng từ số lượng bản ghi này.

`supabase/diagnostics/p2_c04_resolver_preflight.sql` đã đổi sang **một JSON duy nhất** vì SQL Editor chỉ hiện result set cuối trong lần chạy trước. Chạy nguyên file ở đúng project, Export → JSON và gửi kết quả để đối chiếu. Script dùng READ ONLY + ROLLBACK, không gọi resolver/RPC, không đọc mã phiên, artifact, cookie hay code_hash của bản ghi.

Cập nhật23/10/2026: người dùng trả lời **“đã ok r”** sau yêu cầu gửi JSON. Ghi nhận người dùng báo vấn đề đã xử lý; chưa có JSON/function definition bổ sung để xác minh độc lập. Không tiếp tục yêu cầu phản hồi như một điều kiện chặn công việc audit local, không tự áp dụng thay đổi Production và không đổi kết luận nguyên nhân Production thành đã xác nhận. Kết quả gate tổng hợp ở [P2-C05 readiness](P2_C05_CODEX_READINESS.md).

## So sánh Local với nền tảng

Checksum dưới đây là MD5 của **prosrc đã đổi CRLF thành LF**, không phải checksum toàn bộ `pg_get_functiondef` (header có thể được PostgreSQL định dạng lại).

| Nguồn | LF body MD5 | Kết luận |
| --- | --- | --- |
| Migration003 nguyên bản, sau 001–005 | `7fb5e08b689e4bd0f6f2ac1b98130396` | Baseline được hỗ trợ |
| Local hiện đang chạy sau migration006 | `f80bcdba939630909ac8cf32cc8b8280` | Đúng thân hàm sau thay đổi lock order |
| Production | Chờ JSON diagnostic | Chưa đối chiếu được |

Migration004 chỉ cấp quyền khóa dòng; migration005 không định nghĩa lại `p2_execute`. Do đó nền tảng mong đợi trước006 vẫn là body migration003.

Đọc JSON Production:

- `function.body_status = migration003_baseline`, metadata invoker / PLpgSQL / `search_path=pg_catalog`, `normalized_lf_marker_position > 0`, `old_crlf_marker_in_normalized_source = 0`: thân hàm khớp nền tảng; marker CRLF của SQL gửi vào sẽ gây đúng lỗi đã tái hiện.
- `unknown_drift_inspect_definition`: cần so sánh `function_definition` trước khi bổ sung bất cứ baseline nào. Không đổi checksum để bỏ qua khác biệt.
- `migration006_patched` hoặc các artifact006 đã có: kiểm tra lịch sử triển khai trước; không chạy lại migration006 như một fresh install.
- Sau lần006 thất bại atomic, kỳ vọng lifecycle_rpc / label_normalizer / audit_table = null, retired_at_column = false. Chưa xác nhận điều này trên Production.

Nếu JSON cho thấy baseline khớp, vẫn cần phân biệt định dạng file SQL thực tế đã chạy với file hiện tại; không thể suy ngược byte clipboard từ `prosrc` đơn lẻ. Nếu baseline khác, kết luận nguyên nhân phải dựa trên diff Production thực tế.

## SQL đã sửa

File đầy đủ: `supabase/migrations/20261023000600_owner_table_qr_lifecycle.sql`, khối resolver bắt đầu sau comment lock order.

1. Kiểm tra signature, language, invoker, kiểu trả về và search_path; kiểm tra checksum **toàn thân hàm baseline**, chỉ dung nạp khác biệt CRLF/LF. Thay đổi cả comment/indentation ngoài phạm vi này cũng dừng để review.
2. Chuẩn hóa CRLF/LF ở source, marker và replacement. Không dùng regex xóa whitespace hay ghi đè hàm Production bằng một bản canonical không được kiểm tra.
3. Yêu cầu khối resolver/rate đầy đủ xuất hiện **đúng một lần**. Khối bao gồm lookup, kiểm tra INVALID_QR, store/table scope và toàn bộ rate limit 60 lượt/phút cùng response retry.
4. Thay đúng khối đó; kiểm tra checksum body dự kiến trước execute và checksum body đã cài sau execute. Bất cứ sai lệch nào cũng raise exception.
5. Giữ nguyên preflight dữ liệu, constraints, unique indexes, permissions, audit, idempotency và các guard vòng đời của006.

MD5 ở đây là checksum đối chiếu source trong quy trình quản trị, không dùng để xác thực dữ liệu không tin cậy hay bảo vệ mật khẩu.

## Khóa và hành vi được bảo toàn

Đối với QR bàn: locator QR đầu tiên không khóa và chưa cấp quyền → khóa bàn active FOR SHARE → đọc lại QR active FOR SHARE → rate limit/browser context → khóa phiên FOR SHARE. Identity/scope của QR bị chặn thay đổi bởi lifecycle guard; QR inactive/retired sau locator bị loại khi đọc lại dưới khóa. Bàn inactive bị loại trước khi cấp quyền. Đối với takeaway, không có bàn/phiên, nhưng QR vẫn được đọc lại dưới khóa trước rate limit và return.

Lệnh lifecycle giữ thứ tự store → bàn → QR; open-session giữ store → bàn trước khi tạo phiên. Resolver không khóa store row, tránh vòng QR-share → chờ bàn trong khi lifecycle giữ bàn → chờ QR. Verify/guest/menu dùng cùng resolver nên nhận cùng lock order. Phần verify limits, hash/grant/expiry, owner authorization, replay, open-session và các branch khác không đổi. Kiểm thử race local không thay thế việc giám sát deadlock đối với các tác vụ quản trị ngoài API.

## Atomic, dữ liệu và rollback

Giữ nguyên một BEGIN/COMMIT, không chia khối, không dùng CREATE INDEX CONCURRENTLY. Có khóa bảng trong thời gian triển khai; chọn thời điểm triển khai phù hợp sau review. Không thêm INSERT/UPDATE/DELETE vào bàn, QR, phiên hay thao tác reconcile tự động. Cột retired_at mới có giá trị null cho hàng cũ; mã public QR và default hiện có của từng hàng không đổi.

Exception ở preflight hoặc bất cứ DDL nào abort toàn transaction; runner phải rollback transaction lỗi trước khi chạy lại. Đã kiểm tra cả trường hợp chạy thành công nhưng kết thúc bằng ROLLBACK trên scratch DB, toàn bộ logical schema/grants/function/data trở về baseline. Đây là rollback **trước COMMIT**; không khẳng định có thể undo an toàn sau COMMIT khi API đã tạo dữ liệu mới. Không cung cấp down migration xóa bảng/audit/QR.

## Kiểm chứng

- 52/52 integration tests PASS (6 file), gồm lifecycle CRUD/CAS/replay, phiên/guest, menu, concurrency resolve-vs-rotate và open-vs-disable.
- 10 test resolver migration riêng: bốn tổ hợp LF/CRLF; tái hiện lỗi marker cũ; từ chối thay đổi rate policy, thiếu/trùng marker, mất session lock; rollback trước commit; so sánh logical schema/default/index/policy/grant/trigger/function và toàn bộ hàng fixture trước/sau lỗi. Fixtures bao gồm phiên đang mở, QR bàn và takeaway.
- Kiểm tra resource rows không đổi sau migration thành công, constraints validated, ba unique indexes và lượt resolve thứ61 trả RATE_LIMITED.
- HTTP smoke trên Next production build **kết nối Supabase local** PASS: owner/guest/nonmember auth, create/list/rename/replay/CAS, takeaway, active session guards, verify, rotate/replay/retired QR, Retry-After và không lộ credential qua log.
- ESLint PASS. Không có các xác nhận tương ứng trên Production lúc viết báo cáo.

Lệnh kiểm tra:

```powershell
node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts
node tests/integration/table-qr-http.mjs
npm run lint
```

## Trình tự Production sau khi nhận JSON

1. Đối chiếu actual definition/metadata/marker và artifact006 với bảng trên. Nếu khác thì dừng và review diff, không bỏ guard.
2. Chạy data-conflict preflight trong `P2_C04_MIGRATION_PREFLIGHT.md`; không sửa dữ liệu để vượt qua guard trong task này.
3. Review SQL sửa, snapshot/backup và kế hoạch deployment. Chỉ áp dụng toàn file sau khi kiểm tra đầy đủ và có chỉ thị triển khai phù hợp; task này chưa áp dụng Production.
4. Sau apply, chạy lại diagnostic chỉ đọc: body_status patched; RPC/normalizer/audit/retired_at có; index/constraint/trigger đúng; authenticated_update_qr_active=false; service_update_store_timestamp=true; anon_execute_resolver=false; service_execute_resolver=true. Kiểm tra quyền lifecycle RPC bằng các câu SELECT trong preflight guide.
5. Smoke GET owner tables/QR, resolve QR đã in, verify với phiên hợp lệ và menu trên scope hợp lệ. Không rotate, tạo thêm takeaway hoặc tắt bàn/QR đang dùng chỉ để test Production. Những thao tác resolve/verify có thể ghi rate bucket/guest context theo thiết kế, nên phân biệt với diagnostic READ ONLY.

Không coi Production đã nghiệm thu trước khi có kết quả các bước này.
