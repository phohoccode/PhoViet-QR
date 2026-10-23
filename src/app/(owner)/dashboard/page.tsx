import type { Metadata } from 'next';
import { signOutOwnerAction } from '@/features/owner/auth-actions';
import { OwnerShell } from '@/components/owner/OwnerShell';
import {
  MOCK_STORE,
  MOCK_OWNER_ORDERS,
  MOCK_TABLES_LIST,
  MOCK_MENU_ITEMS,
} from '@/lib/mocks/ui-preview';

export const metadata: Metadata = {
  title: 'Quản lý quán | Phở Việt QR',
  description: 'Hệ thống quản lý đơn hàng và bàn POS tối giản dành cho chủ quán.',
};

/**
 * Trang Chủ quán (Owner Dashboard) — /dashboard
 *
 * Được bảo vệ bởi Server Layout Guard (src/app/(owner)/dashboard/layout.tsx):
 * - requireOwner() kiểm tra session Supabase thật và quyền owner_members.
 * - Guest chưa đăng nhập tự động chuyển hướng về /login.
 * - User không đủ quyền bị chuyển hướng về /login?reason=access_denied.
 * - Nút Đăng xuất kết nối trực tiếp tới Server Action signOutOwnerAction của Codex P1-C02.
 */
export default function OwnerDashboardPage() {
  return (
    <OwnerShell
      storeName={MOCK_STORE.name}
      orders={MOCK_OWNER_ORDERS}
      tables={MOCK_TABLES_LIST}
      menuItems={MOCK_MENU_ITEMS}
      ownerName="Chủ quán"
      roleLabel="Quản lý"
      logoutAction={signOutOwnerAction}
    />
  );
}
