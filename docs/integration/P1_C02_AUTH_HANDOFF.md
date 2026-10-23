# P1-C02 — Handoff Auth cho Gemini

Trạng thái triển khai: **DONE cho P1-C02 local/dev foundation**, chi tiết ở [P1_C02_REVIEW.md](P1_C02_REVIEW.md). Gemini đã nối login/logout, dashboard và safe query reasons. 25 unit tests + 8 integration tests + production HTTP smoke với Supabase local thật PASS; lint/typecheck/build PASS. Codex giữ backend/guard/tests, Gemini giữ login/dashboard pages và components. Tài khoản quán/project đích vẫn cần admin bootstrap; không có default owner/password.

## Interface chính thức

Import từ `@/features/owner/auth-actions`:

```ts
export type OwnerLoginActionState = {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors?: { email?: string; password?: string };
};
signInOwnerAction(previousState: OwnerLoginActionState, formData: FormData): Promise<OwnerLoginActionState>;
signOutOwnerAction(): Promise<void>;
```

FormData chỉ `email`, `password`; không nhận storeId/role/next URL. Email được trim/validate; password không trim và không echo. Thành công xác minh Auth qua getUser và đọc owner_members bằng client public-key + JWT/RLS, rồi redirect `/dashboard`. Sai account/password/membership dùng cùng thông báo tiếng Việt, không trả account tồn tại hay SQL/provider details. Field errors chỉ cho input sai cấu trúc. Không dùng success state giả hoặc mock token.

Ví dụ nối `OwnerLoginForm` hiện có trong một Client Component do Gemini sở hữu:

```tsx
'use client';
import { useActionState } from 'react';
import { signInOwnerAction, type OwnerLoginActionState } from '@/features/owner/auth-actions';
import { OwnerLoginForm } from '@/components/owner/auth/OwnerLoginForm';

const initialState: OwnerLoginActionState = { status: 'idle' };
export function Login() {
  const [state, formAction, pending] = useActionState(signInOwnerAction, initialState);
  return <OwnerLoginForm action={formAction} actionState={state} isPending={pending} />;
}
```

Không truyền server action hai tham số trực tiếp cho prop action một tham số; useActionState tạo adapter. Import type này thay type trùng của UI khi Gemini tích hợp. Logout dùng `<form action={signOutOwnerAction}>` với nút submit trong Owner UI; không gắn trực tiếp vào onClick nếu cần progressive enhancement. Logout scope local (browser hiện tại); chỉ redirect `/login` sau khi Supabase signOut không báo lỗi.

## Guard và refresh

- `src/server/auth/verify-owner.ts`: gọi `auth.getUser()` để xác thực server; query membership bằng ID đã xác minh và role owner. Không đọc quyền từ getSession/localStorage/user_metadata/formData. Trả `{authUserId,storeId}` từ DB; mapping thiếu thì denied, DB lỗi thì fail closed.
- `src/server/auth/require-owner.ts`: getCurrentOwner trả owner/null, throw OwnerAccessError khi forbidden/unavailable/refresh_required. requireOwner dùng trong layout server; guest → `/login`, user không có membership → `/login?reason=access_denied`, cấu hình/backend lỗi → `/login?reason=service_unavailable`. Đây là mẫu denied an toàn, không bật experimental forbidden() hoặc sửa next.config.
- `src/app/(owner)/dashboard/layout.tsx`: await requireOwner trước return children. Gemini tạo dashboard/page.tsx, không bỏ layout. Layout không thay guard ở từng API; mọi owner endpoint tương lai phải gọi xác minh riêng, không tin storeId client. API nên dùng verifyOwner/server client write-mode phù hợp handler thay vì redirect page guard.
- Không có middleware/proxy toàn app. RSC dùng cookie read-only; nếu getUser refresh được session thì guard chuyển tới `/api/owner/auth/refresh`. Route GET utility này ghi auth cookies qua NextResponse và giữ SDK cache headers/no-store, chỉ redirect fixed `/dashboard` hoặc `/login`. Dashboard xác minh lại; không lấy query next từ user. Guest/public/assets/webhook không bị match redirect toàn cục.
- Auth cookie host-only Path=/, SameSite=Lax, HttpOnly, Secure ở production HTTPS. Login/logout dùng Server Actions với Origin/Host check mặc định Next; không mở endpoint CORS wildcard hoặc public create-owner. Không cấu hình allowedOrigins rộng.
- Browser helper `@/lib/supabase/browser` chỉ public/RLS client khi cần, tắt persistSession/autoRefreshToken/detectSessionInUrl. Auth hiện server-only/HttpOnly: không gọi browser signIn/getSession để thay guard, không đưa JWT vào localStorage. Browser SDK không đọc được HttpOnly owner cookie; UI owner gọi server actions/API, chưa nối authenticated browser Realtime trong phase này.
- Helper server tạo client mới per request, await cookies trước validate env; không shared singleton/service-role. Write-mode chỉ dùng actions nơi Next cho cookie mutation; không nuốt lỗi cookie set. Route utility có adapter riêng cho NextResponse. Trang placeholder tĩnh không khởi tạo client khi build.

## Dependency và env

Đã bổ sung root dependency @supabase/supabase-js **2.118.0**, @supabase/ssr **0.12.7**; dev Vitest **5.0.5** và Supabase CLI **2.121.0**. SSR peer yêu cầu supabase-js ^2.114.0; Node >=22 đáp ứng host 22.13.1. Không chạy package/CLI mutation đồng thời với Gemini. Không sửa CSS/theme/font/UI.

`.env.example` giữ NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY rỗng. Chỉ điền project **dev** hoặc local vào .env.local (ignored), không commit. SUPABASE_SERVICE_ROLE_KEY không được application dùng trong P1-C02. Không import env/server vào Client Component hoặc đặt secret vào NEXT_PUBLIC_/next.config.env. Không tự tạo/deploy Supabase remote account/project.

## Bootstrap owner bằng admin tin cậy

1. Chạy migrations/seed trên **dev** theo P1_C02_DB_NOTES.md.
2. Trong Supabase Dashboard của dev project, Authentication → Users → Add user; tạo user email/password riêng và confirm email. Tắt public signup trong Auth Settings. Local dùng Studio/admin SDK trong môi trường admin tin cậy. Không có signup/trigger tự cấp owner ở app.
3. Copy UUID thật của user vừa tạo từ Auth Users, chạy SQL bằng SQL Editor/admin. Đây là template, thay placeholder trước chạy; không dùng UUID giả làm account:

```sql
insert into public.owner_members (store_id, auth_user_id, role)
select s.id, u.id, 'owner'
from public.stores s cross join auth.users u
where s.id = 'c0200000-0000-4000-8000-000000000001'::uuid
  and u.id = '<AUTH_USER_UUID_FROM_DEV_DASHBOARD>'::uuid
on conflict (store_id, auth_user_id) do nothing;
```

4. Kiểm tra bằng admin rằng INSERT tạo đúng một membership; unique auth_user_id ngăn một login gắn nhiều store trong MVP. Seed không tạo account/default password hay membership. Tài khoản chưa tạo/gán quyền: **OWNER_BOOTSTRAP_REQUIRED** cho project đó. Test users local dùng password random trong memory, không phải owner cho quán thực.

## UI Gemini đã tích hợp

`OwnerLoginSection.tsx` dùng useActionState và shared type, login page render safe query reason; dashboard page dưới guard gắn OwnerShell/logoutAction; OwnerHeader dùng form action/useFormStatus. Đã kiểm tra Next-rendered form POST qua production HTTP: owner thành công, nonmember/sai password denied, logout/reload bị chặn, cookie refresh hoạt động. HTTP suite dùng cookie jar thủ công; chưa kiểm tra JS hydration/visual browser. Dashboard vẫn dùng fixture UI, chưa có business API ở P1-C02.

Chạy lại local smoke theo [DB_NOTES](P1_C02_DB_NOTES.md): `node tests/db/http-smoke.mjs` với P1C02_LOCAL_WORKDIR. Suite build với public env local trong process, tạo/xóa Auth users random và dừng test server; không sửa .env.local. Khi cấu hình project dev thật, cần set public env **trước build** và bootstrap owner bằng admin như trên.
