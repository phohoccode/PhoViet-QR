# P5-HF01 — Closed-session paid receipt audit and fix

Date: 24 October 2026  
Owner: Codex (backend, PostgreSQL, API, capability, contracts and tests)  
Scope: local Supabase/PostgreSQL and local Next HTTP only. No production data or payment provider was touched.

## Result

**Backend/API local PASS. Integrated browser/UI acceptance is NOT_READY pending the Gemini items below.** Migration016 has not been deployed to Production.

The closed-session read path now returns an immutable `paid_receipt` to guests whose browser/session capability was valid at successful settlement. The same cookie can reload or reconnect without entering the old PIN. Ordering authorization remains separate and is revoked on close: a receipt holder cannot create another order, call the old QR session, or read a reopened session. A successful settlement creates one receipt, one outbox hint and zero or more scoped read capabilities in the same transaction. The final receipt is sourced from the successful settlement and order/item snapshots.

## Root cause verified in source

The failing response was produced by `supabase/migrations/20261024001500_dinein_session_settlement.sql:179-188`. `p5_session_execute('guest_bill', ...)` joined the QR's table session and `guest_access`, then required `ts.status in ('open','checkout_pending')`; otherwise it raised `SESSION_REQUIRED`. The next lines called `p3_session_access`, which also required a live, unrevoked ordering grant.

The close path at migration015 lines 246–247 updated `table_sessions.status='closed'`. The existing `p2_session_guard` in migration009 then revoked every `guest_access` row and deleted PIN delivery. This was correct for ordering, but it removed the only guest read capability. Owner bill worked because it did not use that guard. The result was the observed 403 even after a real successful settlement.

## Forward migration and data model

`supabase/migrations/20261024001600_closed_session_receipts.sql` is additive and atomic. Its preflight accepts only the audited migration015 definitions and aborts on function drift. It adds:

- `session_receipts`: immutable one-per-successful-settlement snapshot, linked to the settlement ID and session. It contains the frozen bill, `kind=paid_receipt`, receipt/session versions, settlement method/time and VND metadata.
- `session_receipt_access`: hashed proof plus browser-context binding, independent expiry and explicit revoke. No raw cookie, PIN, proof or provider credential is stored.
- `session_receipt_policy`: singleton administrator policy, default 172800 seconds (48h), constrained to 60 seconds–30 days. It is not a guest/owner payload. Existing credentials are not extended when policy changes.
- `session_receipt_read_audit`: server-only allowed/denied/expired/not-ready audit without bill, token or IP payload.

The updated close guard copies only currently valid, unrevoked grants before revoking ordering grants. The after-close trigger stores the receipt and an outbox event `table_session.receipt_ready` containing only event/session/receipt/version metadata. Deferred receipt guards require the successful settlement, closed session, exact bill version/total, settlement method/time and final flags, so a privileged malformed insert cannot commit a paid ledger without its receipt. Receipt and settlement rows remain immutable. RLS is enabled and browser roles have no table or function privileges.

For data created before HF01, the migration attempts a conservative forward compatibility backfill only where a successful settlement, close audit and grant revoke have matching non-special PostgreSQL transaction lineage, and the revocation occurs in the close/audit window before grant expiry. Special XID markers, ambiguous lineage and later explicit revokes fail closed. No ordering grant is un-revoked and no old PIN is accepted as history proof. Existing settled data is never rewritten; owners retain history even if a guest capability cannot be safely reconstructed. Earlier revokes and later revokes even within the same transaction are covered by the disposable-database migration test.

## API and auth contract

The existing route remains the primary transition path:

`GET /api/public/table-sessions/current/bill?qrCode=<publicCode>[&sessionId=<uuid>]` (and the compatibility `/api/public/table-sessions/bill` alias) returns the normal `TableBillView` while open/checkout-pending. After successful close, a valid old guest receives the same envelope with `kind: "paid_receipt"`, `receiptId`, `receiptVersion`, `currency: "VND"`, closed/paid session, immutable order/item snapshots, `settledAt`, `paymentMethod`, `canAcceptMoreOrders:false`, and `canSettle:false`.

The explicit historical route is `GET /api/public/table-sessions/:sessionId/receipt`, with no query/body. Owner history is available at `GET /api/owner/table-sessions/:sessionId/receipt` after normal Supabase Auth/store membership. Adapters are `fetchPublicSessionBill(qrCode, sessionId?, signal?)` and `fetchPublicSessionReceipt(sessionId, signal?)` in `src/features/customer/api-client.ts`. Both use `credentials: include`, no-store and the existing status/code/Retry-After adapter.

The server derives `browserHash` and `grantProof` from the existing Secure/HttpOnly guest cookie in `src/server/security/request-context.ts`. A QR is only a locator; UUID/session ID is only a selector. The RPC verifies the exact proof hash `digest(grantProof || ':' || sessionId)`, browser context expiry, scope and independent receipt expiry/revoke. It rate-limits receipt guesses with the existing DB bucket. A valid old capability cannot select a new session; a new QR visitor cannot discover the old session from QR resolution.

Errors are machine-readable in the existing `{data,error}` envelope: `RECEIPT_NOT_READY` (409; no successful settlement), `RECEIPT_ACCESS_DENIED` (403; wrong scope, revoked or unknown capability), `RECEIPT_EXPIRED` (410), `UNAUTHORIZED` (401; missing/expired browser context), `RATE_LIMITED` (429 with Retry-After), and sanitized `INTERNAL_ERROR` (500). A valid receipt holder is never sent `SESSION_REQUIRED`. Old ordering calls still return their existing `SESSION_EXPIRED`/`SESSION_REQUIRED` behavior.

## Realtime and resilience

Settlement and the private outbox hint commit together. The repository has no private realtime publisher/subscriber service, so the implemented fallback is authenticated no-store GET polling and reload/reconnect. The outbox event contains no receipt body or secret and is not public broadcast. Gemini's handoff is in `docs/contracts/P5_CLOSED_SESSION_RECEIPTS.md`: refetch on visibility/online/reopen/reload, treat `paid_receipt` as final, compare session/receipt versions, ignore duplicate/out-of-order hints, stop polling after finality, and retain stale data only for transient network errors. No paid state is inferred from closed/local cache/callback completion.

## Evidence and test results

All mutating checks used the loopback Supabase project (`http://127.0.0.1:15421`) and UUID-scoped cleanup.

| Command | Result |
|---|---|
| `npx.cmd vitest run --config tests/integration/vitest.config.mts` | **PASS 148/148** across 20 files (Phase2–4 plus billing and HF01 races) |
| `npx.cmd vitest run --config tests/integration/vitest.config.mts tests/integration/billing` | **PASS 23/23** including migration, multi-device, reopen, expiry/revoke, rollback and lock-timeout cases |
| `node tests/integration/billing/http-smoke.mjs` | **PASS 67 checks** against real local Auth + PostgreSQL + Next production HTTP; evidence `docs/reports/evidence/P5_HF01_LOCAL_HTTP.json` |
| `npx.cmd vitest run --config tests/unit/vitest.config.mts` | **PASS 131/131** |
| `npm.cmd run test:auth` | **PASS 46/46** |
| `npm.cmd run test:db` | **PASS 9/9** |
| `npx.cmd vitest run --config tests/ui/vitest.config.mts` | **PASS 276/276**; fixture/UI tests only, not browser proof |
| `npm.cmd run lint` | **PASS**, zero warnings/errors |
| `npm.cmd run typecheck` | **PASS** |
| `npm.cmd run build` | **PASS**; both guest and owner receipt routes generated |

The full148 run preceded the final added revoke/timeout test. The focused23 run includes that additional case and the final row-lock implementation; the migration case was rerun once more after tightening the legacy backfill audit window. A final HF01-only run passed5/5 (17 non-HF cases skipped) after preserving historical receipt reads for a disabled QR. HTTP67 was rerun after its fixture cleanup update. This report does not claim a separate full149 run. Expiry is tested with deterministic test-only timestamp changes/configuration, rather than waiting48h.

The HTTP evidence covers two verified guest cookies, three/four order snapshots, checkout pending, outstanding-order rejection, owner settlement retry, 500 rollback, 429/Retry-After, paid receipt response after close, explicit receipt endpoint, owner receipt, wrong/new guest denial, cross-session denial, reopen isolation with a new PIN/session, receipt revoke/expiry, and no provider network call. The database tests additionally cover two-device read equality, cancellation exclusion, historical menu/table label, immutable receipt, same-key/double settlement, explicit revoke race, failed lock/rollback and configured TTL. Takeaway/VietQR, FIFO and pickup regression suites are included in the 148-case integration run.

## Gemini handoff / remaining limits

Codex did not edit component/layout/CSS/page files for HF01. Gemini's current paid receipt UI/report is in `docs/reports/P5_HF01_GEMINI_PAID_RECEIPT_THANKYOU_UI_REPORT.md`; its automated 276 UI assertions are not mounted browser acceptance. The UI must consume the new `kind`, `receiptId`, `receiptVersion` and dedicated receipt adapter, preserve the proven session ID, and handle 401/403/410 without asking for the old PIN. It should not claim realtime delivery until a private publisher exists. Manual browser QA remains **NOT_RUN**: two real guest devices, settle while sheet is open, refresh/back-forward, offline/reconnect, reopen same table and stale event ordering.

Source findings still requiring Gemini follow-up in `src/components/customer/bill/useCustomerTableBill.ts`:

| Source | Finding / required behavior |
|---|---|
| Lines50–61,92–100 | `isAccessDenied` requires `!isPaid`, and the error handler keeps previously paid data on403/410. It also omits401 and the new receipt error codes. A definitive access denial must clear/redact the cached receipt and show an access-unavailable state; an old paid cache is not continued authorization. |
| Lines69–70,121–125 | Requests do not pass the proven session ID and have no response sequence/AbortController check. The local `cancelled` flag prevents new starts, not late state writes after scope changes/unmount. Pin the selected session, cancel requests and reject stale/out-of-order snapshots. |
| Lines132–135 | The early return after paid removes online/visibility listeners as well as polling. Keep recovery listeners so reopening/reconnecting can revalidate authorization, while leaving regular paid polling stopped. |

The server denies expired/revoked scopes and supplies the required adapter/contract. These UI findings are explicitly handed off, not concealed by the green fixture tests or build. They do not authorize Codex to edit Gemini's components.

## Deployment and operational limits

Apply migration016 only after audited001–015 on the intended test/staging project; it fails closed on missing or unexpected definitions. The local clean-chain, CRLF, drift and transaction rollback tests passed. No destructive rollback is provided: after deployment, use reviewed forward remediation while preserving receipt/settlement/order/ticket evidence. The receipt TTL is access retention, not evidence deletion. Read audit retention/archival remains an administrator policy; guest roles cannot delete evidence. For imported/ambiguous legacy grants that cannot meet the proof checks, owner history is available, but the old guest is not silently reauthorized.

Post-deployment read-only audit can check the receipt count per settlement and the function-body digests (`md5(replace(prosrc,chr(13),''))`): `p5_session_execute` = `24c009c20401bf9c36f03fbf34c23afd`, `p2_session_guard` = `16ca894fbcdee6939cc8a8e3b882ce78`, `p5_store_receipt` = `1769258ac8aa1a9f77795bad349b141c`, `p5_receipt_guard` = `07937cd5e6f04fb1c4b447c8921ff517`. A local audit found zero successful settlements missing a receipt.

## Diff scope

Codex additions/changes: migration016; public and owner receipt routes; billing service/validation/error mappings; typed `GuestPaidReceipt`; customer API adapters; billing/migration/integration HTTP tests; receipt contract and this report. Existing Gemini changes in customer components/tests are present in the shared dirty worktree and were not rewritten by this hotfix. `docs/reports/evidence/P5_HF01_LOCAL_HTTP.json` records the sanitized local response; no production SQL or payment provider call was made.
