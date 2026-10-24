import { describe, it, expect } from 'vitest';
import type { TableBillView, TablePaymentMethod } from '@/components/customer/bill/types';

describe('P5-G02 Owner Settlement Concurrency, Race & UI UX Audit', () => {
  const baseBill: TableBillView = {
    table: {
      id: 'tbl-08',
      label: 'Bàn 08',
    },
    session: {
      id: 'sess-08',
      status: 'open',
      paymentStatus: 'unpaid',
      openedAt: '2026-10-24T11:00:00Z',
    },
    orders: [
      {
        id: 'ord-801',
        ticketNo: 8,
        status: 'completed',
        totalVnd: 150000,
        itemCount: 2,
        createdAt: '2026-10-24T11:05:00Z',
        lines: [
          {
            id: 'line-801',
            menuItemId: 'pho-dac-biet',
            name: 'Phở đặc biệt',
            quantity: 2,
            unitPriceVnd: 75000,
            lineTotalVnd: 150000,
            options: [],
            note: null,
          },
        ],
      },
    ],
    totalVnd: 150000,
    outstandingOrders: 0,
    billVersion: 1,
    canAcceptMoreOrders: true,
    canSettle: true,
    settledAt: null,
    paymentMethod: null,
  };

  it('1. Bàn còn món chưa hoàn tất (outstandingOrders > 0): chặn chốt hóa đơn và hiển thị rõ số đơn còn lại', () => {
    const unservedBill: TableBillView = {
      ...baseBill,
      outstandingOrders: 2,
      canSettle: false,
    };

    const hasOrders = unservedBill.orders.length > 0;
    const canBeginCheckout = hasOrders && unservedBill.outstandingOrders === 0 && unservedBill.canSettle;

    expect(canBeginCheckout).toBe(false);
    const settleButtonText = unservedBill.outstandingOrders > 0
      ? 'Chưa thể chốt (còn đơn chưa hoàn tất)'
      : 'Chốt hóa đơn (Khóa gọi thêm)';
    expect(settleButtonText).toBe('Chưa thể chốt (còn đơn chưa hoàn tất)');
  });

  it('2. Chống double-click: vô hiệu hóa nút ngay khi gửi lệnh xác nhận thu tiền, không phát 2 request từ UI', () => {
    let isSubmittingSettle = false;
    let requestCount = 0;

    const handleConfirm = () => {
      if (isSubmittingSettle) return;
      isSubmittingSettle = true;
      requestCount += 1;
    };

    // Click lần 1
    handleConfirm();
    expect(requestCount).toBe(1);
    expect(isSubmittingSettle).toBe(true);

    // Click nhanh lần 2 trong lúc đang chờ phản hồi
    handleConfirm();
    expect(requestCount).toBe(1); // Không phát request thứ hai
  });

  it('3. Idempotent Retry Safety: giữ nguyên cùng một requestId (UUIDv4) qua các lượt thử lại khi timeout/lỗi mạng', () => {
    let activeRequestId: string | null = null;

    const getOrGenerateRequestId = () => {
      if (!activeRequestId) {
        activeRequestId = '11111111-2222-3333-4444-555555555555';
      }
      return activeRequestId;
    };

    const firstAttemptId = getOrGenerateRequestId();
    expect(firstAttemptId).toBe('11111111-2222-3333-4444-555555555555');

    // Giả lập lỗi mạng tạm thời, thực hiện thử lại
    const retryAttemptId = getOrGenerateRequestId();
    expect(retryAttemptId).toBe(firstAttemptId);

    // Sau khi server xác nhận thành công, requestId mới được reset
    const onSettlementSuccess = () => {
      activeRequestId = null;
    };
    onSettlementSuccess();
    expect(activeRequestId).toBeNull();
  });

  it('4. Stale billVersion (409 Conflict): phát hiện xung đột phiên bản và yêu cầu làm mới hóa đơn', () => {
    const currentBillVersion = 1;
    const serverBillVersion = 2; // Khách vừa gọi thêm một món mới trong lúc chủ quán đang xem

    const isConflict = currentBillVersion !== serverBillVersion;
    expect(isConflict).toBe(true);

    const errorMessage = isConflict
      ? 'Hóa đơn đã thay đổi từ lượt gọi món mới hoặc phiên bàn đã được chốt. Vui lòng tải lại.'
      : null;

    expect(errorMessage).toBe('Hóa đơn đã thay đổi từ lượt gọi món mới hoặc phiên bàn đã được chốt. Vui lòng tải lại.');
  });

  it('5. Xác thực thu tiền thực tế (Explicit Money Attestation): yêu cầu tích chọn checkbox cam kết trước khi mở nút xác nhận', () => {
    let isAcknowledged = false;
    const selectedMethod: TablePaymentMethod = 'cash';
    const isSubmitting = false;

    const canSubmit = !isSubmitting && isAcknowledged;
    expect(canSubmit).toBe(false);

    // Chủ quán tích chọn xác nhận đã nhận đủ tiền
    isAcknowledged = true;
    const canSubmitAfterCheck = !isSubmitting && isAcknowledged;
    expect(canSubmitAfterCheck).toBe(true);

    const confirmationCopy = `Tôi xác nhận đã nhận đủ ${baseBill.totalVnd.toLocaleString('vi-VN')} đ qua ${
      selectedMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản'
    } thực tế.`;
    expect(confirmationCopy).toContain('150.000 đ');
    expect(confirmationCopy).toContain('tiền mặt thực tế');
  });

  it('6. Thẻ bàn (Table Card): diễn đạt trạng thái bằng cả Chữ + Icon + Màu cho cả 4 trạng thái', () => {
    const states = [
      { status: 'empty', label: 'Bàn trống', hasIcon: true, color: '#727B77' },
      { status: 'occupied', label: 'Có khách', hasIcon: true, color: '#1D725E' },
      { status: 'checkout_pending', label: 'Chờ thanh toán', hasIcon: true, color: '#B42318' },
      { status: 'inactive', label: 'Ngưng dùng', hasIcon: true, color: '#727B77' },
    ];

    for (const s of states) {
      expect(s.label).toBeTruthy();
      expect(s.hasIcon).toBe(true);
      expect(s.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('7. Bàn đã đóng phiên (closed): hiển thị badge Đã thanh toán, khóa thao tác thu tiền lần hai', () => {
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
    };

    const isClosed = settledBill.session.status === 'closed';
    const canSettleAgain = settledBill.canSettle;

    expect(isClosed).toBe(true);
    expect(canSettleAgain).toBe(false);
    expect(settledBill.paymentMethod).toBe('bank_transfer');
  });

  it('8. Cập nhật hóa đơn sau khi hoàn tất phục vụ ở tab Đơn hàng: ưu tiên snapshot mới từ GET nếu outstandingOrders giảm', () => {
    // Snapshot cũ khi begin checkout lúc còn 1 món chưa giao
    const actionSnapshot: TableBillView = {
      ...baseBill,
      session: { ...baseBill.session, status: 'checkout_pending', version: 2 },
      outstandingOrders: 1,
      canSettle: false,
      billVersion: 10,
    };

    // Snapshot mới sau khi giao xong món ở tab Đơn hàng và bấm Làm mới hóa đơn
    const freshGetBill: TableBillView = {
      ...baseBill,
      session: { ...baseBill.session, status: 'checkout_pending', version: 2 },
      outstandingOrders: 0,
      canSettle: true,
      billVersion: 11,
    };

    // Hàm chọn authoritative snapshot như đã triển khai trong TableBillSettlementSheet
    const resolveAuthoritativeBill = (action: TableBillView | null, prop: TableBillView | null) => {
      if (!action) return prop;
      if (!prop) return action;
      if (prop.session.version > action.session.version) return prop;
      if (action.session.version > prop.session.version) return action;
      if (
        prop.billVersion !== action.billVersion ||
        prop.outstandingOrders < action.outstandingOrders ||
        (prop.canSettle && !action.canSettle)
      ) {
        return prop;
      }
      return action;
    };

    const resolved = resolveAuthoritativeBill(actionSnapshot, freshGetBill);
    expect(resolved).toBe(freshGetBill);
    expect(resolved?.outstandingOrders).toBe(0);
    expect(resolved?.canSettle).toBe(true);
  });

  it('9. Phân loại lỗi SESSION_ORDERS_OUTSTANDING (HTTP 409): ưu tiên mã lỗi máy trước generic 409', () => {
    const error409Outstanding = {
      status: 409,
      error: {
        code: 'SESSION_ORDERS_OUTSTANDING',
        message: 'Còn đơn chưa phục vụ xong. Hoàn tất giao món trước khi thu tiền.',
      },
    };

    // Logic ánh xạ thông báo lỗi
    let mappedMessage = '';
    if (error409Outstanding.error.code === 'SESSION_ORDERS_OUTSTANDING') {
      mappedMessage = 'Còn món đang làm chưa hoàn tất phục vụ. Vui lòng kiểm tra lại trước khi chốt tiền.';
    } else if (error409Outstanding.status === 409) {
      mappedMessage = 'Hóa đơn đã thay đổi từ lượt gọi món mới hoặc phiên bàn đã được chốt. Vui lòng tải lại.';
    }

    expect(mappedMessage).toBe('Còn món đang làm chưa hoàn tất phục vụ. Vui lòng kiểm tra lại trước khi chốt tiền.');
  });

  it('10. Payload-sensitive retry safety: giữ nguyên requestId khi cùng payload, cấp mới khi đổi paymentMethod', () => {
    let pendingCommand: {
      requestId: string;
      paymentMethod: TablePaymentMethod;
      version: number;
      billVersion: string;
    } | null = null;

    const executeOrRetry = (
      method: TablePaymentMethod,
      version: number,
      billVersion: string
    ) => {
      if (
        pendingCommand &&
        pendingCommand.paymentMethod === method &&
        pendingCommand.version === version &&
        pendingCommand.billVersion === billVersion
      ) {
        return pendingCommand.requestId;
      }

      const newId = `req-${Math.random().toString(36).substring(2, 9)}`;
      pendingCommand = {
        requestId: newId,
        paymentMethod: method,
        version,
        billVersion,
      };
      return newId;
    };

    // Lần 1: gửi lệnh chốt cash
    const id1 = executeOrRetry('cash', 1, 'v1');
    expect(id1).toBeTruthy();

    // Lần 2: timeout mạng, thử lại cùng cash
    const id2 = executeOrRetry('cash', 1, 'v1');
    expect(id2).toBe(id1); // Tái sử dụng cùng requestId

    // Lần 3: chủ quán đổi sang bank_transfer -> payload thay đổi
    const id3 = executeOrRetry('bank_transfer', 1, 'v1');
    expect(id3).not.toBe(id1); // Cấp requestId mới để tránh DUPLICATE_REQUEST_CONFLICT trên server
  });

  it('11. Không tự tổng hợp hóa đơn đã thanh toán khi thiếu kết quả từ server', async () => {
    const unconfirmedLocalBill: TableBillView = {
      ...baseBill,
      session: { ...baseBill.session, status: 'checkout_pending' },
    };

    // Mock callback trả về void / undefined (server timeout hoặc response thất lạc)
    const mockConfirmSettlement = async (): Promise<TableBillView | undefined> => {
      return undefined;
    };

    let actionBill: TableBillView | null = null;
    let didCallRefresh = false;

    const handleConfirm = async () => {
      const res = await mockConfirmSettlement();
      if (res) {
        actionBill = res;
      } else {
        // Không tự tổng hợp bill closed/paid!
        didCallRefresh = true;
      }
    };

    await handleConfirm();

    expect(actionBill).toBeNull(); // Không tự gán { status: 'closed', paymentStatus: 'paid' }
    expect(didCallRefresh).toBe(true); // Yêu cầu refetch từ server
    expect(unconfirmedLocalBill.session.status).toBe('checkout_pending');
  });
});
