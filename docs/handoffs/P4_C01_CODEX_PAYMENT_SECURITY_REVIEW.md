# P4-C01 — Security review

## Webhook authenticity

The adapter validates the payOS wire schema and computes the official sorted-object HMAC-SHA256 using the checksum key. The signature is compared in constant time. All signed fields are preserved before parsing; amount, account, merchant reference, payment link, currency and success code are checked again against the stored intent. Invalid signatures never enter the inbox.

Reference: https://payos.vn/docs/api/#tag/payment-webhook/operation/payment-webhook and official SDK `@payos/node` 2.0.5. payOS signs `data`, not the raw bytes or top-level `success/code`; only the signed `data.code` controls success. Body reading is bounded at 4 KiB. Transaction timestamps use the documented Vietnam local-time format, validated as ISO with +07:00, with a five-minute clock-tolerance check. No provider freshness nonce is invented; replay safety comes from durable event/transaction identity and the intent deadline. Signed evidence may contain payer/account data and is stored only in the protected inbox, never in public outbox payloads.

## Idempotency and transaction safety

Checkout uses `(store_id, client_request_id)` plus a browser/capability binding and immutable request fingerprint. Webhook inbox uniqueness covers `(provider,event_id)`; the payment ledger covers `(provider,transaction_id)` and one ledger per intent. Processing locks receipt, store admission, intent, order and transaction key in a fixed order. Ticket allocation, paid state, ledger, audit and outbox are one transaction. Duplicate requests return an ACK without another ticket.

The store admission lock remains `FOR NO KEY UPDATE`, preserving the Phase 3 fix for FK KEY SHARE/session-close deadlocks. Pending takeaway has no table/session lock. Claim-next never skips a corrupt or unpaid head; paid takeaway must have an authoritative succeeded intent and matching ledger. Deferred constraints enforce paid-before-ticket even for direct service-role writes. Price/name/options, intent financial identifiers, webhook evidence and accepted tickets have immutability guards. History deletion is forbidden; fixture cleanup bypasses triggers only in UUID-scoped local test transactions.

Provider creation uses a durable reference and 30-second lease. Network IO runs after prepare commits; 20 parallel provision calls issue one provider create. If the response is lost, the next attempt queries the same reference; a signed existing link is recovered with a hosted URL and no fabricated QR. An unavailable query leaves the same intent pending, rather than risking another payment. A first create that never reached payOS can therefore stay pending until expiry/manual retry; this deliberate availability limit is documented.

## Expiry and reconciliation

An intent expires only after checking for received/failed evidence before expiry. Late, unknown, non-VND, merchant-mismatch and amount-mismatch money is recorded as `exception` and never enters the kitchen. Processing failures leave the inbox in `failed`; the reconciliation endpoint retries the same evidence. Provider status lookup is evidence only and cannot accept an order.

Admission uses persisted receipt time plus provider transaction time; the ticket uses DB acceptance time/store timezone and the existing transactional counter. Failed processing cannot erase the receipt because ingestion already committed. The processing subtransaction rolls back payment/intent/order/ticket/audit/outbox together, then increments the durable failed-attempt state. Already-paid orders cannot be downgraded by later failure or extra-money events. Unknown references and conflicts retain protected evidence for operator review; no auto-refund or auto-accept reconciliation endpoint exists.

## Access and privacy

Takeaway has no table session and receives an order-specific guest capability. Payment tables and functions are service-role-only with RLS enabled. API responses are private/no-store; secrets, raw provider bodies and payment credentials are not logged. Reconciliation requires a server-only bearer secret. The webhook response contains only the provider-required wire acknowledgement.

Access uses the existing 32-random-byte HttpOnly guest cookie, browser mapping and order-specific proof hash with a 12-hour access deadline. Order/intent UUIDs alone authorize nothing. A table grant and an owner cookie do not authorize buyer tracking. R04 checks same-origin CSRF and strict price-free inputs; per-browser/store limits and a separate store aggregate300/min avoid using a shared Wi-Fi IP as the sole identity. R06 is DB-only and rate-limited per buyer/intent. Invalid webhook requests perform no DB work before authentication; edge/ingress quotas are an operational responsibility. New financial RPCs are invoker functions with fixed search_path and no anon/authenticated EXECUTE; internal reconciliation uses a constant-time bearer comparison.

Outbox records commit atomically and carry only IDs/version/type. As in Phase 3, no realtime publisher/dispatch deployment exists here; reconnect and polling must refetch DB snapshots.

## Known operational limits

Automatic refunds, split bills, multiple providers, pickup completion and live payOS E2E are outside P4-C01. Configure a scheduler/worker to call reconciliation; no provider network call runs while a database ticket lock is held.

Verification: local official-SDK signature fixtures; 20 duplicate webhooks→one ledger/ticket (both RPC and real Next HTTP); 50 concurrent checkout intents; processing fault rollback/retry; valid pre-expiry receipt recovered after deadline; amount/currency/account errors; pending excluded from owner queue; mixed FIFO; provider timeout/lease recovery; ACL/RLS/deferred constraints/atomic migration rollback; existing dine-in/PIN HTTP regression. Real provider transaction/security acceptance remains **BLOCKED / NOT_RUN** pending approved Production migration, registered webhook and actual provider acceptance. The user filled env credentials during work; only presence was checked and an existing bootstrap-store UUID was bound. No Production schema/data changes or real payment create/transfer was executed.
