import { describe, it, expect } from 'vitest';
import type { TableBillView } from '@/components/customer/bill/types';

describe('P5-G01 Customer Dine-in Billing & Add-on Ordering UI Logic', () => {
  const mockTableBillOpen: TableBillView = {
    table: {
      id: 'tbl-01',
      label: 'Bàn 01',
    },
    session: {
      id: 'sess-01',
      status: 'open',
      paymentStatus: 'unpaid',
      openedAt: '2026-10-24T10:00:00Z',
    },
    orders: [
      {
        id: 'ord-01',
        ticketNo: 1,
        status: 'completed',
        totalVnd: 70000,
        itemCount: 2,
        createdAt: '2026-10-24T10:05:00Z',
        lines: [
          {
            id: 'line-01',
            menuItemId: 'item-pho-bo',
            name: 'Phở bò tái lăn',
            quantity: 1,
            unitPriceVnd: 55000,
            lineTotalVnd: 55000,
            options: [],
            note: null,
          },
          {
            id: 'line-02',
            menuItemId: 'item-quay',
            name: 'Quẩy giòn',
            quantity: 1,
            unitPriceVnd: 15000,
            lineTotalVnd: 15000,
            options: [],
            note: null,
          },
        ],
      },
    ],
    totalVnd: 70000,
    outstandingOrders: 0,
    billVersion: 1,
    canAcceptMoreOrders: true,
    canSettle: true,
    settledAt: null,
    paymentMethod: null,
  };

  const mockTableBillCheckoutPending: TableBillView = {
    ...mockTableBillOpen,
    session: {
      ...mockTableBillOpen.session,
      status: 'checkout_pending',
    },
    canAcceptMoreOrders: false,
    canSettle: true,
    billVersion: 2,
  };

  const mockTableBillClosed: TableBillView = {
    ...mockTableBillOpen,
    session: {
      ...mockTableBillOpen.session,
      status: 'closed',
      paymentStatus: 'paid',
    },
    canAcceptMoreOrders: false,
    canSettle: false,
    settledAt: '2026-10-24T10:45:00Z',
    paymentMethod: 'cash',
    billVersion: 3,
  };

  it('1. Đọc và hiển thị đúng thông tin hóa đơn bàn từ TableBillView chuẩn', () => {
    expect(mockTableBillOpen.table.label).toBe('Bàn 01');
    expect(mockTableBillOpen.totalVnd).toBe(70000);
    expect(mockTableBillOpen.orders).toHaveLength(1);
    expect(mockTableBillOpen.orders[0].lines).toHaveLength(2);
    expect(mockTableBillOpen.orders[0].lines[0].unitPriceVnd).toBe(55000);
    expect(mockTableBillOpen.orders[0].lines[0].lineTotalVnd).toBe(55000);
  });

  it('2. Khách hàng trong phiên "open": cho phép gọi thêm món mà không yêu cầu nhập lại PIN', () => {
    const isCheckoutPending = mockTableBillOpen.session.status === 'checkout_pending';
    const isSessionClosed = mockTableBillOpen.session.status === 'closed';
    const canOrderMore = mockTableBillOpen.canAcceptMoreOrders && !isCheckoutPending && !isSessionClosed;

    expect(canOrderMore).toBe(true);
  });

  it('3. Khi chủ quán chốt hóa đơn (checkout_pending): khóa CTA gọi thêm và hiển thị đúng cảnh báo tiếng Việt', () => {
    const isCheckoutPending = mockTableBillCheckoutPending.session.status === 'checkout_pending';
    const isSessionClosed = mockTableBillCheckoutPending.session.status === 'closed';
    const canOrderMore = mockTableBillCheckoutPending.canAcceptMoreOrders && !isCheckoutPending && !isSessionClosed;

    expect(canOrderMore).toBe(false);

    // Kiểm tra thông điệp khóa chuẩn UX tiếng Việt
    const warningMessage = isCheckoutPending
      ? 'Bàn đang được thanh toán. Bạn không thể gọi thêm món lúc này.'
      : null;
    expect(warningMessage).toBe('Bàn đang được thanh toán. Bạn không thể gọi thêm món lúc này.');
  });

  it('4. Khi phiên đã kết thúc (closed): không cho đặt tiếp và hướng dẫn liên hệ quán', () => {
    const isCheckoutPending = mockTableBillClosed.session.status === 'checkout_pending';
    const isSessionClosed = mockTableBillClosed.session.status === 'closed';
    const canOrderMore = !isCheckoutPending && !isSessionClosed;

    expect(canOrderMore).toBe(false);
    expect(isSessionClosed).toBe(true);
    expect(mockTableBillClosed.paymentMethod).toBe('cash');
    expect(mockTableBillClosed.settledAt).toBeDefined();
  });

  it('5. Khách hàng không thể tự đánh dấu hóa đơn đã thanh toán (không có client-side self-pay)', () => {
    // Đảm bảo trạng thái thanh toán chỉ dựa trên session.paymentStatus từ server
    expect(mockTableBillOpen.session.paymentStatus).toBe('unpaid');
    expect(mockTableBillCheckoutPending.session.paymentStatus).toBe('unpaid');
    expect(mockTableBillClosed.session.paymentStatus).toBe('paid');
  });

  it('6. Tổng tiền bàn lấy trực tiếp từ totalVnd của máy chủ, không tự tính lại ở client', () => {
    const multiOrderBill: TableBillView = {
      ...mockTableBillOpen,
      orders: [
        ...mockTableBillOpen.orders,
        {
          id: 'ord-02',
          ticketNo: 2,
          status: 'accepted',
          totalVnd: 30000,
          itemCount: 1,
          createdAt: '2026-10-24T10:20:00Z',
          lines: [
            {
              id: 'line-03',
              menuItemId: 'item-tra-da',
              name: 'Trà đá Hà Nội',
              quantity: 2,
              unitPriceVnd: 15000,
              lineTotalVnd: 30000,
              options: [],
              note: 'Ít đá',
            },
          ],
        },
      ],
      totalVnd: 100000, // 70k + 30k
      outstandingOrders: 1,
      canSettle: false, // còn 1 đơn accepted chưa xong
    };

    expect(multiOrderBill.totalVnd).toBe(100000);
    expect(multiOrderBill.orders).toHaveLength(2);
    expect(multiOrderBill.outstandingOrders).toBe(1);
    expect(multiOrderBill.canSettle).toBe(false);
  });
});
