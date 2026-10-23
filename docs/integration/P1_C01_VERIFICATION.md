# P1-C01 — Kiểm chứng thực tế

Ngày 23/10/2026 (Asia/Saigon), Windows PowerShell, root `E:\Project\QR-Ordering-PV`. **P1-C01: DONE.** Báo cáo này thay thế kết quả PARTIAL/BLOCKED trước khi Gemini sửa UI và cập nhật review G02. Không dùng build/type/lint bypass.

## Kết quả xác minh

| Kiểm tra | Kết quả | Bằng chứng / giới hạn |
|---|---|---|
| Runtime | PASS | Node v22.13.1, npm 10.9.2 |
| `npm ci --no-fund --no-audit` | PASS ở lượt bootstrap | 366 packages; không đổi lock |
| `npm run lint` | **PASS mới nhất** | Exit 0, 0 errors/0 warnings, giữ --max-warnings=0 |
| `npm run typecheck` | **PASS mới nhất** | next typegen + tsc --noEmit, toàn bộ src và imported contract |
| `npm run build` | **PASS mới nhất** | Next 16.4.2 Turbopack; TypeScript + static pages `/`, `/_not-found`; lần mới có .env.local |
| Dev HTTP smoke | PASS ở lượt bootstrap | npm.cmd run dev -- --hostname=127.0.0.1 --port=3107; `/` 200, UTF-8 placeholder, CSS 200 chứa --qr-bg, route lạ 404 |
| Production HTTP smoke | PASS ở lượt bootstrap | npm.cmd run start -- --hostname=127.0.0.1 --port=3108; cùng content/CSS/404 checks |
| Env runtime assertions | **PASS chạy lại** | 15 assertions trong memory; không credentials thật/network |
| server-only boundary | PASS ở lượt bootstrap | Node default conditions từ chối import; react-server conditions cho phép server helper |
| Fixture invariants | **PASS mới nhất** | 3 orders; quantities, options/base/unit/line/order/payment totals, payment status, ticket/session context |
| Package/lock | PASS | Direct dependencies/devDependencies/engines match root lock metadata; một lockfile npm |
| Commit lockfile | PASS | a3f4bb0, chỉ package.json + package-lock.json; index kiểm đúng 2 file trước commit |
| `shadcn@4.22.1 info --json` | PASS ở lượt bootstrap | next-app 16.4.2, src/RSC/TS, Tailwind v4, CSS/aliases đúng; components=[]; không init/add |
| `npm ls --depth=0` | Exit 0 | Direct versions đúng; npm gắn extraneous cho 6 optional WASM transitive packages ngay cả sau clean ci |
| Audit | Residual dev issue | Lượt bootstrap: omit=dev có 0 vulnerabilities; full audit 5 high cùng chuỗi braces; xem handoff |

Dev/start smoke đã hoàn tất trước các chỉnh sửa UI; `/` vẫn chỉ placeholder và chưa import shell/mock, nên không dùng smoke này để tuyên bố đã kiểm giao diện hoàn chỉnh. Không chạy lại checks không bị thay đổi khi chưa có nguyên nhân mới. Hai server smoke do Codex mở đã được dừng đúng process/port, không kill các Node process khác.

## Env và bảo toàn dữ liệu

One-off check dùng TypeScript transpileModule và Node Module in-memory. Server module giữ import `server-only`, kiểm dưới `node --conditions=react-server`. Không thêm test runner/script giả.

15 assertions gồm lazy import không credentials; lỗi thiếu public/server env; từ chối HTTP non-loopback, FTP, malformed URL, HTTPS thiếu host; chấp nhận HTTPS và HTTP localhost/IPv4/IPv6 loopback; từ chối keys whitespace; chấp nhận server value demo trong process. Error assertions kiểm tên field và không lộ input sentinel. Đã sửa nhánh URL refine bằng try/catch trong file Codex sở hữu để không throw lỗi raw input.

Ban đầu dev/build không có .env.local và vẫn PASS nhờ lazy validation. Sau đó .env.local được thêm ngoài phần việc Codex; lần build mới nhận file này và PASS. Codex không đọc/sửa nội dung, không kết nối dịch vụ để xác nhận key thật. git check-ignore xác nhận file ignored, git ls-files không có file này. `.env.example` chỉ giá trị rỗng. Các mẫu `.env.production.local`, key/token/credentials, secrets và outputs được ignore; example được phép chia sẻ.

Snapshot trước bootstrap có 25 file. Đối chiếu mới: **24/25 giữ nguyên**, duy nhất docs/design/P0_G02_REVIEW.md đổi bởi Gemini theo cập nhật người dùng cung cấp. Tài liệu root, assets và contracts vẫn nguyên checksum; Codex không sửa design/components/styles/mocks/public. P1_G01_REVIEW được Gemini thêm sau snapshot và cập nhật, không thuộc 25 file này.

Không reset Git/xóa P0/copy contract. Chỉ package.json/lock được commit trong a3f4bb0; các artifact khác vẫn worktree. Không commit .env.local hoặc thay đổi Gemini. Không đánh dấu checkbox trong TASKS.md vì prompt yêu cầu giữ tài liệu root nguyên trạng.

## Kiểm chứng contract và gate P0

User bàn giao sửa lỗi và review G02 v1.1; Codex đã đọc lại các phần liên quan của API_CONTRACT_V1/types/UI_DATA_HANDOFF và G02. Các mismatch từng chặn đã được đối soát: opaque session code, menuRevision v1, requestId/version cho transitions, discriminator/proof complete, buyer-only pickup projection, table detail query, settle ba actions. **Xác nhận T-005 handoff kỹ thuật ownership/response examples**, đủ cho bootstrap/mock integration; bản C02 cũ ghi OPEN là lịch sử trước xác nhận này.

Không diễn giải gate này thành live approval: provider, TTL/credential encryption/recovery, settlement policy và service-day vẫn OPEN cho phase tương ứng. Không có API runtime hoặc security/concurrency DB test trong P1-C01.

Chạy thêm `python docs/contracts/validate_contracts.py` nguyên bản: **FAIL** do lệnh tsc cũ dùng default classic module resolution, tự nạp @types từ node_modules mới rồi không resolve undici-types/csstype. Không sửa script/contract bị khóa để né lỗi. Chạy lại cùng verifier qua wrapper in-memory chỉ bổ sung `--moduleResolution bundler` vào compiler invocation (khớp app tsconfig, giữ strict/noEmit và mọi assertions): **PASS 19 C01 + 26 C02 typed JSON examples, 6 negative type checks, 21 route sections, 35 planned runtime cases**. Planned cases chỉ là danh sách, chưa phải runtime tests đã chạy. Cần cập nhật compiler invocation của verifier trong một lượt contract-maintenance được giao riêng; không chặn bootstrap với resolution hiện tại đã kiểm chứng.

Một số pseudo-shape/lời khẳng định G02 cần đọc theo contract canonical khi nối API: detail/pickup nullable, đúng buyer scope, R21 backend webhook, countdown bù server clock và refetch, polling/backoff chưa được benchmark, credential lifecycle chưa được phê duyệt. Đã ghi cụ thể ở handoff, không sửa file Gemini hoặc types.

## Đối chiếu toàn bộ yêu cầu P1-C01

| Mục prompt | Kết quả và bằng chứng |
|---|---|
| §0 đọc sources/gate/invariants | Sources root/P0/design đã đọc; xác nhận review mới trong báo cáo này; không thêm role/UI/API ngoài phạm vi |
| A1 kiểm repo, scaffold an toàn | Repo ban đầu chưa có app; scaffold thủ công, snapshot bảo toàn, không reset/xóa P0 |
| A2 App Router/TS/ESLint/Tailwind/src/alias, PM/lock | Config/source tồn tại; npm duy nhất; lock đã commit a3f4bb0 |
| A3 runtime/version compatibility | npm registry/install và build thực tế; .nvmrc/engines khớp runtime; lý do TS/ESLint versions ở handoff |
| A4 scripts thật | dev/build/start/lint/typecheck đã chạy; không script test giả |
| A5 giữ tài liệu root | Sáu tài liệu README/PRD/UI/ARCHITECTURE/PLAN/TASKS nguyên SHA256 |
| B1 env example | Ba giá trị rỗng, chú thích public/server scope, không key giả/secret |
| B2 ignore | Env/key/token/credentials/output patterns đã kiểm; .env.local ignored/untracked |
| B3 deps dùng thật, validate lazy | zod/server-only dùng trong helpers, lucide dùng trong UI; build không cần credentials ở lượt đầu |
| B4 Supabase helper nếu có | Không tạo SDK/helper/network/auth/migration; không áp dụng |
| B5 lỗi runtime sanitize | 15 assertions PASS, server-only boundary; không log secret |
| C1 strict/alias | strict true, @/*→src/*; layout dùng alias build được |
| C2 app placeholder | layout/page tối thiểu; page không logic nghiệp vụ; Next default 404 |
| C3 ownership Gemini | Globals chỉ Tailwind bootstrap rồi bàn giao; không sửa UI/theme/mock/public/design |
| C4 shadcn bootstrap | CLI info xác nhận config/aliases/Tailwind v4; chưa init/add/theme/component; helper cn để Gemini ở bước component đầu tiên |
| C5 handoff | Runtime/scripts/setup/ownership/start points/blockers/live questions đều có |
| C6 contract một nguồn | @contracts trỏ thẳng docs/contracts/types.ts; không copy/sửa contract |
| §2 file scope | Chỉ own configs/env/app bootstrap/integration docs; Next managed AGENTS tự dọn theo agentRules=false |
| §3 checks | Lint/typecheck/build PASS; App Router/alias, package lock, env, preservation có evidence; verifier P0 limitation được báo riêng |
| §4 Definition of Done | App bootstrap chạy được; strict/checks/env/ignore/shadcn config/handoff đầy đủ; không lấn auth/schema/payment/FIFO/UI hoàn chỉnh |
| §5 báo cáo cuối | DONE kèm versions/checks/handoff, chưa làm P1-C02+ và open questions |

P1-C01 không còn blocker. Các bước tiếp theo vẫn chưa làm: Supabase migration/seed, Auth/RLS/login integration, API/order/FIFO/payment/webhook/realtime, UI preview hoàn chỉnh và deploy.
