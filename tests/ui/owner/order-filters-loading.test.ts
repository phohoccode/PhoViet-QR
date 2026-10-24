import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrderFilters } from '@/components/owner/orders/OrderFilters';

describe('OrderFilters Loading Effects on Tab & Status Switch', () => {
  it('1. Hiển thị hiệu ứng loading bar và icon xoay khi chuyển sang tab Hàng đợi', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderFilters, {
        view: 'queue',
        onViewChange: () => {},
        typeFilter: 'all',
        onTypeChange: () => {},
        statusFilter: 'all',
        onStatusChange: () => {},
        totalOrders: 5,
        isLoading: true,
      })
    );

    expect(html).toContain('animate-indeterminate-bar');
    expect(html).toContain('animate-spin');
    expect(html).toContain('Hàng đợi');
  });

  it('2. Hiển thị spinner trên tab Lịch sử khi đang gọi API', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderFilters, {
        view: 'history',
        onViewChange: () => {},
        typeFilter: 'all',
        onTypeChange: () => {},
        statusFilter: 'all',
        onStatusChange: () => {},
        totalOrders: 0,
        isLoading: true,
      })
    );

    expect(html).toContain('animate-indeterminate-bar');
    expect(html).toContain('animate-spin');
    expect(html).toContain('Lịch sử');
  });

  it('3. Hiển thị spinner trên tab Thanh toán khi đang gọi API', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderFilters, {
        view: 'exceptions',
        onViewChange: () => {},
        typeFilter: 'all',
        onTypeChange: () => {},
        statusFilter: 'all',
        onStatusChange: () => {},
        totalOrders: 2,
        exceptionCount: 2,
        isLoading: true,
      })
    );

    expect(html).toContain('animate-spin');
    expect(html).toContain('Thanh toán');
  });

  it('4. Hiển thị spinner trên tab loại đơn Tại bàn và Mang đi khi loading', () => {
    const dineInHtml = renderToStaticMarkup(
      React.createElement(OrderFilters, {
        view: 'queue',
        onViewChange: () => {},
        typeFilter: 'dine_in',
        onTypeChange: () => {},
        statusFilter: 'all',
        onStatusChange: () => {},
        totalOrders: 3,
        isLoading: true,
      })
    );
    expect(dineInHtml).toContain('animate-spin');
    expect(dineInHtml).toContain('Tại bàn');

    const takeawayHtml = renderToStaticMarkup(
      React.createElement(OrderFilters, {
        view: 'queue',
        onViewChange: () => {},
        typeFilter: 'takeaway',
        onTypeChange: () => {},
        statusFilter: 'all',
        onStatusChange: () => {},
        totalOrders: 2,
        isLoading: true,
      })
    );
    expect(takeawayHtml).toContain('animate-spin');
    expect(takeawayHtml).toContain('Mang đi');
  });

  it('5. Hiển thị spinner trên các tab trạng thái Hàng đợi: Chờ làm, Đang làm, Sẵn sàng', () => {
    for (const st of ['accepted', 'preparing', 'ready'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(OrderFilters, {
          view: 'queue',
          onViewChange: () => {},
          typeFilter: 'all',
          onTypeChange: () => {},
          statusFilter: st,
          onStatusChange: () => {},
          totalOrders: 1,
          isLoading: true,
        })
      );
      expect(html).toContain('animate-spin');
    }
  });

  it('6. Hiển thị spinner trên các tab trạng thái Lịch sử: Đã phục vụ, Đã hủy', () => {
    for (const st of ['completed', 'cancelled'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(OrderFilters, {
          view: 'history',
          onViewChange: () => {},
          typeFilter: 'all',
          onTypeChange: () => {},
          statusFilter: st,
          onStatusChange: () => {},
          totalOrders: 1,
          isLoading: true,
        })
      );
      expect(html).toContain('animate-spin');
    }
  });

  it('7. Hiển thị spinner trên các tab trạng thái Thanh toán: Cần đối soát, Chờ thanh toán', () => {
    for (const st of ['payment_exception', 'pending_payment'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(OrderFilters, {
          view: 'exceptions',
          onViewChange: () => {},
          typeFilter: 'all',
          onTypeChange: () => {},
          statusFilter: st,
          onStatusChange: () => {},
          totalOrders: 1,
          isLoading: true,
        })
      );
      expect(html).toContain('animate-spin');
    }
  });

  it('8. Khi isLoading = false, không hiển thị spinner và thanh progress bar', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderFilters, {
        view: 'queue',
        onViewChange: () => {},
        typeFilter: 'all',
        onTypeChange: () => {},
        statusFilter: 'all',
        onStatusChange: () => {},
        totalOrders: 12,
        isLoading: false,
      })
    );

    expect(html).not.toContain('animate-indeterminate-bar');
    expect(html).not.toContain('animate-spin');
    expect(html).toContain('Tất cả (12)');
  });
});
