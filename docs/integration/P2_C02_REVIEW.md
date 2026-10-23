# P2-C02 CODEX — implementation / verification

23/10/2026 (Asia/Saigon). Phạm vi backend local **DONE**: public menu dùng chung QR bàn/quầy, owner item/category CRUD, typed adapters, migrations/seed, validation/security và test thật. Không nhận toàn Phase2/MVP hoặc production UI đã nghiệm thu.

## Thay đổi thực tế

- Migration005 additive: menu_categories/items/options/audit_log và stores.menu_revision; same-store composite FKs, normalized category uniqueness, indexes, bigint checks, strict grants/RLS, monotonic timestamps/revision triggers. Không thay001–004 hoặc schema session/auth.
- `src/server/menu/{service,database}.ts`: services và service-role-only invoker RPC `p2_menu_execute`. Owner Auth từng request; SQL recheck membership, operation→store→menu locking, CAS, idempotency actor/key/payload, audit/outbox atomic.
- Public R03 và owner R14/R15/R16, thêm GET/POST categories + PATCH categories/:id theo nhiệm vụ mới. Category extension được ghi riêng trong `docs/contracts/P2_C02_MENU_ADDENDUM.md`, types.ts và UI_DATA_HANDOFF; frozen existing DTO/error enums/API_CONTRACT giữ nguyên.
- `src/lib/validations/menu.ts`: strict schemas, safe integer VND, nullable fields, HTTPS image allowlist, runtime response schemas compile-check canonical types. Không fetch arbitrary image URL/server upload.
- `src/features/customer/api-client.ts`, `src/features/owner/api-client.ts`: typed fetch credentials include/no-store; network vs MenuApiError; không Supabase/server imports hay mock fallback.
- `supabase/seed.sql`: giữ seed quán/ba bàn/QR cũ, thêm2category/4item/2option với stable UUIDs, không account/secrets, giữ owner edits khi rerun.
- `docs/contracts/fixtures/menu-{public,owner}.json`: canonical envelopes với2categories,4public items/5owner items, giá0/unavailable/inactive, nullable image và additive options; UTF-8 tiếng Việt đã kiểm.
- `tests/unit/menu/*`, `tests/integration/menu/*`: validation/adapters/fixtures và local PostgreSQL/Auth/PostgREST/Next HTTP thật; không dùng mock DB làm bằng chứng tenant isolation.
- Contract verifier sửa compiler resolution sang bundler để tương thích dependency typings hiện tại; không đổi expected positive/negative checks. Console scope note không còn khẳng định toàn backend chưa tồn tại: verifier vẫn chỉ static.
- Handoff: `docs/integration/P2_C02_MENU_HANDOFF.md`.

Không đổi dependencies/package-lock/package manager/.env/Next config; không edit UI/customer/owner/components/mocks/docs/design/root specs. Gemini làm P2-G02 đồng thời: các thay đổi ở vùng UI, fixture UI, UI tests và docs/design do Gemini, không gom thành công việc Codex. Worktree đầu vào còn fresh-migration test/migration004/session-fix doc của task trước; giữ nguyên phần đó trong P2-C02.

## PASS / FAIL / NOT_RUN — thực chạy

| Command/check | Kết quả | Phạm vi |
| --- | --- | --- |
| `npm.cmd run db:migrate` | PASS local | apply005 incremental trên DB có001–004 |
| `npm.cmd run db:seed` và rerun seed trong integration | PASS | 2categories/4items/2options, revision không đổi trên rerun skip, không duplicate/reset |
| `npm.cmd exec -- vitest run --config tests/unit/menu/vitest.config.mts` | PASS7 | Input, ảnh, CAS shape, fixtures UTF-8/runtime schemas, credentialed typed adapters và API/network errors |
| `npm.cmd exec -- vitest run --config tests/integration/menu/vitest.config.mts` | PASS13 | Real DB/service/Auth, race/CAS/replay, scope/hidden/atomic options/revision, RLS, seed, fresh migrations |
| `node tests/integration/menu/http-smoke.mjs` | PASS | Production Next build/server + real local Auth/RPC/routes, HTTP statuses/envelopes/cookies/Origin/rate/no-store/log redaction |
| `npm.cmd run typecheck` | PASS | Next route typegen + strict tsc, including concurrent Gemini UI |
| `npm.cmd run build` | PASS | Existing production Next build; HTTP harness also rebuilds with isolated local env |
| `npm.cmd run lint` | PASS cuối | Trong lúc Gemini viết đồng thời từng FAIL ở ItemDetailSheet/CustomerQRContainer/menu forms, sau cập nhật Gemini chạy lại max-warnings0 PASS; Codex không sửa UI |
| ESLint targeted Codex menu files | PASS | API/services/adapters/validation/tests đều max-warnings0 |
| `npm.cmd run test:auth` | PASS46 | Regression Auth/bootstrap |
| `npm.cmd run test:db` | PASS9 | Regression RLS/foundation/bootstrap |
| `npm.cmd run test:http` | PASS | Real Phase1 auth/login/logout/refresh/dashboard integration |
| `npm.cmd exec -- vitest run --config tests/integration/vitest.config.mts` | PASS28 | Existing15 QR/fresh +13menu (glob gồm nested menu tests) |
| `npm.cmd exec -- vitest run --config tests/unit/vitest.config.mts` | PASS15 | Existing8 QR security +7menu (glob gồm nested menu tests) |
| `npm.cmd exec -- vitest run --config tests/ui/vitest.config.mts` | PASS21 | Gemini fixture/unit assertions, không browser acceptance |
| `python docs/contracts/validate_contracts.py` | PASS | 45typed JSON examples,6negative checks,21baseline routes; category extension kiểm qua tests riêng |
| Client output secret scan | PASS | 16static JS/map files,0hits cho service-role/encryption key/bootstrap password; source adapter không server import |
| `git diff --check -- docs/contracts supabase/seed.sql` | PASS | Codex tracked edits |
| Whole worktree diff whitespace | FAIL | Blank EOF trong MenuItemPreviewCard/MenuPreviewSection/ui-preview do Gemini; giữ file ownership |
| Remote menu migration/seed/smoke | NOT_RUN | Không mutate/deploy hosted project ở task này |
| Browser/responsive/hydration/image fetch/load/SLA | NOT_RUN | HTTP suite dùng cookie jar thủ công, không nhận browser visual/cross-site cookie hoặc production load đã đạt |

DB cuối sau cleanup:15bảng RLS;2menu_categories/4menu_items/2menu_item_options từ seed;0Auth user/operation/menu_audit fixture còn lại. Server test được dừng, chỉ xóa đúng dữ liệu fixture riêng bằng admin local, không reset DB.

## Kiểm chứng theo yêu cầu

1. Hai QR cùng store trả cùng categories/items/revision, R01 mode dine_in vs takeaway; browse chưa verify vẫn200 và không session/owner/hash/token trong menu. QR missing/disabled/table inactive404; store pause không invalid QR theo canonical R01/R03. FK đảm bảo QR không thể trỏ store không tồn tại.
2. Public lọc item/category inactive, option inactive; unavailable vẫn hiện false, giá0 hợp lệ. Owner thấy inactive/unavailable, có thể bật lại. Sort category order/name/id rồi item order/name/id; zero menu200 arrays[].
3. Owner/nonmember/guest/cross-store đều thử qua SQL/service và HTTP; category/item ngoài scope404, membership giả403, Origin sai403, unknown query/body/negative/float/quantity/unsafe image400. Direct anon/authenticated table SELECT/RPC bị deny.
4. Concurrent patches cùng expectedUpdatedAt: đúng1winner,1stale409; replay same command trả snapshot cũ trước CAS. Create retry cùng requestId chỉ1item/audit/domain event. Payload đổi409; options IDs sai/trùng/create ID422.
5. Options replacement giữ row inactive và owner thấy để khôi phục; public không thấy. Test cố ý bypass schema bằng trusted local service role để gây DB CHECK failure ở option thứ2 sau item UPDATE/option thứ1 INSERT: mọi dữ liệu/revision/audit rollback; không trạng thái nửa vời.
6. Patch giá/available được GET public mới phản ánh ngay, revision khác; seed rerun không đổi revision nếu không insert rows. Mutation+revision+audit+ledger+outbox atomic. Không xóa snapshot/hard-delete API; Phase3 phải tạo order snapshots/recheck giá và eligibility.
7. Fresh isolated PostgreSQL scratch DB apply001–005 từ source cuối, thu hồi local default grants để mô phỏng hosted; SET ROLE service_role create category chạy thật. RPC anon denied,15RLS tables; xóa đúng scratch DB trong finally.

## Lỗi đã sửa và giới hạn

Trong triển khai đã sửa BEFORE trigger tham chiếu nhầm record.item_id cho category/item, và revision đổi trên INSERT ON CONFLICT DO NOTHING: timestamp BEFORE UPDATE tách khỏi revision AFTER INSERT/UPDATE. Reconcile đúng functions/triggers/grants local với source cuối, không drop bảng; fresh migration test vẫn apply nguyên source005 từ đầu. Unit adapter mock ban đầu reuse Response body đã consume, sửa harness trả Response mới mỗi fetch.

Typegen ban đầu gặp `.next/dev/types/routes.d.ts` có suffix lặp do dev/typegen đồng thời; tái tạo generated declarations từ Next typegen, không sửa source UI. Lint lỗi UI thoáng qua được Gemini sửa, final lint PASS. Không thay spec để bỏ check hoặc cài package chữa lỗi.

Category CRUD là extension được prompt mới giao, không BLOCKED bởi handoff lịch sử đòi CR. Shape menu/public không thêm orderType/store như ví dụ prompt vì canonical contract ưu tiên. Options vẫn optional additive, không có gap cần required/exclusive groups ở scope này; upload ảnh deferred. Money each-field safe; Phase3 phải guard cả sum/multiply và không tạo order dựa giá client. Không order/payment/FIFO/realtime subscription/cron/publisher trong task.

Source Gemini mới đã đọc và đối chiếu `docs/design/P2_G02_MENU_UI_HANDOFF.md`, không sửa. Còn UI integration gate trong MENU_HANDOFF: form chặn giá0, fallback mock mutation chưa gate production đầy đủ, requestId cần giữ qua timeout; không coi report LIVE WIRED là browser/production acceptance. Admin phải apply005/seed trên hosted nếu muốn UI hiện menu thật; task này không tự remote mutate.

Next **P2-C03 Cart/API integration**, không tự làm trong P2-C02. Không tick TASKS root/nhận MVP done hoặc gộp thời gian của Gemini thành backend verification.
