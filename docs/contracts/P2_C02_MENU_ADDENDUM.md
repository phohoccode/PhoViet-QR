# P2-C02 — Menu contract addendum

23/10/2026. Prompt P2-C02 giao triển khai CRUD danh mục và quyền cập nhật contract. Addendum này thay giới hạn “category CRUD cần CONTRACT_REQUEST” của R14/P1 handoff cho đúng phạm vi mới. Không sửa shape R03/R14/R15/R16 hoặc error enum; không mở cart/order API.

## Canonical contract

- R03 trả `MenuV1View {categories,items,menuRevision,serverTime}`, không lồng items trong category, không thêm store/orderType vào shape đã duyệt. Ghép `QRResolution.mode` (`dine_in|takeaway`) và store/table từ R01; `type=table` là loại QR, không phải OrderType.
- `MenuCategory`, `MenuItem`, `MenuOption`, `MenuItemFields`, `CreateMenuItemInput`, `PatchMenuItemInput`, `OwnerMenuItem`, `OwnerMenuView` giữ nguyên trong `types.ts`.
- Bổ sung `OwnerMenuCategory = MenuCategory & {active:boolean,updatedAt:ISO}`, `CreateMenuCategoryInput {requestId,name,sortOrder,active}`, `PatchMenuCategoryInput {requestId,expectedUpdatedAt,name?,sortOrder?,active?}`. Patch cần ít nhất một field; không nullable.
- Alias không đổi dữ liệu: `PublicMenuResponse=MenuV1View`, `OwnerMenuResponse=OwnerMenuView`.

## Category endpoints bổ sung

| Method/path | Input | Output / status |
| --- | --- | --- |
| GET /api/owner/menu/categories | Không query/body | OwnerMenuCategory[] /200 |
| POST /api/owner/menu/categories | CreateMenuCategoryInput | OwnerMenuCategory /201 |
| PATCH /api/owner/menu/categories/:id | PatchMenuCategoryInput | OwnerMenuCategory /200 |

Mọi route cần Auth.getUser+membership từng request, tenant từ membership. Mutation kiểm Origin, unknown fields400, UUID thật, body tối đa4096bytes; requestId caller giữ nguyên cho retry, idempotency actor-bound. Replay trước stale-CAS check; khác payload409 DUPLICATE_REQUEST_CONFLICT; actor khác403. `expectedUpdatedAt` giữ nguyên string từ GET categories, không round-trip qua Date làm mất microseconds. R14 categories không thêm updatedAt: muốn sửa category dùng GET categories mới.

Danh mục inactive ẩn cả món của nó trên public; owner mặc định vẫn thấy mọi item và option. `includeInactive=false` lọc category/item inactive và món dưới category inactive. Item create/move chỉ nhận category active cùng quán; patch availability/active của item hiện hữu dưới category inactive vẫn cho phép chỉnh, nhưng không làm nó xuất hiện trên public.

## Input và lỗi

- Name trim1–120; description string<=1000 hoặc null. Giá/delta integer0..Number.MAX_SAFE_INTEGER, DB bigint cùng CHECK; zero là giá menu hợp lệ. Takeaway 0-VND checkout policy thuộc Phase3/4.
- Option cộng thêm, optional, mỗi ID chọn tối đa một lần; không required/group/min/max hoặc size loại trừ. Write tối đa50options và toàn body4096bytes. `available` DTO map `active` DB. Public chỉ option active; owner có inactive để khôi phục. Bỏ option khỏi replacement→deactivate, không delete. New option không ID; create item có option ID hoặc patch option ID lạ/trùng→422 VALIDATION_ERROR. Không ghi snapshot lịch sử tại menu API.
- Image URL chỉ host chính xác `images.unsplash.com`, HTTPS, không credentials/port bất thường/fragment, <=2048, chuẩn hóa URL trước lưu. Không fetch/proxy URL ở server, không upload. Thêm host cần sửa validation+DB CHECK cùng nhau. IMAGE_UPLOAD_DEFERRED.
- Category names unique theo `(store,lower(btrim(name)))`, kể cả inactive; duplicate422 VALIDATION_ERROR. Item names không unique.
- 400 VALIDATION_ERROR cho schema/field lạ/negative/float/unsafe image; 422 VALIDATION_ERROR cho nghiệp vụ option/category inactive/duplicate category. Không tạo CATEGORY_NOT_FOUND/MENU_ITEM_NOT_FOUND/INVALID_OPTION enums mới.
- 401 UNAUTHORIZED guest owner route;403 FORBIDDEN nonmember/actor/Origin;404 RESOURCE_NOT_FOUND owner item/category ngoài scope;404 INVALID_QR public QR invalid/table inactive. Stale updatedAt409 INVALID_STATE_TRANSITION;429 RATE_LIMITED có Retry-After/details;500 INTERNAL_ERROR sanitized.

## Revision, concurrency và cache

`stores.menu_revision` UUID opaque riêng với stores.version. Triggers đổi revision cùng transaction mỗi item/option/category change, kể cả trusted SQL; SQL seed phải lock store trước menu. Timestamps monotonic với microsecond precision. Command lock order operation→store→menu row; replacement rows/audit/outbox/idempotency cùng transaction. Replay trả snapshot cũ của command, không tự thay bằng GET mới; UI refetch R14 để lấy revision mới. Outbox chỉ persist metadata invalidation, không publisher/realtime task này.

Public menu snapshot SQL stable đọc categories/items/options/revision từ cùng snapshot. R03 dùng resolver P2-C01 trong cùng transaction để giữ activity/QR/table locks, không đòi verify grant và không trả session/grant. Store pause vẫn browse như R01. Tất cả response `Cache-Control: private, no-store`, không ETag/CDN/revalidate. Mỗi GET mới thấy committed menu tại thời điểm snapshot; không hứa dữ liệu không thể đổi sau response.

Runtime schemas: `src/lib/validations/menu.ts`. Fixtures envelope: [public](fixtures/menu-public.json), [owner](fixtures/menu-owner.json), 2category/4public items, available/unavailable, 2options, null ảnh/description, giá0. Unit tests parse bằng schemas; typed adapters không mock fallback.
