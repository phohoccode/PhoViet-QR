# P5-C01 — Dine-in session billing and settlement

Date: 24 October 2026. Backend/API owner: Codex. UI presentation remains Gemini-owned.

## Outcome

The existing dine-in create-order RPC already supported add-ons, immutable menu/item snapshots, shared FIFO tickets, browser/session capability checks, and idempotent `clientRequestId`. It already locks `store` then `table_session`; checkout now uses the same admission order. A new additive migration `20261024001500_dinein_session_settlement.sql` adds server-computed session bills, immutable checkout snapshots, manual owner settlement, audit, outbox invalidation and one-success-per-session enforcement. No production data is rewritten and no provider/webhook is used.

The actual compatible contract is [P5_SESSION_BILLING.md](../contracts/P5_SESSION_BILLING.md). The requested Gemini prompt file `P5_G01_GEMINI_DINEIN_BILLING_OWNER_UI.md` was not present in the repository or attachment search; this handoff is therefore the authoritative backend contract for the UI.

## Schema and locks

- `session_checkout_snapshots` preserves every begin attempt's bill, financial `billVersion`, session version and actor/request.
- `session_settlements` stores `cash` or canonical `bank_transfer`, `received_confirmed=true`, actor, request, bill version and exact integer VND total. A partial unique index permits one successful settlement per session; request uniqueness provides idempotency.
- `session_settlement_audit_log` and `outbox_events` are written in the same transaction.
- New tables use RLS and service-role-only grants. Immutable triggers reject updates/deletes. Deferred guards verify closed session, matching checkout snapshot, exact bill and zero outstanding orders.
- Mutations use advisory request reservation → store `FOR NO KEY UPDATE` → session `FOR UPDATE` → existing order rows `FOR UPDATE` → audit/outbox. This matches dine-in creation and owner queue lock direction. No network/provider call occurs inside the transaction.
- Closing invokes the existing session trigger, which revokes guest access and deletes session-code delivery atomically. It leaves order status/ticket intact; order versions increase to invalidate paid projections.

## API matrix

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/public/table-sessions/current/bill?qrCode=` | guest cookie + active matching session grant | scoped bill only; no session/store/token secrets |
| `GET /api/owner/table-sessions/:id/bill` | Supabase Auth + owner membership | server bill, including closed history |
| `POST /api/owner/table-sessions/:id/settle` | owner + exact Origin + strict JSON | `begin_checkout`, `cancel_checkout`, `confirm_received` |
| existing `POST /api/public/orders` | guest table capability | one new order/ticket per add-on; checkout pending rejected |

`TableBillView` includes full item/options snapshots, integer `totalVnd`, `outstandingOrders`, `billVersion`, session version/status/payment, `canAcceptMoreOrders`, `canSettle`, settlement time/method. `canSettle` is server-derived. Client totals, discounts, paid amounts, owner IDs and session IDs are never trusted for authorization. `bank_transfer` is the repository-compatible name for manual bank transfer.

## Validation evidence

- `tests/integration/billing/session-billing.test.ts`: **13/13 PASS**. Covers three add-on tickets, 20 same-key retries, historical menu prices/options, guest scope/revocation, checkout race blockers, cancel/reopen, stale versions, explicit money acknowledgement, concurrent settlement, one unique success, paid projections, closed-session refusal, cancelled-order exclusion, create-vs-checkout admission, lock-winner behavior, safe integer overflow and outbox rollback.
- `tests/integration/billing/migration.test.ts`: **1/1 PASS**. Fresh migration chain, rollback/catalog preservation, preflight drift failure, CRLF replay, RLS/ACL, immutable/deferred constraints and zero bill.
- `tests/unit/session-billing.test.ts`: **3/3 PASS**. Strict request schema, payment methods, acknowledgement, version/totals field rejection, guest query scope and sanitized 409 responses.
- Full integration suite after the final additions: **140/140 PASS** across 19 files, including Phase4 regressions.
- Existing checks: unit **131 PASS**, auth **46 PASS**, DB **9 PASS**, UI **240 PASS**, fresh migration application **PASS**, typecheck **PASS**, production build **PASS**.
- `tests/integration/billing/http-smoke.mjs`: **45/45 PASS** against local Supabase Auth/PostgreSQL and Next production HTTP, including the compatibility alias. Evidence: [P5_C01_LOCAL_HTTP.json](evidence/P5_C01_LOCAL_HTTP.json). Takeaway regression HTTP also passed. Provider network was not called.
- Final main-workspace lint, typecheck and production build all **PASS**. Intermediate UI-only lint/type failures were resolved by the parallel UI workstream; Codex did not edit those files.

## Files

Backend/schema: migration015, `src/server/table-sessions/billing.ts`, three API route groups, `src/lib/validations/session-billing.ts`, shared contracts/types, error mapping and browser API adapters. Tests and evidence live under `tests/integration/billing`, `tests/unit/session-billing.test.ts`, and `docs/contracts/P5_SESSION_BILLING.md`.

The worktree also contains UI files from the parallel Gemini workstream; those were not modified by this backend implementation. Its bill DTO is structurally compatible but duplicated in `src/components/customer/bill/types.ts`; prefer shared `@contracts`. A compatibility GET `/api/public/table-sessions/bill?qrCode=` uses the same handler as `/current/bill` to support its hook. At final inspection `TableManagementView` supplies default adapters for bill/begin/cancel/confirm, including bill version and acknowledgement. Browser QA must still verify preservation of the same requestId after an ambiguous failure, explicit owner acknowledgement, and refresh/polling behavior. Visual/live-UI acceptance is not claimed.

## Risks and manual QA

Provider settlement is intentionally absent: owner attestation is not bank verification. There is no realtime publisher in this repository; clients must refetch on command completion and polling/visibility recovery. Cancellation currently has no public order command, so the integration test models it as an audited fixture. A fresh session receives a new PIN/capability; the old QR remains a locator only.

Manual browser QA: open a table, verify PIN, submit three add-ons from separate guest contexts, change today’s menu and confirm old prices, begin checkout and verify new add-ons fail, complete each ticket, confirm cash/manual transfer with acknowledgement, refresh owner and guest views, verify closed/paid and revoked guest access, then open a fresh session and verify the old cookie cannot enter it.

## Gate

Backend database/unit/integration gate: **GO for P5 Prompt 02**. HTTP backend is verified; integrated UI acceptance still requires the browser/retry QA described below. Real provider/network is outside this prompt.

## Repository inventory and documentation differences

README, PRD, ARCHITECTURE, PLAN, TASKS, contracts, actual Phase 0–4 integration/handoff files and the Gemini P4 reports were checked. The following distinctions are based on source and actual local SQL, not task checkboxes:

| Source area | Finding / decision |
|---|---|
| Migration007 / `p3_order_execute` | Add-on behavior and lock/CAS/replay/menu/FIFO already existed; reused verbatim. No ticket mutation or cart-as-receipt shortcut. |
| Session lifecycle003/009 | `open`, `checkout_pending`, `closed` and atomic close/revoke trigger already existed. No needs_cleaning state; a closed table is vacant. Six-digit PIN generation/rotation kept unchanged. |
| Owner table serializers | Session count/total previously remained hardcoded zero; `p2_session_view` now aggregates actual orders and paid state. New GET bill supplies full detail; legacy table-list `detail.orders` remains the old summary placeholder. UI must fetch the new bill, rather than treating that placeholder as an empty bill. |
| Draft R13 | Route/types existed in docs, but no implemented billing service, settlement table or API. Reused one action-based settle route. `expectedBillVersion` and real-money acknowledgement are now required. |
| Draft pending/failed settlement | Checkout attempts are immutable snapshots/audit, not payment records. Only actual owner confirmation creates a success ledger. Cancellation preserves the attempt; it never fabricates money or deletes a ledger. |
| Draft ledger names | Takeaway uses actual `payments` and `payment_webhook_inbox`; Phase5 does not mix those with manual dine-in settlement. |
| Realtime | Outbox exists; no authorized publisher was found. DB/GET is the source of truth and works with unpublished events. |
| Gemini P5 prompt | Exact file was not found; parallel UI source was inspected, compatibility alias provided, shared DTO/API adapters documented. No UI files edited by Codex. |

The financial bill revision is an opaque MD5 of deterministic financial snapshot JSON, not an authentication proof. Orders, immutable line IDs/names/prices/options/quantities/totals and cancelled eligibility contribute. Fulfillment/version changes do not. Session version separately guards lifecycle/PIN-generation changes. Numeric sums remain PostgreSQL exact arithmetic; values outside the safe wire integer range cannot commit as a new session order and do not consume a ticket.

## Required-case evidence matrix

| Required case | Result / evidence |
|---|---|
| Three add-ons from multiple guests, three FIFO tickets | PASS, billing integration first case; HTTP four-ticket lifecycle |
| Twenty identical create retries and changed-payload conflict | PASS, billing first case and existing orders integration |
| Menu changes, quantities and option snapshots | PASS, billing first case, 297000 VND across historical/new menu snapshots |
| Cross-session guest, revoked/expired cookie, old capability/new session | PASS, billing scope/closed tests; existing PIN/QR integration verifies old PIN/retired QR behavior |
| Concurrent dine-in and verified takeaway share FIFO | PASS, existing payment integration mixed 100 acceptances and FIFO uniqueness; no takeaway code changed |
| Create versus checkout | PASS, twelve-request race plus deterministic held-transaction tests for both winners; stale financial CAS retries include committed orders, checkout winner rejects with no ticket consumed |
| accepted/preparing/ready block final settlement | PASS, explicit `SESSION_ORDERS_OUTSTANDING`; service can complete tickets while checkout is locked |
| Cancel resumes order admission; paid/closed cannot reopen | PASS, billing cancel and post-close assertions |
| Same/different request IDs, two tabs, unique success | PASS, twenty identical confirmations, exact response-loss replay, and two distinct-key confirmations |
| Foreign owner, missing Auth, guest settlement | PASS, SQL integration plus actual Supabase Auth HTTP401/403/404 |
| Invalid method/acknowledgement/version/total; unknown response | PASS, strict unit/integration/HTTP; retry exact key returns durable success, another key is refused |
| Realtime publish absent/fails to deliver | PASS for absence: success remains queryable while outbox is unpublished. Injected outbox *persistence* failure separately proves complete rollback of ledger/close/revoke. No publisher implementation is claimed. |
| Phase4 regression | PASS, existing payment/pickup/FIFO integration and production HTTP script; test-only signed webhook evidence, no actual bank transfer |

## Commands and acceptance limits

Commands ran from repository root unless stated. All DB commands targeted Docker `supabase_db_qr-ordering-p1c02-local` / `http://127.0.0.1:15421`; scripts assert loopback before mutation. Fixtures use fresh UUIDs and clean up only those records. Fresh-chain tests use disposable databases. No Production SQL, provider network or real payment was used.

| Command | Result |
|---|---|
| `npx.cmd vitest run --config tests/integration/vitest.config.mts` | PASS 140/140, 19 files, final run 266 seconds |
| `npx.cmd vitest run --config tests/integration/vitest.config.mts tests/integration/billing/migration.test.ts tests/integration/billing/session-billing.test.ts` | PASS 14/14 final billing/migration cases |
| `npx.cmd vitest run --config tests/unit/vitest.config.mts` | PASS 131/131 |
| `npm.cmd run test:auth` | PASS 46/46 |
| `npm.cmd run test:db` | PASS 9/9 |
| `npx.cmd vitest run --config tests/ui/vitest.config.mts` | PASS 240/240 with the current parallel UI source; this is component-contract testing, not browser E2E |
| `npm.cmd run typecheck` | PASS on main workspace after Gemini fixed intermediate errors |
| `npm.cmd run build` | PASS on main workspace; production HTTP scripts also compile against a loopback-only environment |
| `node tests/integration/billing/http-smoke.mjs` | PASS actual Auth + DB + HTTP lifecycle; evidence JSON attached |
| `node tests/integration/payments/http-smoke.mjs` | PASS on isolated checkout containing committed UI plus the Phase5 backend; 20 signed webhook ACKs, one ledger/ticket/credential, pickup verification/replays/conflicts/privacy |
| `npm.cmd run lint` | PASS on backend isolation and final main workspace, zero warnings |

Build/lint were initially blocked by incomplete parallel UI edits; both later passed in the main workspace after the UI owner resolved them. To avoid editing UI ownership, an isolated detached checkout of HEAD plus only Codex backend files was also verified with lint/typecheck/build and 228 committed UI regression tests. No check was bypassed or disabled. The latest main-workspace production build includes both guest bill routes and completes all page generation.

## Deployment and forward remediation

1. Review migration015 and run it as a whole against an isolated/staging database with the complete audited001–014 chain. It is intentionally not rerunnable: atomic failure before COMMIT leaves no partial schema. Preflight checks exact normalized function bodies and metadata; unknown/missing definitions require inspection, not adding arbitrary accepted hashes.
2. Deploy server/API/client adapters together with the shared contract. Do not enable owner confirmation until UI callback wiring and explicit acknowledgement have been tested.
3. After an ambiguous HTTP response, retry the original key/payload and GET the owner bill. Never reset/delete a settlement, ticket, order, grant evidence or operation record to fix a display error.
4. After a committed migration, use forward-only corrective migrations. This report does not authorize a Production rollout and no Production changes were made.

**Final gate:** backend foundation is ready for P5 Prompt02. Integrated visual/operational acceptance remains **NO-GO pending browser QA**, including retry identity, refresh and explicit acknowledgement in the parallel UI. Real payOS E2E and private realtime publishing remain separate pre-existing acceptance limits, not dependencies for manual dine-in cash/transfer settlement.
