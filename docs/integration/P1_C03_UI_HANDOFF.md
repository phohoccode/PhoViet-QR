# P1-C03 — UI integration handoff

Ngày 23/10/2026 · contract v1-draft không đổi · Codex backend/integration, Gemini presentation.

## Routes và ownership hiện tại

| Route | Source/thực trạng |
| --- | --- |
| / | src/app/page.tsx: landing trung tính “Ứng dụng đang được chuẩn bị”; không giả QR/session |
| /login | Gemini: src/app/(owner)/login/page.tsx → OwnerLoginSection → OwnerLoginForm |
| /dashboard | Codex: dashboard/layout.tsx await requireOwner(); Gemini: dashboard/page.tsx → OwnerShell |
| /api/owner/auth/refresh | Codex: utility cookie refresh; không CRUD; redirect fixed dashboard/login, no-store |
| /q/[code], /order/[publicId] | Chưa triển khai; HTTP test locator trả 404, không fake success |

Không auth middleware/proxy toàn app. Public home/login/static assets không bị redirect. Guest API, webhook ở phase sau phải có guard riêng theo scope; dashboard layout không bảo vệ các API đó.

## Auth interface chính thức, không CONTRACT_MISMATCH

Import `@/features/owner/auth-actions`:

```ts
type OwnerLoginActionState = {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors?: { email?: string; password?: string };
};
signInOwnerAction(previousState: OwnerLoginActionState, formData: FormData): Promise<OwnerLoginActionState>;
signOutOwnerAction(): Promise<void>;
```

OwnerLoginSection đã gọi `useActionState(signInOwnerAction, {status:'idle'})`, truyền `action`, `actionState`, `isPending`, `systemMessage` sang OwnerLoginForm. UI import chung type, giữ form names email/password. Email trim/validate; password không trim, không echo. Không gửi storeId/role/isOwner để cấp quyền: backend bỏ qua chúng và lấy membership theo user đã được auth.getUser() xác minh. Test nonmember có gửi các field giả vẫn bị từ chối.

| Kết quả | Hành vi |
| --- | --- |
| Input sai | status:error + fieldErrors.email/password và message tiếng Việt |
| Account/password sai, thiếu membership | Cùng thông báo “Không thể đăng nhập…”; không account enumeration/provider/SQL details |
| Sign-in thành công | Server redirect /dashboard ngoài provider try/catch; không success mock/client router bypass |
| Guest mở dashboard | Server 307 /login, hoạt động với HTML form/không cần JS |
| Auth user thiếu membership | /login?reason=access_denied; login page allowlist safe message |
| Cấu hình/backend không khả dụng | /login?reason=service_unavailable; message an toàn |
| Logout | Supabase signOut scope local, xóa auth cookie, 303 /login; reload dashboard bị chặn |
| Logout lỗi | Server action báo lỗi tiếng Việt an toàn; chưa có inline error adapter cho logout (request bên dưới) |

OwnerHeader nhận `logoutAction?: () => void | Promise<void>` qua OwnerShell. Hai nút mobile/desktop đặt trong form action, useFormStatus quản lý pending/disabled. Các props ownerName/roleLabel/storeName là presentation, không phải quyền. Dashboard hiện truyền ownerName “Chủ quán”, roleLabel “Quản lý”, storeName=MOCK_STORE.name; không có email/name/profile thật trong props và chưa đọc store thật. Gemini đã thêm `?tab=orders|tables|menu|settings` allowlist → `initialTab`; đây chỉ là UI state, không thay quyền truy cập server.

Server helpers: `@/server/auth/require-owner` export getCurrentOwner/requireOwner, context `{authUserId,storeId}`; typed forbidden/unavailable/refresh_required. RSC cookies read-only; refreshRequired dẫn route writable, không nuốt cookie writes. Next render control flow được unstable_rethrow trước mapping lỗi auth. Cookie host-only Path=/, HttpOnly, SameSite=Lax, Secure ở production. Browser Supabase helper chỉ public/RLS data; không đọc session HttpOnly, không dùng localStorage JWT để xác thực.

## Foundation wiring hoàn tất

Codex bổ sung Be Vietnam Pro qua next/font/google trong src/app/layout.tsx **theo yêu cầu P1_G01_REVIEW §4**, weights 400/500/600/700, Vietnamese/Latin, variable --font-sans, display swap. CSS Gemini đã dùng variable này và import theme.css nên không sửa CSS/theme. Next self-host asset sau build; lần build đầu cần tải font, đã build thành công. Không cài package UI mới hoặc chạy shadcn add/init: lucide-react đã có, chưa có request component shadcn cụ thể. components.json là metadata/alias, không chứng minh đã có component shadcn; @/components/ui/utils chưa được dùng/tạo.

## Preview an toàn và UI_INTEGRATION_REQUEST

Auth là thật; dashboard vẫn fixture UI: orders/tables/menu lấy từ src/lib/mocks/ui-preview.ts. Không nhập dữ liệu quán thật hoặc secrets vào fixture. Các nút claim/ready/table/menu/settings preview không chứng minh có API thật; chưa đưa preview vào vận hành. Không tạo route public để bypass guard xem dashboard. Dùng account dev có membership để xem shell, giữ customer preview trong components/fixtures cho Gemini cho tới Phase 2.

- **UI_INTEGRATION_REQUEST UI-P1-01 (không chặn backend auth):** `@/components/owner/OwnerShell` và `@/components/owner/OwnerHeader`: khi muốn hỗ trợ lỗi logout inline, thêm wrapper Client Component do Gemini sở hữu để bắt safe action failure và render alert, vẫn giữ server redirect thành công/useFormStatus; không catch redirect ở backend. Hiện failure do Next action boundary xử lý, không báo logout thành công giả.
- **UI_INTEGRATION_REQUEST UI-P1-02 (trước pilot):** Gemini đánh dấu rõ dashboard fixture/preview và khóa các business CTA chưa có adapter. Không dùng thao tác preview làm bằng chứng DB đổi trạng thái. Phase sau nhận adapter thật thì thay fixture, không thêm endpoint giả.

Không cần thay interface để đăng nhập/đăng xuất thành công. Đã đọc P1_G01/P1_G02; P1_G03_REVIEW chưa tồn tại ở lần đối chiếu. UI customer/owner mới xuất hiện đồng thời thuộc Gemini; Codex không ghi/cherry-pick/reset các file đó. Visual/hydration/responsive QA vẫn do Gemini; HTTP suite không được gọi là browser E2E.
