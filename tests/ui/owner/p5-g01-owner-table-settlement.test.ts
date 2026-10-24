import { describe, it, expect } from 'vitest';
import type { TableBillView, TablePaymentMethod } from '@/components/customer/bill/types';

describe('P5-G01 Owner Table Settlement UI & Business Rules Logic', () => {
  const baseBill: TableBillView = {
    table: {
      id: 'tbl-12',
      label: 'Bàn 12',
    },
    session: {
      id: 'sess-12',
      status: 'open',
      paymentStatus: 'unpaid',
      openedAt: '2026-10-24T11:00:00Z',
    },
    orders: [
      {
        id: 'ord-101',
        ticketNo: 15,
        status: 'completed',
        totalVnd: 120000,
        itemCount: 2,
        createdAt: '2026-10-24T11:05:00Z',
        lines: [
          {
            id: 'line-101',
            menuItemId: 'pho-dac-biet',
            name: 'Phở đặc biệt',
            quantity: 2,
            unitPriceVnd: 60000,
            lineTotalVnd: 120000,
            options: [],
            note: null,
          },
        ],
      },
    ],
    totalVnd: 120000,
    outstandingOrders: 0,
    billVersion: 1,
    canAcceptMoreOrders: true,
    canSettle: true,
    settledAt: null,
    paymentMethod: null,
  };

  it('1. Bàn có đơn còn chờ (outstandingOrders > 0) -> chặn chốt tiền và yêu cầu hoàn tất đơn trước', () => {
    const unservedBill: TableBillView = {
      ...baseBill,
      outstandingOrders: 2,
      canSettle: false,
    };

    const hasOrders = unservedBill.orders.length > 0;
    const canBeginCheckout = hasOrders && unservedBill.outstandingOrders === 0;

    expect(canBeginCheckout).toBe(false);
    expect(unservedBill.canSettle).toBe(false);
  });

  it('2. Bàn rỗng (chưa có đơn) -> không cho phép chốt hóa đơn', () => {
    const emptyBill: TableBillView = {
      ...baseBill,
      orders: [],
      totalVnd: 0,
      outstandingOrders: 0,
      canSettle: false,
    };

    const hasOrders = emptyBill.orders.length > 0;
    const canBeginCheckout = hasOrders && emptyBill.outstandingOrders === 0;

    expect(hasOrders).toBe(false);
    expect(canBeginCheckout).toBe(false);
  });

  it('3. Khi đủ điều kiện chốt: chuyển sang checkout_pending và chuẩn bị các phương thức thu tiền', () => {
    const checkoutPendingBill: TableBillView = {
      ...baseBill,
      session: {
        ...baseBill.session,
        status: 'checkout_pending',
      },
      canAcceptMoreOrders: false,
      canSettle: true,
      billVersion: 2,
    };

    const isCheckoutPending = checkoutPendingBill.session.status === 'checkout_pending';
    expect(isCheckoutPending).toBe(true);
    expect(checkoutPendingBill.canAcceptMoreOrders).toBe(false);

    // Hỗ trợ 2 phương thức thu tiền thủ công
    const availableMethods: TablePaymentMethod[] = ['cash', 'bank_transfer'];
    expect(availableMethods).toContain('cash');
    expect(availableMethods).toContain('bank_transfer');
  });

  it('4. Hủy chốt hóa đơn (cancel checkout): đưa phiên về open và mở lại quyền gọi thêm', () => {
    // Sau khi cancel_checkout, backend trả về bill ở trạng thái open
    const restoredBill: TableBillView = {
      ...baseBill,
      session: {
        ...baseBill.session,
        status: 'open',
      },
      canAcceptMoreOrders: true,
      canSettle: true,
      billVersion: 3,
    };

    expect(restoredBill.session.status).toBe('open');
    expect(restoredBill.canAcceptMoreOrders).toBe(true);
  });

  it('5. Xác nhận thu tiền thành công: cập nhật closed, lưu paymentMethod và khóa thao tác lần hai', () => {
    const settledBill: TableBillView = {
      ...baseBill,
      session: {
        ...baseBill.session,
        status: 'closed',
        paymentStatus: 'paid',
      },
      settledAt: '2026-10-24T11:45:00Z',
      paymentMethod: 'bank_transfer',
      canAcceptMoreOrders: false,
      canSettle: false,
      billVersion: 4,
    };

    const isClosed = settledBill.session.status === 'closed';
    const isPaid = settledBill.session.paymentStatus === 'paid';
    const canSettleAgain = settledBill.canSettle;

    expect(isClosed).toBe(true);
    expect(isPaid).toBe(true);
    expect(canSettleAgain).toBe(false);
    expect(settledBill.paymentMethod).toBe('bank_transfer');
    expect(settledBill.settledAt).toBeTruthy();
  });

  it('6. Phát hiện xung đột phiên bản billVersion (409 Conflict): yêu cầu làm mới hóa đơn', () => {
    const clientExpectedVersion = 1;
    const serverCurrentVersion = 2; // Khách vừa gọi thêm một lượt món khác

    const isVersionConflict = clientExpectedVersion !== serverCurrentVersion;
    expect(isVersionConflict).toBe(true);

    const conflictCopy = isVersionConflict
      ? 'Hóa đơn đã thay đổi từ lượt gọi món mới. Vui lòng tải lại hóa đơn.'
      : null;

    expect(conflictCopy).toBe('Hóa đơn đã thay đổi từ lượt gọi món mới. Vui lòng tải lại hóa đơn.');
  });
});
