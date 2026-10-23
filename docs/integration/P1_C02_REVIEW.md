# P1-C02 CODEX: DONE

Ngày nghiệm thu: 23/10/2026. Gemini đã bàn giao OwnerLoginSection/useActionState, dashboard/page.tsx và logout form. Codex đã đọc source thực tế và kiểm tra toàn luồng qua production HTTP với Next + Supabase local thật. Blocker UI cũ đã được giải quyết đúng ownership; không sửa các file Gemini.

**DONE trong phạm vi P1-C02 local/dev foundation.** Tài khoản owner của quán/project đích vẫn cần admin bootstrap theo hướng dẫn; không tạo password mặc định hoặc tự triển khai remote. Dashboard hiện dùng fixture UI do Gemini cung cấp, chưa có order/menu API. Kiểm thử HTTP gửi các form Server Action được Next render thật, không mock cookies()/redirect()/provider. Đây không phải kiểm thử JavaScript hydration hay nghiệm thu hình ảnh trên browser.

## File thuộc thay đổi Codex

- `.env.example`, `package.json`, `package-lock.json`: env comments; Supabase JS/SSR, CLI và Vitest; script test:auth.
- `supabase/migrations/20261023000100_foundation.sql`, `supabase/seed.sql`.
- `src/lib/supabase/{browser,server,database}.ts`.
- `src/server/auth/{login-validation,verify-owner,require-owner}.ts`.
- `src/features/owner/auth-actions.ts`.
- `src/app/(owner)/dashboard/layout.tsx`.
- `src/app/api/owner/auth/refresh/route.ts`.
- `tests/auth/{vitest.config.mts,server-only-stub.ts,login-validation.test.ts,auth-actions.test.ts,verify-owner.test.ts,require-owner.test.ts}`.
- `tests/db/{vitest.config.mts,local-integration.test.ts,http-smoke.mjs}`.
- Ba tài liệu `docs/integration/P1_C02_{AUTH_HANDOFF,DB_NOTES,REVIEW}.md`.

Không chỉnh root docs/contracts/design/UI components/mocks/styles/login/dashboard pages. Các file UI/P1_G02 và OwnerHeader/OwnerShell trong git status thuộc Gemini. So sánh hash baseline cho thấy docs/contracts/root tài liệu/.env.local không đổi; OwnerLoginForm có thay đổi từ công việc UI đồng thời, Codex không ghi file đó. Không reset/stage/commit các thay đổi ngoài phạm vi.

## Kết quả thực chạy

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| npm.cmd run test:auth | PASS — 4 files, 25 tests |
| npx.cmd vitest run --config tests/db/vitest.config.mts (P1C02_LOCAL_WORKDIR đặt tới harness) | PASS — 8 integration tests với local Auth/PostgreSQL/PostgREST thật |
| node tests/db/http-smoke.mjs (cùng local workdir) | PASS — build với public env local trong process; guest/owner/nonmember, form password/login/logout, refresh cookies và reload dashboard qua HTTP thật |
| npm.cmd run lint | PASS — 0 errors/warnings |
| npm.cmd run typecheck | PASS |
| npm.cmd run build | PASS — Next 16.4.2, không cần credential cho trang tĩnh |
| Supabase CLI start trên local sạch | PASS — migration history 20261023000100, seed đã apply |
| Seed lặp bằng UTF-8 | PASS — 1 store, 3 bàn; 0 test Auth users/membership còn lại |
| HTTP production GET / và /login | PASS — 200 |
| HTTP GET auth refresh khi build không có env | PASS — 303 login?reason=service_unavailable; private,no-store |
| HTTP GET /dashboard | PASS — guest 307 /login; owner 200; valid Auth nonmember 307 /login?reason=access_denied |
| Next-rendered login/logout form POST + reload qua HTTP | PASS — sai password/nonmember lỗi an toàn; owner 303 /dashboard; logout 303 /login; GET dashboard sau logout 307 /login |
| HTTP refresh session | PASS — metadata hết hạn với token thật → dashboard 307 refresh utility → provider refresh + Set-Cookie HttpOnly → dashboard 200 |
| JavaScript hydration/visual browser QA | Không chạy trong Codex HTTP suite; UI thuộc Gemini, không dùng HTTP PASS để suy ra visual/hydration PASS |
| Project Supabase dev của quán | OWNER_BOOTSTRAP_REQUIRED — .env.local giữ nguyên; không phải blocker cho bằng chứng local/dev ở trên |

Vitest integration suite chỉ mock Next cookies()/redirect transport; auth.getUser(), signInWithPassword(), signOut(), membership/RLS và refresh provider chạy thật. HTTP smoke bổ sung chạy Next production, lấy hidden action references từ HTML render thật và POST multipart form với Origin cùng site. Không hardcode action ID, không gọi action qua mock; kiểm tra cookies/redirect/status/cache headers trên response thật. Client cookie jar trong test HTTP chuyển cookie thủ công, không suy ra chính sách cookie của browser từ đó. Refresh tests dùng tokens Supabase thật, đưa expires_at metadata về quá khứ để kích hoạt refresh provider rồi kiểm tra cookie HttpOnly và no-store.

HTTP suite từ chối remote URL/project không đúng tên hoặc port13002 đang có server khác. Admin SDK chỉ ở test, password random trong memory; SQL thêm membership bằng UUID user Auth vừa tạo. Finally xóa đúng user/store tạm và dừng đúng child server của suite. Đã xác nhận DB sau cleanup còn 1 store/3 bàn demo, 0 Auth users/membership.

Các lần thử đầu đã sửa: port 554xx Windows reserved; tắt email provider do auth.email.enable_signup=false; Vitest 5 không có describe.sequential; pipe PowerShell mặc định làm mất dấu nhãn seed. HTTP suite lần đầu có assertion quét mọi chuỗi Error trong log, bắt nhầm diagnostic do test chủ động gửi cookie malformed; đã thay bằng kiểm tra status/redirect cụ thể trên từng response. Kết quả PASS ở trên là sau khi khắc phục. Không dừng next dev của người dùng/Gemini. Server production kiểm thử port13002 đã dừng. Public env của Next được inline lúc build nên HTTP suite build và start cùng env public local trong process, không sửa .env.local. Sau smoke, build mặc định được chạy lại không credential để không giữ test config trong build cuối.

## Auth/guard và security audit

Interface ở `@/features/owner/auth-actions`: OwnerLoginActionState; signInOwnerAction(previousState,formData); signOutOwnerAction(). Login thành công redirect /dashboard; input sai có fieldErrors; sai account/password/membership cùng lỗi tiếng Việt. Logout scope local rồi /login. verifyOwner xác minh bằng auth.getUser(), lookup owner_members với authUserId đã xác minh, không tin client storeId/role.

Dashboard layout await requireOwner; guest /login, nonmember /login?reason=access_denied, backend lỗi fail closed. Không global auth matcher; guest routes không bị chặn. RSC read-only phát hiện refresh và chuyển route writable /api/owner/auth/refresh; route giữ cookie/cache headers. Mọi API owner tương lai vẫn cần authorization riêng.

Kiểm tra source auth/Supabase không có service-role application client, signup endpoint, localStorage JWT hoặc log credential. Admin key chỉ dùng test local trong memory. `.env.local` không đổi và được gitignore; example không có giá trị key. Quét `.next/static/**/*.js` sau build: 0 chunks chứa tên SUPABASE_SERVICE_ROLE_KEY (không thay thế audit secret trên môi trường deploy). Browser helper tắt session persistence/URL token detection/auto refresh. Cookie HttpOnly/SameSite=Lax, Secure ở production. Chưa kiểm tra production HTTPS/cross-domain deployment. Không có security-definer function, public SELECT USING(true), membership write grant/policy. Anon và cross-store access đã test bằng public client thật.

Dependency hiện tại: @supabase/supabase-js 2.118.0, @supabase/ssr 0.12.7; dev supabase 2.121.0, vitest 5.0.5. Chưa xử lý chuỗi npm audit dev-only từ ESLint/braces đã ghi ở P1-C01; không nâng dependency ngoài phạm vi auth chỉ để đổi báo cáo audit.

Đã chạy lại `npm.cmd audit --omit=dev --json`: exit 0, tổng 0 vulnerabilities. `npm.cmd audit --json`: exit 1, 5 high ở @next/eslint-plugin-next, braces, eslint-config-next, fast-glob, micromatch; không có package Supabase mới trong danh sách advisory trả về.

## Đối chiếu điều kiện hoàn thành với bằng chứng

| Yêu cầu prompt | Bằng chứng hiện có | Kết luận |
| --- | --- | --- |
| Đọc P1-C01/contracts và giữ stack | Handoff P1-C01; migration/action dùng store membership, hai actor; package giữ npm/Next/React hiện hữu | Đã làm |
| A1–A3: SDK tương thích, helpers per request, server boundary | package exact versions; browser.ts/server.ts/database.ts; async cookies; server-only; không application service-role client; HTTP form/cookie/refresh smoke | VERIFIED local |
| A4–A5: env không lộ key, hướng dẫn local | .env.example rỗng; .env.local không đổi/ignored; DB_NOTES hướng dẫn harness; local Auth/DB đang healthy | Đã làm với local; project quán chưa cấu hình |
| B: bốn bảng, constraints/index/FK/RLS | Migration đã apply; 8 integration tests kiểm tra SQLSTATE, public client anonymous/owner/nonmember/cross-store; pg_class xác nhận RLS cả bốn bảng | VERIFIED local |
| B/C3: seed, bootstrap, cấm tự cấp owner, repair | Seed lặp UTF-8; membership grants/policies; signup test; AUTH_HANDOFF SQL lấy Auth UUID thật; DB_NOTES repair | Đã làm; owner quán vẫn cần admin bootstrap |
| C1: action interface, validation, safe error và redirects | auth-actions.ts; 25 unit tests; integration và HTTP login/logout form dùng Supabase thật | VERIFIED local |
| C2: guard server và membership; /dashboard thực | layout.tsx gọi requireOwner; build có dashboard; HTTP guest→login/owner→200/nonmember→access_denied | VERIFIED local |
| C2: SSR refresh, guest không global redirect | refresh route và integration provider refresh/cookie/no-store; HTTP / và /login 200; không middleware/proxy toàn app | Đã làm; browser E2E chưa có |
| D1–D3: checks, validation, migration | Lint/typecheck/build, 25 unit + 8 local integration tests, migration history | PASS |
| D4: guest/owner/nonmember/password/logout qua ứng dụng | Next-rendered forms POST qua HTTP thật; token/cookie Supabase thật; reload bị chặn sau logout | PASS HTTP local; không claim browser hydration/visual |
| D5: báo kết quả thật và ba handoff | AUTH_HANDOFF, DB_NOTES, REVIEW; phân biệt transport mocks với service thật | Đã làm |
| Ownership và scope | Không ghi các file UI bị cấm; không thêm order/FIFO/payment/menu/realtime API | Đã giữ |

## Handoff Gemini đã xác nhận

1. OwnerLoginSection gọi useActionState(signInOwnerAction), dùng chung OwnerLoginActionState. Form giữ email/password, không auth mock/localStorage fallback.
2. Dashboard page đặt dưới layout guard, bốn tab của OwnerShell, logoutAction={signOutOwnerAction}; OwnerHeader dùng form/useFormStatus.
3. Login page await searchParams, allowlist access_denied/service_unavailable với thông báo tiếng Việt an toàn.
4. Dashboard dùng MOCK_STORE/ORDERS/TABLES/MENU_ITEMS đúng giai đoạn UI preview; không xem fixture là business data thật hoặc API đã triển khai. Phase tiếp theo thay data bằng server/API được authorization độc lập.

Không cần sửa tiếp UI hoặc đổi ownership cho P1-C02. Bootstrap admin và migration/repair chi tiết ở [DB_NOTES](P1_C02_DB_NOTES.md) và [AUTH_HANDOFF](P1_C02_AUTH_HANDOFF.md). Khi dùng project đích, điền public env trước build, tạo owner bằng admin, tắt signup, rồi chạy lại smoke trong môi trường đó bằng quy trình riêng; suite này cố ý chỉ chấp nhận local.

Chưa thuộc scope: QR resolution/session, menu CRUD, guest order, FIFO, realtime và payment/webhook.
