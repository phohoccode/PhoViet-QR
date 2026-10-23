# P1-C03 CODEX: DONE

23/10/2026 (Asia/Saigon). Backend/integration foundation đã được kiểm kê và kiểm thử local. Readiness là sẵn sàng bắt đầu Phase2 theo contract, không phải MVP/remote/visual acceptance. Không thêm QR/menu/order/FIFO/payment API.

## Inventory và ownership

Bắt đầu worktree clean ở commit cb42d85 (sau c0ea9ac/a3f4bb0); không reset/rebase/cherry-pick/stage/commit. Npm10.9.2, Node22.13.1, lockfileVersion3. Next16.4.2, React/DOM19.3.1, Tailwind/PostCSS4.3.3, TS5.9.3, ESLint9.39.5, Zod4.6.7, Supabase JS2.118.0/SSR0.12.7, CLI2.121.0, Vitest5.0.5.

Đã đối chiếu root README/PRD/ARCHITECTURE/UI/PLAN/TASKS, bộ contracts và P1-C01/C02 handoffs với source thực tế. C02 có server actions, verified membership, server layout guard, refresh utility, four-table migration/RLS/seed và tests; Gemini có login/useActionState/dashboard/logout form. Không CONTRACT_MISMATCH auth. / trung tính, /login và /dashboard thật; /q và /order chưa triển khai. components.json có alias/theme metadata; chưa có component shadcn hoặc cn helper được dùng, không cài cả bộ UI.

P1_G01/P1_G02 đã đọc; P1_G03_REVIEW chưa tồn tại lúc đối chiếu cuối. Thay đổi đồng thời của Gemini gồm CustomerShell/StickyCartPreview, OrderDetailPreview, OwnerHeader/Pills/Shell, OwnerLoginForm, mock ui-preview, dashboard/page và các customer/owner presentation states mới; Codex không ghi các file đó. Hash docs/contracts, root specs, CSS, login/page và .env.local giữ nguyên so với đầu C03. Root layout thay đổi chỉ để nối font Gemini đã yêu cầu.

## Code thay đổi trong P1-C03

- package.json: giữ dev/lint/typecheck/build/start; thêm test:db/test:http, supabase:start/stop, db:migrate/db:seed. Không cài dependency mới, lockfile không đổi.
- supabase/config.toml, supabase/.gitignore, supabase/seed-local.mjs: cấu hình dev local và seed UTF-8 bằng Docker PostgreSQL; giữ migration/seed nguồn P1-C02.
- src/server/auth/log.ts: allowlist event + severity cố định, không API nhận Error/request/metadata; runtime event lạ không echo input.
- auth-actions.ts: log safe failure, sanitize cả exception logout; success redirect vẫn ngoài try/catch; membership deny vẫn signOut local.
- verify-owner.ts: log permission/DB/provider failure; network/status0 hoặc5xx phân loại unavailable, fail closed.
- require-owner.ts: log cấu hình/unknown failure; unstable_rethrow giữ Next render/prerender control flow, tránh báo auth outage giả ở build.
- src/lib/supabase/server.ts: cookie-write failure log tĩnh, throw lỗi an toàn; không nuốt lỗi ghi cookie. Refresh route thêm safe failure event.
- src/lib/env/client.ts: reject sb_secret/legacy service_role/invalid public keys trước client init, không echo giá trị; không thay verify JWT bằng decode role.
- src/app/layout.tsx: Be Vietnam Pro --font-sans theo P1_G01 §4, Next font asset/self-host; không đổi CSS/theme/page visuals.
- tests/auth/{env,log}.test.ts, require-owner/verify-owner tests; tests/db integration default workdir repo và HTTP smoke bổ sung public assets/guest404, malicious role/store fields, cross-Origin rejection và kiểm log không chứa credential thật của fixture.
- Ba tài liệu P1_C03_VERIFICATION/UI_HANDOFF/PHASE2_READINESS.

## Checks thực chạy

| Check / lệnh | Kết quả | Bằng chứng / giới hạn |
| --- | --- | --- |
| npm.cmd run lint | PASS | eslint . --max-warnings=0; không loại UI khỏi lint |
| npm.cmd run typecheck | PASS | next typegen + tsc --noEmit |
| npm.cmd run test:auth | PASS | 6 files, 37 tests; validation, action, guard, env public-key rejection, log allowlist, Next control-flow propagation qua cả getCurrentOwner và requireOwner |
| npm.cmd run test:db | PASS | 8 integration tests; Auth/PostgREST/PostgreSQL thật, chỉ Next cookies/redirect transport mock |
| npm.cmd run test:http | PASS | production build + Next HTTP forms/actions thật; không mock provider/cookies()/redirect() |
| npm.cmd run build | PASS | build hiện có public env; local smoke build với env override trong process; không sửa .env.local |
| Build với ba biến Supabase rỗng trong child process | PASS | next build vẫn thành công nhờ lazy validation; sau đó chạy lại npm.cmd run build với cấu hình hiện hữu để khôi phục output bình thường |
| npm.cmd run supabase:start | PASS | repo config nhận đúng local project; sau stop/start dùng backup, core services healthy |
| npm.cmd run supabase:stop | PASS | giữ local data volume; đã start lại, không dừng dev server của người dùng |
| npm.cmd run db:migrate | PASS | migration up --local, applied=[] trên DB đã có version20261023000100; không remote/reset |
| npm.cmd run db:seed | PASS | Node helper/psql UTF-8 idempotent; seed CLI query thử đầu FAIL multiple commands/prepared statement, đã thay helper và chạy thành công |
| Migration/RLS review | PASS local | pg_class: cả4 bảng RLS true; unique QR/bàn, QR CHECK, same-store FK, membership admin-only; integration assert SQLSTATE và public client access |
| Dev HTTP server hiện hữu port3000 | PASS | PID9536; GET /200, /login200, /dashboard307→/login, giữ server nguyên trạng |
| Khởi động thêm npm dev cùng workspace | NOT_RUN | đã có dev live, không tạo process xung đột .next/dev; script dev vẫn next dev |
| Supabase project URL trong .env.local | UNVERIFIED | public URL/key có giá trị, không cùng URL local test; chưa có credentials owner cho project này, không truy cập remote admin |
| Browser E2E/hydration/visual/responsive | NOT_RUN | suite là HTTP progressive-enhancement, không browser; Gemini sở hữu QA presentation |
| npm.cmd audit --omit=dev --json | PASS | 0 vulnerabilities |
| npm.cmd audit --json | FAIL (known dev tooling) | 5 high: eslint-config-next/@next/eslint-plugin-next/fast-glob/micromatch/braces; không force downgrade stack |

## HTTP security cases đã đạt

1. Guest GET dashboard307/login; home/login/assets200, q/order test locators404. Không middleware/proxy toàn app.
2. Form Next-rendered hidden action reference thật, multipart POST với Origin cùng site: sai password200 safe message/no usable session; nonmember cũng vậy dù gửi role/isOwner/storeId giả.
3. Owner Auth + membership admin-created: login303/dashboard, dashboard200/private no-store, đúng4 tab; Set-Cookie HttpOnly/Secure/Lax.
4. Expired session metadata với token Supabase thật: layout307 refresh route, provider refresh303 + Set-Cookie, dashboard200 lại.
5. Logout form303/login, GET dashboard sau đó307/login. Valid Auth cookie nonmember307/access_denied; cookie malformed không vào được dashboard.
6. Cross-origin Server Action bị Next từ chối HTTP500, không session, dashboard vẫn guest. Đây là rejection mặc định Next, không business API error envelope; không đổi thành success.
7. Captured production server logs có event auth.login_rejected và không chứa email/password/access_token/refresh_token/service-role key của các tài khoản fixture. Không in captured logs hoặc credential ra terminal. App logger chỉ fixed events; không global monkeypatch console.

HTTP cookie jar chuyển cookie thủ công; xác minh flags từ Set-Cookie, không dùng để suy ra hành vi cookie thực tế của browser/HTTPS. Malformed cookie có thể làm SDK ghi diagnostic không chứa credential fixture; không nhận mọi SDK log là app logger đã redact. Production HTTPS/cross-domain deployment chưa kiểm.

Kiểm tra cuối sau thay đổi guard: auth37/DB8/HTTP smoke/lint/typecheck/build đều PASS. Docker DB/Auth/Kong healthy, REST chạy; sau cleanup còn1 store/3 bàn seed,0 QR/0 membership/0 Auth user. Package manifest khớp lockfile và git diff --check PASS.

Server/client boundary: components không import src/server, env/server hay service-role; server actions được Next transform hợp lệ, UI chỉ type-import shared action state. Build PASS kiểm boundary; quét .next/static JS có0 occurrences SUPABASE_SERVICE_ROLE_KEY. App dùng public-key+JWT/RLS, admin key chỉ test trong memory. .env.example chỉ tên biến rỗng, không payment key; .env.local ignored/không đổi. Public anon key có thể nằm trong client config theo thiết kế, khác owner session token.

## Gate và hạn chế còn lại

P1-C03 backend/integration DONE: inventory/scripts/auth/SSR/RLS/logging + ba handoff đã có bằng chứng. Không blocker backend để bắt đầu Phase2. Root TASKS giữ nguyên, không tự tick các phần visual/business ngoài scope.

OWNER_BOOTSTRAP_REQUIRED trên project đích, P1_G03 visual acceptance chưa có, shadcn component chưa được yêu cầu cụ thể, fixture dashboard chưa business API. UI_INTEGRATION_REQUEST preview/inline logout failure ở [UI_HANDOFF](P1_C03_UI_HANDOFF.md); không sửa UI để lách ownership. Các live credential-policy/contract gaps Phase2 ở [PHASE2_READINESS](P1_C03_PHASE2_READINESS.md). Không xác nhận remote Supabase, browser E2E, provider, FIFO concurrency hoặc toàn MVP pass.
