import type { Metadata } from 'next';
import { OwnerLoginSection } from '@/components/owner/auth/OwnerLoginSection';

export const metadata: Metadata = {
  title: 'Đăng nhập quản lý | Phở Việt QR',
  description: 'Trang đăng nhập tối giản dành cho chủ quán và quản trị viên hệ thống QR Ordering.',
};

interface OwnerLoginPageProps {
  searchParams: Promise<{ reason?: string }>;
}

/**
 * Trang Đăng nhập Quản lý (Owner Login) — /login
 *
 * Triển khai theo tiêu chuẩn Minimal Emerald POS (P1-G02 / P1-C02):
 * - Bố cục căn giữa màn hình trên nền canvas xám nhạt #F5F6F5.
 * - Form gói trong card trắng bo góc lớn (24px) với khoảng trắng thoáng đãng.
 * - Nối chính thức với Server Action signInOwnerAction từ Codex P1-C02.
 * - Xử lý thông báo reason an toàn từ guard (access_denied / service_unavailable).
 */
export default async function OwnerLoginPage({ searchParams }: OwnerLoginPageProps) {
  const params = await searchParams;
  let systemMessage: string | null = null;

  if (params?.reason === 'access_denied') {
    systemMessage = 'Tài khoản không có quyền quản lý quán. Vui lòng liên hệ quản trị viên.';
  } else if (params?.reason === 'service_unavailable') {
    systemMessage = 'Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau.';
  }

  return (
    <main className="min-h-screen w-full bg-[#F5F6F5] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Container đảm bảo căn giữa và giới hạn kích thước tối đa 440px theo chuẩn SaaS */}
      <div className="w-full max-w-[440px] flex flex-col items-center">
        <OwnerLoginSection systemMessage={systemMessage} />
      </div>
    </main>
  );
}
