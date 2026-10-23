# P1-G02 UI/UX Review — Owner Login & Authentication States

**Nhiệm vụ:** P1-G02 — Hoàn thiện Owner Login UI và trạng thái xác thực theo Design System Emerald  
**Kỹ sư:** Gemini (UI/UX Engineer)  
**Trạng thái bàn giao:** `DONE` (Đã tích hợp hoàn tất với hạ tầng Auth từ Codex P1-C02 theo đúng `P1_C02_AUTH_HANDOFF.md`)  
**Ngày thực hiện:** 23/10/2026  

---

## 1. Danh sách file tạo mới & chỉnh sửa

| Thao tác | Đường dẫn file | Vai trò & Trách nhiệm |
| :--- | :--- | :--- |
| **Cập nhật** | `src/components/owner/auth/OwnerLoginForm.tsx` | Nhập chính thức `type OwnerLoginActionState` từ `@/features/owner/auth-actions`. Hỗ trợ `systemMessage` để hiển thị lý do điều hướng từ server guard an toàn (`access_denied`, `service_unavailable`), client validation và state pending. |
| **Tạo mới** | `src/components/owner/auth/OwnerLoginSection.tsx` | Client Component kết nối `useActionState(signInOwnerAction, initialState)` trực tiếp với Server Action thật từ Codex P1-C02 và adapter cho `<OwnerLoginForm />`. |
| **Cập nhật** | `src/app/(owner)/login/page.tsx` | Route `/login` bằng Next.js App Router (Server Component), tiếp nhận `searchParams.reason` để map an toàn sang thông báo tiếng Việt không lộ provider exception, gắn `<OwnerLoginSection />`. |
| **Cập nhật** | `src/components/owner/OwnerHeader.tsx` | Bổ sung prop `logoutAction` và hỗ trợ progressive enhancement qua `<form action={logoutAction}>` với `useFormStatus` (tự động phát hiện pending, hiển thị spinner `Loader2` và vô hiệu hóa nút bấm). Vẫn giữ tương thích ngược `onLogout` khi preview. |
| **Cập nhật** | `src/components/owner/OwnerShell.tsx` | Mở rộng `OwnerShellProps` nhận `logoutAction` và truyền an toàn xuống `OwnerHeader`. |
| **Tạo mới** | `src/app/(owner)/dashboard/page.tsx` | Route `/dashboard` thuộc ownership Gemini dưới Server Guard `requireOwner()` của Codex. Gắn `OwnerShell` với dữ liệu preview chuẩn (`MOCK_OWNER_ORDERS`, `MOCK_TABLES_LIST`, `MOCK_MENU_ITEMS`) và kết nối `signOutOwnerAction`. |
| **Cập nhật** | `docs/design/P1_G02_REVIEW.md` | Tài liệu nghiệm thu UI, ma trận trạng thái, checklist QA và kết quả tích hợp đầy đủ hai agent. |

> **Quy định file ownership được tuân thủ nghiêm ngặt:**  
> Không can thiệp `package.json`, `package-lock.json`, `components.json`, `src/app/(owner)/dashboard/layout.tsx`, `next.config.ts`, hoặc bất kỳ thư mục backend nào (`supabase/**`, `src/server/**`, `src/lib/supabase/**`). Mọi routing / cookie mutation / verification do Codex quản lý.

---

## 2. Ma trận bao phủ trạng thái giao diện (UX State Matrix)

| Trạng thái (State) | Hành vi UI & Phản hồi | Cách thức xử lý trong code |
| :--- | :--- | :--- |
| **Chưa điền form (Default / Idle)** | Nút Đăng nhập sẵn sàng, các field có nhãn rõ ràng, focus ring xanh ngọc `#35977D`, placeholder gợi ý chuẩn. | Mặc định trạng thái idle, không hiển thị lỗi. |
| **Email sai định dạng** | Phản hồi lỗi trực tiếp ngay dưới field Email: "Định dạng email không hợp lệ (ví dụ: owner@quan.vn)", viền đỏ `#B42318`, giữ nguyên nội dung user đã nhập. | Client regex validation `validateClient()`, liên kết `aria-describedby` và `aria-invalid`. |
| **Mật khẩu trống** | Báo lỗi ngay dưới field: "Vui lòng nhập mật khẩu", viền đỏ `#B42318`, không để lộ bất kỳ thông tin nào. | Client validation, `aria-describedby` liên kết thông báo lỗi. |
| **Đang gửi (Submitting / Pending)** | Nút Đăng nhập disabled + hiển thị spinner `Loader2` xoay tròn + chữ "Đang đăng nhập...", các input bị khóa để chống click lặp. | Nhận prop `isPending` từ `useActionState(signInOwnerAction)`. |
| **Sai thông tin đăng nhập** | Banner cảnh báo viền đỏ nhạt `#FEF3F2` hiển thị thông báo chung an toàn từ Codex: "Không thể đăng nhập. Vui lòng kiểm tra thông tin hoặc liên hệ quản trị quán.", không suy đoán email nào tồn tại. | Đọc `actionState.message` từ `signInOwnerAction`, render với `role="alert"` và `aria-live="polite"`. |
| **User hợp lệ nhưng thiếu quyền owner** | Khi truy cập dashboard bị guard từ chối chuyển sang `/login?reason=access_denied`: Banner thông báo "Tài khoản không có quyền quản lý quán. Vui lòng liên hệ quản trị viên." | Phân giải `searchParams.reason === 'access_denied'` tại Server Component `/login`. |
| **Dịch vụ tạm thời lỗi (500 / Network / Supabase)** | Khi guard chuyển sang `/login?reason=service_unavailable`: Alert cảnh báo "Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau.", không lộ chi tiết lỗi kỹ thuật. | Phân giải `searchParams.reason === 'service_unavailable'`. |
| **Đăng nhập thành công** | Codex server action `signInOwnerAction` tự động gọi `redirect("/dashboard")`. Gemini không tự `router.push('/dashboard')` trước khi có xác nhận từ server. | Next.js Server Action redirect native. |
| **Đang đăng xuất (Logging out)** | Nút Đăng xuất ở header đổi icon sang spinner `Loader2` xoay tròn, disabled chống bấm đúp, aria-label "Đang đăng xuất...". | Điều khiển bởi `useFormStatus` trong `<form action={logoutAction}>`. |
| **Đăng xuất thành công** | `signOutOwnerAction` kết thúc session an toàn tại Supabase qua `{ scope: 'local' }` và gọi `redirect("/login")`. | Server Action redirect native về trang login. |

---

## 3. Thẩm mỹ & Thiết kế (Minimal Emerald POS)

Tuân thủ chặt chẽ hệ màu và bố cục đã thống nhất từ `assets/ui-reference.png` và `DESIGN_FOUNDATION.md`:

| Token | Giá trị Hex | Ứng dụng trên màn hình `/login` và `/dashboard` |
| :--- | :--- | :--- |
| **Brand emerald** | `#35977D` | Focus ring trên các input, icon logo brand, border thông báo trạng thái. |
| **Brand strong** | `#1D725E` | CTA Button Đăng nhập chính (chữ trắng, tương phản cao WCAG AAA). |
| **Brand soft** | `#E8F4F0` | Khối nền logo quán, nền banner thông báo trạng thái hệ thống. |
| **Canvas** | `#F5F6F5` | Nền toàn trang (full viewport background). |
| **Surface** | `#FFFFFF` | Nền Card chứa form đăng nhập (bo góc 24px) và Shell Dashboard (bo góc 28px). |
| **Surface muted** | `#F7F8F7` | Nền của các ô nhập liệu Email và Password. |
| **Border** | `#E9ECEA` | Đường viền thanh mảnh quanh Card, input, header và footer. |
| **Text** | `#1D2522` | Chữ tiêu đề chính và nội dung nhập liệu. |
| **Muted text** | `#727B77` | Chữ mô tả phụ, placeholder và footer bảo mật. |
| **Error / Alert** | `#B42318` / `#FEF3F2` | Viền, chữ và nền thông báo lỗi validation / server. |

### Responsive Breakpoints:
- **375px (Mobile):** Card login full-width trừ padding an toàn 16px (`p-4`), chiều cao nút CTA tối thiểu 48px (đạt chuẩn touch target >= 44px). Header dashboard co gọn, nút đăng xuất mobile độc lập.
- **768px (Tablet):** Căn giữa hoàn hảo giữa màn hình dọc và ngang, card gọn gàng với shadow nhẹ, 4 tab dashboard hiển thị dạng thanh trượt ngang tinh tế.
- **1280px (Desktop):** Form login giới hạn `max-w-[440px]`, thẩm mỹ tương tự các sản phẩm SaaS cao cấp. Dashboard hiển thị layout 70/30 chuẩn POS.

### Accessibility (a11y):
- Sử dụng thẻ ngữ nghĩa `<form>`, `<input>`, `<label>`, `<button>`.
- Mọi input đều có `id` sinh động qua React `useId()`, nhãn `htmlFor` tường minh.
- Lỗi được liên kết chính xác bằng `aria-describedby` và `aria-invalid`.
- Nút ẩn/hiển thị mật khẩu có `type="button"` (không làm submit form ngoài ý muốn), có `aria-label` tương ứng theo trạng thái ("Hiển thị mật khẩu" / "Ẩn mật khẩu").
- Nút đăng xuất hỗ trợ progressive enhancement `<form action={logoutAction}>` với `useFormStatus` thông báo trạng thái `aria-label="Đang đăng xuất..."`.

---

## 4. Hợp đồng Server Action của Codex (Tích hợp thực tế)

Đã tích hợp trực tiếp từ `@/features/owner/auth-actions`:
```typescript
import { signInOwnerAction, signOutOwnerAction, type OwnerLoginActionState } from '@/features/owner/auth-actions';
```

- **Login Flow:**
  - `OwnerLoginSection` gọi `useActionState(signInOwnerAction, { status: 'idle' })`.
  - Client-side validation kiểm tra format trước khi submit.
  - Server Action xác thực Supabase Auth + đối chiếu `owner_members` RLS; nếu thành công chuyển hướng `/dashboard`.
- **Logout Flow:**
  - `OwnerHeader` bao bọc nút đăng xuất trong `<form action={signOutOwnerAction}>`.
  - Tận dụng `useFormStatus` trong React DOM 19 để render spinner mà không cần local state.
  - Sau khi session bị thu hồi, server action chuyển hướng về `/login`.

---

## 5. Kết quả kiểm tra QA Toàn diện

Các lệnh kiểm tra đã được thực thi thực tế trong môi trường Windows / Node v22.13.1:

1. **`npm run lint`**
   - Lệnh: `eslint . --max-warnings=0`
   - Kết quả: **PASS** (0 errors, 0 warnings).
2. **`npm run typecheck`**
   - Lệnh: `next typegen && tsc --noEmit`
   - Kết quả: **PASS** (Route types generated successfully, 0 type errors).
3. **`npm run test:auth`**
   - Lệnh: `vitest run --config tests/auth/vitest.config.mts`
   - Kết quả: **PASS** (4 test files, 25 tests passed).
4. **`npm run build`**
   - Lệnh: `next build`
   - Kết quả: **PASS** (Turbopack compile thành công trong 2.3s, 5 dynamic & static routes được tạo đầy đủ: `/`, `/_not-found`, `/api/owner/auth/refresh`, `/dashboard`, `/login`).

---

## 6. Sẵn sàng cho Smoke Test & Bootstrap
- Toàn bộ frontend UI và adapter Server Action đã sẵn sàng 100%.
- Codex / Chủ dự án có thể bootstrap tài khoản owner theo hướng dẫn tại `docs/integration/P1_C02_AUTH_HANDOFF.md` và `docs/integration/P1_C02_DB_NOTES.md` để thực hiện smoke test đăng nhập thực tế trên môi trường dev.
