# P4-HF02 — Pickup code `ORDER_NOT_FOUND` audit and fix

Status: **FIXED_AND_VERIFIED** for the pickup defect. Real provider payment E2E was not rerun.

The affected order was a paid, ready Takeaway order (`#006`, UUID redacted). Production read-only evidence showed a valid succeeded intent, matching VND ledger, live guest scope, and no `pickup_credentials` row. The customer request was `GET /api/public/orders/<order UUID>?includePickup=true`; the UUID was not a ticket number or payment ID.

## Root cause

The deployed `p4_pickup_execute(text,jsonb)` had body hash `3f34f992a922d5f4f108f0225edbe9b9` and `#variable_conflict use_variable`. The SQL aliases `o`, `i`, and `c` were also PL/pgSQL record variables. In the `missing`, `issue_context`, and `tracking` statements, the ambiguous references resolved to the record variables instead of the row aliases. The valid order therefore disappeared from the joins and returned either an empty recovery list, `data: null`, or `ORDER_NOT_FOUND`.

This was reproduced in a disposable PostgreSQL database with the exact audited Production body. The canonical 011 body uses `#variable_conflict use_column`; after the repair, the function hash is `7c86603159699872946cc1625f510289`. The repair also restores the reviewed 24-hour credential eligibility bound.

The missing credential was a separate lifecycle gap: the payment webhook had accepted the order, but credential issuance had not completed. The tracking GET remains read-only; a trusted worker issues the credential through `issue_context` + `issue`.

## Changes

| Area | Before | After |
|---|---|---|
| DB executor | Ambiguous record/alias resolution; valid paid order omitted | `20261024001300_pickup_alias_resolution.sql` installs the reviewed canonical executor and preserves service-role-only ACL |
| Worker jobs | C04 `jobs`/`inspect` referenced absent `last_checked_at` on the deployed legacy table | `20261024001400_payment_worker_legacy_column.sql` adds the nullable metadata column with guarded preflight |
| Tracking | Private failure silently fell back to public order and left pickup loading indefinitely | Private request has a 15s timeout, bounded retry, in-flight deduplication, stale-result cancellation, and explicit recoverable status |
| Credential lifecycle | Paid ready order could remain without a credential | Worker recovery issues one stable encrypted credential; GET never creates or rotates it |
| Authorization | Guest browser hash + proof + active context + access expiry | Same checks remain enforced; wrong scope still returns `ORDER_NOT_FOUND` |

## Production verification

- User applied migration 013 in the active Supabase project.
- After migration, the target order appeared in both `missing` and `issue_context` before recovery.
- Targeted recovery issued exactly one credential. A read-back showed `before=0`, `after=1`, `consumed=false`, and `orderUnchanged=true` for the redacted `#006` target.
- The credential is not exposed in this report or logs.
- The common reconciliation worker initially failed on the missing `last_checked_at` column (`42703`). User applied migration 014; a subsequent read-only `jobs` probe succeeded (0 queued events, 2 pending intents). These other pending intents were not provisioned or expired by this task.
- User replied “đã ok r” after applying 014 and checking the buyer tracking page. A final DB read confirmed one unconsumed credential, status `ready`, ticket 6, succeeded intent without review hold, and the original matching VND ledger.

## Request trace and changed files

| UI / data | Function and source | API / DB boundary |
|---|---|---|
| Pickup code on ready Takeaway | `src/components/customer/order/OrderTrackingView.tsx:238` → `getPrivateOrderTracking` | `GET /api/public/orders/<order UUID>?includePickup=true`, credentialed/no-store, existing HTTP-only guest cookie |
| Private order view | `src/app/api/public/orders/[id]/route.ts:17` → `getTakeawayOrder` → `getPrivateTakeawayTracking` | Same UUID; `p4_pickup_execute('tracking', {orderId,browserHash,grantProof})` |
| Guest scope | `src/server/pickup/service.ts:117` and migration 013 tracking join | `takeaway_requests` + active `guest_browser_contexts`; proof digest bound to order; credential is a LEFT JOIN |
| Credential issuance | `src/server/pickup/service.ts:61` | `issue_context` then server CSPRNG/AES-GCM/HMAC then locked `issue`; never inside tracking GET |
| Worker recovery | `src/server/pickup/service.ts:89` | `missing` → per-order idempotent issuance; no new payment/order/ticket |

Changed production files: migrations 013 and 014; `OrderTrackingView.tsx`; `TakeawayPickupCard.tsx`; `src/features/orders/api-client.ts`; `src/features/customer/api-client.ts` (optional abort signal). Changed tests: `pickup-alias-migration.test.ts`, `payments.test.ts`, `api-clients.test.ts`; added `order-tracking-lifecycle.test.ts`, `pickup-status-render.test.ts`. No API envelope, database architecture, layout, or CSS redesign.

The public fallback still requires the same buyer authorization and can display order progress during a private pickup failure. It no longer implies that the private lookup succeeded: the code is cleared and the existing card displays a specific pending/retry message. At most five consecutive missing/private failures are attempted automatically; manual refresh/reconnect resets that budget. Both read requests have a 15-second deadline; a cycle with a fallback can take up to 30 seconds. Repeated total transport failures stop after three attempts. A terminal auth/not-found response stops automatic polling; explicit retry can recheck access. Unmounted requests cannot set state or schedule another timer.

## Tests

| Check | Result |
|---|---|
| Disposable PostgreSQL reproduction, rollback, CRLF, drift guard, ACL/RLS, idempotent issue/tracking | PASS — `tests/integration/payments/pickup-alias-migration.test.ts` |
| Pickup crypto unit tests | PASS — 5 tests |
| Pickup UI contract tests | PASS — 18 tests plus status rendering regression |
| Tracking lifecycle: missing credential, auth failure, bounded retries, dedup, unmount, reconnect, HTTP 429/503 | PASS — 8 tests |
| Complete integration suite | PASS — 17 files, 126 tests, about 259 seconds; includes table PIN/QR, order FIFO, migration, payment and pickup regressions |
| Local real HTTP lifecycle | PASS — `node tests/integration/payments/http-smoke.mjs`; authenticated buyer/owner requests, signed fixture webhook, ready → pickup → completed and log privacy |
| Full UI suite | PASS — 17 files, 226 tests |
| Auth and foundational DB scripts | PASS — `npm run test:auth` (46), `npm run test:db` (9) |
| Production payment webhook E2E | NOT RUN; no provider webhook was generated by this fix |
| `npm run build` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS on final worktree; earlier unrelated homepage `ReceiptCheck` error disappeared while other homepage work continued |

Executed: `npx vitest run --config tests/integration/vitest.config.mts` (126 PASS in 17 files); `npx vitest run --config tests/unit/vitest.config.mts` (128 PASS, final); `npx vitest run --config tests/ui/vitest.config.mts` (226 PASS). The expanded pickup/dine-in assertions separately passed with `-t '20 concurrent verified duplicate webhooks|mixed dine-in|pickup: GET pending'` (3 tests). The simultaneous tracking scenario also passed separately with `-t '100 simultaneous'`. `node tests/integration/payments/http-smoke.mjs` passed the full local HTTP lifecycle and removed its isolated users/fixtures/server. `npm run test:auth` passed 46 tests. Final `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed.

Sanitized local stress measurements are saved in [P4_HF02_LOCAL_STRESS.json](P4_HF02_LOCAL_STRESS.json); the HTTP state transitions and invariant counts are in [P4_HF02_LOCAL_HTTP_TRACE.json](P4_HF02_LOCAL_HTTP_TRACE.json). Older C04 artifacts were restored after their test-generated output was copied to this task's report directory.

### Requested regression matrix

| ID | Scenario | Evidence / result |
|---|---|---|
| T01 | Paid ready, valid guest and credential | PASS — exact legacy DB reproduction → 013 repair; real #006 recovery and user confirmation |
| T02 | Refresh/reconnect code stability | PASS — DB/service repeat reads and UI lifecycle tests |
| T03 | Concurrent requests and issuance | PASS — 20 same-order private reads return the original code without mutating its row; 20 concurrent webhook/ensure/recovery tests retain a unique credential and one issuance event |
| T04 | Before webhook / credential not ready | PASS — pending private GET returns null, does not issue; UI pending then recovery |
| T05 | Duplicate webhook | PASS — 20 signed fixture deliveries produce one ledger/ticket/credential |
| T06 | Wrong UUID, intent ID, invalid input | PASS — isolated DB probes plus existing order validation tests |
| T07 | Buyer A asks for buyer B | PASS — wrong browser hash/proof/scope denied; no metadata/code returned |
| T08 | Missing capability | PASS — SQL tracking probe without browser/proof denied |
| T09 | Unpaid/dine-in isolation | PASS — pending GET does not issue; direct private pickup service denies dine-in and its issuance context is null; owner type/eligibility checks remain enforced |
| T10 | Completed/consumed/expired | PASS — DB completion/expiry and real card rendering regressions |
| T11 | Paid ready without credential | PASS — trusted recovery plus before/after Production evidence; no ticket/status rewrite |
| T12 | Table PIN versus pickup namespace | PASS — pickup crypto domain-separation test and mixed dine-in/payment tests |
| T13 | Concurrent owner completion | PASS — 20 same-key and 20 different-key attempts, one transition/audit |
| T14 | Timeout/5xx/offline | PASS — adapter abort signals; fake-timer component lifecycle for network/429/503, three total retries then explicit retry; loading exits |
| T15 | Concurrent buyers | PASS — local 100 mixed DB acceptances (50 Takeaway), followed by 50 private tracking reads/reloads and scope isolation; signed fixture provider events only |

## Security and invariants

No RLS bypass, public RPC grant, client-side code generation, payment rewrite, ticket rewrite, status transition, or credential rotation was added. Credential issuance is unique by `order_id`, encrypted at rest, and idempotent under retries. Tracking exposes the decrypted code only after the existing guest capability checks. Completed orders do not return the code.

## Required deployment follow-up

Migrations 013 and 014 have been applied by the user. The final worker lookup succeeded. Production history was not rewritten by either migration. Before COMMIT, errors roll back atomically. After COMMIT, use a reviewed forward migration; do not drop pickup/payment tables, erase evidence, or restore the known-broken alias resolution. The timestamp column is nullable without a default, so its addition does not backfill/rewrite existing rows.

For a manual retest, use the same browser/origin that created the order (localhost and a tunnel origin have separate cookies), open its existing `/order/<UUID>` URL, and press refresh. Expect one stable six-digit code with leading zeros preserved. A different browser has no capability and must be denied. Do not complete or re-pay the real order merely for testing. Completed/expired/held orders intentionally do not disclose an active pickup code.

Remaining operational limits: no new live payOS payment was made; provider delivery, deployed hosting, production scheduler execution, and automatic realtime publishing were not revalidated. A scheduler must still call the authenticated reconciliation route for background recovery. These are not evidence of a remaining `ORDER_NOT_FOUND` defect. Local migration CLI history was inconsistent with the already-installed local schema, so 013 was applied directly to local PostgreSQL for testing; the fresh-chain regression independently applied all prior migrations in a disposable database without relying on that history. No migration-history repair was performed against Production.

## Definition of Done audit

- [x] Exact failing endpoint and root cause proven: supplied deployed function digest, three reproduced failed branches, repair and drift/rollback tests.
- [x] Authorized buyer can retrieve a six-digit code: real #006 recovery plus user confirmation; real local HTTP lifecycle and authorized DB/service tests.
- [x] Cross-buyer isolation: missing/wrong cookie, hash, proof and foreign order tests return denial without pickup data; service-only function ACL and table RLS verified.
- [x] Stable code and no duplicate ticket/credential: repeated/concurrent reads, 20 duplicate deliveries/recoveries and 50-buyer tracking assertions.
- [x] QR/table PIN/FIFO/payment/owner verification preserved: complete 126-test integration suite, crypto namespace test, local HTTP completion and replay/hold gates.
- [x] Loading/error can exit: 15-second per-request deadline; three total transport attempts, five pickup attempts, explicit retry/reconnect, stale-response and unmount tests.
- [x] Source fix, forward migrations, regression tests, sanitized artifacts and this report are present. No live payment E2E result is inferred from test fixtures.
