# P5-C01 session billing contract

Implemented backend contract, 24 October 2026. This supersedes the draft R13 request examples. UI integration belongs to Gemini. No separate checkout/cancel routes are introduced: the existing R13 action contract is used.

| Method | Route | Authorization | Result |
|---|---|---|---|
| GET | `/api/public/table-sessions/current/bill?qrCode=<publicCode>` | Existing HttpOnly guest cookie + active grant/proof for the current session of that QR | `ApiSuccess<TableBillView>` |
| GET | `/api/public/table-sessions/bill?qrCode=<publicCode>` | Identical handler; compatibility with the parallel Gemini hook | Same `TableBillView` |
| GET | `/api/owner/table-sessions/:id/bill` | Supabase Auth + owner membership of the session store | `ApiSuccess<TableBillView>`; includes closed history |
| POST | `/api/owner/table-sessions/:id/settle` | Same owner checks, exact Origin, JSON <=4KiB, no query | `ApiSuccess<SessionSettlementResult>` |
| POST | `/api/public/orders` | Existing dine-in capability, menu/cart validators | Existing `OrderDetail`; every add-on has its own ticket |

All responses are private/no-store, Vary Cookie/Origin; errors use `{data:null,error:{code,message,details?}}`. Guest bill query accepts only one `qrCode`. No client session/store/owner ID, total, discount or paid amount is accepted. The guest cookie can hold several independent grants, so `qrCode` is required to select the correct table. A fixed QR is a locator and never grants access to a newly opened session.

Types are exported from `docs/contracts/types.ts` (`@contracts`): `TableBillView`, `SettleSessionInput`, `SessionSettlementResult`, `SettlementView`. `TableBillView` contains:

```ts
{
  table: { id, label },
  session: { id, status, openedAt, closedAt, orderCount, totalVnd, paymentStatus, version, pinState? },
  orders: DineInOrderDetail[], // canonical OrderDetail: .id, .ticketNo, .lines, .status, .version
  totalVnd, billVersion, outstandingOrders,
  canAcceptMoreOrders, canSettle,
  settledAt: string | null,
  paymentMethod: 'cash' | 'bank_transfer' | null
}
```

Each line has `name`, `quantity`, `baseUnitPriceVnd`, `unitPriceVnd`, `lineTotalVnd`, and `options: {menuOptionId,name,priceDeltaVnd}[]`. These are immutable committed snapshots. Cancelled orders and their lines remain visible but contribute zero to the payable session total. No item/order cancellation API is added. There is no implicit refund or discount.

`outstandingOrders` counts noncancelled orders whose status is not `completed`. Begin checkout is allowed with outstanding orders; final confirmation is blocked until all are served. `canSettle` also requires an active checkout snapshot whose financial content still matches. A financial change during checkout requires cancel followed by a fresh begin. Zero-VND empty sessions may settle under existing Q6 policy.

Use `session.version` for `expectedVersion` and `billVersion` for `expectedBillVersion`. The financial revision changes when orders or their payable/cancelled content change. Fulfillment changes do not change it. Prices, names and options changed in today's menu do not change an existing order or bill.

POST examples (UUID placeholders must be replaced):

```json
{"requestId":"<uuid>","action":"begin_checkout","expectedVersion":1,"expectedBillVersion":"<32 lowercase hex chars from GET>"}
```

```json
{"requestId":"<uuid>","action":"cancel_checkout","expectedVersion":2}
```

```json
{"requestId":"<uuid>","action":"confirm_received","expectedVersion":2,"expectedBillVersion":"<32 lowercase hex chars from GET>","paymentMethod":"bank_transfer","receivedConfirmed":true}
```

`bank_transfer` retains the canonical repository spelling and means **manual transfer checked by the owner**, equivalent to the prompt's illustrative `bank_transfer_manual`. The API does not accept that alternate spelling. `cash` also requires `receivedConfirmed:true`. The owner must explicitly acknowledge the money was actually received; selecting a method or seeing a screenshot is insufficient. This is a manual owner attestation stored with actor/time/request; it is not bank verification. No provider call, takeaway intent or webhook is involved.

Each successful command returns:

```ts
{ detail: TableSessionDetail, bill: TableBillView, settlement: SettlementView | null }
```

Begin/cancel have `settlement:null`. Confirm has a successful settlement and a closed, paid bill. `detail.orders` contains canonical summaries; `bill.orders` contains full details. Dine-in order paymentStatus/payment.status are derived from the successful session settlement; settlement increments order versions and writes invalidations without changing tickets or fulfillment statuses.

| HTTP | Code | UI handling |
|---|---|---|
| 400 | VALIDATION_ERROR | Strict schema, unsupported method/amount/discount, missing acknowledgement/version; correct the command |
| 401 | UNAUTHORIZED | Owner login missing or guest cookie/browser expired |
| 403 | FORBIDDEN / SESSION_REQUIRED | Owner membership/Origin denied, or QR's current session has no matching guest grant |
| 404 | RESOURCE_NOT_FOUND | Missing or outside-store owner session; no bill returned |
| 409 | BILL_CHANGED | Refetch; if prepared financial content changed, cancel then begin with explicit review |
| 409 | SESSION_ORDERS_OUTSTANDING | Show remaining order count/statuses from GET; serve them before confirmation |
| 409 | INVALID_STATE_TRANSITION | Stale session version, wrong state or closed session; refetch |
| 409 | DUPLICATE_REQUEST_CONFLICT | Restore original command; do not silently generate another UUID |
| 409 | SESSION_CHECKOUT_PENDING | Existing create-order API refuses new add-ons |
| 410 | SESSION_EXPIRED | Expired/revoked guest grant, or existing create-order API after session close |
| 429 | RATE_LIMITED | Follow Retry-After; keep command ID |
| 500 | INTERNAL_ERROR | Commit outcome unknown; retry the exact same payload/key, then GET owner bill |

Successful commands are idempotent by store/requestId, actor, action, target, versions, method and acknowledgement. Same key and same payload returns the original command result, even after a later transition. A replayed begin response can therefore be historical: refetch before the next action. Same key with a changed payload conflicts. New confirmation keys after close are rejected. Owner authorization is rechecked before replay.

Browser adapters:

- `fetchPublicSessionBill(qrCode)` in customer api-client.
- `fetchOwnerSessionBill(sessionId)` and `settleOwnerSession(sessionId,input)` in owner api-client.
- Existing `createCustomerOrder` / POST orders flow remains the add-on path; reuse cart snapshot/revision/retry behavior.

UI must refetch after each command, online/visibility recovery, and on private invalidation. Outbox topics are `table_session.updated`, `table_session.closed`, `order.payment_updated`; payloads contain only eventId/aggregateId/version/type. There is no private realtime publisher in the current repository, so polling/manual refetch remains necessary. DB settlement success does not depend on realtime delivery.

There is no `needs_cleaning` table state in the repository. Closing removes the live-session association, making the table vacant. Reopening creates a fresh session/PIN/capability. Old browser grants remain revoked. PIN/pickup credentials, actor IDs and auth tokens never appear in guest bills.

## P5-C02 integration acceptance notes

Backend checks use real isolated local PostgreSQL/Auth/HTTP; signed provider fixtures and normalized post-verification DB events are test evidence, not real transfers. See `docs/handoffs/P5_C02_CODEX_DINEIN_SETTLEMENT_QA_REPORT.md` for the 18-case matrix and remaining UI handoff findings.

- `billVersion` is a 32-character hexadecimal financial digest; `session.version` is a positive integer. Cancel requires the latter. They are not interchangeable.
- `SESSION_ORDERS_OUTSTANDING` is HTTP409, not 400. Interpret machine codes before a generic conflict message.
- Following an ambiguous financial response, GET the owner bill before another action and keep the **entire original command**, including method, versions and request ID, for any retry. Keep it across sheet unmount/reopen; refs inside an unmounted sheet do not survive. A changed command needs deliberate recovery after checking authoritative state.
- A replay returns the historical command snapshot. A fresh GET after it must take precedence; a locally stored command bill must not permanently shadow newer server results.
- A missing callback or an empty adapter result is not server confirmation of checkout/payment. Do not synthesize paid/closed timestamps locally.
- HF01 supersedes the original closed-read restriction: closing still revokes ordering grants, while authorized guests keep a separate read-only capability for the immutable final receipt (default48h). Bill GET transitions to the receipt. See [P5_CLOSED_SESSION_RECEIPTS.md](P5_CLOSED_SESSION_RECEIPTS.md) for historical scope, compatibility, routes, errors and Gemini synchronization handoff. A cached bill alone never proves paid.
- Passing fixture-only UI tests does not establish browser recovery or full Phase5 acceptance. Backend local PASS and integrated NOT_READY are separate gates.
