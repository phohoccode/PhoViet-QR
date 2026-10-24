# P5-HF01 — final paid receipt contract / Gemini handoff

Migration016 supersedes the closed-guest-read restriction in P5-C01/C02. Ordering grants are still revoked on close. A separate hashed receipt capability is captured for each unrevoked, unexpired guest in the settlement transaction. The existing HttpOnly browser cookie supplies proof; there is no new token in URLs, JSON or localStorage. `bank_transfer` continues to mean manual transfer.

## Routes and types

- `GET /api/public/table-sessions/current/bill?qrCode=<code>[&sessionId=<uuid>]` and the existing `/api/public/table-sessions/bill` alias return `ApiResponse<TableBillView>`. After settlement, the same authorized browser receives `GuestPaidReceipt`, a `TableBillView` with required `kind:paid_receipt`, `receiptId`, `receiptVersion` (positive integer), `currency:VND`. All existing fields remain: `table`, `session`, `orders[].lines`, integer `totalVnd`, financial `billVersion`, `settledAt`, `paymentMethod`.
- `GET /api/public/table-sessions/:sessionId/receipt` returns `ApiResponse<GuestPaidReceipt>`. No query/body. It works even if the table/QR is later disabled or replaced; only the historical capability authorizes it. A receipt ID is metadata, not a bearer credential or lookup route.
- Disabling/retiring the original QR blocks new ordering, but does not revoke an existing receipt capability. Bill GET may still use that historical QR as a locator for a proven closed receipt; active-session reads retain the existing active-QR guard.
- `GET /api/owner/table-sessions/:sessionId/receipt` returns the same immutable snapshot after owner Auth and store membership checks. Owner bill/settle routes retain their existing contracts. Their live bill projections need not have receipt metadata; refetch the receipt endpoint when needed.
- Adapters: `fetchPublicSessionBill(qrCode, sessionId?, signal?)` and `fetchPublicSessionReceipt(sessionId, signal?)` from `src/features/customer/api-client.ts`. Both use credentials/include, cache/no-store, optional cancellation and existing `MenuApiError` status/code/Retry-After behavior.

For bill GET without sessionId, the server selects the newest session of that QR table for which this browser has a matching proof. An unverified new session does not hide the old guest's receipt. Persist the nonsecret session ID from the last authorized bill when tracking a specific visit, and pass it on subsequent reads. A browser verified in a newer visit defaults to that visit; explicit old session ID still requires its own old receipt capability. A new visitor gets no historical session ID or receipt through QR resolution. Wrong QR plus a known old session ID cannot cross table/store boundaries. The dedicated receipt endpoint is preferred once the old session ID is known.

`paid_receipt` always has `session.status=closed`, `session.paymentStatus=paid`, non-null `settledAt`/`paymentMethod`, `canAcceptMoreOrders=false`, `canSettle=false`. Orders preserve tickets and item/option/quantity/price snapshots; cancelled tickets remain visible and excluded from payable total. A closed session without successful settlement has no receipt. Table labels are frozen from the prepared checkout snapshot. Final receipts do not change on menu/table edits. Owner command replay remains the historical command response; GET reconciles current state.

## Errors and credential lifecycle

| HTTP | Code | Meaning |
| --- | --- | --- |
| 401 | UNAUTHORIZED | Missing/malformed cookie, unknown or expired browser context |
| 403 | RECEIPT_ACCESS_DENIED | No matching historical capability, revoked capability, wrong/unknown session; uniform response avoids existence disclosure |
| 403 | SESSION_REQUIRED | Generic bill GET has no matching session proof; never used for a valid receipt holder |
| 409 | RECEIPT_NOT_READY | Proven active session holder asks for a receipt before successful settlement |
| 410 | RECEIPT_EXPIRED | Matching receipt proof exists, but its TTL ended |
| 429 | RATE_LIMITED | Retry-After; 60 guest bill/receipt attempts per browser/minute, including guessed targets, plus existing active-bill limits |
| 400 / 500 | VALIDATION_ERROR / INTERNAL_ERROR | Strict schema / sanitized transient error; no inference of paid |

All responses are private/no-store; public routes vary on Cookie/Origin. A valid UUID is not authorization. No historical PIN re-entry path exists. Receipt access expiry defaults to settlement time +48h, capped by browser context expiry (30d cookie/context maximum). Admin configuration for future grants: `update public.session_receipt_policy set ttl_seconds=172800 where singleton;` allowed range 60s–30d. This is a DB deployment policy, not an env variable or owner request value. Changing it does not extend existing credentials. Explicit revoke: service-role/admin may set `session_receipt_access.revoked_at`; it cannot change the snapshot. Do not un-revoke `guest_access`.

Pre-HF open guests need no new verification: their still-valid grant is captured at eventual settlement. Closed legacy receipts are backfilled only from actual successful settlement evidence. Legacy receipt access is reconstructed only when matching non-special PostgreSQL tuple transaction IDs show ledger+session close+grant revoke shared one transaction, the revocation falls between closed_at and that confirmation's audit timestamp, and the grant had not expired at closure. An earlier/later explicit revoke (even later in the same transaction), special/ambiguous XID lineage, expired browser or receipt TTL fails closed. Do not manually whitelist a hash, use a PIN as historical proof, or silently extend old access. Historical receipt data is retained for owners even when guest authorization cannot safely be recovered.

## Synchronization and Gemini checklist

An atomic outbox event `table_session.receipt_ready` has only `eventId`, `aggregateId` (session ID), `version`, `receiptVersion`, `receiptId`, `type`. No bill/PIN/cookie/payment account is broadcast. `outbox_events` remains server-only. There is currently no private realtime publisher/subscription service in this repository; no public channel has been added. Deploying a publisher later requires historical receipt-scope authorization, not merely an open-session grant.

Until then, authenticated polling is the implemented fallback. Gemini owns the hook/component integration:

1. Keep the proven session ID and fetch bill while open/checkout_pending (suggest 10s while visible). Re-fetch immediately on `online`, visibility restoration, sheet reopen and page reload. Preserve last data as stale during network failures.
2. Treat `kind=paid_receipt` from the server as final. Switch to `fetchPublicSessionReceipt` using that session ID. Never synthesize paid from closed, a timer, callback completion or cached checkout state.
3. Stop periodic polling after final receipt; reload/reconnect/reopen can safely fetch the same snapshot. Use AbortController and remove listeners/timers on cleanup.
4. Compare session ID and `receiptVersion`; do not let a delayed checkout response replace an already confirmed receipt. Events are hints: refetch, tolerate duplicate/out-of-order hints and retry transient not-ready/5xx with bounded backoff. Snapshot+event commit together, so no uncommitted paid result exists.
5. Map 401/403/410 to a receipt-access-unavailable state, without asking for the old PIN or allowing order creation. 429 respects Retry-After; network/5xx retain stale data and offer retry.
6. Test real mounted UI in two guest browser contexts: settle while sheet is open; reload/back/forward; offline/reconnect; reopen same table for a third guest; verify the old guests retain only their prior receipt. Backend HTTP evidence does not claim these UI checks passed.

No components/layout/pages/CSS are changed by Codex for HF01. Full audit and evidence: `docs/reports/P5_HF01_CODEX_CLOSED_SESSION_RECEIPT_REPORT.md`.
