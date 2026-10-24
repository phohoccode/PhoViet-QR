import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VietQrPaymentSettingsCard } from '@/components/owner/settings/VietQrPaymentSettingsCard';

describe('VietQrPaymentSettingsCard — VietQR Integration in Owner Settings', () => {
  it('renders VietQR active integrated status badge and metadata view-only', () => {
    const html = renderToStaticMarkup(
      React.createElement(VietQrPaymentSettingsCard, {})
    );

    // Header & Trạng thái tích hợp
    expect(html).toContain('3. Cổng thanh toán VietQR (Tự động chuyển khoản)');
    expect(html).toContain('Đang hoạt động');

    // Không còn dòng chữ placeholder cũ
    expect(html).not.toContain('Thiết lập ở giai đoạn sau');
    expect(html).not.toContain('Hiện không lưu cấu hình giả lập');

    // Thông tin nhà cung cấp & chuẩn kỹ thuật
    expect(html).toContain('VietQR · PayOS Gateway');
    expect(html).toContain('Xác thực chữ ký HMAC-SHA256');
    expect(html).toContain('50+ ngân hàng Việt Nam');
  });

  it('renders Webhook endpoint address and POST Webhook Endpoint badge', () => {
    const html = renderToStaticMarkup(
      React.createElement(VietQrPaymentSettingsCard, {})
    );

    expect(html).toContain('/api/webhooks/payments/payos');
    expect(html).toContain('POST Webhook Endpoint');
    expect(html).toContain('Địa chỉ Webhook nhận thông báo chuyển khoản tự động');
    expect(html).toContain('Chép URL');
  });

  it('renders quick action button to inspect orders', () => {
    const html = renderToStaticMarkup(
      React.createElement(VietQrPaymentSettingsCard, {
        onNavigateToOrders: () => {},
      })
    );

    expect(html).toContain('Xem đơn hàng');
    expect(html).toContain('Kiểm tra kết nối');
    expect(html).toContain('Thời hạn mã VietQR: 15 phút');
  });
});
