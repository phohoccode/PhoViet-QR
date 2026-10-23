import type { Metadata } from 'next';
import { CustomerQRContainer } from '@/components/customer/CustomerQRContainer';
import { MOCK_CATEGORIES, MOCK_MENU_ITEMS } from '@/lib/mocks/ui-preview';

interface CustomerQREntryPageProps {
  params: Promise<{ code: string }>;
  searchParams?: Promise<{ demoState?: string }>;
}

export const metadata: Metadata = {
  title: 'Đặt món QR | Phở Việt QR',
  description: 'Trang chào và thực đơn gọi món tối giản bằng mã QR cho khách tại bàn hoặc mang đi.',
};

/**
 * Trang Đặt món bằng mã QR (Customer QR Entry) — /q/[code]
 *
 * Triển khai theo tiêu chuẩn Minimal Emerald POS (P2-G01):
 * - URL thống nhất cho cả hai chế độ: Tại bàn (Table) và Mang đi (Takeaway).
 * - Tự động phân giải QR và hiển thị đúng ngữ cảnh; yêu cầu xác thực bàn nếu là QR tại bàn.
 * - Hỗ trợ query ?demoState=takeaway|unverified|verified|invalid_qr|no_session|rate_limited để kiểm thử toàn diện UX states.
 * - Menu preview đồng nhất, sẵn sàng gắn API menu thực tế khi Codex bàn giao P2-C01.
 */
export default async function CustomerQREntryPage({
  params,
  searchParams,
}: CustomerQREntryPageProps) {
  const { code } = await params;
  const query = await searchParams;

  // Tách biệt hoàn toàn: demoState chỉ được kích hoạt trong môi trường dev / preview / test
  const isDevOrTest = process.env.NODE_ENV !== 'production';
  const demoState = isDevOrTest ? (query?.demoState || null) : null;

  return (
    <main className="min-h-screen bg-[#F5F6F5]">
      <CustomerQRContainer
        qrCode={code}
        categories={MOCK_CATEGORIES}
        items={MOCK_MENU_ITEMS}
        demoState={demoState}
      />
    </main>
  );
}
