# P6-C02 admission / menu contract

Requires migration `20261024001700_capacity_admission_rate_limits.sql`. Existing Phase 3/4/5 routes, FIFO and payment ledger remain authoritative.

## Owner settings

`GET /api/owner/settings/ordering`, no query/body, authenticated owner only. Returns `ApiResponse<OrderingSettingsView>`:

```json
{"data":{"storeId":"<uuid>","version":15,"acceptingOrders":true,"acceptDineIn":true,"acceptTakeaway":false,"pausedAt":"2026-10-24T08:00:00Z","availability":[{"orderType":"dine_in","acceptingOrders":true},{"orderType":"takeaway","acceptingOrders":false,"reason":"manual_pause"}]},"error":null}
```

`PATCH /api/owner/settings/ordering`, `Content-Type: application/json`, exact same-origin `Origin`, authenticated owner. No caller-selected owner/store. Body:

```json
{"requestId":"<uuid>","expectedVersion":15,"acceptTakeaway":true}
```

At least one of `acceptingOrders`, `acceptDineIn`, `acceptTakeaway` is required, each a boolean. `acceptingOrders` is the legacy master switch: effective admission is master AND the selected type flag. The response has the same view as GET. Settings version is the store version; a concurrent menu edit can invalidate it. On `INVALID_STATE_TRANSITION` (409), refetch settings before an intentional new command. Retry an uncertain command with its original `requestId` and identical body. Replay returns its original result; GET provides the newest state. Reusing the key for a changed body returns `DUPLICATE_REQUEST_CONFLICT` (409). JSON validation is 400, unauthorized 401, forbidden 403, rate limiting 429. Settings responses/errors are `private, no-store`.

No ETA, automatic capacity threshold, pending-order count, refund or pause deadline is provided. `pausedAt` records the last API change that left at least one channel paused; it is metadata, not a guaranteed resume time. Legacy direct updates to the master switch remain compatible; they do not set this timestamp.

## Guest behavior

`GET /api/public/qr/:code` keeps its existing DTO; `store.acceptingOrders` now means effective availability for the scanned QR type. PIN verification returns this same effective flag. `GET /api/public/menu?qrCode=...` adds optional `orderingAvailability: { orderType: 'dine_in' | 'takeaway', acceptingOrders: boolean, reason?: 'manual_pause' }` to `MenuV1View`. Menu remains readable during a manual pause. These are observations; transaction-time checks remain authoritative.

`POST /api/public/orders` dispatches to the existing Dine-in or Takeaway backend. A paused channel returns `STORE_NOT_ACCEPTING_ORDERS` (409), without allocating an order/payment intent/ticket for the new command. This is the existing equivalent of `ORDERING_PAUSED`; this implementation does **not** emit `STORE_AT_CAPACITY`, `TEMPORARILY_UNAVAILABLE` or a fictitious retry interval. Do not generate a new command automatically to bypass the pause. Keep the cart and allow an explicit later revalidation.

An issued Takeaway intent can still be paid while paused. Valid signed callbacks keep the existing acceptance/expiry/reconciliation rules and assign FIFO only when verified. Pausing does not cancel pending intents, downgrade paid orders or stop fulfillment. Existing authenticated command replay is checked before new-admission gating. Late/extra/invalid money remains in the Phase 4 review flow; no automatic refund was added.

## Private menu revalidation

Successful menu GET has `Cache-Control: private, no-cache, must-revalidate`, `Vary: Cookie`, and a weak ETag scoped by store/menu revision/store version/order type. It deliberately excludes the volatile `serverTime`. The browser adapter uses `cache: 'no-cache'` only for public menu GET; the browser's private HTTP cache performs revalidation and supplies its cached body to Fetch after a network 304. Other private reads/commands retain `no-store`.

An exact `If-None-Match` validator receives a bodyless 304 **only after** QR activity, guest authorization and rate checks in PostgreSQL. Price, availability, option/category edits and owner pause change the validator. A custom client without an HTTP cache must retain its prior successful representation when sending a validator. 304 does not contain a new `serverTime`; errors carry `no-store` and are never negative-cached. No cross-instance memory cache or cached checkout price authority was added. Retired QR/expired credentials cannot bypass checks with an old ETag. Checkout always validates current menu/revision/amount in PostgreSQL.

## Failure / retry contract

- `RATE_LIMITED` → HTTP 429, Vietnamese message, `error.details.retryAfterSeconds`, header `Retry-After` with that interval; no client-generated ETA.
- `STORE_NOT_ACCEPTING_ORDERS` → HTTP 409, keep cart, no retry deadline.
- `PRICE_CHANGED` / `OUT_OF_STOCK` → HTTP 409; review current menu before a new intentional command.
- `INTERNAL_ERROR` → existing sanitized HTTP 500. A response timeout/5xx does not prove rollback: retry the **same** command key, then read authoritative state.
- Existing `PAYMENT_PROVIDER_UNAVAILABLE` / `PICKUP_CREDENTIAL_UNAVAILABLE` → HTTP 503 under existing payment/pickup contracts. No automatic payment retry with a new key.

Backend settings functions are in `src/server/settings/ordering.ts`. Gemini has connected `StoreAdmissionControlCard` through the owner adapter. It must reconcile the returned **effective** availability and preserve the exact request ID/body for uncertain retries. At the time of this review the card reads raw type flags and creates a fresh request ID on each click; these remain UI follow-ups. If the legacy master flag is false, merely setting a type flag true will not reopen ordering; the UI must represent the master state explicitly. Component ownership remains Gemini's.
