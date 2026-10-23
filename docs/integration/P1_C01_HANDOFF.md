# P1-C01 — Bàn giao nền tảng

Ngày kiểm tra: 23/10/2026 (Asia/Saigon). **P1-C01: DONE** sau khi Gemini sửa UI/mock và cập nhật G02. Codex đã chạy lại **lint, typecheck, build: PASS**, kiểm fixture và đối soát các mapping từng chặn. **T-005: xác nhận handoff kỹ thuật contract-first, đủ mở khóa bootstrap/mock integration**. Các quyết định live provider/credentials/policy vẫn thuộc phase sau.

Trạng thái BLOCKED lúc 15:59 đã được giải quyết bằng thay đổi thực tế từ Gemini và bằng chứng kiểm tra mới. Xác nhận mới được ghi tại báo cáo integration này; không sửa tài liệu root, contracts hoặc file Gemini để thay đổi checklist lịch sử.

## Runtime và cài đặt

Repo dùng npm duy nhất, `package-lock.json` lockfileVersion 3. Host đã kiểm chứng Node **22.13.1**, npm **10.9.2**; `.nvmrc` và `engines` giữ cùng dòng Node 22/npm 10 để tái lập môi trường. Next yêu cầu Node >=20.9; cấu hình repo hẹp hơn theo runtime đã chạy thực tế.

| Package | Phiên bản khóa | Mục đích |
|---|---|---|
| next | 16.4.2 | App Router, Turbopack |
| react / react-dom | 19.3.1 / 19.3.1 | Runtime React |
| tailwindcss / @tailwindcss/postcss | 4.3.3 / 4.3.3 | Tailwind v4 qua PostCSS |
| typescript | 5.9.3 | Strict; nằm trong dải hỗ trợ <6 của typescript-eslint |
| eslint / eslint-config-next | 9.39.5 / 16.4.2 | Next flat config; peer plugins hiện dùng ESLint 9 |
| zod / server-only | 4.6.7 / 0.0.1 | Validate env khi sử dụng và boundary server |
| lucide-react | 1.61.0 | Các component Gemini hiện import trực tiếp |
| @types/node / @types/react / @types/react-dom | 22.20.5 / 19.3.0 / 19.3.0 | Types phù hợp runtime |

Các phiên bản đã đối chiếu registry và package cài thực tế. Không dùng `--force` để vượt peer dependency. ESLint 9.39.5 có cảnh báo deprecated; chưa chuyển ESLint 10 khi các plugin của Next chưa đồng thuận peer range.

Chạy từ root, dừng dev server trước `npm ci` để tránh khóa native module trên Windows:

```powershell
npm ci
npm run dev
npm run lint
npm run typecheck
npm run build
npm run start
```

`start` cần build thành công trước. PowerShell host này làm mất tên option khi gọi qua `npm.ps1`; khi cần host/port cụ thể, dùng:

```powershell
npm.cmd run dev -- --hostname=127.0.0.1 --port=3107
npm.cmd run start -- --hostname=127.0.0.1 --port=3108
```

Scripts: `dev=next dev`, `build=next build`, `start=next start`, `lint=eslint . --max-warnings=0`, `typecheck=next typegen && tsc --noEmit`. Không có script test giả. Next 16 build không thay thế bước lint riêng.

## Cấu hình và nguồn contract

- `src/app/layout.tsx` + `page.tsx`: placeholder tiếng Việt, không nhập shell/mock hoặc tạo route nghiệp vụ; Next tự cung cấp trang 404.
- TypeScript `strict: true`; `@/*` → `src/*`, `@contracts` → **đúng** `docs/contracts/types.ts`. Không copy types.
- Ví dụ: `import type { OrderDetail } from "@contracts";`. Relative imports hiện tại của Gemini vẫn resolve cùng nguồn.
- ESLint dùng Next core-web-vitals + TypeScript; `docs/**` được loại khỏi app lint vì đây là artifact P0 đã khóa. Tất cả `src/components/**` và `src/lib/mocks/**` vẫn được lint/typecheck, không loại để né lỗi. Verifier contract riêng nằm tại `docs/contracts/validate_contracts.py`.
- `next.config.ts` đặt `agentRules: false`: Next 16.4 mặc định tự sinh AGENTS.md ngoài ownership của prompt. Đã đọc tài liệu đi kèm Next và để Next tự dọn managed block khi restart; không giữ file AGENTS mới. Không có `ignoreBuildErrors`.

## Môi trường

`.env.example` chỉ có ba biến rỗng và chú thích; Codex không tạo `.env.local`, key thật hoặc kết nối Supabase. Trong lần rà soát sau cùng, `.env.local` xuất hiện từ thay đổi đồng thời bên ngoài phần việc Codex; chỉ kiểm tra metadata và Git ignore, không đọc giá trị hoặc đưa vào commit. Các phép build/smoke không-credentials trong báo cáo đã chạy trước khi file này xuất hiện.

| Biến | Phạm vi | Thời điểm kiểm tra |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Browser public | Khi gọi `getClientEnv()` |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser public, chỉ dùng publishable key | Khi gọi `getClientEnv()` |
| SUPABASE_SERVICE_ROLE_KEY | Server-only, quyền cao | Chỉ khi server code chủ động gọi `getServerEnv()` |

`src/lib/env/client.ts` đọc tường minh NEXT_PUBLIC_* để Next inline đúng vào bundle. URL phải HTTPS, hoặc HTTP loopback cho dev. URL sai được bắt và chuyển thành lỗi chỉ chứa tên field. Key rỗng/whitespace bị từ chối. Đây là validation cấu hình, chưa chứng minh project/key hợp lệ bằng network. Giá trị public được inline ở build time; đổi chúng cần rebuild.

`server.ts` import `server-only`, không được import vào Client Component. Không bao giờ đặt service-role/payment/provider secret vào NEXT_PUBLIC_*, `next.config.env`, response hay log. Khi phase sau cần dev credentials, tự tạo `.env.local` từ example và điền project dev; không commit file này. Build hiện tại không gọi helpers nên không cần credentials; khi thực sự gọi, cấu hình thiếu/sai sẽ throw lỗi đã sanitize.

`.gitignore` bảo vệ `.env*` (ngoại trừ example), private key/token/credentials phổ biến, secrets dirs và build artifacts. Không có Supabase SDK/client, auth giả, DB connection hoặc payment adapter.

## Ownership và điểm Gemini có thể tiếp tục

| Vùng | Chủ sở hữu / handoff |
|---|---|
| Root package/lock/config, `.env.example`, `.nvmrc`, `.gitignore` | Codex; tránh chạy package/CLI mutation song song |
| `src/lib/env/**` | Codex |
| `src/app/layout.tsx`, `page.tsx` | Codex đã bootstrap; điểm bàn giao cho bước tích hợp UI tiếp theo, cần phối hợp trước sửa đồng thời |
| `src/app/globals.css` | Codex chỉ tạo Tailwind import lần đầu; **đã bàn giao Gemini**. Hiện Gemini đã thêm theme import/reset, Codex không sửa tiếp |
| `src/components/ui/**`, customer/**, owner/**, `src/styles/**`, `src/lib/mocks/**`, `public/**` | Gemini |
| `docs/contracts/**`, `docs/design/**`, tài liệu root, `assets/**` | Giữ nguyên trong P1-C01; thay đổi contract phải qua review riêng |
| `docs/integration/**` | Codex: handoff và verification |

Gemini có thể tiếp tục component trình diễn và sửa lint ngay, dùng contract hiện có. Theme đã được nạp qua globals.css của Gemini. Font Be Vietnam Pro được yêu cầu trong P1_G01_REVIEW nhưng **chưa tích hợp** vào layout; phối hợp ở bước preview sau, không tự chọn font/theme trong bootstrap này. Trang `/` hiện chỉ là placeholder, chưa mount CustomerShell/OwnerShell.

### shadcn/ui bootstrap

`components.json` đã có schema, RSC/TSX, cấu hình Tailwind v4 (`config: ""`), CSS `src/app/globals.css`, Lucide và alias. `new-york`/`neutral` chỉ là metadata mặc định registry, chưa sinh token/component hoặc áp dụng theme shadcn. Gemini quyết định theme và component thực tế.

Alias `utils` dự kiến `@/components/ui/utils`; file `src/components/ui/utils.ts` **chưa tồn tại** và thuộc Gemini. Không chạy `shadcn init/add` trong khi Gemini sửa CSS/components. Khi cần component đầu tiên, phối hợp một lượt package/CLI mutation; Gemini có thể tạo helper `cn` dùng `clsx` + `tailwind-merge` trước, với package setup ở root:

```powershell
npm install --save-exact clsx@2.1.1 tailwind-merge@3.7.0
npx shadcn@4.22.1 add <component-name>
```

Các phiên bản trên đã kiểm tra registry nhưng **chưa cài vào dependency project/chưa chạy init hoặc add**; không tuyên bố có component shadcn hoặc helper hoàn chỉnh. Đã chạy lệnh chỉ đọc `npx.cmd --yes shadcn@4.22.1 info --json`: exit 0, nhận đúng Next.js 16.4.2 App Router, src directory, RSC, TypeScript, Tailwind v4, CSS và aliases; `components: []`. Nếu CLI đề nghị overwrite CSS/theme, review với Gemini trước. Các shell hiện tại không cần hai dependency cn này.

## Blockers và yêu cầu sửa đúng ownership

### Gate P0 — handoff kỹ thuật đã đối soát

Gemini cập nhật `docs/design/P0_G02_REVIEW.md` phiên bản 1.1 và `P1_G01_REVIEW.md`, người dùng bàn giao lại kết quả. Codex đã kiểm tra với API/type canonical: R02 opaque session code; R04 CreateOrderV1Input/menuRevision; R09 requestId/expectedVersion; R10 discriminator + proof; R05 includePickup private projection; R11 tableId detail projection; R13 begin/cancel/confirm. Không phát sinh endpoint hoặc đổi contract.

Với bằng chứng mới này, blocker cross-review nêu trong bản C02 lịch sử được giải quyết cho **T-005 ownership/response-example handoff** và P1-C01. Điều này không xác nhận API production, visual acceptance toàn MVP hoặc các policy live chưa duyệt. `TASKS.md` và C02 review cũ được giữ nguyên theo giới hạn prompt; trạng thái mới ghi tại đây.

Các điểm cần giữ đúng khi triển khai thật, không chặn scaffold:

- `OwnerTablesView.detail` là field **bắt buộc nhưng nullable**, không phải optional như pseudo-shape G02. `PrivateOrderTrackingView.pickup` cũng có thể null; guest cookie phải có đúng buyer grant, cookie bất kỳ không đủ quyền.
- Countdown phải dùng mốc server (`Date`/serverTime) để bù lệch đồng hồ; Date.now() đơn thuần không bảo đảm đồng bộ. Khi zero cần refetch, không tự quyết định paid/expired/regenerate.
- R21 là webhook backend; không nằm trong bảng màn hình G02. 21 routes vẫn là đặc tả, chưa có 21 route handlers chạy thật. Polling/backoff là assumption cần đo, không phải cam kết tải.
- CR-UI-05/06 chỉ giải quyết projection/delivery contract: Q5 entropy/TTL/encryption/recovery/rotate vẫn cần chốt trước live; provider, settlement policy và ngày vận hành giữ gate ở phase tương ứng.
- Option group bắt buộc/tính phí không được giả lập bằng note; note chỉ cho tùy chỉnh không tính phí theo handoff canonical.

### UI/mock — đã sửa và xác minh

Gemini đã sửa entity JSX, next/image, aria-pressed và unused imports. `npm run lint` PASS với **0 errors, 0 warnings**, không đổi `--max-warnings=0` hoặc loại UI khỏi lint. `next/image unoptimized` bỏ qua image optimizer; chưa có bằng chứng đo LCP để kết luận cải thiện hiệu năng.

Kiểm tra in-memory toàn bộ MOCK_OWNER_ORDERS PASS: tổng quantities bằng itemCount, option deltas + base bằng unit price, line totals và order/payment amount khớp, payment status và dine-in/takeaway ticket context hợp lệ. `order-028` hiện 122000/3; `order-027` 152000/4 có đủ lines. Đây là fixture/presentation checks, chưa phải test server transition hoặc DB FIFO. Codex không sửa các file Gemini.

### Dependency audit

`npm audit --omit=dev`: **0 vulnerabilities**. Full audit: **5 high** cùng chuỗi dev tooling `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`, GHSA-vfj7-8cjw-p6xm. Registry braces hiện vẫn 3.0.3 và nằm trong affected range; npm gợi ý downgrade eslint-config-next về 14.2.35. Không áp dụng force downgrade không tương thích Next 16; theo dõi bản upstream vá. Không có chứng cứ runtime application bị advisory này.

## Kết quả và phạm vi chưa làm

Chi tiết bằng chứng tại [P1_C01_VERIFICATION.md](P1_C01_VERIFICATION.md). `npm ci`, lint, typecheck, build, dev/start HTTP smoke và env assertions PASS. Bootstrap P1-C01 đủ điều kiện DONE; chưa mở rộng sang phase tiếp theo.

Chưa làm: migration/schema, Supabase Auth/RLS/login integration, API nghiệp vụ, FIFO transaction, payment/webhook, realtime, deploy hoặc UI preview hoàn chỉnh. Không sửa TASKS để tự xác nhận gate, không tạo role/route kitchen/bar/cashier/staff/inventory.

Đã thực hiện yêu cầu commit lockfile: commit **a3f4bb0** (`chore: lock npm bootstrap dependencies`) chỉ chứa `package.json` và `package-lock.json`. Trước commit, index rỗng và repository chưa có commit. Các config/source/tài liệu khác vẫn ở worktree để review; không gộp file Gemini hoặc tài liệu P0 vào commit này.
