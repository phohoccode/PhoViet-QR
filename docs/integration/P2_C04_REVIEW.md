# P2-C04 CODEX — implementation và verification

23/10/2026, Asia/Saigon. **DONE cho backend/API local của P2-C04**: có API thật, transaction, migration tăng dần và kiểm chứng DB/Auth/HTTP. Không nhận UI Gemini, remote deployment, in/scan QR hoặc toàn Phase2 đã hoàn thành.

## Files và thay đổi

| Files | Thay đổi / lý do |
| --- | --- |
| `supabase/migrations/20261023000600_owner_table_qr_lifecycle.sql` | Preflight abort nhãn/QR legacy trùng; normalized label DB index/check; partial unique active table/takeaway; 128-bit random codes; retired_at; history guards; audit table RLS; revoke direct authenticated writes; grant service tối thiểu; RPC và projection helpers |
| `src/lib/validations/table-qr.ts` | Strict create/update/R18/rotate schemas, UUID, label Unicode whitespace/control, CAS timestamp, confirm:true |
| `src/types/contracts/table-qr.ts` | Additive OwnerTable/OwnerQrCode/list/input types; frozen contract types không sửa |
| `src/server/tables/service.ts` | List/create/update theo owner scope; publicURL projection; fail config trước mutation |
| `src/server/qr/{service,database,public-url}.ts` | R18/rotate/list, RPC service-only, lỗi allowlist, trusted APP_BASE_URL, giữ R18 inactive-table422 |
| `src/app/api/owner/tables/route.ts`, `tables/[id]/route.ts` | R11 đọc mở rộng, POST201/PATCH200, Auth/Origin/noQuery/bounded JSON, no-store |
| `src/app/api/owner/qr-codes/route.ts`, `qr-codes/[id]/rotate/route.ts` | R17 mở rộng, R18 POST create201/set_active200, POST rotate201; không thêm PATCH QR trùng chức năng |
| `src/features/owner/api-client.ts` | Typed browser adapters cho bàn/QR, giữ menu adapters |
| `.env.example` | APP_BASE_URL public canonical origin, không secret |
| `tests/unit/table-qr.test.ts` | Input/config/productionHTTPS/URL/errorstatus |
| `tests/integration/table-qr.test.ts` | Real services/Auth/DB, CRUD/CAS/replay/race/session guards/retirement/rollback/RLS/audit/rate |
| `tests/integration/table-qr-migration.test.ts` | Fresh001–006, preflight rollback giữ dữ liệu, least privileges dưới SET ROLE service_role |
| `tests/integration/table-qr-http.mjs` | Build/start production local testenv, cookie Auth, HTTP/envelope/CSRF/tenant/URL/R18/verify/rotate/rate/log redaction |
| `tests/integration/{qr-sessions.test.ts,qr-http.mjs,menu/menu.test.ts,menu/http-smoke.mjs}` | Admin local teardown bypass history trigger chỉ cho fixture UUID của run; QR HTTP thêm APP_BASE_URL. Không hạ guard production |
| `docs/integration/P2_C04_{CONTRACT_CHANGE_REQUEST,MIGRATION_PREFLIGHT,TABLE_QR_HANDOFF,REVIEW}.md` | Mapping contract, hướng migration legacy, API examples, điều kiện tích hợp và bằng chứng |

Không sửa migration001–005, seed, Auth/Cart/Menu implementation, dependencies/config, UI/components/pages/styles/mocks/docs/design. UI đang được Gemini viết đồng thời nên git status có thêm owner tables/QR/settings, OwnerShell, globals.css, QR renderer và UI tests; các file đó không phải thay đổi Codex trong P2-C04. `QR_REQUEST_LOOP_AUDIT.md` thuộc lần tái kiểm task trước, không phải deliverable P2-C04.

## Bằng chứng nghiệp vụ

1. Tạo bàn + initial QR chung transaction, default random128-bit. Hai request cùng key đồng thời cho đúng1table/QR/audit; key đổi payload/action409, actor khác cùng quán403. Replay trước CAS/limiter, không ghi trùng event. Patch giữ microseconds; hai patch cùng CAS chỉ1winner.
2. DB unique store+lower(normalizedlabel), active tableQR/table và active takeaway/store. API/DB normalize whitespace cùng tập ký tự; tests có Unicode0085/NBSP và khác hoa/thường. Concurrent create QR legacy/quầy chỉ1winner; bật lại code inactive khi đã có code mới active trả409.
3. Rename giữ code/URL; GET/xem lại không tạo mã. Disable bàn giữ QRflag/history, resolver404; bật lại dùng code cũ. QR disable thường có thể bật lại. Rotate thay mã atomic, code cũ retired không thể enable, public404, code mới resolve đúng table/takeaway.
4. Open/checkout_pending chặn disable bàn/QR và rotate, dù credential TTL đã hết vẫn là live session. C01 open/verify/guest grant vẫn hoạt động; detail không credential. Tests close bằng SQL admin fixture rồi mới rotate được, không thêm API close/checkout.
5. Lock order operation→owner rate bucket→store→table→QR; resolver table→QR→session recheck active QR dưới lock. Race open-vs-disable chỉ1winner; resolve-vs-rotate hoàn tất không deadlock, sau rotate old404. Không force revoke guest hoặc âm thầm close.
6. Inject lỗi giữa rotate (sau retire trước newQR) chứng minh QR cũ vẫn active/not-retired ngay trong transaction khi RPC trả lỗi. Inject newQR failure không có bàn mồ côi. Inject operation_requests insert failure sau audit/outbox chứng minh resources+audit+outbox cùng rollback, không chỉ dựa outer teardown rollback.
7. Owner scope từ server Auth, DB recheck membership. Foreign IDs404, forged membership403, guest401, nonmember403, CSRF403, unknown store/code/session fields400. Authenticated direct write và anon/authenticated generic RPC bị deny; service không có hard-delete. QR identity/store/table/type immutable; same-store FK vẫn giữ.
8. APP_BASE_URL được server validate trước mutation; HTTPS production, HTTP chỉ loopback dev; không đọc Host/Forwarded. Missing/malformed config500 với field rõ, không insert bàn. HTTP thử x-forwarded-host giả vẫn trả canonicalURL. URL không UUID store, secret hoặc mã phiên.
9. Audit `table.created/updated/disabled`, `qr.created/enabled/disabled/rotated`; create-table và rotate còn audit QR mới. Atomic outbox `qr.updated` chỉ eventId/type/aggregateId/version, không bật worker/realtime. Ảnh hưởng stores.version, không đổi menu_revision/giá/giỏ.

## PASS / FAIL / NOT_RUN — thực chạy

PowerShell/npm trên máy có thể xử lý nhầm flags `npm exec -- ...`; dùng Node trực tiếp để bảo đảm Vitest nhận đúng --config.

| Command/check | Kết quả | Phạm vi |
| --- | --- | --- |
| `npm run db:migrate` | PASS local | Apply006; sửa/reconcile RPC local với source cuối; scratch test áp dụng nguyên001–006 từ đầu |
| `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts` | PASS80 | Cart/QR/menu regression và21unit table/QR mới |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts` | PASS42 | 28QR/menu/fresh cũ +13lifecycle +1migrationpreflight mới; DB/Auth local thật |
| `node node_modules/vitest/vitest.mjs run --config tests/auth/vitest.config.mts` | PASS46 | Auth/bootstrap regression |
| `node node_modules/vitest/vitest.mjs run --config tests/ui/vitest.config.mts` | PASS50 tại thời điểm chạy | Fixture/pure-function tests Gemini; không browser UI acceptance |
| `node tests/integration/table-qr-http.mjs` | PASS | Production build/server + real Auth/HTTP, gồm422 table inactive theo R18 |
| `node tests/integration/qr-http.mjs` | PASS | Production C01 HTTP/session/cookies/revocation/log regression |
| `node tests/integration/menu/http-smoke.mjs` | PASS lần chạy cuối | Production C02 HTTP/menu regression; lần đầu build lỗi trong lúc worktree UI thay đổi, chạy build độc lập rồi rerun PASS |
| `npm run build` | PASS | Production build với .env.local, không tự bootstrap/mutate hosted DB |
| `npm run lint` | PASS lần cuối | Toàn repo max-warnings0; warning UI test xuất hiện trong lúc Gemini viết đã hết ở run cuối |
| `npm run typecheck` | PASS | Next typegen + strict tsc app/routes/types |
| `python docs/contracts/validate_contracts.py` | PASS |45typed examples/6negative/21baseline routes; không thay runtime tests |
| Client JS/map secret scan | PASS |15files,0matches cho local/hosted service keys và bootstrap password; không in secrets |
| `git diff --check` | PASS lần cuối | Toàn tracked worktree tại thời điểm check; có lúc EOF globals.css do Gemini, không sửa file của Gemini |
| `node node_modules/vitest/vitest.mjs run --config tests/db/vitest.config.mts` | **FAIL legacy P1** |8/9assertion tests pass; 1test kỳ vọng direct owner write và afterAll hard-delete trigger bị chặn theo policy006; xem dưới |
| Remote006/app config/smoke | NOT_RUN | Không có quản trị SQL remote, .env.local không đổi; deploy cần apply nguyên006 và APP_BASE_URL thật |
| Browser QR renderer/print/download/scan/responsive UI | NOT_RUN | Thuộc Gemini/P2-C05; không báo đã in/scan chỉ từ HTTP tests |
| Orders/FIFO/payment/realtime/close API | NOT_IMPLEMENTED by scope | Không là chức năng P2-C04 |

Test data/service role/keyring chỉ local. Các HTTP test dừng đúng process đã spawn; không kill server dev3000. Migration scratch DB drop trong finally. Fixture lifecycle/audit/operation được cleanup; bộ P1 cleanup lỗi đã dọn đúng2store/2table/2Auth user của run sau khi kiểm UUID/timestamp/email fixture trên local. Không reset DB hoặc xóa dữ liệu quán thật.

## Vấn đề còn lại và phối hợp

**Legacy P1 test nằm ngoài phạm vi file cho phép P2-C04** (`tests/db/**`, trong khi prompt chỉ cho tests/unit và tests/integration). Không sửa lén test để xanh. Cần maintainer cập nhật `tests/db/local-integration.test.ts` theo policy mới:

- Dòng120–125: authenticated UPDATE dining_tables.label, INSERT qr_codes, UPDATE qr_codes.active phải bị deny; API thật thay các thao tác đó đã được13integration lifecycle và HTTP harness kiểm chứng.
- afterAll dòng69: admin local dùng transaction `SET LOCAL session_replication_role=replica` cho đúng UUID fixture, tương tự test integration; production soft-disable/history guard phải giữ nguyên.
- Các assert RLS SELECT, stores allowed columns, auth/login/logout và membership vẫn giữ. Không sửa/hạ quyền006 để khôi phục đường bypass audit.

**UI integration còn lệch**, được ghi chi tiết trong handoff: PATCH thiếu expectedUpdatedAt, rotate đang gọi create, client tự ghép origin, response fallback giả. Không thay backend để chấp nhận input thiếu CAS hoặc create tự rotate. Gemini dùng additive types/adapters và CCR, P2-C05 kiểm browser thật.

**Remote deployment** cần quản trị apply006 sau read-only preflight, cấu hình APP_BASE_URL và restart. Missing config hiện fail rõ500, không đoán host. Không báo hosted DB đã migrate.

**Emergency revoke/close**: chưa có settlement/close API trong C01; không tự mở rộng sang Phase3. Chỉ thao tác disable/rotate sau khi phiên đã được xử lý bằng workflow quản trị được duyệt. Không có force flag.

## Completion audit theo prompt

| Yêu cầu | Nguồn chứng minh |
| --- | --- |
| Tạo/đổi tên/bật tắt bàn; QR bàn/quầy/list/rotate; giữ C01 | Routes/services, lifecycle integration, C01 và lifecycle HTTP PASS |
| Unique/normalization/same-store/soft history/entropy/preflight |006constraints/guards, migration preflight test, DB policy assertions |
| Atomic create/rotate/audit/idempotency, replay/concurrency |13lifecycle tests, late failure injection, CAS/open/resolve races |
| Auth/scope/input/CSRF/no-store/sanitized errors | HTTP harness401/403/404/409/422/429 và unit/SQL permissions |
| Trusted stable publicURL, missing config, no secrets | public-url module, unit80 và HTTP forwardedhost, client/log scans |
| Error/status/route mapping giữ contract | CCR và handoff, R18 POST201/200, inactive422, không PATCH QR duplicate |
| Handoff/review/migration guide/commands/status |4P2_C04 documents này, tất cả NOT_RUN/FAIL đã ghi rõ |
| Không UI/orders/FIFO/payment/realtime/package/Auth/Cart/Menu rewrite | Codex diff ownership ở bảng files; concurrent Gemini edits giữ nguyên |

Next: **P2-C05 integration & regression trước Phase3**. Backend local P2-C04 hoàn thành; các bước UI/deploy/test P1 phối hợp đã được nêu rõ, không gộp thành claim MVP/production DONE.
