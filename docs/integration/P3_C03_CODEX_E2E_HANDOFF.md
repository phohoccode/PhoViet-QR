# P3-C03 — Dine-in / PIN / FIFO integration QA

2026-10-24, Asia/Saigon. **Backend/local QA: PASS. Phase 4 readiness: BLOCKED** pending the Gemini items below and browser acceptance. This is permission to continue backend planning, not a production release approval. Takeaway payment is deliberately unimplemented Phase 4 scope, not a Phase 3 regression.

## Scope and authoritative state

Audited the current dirty worktree before editing, including root requirements, canonical contracts/addenda, P3-C01/C02 and P2-HF01 handoffs, API/service/validation code, migrations001–009 and existing tests. Existing uncommitted hotfix/PIN and concurrent Gemini changes were preserved. No customer/owner page, component, style or design document was edited by Codex for C03. No dependencies, architecture, DTO, endpoint or runtime implementation were changed.

This round changes only:

- `tests/integration/orders/http-smoke.mjs`: extends the existing real HTTP flow with a second menu item, wrong/rotated PIN denial before any order/counter, grant continuity after rotation, second-device session access and buyer-only projection denial, copied-cookie resolve continuity, takeaway menu access, and20 concurrent HTTP creates sharing one key. Adds PIN audit cleanup for its own fixture.
- `tests/integration/orders/orders.test.ts`: one new real DB test executes checkout-first and create-first races, waits for an observed PostgreSQL lock holder, proves the losing new submit cannot allocate, and checks existing reads/replays remain valid during checkout.
- This handoff.

**No new migration:** the audited backend met the tested invariants. Existing001–009 are prerequisites; C03 does not rewrite applied migrations. Migration009 and PIN code visible in `git status` belong to the preceding hotfix. Production deployment state is unknown; no Production SQL/API mutation, reset, seed or migration was performed.

## Audit: existing / missing / defect / action

| Connection | Existing implementation | Missing or defect | C03 action/evidence |
| --- | --- | --- | --- |
| QR → PIN | R01 public resolver; R02 strict six ASCII digits; scoped contextual HMAC | No backend defect found | Real PIN/QR DB and HTTP tests |
| PIN → guest | HttpOnly opaque browser cookie; independently scoped DB grants | No backend defect found | Wrong/old PIN produces no grant capable of ordering; existing grant survives rotation |
| Guest → menu/cart | R03 public menu; cart refresh/revision review; server validation independent of client | Uncertain UI intent can be lost/rebuilt, F01 | Added HTTP coverage; Gemini action below |
| Cart → accepted | One PostgreSQL RPC validates prices/options/revision, snapshots, allocates ticket and commits replay/audit/outbox | Previously separate evidence for two items and concurrent HTTP retry | Extended HTTP flow:102000 VND,2 lines/3 units,20 requests/1 ticket |
| Checkout/close → create | Same session lock; close revokes; checkout denies new writes | Checkout-only interleaving lacked an explicit two-order test | Added both checkout-only lock interleavings; existing close race retained |
| Accepted → owner FIFO | Auth+membership; global strict FIFO gate and head recheck | No backend defect found |16 distinct-key claims; locked-head wait;20 same-key replays |
| Owner ready/complete | Version/state checks; actor-bound idempotency and atomic events | UI retains key without immutable target/version, F02 | DB/HTTP deny changed commands; Gemini must freeze intent |
| Updated order → guest | Live scoped GET returns current DB snapshot | Browser hydration/polling acceptance absent | HTTP refetch preparing/ready/completed PASS; browser NOT_RUN |
| PIN owner UI | Real reveal/rotate endpoints and typed clients exist | Version refresh/legacy retry gap, F03; secret clearing/fallbacks F06/F07 | Record exact required adapter behavior; UI preserved |
| Owner list UI | One response supplies page/count/detail | Stale-response race F04; nextCursor not consumed F05 | Backend keyset tests PASS; UI follow-up |
| Environment/schema | Local Docker Supabase running;001–009 installed | Hosted state not verified | Catalog, ACL, fresh migration/rollback/preflight tests; no Production changes |

## Actual API chain

```mermaid
sequenceDiagram
 participant O as Owner browser
 participant G as Guest browser
 participant A as Next API
 participant D as PostgreSQL
 O->>A: POST /api/owner/tables/:tableId/sessions {requestId}
 A->>D: p2_pin_execute(open)
 A-->>O: 201 OwnerSessionOpenedView (private PIN)
 G->>A: GET /api/public/qr/:code
 A-->>G: QRResolution + HttpOnly browser cookie
 G->>A: POST /api/public/table-sessions/verify {qrCode,sessionCode}
 A->>D: locate; verify context/generation/HMAC under locks
 A-->>G: 200 QRResolution; scoped DB grant
 G->>A: GET /api/public/menu?qrCode=code
 A-->>G: MenuV1View + menuRevision
 Note over G: Refresh/reconcile cart and explicit review
 G->>A: POST /api/public/orders CreateOrderV1Input
 A->>D: p3_order_execute(create), one transaction
 A-->>G: 201 OrderDetail accepted + ticket (replay also 201)
 G->>A: GET /api/public/orders/:id
 O->>A: GET /api/owner/orders?orderId=id
 A-->>O: OwnerOrdersView page/count/detail
 O->>A: POST /api/owner/queue/claim-next {requestId}
 A->>D: p3_owner_orders_execute(claim), oldest eligible head
 A-->>O: 200 OrderDetail preparing, or null
 O->>A: POST /api/owner/orders/:id/ready {requestId,expectedVersion}
 O->>A: POST /api/owner/orders/:id/complete {requestId,expectedVersion,type:dine_in}
 G->>A: GET /api/public/orders/:id (refetch at each step)
 A-->>G: Current preparing / ready / completed; unpaid
```

PIN reveal: POST `/api/owner/table-sessions/:sessionId/pin/reveal`, body `{}`. Rotate/legacy conversion: POST `/api/owner/table-sessions/:sessionId/pin/rotate`, body `{requestId,expectedVersion,confirm:true}`. These target the **session ID**, whereas opening targets a table ID. Reveal/rotate return `OwnerTablePinView`, including `sessionVersion` and `generation`; use the returned version/refetch before a new intent. All owner mutations require verified owner membership and same-origin CSRF checks.

## Contracts and UI error handling

Canonical source remains `docs/contracts/types.ts`, API_CONTRACT_V1 R01–R05/R07–R12 and P3_C01_ORDER_ADDENDUM. Earlier P0/Phase2 implementation-status paragraphs are historical; the later C01/C02/HF01 implementation handoffs supersede them. Do not implement an endpoint simply because a future DTO exists.

Typed adapters resolve **data directly**, not the envelope:

```ts
// @/features/orders/api-client
submitCustomerOrder(input: CreateOrderV1Input): Promise<OrderDetail>;
getCustomerOrderTracking(id: string): Promise<OrderDetail>;
getPrivateOrderTracking(id: string): Promise<PrivateOrderTrackingView>;
// @/features/owner/api-client
getOwnerOrders(query?: OwnerOrdersQuery): Promise<OwnerOrdersView>;
claimNextOrder(input: RequestCommand): Promise<OrderDetail | null>;
markOrderReady(id: string, input: OrderTransitionInput): Promise<OrderDetail>;
completeOrder(id: string, input: CompleteOrderInput): Promise<OrderDetail>;
revealOwnerTablePin(sessionId: string): Promise<OwnerTablePinView>;
rotateOwnerTablePin(sessionId: string, input: RotateTablePinInput): Promise<OwnerTablePinView>;
```

Transport uses credentials/include and no-store, no mock fallback, generated keys or automatic retries. `OrderApiError` aliases `MenuApiError`; inspect `status`, `error.code`, `retryAfterSeconds`. Network errors remain uncertain transport errors.

Required wire command shapes (identifiers below are schematic, not live data):

```ts
// R02: sessionCode is a string of exactly six ASCII digits; preserve zeros.
{ qrCode, sessionCode }
// R04: required nullable note fields; menuRevision obtained from fresh R03.
{ qrCode, clientRequestId, menuRevision,
  items: [{ menuItemId, quantity, optionIds, note: null }], note: null }
// R08: no orderId, filter, type or date is accepted.
{ requestId }
// R09:
{ requestId, expectedVersion }
// R10 (new key for a new action):
{ requestId, expectedVersion, type: 'dine_in' }
```

R04 rejects client tenant/session/type/price/total/ticket/status fields. Limits:1–100 lines, quantity1–99,50 distinct additive options/line,500-character notes,64KiB JSON. UUIDs normalize lowercase; option IDs sort; meaningful line order remains. Server reads active category/item/options and calculates safe integer VND. No required/exclusive option groups were introduced.

HTTP success is `{data,error:null}`. OrderDetail has `id`, `table:{id,label}`, `tableSessionId`, `status`, `ticketNo`, `serviceDate`, `acceptedAt`, `version`, `totalVnd`, `itemCount`, `lines`, `note`, `paymentStatus` and `payment`. Each line contains immutable names/options/base/unit/line prices. There is no response `items` or `tableLabel` alias. Owner list is `{storeId,orders,detail,counts,nextCursor,updatedAt}`; counts span the store, not the selected page. Omit filters for all; never send literal `all`. Queue order is serviceDate/ticketNo/id; history uses descending createdAt/id. Cursor binds tenant/view/type/status. Refetch page1 after a mutation; old pages are not a permanent snapshot.

GET public order requires a live same-session guest grant. A second verified device in that session may read ordinary detail. `includePickup=true` additionally requires creating-browser binding and returns `{order,pickup:null}` for Phase3. Owner Auth alone is not a guest grant; owner detail is R07 `orderId`. Unknown/outside-scope order IDs do not disclose another session's state.

| HTTP | Actual code(s) and required UI behavior |
| --- | --- |
|400 | VALIDATION_ERROR: malformed JSON/schema/query/UUID, extra fields, wrong content type/body limits; correct draft, do not clear cart |
|401 | UNAUTHORIZED: missing/invalid auth or guest browser mapping; restore login/verification, no fabricated result |
|403 | SESSION_REQUIRED (unverified submit), FORBIDDEN (membership/origin/replay principal/private projection); stop unauthorized writes |
|404 | INVALID_QR / ORDER_NOT_FOUND / RESOURCE_NOT_FOUND; safe missing/outside-scope response; clear inaccessible selection |
|409 | PRICE_CHANGED / OUT_OF_STOCK: preserve draft, refresh R01/R03, reconcile and require new review; only a newly confirmed changed intent gets a new key |
|409 | SESSION_CHECKOUT_PENDING / STORE_NOT_ACCEPTING_ORDERS: disable new submits; existing valid reads/replays can continue during checkout |
|409 | DUPLICATE_REQUEST_CONFLICT: restore original immutable payload/key; never silently change key to evade it |
|409 | INVALID_STATE_TRANSITION: wrong version/state, unsupported takeaway create/complete; refetch current detail; no shortcut transition |
|410 | SESSION_EXPIRED: closed/expired/revoked scope; no new write/replay revival; request owner assistance |
|422 | INVALID_SESSION_CODE for wrong PIN; VALIDATION_ERROR for invalid/foreign/inactive option or unsafe arithmetic; no acceptance/ticket |
|429 | RATE_LIMITED with Retry-After/details.retryAfterSeconds; pause/back off; retain the same intent |
|500/network/timeout | INTERNAL_ERROR is sanitized; outcome may be committed. Retain exact requestId, route, target, version, type and payload; retry exactly it, then refetch current state |

Do not invent CART_STALE / ITEM_UNAVAILABLE error aliases: implemented stale/availability codes are PRICE_CHANGED / OUT_OF_STOCK. Check code rather than Vietnamese message. R04 replay remains the original accepted snapshot after later transitions; GET is the current view. Claim empty200 `{data:null,error:null}` is a durable result; a deliberately new claim needs a new key. Reusing an empty key does not claim work that arrived later.

An uncertain command must outlive the review/dialog that initiated it. Do not allow back/edit/close/reload to silently discard it and generate a second request. Current cart persistence omits note text; do not quietly persist raw notes/PII. Exact replay restoration or an explicit privacy-reviewed recovery design is required before claiming reload recovery in UI. A copied cookie test proves server continuity, not restoration of a lost client command.

## PIN compatibility, locks and schema

- Public field stays `sessionCode`, no `pin` alias. Six digits include leading zeros; no number coercion. Public QR/URL never carries PIN. Cookie remains a32-byte random browser identity, HttpOnly, Secure/host-only in production, SameSite=Lax, path=/; browser mapping30d, grant<=12h/original session expiry24h. Failed verification can set an unprivileged browser cookie; that does not grant order access.
- Rotation replaces verifier/ciphertext/generation/version atomically, invalidates old PIN for new grants and preserves existing grants/session/orders. Close revokes. Checkout permits old guest reads/replays but blocks new verification and new creates. Legacy conversion is explicit and preserves session ID/orders; old long codes fail the new public schema.
- Startup validates separate server AES/HMAC keyrings. Keys are never emitted into this report or client code. Deploy009, app and shared keys together; old app open/verify fails closed after009. Production key/migration readiness was not checked here.
- New create: command advisory → store **FOR NO KEY UPDATE** → table SHARE → QR SHARE → session UPDATE → browser/grant SHARE → limiter → counter/order. Never substitute store FOR UPDATE: it conflicts with FK KEY SHARE and can create a session-close/store cycle.
- Owner mutation: operation advisory/replay → limiter → same store gate → session SHARE → order UPDATE. Strict claim waits for the oldest head and rereads after waiting; no SKIP LOCKED. Guest tracking takes session before order. PIN/lifecycle use parent store before table/QR/session; retain this ordering in Phase4/5.
- Counter key is store/service_date; acceptance uses DB clock and store timezone. Tickets are allocated in the same transaction as order/items/request/audit/outbox. Concurrent request arrival/click timing is not an ordering authority. Rollback reverses allocation; a committed ticket is immutable and never reused after cancellation.
- Current local catalog:0 unvalidated public constraints; RLS enabled on orders/items/requests/events/counters/guest/session/ciphertext/PIN audit. p3_order_execute, p3_owner_orders_execute and p2_pin_execute are invoker with pinned search_path; anon/authenticated EXECUTE=false, service_role=true. Owner/PIN RPC lock_timeout=3s; transport timeout15s. C01 order RPC has no explicit SQL lock_timeout, so a lost/timed-out HTTP response still requires same-key recovery.
- Unique store/date/ticket, store/clientRequestId and counter PK indexes are installed, alongside queue/history/session indexes. Deferred line/header totals and tenant/quantity/money/snapshot constraints and immutable history are exercised by DB tests. Scratch tests cover001–009 application,009 preflight drift rejection and rollback preserving existing rows/metadata. No provider call occurs inside these SQL transactions.
- completed remains unpaid and the session remains open. No settlement ledger, R13 runtime endpoint, realtime publisher or takeaway payment gate was fabricated for this QA. Checkout/close race tests use isolated SQL transitions to exercise the shared lock, not a claim that Phase5 endpoints exist.

## Executed evidence

All DB/HTTP runs used Docker local API `127.0.0.1:15421` and random UUID-scoped fixtures. They reject nonlocal test URLs. HTTP scripts build/start their own Next production server with loopback credentials and isolated keys, then clean up their own server/users/rows/rate keys. Existing developer processes and unrelated data were preserved.

| Command | Final observed result on24 October |
| --- | --- |
| `npm run lint` | PASS0 errors/warnings after concurrent Gemini fixes; earlier runs failed in UI (see quality history below) |
| `npm run typecheck` | PASS after concurrent UI fixes |
| `npm run build` | PASS: compiled, TypeScript finished,15 static pages generated; no Production migration/bootstrap invoked |
| `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts` |105 PASS /13 files |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts --disableConsoleIntercept` |96 PASS /12 files /151.22s, includes the new checkout race |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts tests/integration/orders --disableConsoleIntercept` |32 PASS /3 files /77.34s, after adding checkout race |
| `npm run test:auth` |46 PASS /7 files |
| `npm run test:db` |9 PASS /2 files |
| `node node_modules/vitest/vitest.mjs run --config tests/ui/vitest.config.mts` |119 PASS /8 files; Node/unit evidence, not a browser |
| `python docs/contracts/validate_contracts.py` |PASS19+26 typed examples,6 negative type checks,21 sections; static only |
| `node tests/integration/orders/http-smoke.mjs` |PASS production build + real HTTP/DB full flow;20 concurrent creates=1 ticket;12 concurrent claim replays; dropped committed response recovery; cookie/security/log privacy; cleanup |
| `node tests/integration/qr-http.mjs` |PASS production build + Auth/PIN/grants/8 same-key rotations/checkout-close/rates/log privacy; cleanup |
| `node tests/integration/table-qr-http.mjs` |PASS production build + table/QR lifecycle/takeaway reuse/active guards/retired404/auth/rate/log privacy; cleanup |
| `node node_modules/eslint/bin/eslint.js src/server src/app/api src/lib/validations src/features tests/integration/orders --max-warnings=0` |PASS |
| `git -c core.whitespace=cr-at-eol diff --check -- tests/integration/orders` |PASS C03 test changes |
| Browser clicks/hydration/mobile/multi-tab/reload/weak-network acceptance |NOT_RUN by Codex; assigned to Gemini P3-G03, no browser PASS inferred from HTTP or119 unit tests |
| Hosted deployment/migrations/API smoke, real provider/webhook |NOT_RUN; no Production mutation authorized/performed |

**375 passing cases across five suites** (105+96+46+9+119). The32-case targeted run overlaps the96, so is not added again. Final60-order burst output: `60 orders, 0 errors, 18019ms; not a Production SLA`. Unique tickets match serialized allocation and acceptedAt order, not client click order. HTTP order script emitted `PASS P3-C03 ... 20 concurrent HTTP creates = one ticket` and all subsequent owner/tracking/privacy checks. Logs reported cleanup for all three scripts.

Quality history: initial global lint failed1 error+7 warnings and typecheck/build failed on missing UI `isDemo` references. Gemini edited those files during this audit; later global lint/typecheck/build PASS. Those repairs were not made by Codex. Initial full integration95 PASS predates the added test; final full result is96. Workspace-wide whitespace check reported extra EOF blank lines in Gemini pages; C03 scoped whitespace passes. Tests passing do not resolve the source-level UX findings below.

## Required16-row matrix

Status here applies to **backend behavior at the stated layer**. Browser E2E for every row is **NOT_RUN**; UI source findings mean the overall product gate is not PASS.

Evidence abbreviations: **O**=`tests/integration/orders/orders.test.ts`, **Q**=`owner-queue.test.ts` in that directory, **P**=`tests/integration/table-pin.test.ts`, **S**=`qr-sessions.test.ts`, **H**=order HTTP script, **PH**=QR HTTP script. All named DB files were executed in the final96-case suite. Unit checks alone are never used to mark a matrix row PASS.

| ID | Scenario | Status / layer | Actual evidence |
| --- | --- | --- | --- |
|P3-E2E-01|Valid QR + correct six-digit PIN → menu|PASS DB+HTTP|P leading-zero verifier; H actual open→resolve→verify→menu→submit; PH real cookie flags |
|P3-E2E-02|Wrong/cross-table/expired/rotated PIN|PASS DB+HTTP|P leading-zero/cross-table/rotation/expiry; S expiry/closed; H wrong/old PIN denied submit and asserts0 orders/0 counters before success |
|P3-E2E-03|Takeaway browse without PIN; no payment bypass|PASS DB+HTTP|H counter requiresSessionCode=false/menu2 items; create409; Q schema rejects takeaway/pending/ticketless; no fabricated paid/ticket |
|P3-E2E-04|Two items/options/integer snapshots|PASS DB+HTTP|O snapshot transaction96000 VND fixture; H separate102000 VND two-line/three-unit accepted fixture, option32000/unit and one ticket |
|P3-E2E-05|10–20 same-key simultaneous creates|PASS DB+HTTP|O20 same-key create responses identical; H20 concurrent POST201,1 order/counter1 |
|P3-E2E-06|Same key changed cart|PASS DB+HTTP|O normalized payload/principal binding; H changed note409 DUPLICATE_REQUEST_CONFLICT |
|P3-E2E-07|30–100 real DB creates|PASS DB|O60 concurrent across12 devices/two sessions; unique contiguous tickets/60 IDs/60 rows/counter delta60; acceptance ordering checked |
|P3-E2E-08|Concurrent owner claims strict FIFO|PASS DB|Q16 distinct requests claim16 distinct oldest jobs; audit order equals FIFO; locked head waits, changed head reread; no skip |
|P3-E2E-09|Same-key claim retries|PASS DB+HTTP|Q20 immutable replays and durable empty after new arrival; H12 concurrent claim replays and lost-response retry |
|P3-E2E-10|Wrong state/double ready/complete|PASS DB+HTTP|Q state/version matrix,10 same-key ready and10 complete, exactly3 owner audit events; H ready/complete replay/changed-payload409 |
|P3-E2E-11|Cross-store owner/cross-session guest|PASS DB+HTTP|O unrelated table/store deny and outside-order404; Q actor/membership/tenant checks; H401/403/404 actual owner/guest boundaries |
|P3-E2E-12|Checkout/close versus create|PASS DB+HTTP|O new checkout-only test both observed lock orders + existing close-first/create-first race; H checkout new409, close410 |
|P3-E2E-13|Guest refetch sees owner state|PASS HTTP+DB|H GET after each preparing/ready/completed mutation; Q guest current state; same scope retained |
|P3-E2E-14|Mid-transaction failure/lost response|PASS DB+HTTP|O fault after counter and late outbox rolls all resources back; Q transition outbox failure/deadlock/lock timeout rollback; H destroys committed response bodies and recovers same order/claim with original key; UI recovery still F01/F02 |
|P3-E2E-15|Reload/multiple devices same session|PASS server HTTP+DB; browser NOT_RUN|H copied cookie resolves verified; new verified device reads same order, cannot use buyer projection/replay key; PH refresh/two devices; this does not prove pending-command survival after page reload (F01) |
|P3-E2E-16|Completed remains unpaid/session open|PASS DB+HTTP|H and Q assert payment unpaid and session open after completed, with unchanged ticket/money |

## Findings and Gemini actions

**Backend runtime defects found:0; backend runtime patches:0. QA coverage gaps fixed:2** (combined PIN/order/concurrent HTTP boundary; explicit checkout-only race). **Open UI findings:7** — HIGH2, MEDIUM3, LOW2; BLOCKER-severity runtime defects0. The readiness gate is nevertheless BLOCKED by the two HIGH findings and missing browser acceptance. Findings are source-level observations, not claimed browser reproductions.

| ID / severity | File / root cause | Required action / acceptance |
| --- | --- | --- |
|F01 HIGH|`customer/order/useDineInCheckout.ts`, `customer/cart/PreCheckoutReview.tsx`, `CartSheet.tsx`: pending command/key are in a hook inside the conditionally mounted review. Back/edit/close/reload can discard them; ordinary submit remains enabled when uncertain and rebuilds payload rather than replaying frozen input.|Lift immutable unresolved intent above disposable review state; lock edit/new submit while uncertain; retry exact command. Demonstrate lost201 then close/back/reload cannot create a second order. Choose an explicit privacy-safe reload recovery design; do not silently persist notes. Backend cannot reconstruct a lost browser command from a changed cart. |
|F02 HIGH|`owner/orders/OwnerOrdersView.tsx`: ready/complete keep one action-level requestId ref but read order.id/version on each call. Poll/refetch/selecting another order can change the target/body while reusing that key.|Store `{route,orderId,requestId,expectedVersion,type}` as immutable intent, block another target/action until resolved, replay it even if UI detail advanced; then refetch. Test lost success followed by poll/version change and selection change. |
|F03 MEDIUM|`owner/TableSessionDialog.tsx`: rotate response sessionVersion is ignored; selected table/session props are not refreshed by the fallback. Repeated rotate sends stale session.version. Legacy conversion generates a fresh key per invocation.|Consume returned sessionVersion/refetch selected table. Keep immutable key+version across uncertain rotate AND legacy conversion. Use typed session-ID adapters. Test two rotations without closing dialog and a lost conversion response. |
|F04 MEDIUM|`owner/orders/OwnerOrdersView.tsx`: initial/filter fetch, manual polling and selected-detail fetch have separate paths; polling/detail lack common cancellation or response-generation guards.|One in-flight coordinator or per-scope generation/abort guard; ignore superseded filter/order responses and pause hidden/offline. Delayed old response must not overwrite a newer filter/detail/transition snapshot. |
|F05 MEDIUM|`owner/orders/OwnerOrdersView.tsx`: requests limit50 and discards `nextCursor`; no pagination append path is present.|Expose/consume keyset next page or explicitly design bounded viewing; preserve scope/filter binding, dedupe IDs, reset page1 after mutation. Verify >50 orders accessible in history/queue. Server claim still correctly considers the whole store. |
|F06 LOW|`customer/TableVerificationCard.tsx`: comment promises PIN clearing but success handler never calls setPin(''); state can remain while same card instance changes verified branch.|Clear only after confirmed success/verified transition, including prop transition; do not clear failed input as though verified. Test same mounted card success and unverify. |
|F07 LOW|`owner/TableSessionDialog.tsx`: no-session branches fabricate display PINs without an explicit preview-only guard.|Remove fabricated runtime delivery or isolate in dedicated preview fixtures. Current occupied-session guards make reachability uncertain; no backend PIN is fabricated. Do not count this as a proven successful real reveal. |

No edits were made in these files by Codex. Low findings do not imply a server authentication bypass. Backend rejects changed commands and protects money/ticket/scopes, but cannot prevent a UI from intentionally creating a second new-key command after losing the old intent.

## Phase4 entry and release boundary

**PHASE4_READINESS=BLOCKED** for integrated product acceptance until F01/F02 are repaired and Gemini performs browser QA on the final combined source. Recheck F03–F07 alongside that work. Build/lint/typecheck now PASS, and all16 backend matrix rows have real DB/HTTP evidence. No backend API/contract gap blocks those dine-in flows locally.

Starting Phase4 implementation still requires choosing/verifying one provider and deciding payment TTL/zero-total/pickup delivery policies from OPEN_QUESTIONS. Its additive migrations must extend current dine-in-only constraints/projections for pending takeaway, without issuing tickets until verified payment. Preserve shared admission/FIFO locks, exact-once ledger/event/transaction dedupe, private buyer pickup verification and audit. These future requirements are **not regressions** and must not be bypassed to make a demo queue work.

Production readiness is separate: inspect actual hosted migration state,009 preflight and shared AES/HMAC configuration; deploy only through the reviewed project workflow; run hosted smoke/browser checks without fixture seeding into Production. No claim of production capacity, payment completion, settlement, realtime, UI acceptance or deployed migration success is made here.
