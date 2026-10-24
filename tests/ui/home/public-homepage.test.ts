import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Home from '@/app/page';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HomeHero } from '@/components/home/HomeHero';
import { OrderingOptionsSection } from '@/components/home/OrderingOptionsSection';
import { HomeBenefitsSection } from '@/components/home/HomeBenefitsSection';
import { HowItWorksSection } from '@/components/home/HowItWorksSection';
import { HomeFooter } from '@/components/home/HomeFooter';

describe('UI Hotfix 01 — Public Homepage Friendly Copy Tests', () => {
  it('1. Trang chủ không còn hiển thị thông báo tạm thời "Ứng dụng đang được chuẩn bị."', () => {
    const html = renderToStaticMarkup(React.createElement(Home));
    expect(html).not.toContain('Ứng dụng đang được chuẩn bị.');
  });

  it('2. Header hiển thị tên hệ thống, navigation pills dễ hiểu và CTA Dành cho chủ quán', () => {
    const html = renderToStaticMarkup(React.createElement(HomeHeader));
    expect(html).toContain('QR Ordering');
    expect(html).toContain('Cách gọi món');
    expect(html).toContain('3 bước đặt món');
    expect(html).toContain('href="/login"');
    expect(html).toContain('Dành cho chủ quán');
  });

  it('3. Hero hiển thị tiêu đề thân thiện, các dòng lợi ích rõ ràng và thẻ điện thoại minh họa', () => {
    const html = renderToStaticMarkup(React.createElement(HomeHero));
    expect(html).toContain('<h1');
    expect(html).toContain('Quét mã QR tại quán,');
    expect(html).toContain('gọi món ngay trên điện thoại.');
    expect(html).toContain('Không cần tạo tài khoản');
    expect(html).toContain('Xem ảnh món &amp; giá rõ ràng');
    expect(html).toContain('Biết khi nào món nấu xong');
    expect(html).toContain('Màn hình gọi món trên điện thoại');
    expect(html).toContain('href="/login"');
  });

  it('4. Section 2 hình thức gọi món giải thích gần gũi, không dùng thuật ngữ chuyên ngành FIFO hay Takeaway', () => {
    const html = renderToStaticMarkup(React.createElement(OrderingOptionsSection));
    expect(html).toContain('Dùng tại bàn');
    expect(html).toContain('PIN 6 số');
    expect(html).toContain('Thanh toán khi kết thúc bữa ăn');

    expect(html).toContain('Mua mang về');
    expect(html).toContain('Thanh toán VietQR tự động');
    expect(html).toContain('Phục vụ đúng thứ tự');
    expect(html).toContain('mã nhận món 6 số');

    // Tuyệt đối không dùng thuật ngữ máy tính FIFO hay tiếng Anh không cần thiết
    expect(html).not.toContain('FIFO');
    expect(html).not.toContain('(Takeaway)');
    expect(html).not.toContain('Quét ngay');
  });

  it('5. Section Lợi ích thiết thực giải thích rõ website giúp gì cho khách và quán', () => {
    const html = renderToStaticMarkup(React.createElement(HomeBenefitsSection));
    expect(html).toContain('Website này giúp gì cho bạn?');
    expect(html).toContain('Dành cho bạn khi đến quán');
    expect(html).toContain('Dành cho Quán ăn &amp; Bếp');
    expect(html).toContain('Không cần vẫy tay gọi nhân viên');
    expect(html).toContain('Bếp nhận đơn tức thì, không sót bàn');
  });

  it('6. Section 3 bước hiển thị quy trình dễ hiểu và hướng dẫn thanh toán', () => {
    const html = renderToStaticMarkup(React.createElement(HowItWorksSection));
    expect(html).toContain('Chỉ 3 bước đơn giản');
    expect(html).toContain('Quét mã QR tại quán');
    expect(html).toContain('Chọn món yêu thích');
    expect(html).toContain('Thong thả nhận món');
    expect(html).toContain('Ăn tại bàn thanh toán khi dùng bữa xong');
    expect(html).toContain('Mua mang về chuyển khoản VietQR tự động');
  });

  it('7. Footer hiển thị đầy đủ thương hiệu, không dùng từ Minimal POS hay FIFO', () => {
    const html = renderToStaticMarkup(React.createElement(HomeFooter));
    expect(html).toContain('QR Ordering');
    expect(html).toContain('© 2026 QR Ordering');
    expect(html).toContain('href="/login"');
    expect(html).toContain('Dành cho chủ quán');

    // Không dùng thuật ngữ kỹ thuật
    expect(html).not.toContain('FIFO');
    expect(html).not.toContain('Minimal Emerald POS');
  });

  it('8. Cấu trúc ngữ nghĩa HTML trang chủ hoàn chỉnh (header, main, section, footer)', () => {
    const html = renderToStaticMarkup(React.createElement(Home));
    expect(html).toContain('<header');
    expect(html).toContain('<main');
    expect(html).toContain('<section');
    expect(html).toContain('<footer');
    expect(html).toContain('id="ordering-options"');
    expect(html).toContain('id="benefits"');
    expect(html).toContain('id="how-it-works"');
  });
});
