# P0-C02 review — API/access/UI handoff

`contractVersion: v1-draft` · Ngày 23/10/2026 · **P0-C02: DONE ở mức đặc tả và kiểm tĩnh; không phải API runtime hoặc Phase 0 được owner nghiệm thu.**

## 1. Input audit và phạm vi

- Đã đọc README→PRD→ARCHITECTURE→PLAN→TASKS ở root; không có REFERENCE/. Đọc đủ P0-C01 DOMAIN_MODEL/STATE_MACHINES/types/EXAMPLES/OPEN_QUESTIONS và script kiểm tra. P0-C01 có đủ enums và type/state machine bắt buộc; kiểm tĩnh baseline 19 examples + 3 negative type cases PASS trước khi sửa. Không có prerequisite blocker “C01 thiếu/chưa hoàn thành”. Những câu hỏi policy của C01 vẫn là câu hỏi, không giả owner đã duyệt.
- Đã đọc P0-G01 DESIGN_FOUNDATION, WIREFRAMES, SCREEN_INVENTORY, OPEN_QUESTIONS. Chỉ lấy data/state/action needs, không sửa bố cục, palette, font hoặc file thiết kế.
- Trong quá trình C02 thấy thêm P0-G02 SCREEN_SPEC_V1/COMPONENT_MAP/UX_STATE_MATRIX/P0_G02_REVIEW ngoài vùng sở hữu. Đã đọc riêng review G02 để ghi nhận hai contract requests vào UI_DATA_HANDOFF cuối file; không tuyên bố đã audit toàn bộ G02 hoặc tự tick gate của Gemini. Tài liệu mới được giữ nguyên.
- Chỉ tạo/sửa docs/contracts/**. Không package install, migration, src/API/auth/payment/realtime implementation, .env, credentials thật hoặc provider/account access.

## 2. Cross-check C01 ↔ route ↔ G01

| C01 evidence | Route contract | P0-G01 yêu cầu | Kết quả |
|---|---|---|---|
| QRResolution hai type, requiresSessionCode/session scope | R01/R02 | SCR-C01, WIREFRAMES §1.1, OQ §2 | Resolve không lộ phiên/code trước verify; input code opaque, không PIN4/URL secret |
| MenuItem/MenuOption/CartLine | R03/R04 | SCR-C01/C02/C03, SCREEN_INVENTORY §2.1/2.2 | Giữ categories join, available thay active option, null thay optional; v1 thêm menuRevision |
| DineInOrderSummary ticket issued, snapshot lines | R04/R05 | SCR-C04/C06, wireframe §1.3/1.5 | 201 accepted có ticket; lines.name/quantity/options snapshot giữ canonical |
| Takeaway pending/paid/exception, intent vs payment enums | R04/R06/R21 | SCR-C05/C06, OQ §3/8 | Pending null ticket; webhook verified release; UI không hardcode paid=redirect/countdown |
| Strict FIFO claim, operation_requests | R07/R08/R09 | SCR-OWN-01, WIREFRAMES §2.1 | Một claim-next toàn store; không filter/orderId bypass; expectedVersion cho ready |
| Fulfillment served/collected, PickupCredential | R05 private projection/R10 | SCR-C06/OWN01, OQ §4 | Code khác access cookie, owner server verify bắt buộc, không code list; Q5 gate |
| TableSummary/TableSessionDetail/SessionSettlement | R11/R12/R13 | SCR-OWN-02, SCREEN_INVENTORY §2.4 | Grid session không currentSession secret; private open response; begin/cancel/confirm cùng settle route |
| Menu active vs available, immutable snapshots | R14/R15/R16 | SCR-OWN-03, wireframe §2.3 | Soft disable, options write thuộc item, server pricing/menu revision atomic; no upload giả |
| QRCode/Store/tenant security | R17/R18/R19/R20 | SCR-OWN-04, wireframe §2.4 | QR locator public, provider metadata sanitized, chưa address/logo/hours/PDF/probe |
| OutboxEvent/version/reconnect | Các mutations, GET re-fetch | G01 polling 3/8/5 giây | Private invalidation sau commit, polling backoff, không cam kết capacity chưa đo |
| ApiSuccess/Failure và C01 error status | Toàn bộ R01–R21 | G01 lỗi/expired/offline | Envelope giữ nguyên, HTTP410 expired giữ, 422 proof sai, 409 race, 429 backoff |

## 3. Mâu thuẫn và quyết định giải quyết

| Vị trí / field | BEFORE (C01 hoặc đề xuất G01) | AFTER v1-draft / lý do |
|---|---|---|
| types.ts menu request, C01 Q3 | CreateOrderInput chỉ item ID, không cách biết menu khách từng thấy; quote protocol mở | **Additive** MenuV1View(menuRevision/serverTime), CreateOrderV1Input(menuRevision required). Giữ CreateOrderInput/EXAMPLES v0.1 hợp lệ nhưng không nhận như v1 complete request. Server store revision bump+read/submit lock, không tin giá client; Q3 default draft chưa owner approve |
| C01 replay chỉ cùng GuestAccess; takeaway first response lost | Cookie order chỉ sau create có thể mất cùng response, retry không chứng minh được creator | Bootstrap opaque browser context tại QR trước submit; server-side bundle grant per scope, creator browser binding từ trước. Grant được bind transaction; replay cookie cũ khôi phục đúng order. Không public lookup theo key, không token JSON. Không tạo role/tài khoản guest |
| types.ts banner và domain privacy statement | “No code belongs here”, secret delivery protocol chưa có | General DTO giữ nguyên không code. **Thêm riêng** OwnerSessionOpenedView private owner và PrivateOrderTrackingView buyer-only cùng transient verify/complete inputs. Không thêm code vào OrderDetail/TableSummary/OwnerOrdersView. Q5 encrypted delivery/key lifecycle vẫn gate trước live |
| G01 MenuItem.categoryName/options.active, item fields optional | Pseudo interfaces không đồng nhất types.ts | Dùng categoryId→categories join; MenuOption.available, description/imageUrl/note nullable, options luôn [] nếu không có; không đổi tên canonical |
| G01 OrderDetail.publicId/items/qty/nameSnapshot/tableLabel | Nhiều alias field mới và serviceDate không null | id là opaque tracking locator, lines/quantity/name/table.label canonical; serviceDate/acceptedAt null trước acceptance; publicId chỉ alias UI, không API field |
| G01 payment.status=succeeded | Trộn intent status với aggregate tiền | payment.status=paid, intentStatus=succeeded, không đổi enums C01 |
| G01 TableSummary.currentSession.sessionCode | Code trong list và đang có thể đọc lại hash | session thay currentSession; không code grid, R12 private delivery. Đọc/rotate code lại chưa route; CR-UI-05, không giả hash đảo ngược |
| G01 UI expiry15/regen, C01 default10 | Hai TTL chưa duyệt; UI countdown có thể auto-expire/tạo payment mới | Đọc server expiresAt/Date, refetch khi zero; giữ C01 ASSUMPTION10 như default đề xuất, không quyết định owner. No auto regen/payment2 |
| G01 pickupCode ví dụ4 số, token chú thích wireframe | Có thể hiểu code là access token, hoặc so bằng mắt đủ | Cookie access độc lập, code opaque format cần chốt, R10 server verify+consume atomic; không bỏ proof; CR-UI-06 |
| G01 OQ §7 SESSION_CLOSED + HTTP400/409 | Sai error enum/status C01 | SESSION_EXPIRED410 khi closed/expired, SESSION_CHECKOUT_PENDING409 khi đang thu. Không thêm alias |
| G01 OQ §8 accept exception→ticket/refund | Owner có thể vượt verified-payment gate; chưa policy/refund entities | Không route/action này trong v1; exceptions read-only, Q4 gate P1. Không tự paid/queue hoặc xóa ledger |
| C01 admission counter vs ngày đổi | Counter per-day đủ uniqueness nhưng chưa serialize old/new-day acceptance và claim | **Store admission gate chung với claim**, lấy trước session/intent/order/counter, giữ tới commit để fairness qua boundary. Giữ counter per store/day và ticket immutable; tradeoff contention cần đo |
| C01 STATE_MACHINES settle có thể open→closed trong một command | Khó UI phân biệt begin lock bill và confirm money | R13 bắt buộc explicit action begin_checkout/cancel_checkout/confirm_received, confirm chỉ checkout_pending; cùng route không thêm API. State transitions open→checkout_pending→closed giữ nguyên |
| C01 derived payment order version | Settlement paid có thể thay DTO order mà version không đổi | Success settlement tăng order versions/invalidation atomic với session close, không đổi ticket/status; cần reconnect đọc đúng snapshot |
| C01 Store event version/settings CAS metadata | StoreView chưa có version/updatedAt, menu event aggregate chưa rõ | stores.version/updated_at và menu_revision là persistence bổ sung dự kiến; menu/QR/settings events dùng store.id/version nội bộ, StoreSettingsView.updatedAt cho CAS. Không thêm version bắt buộc vào StoreView; lock store trước menu metadata mutation |
| types.ts error literals | Không code cho wrong session code/resource generic | Thêm INVALID_SESSION_CODE (422), RESOURCE_NOT_FOUND (404), giữ SESSION_EXPIRED410 và lỗi gốc. VALIDATION_ERROR 400 schema, 422 semantic được nêu rõ |
| Owner detail/table detail không endpoint read riêng trong baseline | Type tồn tại nhưng route list chưa có projection | OwnerOrdersView.detail từ orderId query, OwnerTablesView.detail từ tableId query. Counts server, không thêm endpoint vì layout sidebar |
| G01 settings PDF/probe/address/logo/option groups | UI mong dữ liệu/tác vụ chưa contract | Ghi CR-UI-08/10 và owner scope, không bịa field/backend. QR path render/print client được phép khi giao UI |

## 4. Changelog contract-owned files

- **Tạo** API_CONTRACT_V1.md: 21 routes, auth/request/response/errors/idempotency/concurrency/rate/events, private projections, replay/reload và webhook release examples.
- **Tạo** SECURITY_AND_CONCURRENCY.md: actor matrix, credentials/cookies, admission+counter/claim, webhook/settle races, private realtime và 35 runtime test-plan cases (chưa thực thi).
- **Tạo** UI_DATA_HANDOFF.md: 9 vùng UI chính + item/login context, state/action matrices và CR-UI-01..12 có READY/OPEN/BLOCKER/ASSUMPTION.
- **Tạo** P0_C02_REVIEW.md: nguồn/traceability, BEFORE→AFTER, audit, readiness, giới hạn xác minh.
- **Sửa** types.ts additive exports cho v1, thêm hai error literals, điều chỉnh privacy banner chỉ để cho phép private DTO riêng; **không đổi** field names/status literals của MenuItem/CartLine/OrderDetail/TableSummary/PaymentViewState/QRResolution/ApiSuccess/Failure C01. Không xóa dữ liệu hợp lệ trong EXAMPLES.
- **Sửa** DOMAIN_MODEL.md, STATE_MACHINES.md và OPEN_QUESTIONS.md: ghi delta v1 và pointer mới, thống nhất privacy exceptions/menuRevision/browser bundle/admission gate/settle actions/derived version; C01 assumptions vẫn được nhận diện, không giả user approve.
- **Sửa** validate_contracts.py: kiểm tĩnh JSON fences cả API và examples, compile exported types bằng tsc có sẵn, allowlist riêng credential demo private R12, kiểm 21 route headings và bốn file cần có. Đây là artifact verifier, không API/runtime test implementation.

## 5. READY / OPEN / BLOCKED và người quyết định

| Hạng mục | Trạng thái | Người chịu trách nhiệm / evidence hoặc gate |
|---|---|---|
| P0-C02 bốn file + 21 request/response/auth route specs | READY FOR INTEGRATION MOCK | Codex đã viết; route index R01–R21, schema/type/export và JSON tại API |
| C01 types/state/examples consistency + v1 DTOs | READY FOR INTEGRATION MOCK | Static compiler/JSON/invariant verification kết quả §6, không khẳng định backend tồn tại |
| G01 field mapping và owner actions/ticket guard | READY FOR INTEGRATION MOCK | UI_DATA_HANDOFF §1–5, Gemini consume đúng tên types, không sửa docs/design ở task này |
| Provider, raw signature/body/ACK, checkout/query capability | **BLOCKER trước Phase 4 live (PG-01)** | Owner chọn vendor; Codex verify docs/sandbox/merchant. Chưa gọi provider API hoặc quyết định payOS/SePay |
| TTL10 vs15, format/entropy/code attempts/delivery/recovery | **OPEN / BLOCKER trước Phase 2/4 credential flow thật** | Owner/security chốt Q2/Q5, Codex implementation; không blocker để mock null/expired/private boundary |
| Menu revision handshake Q3 | ASSUMPTION technical draft | Codex thiết kế tối giản không endpoint mới; cần review integration trước Phase3, UI mock dùng MenuV1View revision |
| Settlement yêu cầu mọi order completed/empty bill0 | ASSUMPTION Q6 / cần owner trước Phase5 | Không tự coi policy được duyệt; route action semantics đã đủ mock |
| Ngày vận hành/pause và admission gate performance | ASSUMPTION Q7 + OPEN benchmark | Default nửa đêm timezone store; owner chốt boundary, Codex DB stress/lock tests sau |
| Refund/accept exception/extra UI features | OPEN/BLOCKER nếu bật feature | Owner Q4/scope; không trong v1 route mutations. Contract requests có ở handoff |
| T-005/Gemini-owner nghiệm thu visual/contract | OPEN external review | Artifact bàn giao có sẵn, chưa có bằng chứng Gemini/chủ dự án đã xác nhận; không tick TASKS.md |
| DB/API/auth/RLS/payment adapter/realtime/tests runtime/deploy | NOT IMPLEMENTED, phase sau | Không source production trong task; không gọi “API chạy được” |

## 6. Verification và completion audit

Lệnh artifact check: `python docs/contracts/validate_contracts.py`. Không cài dependency; dùng Python stdlib và TypeScript compiler có sẵn. Kiểm JSON parse, strict compile các fence gắn type, enum/label/fulfillment/ticket/amount/session references, queue ordering, private credential allowlist và ba negative type cases gốc. 21 route headings R01–R21 đối chiếu route index/schema success/auth trong API; review thủ công nội dung errors/concurrency/rate/event từng section.

Kết quả verifier: **PASS 19 JSON P0-C01 + 26 JSON P0-C02, TypeScript strict, 6 negative type checks, đủ 21 route sections, ticket/status/amount/scope references và allowlist credential demo chỉ trong hai private projections**. S01–S35 là **35 ca test plan chưa chạy**, không dùng static typecheck để tuyên bố chữ ký/RLS/FIFO runtime đã đúng. Hash sáu tài liệu root, assets/ui-reference.png và các tài liệu design đã có khi chụp baseline đều không đổi; các file G02 mới xuất hiện không phải thay đổi do Codex. Không commit, không sửa tài liệu nguồn.

Checklist nghiệm thu task:

- [x] Có API_CONTRACT_V1.md, SECURITY_AND_CONCURRENCY.md, UI_DATA_HANDOFF.md, P0_C02_REVIEW.md.
- [x] 21 route chính có field schema, full success JSON/envelope, lỗi/HTTP/auth, rate/idempotency/concurrency/event semantics.
- [x] Pending takeaway ticket=null; chỉ verified backend payment acceptance transaction cấp số; không FIFO theo client timestamp/MAX hoặc button arbitrary claim.
- [x] DTO/status canonical giữ C01; alias khác của G01 có quyết định mapping, credential outputs riêng, versioned additions/changelog rõ.
- [x] Matrix có duplicate webhook, concurrent order/claim, late/expiry, QR cũ, weak-network/reload và security scopes.
- [x] File ownership không chồng Gemini, có ready vs open/blocker list và handoff review; không gọi API runtime đã triển khai.
