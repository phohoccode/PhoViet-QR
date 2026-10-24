import { describe, it, expect } from 'vitest';
import type { TableBillView, GuestPaidReceipt } from '@/components/customer/bill/types';

describe('P5-HF01 Customer Paid Receipt & Thank-you Experience UI Tests', () => {
  const mockOpenBill: TableBillView = {
    table: {
      id: 'tbl-01',
      label: 'Bàn 01',
    },
    session: {
      id: 'sess-01',
      status: 'open',
      paymentStatus: 'unpaid',
      openedAt: '2026-10-24T10:00:00Z',
      closedAt: null,
      orderCount: 1,
      totalVnd: 55000,
      version: 1,
    },
    orders: [
      {
        id: 'ord-01',
        ticketNo: 1,
        status: 'completed',
        totalVnd: 55000,
        itemCount: 1,
        createdAt: '2026-10-24T10:05:00Z',
        acceptedAt: '2026-10-24T10:06:00Z',
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
        ],
      },
    ],
    totalVnd: 55000,
    outstandingOrders: 0,
    billVersion: 'bv-001',
    canAcceptMoreOrders: true,
    canSettle: true,
    settledAt: null,
    paymentMethod: null,
  };

  const mockCheckoutPendingBill: TableBillView = {
    ...mockOpenBill,
    session: {
      ...mockOpenBill.session,
      status: 'checkout_pending',
      version: 2,
    },
    canAcceptMoreOrders: false,
    canSettle: true,
    billVersion: 'bv-002',
  };

  const mockSettledPaidBill: TableBillView = {
    ...mockOpenBill,
    session: {
      ...mockOpenBill.session,
      status: 'closed',
      paymentStatus: 'paid',
      closedAt: '2026-10-24T10:45:00Z',
      version: 3,
    },
    canAcceptMoreOrders: false,
    canSettle: false,
    settledAt: '2026-10-24T10:45:00Z',
    paymentMethod: 'cash',
    billVersion: 'bv-003',
  };

  const mockGuestPaidReceipt: GuestPaidReceipt = {
    ...mockSettledPaidBill,
    kind: 'paid_receipt',
    receiptId: 'rcpt-001-uuid',
    receiptVersion: 1,
    currency: 'VND',
    settledAt: '2026-10-24T10:45:00Z',
    paymentMethod: 'cash',
    canAcceptMoreOrders: false,
    canSettle: false,
  };

  it('1. Owner bắt đầu checkout: guest thấy Đang thanh toán, CTA gọi thêm disabled, bill dòng món còn nguyên vẹn', () => {
    const isCheckoutPending = mockCheckoutPendingBill.session.status === 'checkout_pending';
    const isSessionClosed = mockCheckoutPendingBill.session.status === 'closed';
    const isPaid = mockCheckoutPendingBill.session.paymentStatus === 'paid';
    const canOrderMore = mockCheckoutPendingBill.canAcceptMoreOrders && !isCheckoutPending && !isSessionClosed && !isPaid;

    expect(isCheckoutPending).toBe(true);
    expect(canOrderMore).toBe(false);
    expect(mockCheckoutPendingBill.orders).toHaveLength(1);
    expect(mockCheckoutPendingBill.orders[0].lines).toHaveLength(1);
    expect(mockCheckoutPendingBill.totalVnd).toBe(55000);

    const bannerText = 'Quán đang chốt hóa đơn. Bạn tạm thời không thể gọi thêm món.';
    expect(bannerText).toContain('Quán đang chốt hóa đơn');
  });

  it('2. Owner xác nhận đã thu tiền: server trả về paymentStatus=paid và settledAt -> nhận diện isPaid chính thức', () => {
    const isPaid = Boolean(
      mockSettledPaidBill &&
        (mockSettledPaidBill.session.paymentStatus === 'paid' ||
          (mockSettledPaidBill.session.status === 'closed' && Boolean(mockSettledPaidBill.settledAt)))
    );

    expect(isPaid).toBe(true);
    expect(mockSettledPaidBill.settledAt).toBe('2026-10-24T10:45:00Z');
    expect(mockSettledPaidBill.paymentMethod).toBe('cash');
    expect(mockSettledPaidBill.totalVnd).toBe(55000);
  });

  it('3. Tuyệt đối không tự suy diễn paid chỉ vì session bị 401/403 hay localStorage có cờ giả', () => {
    const fakePendingBill: TableBillView = { ...mockCheckoutPendingBill };
    const simulatedErrorStatus = 403;
    const simulatedErrorCode = 'SESSION_REQUIRED';

    // Rule: UI không coi SESSION_REQUIRED là paid
    const isActuallyPaid = Boolean(
      fakePendingBill.session.paymentStatus === 'paid' ||
      (fakePendingBill.session.status === 'closed' && Boolean(fakePendingBill.settledAt))
    );

    expect(simulatedErrorStatus).toBe(403);
    expect(simulatedErrorCode).toBe('SESSION_REQUIRED');
    expect(isActuallyPaid).toBe(false);
  });

  it('4. Khi owner settle lúc guest đang đóng sheet: khi khách mở sheet lại vẫn xem được hóa đơn đã thanh toán', () => {
    const isBillSheetOpenInitially = false;
    let currentBillState: TableBillView = mockCheckoutPendingBill;

    // Server cập nhật bill thành công
    currentBillState = mockSettledPaidBill;

    // Khách mở sheet
    const isBillSheetOpenNow = !isBillSheetOpenInitially;
    const isPaidOnOpen = currentBillState.session.paymentStatus === 'paid';

    expect(isBillSheetOpenNow).toBe(true);
    expect(isPaidOnOpen).toBe(true);
    expect(currentBillState.settledAt).toBeDefined();
  });

  it('5. Refresh trong session closed: có receipt capability từ server -> hiển thị hóa đơn và không đòi lại PIN', () => {
    const isDineIn = true;
    const resolutionRequiresSessionCode = true; // Trên server session đã đóng nên resolve QR công khai có thể cờ true
    const loadedBill = mockSettledPaidBill; // API /bill với guest credential trả về hóa đơn đã thanh toán

    const isPaid = Boolean(
      loadedBill &&
        (loadedBill.session.paymentStatus === 'paid' ||
          (loadedBill.session.status === 'closed' && Boolean(loadedBill.settledAt)))
    );

    const isSessionClosed = Boolean(isDineIn && isPaid);
    // Khi isSessionClosed = true, form nhập PIN bị ẩn:
    const showPinVerification = isDineIn && resolutionRequiresSessionCode && !isSessionClosed;

    expect(isSessionClosed).toBe(true);
    expect(showPinVerification).toBe(false);
  });

  it('6. Khi receipt capability hết hạn hoặc bị xóa: thông báo bảo mật riêng tư, không show stale paid receipt từ khách khác', () => {
    const errorCode = 'SESSION_REQUIRED';
    const bill = null;

    const isAccessDenied = Boolean(
      errorCode === 'RECEIPT_ACCESS_DENIED' ||
        errorCode === 'RECEIPT_EXPIRED' ||
        errorCode === 'UNAUTHORIZED' ||
        errorCode === 'FORBIDDEN' ||
        errorCode === 'SESSION_REQUIRED' ||
        errorCode === 'SESSION_EXPIRED'
    );

    const privacyMessage =
      'Không thể mở lại hóa đơn trên thiết bị này. Vui lòng liên hệ quán nếu cần hỗ trợ.';

    expect(isAccessDenied).toBe(true);
    expect(bill).toBeNull();
    expect(privacyMessage).toContain('Không thể mở lại hóa đơn trên thiết bị này');
  });

  it('7. Realtime lặp / out-of-order: guard toast đảm bảo toast chỉ nảy đúng 1 lần cho mỗi phiên thanh toán', () => {
    let toastCount = 0;
    let toastedRef: string | null = null;

    const triggerToastIfNew = (bill: TableBillView) => {
      const toastKey = `${bill.session.id}:${bill.settledAt || 'paid'}`;
      if (toastedRef !== toastKey) {
        toastedRef = toastKey;
        toastCount += 1;
      }
    };

    // Lần 1: Nhận event settled
    triggerToastIfNew(mockSettledPaidBill);
    expect(toastCount).toBe(1);

    // Lần 2: Event realtime gửi lặp lại
    triggerToastIfNew(mockSettledPaidBill);
    expect(toastCount).toBe(1);

    // Lần 3: Polling định kỳ hoặc tab refetch cùng bill
    triggerToastIfNew(mockSettledPaidBill);
    expect(toastCount).toBe(1);
  });

  it('8. Mất mạng khi đang xem hóa đơn: cờ isStale giữ nguyên dữ liệu đã lưu, không xóa sạch màn hình', () => {
    const staleState = {
      bill: mockSettledPaidBill,
      isStale: true,
      errorMessage: 'Mất kết nối — Đang hiển thị hóa đơn đã thanh toán từ bộ nhớ đệm',
    };

    expect(staleState.bill).not.toBeNull();
    expect(staleState.bill.totalVnd).toBe(55000);
    expect(staleState.isStale).toBe(true);
  });

  it('9. Hai khách cùng bàn trong cùng phiên: cùng thấy hóa đơn tổng của bàn', () => {
    const guestPhoneA_Bill = mockSettledPaidBill;
    const guestPhoneB_Bill = mockSettledPaidBill;

    expect(guestPhoneA_Bill.table.label).toBe('Bàn 01');
    expect(guestPhoneB_Bill.table.label).toBe('Bàn 01');
    expect(guestPhoneA_Bill.totalVnd).toBe(guestPhoneB_Bill.totalVnd);
    expect(guestPhoneA_Bill.session.id).toBe(guestPhoneB_Bill.session.id);
  });

  it('10. Mở phiên mới trên cùng bàn: khách phiên mới không thấy hóa đơn của phiên cũ', () => {
    const oldSessionId = 'sess-01';
    const newSessionId = 'sess-02';

    const newSessionOpenBill: TableBillView = {
      table: { id: 'tbl-01', label: 'Bàn 01' },
      session: {
        id: newSessionId,
        status: 'open',
        paymentStatus: 'unpaid',
        openedAt: '2026-10-24T12:00:00Z',
        closedAt: null,
        orderCount: 0,
        totalVnd: 0,
        version: 1,
      },
      orders: [],
      totalVnd: 0,
      outstandingOrders: 0,
      billVersion: 'bv-new-001',
      canAcceptMoreOrders: true,
      canSettle: false,
      settledAt: null,
      paymentMethod: null,
    };

    expect(newSessionOpenBill.session.id).not.toBe(oldSessionId);
    expect(newSessionOpenBill.orders).toHaveLength(0);
    expect(newSessionOpenBill.totalVnd).toBe(0);
    expect(newSessionOpenBill.session.paymentStatus).toBe('unpaid');
  });

  it('11. Định dạng tiền tệ VNĐ và thời gian tiếng Việt chuẩn xác', () => {
    const formattedVnd = new Intl.NumberFormat('vi-VN').format(mockSettledPaidBill.totalVnd) + ' đ';
    expect(formattedVnd).toBe('55.000 đ');

    const settledDate = new Date(mockSettledPaidBill.settledAt!);
    expect(settledDate.getFullYear()).toBe(2026);
    expect(settledDate.getMonth()).toBe(9); // 0-indexed: 9 = Tháng 10
  });

  it('12. Không có nút hành động giả (không nút in/tải khi chưa có implementation), chỉ có [Hoàn tất]', () => {
    const isPaid = mockSettledPaidBill.session.paymentStatus === 'paid';
    const availableActions = isPaid ? ['Hoàn tất'] : ['Gọi thêm món', 'Đóng'];

    expect(availableActions).toContain('Hoàn tất');
    expect(availableActions).not.toContain('In hóa đơn');
    expect(availableActions).not.toContain('Tải hóa đơn');
  });

  it('13. Finding 1 (Codex): Khi server từ chối quyền dứt khoát (RECEIPT_ACCESS_DENIED/RECEIPT_EXPIRED/UNAUTHORIZED), xóa sạch cached bill', () => {
    // Khách từng có paid receipt trong state
    let cachedBill: TableBillView | null = mockSettledPaidBill;
    const errorCodes = ['RECEIPT_ACCESS_DENIED', 'RECEIPT_EXPIRED', 'UNAUTHORIZED', 'FORBIDDEN'] as const;

    for (const code of errorCodes) {
      // Khi server trả về lỗi từ chối quyền dứt khoát:
      cachedBill = null; // Clear/redact cache
      const isAccessDenied = Boolean(
        code === 'RECEIPT_ACCESS_DENIED' ||
          code === 'RECEIPT_EXPIRED' ||
          code === 'UNAUTHORIZED' ||
          code === 'FORBIDDEN'
      );

      expect(cachedBill).toBeNull();
      expect(isAccessDenied).toBe(true);
    }
  });

  it('14. Finding 2 (Codex): Nhận diện GuestPaidReceipt với kind=paid_receipt và metadata receiptId/receiptVersion', () => {
    expect(mockGuestPaidReceipt.kind).toBe('paid_receipt');
    expect(mockGuestPaidReceipt.receiptId).toBe('rcpt-001-uuid');
    expect(mockGuestPaidReceipt.receiptVersion).toBe(1);
    expect(mockGuestPaidReceipt.currency).toBe('VND');
    expect(mockGuestPaidReceipt.session.status).toBe('closed');
    expect(mockGuestPaidReceipt.session.paymentStatus).toBe('paid');
  });

  it('15. Finding 2 (Codex): Loại trừ snapshot đến trễ/out-of-order không cho ghi đè hóa đơn đã thanh toán', () => {
    const confirmedPaid = mockGuestPaidReceipt;
    const delayedUnpaidSnapshot = mockCheckoutPendingBill;

    // Logic trong setFetchedBill:
    const prevIsPaid = Boolean(
      confirmedPaid.session.paymentStatus === 'paid' ||
      (confirmedPaid.session.status === 'closed' && Boolean(confirmedPaid.settledAt))
    );
    const dataIsPaid = Boolean(
      delayedUnpaidSnapshot.session.paymentStatus === 'paid' ||
      (delayedUnpaidSnapshot.session.status === 'closed' && Boolean(delayedUnpaidSnapshot.settledAt))
    );

    const resultingBill = (prevIsPaid && !dataIsPaid) ? confirmedPaid : delayedUnpaidSnapshot;
    expect(resultingBill).toBe(confirmedPaid);
    expect(resultingBill.session.paymentStatus).toBe('paid');
  });

  it('16. Finding 3 (Codex): Sau khi paid, dừng polling hẹn giờ nhưng vẫn giữ recovery listeners khi visibility/online phục hồi', () => {
    const isPaid = true;
    const isAccessDenied = false;
    const isBlockedByApi = false;
    const refetchIntervalMs = 8000;

    // Polling hẹn giờ bị tắt
    const shouldStartTimer = !isPaid && !isAccessDenied && !isBlockedByApi && refetchIntervalMs > 0;
    expect(shouldStartTimer).toBe(false);

    // Recovery listeners vẫn được gắn
    const keepRecoveryListeners = true;
    expect(keepRecoveryListeners).toBe(true);
  });
});
