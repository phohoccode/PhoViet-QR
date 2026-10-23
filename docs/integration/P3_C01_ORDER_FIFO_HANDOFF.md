# P3-C01 — Dine-in order submission, idempotency and atomic FIFO

23/10/2026, Asia/Saigon. **P3-C01 STATUS: DONE (backend/local scope).** No Production migration executed; Production deployment and browser acceptance remain separate. Gemini owns all presentation files. This document describes actual exports and behavior, not the abbreviated DTO in the task's illustrative example.

## Integration entry points

```ts
import {
  submitCustomerOrder,
  getCustomerOrderTracking,
  getPrivateOrderTracking,
  OrderApiError,
} from '@/features/orders/api-client';
import type { CreateOrderV1Input, OrderDetail, PrivateOrderTrackingView } from '@contracts';
import type { CartResult, OrderDraft } from '@/features/cart';
```

Functions resolve **data directly**, not an ApiResponse envelope. They send credentials=include, cache=no-store; errors expose status/error.code/retryAfterSeconds through OrderApiError (alias of MenuApiError), network failure remains TypeError. No automatic retry, no mock fallback, no generated request ID in adapter. Please use these exports rather than maintaining another fetch/error/retry adapter in a component. Existing Gemini `components/customer/order/order-api.ts` was observed duplicating transport; Codex did not edit that owned file.

Gemini `docs/design/P3_G01_CONTRACT_REQUESTS.md` reviewed: CR-P3-01 keeps default OrderDetail versus private wrapper and real table.label; CR-P3-02 is covered by exact same-browser201 replay; CR-P3-03 remains disabled takeaway until Phase4. No new DTO/endpoint is needed for those requests. The UI handoff's proposed KDS is not a separate supported portal: owner processing remains the existing dashboard orders tab.

| Endpoint | Input / response | Status |
| --- | --- | --- |
| POST `/api/public/orders` | Strict CreateOrderV1Input → OrderDetail, dine-in only |201 new **and replay** |
| GET `/api/public/orders/:id` | UUID id, optional includePickup literal true/false → OrderDetail |200 |
| GET `/api/public/orders/:id?includePickup=true` | Creating browser's live session grant and buyer binding → `{order,pickup:null}` in this phase |200; another verified device can read default detail but receives403 for buyer-only projection |

No owner fallback in R05. Owner Auth cookie alone is not a guest grant. Unknown/duplicate query parameters or non-UUID path are400. No request body or URL credentials for GET.

Required request shape, illustrative UUIDs only:

```json
{
  "qrCode":"example-table-code",
  "clientRequestId":"c3010000-0000-4000-8000-000000000001",
  "menuRevision":"opaque-revision-from-R03",
  "items":[{
    "menuItemId":"c3010000-0000-4000-8000-000000000002",
    "quantity":2,
    "optionIds":[],
    "note":null
  }],
  "note":null
}
```

Do not send storeId/type/tableSessionId/price/total/status/ticket; they are rejected as unknown fields. All required nullable note fields must be present. Limit100 lines, quantity1–99,50 distinct optional additive option IDs/line, note500 characters; body64KiB, dedicated reader (Phase2 reader stays4KiB). UUIDs lowercased; option IDs sorted; trim notes and remove control characters using the same normalization as the cart. Meaningful line order is retained. No required/group/range option policy has been added.

API returns `{data:OrderDetail,error:null}` with canonical fields: id, storeId, type, tableSessionId, table{id,label}, status/statusLabel, ticketNo/serviceDate/acceptedAt, paymentStatus, fulfillmentStatus, totalVnd, itemCount, createdAt/updatedAt/version, lines, note, payment. Each line has immutable name/base price/options/unit price/quantity/line total/note. Payment is `{kind:'table_session',tableSessionId,intentId:null,intentStatus:null,status:'unpaid',statusLabel:'Chưa thanh toán',amountVnd,currency:'VND',updatedAt,reconciliationRequired:false}`. See canonical complete R04 example in API_CONTRACT_V1; implementation output is checked with `dineInOrderResponse` runtime schema and safe-integer arithmetic checks. No fabricated `tableLabel`/`items` response alias.

## Submit intent and UI state mapping

1. After user confirms fresh cart review, call prepareOrderDraft. Generate clientRequestId **once**, freeze normalized input/revision/key for that submit intent, and set submitting before sending. Double click must reuse pending promise/intent or remain disabled.
2. 201 confirms persisted accepted order. Read id/ticketNo/totalVnd from response; never increment a local ticket or calculate a replacement paid total. Clear cart only after confirmed201 accepted result/replay. Route `/order/:id` remains only a locator; the existing HttpOnly cookie is still required.
3. Network/timeout/500 is **uncertain**, not confirmation of failure or success. Keep immutable pending command and key; retry exactly it. A lost response can have committed. Changing cart/key before recovering the old intent risks two real orders. Adapter itself does not retry.
4. 409 PRICE_CHANGED/OUT_OF_STOCK means a new command was not accepted. Keep cart, refresh R01/R03, reconcile, show changed/unavailable lines and require user review. Only a newly confirmed changed intent receives a new key. DUPLICATE_REQUEST_CONFLICT requires restoring original pending payload, not retrying new payload under old key.
5. Preserve uncertain command across a navigation/reload only if the exact normalized payload can be restored. Phase2 cart storage intentionally omits note text. Do not silently persist user notes/PII in cart storage or reconstruct a different payload with the old key. If immutable replay persistence would store note text, obtain a privacy policy decision; RAM-only retry has a reload limit that UI must explain. Browser cookie must survive; knowing key/ID cannot recover another browser's order.

| UI state | Trigger / action |
| --- | --- |
| idle | Fresh draft ready to review; no POST yet |
| submitting | One immutable command in flight; disable double-submit |
| uncertain / retrying | Network/timeout/500; preserve intent/key, show safe retry, do not clear cart |
| accepted |201 data.status=accepted with persisted ticket; clear only this confirmed intent |
| validation_error |400 schema,422 option/arithmetic or409 stock/revision; preserve draft, require correction/review |
| session_expired |410, or403 SESSION_REQUIRED; disable submit, verify/contact owner as applicable; never invent a new session |
| network_error | Can display alongside uncertain state; no success toast/ticket and no new key |

Track by `getCustomerOrderTracking(id)` after accepted; manual refresh or bounded polling5–8s while visible/online, backoff up to30–60s on failures, obey429 Retry-After and stop automatic polling at terminal states. R05 limit60 reads/min/browser/order, no shared response cache. Realtime/subscriptions are not implemented. Closed/expired grant410 ends read access. Do not infer paid from fulfillment status; Phase5 will derive settlement and extend projection.

## Actual errors

Envelope `{data:null,error:{code,message,details?}}`; branch on code, not Vietnamese message.

| HTTP | Code / meaning |
| --- | --- |
|400 |VALIDATION_ERROR: wrong/extra fields, malformed JSON, invalid id/query, qty/note/line limits, body>64KiB |
|401 |UNAUTHORIZED: missing/malformed/expired browser cookie/context; POST does not bootstrap |
|403 |SESSION_REQUIRED: QR table has no matching verified grant; FORBIDDEN: origin, other browser replay, buyer-private projection |
|404 |INVALID_QR: unknown/inactive/retired QR or inactive table; ORDER_NOT_FOUND: missing/outside-session order |
|409 |SESSION_CHECKOUT_PENDING; STORE_NOT_ACCEPTING_ORDERS; OUT_OF_STOCK; PRICE_CHANGED; DUPLICATE_REQUEST_CONFLICT |
|409 |INVALID_STATE_TRANSITION + details.field=orderType for takeaway in this phase; **no order/ticket/payment is created** |
|410 |SESSION_EXPIRED: closed session, expired/revoked grant/code; replay cannot revive it |
|422 |VALIDATION_ERROR: unavailable/foreign option, server arithmetic overflow. Options remain optional/additive |
|429 |RATE_LIMITED + Retry-After and retryAfterSeconds; same authenticated replay bypasses new-create budget |
|500 |INTERNAL_ERROR sanitized, no stack/SQL/credential; retry immutable intent because commit outcome may be uncertain |

Check availability/option validity before stale revision. Zero-priced dine-in is valid under nonnegative menu money contract; takeaway/payment zero policy is outside this phase. No new error enum aliases such as SESSION_NOT_VERIFIED/IDEMPOTENCY_CONFLICT.

## Transaction, authorization and FIFO

New additive migration: `supabase/migrations/20261023000700_dine_in_orders_fifo.sql`;001–006 required first. Five tables: orders, order_items, ticket_counters, order_requests, order_events; reuses existing outbox_events. RLS enabled and no anon/authenticated table/RPC grants; only server service_role invokes invoker functions with search_path=pg_catalog. No service key in client.

One RPC `p3_order_execute` performs the complete transaction. No sequence of independent REST inserts. Browser verified from HttpOnly opaque cookie and hash/proof; current scope rechecked inside RPC under locks. Table A/browser cannot submit table B/store B. GET requires live grant for that order's session (other verified devices in the same session may read by contract); buyer-only projection also checks the creating browser/access binding.

Create locks command advisory(store/key) → store **FOR NO KEY UPDATE** → table SHARE → active QR SHARE → session UPDATE → browser/grant SHARE → rate bucket → counter/order. Store gate serializes with menu/settings mutations; QR is reread under lock after unlocked locator. Never treat preliminary lookup/helper RPC as an enduring grant. The session lock serializes checkout/close and creation. Replay validates original browser/access and live session but precedes current menuRevision/acceptingOrders/checkout write guards and new-create limiter. A closed/revoked/expired session cannot replay. Principal mismatch403; normalized payload mismatch409.

**Observed race and fix:** initial FOR UPDATE store gate could deadlock against session-close FK recheck: submit held store/waited session, close held session/waited KEY SHARE store. FOR NO KEY UPDATE still conflicts with menu/settings writers but permits FK KEY SHARE. Both close-first and submit-first real concurrent Postgres cases are regression tests. Future Phase5 close/settle must preserve documented ordering and avoid acquiring an earlier store/table lock after session; no claim of safety for arbitrary admin SQL that violates this order.

Server calculates price from active category/item/options in store, uses numeric intermediate arithmetic and bounds output to MAX_SAFE_INTEGER. All checks precede ticket/resource writes. One transaction allocates counter using INSERT ON CONFLICT UPDATE RETURNING, inserts accepted order + immutable item/option snapshots + replay result + two audit rows + two outbox invalidations. serviceDate uses DB acceptance timestamp in configured store timezone; acceptedAt UTC, counters unique(store,date), tickets unique(store,date,ticket). No MAX+1/client clocks/cache/random ticket/sequence. Counter increments roll back on failure; issued tickets are immutable and never reused after accepted order cancellation.

Deferred constraints prevent committing empty/mismatched header+line totals. History triggers prevent deleting orders or mutating acceptance/item snapshots. Same store/session/table and item FKs, quantity/price/check constraints, private grant/request binding and unique idempotency provide DB enforcement alongside API validation. Raw intent is not stored in audit/outbox; protected order_requests.result_json holds the private original command response for exact replay, including notes already in protected order snapshots. Audit contains only event/order/store/version metadata. Outbox payload only eventId,aggregateId,version,type; published_at remains null. No broadcast delivery claimed.

Create limit10 new commands/min/browser/store; tracking60/min/browser/order. Wi-Fi IP is not the primary bucket. Mutations enforce same-origin and SameSite cookie policy. Browser cookie retains Phase2 Secure/HttpOnly/host-only/Path=/ flags. Server reads code/grant expiry again after waiting for locks. Logs expose generic failure event only; no body/cookie/code.

## Migration/setup and remaining phase boundaries

- 007 applied and exercised on **local loopback Supabase only**, no production keys in tests. Do not rerun CREATE migration on an already applied schema. Whole file BEGIN/COMMIT, failure aborts all DDL; scratch test verifies successful migration ended ROLLBACK restores previous catalog/resource rows, then fresh001–007 with hosted-style grants.
- Production007 **NOT_APPLIED by Codex**. Review, back up and deploy through project's migration workflow; do not reset/seed Production to make a migration pass. No production data edited. Existing tables/QR/sessions and printed public codes are preserved.
- Env uses existing NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY server-only, APP_ORIGIN trusted ingress, existing session encryption config for R12. No new env secret/dependency/config changes.
- orders currently constrains type=dine_in, mandatory ticket/session/date; Phase4 must explicitly extend constraints/projections for pending takeaway before supporting its create path. It must reuse counters only on verified acceptance, not pending checkout.
- Phase5 settlement/payment projection absent: dine-in returns unpaid; do not claim an actual paid ledger. Existing owner table detail/order list projections from Phase2 remain incomplete for real bills and must be extended in the corresponding owner/session prompts. No owner claim/transition or session-close endpoint is added here.
- Owner next steps canonical R07 GET owner/orders, R08 POST owner/queue/claim-next, R09 POST owner/orders/:id/ready, R10 POST owner/orders/:id/complete. Must implement auth/tenant, FIFO head selection/no SKIP LOCKED, requestId/expectedVersion and audit/outbox; they are not available exports/endpoints in C01.

## Verification and files

Created backend: migration007; `src/lib/validations/orders.ts`; `src/server/orders/{database,service}.ts`; public orders POST/GET route files; `src/features/orders/api-client.ts`. Tests under `tests/unit/orders/**`, `tests/integration/orders/**`; this handoff. All UI/component/route pages/docs/design changes in working tree belong to Gemini and were preserved, not modified by Codex.

Final measured local evidence (23/10):

| Command | Actual result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts` |97/97 PASS,11 files, including7 C01 unit/fault tests |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts --disableConsoleIntercept` |74/74 PASS,9 files; final22:49–22:51 run includes all56 Phase2 cases and18 C01 integration/migration cases |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts tests/integration/orders --disableConsoleIntercept` |18/18 PASS,2 files; included again in full74-case run |
| `npm run test:auth` |46/46 PASS,7 files |
| `npm run test:db` |9/9 PASS,2 files |
| `node node_modules/vitest/vitest.mjs run --config tests/ui/vitest.config.mts` |88/88 PASS,6 files, including Gemini additions; unit scope, not browser acceptance |
| `python docs/contracts/validate_contracts.py` |PASS typed examples,6 negative type checks,21 canonical sections; static documentation validation |
| `node tests/integration/orders/http-smoke.mjs` |PASS; final22:49–22:50 run includes **Next production build with loopback-only env**, final fixture/rate cleanup |
| `npm run lint` |PASS0 errors/warnings at22:49–22:50 after Gemini fixed its in-progress files |
| `npm run typecheck` |PASS at22:47 |
| `git diff --check` |PASS |

HTTP covers owner setup → QR/open/verify → create/replay/tracking; guest/owner/outsider scopes; strict/CSRF/64KiB; stale revision/options; takeaway deny; discarded committed response body then replay; rate/cookie/privacy; checkout/close revoke. Test server and UUID-scoped fixtures cleaned up.

DB tests cover two-item options/96000 VND;20 simultaneous same-key retry responses identical/1 order/1 ticket;60 concurrent new orders across12 devices/two sessions with unique serialized tickets and acceptedAt order; stale menu-vs-submit; two stores/independent dates and timezone midnight; cross-tenant/QR/expired/revoked/closed/checkout denial; overflow/zero; grant/private projection; later-state GET vs original command replay. Forced errors both after ticket allocation and late outbox insertion roll back counter, order, lines, replay, audit and outbox. Fresh migration001–007 + precommit rollback + invoker service-role grants and immutable/deferred constraints are tested.

All five Vitest suites total **314 passing cases** (97 unit +74 integration +46 auth +9 DB +88 UI), with no failed cases in final checks. Latest60-order local burst: **0 errors,7545ms** total. These timings include REST/database contention on this local machine, not Production capacity. Browser visual acceptance and Production007 deployment **NOT_RUN**, no backend requirement blocked by missing local credentials. Optional groups/range policy and payment/settlement/realtime remain deliberately outside the frozen C01 scope.

Concurrency is tested against PostgreSQL/local Supabase, not inferred from mocks. Fault-unit tests cover sanitized transport errors only. Browser visual/checkout integration belongs to Gemini; source/test compilation alone does not prove responsive, focus, print or physical scan acceptance. No production capacity/SLA claim from the60-order burst.
