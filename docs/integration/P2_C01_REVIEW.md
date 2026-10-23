# P2-C01 CODEX — verification và review

23/10/2026 (Asia/Saigon). Backend QR/session/guest scope triển khai thực, không chỉnh UI. Bắt đầu worktree clean ở b05317a; Gemini P2-G01 tạo/sửa UI đồng thời. Không reset/rebase/cherry-pick/commit hoặc deploy remote.

## Scope và policy đã chốt

Đã đọc root specs, frozen contracts v1-draft, P1-C01/C02/C03 handoffs và P1_G03/P2_G01 handoffs xuất hiện trong phiên. Contract chính thức ưu tiên: R02 trả QRResolution, checkout_pending verify/read được; R12 cần requestId,201 private OwnerSessionOpenedView; R11 wrapper tables/detail; error không dùng tên mới ACTIVE_SESSION_EXISTS/NO_ACTIVE_TABLE_SESSION.

Người dùng đã chấp thuận Q5 cho **table sessions**: mã CSPRNG128-bit22ký tự,24giờ; guest tối đa12giờ; AES-256-GCM key server riêng cho replay cùng owner/request; mất key không khôi phục mã cũ, không API read/rotate. Không suy phê duyệt này sang pickup/payment credentials Phase4 hoặc Q6 settlement.

## Files backend/thay đổi

- `supabase/migrations/20261023000300_table_sessions_guest_access.sql`: 7bảng tăng dần, RLS deny direct guest/owner; same-store FK/unique live session; hash-only guest/code; encrypted private delivery, operation ledger, outbox, shared rate buckets. RPC/functions only service_role, scope recheck, lock/transaction, close trigger revoke/delete ciphertext.
- `supabase/seed.sql`: giữ store/ba bàn Phase1, thêm hai QR table/một takeaway random, không account/secrets, seed serialize/idempotent.
- `src/server/qr/service.ts`, `src/server/table-sessions/service.ts`: resolve/open/verify/list và helper Phase3; exports chính xác ở QR_HANDOFF.
- `src/server/security/{api,crypto,database,owner,request-context}.ts`: safe envelopes, strict Origin/JSON limit, keyring/AAD crypto, lazy service-role-only DB client, per-request Auth membership, cookie bundle.
- `src/lib/validations/table-sessions.ts`; 5routes R01/R02/R11/R12/R17 dưới src/app/api.
- `.env.example`: encryption keyring/currentID, canonical APP_ORIGIN, TRUST_PROXY_IP; không secret thật, không thay .env.local.
- `tests/unit/*`, `tests/integration/*`: crypto/validation/cookies, true local DB/races/scope/rate, fresh SQL migration, production HTTP smoke.
- `tests/db/http-smoke.mjs`: duy nhất điều chỉnh harness Codex Phase1 để nhận /q shell200 mới của Gemini nhưng invalid QR API404, order route vẫn404; thêm local service key override để tuyệt đối không dùng remote env khi chạy smoke. Không chỉnh UI để giữ assertion cũ /q404.
- `docs/integration/P2_C01_QR_HANDOFF.md`, `P2_C01_REVIEW.md`.

Không thêm dependency/đổi lockfile/scripts/package manager. Commands mới chạy bằng npm exec Vitest/Node có sẵn. Không orders/menu CRUD/cart/checkout/payment/webhook/FIFO/realtime publisher; outbox chỉ persist event metadata được contract R12 yêu cầu.

## Kết quả thực chạy

| Lệnh / check | Kết quả | Phạm vi chứng minh |
| --- | --- | --- |
| `npm.cmd run db:migrate` | PASS local | Migration003 apply trên DB có foundation001/privileges002; không drop bảng cũ |
| Fresh migration test | PASS | Tạo DB scratch riêng trong local PostgreSQL, minimal auth.users/auth.uid fixture, apply001/002/003 và kiểm11bảng RLS/RPC grants; xóa đúng scratch DB. Đây là fresh DDL smoke, không giả là Auth server mới |
| `npm.cmd run db:seed` hai lần | PASS | Ba bàn seed giữ nguyên; QR table2/takeaway1; no Auth user/membership/session secret |
| `npm.cmd exec -- vitest run --config tests/unit/vitest.config.mts` | PASS | 8tests: strict input, CSRF, size limit, CSPRNG, encryption/AAD/key rotation, cookie flags, safe errors |
| `npm.cmd exec -- vitest run --config tests/integration/vitest.config.mts` | PASS | 15tests/2files: Auth/PostgREST/PostgreSQL thật, service layer không mock DB |
| `node tests/integration/qr-http.mjs` | PASS | Next production build/server + real Auth cookies/RPC/routes; body/envelope/security assertions, no browser |
| `npm.cmd run test:auth` | PASS | 46test regression Phase1/bootstrap |
| `npm.cmd run test:db` | PASS | 9test regression Auth/RLS/owner bootstrap |
| `npm.cmd run test:http` | PASS sau sửa harness | Ban đầu FAIL do assumption Phase1 /q404 đã lỗi thời; đổi thành shell200 + invalid API404. Sau đó Auth/login/logout/refresh/nonmember/malicious role cases PASS |
| `npm.cmd exec -- vitest run --config tests/ui/vitest.config.mts` | PASS | 6fixture assertions của Gemini; không browser/visual acceptance |
| `npm.cmd run lint` | PASS | Ban đầu một unused output variable trong HTTP harness, đã sửa và chạy lại max-warnings0 |
| `npm.cmd run typecheck` | PASS | Next route typegen + strict tsc |
| `npm.cmd run build` | PASS | Production build hiện hữu; HTTP suite cũng build bằng local env/keyring trong process |
| Client bundle/boundary scan | PASS |0hits server-role key (local và .env hiện hữu), encryption env/password; components không import server modules |
| `git diff --check` | FAIL toàn worktree / PASS file Codex tracked | Whitespace trong OwnerHeader/ui-preview do thay đổi Gemini đồng thời; không sửa file ngoài ownership để làm check xanh |
| Remote migration/auth/session smoke | NOT_RUN | Prompt chỉ workspace/local; chưa apply003/keyring lên project đích, không nhận local PASS là remote PASS |
| Browser cookie enforcement/hydration/visual/load/SLA | NOT_RUN | HTTP cookie jar thủ công; không thể kết luận browser HTTPS/cross-domain hay load production từ suite này |

Migration003 được hoàn thiện qua nhiều vòng trong lúc triển khai; local functions/trigger/grants đã reconcile lại với source cuối, không reset/drop dữ liệu. Fresh migration suite vẫn apply nguyên SQL003 trên DB scratch từ đầu và PASS. Kiểm tra cuối:11bảng RLS, seed1store/3bàn/3QR;0session/guest_access/delivery/operation/Auth user còn lại từ fixture. Context/rate của mỗi suite mới có cleanup theo hash/UUID của chính lượt chạy; không xóa context bên ngoài suite.

HTTP smoke asserts: missing owner401, authenticated nonmember403, cross-store read/open404; public QR chưa verify không session; table/takeaway đúng mode; private201 open/replay cùng key khi race; conflict409; spoofed storeId400; Origin khác403; thiếu code/body lớn400; sai422, lần6 429 + Retry-After; hai device grant độc lập, reload giữ session; owner list không code/hash/artifact; checkout_pending verify200; close revokeall + delete delivery + verify/replay410. Captured logs không fixture email/password/sessioncode/cookie/access/refresh/admin key. Cookie HttpOnly/Secure/Lax/Path/host-only kiểm từ Set-Cookie; jar chuyển cookie thủ công.

DB integration thêm: one-live unique khi hai request keys khác; exact same-key result/cipher replay; khác actor trong cùng store403; owner/membership/QR/table scope; wrong expected session; grant expired/revoked, code expired, context expiry; nhiều phiên cùng browser không đè grant; same-store FK; anon và authenticated không SELECT bảng nhạy cảm hoặc EXECUTE generic RPC; success verify lặp không tính sai; close trigger cleanup; public resolve sau close không lộ phiên mới. TTL/rate settings kiểm từ DB/observed outcomes, không claim stress proof mọi race production.

## Security/upgrade và giới hạn

- Service-role có quyền rộng: chỉ server modules và RPC hẹp, không import vào components. RLS không bị mở anon để preview. `p2_execute` recheck owner_members để không tin body store/actor, cả khi handler đã verify Auth.
- Browser bundle raw token256-bit chỉ Cookie; DB context hash + per-session proof-derived token_hash, scope FK/TTL/revoke. DB read leak của browser_context_hash không đủ tạo grant proof/token. No plaintext sessionCode vào ledger/result/outbox/log.
- Lock operation→store→table cho open; share QR/table/session cho verify giữ tới commit. One-live includes checkout_pending, không auto reuse code. R11 grid/detail một snapshot SQL. Atomic close trigger chỉ nền revoke; chưa cung cấp close/settle endpoint hay quyết định Q6.
- Rate buckets Postgres share qua instances, browser+QR5sai/min, QR1000/IP+QR300 attempts/min, owner120reads/30writes, resolve60. Trusted IP chỉ ingress cấu hình; ceilings/60s windows cần tune pilot, không chống volumetric DDoS/khẳng định SLA. Operational expired bucket/context/cipher cleanup cần lịch vận hành; không purging op uniqueness trước lifecycle kết thúc.
- Current/old AES keyring phải đồng bộ instances và giữ đến delivery expiry; không ephemeral fallback khi thiếu key. Mất key không đọc code; không reset phiên/credential ngầm. .env.local của người dùng không sửa trong P2-C01; keyring cần cấu hình riêng trên target.
- Seed giữ public codes qua rerun; migrations additive. Admin remote phải áp dụng theo history. Không chạy lại CREATE foundation nếu bảng đã tồn tại; không dùng db:migrate --local để nhận remote đã migrate.
- Source/formatting một số route có thay đổi từ editor đồng thời, patch dự kiến không match đã dừng sửa những file đó và kiểm lại state; không override code/UI của Gemini. Protected baseline diff chỉ ghi nhận Gemini source mới; contracts/root/CSS/.env.local giữ nguyên.

## Gate và việc còn lại

P2-C01 backend local **DONE**: schema/session race, QR modes/privacy, owner scope, code/hash/cipher, scoped HttpOnly bundle, failed/old credential deny, shared rate limiter, seed, tests và handoff đủ cho integration. Không blocker backend local còn lại.

Production/visual acceptance **chưa đạt**: cần migration/env/keyring và smoke target; Gemini tách fallback demo/URL demoState khỏi production, nối real IDs và private code delivery theo UI_INTEGRATION_REQUEST trong [QR_HANDOFF](P2_C01_QR_HANDOFF.md). Code UI có thể hiển thị mock verified khi API lỗi nhưng backend tuyệt đối không cấp quyền; không nhận đây là UI authorization đã an toàn. CR-P2-01/02 về reload+429 đã đáp ứng, không sửa contracts.

Phase3 phải dùng helper và recheck scope/session dưới transaction khi tạo đơn, thay0-total projections bằng snapshots thật; không nối business trước gate tương ứng. Bước tiếp theo **P2-C02: public menu & owner CRUD**. Không tick root TASKS/nhận toàn Phase2 hoặc MVP hoàn thành.
