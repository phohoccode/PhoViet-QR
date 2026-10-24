# OWNER HOTFIX 01 — Codex implementation report

Ngày: 2026-10-24. Phạm vi: archive bàn/danh mục/món, API authorization,
Supabase Storage image lifecycle và integration tests. Không chạy migration lên
Supabase production.

## Audit ban đầu

- `dining_tables.active`, `qr_codes.active/retired_at` và soft-disable trigger
  đã tồn tại; hard delete bàn/QR bị chặn. `table_sessions` có `open`,
  `checkout_pending`, `closed`; settlement/receipt và order history dùng FK
  `RESTRICT`/snapshot immutable.
- `menu_categories.active`, `menu_items.active/available` và options đã tồn
  tại; `order_items` giữ `name_snapshot`, giá và options snapshot. `image_url`
  trước đây chỉ cho HTTPS Unsplash.
- Owner mutations đi qua service-role RPC, owner/store được kiểm tra lại trong
  PostgreSQL, khóa theo store trước resource. Storage local ban đầu tắt trong
  `supabase/config.toml`; test Storage dùng một Storage API container local
  tách biệt, không dùng project thật.

## Thay đổi

Migration mới:

- `20261024001800_owner_hotfix_01.sql`: thêm `archived_at`, `image_path`,
  registry `menu_image_assets`, archive RPC `hf01_owner_execute`, cleanup RPC,
  trigger bảo vệ category/image, public menu archive filters và stale-cart
  `ITEM_UNAVAILABLE`. Archive bàn khóa store → table, kiểm tra live sessions,
  unresolved orders và settlement; retire toàn bộ QR table.
- `20261024001900_menu_images_bucket.sql`: tạo/chuẩn hóa bucket
  `menu-images`, public read, giới hạn 5 MiB và MIME JPEG/PNG/WebP; restrictive
  browser write/update/delete fences. Object bytes chỉ đi qua Storage API.

Server/API:

- [OWNER_HF01_CONTRACT.md](../contracts/OWNER_HF01_CONTRACT.md) chốt route,
  DTO, lỗi, rollback và security model cho Gemini.
- `DELETE /api/owner/tables/:id`, `DELETE /api/owner/menu/categories/:id`,
  `DELETE /api/owner/menu/:id` đều là soft archive, không cascade.
- `POST /api/owner/menu/upload` kiểm tra multipart, kích thước, extension,
  MIME và giải mã bytes bằng `sharp`; normalize ảnh về WebP, upload object mới,
  finalize DB sau upload, rollback object khi finalize thất bại.
- Cleanup claim/done có retry lease; [vercel.json](../../vercel.json) lên lịch
  cron hằng ngày, route GET yêu cầu `CRON_SECRET`, POST dùng secret nội bộ hiện
  có. Owner menu GET còn chạy cleanup scoped sau response.
- `next.config.ts` chỉ cho phép Unsplash và đúng Supabase hostname/path của
  bucket; không wildcard.

UI Gemini đã tích hợp contract ở các component owner hiện hành; Codex không
đổi layout/CSS.

## Kiểm thử và bằng chứng

| Lệnh | Kết quả |
| --- | --- |
| `npx vitest run --config tests/auth/vitest.config.mts` | PASS — 8 files, 49 tests |
| `npx vitest run --config tests/unit/vitest.config.mts` | PASS — 19 files, 134 tests |
| `npx vitest run --config tests/ui/vitest.config.mts` | PASS — 26 files, 306 tests |
| `npx vitest run --config tests/db/vitest.config.mts` | PASS — 2 files, 9 tests |
| `npm run test:http` | PASS — production HTTP/Auth smoke; cập nhật expectation tracking shell từ 404 sang 200 theo Phase 3/4 hiện hành |
| `npx vitest run --config tests/integration/vitest.config.mts tests/integration/owner-hotfix.test.ts tests/integration/owner-storage.test.ts` | PASS — 15 tests (10 archive/race, 5 real Storage/RLS) |
| `npx vitest run --config tests/integration/vitest.config.mts` | PASS — 23 files, 172 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors/warnings |
| `npm run build` | PASS — compiled/routes generated; only pre-existing `metadataBase` warning |
| Browser Canvas check on actual transpiled `prepareMenuImage` | PASS — PNG 4,859,843 bytes → WebP 2,086,220 bytes; >5 MiB rejected |

Hotfix integration bao phủ empty/historical/settling table, zero-order live
session, stale checkout, category count kể cả inactive item, cross-store,
idempotent archive và race archive/open/archive-vs-checkout. Storage bao phủ
bytes giả/MIME giả/extension/path traversal/>5 MiB, cross-store owner, bucket
RLS, replacement, delete, cleanup và Storage outage không false-success.

## Trạng thái triển khai

- **PASS (local):** migration 018 áp dụng vào local DB hiện hành; migration 019
  áp dụng vào Storage metadata local; test fixtures đã dọn sau mỗi suite.
- **PASS (local):** Storage API container riêng phục vụ upload/read/delete thật.
- **NOT_RUN:** Supabase Dashboard/production migration, production bucket,
  production cron, domain remote pattern và ảnh thật của quán.
- **BLOCKED:** không có. Storage integration không bị đánh dấu production PASS
  vì local test không chứng minh hosted credentials/config.

## File ownership và rủi ro còn lại

Backend mới: migration 018/019; `src/server/menu/hotfix.ts`,
`src/server/menu/storage.ts`, `src/features/owner/menu-image.ts` (browser-side
normalization cho giới hạn body của hosting); upload/cleanup routes; DELETE
handlers trong routes tables/menu/categories.
Additive updates: contracts/types, menu validators/database mapper, order/payment
error mappers, owner API adapter, next.config, package/lock (sharp), `.env.example`,
vercel.json, auth/integration tests và HTTP smoke expectation cũ.
Ba component `OwnerMenuItemForm`, `OwnerMenuView`, `TableManagementView` cùng
UI test/report do Gemini thay đổi song song; Codex giữ nguyên layout/CSS.
`StoreAdmissionControlCard` cũng có copy thay đổi song song; test SSR được cập
nhật đúng copy mới, vẫn kiểm tra master pause làm cả hai hình thức ngừng nhận.

Phải giữ cron hoạt động và theo dõi `menu_image_assets` state/attempts/next_attempt_at;
worker batch có giới hạn và retry sau 15 phút. Trên môi trường ngoài Vercel phải
lên lịch POST internal cleanup bằng bearer secret. Proxy/hosting phải hỗ trợ
multipart body của adapter (<=4 MiB + overhead). Browser adapter giữ giới hạn
đầu vào 5 MiB nhưng thu nhỏ ảnh >4 MiB trước khi gửi để phù hợp Vercel Function.
Raw API vẫn có streaming cap 5 MiB; các client tích hợp khác phải tuân theo body
limit của hosting hoặc áp dụng cùng bước chuẩn hóa ảnh.
RLS/local tests không thay cho staging verification trên đúng project thật.

## Checklist vận hành trước production

1. Kiểm tra migration preflight trên đúng project và chạy 018 rồi 019 trong
   SQL Editor/CI migration runner; không chạy lại khi preflight đã commit.
2. Xác nhận bucket `menu-images` public read, 5 MiB, đúng ba MIME; kiểm tra
   không có permissive insert/update/delete policy cho anon/authenticated.
3. Set `CRON_SECRET` >= 32 ký tự trong Vercel, kiểm tra cron GET trả 200 và
   `PAYMENT_RECONCILE_SECRET` vẫn giữ riêng cho POST/manual.
4. Cập nhật `NEXT_PUBLIC_SUPABASE_URL` production để `next/image` và URL
   validator chỉ nhận đúng hostname; kiểm thử upload/replacement trên staging.
5. Chạy smoke: archive bàn trống, từ chối bàn có phiên 0 món, archive item có
   lịch sử, stale cart trả `ITEM_UNAVAILABLE`, upload/replace/delete ảnh.

Không có secrets, service-role key, payment payload hay production row nào được
ghi vào source/report.
