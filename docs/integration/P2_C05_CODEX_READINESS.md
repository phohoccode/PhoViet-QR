# P2-C05 — Codex integration and quality gate

23/10/2026, Asia/Saigon. **P2-C05 CODEX: PARTIAL. Phase 3: NOT_READY.**

Backend/domain đã được kiểm chứng trên Supabase/PostgreSQL local và Next production build. Còn lỗi binding UI cần Gemini sửa, khoảng trống contract đóng phiên và nghiệm thu trình duyệt. Người dùng báo vấn đề migration Production đã ổn; chưa cung cấp JSON function definition để Codex đối chiếu độc lập. Không coi thông báo đó là bằng chứng schema/constraint/API Production đã qua gate.

## 1. Hiện trạng và phạm vi

- Đọc README, PRD, ARCHITECTURE, PLAN, TASKS, UI, contracts và handoff P2-C01–C04; đối chiếu thêm Gemini G01–G05.
- Workspace có thay đổi song song của Gemini trong dashboard, OwnerShell, CartSheet, tests/ui và docs/design. Giữ nguyên các thay đổi đó; không sửa JSX, trang, styles hay mock fixtures.
- Không tạo implementation thứ hai, order/payment/FIFO/realtime endpoint hoặc API đóng phiên tạm. Hai chế độ dùng chung public menu và cart domain.
- Thay đổi Codex trong đợt C05: thêm typed QR/verify/open-session clients; kiểm tra success envelope; cart dùng typed resolver; bổ sung cross-module/fault/client/cooldown tests và HTTP burst. Không thay đổi canonical DTO hay semantics cart để che lỗi UI.
- `tests/db/local-integration.test.ts` được cập nhật vì quyền ghi trực tiếp authenticated vào bàn/QR đã bị migration006 thu hồi có chủ đích. Test dùng admin tạo fixture và xác nhận owner read/tenant isolation; không nới quyền Production. Teardown chỉ xóa fixture UUID riêng trên loopback local bằng replication-role trong transaction vì006 chặn hard delete.

## 2. Ma trận luồng và bằng chứng

PASS local không đồng nghĩa Production hoặc trình duyệt đã được nghiệm thu.

| Luồng / yêu cầu | Kết quả | Bằng chứng / giới hạn |
| --- | --- | --- |
| Owner login, server guard, membership/store scope | PASS | `npm run test:auth` 46 tests; `npm run test:db` 9 tests; HTTP auth/tenant assertions |
| Tạo bàn + QR đầu tiên atomic, rename không đổi publicCode | PASS | `tests/integration/table-qr.test.ts`, `table-qr-http.mjs` |
| QR bàn/quầy cùng store → cùng menu, đúng type/mode | PASS | `tests/integration/phase2-flow.test.ts`, `menu/menu.test.ts`, `menu/http-smoke.mjs` |
| QR giả/inactive/retired, bàn inactive | PASS | Integration QR/lifecycle/menu và HTTP trả404 INVALID_QR |
| Mở phiên đồng thời, replay cùng actor, payload conflict | PASS | `qr-sessions.test.ts`, `table-qr.test.ts`, HTTP; database thật |
| Verify sai/hết hạn, 429 rồi hồi phục | PASS | `qr-sessions.test.ts` hết cooldown fixture riêng rồi verify đúng; `qr-http.mjs` kiểm Retry-After/cookie |
| Hai thiết bị, cross-table/store, revoke/expiry | PASS | `qr-sessions.test.ts`; credential scoped riêng, không dùng QR làm quyền |
| Đóng phiên → revoke; mở phiên mới không nhận grant cũ | PASS ở DB fixture | `phase2-flow.test.ts`, `qr-sessions.test.ts`; đóng bằng SQL admin local, chưa có API close |
| Owner đóng phiên từ UI/API Phase2 | BLOCKED | Contract gap CG-01 bên dưới; không có endpoint để gọi |
| Rotate atomic, retired code không hoạt động, live-session guard | PASS | Lifecycle integration/HTTP, unique active QR và CAS/replay |
| Owner menu CRUD, tenant, giá/options/URL, rollback | PASS | `menu/menu.test.ts`, `tests/unit/menu/validation.test.ts`, HTTP |
| Menu đổi giá, sold out, option removed → reconcile | PASS | `phase2-flow.test.ts` và `tests/unit/cart/domain.test.ts` |
| Cart integer totals, merge/edit/remove, limits | PASS domain | Unit cart; compound UI edit còn lỗi UI-04 |
| Cart QR/store/mode/session isolation, reload, corrupt/quota | PASS domain | `storage-store.test.ts`, `phase2-flow.test.ts` |
| Request dedupe, stale response, visibility/offline, backoff | PASS domain | `request-lifecycle.test.ts`; không retry vòng lặp sau500/429 |
| Network/DB/malformed RPC sanitized500 | PASS | `tests/unit/phase2-failures.test.ts`: fault injection, không phải bằng chứng concurrency |
| Cookie security và không log secret | PASS local HTTP | `qr-http.mjs`, `table-qr-http.mjs`, `menu/http-smoke.mjs`; Next production mode, Supabase local |
| Concurrent resolve/verify vs rotate/disable/close | PASS local | Lifecycle tests + `phase2-flow.test.ts`; close/checkout dùng fixture SQL, không API giả |
| Owner Settings load đúng QR hiện có, retry command UI | FAIL source audit | UI-01/UI-02; server tests không chứng minh component binding đúng |
| QR download/print chỉ dùng URL server | FAIL source audit | UI-03: còn fallback dựng URL |
| Browser login → tạo bàn → verify → sửa giỏ → in/tải/scan | NOT_RUN bởi Codex | Cần browser acceptance thực tế, gồm 360/375/430/768/1024/1280px, bàn phím, thiết bị scan |
| Production actual function/schema/constraint sau006 | NOT_RUN | Chưa nhận JSON diagnostic; người dùng báo đã ổn, không có đối chiếu độc lập |
| Public QR/menu 40 concurrent reads | PASS local smoke | 0 lỗi, p50=413ms, p95=456ms; không phải capacity/SLA |

## 3. API thực tế, DTO và typed clients

Có **16 method entries** Phase2 trên 12 route files nghiệp vụ. Ngoài ra `GET /api/owner/auth/refresh` là redirect303; login/logout là server actions, không tính vào bảng JSON API này. Không có route trùng QR PATCH/DELETE, session-close, orders hoặc payment implementation.

Import customer từ `@/features/customer/api-client`; owner từ `@/features/owner/api-client`. Các hàm **resolve trực tiếp data**, không trả `ApiResponse<T>` cho component.

| Method / endpoint | Typed client | Data thành công |
| --- | --- | --- |
| GET `/api/public/qr/:code` | `fetchQrResolution(code)` | 200 `QRResolution` |
| POST `/api/public/table-sessions/verify` | `verifyPublicTableSession(input)` | 200 `QRResolution` |
| GET `/api/public/menu?qrCode=…` | `fetchPublicMenu(code)` | 200 `MenuV1View` |
| GET `/api/owner/tables?tableId=…` | `fetchOwnerTables(tableId?)` | 200 `OwnerTableList` |
| POST `/api/owner/tables` | `createOwnerTable(input)` | 201 `OwnerTable` trực tiếp, gồm QR đầu tiên |
| PATCH `/api/owner/tables/:id` | `updateOwnerTable(id,input)` | 200 `OwnerTable` |
| POST `/api/owner/tables/:id/sessions` | `openOwnerTableSession(id,input)` | 201 `OwnerSessionOpenedView`, private credential |
| GET `/api/owner/qr-codes` | `fetchOwnerQrCodes()` | 200 `OwnerQrCode[]` trực tiếp |
| POST `/api/owner/qr-codes` | `writeOwnerQrCode(input)` | 201 create / 200 set_active `OwnerQrCode` |
| POST `/api/owner/qr-codes/:id/rotate` | `rotateOwnerQrCode(id,input)` | 201 `OwnerQrCode` mới |
| GET `/api/owner/menu?includeInactive=true` | `fetchOwnerMenu(includeInactive?)` | 200 `OwnerMenuView` |
| POST `/api/owner/menu` | `createMenuItem(input)` | 201 `OwnerMenuItem` |
| PATCH `/api/owner/menu/:id` | `updateMenuItem(id,input)` | 200 `OwnerMenuItem` |
| GET `/api/owner/menu/categories` | `fetchCategories()` | 200 `OwnerMenuCategory[]` |
| POST `/api/owner/menu/categories` | `createCategory(input)` | 201 `OwnerMenuCategory` |
| PATCH `/api/owner/menu/categories/:id` | `updateCategory(id,input)` | 200 `OwnerMenuCategory` |

Types canonical ở `docs/contracts/types.ts` (`@contracts`); additive lifecycle projections ở `src/types/contracts/table-qr.ts`, theo [C04 contract request](P2_C04_CONTRACT_CHANGE_REQUEST.md). Zod strict input ở `src/lib/validations/{table-sessions,table-qr,menu,cart}.ts`. Menu output có runtime schemas kiểm fixture/domain; transport generic kiểm envelope, **không parse toàn bộ DTO response bằng Zod**. Không coi TypeScript cast ở adapter là runtime validation.

`qrType: table | takeaway` khác `orderType: dine_in | takeaway`: lấy `resolution.mode`, không suy ra từ URL hoặc input client. R03 không có store/type/session field; ghép R01 để tạo cart context.

Ví dụ JSON đúng shape, chỉ minh họa:

```json
{"data":{"type":"takeaway","mode":"takeaway","store":{"id":"c0500000-0000-4000-8000-000000000001","name":"Quán minh họa","timezone":"Asia/Ho_Chi_Minh","acceptingOrders":true},"table":null,"requiresSessionCode":false,"session":null},"error":null}
```

POST tạo QR quầy:

```json
{"requestId":"c0500000-0000-4000-8000-000000000002","action":"create","type":"takeaway","tableId":null}
```

Response đầy đủ owner-table/QR và session delivery: [C04](P2_C04_TABLE_QR_HANDOFF.md), [C01](P2_C01_QR_HANDOFF.md). Menu output đầy đủ: [public fixture](../contracts/fixtures/menu-public.json), [owner fixture](../contracts/fixtures/menu-owner.json), được parse trong tests.

```json
{"data":null,"error":{"code":"INVALID_STATE_TRANSITION","message":"Bàn không hoạt động hoặc đã có phiên đang mở.","details":{"field":"expectedUpdatedAt"}}}
```

Message trên là chuỗi hiện tại của API; code/status/details mới là discriminator. Không phân nhánh bằng chuỗi tiếng Việt.

| HTTP | Mã canonical / xử lý |
| --- | --- |
| 400 | VALIDATION_ERROR: sai schema, unknown fields/query, body quá giới hạn |
| 401 / 403 | UNAUTHORIZED / FORBIDDEN; SESSION_REQUIRED khi cần quyền phiên |
| 404 | INVALID_QR hoặc RESOURCE_NOT_FOUND; không lộ tenant khác |
| 409 | INVALID_STATE_TRANSITION, DUPLICATE_REQUEST_CONFLICT, SESSION_CHECKOUT_PENDING; field allowlist như activeQr/activeSession/retiredQr/expectedUpdatedAt |
| 410 | SESSION_EXPIRED khi command cần phiên/grant còn hiệu lực; R01 có thể trở về unverified |
| 422 | INVALID_SESSION_CODE; menu business validation dùng VALIDATION_ERROR; R18 table inactive dùng INVALID_STATE_TRANSITION + field tableActive |
| 429 | RATE_LIMITED + Retry-After/details.retryAfterSeconds |
| 500 | INTERNAL_ERROR sanitized; không SQL/stack/credential |

Không tạo enum INACTIVE_QR/NO_ACTIVE_SESSION/MENU_UNAVAILABLE/OPTION_INVALID song song. Empty menu là200 arrays rỗng. `MenuApiError` có status/error/retryAfterSeconds; fetch network failure là `TypeError`. Adapter không tự retry hay fallback mock.

## 4. Auth, cookie, cache, locking và retry

- Owner Auth xác minh server-side; store lấy membership, không nhận tenant context từ body. DB RPC kiểm lại owner/store. Anonymous/authenticated không được gọi sensitive RPC trực tiếp; service key chỉ ở server.
- Guest browser cookie production `__Host-qr_guest`, dev `qr_guest`: CSPRNG256-bit/43 ký tự, HttpOnly, Secure trong production, SameSite=Lax, Path=/, host-only, TTL30 ngày. Browser context rỗng chưa có quyền phiên/đơn.
- Mã phiên hiện dùng CSPRNG128-bit/22 ký tự, TTL24 giờ; input contract vẫn opaque1–64, không PIN6 số. DB lưu hash và encrypted replay artifact AES-256-GCM, AAD ràng buộc actor/store/table/session/request. R12 private result mới chứa code; không có API đọc/rotate code. Mất encryption key không phục hồi code cũ.
- Guest grant đúng một session/store/table, tối đa12 giờ và không vượt code expiry. Một browser bundle có thể có nhiều grant độc lập. Close revoke grant và delivery artifact trong cùng transaction; không có nghĩa xóa toàn bộ cookie của browser hoặc cấp quyền phiên mới.
- Reload phải resolve lại R01 từ HttpOnly cookie; UI boolean/storage không xác thực được phiên. Checkout-pending cho đọc/verify, `requireGuestTableSession(...,{forWrite:true})` từ chối ghi.
- Fetch `credentials:'include'`, `cache:'no-store'`; API private/no-store. Mutation same-origin/JSON, body tối đa4096 bytes ở Phase2. Không query-cache response grant/owner công khai.
- R01 và R03 chia sẻ browser+QR read bucket60/phút; verify5 sai/phút/browser+QR, thêm QR/IP cap; owner read120/write30/phút. R03 gọi resolver trong transaction nên cũng tiêu thụ read budget. Cần tính cả hai request khi thiết kế polling.
- Cart refresh tuần tự R01 rồi R03, coalesce request, bỏ response cũ, passive visibility/reconnect có throttle30s; 429 theo deadline, 500/network chờ retry rõ ràng. Không refresh do mỗi thay đổi cart/re-render.
- Owner command cần giữ nguyên requestId, normalized payload và expectedUpdatedAt **chuỗi microsecond nguyên bản** khi retry kết quả chưa rõ. Đổi command sau khi người dùng sửa ý định thì dùng key mới; không tự né conflict. Mutation/replay xong refetch để lấy snapshot hiện tại, không để replay cũ ghi đè state mới.
- Migration006 resolver khóa **bàn → QR → phiên**; locator QR đầu không khóa, phải reread active QR dưới lock. Owner lifecycle dùng store → bàn → QR; menu write có store serialization. Không đảo thứ tự trong Phase3. Local race tests hỗ trợ kết luận trong các luồng đã test, không chứng minh không thể deadlock với mọi SQL quản trị ngoài API.

## 5. Menu/cart và storage

- Giá nguyên VND >=0 và <=MAX_SAFE_INTEGER; tổng/multiply kiểm overflow. Quantity1–99, tối đa100 lines, note<=500, tối đa50 option IDs. Quantity0/âm reject; xóa dùng removeLine, không ngầm hiểu0 là delete.
- Options optional/additive; mỗi ID chọn một lần, phải thuộc item và available. Không group/required/exclusive/min/max; yêu cầu kiểm required option của prompt là CG-02, không invent policy.
- Public chỉ category/item active; item unavailable vẫn hiển thị `available:false`, không thêm vào giỏ. Option inactive bị ẩn, unavailable bị chặn chọn. Hai QR cùng store dùng chung menu revision. Owner options replacement soft-deactivates omitted IDs.
- Ảnh HTTPS host `images.unsplash.com` theo allowlist, không server fetch URL. Không upload endpoint. Name/note là text, không HTML thực thi; runtime XSS trong DOM cần browser acceptance.
- Cart scope `[storeId,qrCode,orderType,tableId]`; session binding riêng. Đổi QR/store/mode/table cách ly giỏ; cùng bàn nhưng phiên mới cần `confirmContextChange()` sau fresh server resolution. Không cho client tự set verified.
- Price/revision đổi giữ intent/preview cũ, hiển thị proposed price và yêu cầu `confirmReview()`. Item/option removed/unavailable là lỗi chặn, không tự xóa/substitute. Trong test thực tế: preview64000, unit đề xuất34000, xác nhận mới thành68000; sold out/option remove chặn; bỏ option lỗi rồi review còn62000.
- `checkoutReadiness`: empty/menu_refresh_needed/verify_table_session/cart_invalid/ready_to_review. Trạng thái cuối chỉ cho xem lại; Phase2 không tạo order/ticket/payment hay ID submit.
- sessionStorage v1 chỉ explicit projection IDs/quantity/numeric preview/context/boundSessionId và note omission flag. Notes/labels/credentials không persist; note bị bỏ khi reload cần nhập lại/xác nhận. Saved revision/giá không trao readiness. Corrupt/version/scope/quota reject an toàn, RAM fallback và warning.
- `prepareOrderDraft()` trả `Omit<CreateOrderV1Input,'clientRequestId'>`: qrCode/menuRevision/items/note, không gửi price/storeId/sessionId/status/ticket/token. C05 chưa sinh key R04.

## 6. Gemini follow-ups — chỉ UI, chưa được Codex sửa

Các dòng dưới là snapshot source tại lúc audit; kiểm lại sau khi Gemini sửa. Tests UI hiện PASS không phủ các thao tác browser này.

| ID / severity | File, reproduction và contract cần giữ |
| --- | --- |
| UI-01 HIGH | `OwnerShell.tsx:179` chỉ fetch khi activeTab=tables; `:543` chọn takeaway đầu tiên không lọc active/retired. Đăng nhập → mở Cài đặt thẳng: QR đang có có thể bị coi là chưa tạo. Rotate → refetch lịch sử: có thể chọn QR retired. Load bằng `fetchOwnerQrCodes` ở settings, loading/error tách empty, chọn active && retiredAt===null, 409 activeQr thì refetch. |
| UI-02 HIGH | `TableManagementView.tsx:94,155`, `TableQrModal.tsx:149`, `TakeawayQrCard.tsx:115,151`, `OwnerMenuView.tsx:238`: mỗi click sinh randomUUID mới. Cho server commit rồi mất response, bấm thử lại: key mới mất replay, có thể409 hoặc mất đường nhận lại code phiên. Giữ command/payload/CAS qua uncertain retry, dùng typed clients; không tự retry bằng key mới. `AddEditTableDialog` đã có giữ key, không báo lỗi chung cho mọi form. |
| UI-03 HIGH | `TableQrModal.tsx:76` và `TakeawayQrCard.tsx:59`: fallback window.origin/path hoặc QR dựng từ tableId/COUNTER_PUBLIC. Modal bàn khi qr=null vẫn có thể coi active qua `currentQr?.active !== false`. Repro bàn không có QR hoặc publicUrl thiếu → print/download có thể xuất mã không resolve/khác host. Chỉ render/copy/download/print khi có `qr.publicUrl` server hợp lệ; missing/inactive/retired cần UI trạng thái rõ ràng. |
| UI-04 HIGH | `customer/cart/usePresentationCart.ts:245–290`: compound edit gọi updateOptions → updateNote → updateQuantity bằng key tự tính. Repro A qty1/no option, B qty2/optionX, cùng item/note; sửa A thành optionX và qty3: updateOptions đã merge thành3, bước quantity đặt cả line merged thành3 thay vì giữ B2 + A3 =5. Đổi note sau merge còn có thể sửa toàn bộ line B. Key note raw trim còn có thể khác normalization bỏ control character của domain. Cần command edit atomic với intent nguồn, không lần lượt mutate sau merge; giữ canonical merge semantics. |
| UI-05 MEDIUM | `dashboard/page.tsx:43` vẫn truyền MOCK_STORE.name, `OwnerShell.tsx:536` status mở cửa là text tĩnh. Repro đổi tên/acceptingOrders thật rồi reload: header/QR voucher/trạng thái có thể sai. Bind authorized store snapshot, không suy từ mock. Store settings API chưa triển khai thì ghi placeholder đúng, không giả trạng thái live. |
| UI-06 MEDIUM | `docs/design/P2_G05_GEMINI_UI_READINESS.md` nói mã phiên6 số và các viewport TESTED-PASS, nhưng implementation mã128-bit22 ký tự và tests/ui chạy node. Chưa có browser artifacts Codex kiểm chứng; tests G05 nhiều case assert literal/fixture, không mount DOM. Cập nhật wording/bằng chứng; không dùng72 unit tests để chứng minh focus trap/overflow/in/scan. |

G05 đã sửa default orders thành empty waiting shell và có banner confirm context trong CartSheet; không còn báo thiếu hai phần đó. Dev demo chỉ khi có opt-in; Production không render live orders giả mặc định. Không chỉnh docs/design của Gemini trong C05.

## 7. Contract gaps và setup/migration

- **CG-01 — close session:** prompt C05 muốn mở/đóng ở Phase2 nhưng C01/C04 hiện defer settlement/close, canonical R13 là `POST /api/owner/table-sessions/:id/settle` với begin_checkout/cancel_checkout/confirm_received. Không thêm `/close`, không force-close để rotate. Cần chủ dự án chốt phase/scope trước triển khai, giữ session lock/revoke/settlement invariants. Test close hiện chỉ fixture local.
- **CG-02 — required options:** frozen model chỉ additive optional options. Không có required/min/max để test đúng nghĩa; cần contract change nếu muốn. Hiện test duplicate/foreign/unavailable/limits đúng model.
- **CG-03 — Phase3 UI draft:** G05 handoff tự định nghĩa lại OrderDetail/payment union, gợi ý persist cả notes và TTL10 phút. Dùng types canonical và privacy policy thực tế, không copy DTO rút gọn hoặc chốt payment TTL từ ví dụ. Xem [handoff Phase3](P2_C05_PHASE3_HANDOFF.md).

Local áp dụng001 foundation →002 bootstrap privileges →003 sessions →004 row-lock privileges →005 menu →006 lifecycle. Không reset database thật, không rerun CREATE migration đã apply. Seed chỉ chạy đúng môi trường và theo preflight, không dùng seed để reconcile/xóa QR/session Production.

Resolver fix/migration006 và kiểm thử rollback đầy đủ: [audit](P2_C04_RESOLVER_MIGRATION_AUDIT.md), [preflight](P2_C04_MIGRATION_PREFLIGHT.md), [read-only diagnostic](../../supabase/diagnostics/p2_c04_resolver_preflight.sql). Đã tái hiện marker CRLF không được normalize trong khi source đã normalize LF; bản sửa normalize cả source/marker/replacement, checksum baseline+patched body, metadata guard, exactly-one block, BEGIN/COMMIT và data guards còn nguyên. Không sửa/xóa resource rows để migration qua.

Production: user báo “đã ok r” ngày23/10, chưa có JSON để xác nhận actual function hash/schema. Trạng thái này thay cho yêu cầu chờ phản hồi, không tự apply Production. Khi kiểm toán Production cần definition/metadata/markers/artifacts/index/constraint/privilege và API smoke theo preflight; không suy ra từ row counts hoặc build.

Env cần: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY (server-only), APP_BASE_URL, TABLE_SESSION_ENCRYPTION_KEYS, TABLE_SESSION_ACTIVE_KEY_ID. APP_ORIGIN/TRUST_PROXY_IP theo ingress; owner bootstrap flags khi dùng startup provisioning. APP_BASE_URL phải origin HTTPS ở Production; không pathname/query/userinfo, không lấy Host header. Thiếu/sai base URL là sanitized500 trước mutation, không dùng browser origin fallback. Không ghi secret/value env vào handoff.

## 8. Checks, performance và giới hạn

| Command | Kết quả thực tế trong audit |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts` | PASS90/90, 9 files; gồm7 typed-client +3 fault cases; chạy lại21:54 |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts` | PASS56/56, 7 files; lần cuối21:47–21:48 |
| `npm run test:auth` | PASS46/46, 7 files; chạy lại21:54 |
| `npm run test:db` | PASS9/9, 2 files; expectation theo quyền006; chạy lại21:54 |
| `node node_modules/vitest/vitest.mjs run --config tests/ui/vitest.config.mts` | PASS72/72, 5 files; lần cuối21:47; node tests, không browser |
| `python docs/contracts/validate_contracts.py` | PASS19 C01 +26 C02 typed examples, 6 negative type checks, 21 route sections, 35 planned cases; document/type validation |
| `node tests/integration/qr-http.mjs` | PASS trên Next production-mode + Supabase local |
| `node tests/integration/table-qr-http.mjs` | PASS auth/CRUD/CAS/replay/rotate/session/rates/log privacy local |
| `node tests/integration/menu/http-smoke.mjs` | PASS, gồm40-read burst0 errors, p50=413ms/p95=456ms |
| `npm run lint` | PASS0 warning/error lần cuối21:47; warning import mới của Gemini ở lần trước đã được sửa |
| `npm run typecheck` | PASS, lần cuối21:49 |
| `npm run build` | PASS, lần cuối21:49; compile1.56s; build không chứng minh kết nối/schema Production |
| `git diff --check` | PASS; không còn file tạm từ contract validator sau khi chạy xong |

Tổng5 Vitest suites trên: **273 tests PASS**, không có failed test hiện tại. Đây là tổng case, không phải273 yêu cầu độc lập. Giới hạn gate:2 nhóm BLOCKED (close contract, yêu cầu required-options ngoài model),3 nhóm NOT_RUN (browser, Production đối chiếu, order/payment scope sau), và UI source findings ở mục6; không đếm mọi scenario con thành test đã chạy.

Menu dùng một RPC/snapshot cho mỗi request, không app network N+1 category→item→option. SQL projection options có correlated subquery theo item, dùng index `menu_option_item`; chưa có EXPLAIN/load profile trên thực đơn lớn. Không khẳng định database không có per-item subplan hoặc sức tải ngày lễ. Smoke40 reads dùng browser đã bootstrap,10 request/path+QR; chưa phải spike new-cookie/whole-store/slow-client soak. Không thêm index chỉ vì phỏng đoán.

Fixtures integration dùng random users/store/UUID và loopback15421/15422, có teardown. Fresh/rollback migration test chạy scratch DB local, không reset DB dùng chung hay Production. Unit mocks chỉ chứng minh validation/serialization/fault handling; concurrency dựa PostgreSQL thật.

## 9. Gate còn lại

1. Gemini sửa UI-01–04 và bind store thật UI-05; retest uncertain-response replay, active QR selection và compound edit.
2. Nghiệm thu browser/responsive/keyboard/print/download/physical scan với API thật; lưu bằng chứng thay cho literal tests.
3. Chốt CG-01/CG-02 hoặc phê duyệt defer rõ ràng, không phát triển endpoint ngoài contract để vượt gate.
4. Xác minh actual Production schema/function/privileges và smoke sau migration khi có kết quả/được triển khai đúng quy trình.

Backend/domain local đã có bằng chứng để lập kế hoạch Phase3; **chưa đóng gate Phase2 và chưa tuyên bố Phase3 READY**.
