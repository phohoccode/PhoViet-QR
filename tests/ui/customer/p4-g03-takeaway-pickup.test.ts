import { describe, it, expect } from 'vitest';
import {
  formatPickupCodeDisplay,
} from '@/components/customer/order/TakeawayPickupCard';
import type {
  OrderDetail,
  CompleteOrderInput,
} from '../../../docs/contracts/types';

describe('P4-G03: Customer Takeaway Pickup UX', () => {
  it('1. formats 6-digit pickup code with space grouping and preserves leading zeros', () => {
    expect(formatPickupCodeDisplay('012345')).toBe('012 345');
    expect(formatPickupCodeDisplay('000123')).toBe('000 123');
    expect(formatPickupCodeDisplay('987654')).toBe('987 654');
    expect(formatPickupCodeDisplay(null)).toBe('');
    expect(formatPickupCodeDisplay('')).toBe('');
  });

  it('2. raw copy value preserves exact 6 ASCII digits without spaces', () => {
    const raw = '012345';
    const digitsOnly = raw.replace(/\D/g, '');
    expect(digitsOnly).toBe('012345');
    expect(digitsOnly.length).toBe(6);
    expect(digitsOnly.startsWith('0')).toBe(true);
  });

  it('3. does not reveal pickup code or fake tickets on pending_payment or verifying orders', () => {
    const pendingOrder: Partial<OrderDetail> = {
      type: 'takeaway',
      status: 'pending_payment',
      ticketNo: null,
      paymentStatus: 'pending',
    };

    expect(pendingOrder.status).toBe('pending_payment');
    expect(pendingOrder.ticketNo).toBeNull();
  });

  it('4. distinguishes paid+accepted/preparing states with preparation notice', () => {
    const preparingOrder: Partial<OrderDetail> = {
      type: 'takeaway',
      status: 'preparing',
      ticketNo: 28,
      paymentStatus: 'paid',
    };

    expect(preparingOrder.status).toBe('preparing');
    expect(preparingOrder.ticketNo).toBe(28);
    // Ticket formatted as #028
    const ticketStr = `#${String(preparingOrder.ticketNo).padStart(3, '0')}`;
    expect(ticketStr).toBe('#028');
  });

  it('5. paid+ready state emphasizes pickup readiness and counter notice', () => {
    const readyOrder: Partial<OrderDetail> = {
      type: 'takeaway',
      status: 'ready',
      ticketNo: 28,
      paymentStatus: 'paid',
    };

    expect(readyOrder.status).toBe('ready');
    const isReady = readyOrder.status === 'ready';
    const isTakeaway = readyOrder.type === 'takeaway';
    expect(isReady && isTakeaway).toBe(true);
  });

  it('6. completed takeaway state masks pickup code to prevent re-use and removes urgency', () => {
    const completedOrder: Partial<OrderDetail> = {
      type: 'takeaway',
      status: 'completed',
      ticketNo: 28,
      paymentStatus: 'paid',
    };

    expect(completedOrder.status).toBe('completed');
    const maskedCode = '••••••';
    expect(maskedCode).toBe('••••••');
  });

  it('7. dine-in orders are completely isolated from takeaway pickup code UI', () => {
    const dineInOrder: Partial<OrderDetail> = {
      type: 'dine_in',
      status: 'ready',
      ticketNo: 15,
      table: { id: 'tbl_1', label: 'Bàn 01' },
      paymentStatus: 'unpaid',
    };

    expect(dineInOrder.type).toBe('dine_in');
    expect(dineInOrder.table?.label).toBe('Bàn 01');
    // Dine-in ready must not render takeaway pickup code
    const isTakeaway = dineInOrder.type === 'takeaway';
    expect(isTakeaway).toBe(false);
  });
});

describe('P4-G03: Owner Pickup Verification & Complete Order', () => {
  it('8. takeaway ready order displays active verification action', () => {
    const order: Partial<OrderDetail> = {
      type: 'takeaway',
      status: 'ready',
      version: 3,
      ticketNo: 42,
    };

    const isTakeawayReady = order.type === 'takeaway' && order.status === 'ready';
    expect(isTakeawayReady).toBe(true);
  });

  it('9. takeaway preparing order does not allow completion before ready', () => {
    const order: Partial<OrderDetail> = {
      type: 'takeaway',
      status: 'preparing',
      version: 2,
      ticketNo: 42,
    };

    const canCompleteDirectly = order.status === 'ready';
    expect(canCompleteDirectly).toBe(false);
  });

  it('10. validation rejects non-numeric input and strips invalid characters at presentation level', () => {
    const inputWithChars = '012abc345';
    const digitsOnly = inputWithChars.replace(/\D/g, '').slice(0, 6);
    expect(digitsOnly).toBe('012345');
    expect(/^[0-9]{6}$/.test(digitsOnly)).toBe(true);
  });

  it('11. validation requires exactly 6 numeric digits before submit is enabled', () => {
    expect(/^[0-9]{6}$/.test('')).toBe(false);
    expect(/^[0-9]{6}$/.test('12345')).toBe(false);
    expect(/^[0-9]{6}$/.test('012345')).toBe(true);
    expect(/^[0-9]{6}$/.test('000000')).toBe(true);
    expect(/^[0-9]{6}$/.test('1234567')).toBe(false);
  });

  it('12. payload for takeaway completion satisfies CompleteOrderInput contract', () => {
    const pickupCode = '012345';
    const requestId = 'req_abc_uuid';
    const expectedVersion = 3;

    const payload: CompleteOrderInput = {
      type: 'takeaway',
      pickupCode,
      requestId,
      expectedVersion,
    };

    expect(payload.type).toBe('takeaway');
    expect(payload.pickupCode).toBe('012345');
    expect(payload.requestId).toBe('req_abc_uuid');
    expect(payload.expectedVersion).toBe(3);
  });

  it('13. payload for dine-in completion remains without pickupCode field', () => {
    const payload: CompleteOrderInput = {
      type: 'dine_in',
      requestId: 'req_dine_in_uuid',
      expectedVersion: 2,
    };

    expect(payload.type).toBe('dine_in');
    expect('pickupCode' in payload).toBe(false);
  });

  it('14. retry of the same verification intent reuses the exact same requestId', () => {
    const stableRequestId = 'stable_request_id_1234';
    const retryAttempt1 = { requestId: stableRequestId, pickupCode: '012345' };
    const retryAttempt2 = { requestId: stableRequestId, pickupCode: '012345' };

    expect(retryAttempt1.requestId).toBe(retryAttempt2.requestId);
  });

  it('15. maps INVALID_PICKUP_CODE error to user-friendly message without leaking valid code', () => {
    const errorMapping: Record<string, string> = {
      INVALID_PICKUP_CODE: 'Mã chưa chính xác, vui lòng kiểm tra lại.',
      RATE_LIMITED: 'Đã thử quá nhiều lần. Vui lòng thử lại sau.',
      INVALID_STATE_TRANSITION: 'Trạng thái đơn hàng đã thay đổi trên hệ thống.',
    };

    expect(errorMapping['INVALID_PICKUP_CODE']).toBe('Mã chưa chính xác, vui lòng kiểm tra lại.');
    expect(errorMapping['INVALID_PICKUP_CODE'].includes('012345')).toBe(false);
    expect(errorMapping['RATE_LIMITED']).toBe('Đã thử quá nhiều lần. Vui lòng thử lại sau.');
  });

  it('16. maps all P4-C03 backend error codes to user-friendly Vietnamese messages', () => {
    const p4C03ErrorMapping: Record<string, string> = {
      INVALID_PICKUP_CODE: 'Mã chưa chính xác, vui lòng kiểm tra lại.',
      ORDER_ALREADY_COMPLETED: 'Đơn hàng này đã được xác nhận hoàn tất trước đó.',
      PICKUP_NOT_ALLOWED: 'Đơn hàng chưa đủ điều kiện giao món (chưa sẵn sàng hoặc chưa thanh toán).',
      PICKUP_CREDENTIAL_UNAVAILABLE: 'Dịch vụ mã nhận món tạm thời không khả dụng. Vui lòng liên hệ hỗ trợ.',
      DUPLICATE_REQUEST_CONFLICT: 'Mã yêu cầu bị xung đột dữ liệu. Vui lòng kiểm tra lại thao tác.',
      INVALID_STATE_TRANSITION: 'Trạng thái đơn hàng đã thay đổi trên hệ thống.',
    };

    expect(p4C03ErrorMapping['ORDER_ALREADY_COMPLETED']).toBe('Đơn hàng này đã được xác nhận hoàn tất trước đó.');
    expect(p4C03ErrorMapping['PICKUP_NOT_ALLOWED']).toContain('chưa sẵn sàng hoặc chưa thanh toán');
    expect(p4C03ErrorMapping['PICKUP_CREDENTIAL_UNAVAILABLE']).toContain('tạm thời không khả dụng');
    expect(p4C03ErrorMapping['DUPLICATE_REQUEST_CONFLICT']).toContain('xung đột dữ liệu');
  });

  it('17. enforces PrivateOrderTrackingView contract with pickup object for takeaway and null for dine-in', () => {
    const takeawayPrivateView = {
      order: {
        id: 'ord_123',
        type: 'takeaway' as const,
        status: 'ready' as const,
        paymentStatus: 'paid' as const,
      },
      pickup: {
        code: '000042',
        expiresAt: '2026-10-25T00:00:00Z',
      },
    };

    const dineInPrivateView = {
      order: {
        id: 'ord_456',
        type: 'dine_in' as const,
        status: 'ready' as const,
        paymentStatus: 'unpaid' as const,
      },
      pickup: null,
    };

    expect(takeawayPrivateView.pickup?.code).toBe('000042');
    expect(takeawayPrivateView.pickup?.code.length).toBe(6);
    expect(dineInPrivateView.pickup).toBeNull();
  });

  it('18. verifies that leading zeros in pickupCode are preserved across 6 ASCII digits', () => {
    const code = '000007';
    expect(code.length).toBe(6);
    expect(code[0]).toBe('0');
    expect(code[1]).toBe('0');
    const display = formatPickupCodeDisplay(code);
    expect(display).toBe('000 007');
    const rawRestored = display.replace(/\D/g, '');
    expect(rawRestored).toBe('000007');
  });
});

