# P2-C02 — Public menu / owner CRUD handoff

23/10/2026. Backend local có API thật; không sửa UI Gemini. Remote migration/seed và browser acceptance chưa thực hiện trong task này. Menu không trao quyền đặt món.

## Schema và migration

Apply lần lượt foundation001, privileges002, sessions003, row-lock fix004 nếu chưa có; sau đó **`supabase/migrations/20261023000500_menu.sql`**. Không chạy lại CREATE của migration đã apply.005 additive: `menu_categories`, `menu_items`, `menu_item_options`, `menu_audit_log`; thêm `stores.menu_revision` opaque UUID. Không drop/rename bảng cũ, không orders/payment.

Same-store composite FKs, bigint CHECK0..MAX_SAFE_INTEGER, normalized category unique `(store_id,lower(btrim(name)))`, deterministic indexes, RLS deny anon/authenticated. Service-role có SELECT/INSERT/UPDATE menu, không DELETE; audit chỉ SELECT/INSERT. Invoker RPC/functions service-role-only; Auth/membership được kiểm tra tại handler và trong RPC.

Mutation lock operation→store→menu row; CAS timestamp, options replacement, revision trigger, operation result, audit và outbox metadata commit cùng transaction. SQL import phải lock store trước menu; không chạy DML trực tiếp từ browser. Timestamp giữ microsecond; **không dùng Date.toISOString() để tạo lại expectedUpdatedAt**.

## Endpoints LIVE local

Mọi response envelope `{data,error:null}` hoặc `{data:null,error:{code,message,details?}}`, `Cache-Control: private, no-store`, không ETag/revalidate/CDN. Public GET chỉ whitelist; query lạ/trùng bị400. Owner Auth.getUser+membership mỗi request. POST/PATCH cần Origin cùng site, JSON, tối đa4096bytes; không nhận storeId, unknown fields bị400.

| Method / path | Input | Output |
| --- | --- | --- |
| GET /api/public/menu?qrCode=… | public URL-safe locator1–128 | MenuV1View /200 |
| GET /api/owner/menu?includeInactive=true | boolean string optional, mặc định true | OwnerMenuView /200 |
| POST /api/owner/menu | CreateMenuItemInput | OwnerMenuItem /201 |
| PATCH /api/owner/menu/:id | PatchMenuItemInput | OwnerMenuItem /200 |
| GET /api/owner/menu/categories | không query/body | OwnerMenuCategory[] /200 |
| POST /api/owner/menu/categories | CreateMenuCategoryInput | OwnerMenuCategory /201 |
| PATCH /api/owner/menu/categories/:id | PatchMenuCategoryInput | OwnerMenuCategory /200 |

R03 **không** có orderType/store/session: DTO canonical giữ nguyên, ghép R01 QRResolution.store/mode/table. QR bàn và QR quầy cùng store trả cùng menu, mode tương ứng `dine_in`/`takeaway` lấy từ R01. Chưa verify vẫn browse; P2-C01 resolver được gọi trong cùng SQL transaction, giữ QR/table locks và rate limiter; inactive/missing QR hoặc table inactive404. acceptingOrders=false vẫn browse theo contract, không coi là quán bị xóa.

## Requests / responses

IDs/timestamps dưới là minh họa dùng UUID hợp lệ; seed IDs c022… là ổn định, API tạo mới sinh UUID thật. Không dùng fixture như credential.

Thêm danh mục:

```json
{"requestId":"c0220000-0000-4000-8000-000000000101","name":"Cà phê","sortOrder":1,"active":true}
```

Response201:

```json
{"data":{"id":"c0220000-0000-4000-8000-000000000001","name":"Cà phê","sortOrder":1,"active":true,"updatedAt":"2026-10-23T10:00:00.000001+00:00"},"error":null}
```

Thêm món R15 (mọi MenuItemFields required):

```json
{"requestId":"c0220000-0000-4000-8000-000000000102","categoryId":"c0220000-0000-4000-8000-000000000001","name":"Cà phê sữa","description":null,"priceVnd":29000,"imageUrl":null,"available":true,"active":true,"options":[{"name":"Thêm sữa","priceDeltaVnd":3000,"available":true}]}
```

Response201:

```json
{"data":{"id":"c0220000-0000-4000-8000-000000000011","categoryId":"c0220000-0000-4000-8000-000000000001","name":"Cà phê sữa","description":null,"priceVnd":29000,"imageUrl":null,"available":true,"options":[{"id":"c0220000-0000-4000-8000-000000000022","name":"Thêm sữa","priceDeltaVnd":3000,"available":true}],"updatedAt":"2026-10-23T10:00:00.000002+00:00","active":true},"error":null}
```

R16 patch giữ nguyên expectedUpdatedAt từ item GET/result:

```json
{"requestId":"c0220000-0000-4000-8000-000000000103","expectedUpdatedAt":"2026-10-23T10:00:00.000002+00:00","priceVnd":31000,"available":false}
```

200 trả OwnerMenuItem đầy đủ như201, giá31000, availablefalse và timestamp mới. Stale→409 INVALID_STATE_TRANSITION: refetch nhưng giữ editor/input để chủ quán quyết định, không tự ghi đè. Replay cùng actor/request/payload trả snapshot cũ thành công kể cả timestamp sau đó đã đổi; khác payload409 DUPLICATE_REQUEST_CONFLICT; khác actor403. Giữ requestId của command qua timeout, không tự sinh ID khác để né conflict. Sau mutation refetch R14 để lấy menuRevision mới; response item không mang menuRevision.

GET public đầy đủ: [menu-public.json](../contracts/fixtures/menu-public.json); GET owner: [menu-owner.json](../contracts/fixtures/menu-owner.json). Hai danh mục,4món public/5món owner (một inactive), unavailable và giá0, ảnh null/HTTPS,2options. Fixtures được parse bằng runtime schema, không phải kết quả đã seed trên remote. Empty response200 vẫn đủ `categories:[],items:[],menuRevision,serverTime`.

## Business rules / errors

- Item active=false ẩn public; available=false vẫn hiện Hết hàng, UI khóa chọn. Category inactive ẩn tất cả món con; không chuyển món mồ côi ra ngoài category. Owner mặc định thấy tất cả; includeInactive=false lọc inactive cả category/item.
- Category active cùng store mới được dùng khi tạo/move món. Có thể chỉnh item đã ở category inactive nhưng public vẫn ẩn. GET categories mới có updatedAt để category PATCH; R14 categories giữ shape cũ không updatedAt.
- Name trim1–120, description<=1000|null; integer VND0..Number.MAX_SAFE_INTEGER, không float/string/negative. Zero hợp lệ ở menu; Phase3 phải kiểm tổng và chính sách zero checkout, server tự tính từ DB.
- Option optional/additive, không group/required/radio/min/max; mỗi ID chọn tối đa1. Tối đa50write options trong body4096bytes. New option không id; existing id phải đúng item/store và không lặp. Khi gửi options là replacement: bỏ option→active=false, giữ row cũ, không hard delete. Owner trả cả inactive (`available:false`) để sửa/khôi phục; public chỉ active. Item.available độc lập với Option.available.
- Image chỉ HTTPS **images.unsplash.com**, <=2048, không credentials/fragment/port khác chuẩn. API chuẩn hóa URL, không tải URL ở server. `IMAGE_UPLOAD_DEFERRED`: không Storage/upload endpoint, không nút upload giả. Thêm host phải sửa validation+DB CHECK cùng nhau.
- Không orders hiện hữu ở phase này, không API sửa/xóa snapshot; Phase3 order_items phải lưu name/base/options/unit/total snapshots và FK restrict. Không nhận giá từ client khi order; recheck availability/active/options/scope/revision dưới store lock, tính lại mọi tổng với safe integer guard.

| HTTP/code | UI xử lý |
| --- | --- |
|400 VALIDATION_ERROR|Schema/field lạ/negative/float/ảnh/input sai; giữ form sửa|
|401 UNAUTHORIZED|Owner login lại; public browser context cũ tự thay mới, không khôi phục grant|
|403 FORBIDDEN|Nonmember/Origin/actor replay sai; không fake success|
|404 INVALID_QR|QR missing/disabled/table inactive|
|404 RESOURCE_NOT_FOUND|Item/category ngoài quán hoặc không tồn tại|
|409 INVALID_STATE_TRANSITION|CAS stale, refetch giữ input|
|409 DUPLICATE_REQUEST_CONFLICT|Cùng requestId khác payload/target/action|
|422 VALIDATION_ERROR|Category inactive/duplicate name; option id sai/trùng hoặc create có id|
|429 RATE_LIMITED|Retry-After + details.retryAfterSeconds; backoff giữ requestId|
|500 INTERNAL_ERROR|Sanitized DB/config error; retry cùng command sau khi chưa biết commit|

Không có enums CATEGORY_NOT_FOUND/MENU_ITEM_NOT_FOUND/CATEGORY_INACTIVE/INVALID_OPTION trong canonical error enum; mapping như trên. Network fetch failure `TypeError` phân biệt MenuApiError. Menu rỗng là200, không network error.

## Paths / exports / typed adapters

- `docs/contracts/types.ts`: canonical types cũ + OwnerMenuCategory/CreateMenuCategoryInput/PatchMenuCategoryInput và alias PublicMenuResponse/OwnerMenuResponse. [P2_C02_MENU_ADDENDUM](../contracts/P2_C02_MENU_ADDENDUM.md) ghi category contract extension theo prompt mới.
- `src/lib/validations/menu.ts`: createMenuItemInput, patchMenuItemInput, createCategoryInput, patchCategoryInput, publicMenuQuery, ownerMenuQuery, publicMenuResponse, ownerMenuResponse, ownerMenuItemResponse, ownerCategoryResponse; money/name/image policies.
- `src/server/menu/service.ts`: fetchPublicMenu(qrCode,GuestRequestContext), fetchOwnerMenu(owner,includeInactive?), createMenuItem(owner,input), updateMenuItem(owner,id,input), fetchCategories(owner), createCategory(owner,input), updateCategory(owner,id,input).
- `src/features/customer/api-client.ts`: browser `fetchPublicMenu(qrCode):Promise<MenuV1View>`, MenuApiError(status,error), shared menuRequest; không import server/Supabase, không fallback mock.
- `src/features/owner/api-client.ts`: fetchOwnerMenu(includeInactive?), createMenuItem(input), updateMenuItem(id,input), fetchCategories(), createCategory(input), updateCategory(id,input), MenuApiError re-export. Tất cả credentials include/no-store; browser tự gửi Origin; không token localStorage.

```ts
import { fetchPublicMenu, MenuApiError } from '@/features/customer/api-client';
import { fetchOwnerMenu, createMenuItem, updateMenuItem, fetchCategories } from '@/features/owner/api-client';
// qr resolution lấy R01. Không tự rename MenuV1View thành store/orderType.
const menu = await fetchPublicMenu(qrCode);
// UI đã verify bàn vẫn phải đi qua scoped order API của Phase3 sau này.
```

## Seed / chạy lại / deployment

```powershell
npm run supabase:start
npm run db:migrate
npm run db:seed
npm exec -- vitest run --config tests/unit/menu/vitest.config.mts
npm exec -- vitest run --config tests/integration/menu/vitest.config.mts
node tests/integration/menu/http-smoke.mjs
```

Seed giữ quán/bàn/QR Phase1/P2-C01, thêm2categories/4items/2options. ON CONFLICT DO NOTHING giữ owner edits, không reset giá; after-row revision triggers không đổi revision trên insert bị skip. Không user/password/membership. Seed/dev script chỉ local; remote admin apply005 và seed nếu muốn demo sau khi kiểm đúng project/history. Task P2-C02 không tự remote deploy, không sửa .env hoặc dependency.

Kết quả kiểm chứng và giới hạn ở [P2_C02_REVIEW](P2_C02_REVIEW.md). Backend routes/adapters **LIVE local**, remote cần migration005. Gemini nối menu/item detail/owner menu bằng adapter, dùng mock chỉ explicit preview; không fallback API500 thành dữ liệu thật. Backend không có menu group bắt buộc hoặc upload; không fake order/checkout success.

## Gemini integration requests

- Dùng canonical available/active/categoryId/options, preserve updatedAt microseconds; item PATCH tối thiểu1field ngoài requestId/expectedUpdatedAt. Nối category editor với GET categories mới để có CAS token.
- Render unavailable/empty/invalidQR/network/server/stale/429 tách biệt; mutation success mới đổi switch, không tự chấp nhận stale price.
- Dùng cùng requestId khi timeout/retry; chỉ clear pending command sau definitive response. Không tự tạo requestId mỗi retry/network fail.
- Giữ additive option semantics; không hiển thị size/sugar/radio bắt buộc dựa trên options list. Menu GET không cấp quyền đặt món; bàn chưa verify vẫn khóa đặt.
- Full worktree lint có thể còn lỗi từ UI Gemini đang viết đồng thời; Codex chỉ đọc, không sửa components/mocks/design. Xem bảng thực chạy trong review; không nhận UI/browser acceptance chỉ từ backend tests.
- Đối soát source Gemini P2-G02 tại thời điểm bàn giao: `OwnerMenuItemForm` đang chặn priceVnd=0 dù contract cho phép; form món/danh mục fallback preview theo message có “fetch/404/NOT_FOUND” nhưng chưa gate environment ngay tại nhánh đó. Gemini cần dùng MenuApiError.status/error.code và explicit dev preview; production giữ lỗi thật, không onSaved/onCategoryCreated mock khi API thất bại. Cả create/patch hiện sinh requestId mỗi submit; cần giữ command qua retry timeout. Đây là UI integration gate, không sửa backend để công nhận mock.

Next: **P2-C03 Cart/API integration**. Cart local/display totals thuộc bước sau, order/FIFO/payment không triển khai ở P2-C02.
