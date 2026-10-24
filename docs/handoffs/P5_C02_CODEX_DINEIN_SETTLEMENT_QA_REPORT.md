# P5-C02 — Dine-in settlement concurrency, lifecycle and E2E audit

Date: 24 October 2026. Backend, database, API and integration owner: Codex. UI changes called out below were required fixes in the parallel Gemini-owned surface and are recorded explicitly.

## Executive summary

**NOT_READY for integrated Phase 5 sign-off. Backend local checks PASS; browser/UX acceptance is NOT_RUN and source findings remain in Gemini's ownership (below).** The audit covers the existing P5-C01 implementation, real local Supabase/PostgreSQL, owner and guest HTTP routes, a burst of 50 create requests racing checkout (not 50 repeated race rounds), settlement races, idempotency, RLS/ACL, and Phase 2–4 regressions. No Production database or real payment provider was used. An earlier provisional READY wording was corrected during the completion audit; build success alone is insufficient evidence for the whole flow.

The backend preserves the required state machine: `open -> checkout_pending -> closed`, with `cancel_checkout` only reopening an unpaid checkout. Session checkout and dine-in order creation serialize on the same store/session lock order. A successful manual settlement is immutable and unique per session. Closing revokes guest capabilities atomically. Existing order snapshots and FIFO tickets remain intact.

Two UI defects found during the audit were fixed minimally because they blocked the required lifecycle: cancel sent `billVersion` where the API requires `session.version`, and begin/cancel did not preserve their idempotency key across an ambiguous retry. A stale-effect lint error and an unused `isStale` default were also corrected. These edits are documented as the ownership exception; no UI behavior or server authorization was bypassed.

## Source and contract inventory

| Area | Current implementation |
|---|---|
| Session lifecycle | `table_sessions` with `open`, `checkout_pending`, `closed`; `p2_session_guard` increments `version` on status changes and revokes `guest_access` on close. |
| Guest authorization | Fixed table QR is a locator; `p3_session_access` requires the current session, live browser context, unrevoked session grant and proof hash. |
| Dine-in orders | `p3_order_execute('create', ...)` creates one immutable order and one FIFO ticket per request, snapshots menu names/prices/options and uses store → session → ticket/order serialization. |
| Bill | `p5_session_bill(uuid)` aggregates committed order-item snapshots, excludes cancelled value, exposes `billVersion`, `outstandingOrders`, server total and lifecycle flags. |
| Settlement | `p5_session_execute(text,jsonb)` handles owner bill, begin, cancel and confirm. It uses advisory request reservation → store `FOR NO KEY UPDATE` → session `FOR UPDATE` → orders `FOR UPDATE`. |
| Durable evidence | `session_checkout_snapshots`, `session_settlements`, `session_settlement_audit_log`, `operation_requests`, `order_events`, and `outbox_events`. |
| API | Guest bill GET under `/api/public/table-sessions/current/bill` plus compatibility alias; owner bill GET and settle POST under `/api/owner/table-sessions/:id`. Strict JSON, exact Origin, auth/ownership and no-store headers are enforced. |
| Contract | `docs/contracts/P5_SESSION_BILLING.md`; canonical manual transfer spelling is `bank_transfer`, with `receivedConfirmed: true`. |

## Initial findings and changes

| Severity | Finding and impact | Resolution |
|---|---|---|
| P1 | Owner cancel UI passed `localBill.billVersion` as `expectedVersion`; cancel could be rejected despite a valid checkout. | Fixed `TableBillSettlementSheet` to pass `localBill.session.version`. |
| P1 | Begin/cancel UI generated a new request key on each retry, so an ambiguous response could repeat a command with a different idempotency key. | Added stable begin/cancel refs and forwarded the same key through `TableManagementView`; refs clear only after success or when the session ID changes. Confirm already had this behavior. |
| P2 | Customer bill deep-link effect triggered synchronous state inside an effect and failed the repository lint gate. | Deferred the one-time open with a cancellable timer; behavior is unchanged. |
| P2 | `isStale = false` destructuring was reported as unused while the prop is rendered in the stale banner. | Kept the optional prop without a default assignment. |
| P2 | No private realtime publisher exists in the repository. | The database and GET routes remain the source of truth; outbox persistence is tested. The customer bill hook polls while visible, but has no explicit online/visibility event recovery listener. |

### Remaining Gemini handoff findings — do not treat fixture tests as browser proof

| Severity / source | Reproduction and root cause | Impact / required handoff |
|---|---|---|
| P1 — `TableBillSettlementSheet.tsx:88` | Begin checkout, finish service in the Orders tab, then refresh the bill. `actionBill ?? billProp` continues choosing the old command snapshot over the newer GET. | `outstandingOrders`/`canSettle` may stay stale and block confirmation. Prefer the newest authoritative session/order snapshot and test rendered behavior. |
| P1 — sheet `:230`, management view `:753` | Time out confirmation, change payment method or refetch, then retry. A ref keeps only the key; the payload is recomputed. Closing the parent unmounts the sheet, losing refs despite the session-change effect. | Preserve the exact pending command outside the sheet lifetime, GET before resolving an ambiguous result, and release the command only on a definitive result. The server safely rejects same-key changed-payload retries but UI recovery is incomplete. |
| P1 — sheet `:160`, `:200`, `:236` | Render without an action callback, or return `void`: optional chaining reaches locally synthesized open/checkout/paid branches. | Require a server bill or refetch; never infer successful payment from absence of a result. Default production adapters return a bill, but alternate supported props expose this unsafe fallback. |
| P2 — sheet `:263` | Outstanding orders yield HTTP409 from the actual API; the special handler tests HTTP400 after the generic 409 branch. | Map `SESSION_ORDERS_OUTSTANDING` by machine code before generic conflicts. |
| P2 — G02 report vs RPC guest branch | After settlement, guest grant is revoked and bill GET returns 403; UI report claims a new closed/paid guest bill remains readable. | Preserve the revocation contract. An old cached bill must be marked stale/expired; it cannot prove paid. Owner GET can read closed history. |
| P2 — `tests/ui/*/p5-g02*` | Tests assert fabricated DTOs and locally rewritten handler logic in a Node environment; they never mount the production component or send its HTTP. Test files are outside application `tsc` include. | Their 257 green assertions do not prove double-click, exact request identity, callback wiring, responsive layout or browser recovery. DOM/browser QA remains NOT_RUN. |

Ownership exception: Codex made only the cancel-version/key-forwarding and compilation fixes described above. Further component lifecycle/UX changes are handed back explicitly rather than silently refactoring parallel Gemini work. No new backend migration was needed: the audit found test coverage and integration gaps, not a reproducible DB financial-integrity failure.

No backend authorization, RLS, lock order, payment-provider code, FIFO code, or existing takeaway/pickup behavior was weakened.

## Required concurrency and lifecycle matrix

| ID | Scenario | Result | Evidence |
|---|---|---|---|
| P5-01 | Three near-simultaneous guests add three orders | PASS | `session-billing.test.ts:70` uses Promise.all: three independent orders/tickets, total 288000 and all IDs in one bill. |
| P5-02 | Twenty retries with one key/payload | PASS | Snapshot/retry test at `:80`: one order and one request record. |
| P5-03 | Reused key with changed payload | PASS | `DUPLICATE_REQUEST_CONFLICT`; no rewrite. |
| P5-04 | Fifty create requests race checkout | PASS | Final 50-attempt admission test; every committed order is in the frozen bill or rejected as checkout pending, with no ticket leak. |
| P5-05 | Two owner tabs begin checkout | PASS | Added concurrent begin test; one snapshot/state transition wins, the other receives stale state. |
| P5-06 | Twenty concurrent settles/same key | PASS | One successful settlement, one closed session, one audit/ledger success. |
| P5-07 | New key after paid | PASS | Existing settlement test rejects reopen/double settlement. |
| P5-08 | Cancel races settle | PASS | Added race test; result is either open/unpaid with zero ledger or closed/paid with exactly one ledger. |
| P5-09 | Outstanding accepted/preparing/ready orders | PASS | Settlement returns `SESSION_ORDERS_OUTSTANDING`; fulfillment can finish while checkout is frozen. |
| P5-10 | Menu price changes after order | PASS | Historical item/options snapshots remain in bill; server integer total is unchanged. |
| P5-11 | Stale bill/session version | PASS | `BILL_CHANGED` or `INVALID_STATE_TRANSITION`; no settlement write. |
| P5-12 | Response lost after commit | PASS | HTTP smoke retries the exact key and receives stored success; a different key is rejected. |
| P5-13 | Closed session then new session on same QR | PASS | Old grant/proof cannot read or create in the fresh session. |
| P5-14 | Guest A targets table B | PASS | Scoped guest bill/order access returns `SESSION_REQUIRED`/not-found without B data. |
| P5-15 | Non-owner/guest settlement | PASS | Local HTTP and SQL tests return 401/403; DB remains unchanged. |
| P5-16 | Takeaway paid concurrently with session close and another dine-in order | PASS | New test at `session-billing.test.ts:180`: same-store settlement, normalized post-verification payment processing and another table's creation race; tickets 1/2/3 unique, one ledger of each type. Synthetic DB-seam event, not real provider/signature E2E; existing payment tests separately cover signed events and pickup regression. |
| P5-17 | Empty bill | PASS | Zero-VND session can prepare and settle under the existing policy without a fabricated payment. |
| P5-18 | 429/5xx/reconnect | PASS backend; NOT_RUN browser | HTTP smoke explicitly asserts 429/Retry-After/zero ledger, scoped outbox fault→500/complete rollback, then same-key success and refetch. Actual offline/reconnect component behavior is not covered by fixture assertions. |

## Invariants and security checks

- `session_settlements_one_success` is a partial unique index; `(store_id, request_id)` is unique for command idempotency.
- Checkout snapshots are immutable, retain cancelled attempts, and are selected by session version. They are not money received.
- Deferred settlement guards require a closed session, matching snapshot/session version, exact bill version/total and zero outstanding orders.
- The confirm transaction inserts the settlement, closes the session, revokes guest access through the existing trigger, increments order versions for paid projections, writes audit/outbox evidence, and commits atomically.
- Browser roles cannot execute the RPC or read settlement tables. Server routes use owner auth plus store membership; guest routes use the current session capability only.
- Client totals, discounts, owner IDs, session IDs and payment screenshots are not authorization evidence. Manual cash/bank transfer is an owner attestation only.

## Validation commands and results

All database-mutating tests fail closed unless Supabase points to loopback `127.0.0.1:15421`; fixtures use isolated UUIDs and clean up their own rows.

| Command | Result |
|---|---|
| `npx.cmd vitest run --config tests/integration/vitest.config.mts tests/integration/billing/session-billing.test.ts` | PASS 17/17 billing cases |
| `npx.cmd vitest run --config tests/integration/vitest.config.mts tests/integration/billing/session-billing.test.ts -t "three devices\|session settlement races"` | PASS 2/2 focused added cases |
| `npx.cmd vitest run --config tests/integration/vitest.config.mts tests/integration/billing/migration.test.ts` | PASS 1/1 (included in the earlier 14/14 billing/migration run) |
| `npx.cmd vitest run --config tests/integration/vitest.config.mts` | PASS 144/144 across 19 files, including all added race cases |
| `npx.cmd vitest run --config tests/unit/vitest.config.mts` | PASS 131/131 |
| `npm.cmd run test:auth` | PASS 46/46 |
| `npm.cmd run test:db` | PASS 9/9 |
| `npx.cmd vitest run --config tests/ui/vitest.config.mts` | PASS 257/257 across 21 files |
| `npm.cmd run lint` | PASS with `--max-warnings=0` |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS; all owner/guest bill routes generated |
| `node tests/integration/billing/http-smoke.mjs` | PASS 48 checks against local Auth + PostgreSQL + Next production HTTP; one settlement, 248000 VND; provider network not called. Evidence: `evidence/P5_C02_LOCAL_HTTP.json` |

Intermediate new-test failure: the first synthetic takeaway fixture used a non-numeric account identifier and PostgreSQL correctly rejected it. The fixture was corrected to a test-only numeric account; no production constraint or validator was relaxed.

## Request/error mapping for UI

`GET` returns `TableBillView` with `session.status`, `paymentStatus`, `totalVnd`, `billVersion`, `outstandingOrders`, `canAcceptMoreOrders`, and `canSettle`. Begin/cancel/confirm return `{ detail, bill, settlement }`; only confirm returns a successful settlement. Machine-readable conflicts are `BILL_CHANGED`, `SESSION_ORDERS_OUTSTANDING`, `INVALID_STATE_TRANSITION`, `DUPLICATE_REQUEST_CONFLICT`, `FORBIDDEN`, `SESSION_REQUIRED`, `SESSION_EXPIRED`, `RATE_LIMITED`, and `INTERNAL_ERROR`.

After an unknown response, GET the owner bill before another action, preserve the original UUID and payload for a retry, then GET again after a successful replay. It must never create a fresh key merely because the first response was lost. A replayed begin/cancel response is a historical command result, not necessarily the latest session state.

Sanitized command example (replace the synthetic UUID and digest with values from GET):

```json
{"requestId":"11111111-1111-4111-8111-111111111111","action":"confirm_received","expectedVersion":2,"expectedBillVersion":"0123456789abcdef0123456789abcdef","paymentMethod":"bank_transfer","receivedConfirmed":true}
```

Sanitized error response:

```json
{"data":null,"error":{"code":"SESSION_ORDERS_OUTSTANDING","message":"Còn đơn chưa phục vụ xong. Hoàn tất giao món trước khi thu tiền."}}
```

HTTP409 above requires a fresh GET. Successful confirmation returns `{data:{detail,bill,settlement},error:null}`; `bill.session` is closed/paid and `settlement` has server ID, session ID, total VND, method, succeeded status and settlement timestamp. No PIN, actor, cookie or provider secret is returned.

Policy mappings: `bank_transfer` means the prompt's manual bank transfer; table states have no `needs_cleaning`. Begin may freeze while service remains outstanding; only confirm is blocked. Empty0 settlement and cancellation exclusion reuse the inherited C01/Q6 assumptions; they are not newly approved product policies. There is no implemented order/item cancellation API. An ordinary closed table is vacant and its next opening creates a new session/PIN.

### Deployment and forward remediation

No C02 schema changes were required. Migration015 remains atomic and additive: failure before COMMIT restores definitions/ACLs; after commit use reviewed forward-only migrations. Do not drop/rewrite settlement, checkout, payment, pickup, order, ticket, audit or request evidence as rollback. Unknown deployed function hashes require reading the deployed function first; these local checks do not authorize applying migration015 to Production.

## Remaining limits and manual QA

The backend concurrency gate passes locally. Integrated Phase5/Phase6 acceptance remains NOT_READY until the handoff findings above are fixed and actual browser QA verifies the real owner/guest flow on an isolated staging/test database: open a table, use the same QR in three guest contexts, place three add-ons, change menu prices, begin/cancel/confirm with both payment methods, lose a response, close/reopen the sheet, change tabs, refetch, and verify old PIN/grants fail after close. Include empty0 checkout and outstanding-service recovery. Real payOS/SePay network settlement and a private realtime publisher remain outside this dine-in manual-settlement scope.

No Production SQL, data reset, provider call, or destructive remediation was performed.

