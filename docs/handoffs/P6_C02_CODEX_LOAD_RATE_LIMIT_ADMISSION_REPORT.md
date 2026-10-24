# P6-C02 — Codex capacity, rate limiting và admission

Đã hoàn thành phần backend/API/PostgreSQL/load test trên local loopback. Production chưa được chạy và không có provider charge thật.

## Kết quả

Trước thay đổi, `menu-read` dựng lại JSON 200 item/1.000 option cho mọi request. Ở 100 VU burst p95 là **969 ms**, p99 979 ms; 200 VU p95 **1,689 ms**, p99 1,708 ms. Sau thay đổi, request có ETag hợp lệ trả `304` sau khi vẫn kiểm tra QR/capability/rate: p95 **357 ms** (100 VU), p95 **664 ms** (200 VU), 0 lỗi. Đây là burst trên loopback, không phải sustained capacity promise.

| Luồng | VU/request | p50 | p95 | p99 | RPS | lỗi |
|---|---:|---:|---:|---:|---:|---:|
| QR resolve | 50 | 361 ms | 380 ms | 380 ms | 129 | 0/50 |
| Menu 200 items | 50 | 340 ms | 424 ms | 433 ms | 114 | 0/50 |
| Menu 200 items | 100 | 660 ms | 792 ms | 807 ms | 122 | 0/100 |
| Menu 200 items | 200 | 1,412 ms | 1,673 ms | 1,691 ms | 116 | 0/200 |
| Menu revalidate 304 | 50 | 172 ms | 181 ms | 183 ms | 268 | 0/50 |
| Menu revalidate 304 | 100 | 334 ms | 357 ms | 358 ms | 271 | 0/100 |
| Menu revalidate 304 | 200 | 624 ms | 664 ms | 668 ms | 294 | 0/200 |
| Takeaway checkout | 50 | 236 ms | 360 ms | 371 ms | 134 | 0/50 |
| Signed TEST webhook | 50 | 810 ms | 878 ms | 885 ms | 56 | 0/50 |
| Duplicate webhook | 50 | 347 ms | 394 ms | 395 ms | 125 | 0/50 |
| Private tracking | 50 | 344 ms | 365 ms | 366 ms | 135 | 0/50 |

Evidence: [`P6_C02_BEFORE.json`](./evidence/P6_C02_BEFORE.json), [`P6_C02_AFTER.json`](./evidence/P6_C02_AFTER.json), [`P6_C02_CORRECTNESS.json`](./evidence/P6_C02_CORRECTNESS.json). Command: `node tests/load/capacity.mjs before|after`.

Environment: 24/10/2026, commit `b0d60a868cec53db7245c27242893bed29b38978` + dirty worktree. Windows/Node 22, local Docker PostgreSQL + PostgREST at `127.0.0.1:15421`, production Next at port 13026. Each VU sends one request in a bounded concurrent burst; this is completion throughput, not a stable RPS target. Checkout measurements are real PostgREST RPC, **not** HTTP checkout/provider link provisioning. Webhooks/tracking/menu/owner settings use real HTTP. The script refuses other Supabase URLs, uses TEST keys, checks occupied ports and cleans only its UUID-scoped fixtures. Filters/cart reads are client operations without independent backend endpoints.

At 100 VU, full menu read is 792 ms p95 on loopback, close to the suggested 800 ms; this does not establish a staging SLO. At 200 VU full read is still 1.673 s. Repeat menu payload drops from approximately 15.1 MB per 100 requests to 0 bytes of response bodies. First-load latency changes are within local run variance; there is no claim that full JSON rendering itself became faster.

## Source audit / profiling

Read README/PRD/ARCHITECTURE/PLAN/UI, Phase 0 contracts and existing P3/P4/P5 reports. A P6-C01 report was not found; its realtime delivery/reconnect guarantees are not assumed verified. Existing staged/unstaged P5 receipt changes and Gemini customer/billing/owner UI changes were preserved. This task did not modify component/layout/CSS files. One unused type import in Gemini's UI test was removed to satisfy lint; API-client changes preserve its preceding edits. Gemini has since wired `StoreAdmissionControlCard` to the owner adapter; the GET/PATCH contract is now exercised by the card's component path.

Critical routes located in source:

| Responsibility | Actual route / database path |
|---|---|
| QR / menu | `GET /api/public/qr/:code`, `GET /api/public/menu` → `p2_execute` / `p2_menu_execute` |
| PIN | `POST /api/public/table-sessions/verify` → `p2_pin_execute` |
| Dine-in / Takeaway checkout | `POST /api/public/orders` → `p3_order_execute` / `p4_checkout` |
| Webhook / recovery | `POST /api/webhooks/payments/:provider`, `POST /api/internal/payments/reconcile` |
| Tracking / private pickup | `GET /api/public/orders/:id[?includePickup=true]`, `GET /api/public/payments/:id` |
| Owner queue / claim | `GET /api/owner/orders`, `POST /api/owner/queue/claim-next` |
| Fulfillment / settlement | `POST /api/owner/orders/:id/ready`, `POST /api/owner/orders/:id/complete`, `POST /api/owner/table-sessions/:id/settle` |
| Bills / receipts | Existing `public/table-sessions/.../bill`, `public/table-sessions/:id/receipt`, owner equivalents |

`menu_snapshot` calls a per-item indexed option aggregate (200 option projections at this fixture size). Function-level EXPLAIN measured 13.245 ms / 1,605 shared hits before and ~24 ms / ~1,610 hits after; these top-level function plans do not expose every internal plan. The confirmed waste is regenerating/resending the unchanged representation. Conditional GET skips `menu_snapshot` entirely. No speculative new menu index was added.

The actual FIFO candidate query's EXPLAIN used the existing `orders_owner_queue` index (index-only scan, 50 rows, ~0.109 ms). It already has bounded pages/history cursors; no duplicate composite index was added. Full owner list totals and P5 bill aggregates still scale with order history; this small fixture does not certify large-history behavior. Existing unique payment transaction/provider references, order request IDs, pickup order ID, and per-store/day ticket constraints were retained. Store → intent/session → order lock order and atomic ticket allocation were retained; no SKIP LOCKED queue bypass or in-transaction provider IO was introduced.

Application access uses Supabase HTTPS/PostgREST, not a fresh direct Postgres socket per request. Local Supavisor is stopped; hosted REST pooling/connection budgets and Supabase quotas were not inspected. DB lock-wait distributions and DB CPU percentiles were NOT_MEASURED. Zero failed inbox rows and zero RPC transport errors are correctness evidence, not proof of zero contention.

## Thay đổi source và migration

- `supabase/migrations/20261024001700_capacity_admission_rate_limits.sql`: thêm `stores.accept_dine_in`, `stores.accept_takeaway`, `ordering_paused_at`; RPC `p6_ordering_execute`; effective availability projection; atomic owner version/idempotency; shared Postgres policy/rate bucket cleanup; per-type gates trong `p3_order_execute`, `p4_checkout`, và session bill.
- `src/app/api/owner/settings/ordering/route.ts`, `src/server/settings/ordering.ts`, `src/lib/validations/ordering-settings.ts`: GET/PATCH owner settings.
- `src/app/api/public/menu/route.ts`, `src/server/menu/service.ts`: private weak ETag/304, `Vary: Cookie`, `Cache-Control: private, no-cache`; authorization and rate checks still run on 304.
- `docs/contracts/types.ts`, [`P6_ORDERING_ADMISSION.md`](../contracts/P6_ORDERING_ADMISSION.md): admission DTOs and exact route/cache/retry contract.
- `src/features/customer/api-client.ts`: menu GET uses the browser's private `no-cache` revalidation; other requests retain `no-store`.
- `src/server/security/trace.ts`: optional static operation labels for menu/settings status/duration/correlation logs; no URL, query, tokens, IP, PIN or provider payload logging.
- `tests/integration/capacity.test.ts`, `tests/load/capacity.mjs`, unit/settings tests: rollback/drift, ACL, concurrency, admission, same-key retry, PIN/Wi-Fi, ETag and HTTP load evidence.

## Admission semantics

Effective dine-in admission is `stores.accepting_orders AND accept_dine_in`; Takeaway is `stores.accepting_orders AND accept_takeaway`. Owner PATCH locks the store, checks `expectedVersion`, writes one versioned command and emits an outbox update. New Dine-in orders and new Takeaway payment intents are rejected before order/payment rows are inserted. A pending or already-paid intent created before a pause remains valid; PayOS webhook processing does not consult the new admission flag and therefore cannot lose money or ticket evidence.

`STORE_NOT_ACCEPTING_ORDERS` remains the stable 409 code to avoid UI drift. There is no invented ETA or capacity number. Menu stays readable and includes `orderingAvailability` for the QR order type.

Manual per-type pause was chosen instead of an unproven `COUNT(*)` capacity race/automatic threshold. New admission and owner changes take the same `FOR NO KEY UPDATE` store lock. A dedicated race test holds the pause transaction open while checkout waits and proves no new intent is created afterward. In the HTTP load, pausing races the 50 signed callbacks: all already-issued valid intents still become paid/accepted and receive one FIFO ticket. Pausing after payment also preserves order, payment and pickup records. An idempotent replay returns the historical command result; clients must read current tracking afterward.

## Rate limiting and security

The limiter is PostgreSQL `security_rate_buckets` with atomic upsert, TTL timestamps and a bounded cleanup function. It is shared across Next instances; database errors fail closed as `INTERNAL_ERROR`. Public reads use browser/order capability keys; Takeaway creation uses browser+store and store aggregate keys; PIN uses QR/table, trusted proxy IP+QR when configured, device+QR, and a failed verifier key. Correct PIN verification is not charged as a failed guess, so independent guests on one Wi-Fi can succeed while one brute-force device remains locked. `x-forwarded-for` is used only with `TRUST_PROXY_IP=true` or Vercel's trusted ingress. 429 responses include `Retry-After` and bounded `retryAfterSeconds`.

| Key / scope (hashed in storage) | Default limit/window | Behavior |
|---|---|---|
| `read:browser:qr` | 60 / 60 s | QR and menu share a device budget, including 304 |
| `order-read:browser:order`, `payment-read:browser:intent` | 60 / 60 s | Authenticated private projection; no shared-IP lock |
| `receipt-read:browser` | 60 / 60 s | Existing P5 receipt guard, including denied reads |
| `order-create:browser:store`, `takeaway-create:browser:store` | 10 / 60 s | Only new commands; replay precedes limiter |
| `takeaway-create-store:store` | 300 / 60 s | New checkout burst protection; valid callbacks unaffected |
| `owner:actor:read`, `owner:actor:write` | 120 / 60 s; 30 / 60 s | Owner mutation/replay scope remains store-authorized |
| `verify:browser:qr` | 5 wrong / 60 s | Device locked after five failures, including a subsequent correct guess |
| `pin-device-burst:browser:qr` | 5 wrong / 10 s | Independent from other guests |
| `pin-ip-burst:trustedIpHash:qr`, `pin-ip-minute:trustedIpHash:qr` | 10 wrong / 10 s; 30 wrong / 60 s | Wrong verifiers throttled; correct independent guests bypass shared failure counters |
| `pin-table-burst:qr`, `pin-table-minute:qr` | 20 wrong / 10 s; 60 wrong / 60 s | Distributed wrong guesses throttled; no whole-table valid-PIN ban |

`capacity_rate_policy` is shared, admin-managed PostgreSQL configuration; service role can SELECT only, guest/owner roles cannot access it. Defaults above can be changed with audited admin SQL rather than per-instance environment drift. Windows are bounded to 1–60 seconds and maximum counts 1–10,000. `owner-read:`/`owner-write:` configuration maps existing owner keys without changing stored identities. Existing pickup completion limiter (10 owner attempts/minute, credential lock after five failed codes/15 min) stays unchanged.

Expiry is logical at `resets_at` on every upsert. Reconcile job calls `p6_rate_cleanup()` to delete at most 1,000 buckets expired over one hour, using the expiry index/SKIP LOCKED only for housekeeping. Cleanup failures are isolated from payment recovery. Schedule the existing authenticated reconcile endpoint; without scheduling, stale rows remain in storage but do not extend bans. Counter increments saturate to avoid overflow. Each rate decision costs an indexed policy lookup/upsert; there is no Redis dependency or process-global Map limiter. Fail-closed DB outages return the existing sanitized 500, not a fabricated 429. Server RPC timeout remains 15 s; admission lock wait is bounded to 3 s. No automatic blind mutation retry was added.

## Correctness

The after load produced exactly **50 orders, 50 payment ledger rows, 50 distinct tickets, 50 pickup credentials, and 0 failed webhook inbox rows**. Fifty duplicate signed callbacks did not add rows. Foreign buyer tracking returned 404. Twenty same-key Takeaway retries while paused returned the original result and did not create another intent. Disposable DB tests verified 50 correct PINs over one source/IP, failed-device lockout, stale settings versions, changed-payload conflict, store-lock serialization, and atomic migration rollback.

| Required scenario | Result / evidence |
|---|---|
| 50/100/200 QR/menu reads | PASS, before/after JSON; client filter/cart have no endpoint |
| 50 independent checkout IDs/references + buyer isolation | PASS, RPC plus signed HTTP callbacks/tracking; each pending order initially has no ticket |
| Signed callback concurrency/duplicates | PASS, local SDK-signed fixtures; real provider E2E BLOCKED |
| Mixed Dine-in/Takeaway FIFO and concurrent claims | PASS, existing `payments.test.ts`/`owner-queue.test.ts` in full integration run |
| 20 identical command retries / changed body conflict | PASS, order integration, load same-key retry and new owner settings concurrency test |
| PIN brute force + common Wi-Fi | PASS, 50 independent service-role connections, failed-device lock plus source counters |
| Pause before checkout / pending / concurrent callback | PASS, no new intent on denied checkout; signed callbacks finish previously admitted intents |
| Reload/reconnect/tab burst | HTTP revalidation/burst PASS; live Realtime reconnect/browser offline UX NOT_RUN here; P6-C01 artifact absent |
| Post-payment noncritical failure / recovery | PASS, existing payment/pickup integration fault injection and same immutable retry evidence; no provider network |
| Private pickup `ORDER_NOT_FOUND` regression | PASS, 50 owners get their own credential, foreign buyer 404, no tracking/error cache |

## Verification

- `npx.cmd vitest run --config tests/integration/vitest.config.mts`: **156 passed**.
- `npx.cmd vitest run --config tests/unit/vitest.config.mts`: **134 passed**.
- `npm.cmd run test:auth`: **46 passed**.
- `npm.cmd run test:db`: **9 passed**.
- `npx.cmd vitest run --config tests/integration/vitest.config.mts tests/integration/capacity.test.ts`: **7 passed**.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: passed on the final source. The load harness also builds with loopback-only test configuration.
- UI regression: `npx.cmd vitest run --config tests/ui/vitest.config.mts`: **293 passed** on the latest Gemini source. These tests do not establish browser behavior for the two handoff findings below.

The full integration run passed before the last narrow validator/housekeeping refinements; the final capacity migration was re-applied from a clean disposable database and its 7 tests passed afterward. All 001–017 migrations are exercised there with hosted-style minimal grants, CRLF normalization, intentional body drift rejection and a rollback trial. At that initial validation stage, no production schema was queried or changed. The subsequent read-only deployment audit is recorded below.

Gemini handoff: `StoreAdmissionControlCard` now calls `GET/PATCH /api/owner/settings/ordering` with a version. Two integration details still need Gemini's follow-up: render `availability[].acceptingOrders` (or master AND type flag), and retain an uncertain PATCH's original request ID/body for a retry. The current card reads raw type flags and generates a fresh request ID on every click. If the master gate is false it can display a channel as open while the server correctly rejects checkout. These UI issues do not weaken backend enforcement but must be resolved before claiming the whole owner experience is complete.

Exact examples/statuses and browser-cache behavior: [`P6_ORDERING_ADMISSION.md`](../contracts/P6_ORDERING_ADMISSION.md). The existing UI adapter permits native menu cache revalidation. The card handles 429/version errors; the owner shell initializes its props from the legacy master field. Customer UI should retain the cart on `STORE_NOT_ACCEPTING_ORDERS`; a previously issued intent continues through payment/tracking. Neither a stale version nor a 5xx authorizes optimistic success. This Codex task leaves component ownership with Gemini.

## Deployment / remediation

### 2026-10-24: hosted checkout preflight audit

Read the deployed `pg_proc` metadata and complete checkout source through the project's existing Supabase SQL Editor. Production checkout hash is `2457e0ec02d73b9a53ed2ed23ba651eb`; 017 expected canonical 010 hash `b79040e8486bc7315d1377eafc486d8b`. The other eight original preflight functions match their expected hashes, invoker mode and configuration. Checkout also has the correct `search_path=pg_catalog`, `lock_timeout=3s` and postgres/service_role-only execute ACL. The emitter matches `cf84bf7a41a9224e15ba26fc44ee473f`, is invoker, and has the expected search path and ACL.

The legacy source differs from canonical checkout in exactly two places: it omits the `takeaway-create-store` rate call and writes creation events/outbox directly without a correlated `eventId`. Reconstructing those two differences from migration 010 reproduces the Production digest exactly; this is not a whitespace-only mismatch. `stores.accept_takeaway`, `capacity_rate_policy` and `p6_ordering_execute` are absent, confirming that 017 has not installed its schema.

Updated 017 accepts only that additional audited checkout body and keeps all existing config/invoker checks. It also audits the emitter dependency. Before P6 schema changes, the legacy body is normalized to the exact canonical 010 digest, restoring the store limiter and `p4_emit` call. Normalization has its own hash assertion and explicit LF separators for CRLF editor input. The regular P6 transformation then produces checkout hash `c6a8c6955c88446af1174e3dd48d6303`. No historical order/payment/ticket/pickup/event/outbox rows are rewritten.

Validation after this fix: `npx.cmd vitest run --config tests/integration/vitest.config.mts tests/integration/capacity.test.ts` — **8 passed**. Covers canonical apply/rollback, exact legacy reconstruction, rejection of legacy drift/config changes, rollback restoring legacy source, CRLF apply, final body convergence, service-role ACLs, effective admission, concurrent pause/checkout, store ceiling with replay, and correlated creation events. Tests use a disposable local database; the hosted project received read-only catalog queries only. The revised migration still needs to be applied there.

Migration 017 is one transaction with a 3-second lock timeout and exact source/config/invoker preflight for replaced functions. It adds two default-true booleans, a nullable timestamp and a small configuration table; no order/payment rows are rewritten, no table-wide history/index rebuild is added. ALTER TABLE still briefly requires an exclusive lock: deploy during a quiet window, stop on timeout, and retry the entire transaction once the conflict clears. Apply 001–016 first. Run migration 017 once through migration tracking; an already-applied body is deliberately not accepted by its baseline preflight.

Before COMMIT, any failure/ROLLBACK restores schema, definitions and grants. After COMMIT, remediate forward. An operator can set both type flags true (and the legacy master gate as intended) to reopen admission via the API. Preserve all order/payment/pickup evidence; do not erase rows or weaken the preflight by adding unknown hashes. Deploy migration before code that consumes the ETag/settings contract. Admin rate-policy changes should be tested with their real key/window and a new staging load run.

## Chưa chạy / rủi ro

Real PayOS sandbox/provider network, sustained multi-instance load, and production Supabase quotas are **BLOCKED/NOT_RUN**. Webhook evidence uses PayOS SDK-signed TEST ONLY fixtures over local HTTP. The 304 path still performs database authorization/rate checks, so it reduces payload/serialization work but does not eliminate DB load. Apply migration 017 with the normal Supabase migration pipeline, then run the HTTP/load commands against a staging project before production.
