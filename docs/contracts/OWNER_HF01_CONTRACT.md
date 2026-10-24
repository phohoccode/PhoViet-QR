# OWNER HF01 — contract cho tích hợp Gemini

Ngày 2026-10-24. Additive; giữ response `{ data, error }`, cookie Auth,
Origin guard và tenant do server xác minh. Không nhận storeId/path tùy ý từ UI.

## Bảng thay đổi đã chốt trước triển khai

| Hiện tại | Sau hotfix |
| --- | --- |
| Bàn chỉ có active | Thêm archived_at, archive giữ nguyên lịch sử và retire QR |
| Danh mục/món chỉ có active | Thêm archived_at; thao tác xóa tách biệt với ẩn tạm |
| image_url chỉ Unsplash | Giữ URL cũ, thêm image_path và registry ảnh upload có TTL |
| Chưa có Storage | Bucket menu-images, public read, chỉ server được ghi qua Storage API |

## Archive

| Route | Method | Input | data |
| --- | --- | --- | --- |
| /api/owner/tables/:id | DELETE | không body/query | `{ success: true, id, archivedAt }` |
| /api/owner/menu/categories/:id | DELETE | không body/query | `{ success: true, id, archivedAt }` |
| /api/owner/menu/:id | DELETE | không body/query | `{ success: true, id, archivedAt }` |

Lặp lại trả thành công cùng archivedAt; không hard delete. UUID thuộc store khác
trả RESOURCE_NOT_FOUND (404). Chưa login UNAUTHORIZED (401), không là owner
FORBIDDEN (403). TABLE_IN_USE (409) khi open/checkout_pending, còn đơn chưa hoàn
thành, hoặc phiên có đơn tính tiền nhưng chưa có settlement thành công.
CATEGORY_NOT_EMPTY (409) có `error.details.count`: đếm mọi món còn tham chiếu,
kể cả inactive/archived. Cần chuyển món sang danh mục khác trước khi archive món
nếu muốn xóa danh mục đó. Không cascade. `canDelete` nếu UI tính chỉ là gợi ý.
Archive món không làm thay đổi đơn đã nhận; stale checkout trả ITEM_UNAVAILABLE
(409, details.menuItemIds). Archived không có luồng restore trong hotfix.

## Upload và lưu ảnh

`POST /api/owner/menu/upload`, multipart có đúng một field `file`.
JPEG/PNG/WebP, tối đa 5 MiB, kiểm tra bytes và giải mã ở server; client cũng giới
hạn 5 MiB. Trả `data: { url, imageUrl, storagePath, expiresAt }`.
Adapter browser thu nhỏ ảnh >4 MiB về tối đa 1600 px và <=4 MiB trước multipart
để phù hợp Vercel body limit; server vẫn tự giải mã, normalize và kiểm quyền.
`url` là alias tương thích adapter UI; response vẫn nằm trong envelope `data`.

Flow thêm/sửa: upload → nhận URL → truyền `imageUrl` vào POST/PATCH menu hiện
có. Server chỉ nhận URL Unsplash cũ hoặc URL upload đã ready, chưa hết hạn,
thuộc đúng store. Không cần truyền storagePath vào mutation; server tự resolve
và persist `image_path`. Owner item DTO thêm `imagePath` và `archivedAt`.
Public item DTO giữ imageUrl. Tạo món không ảnh dùng imageUrl:null.

Xóa ảnh: PATCH menu/:id với imageUrl:null và requestId/expectedUpdatedAt như
contract cũ. Thay ảnh: upload URL mới rồi PATCH. Đợi mutation thành công mới
đóng form; nếu lưu lỗi giữ form và URL để retry trong TTL 24 giờ. Hủy form không
cần xóa trực tiếp object: registry TTL + cleanup worker dọn ảnh không tham chiếu.
Ảnh cũ chỉ dọn sau commit cập nhật, không xóa ảnh Unsplash; lỗi cleanup không
được làm hỏng ảnh mới. Khi sửa form không thay ảnh, có thể bỏ imageUrl khỏi PATCH.

FILE_TOO_LARGE (413), UNSUPPORTED_MEDIA_TYPE (415), UPLOAD_FAILED (503),
VALIDATION_ERROR (400 ở schema/multipart, 422 ở menu business validation cũ), INVALID_STATE_TRANSITION (409 cho stale edit),
DUPLICATE_REQUEST_CONFLICT (409), RATE_LIMITED (429) giữ nguyên envelope.
Không dùng mã AUTH_REQUIRED/CONFLICT mới vì UNAUTHORIZED và các mã hiện có đủ.

## Security và vận hành

Storage write chỉ qua server proxy đã xác minh owner/store, service key không ra
browser. Bucket không có INSERT/UPDATE/DELETE policy cho anon/authenticated.
Registry được RLS bảo vệ, không có quyền guest/owner trực tiếp. Tên object do
server tạo, không tin filename hay path từ request. Public URLs là ảnh menu công
khai, không chứa credential. GET ảnh qua next/image cấu hình đúng host/path.
Cleanup được gọi có giới hạn sau owner menu GET (Next after) và bằng internal
worker. vercel.json lên lịch GET /api/internal/menu-images/cleanup mỗi ngày;
cấu hình CRON_SECRET (server-only, ít nhất 32 ký tự). Manual POST cùng route
dùng PAYMENT_RECONCILE_SECRET. Ngoài Vercel cần scheduler theo report.

Các component/dialog/CSS thuộc Gemini. Backend không thay thiết kế UI.
