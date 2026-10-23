# P3-C02 — Owner FIFO queue, ready and complete

2026-10-23, Asia/Saigon. **P3-C02 STATUS: DONE (backend/local scope).** Production migration and Gemini browser acceptance have not been executed. No UI file was edited by Codex. Production data has not been changed.

## Integration contract

Canonical source: `docs/contracts/types.ts`, R07–R10 in `docs/contracts/API_CONTRACT_V1.md`. The frozen contract takes precedence over abbreviated examples in the task: `expectedVersion` and the complete discriminator are required; omit filters to mean all, never send the literal `all`.

```ts
import type {
  OrderSummary, OrderDetail, OwnerOrdersQuery, OwnerOrdersView,
  RequestCommand, OrderTransitionInput, CompleteOrderInput,
} from '@contracts';
import {
  getOwnerOrders, claimNextOrder, markOrderReady, completeOrder, MenuApiError,
} from '@/features/owner/api-client';

getOwnerOrders(query?: OwnerOrdersQuery): Promise<OwnerOrdersView>;
claimNextOrder(input: RequestCommand): Promise<OrderDetail | null>;
markOrderReady(id: string, input: OrderTransitionInput): Promise<OrderDetail>;
completeOrder(id: string, input: CompleteOrderInput): Promise<OrderDetail>;
```

Use `OrderDetail` and `OwnerOrdersView['counts']`; no separate `OwnerOrderDetail`/`OwnerQueueCounts` DTO was invented. Helpers resolve **data directly**, not the envelope. Browser transport sends credentials/include and no-store, has no mock fallback, generates no keys, and performs no automatic retry. `MenuApiError` exposes `status`, `error.code` and `retryAfterSeconds`; network failures propagate. Production/browser request timeout handling belongs to the caller; a lost response is uncertain.

Every endpoint requires a validated Supabase Auth user with owner membership. The server derives the store; do not submit `storeId`. Responses, including errors, use private/no-store headers. POST requires same-origin JSON, body <=4096 bytes, no query parameters, and strict bodies with no unknown fields.

| Endpoint | Input | Success envelope (HTTP 200, including replay) |
| --- | --- | --- |
| GET `/api/owner/orders` | Optional query below | `{data:OwnerOrdersView,error:null}` |
| POST `/api/owner/queue/claim-next` | `{requestId:UUID}` only | `{data:OrderDetail,error:null}` or `{data:null,error:null}` |
| POST `/api/owner/orders/:id/ready` | `{requestId:UUID,expectedVersion:positiveSafeInteger}` | `{data:OrderDetail,error:null}` |
| POST `/api/owner/orders/:id/complete` | `{requestId:UUID,expectedVersion:positiveSafeInteger,type:'dine_in'}` | `{data:OrderDetail,error:null}` |

Complete takeaway requires the canonical shape `{requestId,expectedVersion,type:'takeaway',pickupCode:string(1..64)}`, but is rejected with 409 INVALID_STATE_TRANSITION in Phase3. The service rejects this branch before sending the raw proof to the database. Dine-in rejects a pickupCode field. No paid/pickup verification is bypassed.

### List, detail and pagination

Optional `view=queue|exceptions|history` (default queue), `type=dine_in|takeaway`, `status`, `orderId=UUID`, `limit=1..100` (default50), `cursor` opaque string <=2048. Unknown/duplicate query fields, invalid UUIDs or meaningless view/status combinations return400.

| View | Allowed status filters | Sort |
| --- | --- | --- |
| queue | accepted, preparing, ready | serviceDate ASC, ticketNo ASC, id ASC; all service days |
| exceptions | pending_payment, payment_exception | createdAt DESC, id DESC |
| history | completed, cancelled | createdAt DESC, id DESC |

Queue includes only claim/fulfillment work. Phase3 schema allows dine-in orders only; takeaway/exceptions filters currently return empty lists. Counts always represent the **whole store**, independent of page/type/status filters. `paymentException` is currently0. Never reinterpret it as pending-payment count.

List rows are canonical `OrderSummary`, without lines, notes, pickup data or payment instructions. `orderId` selects one full canonical `OrderDetail` independently of filters/page; default detail is null. Missing/outside-store detail returns404 ORDER_NOT_FOUND. No owner buyer-private projection is exposed.

Page/counts/detail are read in one SQL statement/MVCC snapshot, without network N+1. Keyset cursor binds store/view/type/status and validates both encoding and sort key. Reuse it only with those same filters; changing filters requires starting without a cursor. Limit/detail selection may change. The token is navigation data, not an authorization credential or secret; membership/store constraints are always rechecked. Pagination is stable for unchanged rows, not an immutable snapshot across transitions: refresh from page1 after mutations/reconnect; dedupe IDs when appending.

Example empty list:

```json
{"data":{"storeId":"c3020000-0000-4000-8000-000000000001","orders":[],"detail":null,"counts":{"accepted":0,"preparing":0,"ready":0,"paymentException":0},"nextCursor":null,"updatedAt":"2026-10-23T16:00:00Z"},"error":null}
```

### Mutation examples

Claim request: `{"requestId":"c3020000-0000-4000-8000-000000000002"}`. No target order, date, type or filter is accepted. A full illustrative success (IDs are placeholders, not fixture credentials):

```json
{
  "data": {
    "id":"c3020000-0000-4000-8000-000000000003",
    "storeId":"c3020000-0000-4000-8000-000000000001",
    "type":"dine_in",
    "tableSessionId":"c3020000-0000-4000-8000-000000000004",
    "table":{"id":"c3020000-0000-4000-8000-000000000005","label":"Bàn 01"},
    "status":"preparing","statusLabel":"Đang làm","fulfillmentStatus":"preparing",
    "ticketNo":1,"serviceDate":"2026-10-23","acceptedAt":"2026-10-23T16:00:00Z",
    "paymentStatus":"unpaid","totalVnd":29000,"itemCount":1,
    "createdAt":"2026-10-23T16:00:00Z","updatedAt":"2026-10-23T16:00:01Z","version":2,
    "lines":[{"id":"c3020000-0000-4000-8000-000000000006","menuItemId":"c3020000-0000-4000-8000-000000000007","name":"Cà phê","baseUnitPriceVnd":29000,"options":[],"unitPriceVnd":29000,"quantity":1,"lineTotalVnd":29000,"note":null}],
    "note":null,
    "payment":{"kind":"table_session","tableSessionId":"c3020000-0000-4000-8000-000000000004","intentId":null,"intentStatus":null,"status":"unpaid","statusLabel":"Chưa thanh toán","amountVnd":29000,"currency":"VND","updatedAt":"2026-10-23T16:00:01Z","reconciliationRequired":false}
  },
  "error":null
}
```

Empty claim, HTTP200: `{"data":null,"error":null}`. This result is persisted: retry that key stays empty even if another order arrives.

Ready request: `{"requestId":"c3020000-0000-4000-8000-000000000008","expectedVersion":2}`. It returns the same full OrderDetail shape at status=ready, statusLabel=Sẵn sàng, fulfillmentStatus=ready, version3 and new DB updatedAt/payment.updatedAt. Complete uses a **new intent key**, e.g. `{"requestId":"c3020000-0000-4000-8000-000000000009","expectedVersion":3,"type":"dine_in"}`, returning status=completed, statusLabel=Đã giao, fulfillmentStatus=served, version4. Ticket, acceptance timestamp, money, lines, unpaid status and session remain unchanged. No separate claimedAt field was added; mutation updatedAt records this change.

## Transaction, FIFO and authorization

Apply `supabase/migrations/20261023000800_owner_order_queue.sql` **after001–007**, to the intended database using admin SQL access. It is one BEGIN/COMMIT transaction, additive: event actor/before/after columns, metadata constraint, list indexes and two service-role-only invoker functions. No existing table/QR/session/order data is edited. A failure rolls back catalog changes; the test also runs the migration with final ROLLBACK and checks restoration. Committed migration reversal is not an automatic down migration; retain audit data and use a reviewed forward migration if reversal is required.

Local008 was applied only to Docker database `supabase_db_qr-ordering-p1c02-local`, API127.0.0.1:15421. Both local function bodies match008; event constraints are validated; RPC config is search_path=pg_catalog and lock_timeout=3s. Production migration: **NOT_RUN**. Do not point loopback integration tests at Production or reset shared databases.

Owner API verifies Auth/membership; RPC independently rechecks membership and exposes EXECUTE only to service_role, never anon/authenticated/PUBLIC. Tenant/order scopes are enforced inside queries. SQL is invoker, with pinned search_path, no dynamic SQL and no browser-supplied actor/tenant. No sensitive SQL errors are returned/logged.

Mutation order: shared operation-key advisory reservation → prior replay lookup → owner write limiter → store FOR NO KEY UPDATE → membership recheck → session SHARE → order UPDATE lock. NO KEY UPDATE uses C01's same acceptance gate while allowing store FK KEY SHARE checks during session writes. There is no network I/O inside the transaction. Guest tracking's session→order order is preserved. Claim reads the oldest accepted locator, waits for its row lock, then rechecks it; if maintenance changed its state during the wait, it restarts at the head. **No SKIP LOCKED**, no type/date/client target priority, no client ticket allocation. Different keys may produce several preparing orders; fairness is at claim, not completion.

After transition, DB trigger increments version and monotonic updatedAt. Audit captures actor/status/version before/after (no notes/PII), with transactional outbox topics `order.preparing`, `order.ready`, `order.completed`. Outbox uses only eventId/aggregateId/version/type. Status/audit/outbox/operation result commit together; late failure rolls all back. Realtime is not implemented.

`operation_requests` shares existing store+requestId namespace with prior owner operations. Fingerprint includes action/order/version/type. Same actor + identical command replays the original full snapshot, even after later transitions, **before stale-version checks**; null also replays. Another actor using the key gets403; changed action/order/body gets409. Replays still require current Auth/membership. The command does not allocate tickets or close/settle sessions.

Lock waits are bounded at3s per lock acquisition; transport RPC timeout15s. PostgreSQL deadlock/lock timeout aborts transaction and returns sanitized500, with no automatic retry or new request key. This does not establish a Production latency SLA. The UI may back off and retry the **same** immutable command after an uncertain error. Future Phase4 must explicitly extend schema, projections and payment eligibility: current schema forbids takeaway/pending-payment orders; claim fails500 on any unsupported future accepted type rather than silently skipping an invalid head. Ready never accepts pending_payment because it requires preparing.

## Gemini actions and error handling

| UI action/state | Required behavior |
| --- | --- |
| Nhận đơn tiếp theo | Enable with owner access, no unresolved/in-flight claim, and known accepted work; server still decides the oldest order across all filters/days. Empty races are normal. Disable double click. |
| Đã làm xong | Only selected preparing order, no pending intent. Send its version from the latest DB detail. Whole order, not per-item tasks. |
| Đã phục vụ | Only selected ready dine-in order, after owner confirmation. Send type=dine_in and latest version. Completed does not mean paid. |
| loading/empty | Show real response; null claim is successful empty, never generate an order/ticket. |
| 401/403 | Stop writes/polling as appropriate; restore login/access. No mock fallback. |
| 404 | Clear inaccessible selection; refresh scoped list. |
| 409 INVALID_STATE_TRANSITION | Another tab may have acted; refetch list/detail. Do not silently change expectedVersion on an uncertain old intent. |
| 409 DUPLICATE_REQUEST_CONFLICT | Restore original payload/key; do not reuse key with changed content. |
| timeout/network/500 | Outcome uncertain; retain exact command/key and offer retry. Do not issue a second claim under a fresh key. |
| 429 | Obey Retry-After; owner limiter shared with existing owner APIs (read120/min, write30/min). |

All error envelopes are `{data:null,error:{code,message,details?}}`. 400 VALIDATION_ERROR covers malformed/extra fields, bad query/UUID/version/type, wrong content type and body limit. 401 UNAUTHORIZED means unauthenticated;403 FORBIDDEN covers owner membership, another actor's key or CSRF;404 ORDER_NOT_FOUND safely covers missing/outside-store targets;409 INVALID_STATE_TRANSITION covers wrong state/version/type/unsupported takeaway completion, and DUPLICATE_REQUEST_CONFLICT changed key payload;429 RATE_LIMITED includes Retry-After/details.retryAfterSeconds;500 INTERNAL_ERROR is sanitized. Frozen ApiErrorDetails has no current-order status/version field, so conflict reconciliation uses a refetch rather than an uncontracted error payload.

Generate one requestId per owner-confirmed intent; retain original id/order/version/type for retries. A **new** claim key means the owner wants to start another job, including after a confirmed empty result. Prevent a new claim while the previous outcome is uncertain. Snapshot replay may be older than the current DB state: refresh list/detail after recovery instead of forcing the replay into current UI state. No payment/pickup code persistence in local storage or logs.

No realtime subscriptions. Use manual refresh or one visible/online poll (e.g.5–8s), cancel/dedupe overlapping fetches, back off to30–60s after failures and honor429. Avoid parallel list/count/detail fetches and dependency loops: one R07 response already contains counts and optional detail. Pause when hidden/offline; refresh from page1 after mutation/filter changes. Guest R05 already reads preparing/ready/completed from DB with its verified same-session grant; no guest authorization was widened.

## Files and actual validation

Changed/added for C02:

- `supabase/migrations/20261023000800_owner_order_queue.sql`
- `src/app/api/owner/orders/route.ts`, `[id]/ready/route.ts`, `[id]/complete/route.ts`
- `src/app/api/owner/queue/claim-next/route.ts`
- `src/server/orders/owner-database.ts`, `owner-service.ts`, existing `database.ts` error wording
- `src/lib/validations/owner-orders.ts`, existing `orders.ts` shared summary validation
- `src/features/owner/api-client.ts`
- `tests/integration/orders/owner-queue.test.ts`, existing `migration.test.ts`, `http-smoke.mjs`
- `tests/unit/orders/owner-orders.test.ts` and this handoff

| Command/check | Actual result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts` | PASS100 |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts` | PASS87, real local PostgreSQL/REST,112.98s |
| Targeted owner-queue integration after final stronger assertions | PASS13,20.76s |
| `npm run test:auth` | PASS46 |
| `npm run test:db` | PASS9 |
| `node node_modules/vitest/vitest.mjs run --config tests/ui/vitest.config.mts` | PASS88 existing UI contract tests; not Gemini P3-G02 browser acceptance |
| `python docs/contracts/validate_contracts.py` | PASS typed examples/negative types/static contract checks |
| `npm run typecheck` | PASS |
| `node tests/integration/orders/http-smoke.mjs` | PASS real Next production build + HTTP owner/customer scenarios, loopback env only; fixtures/server cleaned |
| Targeted ESLint for backend/owner adapter/order tests | PASS0 warnings/errors |
| `npm run lint` | FAIL at final observed workspace state:4 react-hooks/exhaustive-deps warnings in Gemini-owned `components/customer/ItemDetailSheet.tsx:95`, `components/customer/cart/CartSheet.tsx:119`, `components/customer/cart/EditCartItemDialog.tsx:74`, `components/owner/menu/OwnerCategoryDialog.tsx:78`; all concern handleAnimatedClose. No backend warning. Codex preserved concurrent UI edits. |
| Production migration, hosted API smoke, P3-G02 visual/browser acceptance | NOT_RUN |

Total suite results:330 PASS (100+87+46+9+88), plus separate HTTP/static checks. Tests include: five-order sequence;20 same-key/16 distinct concurrent DB claims; global FIFO over service days; history/queue keyset pagination; whole-store counts and independent detail; cross-store404/nonmember403/missing-auth401 via HTTP; wrong states/stale tabs;10 same-key ready/complete retries; immutable replay after later state changes; rollback after late outbox failure; empty replay after new work; locked head not skipped; cancelled head re-read; C01 acceptance shared gate; session/guest locking;3s lock timeout; deliberately injected inverse-lock deadlock (verified SQLSTATE40P01), clean rollback then same-key recovery;12 concurrent HTTP claim retries; discarded committed HTTP response recovery; guest current state with unchanged isolation; no paid/session-close side effect; pickup refusal and schema rejection of pending/ticketless takeaway. Pending-payment takeaway business flow is not simulated as though implemented: schema currently rejects it, Phase4 owns that extension.

No contract gap blocks this backend scope. Global lint warnings need Gemini's correction. No payment adapter, webhook, cancellation/refund, settlement/session close, separate staff/KDS dashboard, UI theme change, realtime delivery or Production deployment was implemented.
