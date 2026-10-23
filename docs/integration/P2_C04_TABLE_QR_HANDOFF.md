# P2-C04 — Owner Table Management & QR Lifecycle

Backend/API có implementation thật, không mock. Tài liệu này là nguồn tích hợp P2-C05 cho Gemini. Contract gốc R11/R17/R18 giữ nguyên fields/routes; mở rộng ở [CONTRACT_CHANGE_REQUEST](P2_C04_CONTRACT_CHANGE_REQUEST.md), chưa đồng nghĩa UI đã nối đúng hoặc đã in/scan QR thực tế.

## Types và adapters
    
`src/types/contracts/table-qr.ts` export `OwnerTable`, `OwnerQrCode`, `OwnerTableList`, `CreateTableInput`, `UpdateTableInput`, `WriteQrInput`, `RotateQrInput`.

`src/features/owner/api-client.ts` export:

- `fetchOwnerTables(tableId?)`, `createOwnerTable(input)`, `updateOwnerTable(id,input)`.
- `fetchOwnerQrCodes()`, `writeOwnerQrCode(input)`, `rotateOwnerQrCode(id,input)`.
- `MenuApiError` giữ `status`, `error.code`, `error.details`, `retryAfterSeconds`; lỗi mạng propagate riêng. Không Supabase SDK/service secret trong adapter.

`OwnerTable = TableSummary & {updatedAt,qr:OwnerQrCode|null}`. `OwnerQrCode = QRCodeView & {publicUrl,updatedAt,retiredAt:string|null}`. Session vẫn là `table.session`, không đổi thành currentSession. QR inactive/retired vẫn nằm trong danh sách QR; `table.qr` chỉ QR active, null nếu thiếu hoặc đã disable, không phải QR mock. Tìm lịch sử/bật lại qua danh sách QR theo `type==='table' && table.id===...`.

## HTTP contract

Tất cả owner routes: Auth.getUser và membership mỗi request, scope từ server, JSON envelope và `Cache-Control: private, no-store`. Mutation yêu cầu same Origin, JSON body <=4096 bytes, strict Zod, UUID requestId. Không nhận storeId/publicCode/sessionId từ client. Guest 401, authenticated không membership 403, resource ngoài quán 404 (không lộ tồn tại).

| Method / route | Body / query | Success |
| --- | --- | --- |
| GET /api/owner/tables | optional query tableId | 200 `{tables:OwnerTable[],detail:TableSessionDetail|null}` |
| POST /api/owner/tables | `{requestId,label}` | 201 **OwnerTable trực tiếp**, đã có QR |
| PATCH /api/owner/tables/:id | `{requestId,expectedUpdatedAt,label?,active?}`; ít nhất label/active | 200 **OwnerTable trực tiếp** |
| GET /api/owner/qr-codes | không query/body | 200 **OwnerQrCode[] trực tiếp** |
| POST /api/owner/qr-codes | frozen R18, xem dưới | 201 create / 200 set_active, **OwnerQrCode trực tiếp** |
| POST /api/owner/qr-codes/:id/rotate | `{requestId,expectedUpdatedAt,confirm:true}` | 201 **OwnerQrCode mới trực tiếp** |

Không có PATCH QR: dùng R18 `set_active`, không tạo route trùng chức năng. GET không tạo/rotate QR; không có DELETE hay session-close mới.

Ví dụ body (UUID minh họa, không tài khoản/secret thật):

```json
{"requestId":"c0400000-0000-4000-8000-000000000001","label":"Bàn 04"}
```

POST tables trả shape sau; UUID/code/timestamps thay theo DB, `publicUrl` theo server config:

```json
{"data":{"id":"c0400000-0000-4000-8000-000000000004","label":"Bàn 04","active":true,"updatedAt":"2026-10-23T13:00:00.123456+00:00","session":null,"qr":{"id":"c0400000-0000-4000-8000-000000000014","type":"table","table":{"id":"c0400000-0000-4000-8000-000000000004","label":"Bàn 04"},"publicCode":"48b5843aee54471bb984ec46ee532b9c","path":"/q/48b5843aee54471bb984ec46ee532b9c","publicUrl":"https://qr.example.invalid/q/48b5843aee54471bb984ec46ee532b9c","active":true,"updatedAt":"2026-10-23T13:00:00.123456+00:00","retiredAt":null}},"error":null}
```

PATCH đổi tên / bật tắt gửi **nguyên chuỗi** `table.updatedAt` từ snapshot. Không chuyển qua `Date.toISOString()` vì sẽ mất microseconds. Không dùng QR.updatedAt cho table patch.

```json
{"requestId":"c0400000-0000-4000-8000-000000000002","expectedUpdatedAt":"2026-10-23T13:00:00.123456+00:00","label":"Bàn sân vườn","active":true}
```

R18 create QR bàn legacy thiếu QR (không thay QR đang active):

```json
{"requestId":"c0400000-0000-4000-8000-000000000003","action":"create","type":"table","tableId":"c0400000-0000-4000-8000-000000000004"}
```

R18 create QR quầy (tableId **bắt buộc null**):

```json
{"requestId":"c0400000-0000-4000-8000-000000000005","action":"create","type":"takeaway","tableId":null}
```

```json
{"data":{"id":"c0400000-0000-4000-8000-000000000015","type":"takeaway","table":null,"publicCode":"abd21a0328bb49a88cb62500acee012a","path":"/q/abd21a0328bb49a88cb62500acee012a","publicUrl":"https://qr.example.invalid/q/abd21a0328bb49a88cb62500acee012a","active":true,"updatedAt":"2026-10-23T13:00:01.234567+00:00","retiredAt":null},"error":null}
```

Create khi đã có active QR trả 409 `INVALID_STATE_TRANSITION`, `details.field=activeQr`, không tự rotate/ensure thành công. Ensure UI = GET trước, create nếu thiếu; gặp race409 refetch. Để bật lại QR thường đã disable:

```json
{"requestId":"c0400000-0000-4000-8000-000000000006","action":"set_active","id":"c0400000-0000-4000-8000-000000000015","active":true}
```

Rotate có xác nhận: POST `/api/owner/qr-codes/<qr.id>/rotate`, dùng **QR.updatedAt**:

```json
{"requestId":"c0400000-0000-4000-8000-000000000007","expectedUpdatedAt":"2026-10-23T13:00:01.234567+00:00","confirm":true}
```

Response là QR **mới** với ID/code/URL mới, active=true, retiredAt=null. QR cũ giữ lịch sử active=false, retiredAt!=null, không bật lại được. UI cảnh báo URL đã in sẽ mất hiệu lực, cần in/dán lại; chỉ cập nhật thành công sau server response. Timeout/500 chưa chứng minh command thất bại: retry cùng requestId/payload, không sinh key mới.

## Policy và lỗi

- Label: chuẩn hóa whitespace Unicode thành space, trim, 1–80 ký tự, cấm control còn lại. DB unique store+lower(normalizedlabel). Không cấp nhãn bằng COUNT+1. Client tự đề xuất nhãn nhưng server có quyền từ chối.
- Tối đa 1 table QR active/bàn và 1 takeaway QR active/quán; partial unique DB và store gate serialize writes. Bàn mới + QR đầu tiên cùng transaction. Audit, outbox, operation result cũng cùng transaction, thất bại rollback toàn bộ.
- RequestId gắn store/action/actor/normalized payload. Replay trả snapshot gốc trước CAS/rate count, không ghi thêm audit. UI cần refetch sau replay để lấy trạng thái hiện tại; không để replay snapshot cũ overwrite snapshot mới.
- Rename giữ code/path/URL và QR.updatedAt; table.updatedAt đổi. GET/xem/tải/in lại luôn giữ code.
- Disable bàn không disable QR flag: resolver404 khi bàn inactive; bật lại phục hồi code cũ nếu QR vẫn active. Disable QR thường có thể bật lại nếu bàn active và không xung đột QR active khác.
- **Chặn disable bàn, disable/rotate QR table khi có bất kỳ phiên open hoặc checkout_pending**, kể cả credential hết TTL. Không tự đóng phiên hay thu hồi guest ngầm. Tạo lại QR thiếu không đóng phiên. Rename không làm mất xác minh hiện tại.
- Mở phiên R12 và verify R02 giữ nguyên P2-C01: table QR không tự tạo session, chưa verify chỉ xem menu, takeaway không mã phiên. TableSummary/detail không chứa sessionCode; chỉ private result R12 có credential.
- **Không có API đóng phiên trong P2-C01 hiện tại**. Không dựng nút đóng giả để vượt guard. Emergency revoke: hiện phải xử lý phiên theo quy trình quản trị có kiểm tra nghiệp vụ; không force-close/rotate qua public API. API settlement/close phải được triển khai/duyệt riêng ở phase sau. Tests đóng fixture bằng SQL admin local, không phải endpoint cho UI.

Quy trình khẩn cấp: chủ quán tạm ngừng nhận đơn (`accepting_orders=false` bằng công cụ quản trị được ủy quyền), thông báo bàn và kiểm tra phiên/đơn/thanh toán còn lại. Nếu còn phiên live, API disable/rotate vẫn trả409; chuyển quản trị xử lý phiên đúng nghiệp vụ, không bỏ guard hoặc chỉ chờ TTL. Chỉ sau khi phiên đã đóng hợp lệ mới disable/rotate, xác nhận QR cũ404, in/dán QR mới nếu rotate rồi mới mở nhận đơn trở lại. P2 hiện chưa có order/settlement/close nên UI không thể tự hoàn tất bước xử lý phiên; đây không phải quyền force-close được cấp cho client.

| HTTP | code | details.field / ý nghĩa UI |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | label khi trùng sau chuẩn hóa; không field khi schema sai |
| 401 / 403 | UNAUTHORIZED / FORBIDDEN | cần login / không membership, sai Origin hoặc actor replay |
| 404 | RESOURCE_NOT_FOUND | thiếu hoặc ngoài quán |
| 404 public | INVALID_QR | code thiếu/inactive/retired hoặc bàn inactive |
| 409 | INVALID_STATE_TRANSITION | activeSession: đang mở/chờ thu tiền; activeQr: đã có QR; expectedUpdatedAt: snapshot cũ; retiredQr: mã đã retire; rotation: QR không active/không hợp lệ để rotate |
| 422 | INVALID_STATE_TRANSITION | tableActive: bàn inactive (giữ HTTP R18 đã khóa) |
| 409 | DUPLICATE_REQUEST_CONFLICT | key dùng cho action/payload khác |
| 429 | RATE_LIMITED | retryAfterSeconds, header Retry-After; owner shared read120/write30/phút |
| 500 | INTERNAL_ERROR | APP_BASE_URL khi cấu hình thiếu/sai; DB/network lỗi trả sanitized envelope |

Ví dụ lỗi thực tế tương đương TABLE_LABEL_CONFLICT/ACTIVE_SESSION_EXISTS của prompt, không thêm enum vào contract đóng băng:

```json
{"data":null,"error":{"code":"INVALID_STATE_TRANSITION","message":"Bàn không hoạt động hoặc đã có phiên đang mở.","details":{"field":"activeSession"}}}
```

UI nên map code **và field** thành thông báo; generic message hiện hữu không diễn tả mọi tình huống QR.

## URL / QR render và cấu hình

`.env.example`: thêm `APP_BASE_URL=`. Dev ví dụ `http://localhost:3000`; deployment bắt buộc HTTPS, origin không path/query/hash/user/password. Server dùng `new URL('/q/'+encodeURIComponent(code),base)`, không nhận Host/X-Forwarded-Host/body làm base. Thiếu/sai config fail trước mutation, không in URL đoán. Đổi canonical origin là thay đổi deployment có chủ đích; không đổi publicCode và không tự redirect QR giấy ở domain cũ.

QR renderer/download/print của Gemini phải dùng **qr.publicUrl** server trả về, không ghép `window.location.origin + qr.path`, không gửi URL cho QR API bên ngoài. URL không chứa store UUID, sessionCode, guest/owner token. QR code dùng CSPRNG128-bit; QR là public locator, không phải quyền đặt món. Chưa có server PNG/PDF/print endpoint.

## Migration / kiểm chứng / phần chưa triển khai

Migration `supabase/migrations/20261023000600_owner_table_qr_lifecycle.sql` tăng dần, giữ code/data cũ, abort nguyên transaction nếu nhãn/QR active legacy trùng hoặc label không hợp lệ. Đọc [P2_C04_MIGRATION_PREFLIGHT.md](P2_C04_MIGRATION_PREFLIGHT.md) trước apply. Local đã apply; remote **NOT_APPLIED** trong task này, không có quản trị SQL remote. `.env.local` không bị sửa bởi P2-C04.

Các test thực tế và command/status được cập nhật trong [P2_C04_REVIEW.md](P2_C04_REVIEW.md). Backend mới không có endpoint mock. Order/history trong session detail giữ `orders:[]`, orderCount/total 0 của Phase2 vì chưa triển khai order, không giả là bill thực tế. Không triển khai FIFO/payment/realtime/session close.

## Các điểm Gemini phải nối trong P2-C05

Qua khảo sát UI đang được viết đồng thời (không chỉnh file của Gemini):

1. `AddEditTableDialog` và `TableManagementView` PATCH còn thiếu expectedUpdatedAt; đổi type TableSummary sang additive OwnerTable. POST/PATCH nhận **json.data**, không `json.data.table`; bỏ fallback tạo ID `table-${Date.now()}` hoặc optimistic giả thành công.
2. `TableQrModal` rotate đang dùng R18 create; phải đổi sang endpoint `/:id/rotate` với confirm:true và QR.updatedAt. Create không tự thay mã active.
3. `TableQrModal`/`TakeawayQrCard`: dùng publicUrl từ server, không tự ghép browser origin/path; create takeaway gửi tableId:null. Rotate takeaway dùng endpoint rotate, không create.
4. Retry sau network giữ requestId/payload của command chưa rõ kết quả; intent mới mới sinh key. Sau409 refetch, giữ form input và hiển thị lý do field; sau rotate thành công nhắc in/dán lại.
5. P2-C05 cần browser test login, tạo/sửa/tắt/bật, mở phiên, verify, tải/in/scan QR và responsive. Backend HTTP test không thay nghiệm thu UI hoặc QR encoder/scanner thực tế.
