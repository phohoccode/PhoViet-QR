import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoreAdmissionControlCard } from '@/components/owner/settings/StoreAdmissionControlCard';
import { fetchOrderingSettings, patchOrderingSettings } from '@/features/owner/api-client';

describe('StoreAdmissionControlCard — Admission Control Integration & UI', () => {
  it('renders both Dine-in and Takeaway channels with independent statuses', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoreAdmissionControlCard, {
        masterAccepting: true,
        dineInAccepting: true,
        takeawayAccepting: false,
      })
    );

    // Header & description
    expect(html).toContain('Tiếp nhận đơn hàng quán (Admission Control)');
    expect(html).toContain('Tạm dừng hoặc mở nhận đơn độc lập giữa khách dùng tại bàn và mua mang đi');

    // Dine-in channel: open
    expect(html).toContain('Dùng tại bàn');
    expect(html).toContain('QR cố định gắn bàn');
    expect(html).toContain('Khách tại bàn có thể đặt món');

    // Takeaway channel: paused
    expect(html).toContain('Mua mang đi');
    expect(html).toContain('QR quầy thanh toán VietQR');
    expect(html).toContain('Khách chỉ có thể xem menu');
  });

  it('renders Master Gate control in header and reflects effective availability when Master Gate is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoreAdmissionControlCard, {
        masterAccepting: false,
        dineInAccepting: true,
        takeawayAccepting: true,
      })
    );

    // Header Master Gate toggle button
    expect(html).toContain('Trạng thái quán:');
    expect(html).toContain('Tạm ngừng nhận đơn');

    // Master Gate warning banner
    expect(html).toContain('Quán đang tạm ngừng nhận đơn.');
    expect(html).toContain('Cả hai hình thức Tại bàn và Mang đi đều đang tạm dừng.');

    // Effective availability: even though raw flags were true, effective status is paused!
    expect(html).not.toContain('Khách tại bàn có thể đặt món');
    expect(html).toContain('Tạm dừng (do công tắc tổng đang tắt)');
    expect(html).toContain('Mở lại');
  });

  it('renders pause/resume buttons for each channel without placeholder text', () => {
    const html = renderToStaticMarkup(
      React.createElement(StoreAdmissionControlCard, {
        masterAccepting: true,
        dineInAccepting: true,
        takeawayAccepting: true,
      })
    );

    expect(html).toContain('aria-label="Tạm dừng nhận đơn tại bàn"');
    expect(html).toContain('aria-label="Tạm dừng nhận đơn mang đi"');
    expect(html).not.toContain('Đang chờ tích hợp API kiểm soát tiếp nhận đơn từ Codex.');
  });

  it('exports fetchOrderingSettings and patchOrderingSettings API client functions', () => {
    expect(typeof fetchOrderingSettings).toBe('function');
    expect(typeof patchOrderingSettings).toBe('function');
  });
});
