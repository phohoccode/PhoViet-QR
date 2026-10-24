import type { Metadata } from 'next';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeHero } from '@/components/home/HomeHero';
import { OrderingOptionsSection } from '@/components/home/OrderingOptionsSection';
import { HomeBenefitsSection } from '@/components/home/HomeBenefitsSection';
import { HowItWorksSection } from '@/components/home/HowItWorksSection';
import { HomeFooter } from '@/components/home/HomeFooter';

export const metadata: Metadata = {
  title: 'QR Ordering — Gọi món bằng điện thoại tại bàn & mang về',
  description:
    'Xem thực đơn, chọn món và gọi món trực tiếp bằng điện thoại tại quán. Hỗ trợ cả ngồi ăn tại bàn và mua mang về, tiện lợi và không cần cài đặt ứng dụng.',
  keywords: [
    'QR Ordering',
    'gọi món qua mã QR',
    'gọi món bằng điện thoại',
    'gọi món tại bàn',
    'đặt món mang về',
    'thực đơn điện tử',
  ],
};

/**
 * Trang chủ công khai (Public Homepage) — /
 *
 * Giới thiệu giải pháp gọi món qua mã QR trực tiếp tại quán:
 * - Header: Logo, navigation điều hướng các mục và CTA dành cho chủ quán (/login).
 * - Hero: Giới thiệu ngắn gọn trang web làm gì, giúp gì cho người dùng, kèm thẻ điện thoại minh họa.
 * - 2 cách gọi món: Ăn tại bàn (nhập mã bàn) và Mua mang về (chuyển khoản VietQR tự động).
 * - Lợi ích thiết thực: Giải thích rõ ràng website giúp ích gì cho thực khách và chủ quán.
 * - 3 bước đơn giản: Hướng dẫn người dùng các bước thực hiện trên điện thoại.
 * - Footer: Tinh gọn, thân thiện, không dùng thuật ngữ kỹ thuật hàn lâm.
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-[#F5F6F5] text-[#1D2522] flex flex-col font-sans selection:bg-[#E8F4F0] selection:text-[#1D725E]">
      <HomeHeader />
      <main className="flex-1">
        <HomeHero />
        <OrderingOptionsSection />
        <HomeBenefitsSection />
        <HowItWorksSection />
      </main>
      <HomeFooter />
    </div>
  );
}
