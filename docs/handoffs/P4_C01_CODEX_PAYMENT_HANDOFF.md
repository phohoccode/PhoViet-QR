# P4-C01 — Codex payment handoff

Status: **READY_FOR_UI_INTEGRATION** for the implemented payOS backend contract. Live activation remains **BLOCKED** until Production migration, webhook registration and real provider verification. Blank env templates were added as requested; during implementation the user filled the payOS credentials. Presence was checked without printing values, and `PAYOS_STORE_ID` was bound to the verified existing bootstrap store. No Production migration or live payment request was executed.

Implemented:

- `supabase/migrations/20261024001000_takeaway_payments.sql` extends `orders` additively for `takeaway`, adds `payment_intents`, immutable `payments`, durable `payment_webhook_inbox`, scoped `takeaway_requests`, uniqueness, RLS/ACL, expiry/retry state, and deferred paid-before-ticket guards.
- `p4_checkout` computes menu snapshots and integer VND totals server-side, creates `pending_payment` without a ticket or table session, and binds replay to the guest browser/capability and request fingerprint.
- `PayOS` adapter uses the official `@payos/node` signature implementation. It validates provider account, reference, amount, VND, link and signed webhook data. Browser returns and provider status polling never mark an order paid.
- Webhook ingestion and processing are separate durable operations. Verified events are deduplicated by provider/event and provider transaction, then lock store → intent → order and allocate the shared FIFO ticket once. Mismatch, expired, late, unknown and failed events remain evidence for reconciliation.
- Routes: `POST /api/public/orders` (dispatches takeaway by QR type), `GET /api/public/orders/:id`, `GET /api/public/payments/:intentId`, `POST /api/webhooks/payments/payos`, and authenticated internal reconciliation `POST /api/internal/payments/reconcile`.
- Shared owner queue accepts only paid takeaway rows after the migration replaces the Phase 3 dine-in-only head check. Dine-in/PIN paths remain unchanged.

Required server-only configuration (never `NEXT_PUBLIC_`):

`PAYOS_STORE_ID`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_ACCOUNT_NUMBER`, `PAYMENT_RETURN_ORIGIN`, `PAYMENT_RECONCILE_SECRET` (at least 32 characters for the reconciliation endpoint).

`PAYMENT_RETURN_ORIGIN` must be an exact origin; production requires HTTPS. Configure the payOS webhook URL as `<origin>/api/webhooks/payments/payos` and confirm it through the payOS dashboard/SDK before accepting live traffic.

`PAYOS_STORE_ID` binds the single configured payment channel to one existing store UUID. Other stores fail closed with HTTP 503 `PAYMENT_PROVIDER_UNAVAILABLE`. The application never takes a tenant ID or payment amount from the browser. `.env.local` remains ignored by git; `.env.example` contains blank values only. Credential presence does not establish validity/merchant ownership; that requires the provider acceptance check.

Deployment/runbook:

1. Review/apply migration 010 after 001–009 in an approved environment. Its preflight compares normalized Phase 3 function-body digests; unexpected deployed code fails before changing schema. It never rewrites existing table, QR, session or order data. SQL `ROLLBACK` before commit restores the catalog; after financial traffic, use a reviewed forward migration, never delete history.
2. Configure the payOS channel and its linked receiving account. Credentials must belong to the same channel. A wrong account receives no payment instructions and cannot issue a ticket.
3. Schedule a trusted POST to `/api/internal/payments/reconcile` once per minute with `Authorization: Bearer <PAYMENT_RECONCILE_SECRET>`. This retries up to 100 durable inbox items and checks up to 10 pending intents per run, with fair rotation by last check. Size worker frequency/capacity for real traffic; no scheduler is installed automatically in this repository.
4. Run an actual payOS test transaction and verify signature, recipient account, webhook reachability/ACK/retry, exact amount, late money and hosted checkout before enabling live traffic. payOS documentation describes its Production API; no separate sandbox endpoint was invented.

Policy choices for this implementation: payment intent TTL 10 minutes, buyer access 12 hours; takeaway total must be positive. The DB clock decides expiry. A verified receipt persisted before expiry can be retried after expiry without losing its place; the ticket is assigned at the actual acceptance transaction time, not the payment-start time. A provider status of PAID alone never queues an order. Missing webhook money is flagged for reconciliation and becomes an exception on expiry.

Gemini UI contract:

- Initial takeaway order is `pending_payment`, `ticketNo/serviceDate/acceptedAt=null`; payment is `pending` and `checkoutUrl/qrPayload` may both be null while the server provisions instructions.
- Poll `GET /api/public/payments/:intentId` and refetch the order. Render `paid` only from the server snapshot; display the ticket only after `accepted`.
- `expired` and `exception` are terminal UI snapshots. Do not generate a new request key or treat a return URL as proof of payment.
- R04 returns the original immutable command snapshot on retry, even after a later payment/status change. R05/R06 return current DB snapshots. Keep the same key plus normalized cart/revision after uncertain POST results; recover that command before starting another checkout.
- `qrPayload` is the real provider EMV string. `checkoutUrl` is HTTPS payOS hosted checkout. Recovery after a lost create response can return a hosted checkout URL with `qrPayload=null`; render the link without inventing a QR/bank transfer description.
- No raw reference, account number or pickup credential is added to the public contract. `intentId` and the order UUID are locators, not bank transfer content. Do not offer copying them as transfer instructions. Pickup projection returns `pickup=null`; takeover fulfillment remains blocked until its own implementation.
- Missing configuration is HTTP 503 `PAYMENT_PROVIDER_UNAVAILABLE` before any takeaway order write. R06 missing/wrong buyer scope is 404 `RESOURCE_NOT_FOUND`; R05 wrong scope is 404 `ORDER_NOT_FOUND`. Pending/expired/exception GETs are HTTP 200 snapshots. Existing validation, CSRF, rate-limit and price-change errors retain the Phase 3 envelope.

Known UI integration gaps in the concurrent Gemini work: use R06/refetch to load instructions after initial POST (which intentionally returns null instructions); never use `intentId`/order ID as bank transfer content; a local countdown alone must not trigger a new payment. Review the expiry/retry CTA against this contract before release. UI behavior beyond the small build/lint fixes below was not changed by Codex.

Source files owned by this change: `src/server/payments/*`, new payment/webhook/internal routes, the two existing order routes, owner order response parsing, order response validations, `src/features/orders/api-client.ts`, canonical additive error codes, env examples, package lock/SDK, payment tests and this handoff/security review. Existing Gemini changes were preserved. Minimal build/lint fixes in concurrent UI files: narrow payment instructions with `in`, remove unused imports/destructuring, and replace two image tags with `next/image` plus `unoptimized`; no styling/layout changes.

Validation run:

- `tests/unit/payos.test.ts`: 8 tests pass (TEST ONLY signed fixtures), including official create-request/response signatures and signed provider status parsing.
- `tests/integration/payments/payments.test.ts`: 11 tests pass locally, including 20 duplicate webhooks, 50 concurrent checkouts, mismatch/late evidence, processing rollback/retry, mixed queue behavior, provider timeout/response recovery, provisioning lease races and underpayment reconciliation. Provider IO is mocked only inside these explicitly TEST ONLY cases; production has no fixture adapter.
- `tests/integration/payments/migration.test.ts`: fresh schema/rollback/ACL/constraint checks pass locally.
- Full existing integration run: 103 pass (including the first 6 payment tests and migration test); the expanded payment + migration suite separately passes 12. Unit: 110 pass at the full-suite run, then the expanded payOS unit suite passes 8. Auth: 46 pass. DB: 9 pass. UI: 161 pass. These are separate executed results, not an inferred combined total.
- `node tests/integration/orders/http-smoke.mjs`: PASS, including a real Next production build, six-digit PIN/rotate/grants, dine-in pricing, 20 duplicate HTTP creates, owner FIFO/ready/complete, CSRF and dropped-response recovery. Its takeaway assertion now expects fail-closed configuration503.
- `node tests/integration/payments/http-smoke.mjs`: PASS against a Next production build made with loopback-only env. Buyer401/404, bad signature/body/provider, private read snapshots, authenticated reconciliation and 20 signed HTTP webhook deliveries→one ledger/ticket; no provider IO. The script always builds with its own test env because NEXT_PUBLIC configuration is inlined during compilation.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` and `python docs/contracts/validate_contracts.py`: PASS. Real payOS E2E: **NOT_RUN**, pending approved Production migration, public webhook registration and provider/transfer verification. Browser visual acceptance: **NOT_RUN**.

Official references inspected: https://payos.vn/docs/api/ and https://github.com/payOSHQ/payos-lib-node (official `@payos/node` 2.0.5, exact dependency). payOS signs sorted `data` using HMAC-SHA256; raw HTTP whitespace is not the signed representation. Webhook wire ACK is HTTP 200 with `{code:"00",desc:"success"}` after durable processing/exception recording; transient DB processing failure returns HTTP 500 for retry.
