# P2-HF01 — six-digit table PIN

2026-10-24. **P2-HF01 STATUS: DONE (backend/local scope).** Production SQL has NOT been executed. Gemini owns UI/components/pages/styles; Codex has not edited those files. Browser/visual acceptance remains separate.

## Actual UI integration contract

```ts
import type { OwnerTablePinView, RotateTablePinInput, OwnerSessionOpenedView } from '@contracts';
import { openOwnerTableSession, revealOwnerTablePin, rotateOwnerTablePin, MenuApiError } from '@/features/owner/api-client';
// Data directly, NOT the envelope. All send credentials/include and no-store.
openOwnerTableSession(tableId, {requestId}); // -> OwnerSessionOpenedView
revealOwnerTablePin(sessionId); // -> OwnerTablePinView
rotateOwnerTablePin(sessionId, {requestId, expectedVersion, confirm:true}); // -> OwnerTablePinView
```

**Reveal/rotate use table.session.id, not table.id.** Read `expectedVersion` from the latest session.version. No client storeId, actorId, PIN, generation or total is accepted in these commands. Owner endpoints derive store from Supabase Auth/membership, rechecked inside service-only RPC.

| Action | Wire request | Response |
| --- | --- | --- |
| Existing open | POST `/api/owner/tables/:tableId/sessions`, `{requestId:UUID}` |201 `{data:OwnerSessionOpenedView,error:null}`. `sessionCredential.sessionCode` is now exactly6 digits; also pinFormat=numeric_6,generation,issuedAt,expiresAt. |
| Deliberate reveal click | POST `/api/owner/table-sessions/:sessionId/pin/reveal`, `{}` |200 `{data:OwnerTablePinView,error:null}` |
| Convert legacy / rotate after confirmation | POST `/api/owner/table-sessions/:sessionId/pin/rotate`, `{requestId:UUID,expectedVersion:positiveSafeInteger,confirm:true}` |200 same private view |
| Existing guest verify | POST `/api/public/table-sessions/verify`, `{qrCode,sessionCode:"000042"}` |200 QRResolution envelope, no PIN; existing HttpOnly guest cookie transport |

OwnerTablePinView contains `sessionId,sessionVersion,pin,pinFormat:'numeric_6',generation,issuedAt,expiresAt`. `pin` is canonical for the two new owner responses; open/guest keep `sessionCode` for compatibility. No input `pin` alias; no silent path change. Owner open field additions are optional in TypeScript to preserve old preview fixtures; actual new backend always returns them.

Public verify strictly accepts6 ASCII digits as a string; preserve leading zeros. Five/seven characters, letters, whitespace and long legacy codes→400 VALIDATION_ERROR. Correctly shaped wrong PIN→422 INVALID_SESSION_CODE, no hash/secret details. No active/expired/closed session→410 SESSION_EXPIRED; checkout_pending→409 SESSION_CHECKOUT_PENDING. QR Takeaway remains direct menu, no PIN. Never send PIN to order/cart/queue APIs.

Owner errors use `{data:null,error:{code,message,details?}}`:400 VALIDATION_ERROR shape/UUID/extra fields/body/query;401 UNAUTHORIZED;403 FORBIDDEN membership/CSRF;404 RESOURCE_NOT_FOUND missing/outside-store;409 INVALID_STATE_TRANSITION legacy reveal/stale version/superseded replay, DUPLICATE_REQUEST_CONFLICT changed payload under old key, SESSION_CHECKOUT_PENDING;410 SESSION_EXPIRED;429 RATE_LIMITED plus Retry-After;500 INTERNAL_ERROR sanitized DB/config/crypto failure.

## State, retry and presentation

Ordinary GET tables has only safe optional `session.pinState:legacy|active|expired`, no PIN/ciphertext. Use session.status separately: checkout_pending/closed disables new verify/reveal/rotate. Legacy means explicit owner conversion is required; no silent conversion or close/reopen. Existing verified devices retain grant access while legacy is unconverted. Long codes are no longer accepted by the new public input contract.

Rotate confirmation must explain: **PIN cũ hết hiệu lực; thiết bị đã xác minh vẫn giữ quyền truy cập.** It retains sessionId, expiry, orders and ticket numbers. There is no new revoke-all endpoint. New PIN differs from the current PIN. A new session uses a fresh random PIN, nonce and session-bound context.

Generate one requestId per confirmed rotate/open intent, disable double-click, freeze expectedVersion, retry the same body/key after timeout. Same key replays that committed generation only; after a subsequent rotation, old key→409, never an obsolete PIN. Different keys at the same expectedVersion yield one winner and one409. Refetch on409; do not silently replace version and execute another rotation. Reveals are deliberate audited reads, no prefetch/polling. A network response can arrive after another transaction: response reflects the generation valid at its transaction's linearization point, not a guarantee it stays current forever.

Clear guest PIN input on success; never store PIN in localStorage/sessionStorage, URL, downloaded QR, SSR HTML/meta, logs/error telemetry, or analytics. Owner secret should remain only in the deliberately opened private dialog and be cleared when dismissed. QR SVG/PNG URLs continue to encode public QR code only. Runtime browser behavior remains Gemini's ownership and must be validated separately.

## Storage and deployment

Migration `supabase/migrations/20261024000900_six_digit_table_pin.sql` is additive, BEGIN/COMMIT, applied after001–008. It preserves all existing sessions/grants/orders/QRs; legacy rows get pin_generation=0 and nullable metadata. Explicit rotate changes the existing code_hash to HMAC, stores encrypted artifact, increments generation/version, and writes audit/outbox/idempotency in one transaction. It never revokes current grants. Closing a session retains the existing trigger's revoke-all and deletes ciphertext. No plaintext PIN column or operation/audit/outbox value is stored.

Reuse `session_code_deliveries` for AES-256-GCM (12-byte random IV,16-byte tag), AAD store/table/session/generation. Reuse code_hash for HMAC-SHA256 verifier bound to store/session/generation/PIN, with **separate** server pepper. Existing constant-work64-character comparison is used under session lock. New nullable pin_key_id/pin_issued_at and generation0 distinguish legacy. A service-only table_pin_audit_log records PIN_REVEALED/PIN_ROTATED with actor/session/generation, not value.

Server env (never NEXT_PUBLIC, never commit real bytes):

- `TABLE_SESSION_ENCRYPTION_KEYS`: existing JSON keyring `{ "v1": "<canonical base64 of32 CSPRNG bytes>" }`, used for AES.
- `TABLE_SESSION_ACTIVE_KEY_ID=v1`.
- `TABLE_PIN_HMAC_KEYS`: separate JSON pepper ring, same32-byte canonical-base64 format; do not reuse AES bytes.
- `TABLE_PIN_ACTIVE_HMAC_KEY_ID=v1`.

`src/instrumentation.ts` validates active keys during Node server startup, covering hosted Next workers and next dev/start. Each crypto operation also validates keys. Missing/corrupt keys fail closed; there is no ephemeral runtime fallback. Real Next startup probe with missing active pepper produced instrumentation failure and HTTP500 (Next process remained alive and the test stopped it); deployment readiness must require successful HTTP responses, not merely a live PID. Development `.env.local` received a new random HMAC key without printing it; `git check-ignore .env.local` confirms it stays ignored. Production secret configuration was not changed.

All instances must use the same rings. Rotation: distribute old+new keys to every instance, then switch active IDs; retain old pepper keys while existing PIN sessions reference them, old AES keys while current encrypted artifacts reference them, and retain legacy AES keys until legacy sessions are converted/closed. Rotate sessions explicitly to move them to new active keys. Lost pepper blocks verification of affected PINs; lost AES key blocks reveal/rotation of active PIN sessions because different-PIN comparison needs decryption. Restore keys from the secret manager; do not silently reset PINs or store plaintext. Legacy conversion does not need the old long-code plaintext/artifact.

Migration preflight checks the exact LF-normalized installed p2_execute, p2_session_guard and p2_session_view fingerprints and invoker/search_path metadata. It fails closed on unknown drift, no guard removal. Existing resolver/guest reader is retained verbatim behind the guarded compatibility wrapper; old open/verify actions fail closed so old app instances cannot create long codes or verify plain hashes. Deploy migration+new app+shared keys in a coordinated window; old open/verify calls temporarily fail until all instances run new code. Do not retry009 after partial manual DDL; inspect migration state first. Transaction rollback is tested; no destructive reset/down migration is provided for a committed rollout.

RPC lock order uses owner command reservation→owner limiter→store gate→table→session; public path store KEY SHARE→table→QR→session→rate/grant. This prevents audit/FK parent locks from inverting lifecycle writers. Rotate UPDATE and reveal SHARE serialize with close; no network inside SQL transaction. Two-step public locator returns only internal context to the server; final verify rechecks QR/table/session/generation under locks before HMAC comparison/grant insert. The PIN never goes to SQL as plaintext. No new browser-accessible RPC grant is added.

Durable Postgres limits, shared by all instances: device+QR5 verification requests/10s; existing wrong guesses/device+QR5/min; trusted IP+QR10/10s and30/min; aggregate QR20/10s and60/min. Return429 with bounded Retry-After. Different tables/devices on shared Wi-Fi have separate primary buckets; aggregate table ceiling is deliberate protection against cookie/IP churn, not a whole-store ban. Forwarded IP is trusted only when VERCEL=1 or TRUST_PROXY_IP=true behind ingress that overwrites X-Forwarded-For; otherwise browser source+QR and aggregate QR limits still apply. Never enable trust for client-controlled headers.

Guest token is still32 random bytes, host-only HttpOnly cookie (`__Host-qr_guest`+Secure in production), SameSite=Lax, path=/; browser mapping30d and session grant at most12h/original session expiry24h. Cookie is set in existing public verify handler only after DB response; failed attempts can receive an unprivileged browser cookie to retain their limiter identity. Orders still require live scoped grant, not PIN.

## Verification

| Command/check | Actual result |
| --- | --- |
| `npm run lint` | PASS,0 errors/warnings across current repo |
| `npm run typecheck` | PASS |
| `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts` | PASS105 |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts` | PASS95, real local PostgreSQL/REST,148.33s |
| Targeted PIN+009 migration tests after final preflight/ACL changes | PASS8; then PIN tests after uppercase-UUID crypto fix PASS7 |
| QR/session + lifecycle + Phase2 flow tests after limiter-fixture cleanup | PASS31 |
| `npm run test:auth` | PASS46 |
| `npm run test:db` | PASS9 |
| `node node_modules/vitest/vitest.mjs run --config tests/ui/vitest.config.mts` | PASS119 (includes concurrent Gemini tests); unit/contract evidence, not browser acceptance |
| `python docs/contracts/validate_contracts.py` | PASS typed examples, negative type cases, six-digit private open example |
| `node tests/integration/qr-http.mjs` | PASS production build + real Auth cookie HTTP, reveal/rotate auth/CSRF/no-store,8 same-key rotations, old PIN invalidation, existing cookie continuity, closed/checkout denial, malformed inputs, Retry-After and captured-log privacy |
| `node tests/integration/orders/http-smoke.mjs` | PASS production build + actual PIN verify→dine-in order→FIFO claim/ready/complete→guest tracking, lost-response and replay handling |
| `node tests/integration/table-qr-http.mjs` | PASS production build + owner table/QR lifecycle, active-session guards, verify, rate, trusted QR URLs and log privacy |
| Missing-pepper real Next production-start probe | PASS: instrumentation error and HTTP500, test process cleaned |
| Local catalog/body check | All five009 function bodies match file;0 unvalidated PIN constraints; legacy resolver retained; browser roles denied ciphertext/audit/RPC access |

Total existing suites:374 PASS (105+95+46+9+119), plus separate HTTP/static/startup checks. New DB tests cover leading-zero PIN000042; contextual HMAC and correct GCM IV/tag; secret-free list/public projections; full legacy order→convert→FIFO→ready→complete with unchanged unpaid/payment/session;20 same-key rotations once; different-key stale owner tabs; superseded replay rejected; shared-WiFi/device/IP/table burst limits; close versus reveal lock race; expired/closed access denial; injected late-outbox rollback of verifier/ciphertext/version/audit/idempotency; fresh009 application and intentional ROLLBACK; fail-closed baseline drift; preserved legacy rows/grants. Final uppercase UUID tests prevent case differences in AES AAD from committing an undecryptable PIN.

Production migration/API smoke and Gemini browser/visual acceptance: NOT_RUN. No Production table/QR/session/order data changed.

UI integration review notes for Gemini (observed source, not edited by Codex): use the typed adapter exports above; retain both requestId and expectedVersion across uncertain retries for legacy conversion as well as rotation; consume returned sessionVersion/refetch parent table after successful rotation; clear guest input explicitly if the verified card stays mounted; remove any production fallback that fabricates a PIN when no session exists. The concurrent UI currently contains a preview fallback in TableSessionDialog and a migration branch generating a fresh key per invocation; these are UI acceptance items, not backend success evidence. Existing HTTP tests intentionally exercise actual backend endpoints without preview data.

## Files owned by this hotfix

Migration009; src/server/table-sessions/{service,pin-service,pin-database,pin-crypto}.ts; src/lib/validations/table-sessions.ts; owner session PIN API routes; existing owner session-open route headers; src/features/owner/api-client.ts; src/instrumentation.ts; shared src/server/security/crypto.ts artifact validation; .env.example; docs/contracts/** updates; backend/integration tests and this handoff. The shared security helper and instrumentation/adapter are the actual repository equivalents of the task's security/startup paths. No UI/component/page/style/docs/design edit by Codex.
