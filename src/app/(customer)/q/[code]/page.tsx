import type { Metadata } from 'next';
import { CustomerQRContainer } from '@/components/customer/CustomerQRContainer';

interface CustomerQREntryPageProps {
  params: Promise<{ code: string }>;
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
 * - Tự động phân giải QR (R01) và hiển thị đúng ngữ cảnh; yêu cầu xác thực bàn nếu là QR tại bàn.
 * - Nạp thực đơn công khai (R03) thời gian thực từ máy chủ, hiển thị skeleton đồng bộ khi tải.
 */
export default async function CustomerQREntryPage({
  params,
}: CustomerQREntryPageProps) {
  const { code } = await params;

  return (
    <main className="min-h-screen bg-[#F5F6F5]">
      <CustomerQRContainer
        qrCode={code}
        categories={[]}
        items={[]}
      />
    </main>
  );
}
