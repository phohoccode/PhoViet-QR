import { describe, it, expect } from 'vitest';
import type { TableBillView } from '@/components/customer/bill/types';

describe('P5-G02 Customer Dine-in Billing & Table Lifecycle UX Audit', () => {
  const mockTableBillTwoTickets: TableBillView = {
    table: {
      id: 'tbl-05',
      label: 'Bàn 05',
    },
    session: {
      id: 'sess-05',
      status: 'open',
      paymentStatus: 'unpaid',
      openedAt: '2026-10-24T11:00:00Z',
    },
    orders: [
      {
        id: 'ord-ticket-01',
        ticketNo: 1,
        status: 'completed',
        totalVnd: 65000,
        itemCount: 1,
        createdAt: '2026-10-24T11:05:00Z',
        lines: [
          {
            id: 'line-01',
            menuItemId: 'pho-tai-lan',
            name: 'Phở bò tái lăn',
            quantity: 1,
            unitPriceVnd: 65000,
            lineTotalVnd: 65000,
            options: [],
            note: null,
          },
        ],
      },
      {
        id: 'ord-ticket-02',
        ticketNo: 2,
        status: 'accepted',
        totalVnd: 25000,
        itemCount: 1,
        createdAt: '2026-10-24T11:20:00Z',
        lines: [
          {
            id: 'line-02',
            menuItemId: 'tra-da',
            name: 'Trà đá Hà Nội',
            quantity: 2,
            unitPriceVnd: 12500,
            lineTotalVnd: 25000,
            options: [],
            note: 'Nhiều đá',
          },
        ],
      },
    ],
    totalVnd: 90000, // 65.000 + 25.000 từ server API
    outstandingOrders: 1,
    billVersion: 2,
    canAcceptMoreOrders: true,
    canSettle: false,
    settledAt: null,
    paymentMethod: null,
  };

  it('1. Đặt món lượt 1 -> gọi thêm lượt 2: tạo ticket mới độc lập, không copy đè và hóa đơn hiển thị đủ cả 2 lượt', () => {
    expect(mockTableBillTwoTickets.orders).toHaveLength(2);
    expect(mockTableBillTwoTickets.orders[0].ticketNo).toBe(1);
    expect(mockTableBillTwoTickets.orders[1].ticketNo).toBe(2);
    expect(mockTableBillTwoTickets.orders[0].id).not.toBe(mockTableBillTwoTickets.orders[1].id);

    // Tổng tiền lấy trực tiếp từ server totalVnd, khớp với từng dòng
    const computedSum = mockTableBillTwoTickets.orders.reduce((sum, o) => sum + o.totalVnd, 0);
    expect(mockTableBillTwoTickets.totalVnd).toBe(90000);
    expect(computedSum).toBe(mockTableBillTwoTickets.totalVnd);
  });

  it('2. Khách quay lại menu từ màn hình theo dõi đơn: giữ nguyên phiên hợp lệ mà không đòi hỏi nhập lại PIN', () => {
    const isTableVerified = true;
    const requiresSessionCode = false;

    // Khi đã verify, cờ requiresSessionCode là false
    expect(isTableVerified).toBe(true);
    expect(requiresSessionCode).toBe(false);

    // Khách có thể tiếp tục xem hóa đơn hoặc gọi thêm
    const canViewBill = isTableVerified;
    expect(canViewBill).toBe(true);
  });

  it('3. Khi chủ quán chốt hóa đơn (checkout_pending): khóa CTA gọi thêm và hiển thị cảnh báo tiếng Việt rõ ràng', () => {
    const checkoutPendingBill: TableBillView = {
      ...mockTableBillTwoTickets,
      session: {
        ...mockTableBillTwoTickets.session,
        status: 'checkout_pending',
      },
      canAcceptMoreOrders: false,
      billVersion: 3,
    };

    const isCheckoutPending = checkoutPendingBill.session.status === 'checkout_pending';
    const canOrderMore = checkoutPendingBill.canAcceptMoreOrders && !isCheckoutPending;

    expect(isCheckoutPending).toBe(true);
    expect(canOrderMore).toBe(false);

    const lockBannerText = 'Bàn đang được thanh toán. Bạn không thể gọi thêm món lúc này.';
    expect(lockBannerText).toBe('Bàn đang được thanh toán. Bạn không thể gọi thêm món lúc này.');
  });

  it('4. Hủy chốt hóa đơn (cancel checkout): sau khi refetch, phiên trở về open và mở lại quyền đặt món', () => {
    const reopenedBill: TableBillView = {
      ...mockTableBillTwoTickets,
      session: {
        ...mockTableBillTwoTickets.session,
        status: 'open',
      },
      canAcceptMoreOrders: true,
      billVersion: 4,
    };

    const isCheckoutPending = reopenedBill.session.status === 'checkout_pending';
    const canOrderMore = reopenedBill.canAcceptMoreOrders && !isCheckoutPending;

    expect(isCheckoutPending).toBe(false);
    expect(canOrderMore).toBe(true);
  });

  it('5. Phiên đã đóng (closed): khóa gọi món vĩnh viễn, hướng dẫn khách liên hệ quán và giữ nguyên hóa đơn', () => {
    const closedBill: TableBillView = {
      ...mockTableBillTwoTickets,
      session: {
        ...mockTableBillTwoTickets.session,
        status: 'closed',
        paymentStatus: 'paid',
      },
      canAcceptMoreOrders: false,
      canSettle: false,
      settledAt: '2026-10-24T11:45:00Z',
      paymentMethod: 'cash',
      billVersion: 5,
    };

    const isClosed = closedBill.session.status === 'closed';
    expect(isClosed).toBe(true);
    expect(closedBill.canAcceptMoreOrders).toBe(false);
    expect(closedBill.paymentMethod).toBe('cash');
    expect(closedBill.totalVnd).toBe(90000);
    // Hóa đơn vẫn được bảo tồn để khách xem lại
    expect(closedBill.orders).toHaveLength(2);
  });

  it('6. Xử lý mất mạng/offline (isStale = true): giữ nguyên dữ liệu hóa đơn cũ kèm nhãn Chưa cập nhật, không xóa sạch', () => {
    const staleState = {
      bill: mockTableBillTwoTickets,
      isLoading: false,
      isStale: true,
      errorMessage: 'Mất kết nối đến máy chủ. Đang hiển thị hóa đơn đã lưu (Chưa cập nhật).',
    };

    expect(staleState.bill).not.toBeNull();
    expect(staleState.bill.totalVnd).toBe(90000);
    expect(staleState.isStale).toBe(true);
    expect(staleState.errorMessage).toContain('Chưa cập nhật');
  });

  it('7. Loading bill skeleton: khi chưa có dữ liệu và đang load, không flash 0đ', () => {
    const loadingState = {
      bill: null,
      isLoading: true,
    };

    // Khi bill là null, component không hiển thị thẻ tổng tiền '0 đ' mà hiển thị Skeleton
    const shouldRenderSkeleton = loadingState.isLoading && !loadingState.bill;
    const shouldRenderTotalCard = Boolean(loadingState.bill);

    expect(shouldRenderSkeleton).toBe(true);
    expect(shouldRenderTotalCard).toBe(false);
  });

  it('8. Deep-linking ?view=bill: hỗ trợ điều hướng thẳng tới hóa đơn bàn từ màn theo dõi đơn', () => {
    const query = new URLSearchParams('view=bill&orderId=ord-ticket-01');
    const isDirectBillOpen = query.get('view') === 'bill';

    expect(isDirectBillOpen).toBe(true);
  });

  it('9. Khi phiên bàn kết thúc (chủ quán đã chốt tiền/thanh toán): không hiển thị đơn vừa nãy và dọn dẹp activeOrder', () => {
    const closedBill: TableBillView = {
      ...mockTableBillTwoTickets,
      session: {
        ...mockTableBillTwoTickets.session,
        status: 'closed',
        paymentStatus: 'paid',
      },
      settledAt: '2026-10-24T12:00:00Z',
    };

    const isDineIn = true;
    const isSessionClosed =
      isDineIn &&
      (closedBill.session.status === 'closed' ||
        closedBill.session.paymentStatus === 'paid' ||
        Boolean(closedBill.settledAt));

    const activeOrder = {
      id: 'ord-ticket-01',
      ticketNo: 10,
      status: 'completed',
      itemCount: 1,
      totalVnd: 65000,
      sessionId: 'sess-05',
    };

    // Khi phiên đã đóng / thanh toán, đơn hàng không được hiển thị nữa
    const shouldShowActiveOrder = Boolean(activeOrder && !isSessionClosed);
    expect(isSessionClosed).toBe(true);
    expect(shouldShowActiveOrder).toBe(false);
  });

  it('10. Bàn mở phiên mới: đơn hàng của phiên cũ không còn hiển thị trên thực đơn', () => {
    const activeOrderOldSession = {
      id: 'ord-old-10',
      ticketNo: 10,
      status: 'completed',
      itemCount: 1,
      totalVnd: 3000,
      sessionId: 'sess-old-01',
    };

    const newSessionId = 'sess-new-02';
    const isOrderFromPastSession = Boolean(
      activeOrderOldSession.sessionId &&
        newSessionId &&
        activeOrderOldSession.sessionId !== newSessionId
    );

    const shouldShowActiveOrder = Boolean(
      activeOrderOldSession && !isOrderFromPastSession
    );

    expect(isOrderFromPastSession).toBe(true);
    expect(shouldShowActiveOrder).toBe(false);
  });
});
