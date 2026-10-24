import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
import type { OrderDetail, TakeawayOrderSummary } from '../../docs/contracts/types';
import { isPaymentReviewRequired } from '@/lib/validations/orders';
import { OrderQueueCard } from '@/components/owner/orders/OrderQueueCard';
import { OrderDetailPanel } from '@/components/owner/orders/OrderDetailPanel';
import { OrderTrackingView } from '@/components/customer/order/OrderTrackingView';

describe('P4-C04 / F08 Acceptance: Takeaway Payment Review Hold UI', () => {
  const storeId = 'store-test-p4-c04';

  const mockHeldPreparingOrder: OrderDetail = {
    id: 'c4000000-0000-4000-8000-000000000001',
    storeId,
    type: 'takeaway',
    tableSessionId: null,
    table: null,
    paymentReviewRequired: true,
    status: 'preparing',
    statusLabel: 'Đang làm',
    fulfillmentStatus: 'preparing',
    paymentStatus: 'paid',
    ticketNo: 42,
    serviceDate: '2026-10-24',
    acceptedAt: '2026-10-24T08:00:00Z',
    totalVnd: 60000,
    itemCount: 1,
    createdAt: '2026-10-24T08:00:00Z',
    updatedAt: '2026-10-24T08:05:00Z',
    version: 3,
    lines: [
      {
        id: 'line-01',
        menuItemId: 'item-01',
        name: 'Phở Bò Tái',
        baseUnitPriceVnd: 60000,
        options: [],
        unitPriceVnd: 60000,
        quantity: 1,
        lineTotalVnd: 60000,
        note: null,
      },
    ],
    note: null,
    payment: {
      kind: 'takeaway',
      intentId: 'intent-01',
      status: 'paid',
      statusLabel: 'Đã thanh toán',
      intentStatus: 'succeeded',
      amountVnd: 60000,
      currency: 'VND',
      reconciliationRequired: true,
      updatedAt: '2026-10-24T08:00:00Z',
      expiresAt: '2026-10-24T08:30:00Z',
    },
  };

  const mockHeldReadyOrder: OrderDetail = {
    ...mockHeldPreparingOrder,
    id: 'c4000000-0000-4000-8000-000000000002',
    status: 'ready',
    statusLabel: 'Sẵn sàng',
    fulfillmentStatus: 'ready',
  };

  const mockNormalPreparingOrder: OrderDetail = {
    ...mockHeldPreparingOrder,
    id: 'c4000000-0000-4000-8000-000000000003',
    paymentReviewRequired: false,
    payment: {
      ...mockHeldPreparingOrder.payment,
      reconciliationRequired: false,
    },
  };

  it('1. isPaymentReviewRequired phát hiện chính xác đơn bị hold theo cả summary và detail', () => {
    expect(isPaymentReviewRequired(mockHeldPreparingOrder)).toBe(true);
    expect(isPaymentReviewRequired(mockHeldReadyOrder)).toBe(true);
    expect(isPaymentReviewRequired(mockNormalPreparingOrder)).toBe(false);

    // Summary chỉ có paymentReviewRequired
    const summaryOnly: TakeawayOrderSummary = {
      id: 'c4000000-0000-4000-8000-000000000004',
      storeId,
      type: 'takeaway',
      tableSessionId: null,
      table: null,
      paymentReviewRequired: true,
      status: 'accepted',
      statusLabel: 'Chờ làm',
      fulfillmentStatus: 'awaiting_preparation',
      paymentStatus: 'paid',
      ticketNo: 43,
      serviceDate: '2026-10-24',
      acceptedAt: '2026-10-24T08:10:00Z',
      totalVnd: 45000,
      itemCount: 1,
      createdAt: '2026-10-24T08:10:00Z',
      updatedAt: '2026-10-24T08:10:00Z',
      version: 2,
    };
    expect(isPaymentReviewRequired(summaryOnly)).toBe(true);
  });

  it('2. OrderQueueCard hiển thị huy hiệu "Cần đối soát" khi đơn Takeaway bị hold review', () => {
    const heldHtml = renderToStaticMarkup(
      React.createElement(OrderQueueCard, {
        order: mockHeldPreparingOrder,
        isSelected: false,
        onSelect: () => {},
      })
    );
    expect(heldHtml).toContain('Cần đối soát');
    expect(heldHtml).toContain('Đang làm');

    const normalHtml = renderToStaticMarkup(
      React.createElement(OrderQueueCard, {
        order: mockNormalPreparingOrder,
        isSelected: false,
        onSelect: () => {},
      })
    );
    expect(normalHtml).not.toContain('Cần đối soát');
  });

  it('3. OrderDetailPanel hiển thị cảnh báo và KHÓA nút "Đã làm xong" khi đơn preparing bị hold', () => {
    const heldHtml = renderToStaticMarkup(
      React.createElement(OrderDetailPanel, {
        order: mockHeldPreparingOrder,
      })
    );

    // Có cảnh báo tạm giữ đối soát
    expect(heldHtml).toContain('Đơn hàng đang bị tạm giữ để đối soát thanh toán');
    expect(heldHtml).toContain('PAYMENT_REVIEW_REQUIRED');

    // Nút "Đã làm xong" bị ẩn / khóa hoàn toàn để bảo vệ API contract 409
    expect(heldHtml).not.toContain('Đã làm xong (Chuyển sang Sẵn sàng)');
  });

  it('4. OrderDetailPanel hiển thị cảnh báo và KHÓA nút "Xác minh nhận món & Giao đơn" khi đơn ready bị hold', () => {
    const heldHtml = renderToStaticMarkup(
      React.createElement(OrderDetailPanel, {
        order: mockHeldReadyOrder,
      })
    );

    expect(heldHtml).toContain('Đơn hàng đang bị tạm giữ để đối soát thanh toán');
    expect(heldHtml).not.toContain('Xác minh nhận món & Giao đơn');
  });

  it('5. OrderDetailPanel cho phép nút thao tác khi đơn KHÔNG bị hold', () => {
    const normalHtml = renderToStaticMarkup(
      React.createElement(OrderDetailPanel, {
        order: mockNormalPreparingOrder,
      })
    );

    expect(normalHtml).not.toContain('Đơn hàng đang bị tạm giữ để đối soát thanh toán');
    expect(normalHtml).toContain('Đã làm xong (Chuyển sang Sẵn sàng)');
  });

  it('6. OrderTrackingView (Khách hàng) hiển thị cảnh báo đối soát và ẨN thẻ mã nhận món khi bị hold', () => {
    const heldHtml = renderToStaticMarkup(
      React.createElement(OrderTrackingView, {
        orderId: mockHeldReadyOrder.id,
        initialOrder: mockHeldReadyOrder,
      })
    );

    // Hiển thị banner chờ đối soát
    expect(heldHtml).toContain('Đơn hàng đang chờ đối soát thanh toán');
    expect(heldHtml).toContain('Đang đối soát thanh toán VietQR');

    // Ẩn thẻ mã nhận món (TakeawayPickupCard) để không giục khách đến quầy khi chưa thể giao
    expect(heldHtml).not.toContain('Món của bạn đã sẵn sàng!');
    expect(heldHtml).not.toContain('Mã nhận món 6 chữ số');
  });
});
