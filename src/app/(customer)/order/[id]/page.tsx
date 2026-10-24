import type { Metadata } from 'next';
import { OrderTrackingView } from '@/components/customer/order/OrderTrackingView';

interface OrderTrackingPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ qrCode?: string }>;
}

export const metadata: Metadata = {
  title: 'Theo dõi tiến độ đơn hàng | Phở Việt QR',
  description: 'Trang theo dõi tiến độ chuẩn bị món ăn tại bàn theo thời gian thực.',
};

/**
 * Trang Theo Dõi Tiến Độ Đơn Hàng Khách Hàng — /order/[id]
 *
 * Tiêu chuẩn Minimal Emerald POS (P3-G01):
 * - Tự động tải OrderDetail từ GET /api/public/orders/:id (R05) qua session cookie.
 * - Hiển thị số thứ tự phiếu, bàn, stepper tiến độ (accepted -> preparing -> ready -> completed / cancelled).
 * - Hiển thị loading skeleton đồng bộ layout khi đang tải thông tin đơn.
 * - Tự động cập nhật tiến độ định kỳ khi màn hình active.
 * - Cho phép quay lại thực đơn để gọi thêm món bất cứ lúc nào.
 */
export default async function OrderTrackingPage({
  params,
  searchParams,
}: OrderTrackingPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const qrCode = query?.qrCode;

  return (
    <main className="min-h-screen bg-[#F5F6F5]">
      <OrderTrackingView
        orderId={id}
        qrCode={qrCode}
      />
    </main>
  );
}

