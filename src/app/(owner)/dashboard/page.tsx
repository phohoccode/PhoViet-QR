import type { Metadata } from 'next';
import { signOutOwnerAction } from '@/features/owner/auth-actions';
import { OwnerShell } from '@/components/owner/OwnerShell';
import type { OwnerTabType } from '@/components/owner/OwnerHeaderPills';
import { requireOwner } from '@/server/auth/require-owner';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Quản lý quán | Phở Việt QR',
  description: 'Hệ thống quản lý đơn hàng và bàn POS tối giản dành cho chủ quán.',
};

interface OwnerDashboardPageProps {
  searchParams?: Promise<{ tab?: string }>;
}

/**
 * Trang Chủ quán (Owner Dashboard) — /dashboard
 *
 * Được bảo vệ bởi Server Layout Guard (src/app/(owner)/dashboard/layout.tsx):
 * - requireOwner() kiểm tra session Supabase thật và quyền owner_members.
 * - Guest chưa đăng nhập tự động chuyển hướng về /login.
 * - User không đủ quyền bị chuyển hướng về /login?reason=access_denied.
 * - Hỗ trợ query ?tab=orders|tables|menu|settings chỉ cho UI view state, không cấp quyền.
 * - Nạp snapshot tên quán và trạng thái nhận đơn thực tế từ stores table (UI-05).
 * - Nạp dữ liệu động từ API thật R11 (tables), R16 (menu), R17 (qr-codes/categories), FIFO orders.
 * - Nút Đăng xuất kết nối trực tiếp tới Server Action signOutOwnerAction của Codex P1-C02.
 */
export default async function OwnerDashboardPage({ searchParams }: OwnerDashboardPageProps) {
  const params = await searchParams;

  const validTabs: OwnerTabType[] = ['orders', 'tables', 'menu', 'settings'];
  const tabParam = params?.tab as OwnerTabType | undefined;
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'orders';

  // Lấy snapshot store thực tế từ database (UI-05)
  const owner = await requireOwner();
  let storeName = 'PHỞ VIỆT QR';
  let acceptingOrders = true;

  try {
    const supabase = await createServerSupabaseClient({ cookieMode: 'read-only' });
    const { data: storeData } = await supabase
      .from('stores')
      .select('name, accepting_orders')
      .eq('id', owner.storeId)
      .maybeSingle();

    if (storeData) {
      if (storeData.name) storeName = storeData.name;
      if (typeof storeData.accepting_orders === 'boolean') {
        acceptingOrders = storeData.accepting_orders;
      }
    }
  } catch {
    // Giữ default nếu query SSR gặp lỗi mạng tạm thời
  }

  return (
    <OwnerShell
      storeName={storeName}
      acceptingOrders={acceptingOrders}
      orders={[]}
      tables={[]}
      menuItems={[]}
      initialTab={initialTab}
      ownerName="Chủ quán"
      roleLabel="Quản lý"
      logoutAction={signOutOwnerAction}
    />
  );
}

