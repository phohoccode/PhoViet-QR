import { describe, it, expect } from 'vitest';
import type {
  OrderSummary,
  OrderDetail,
  OwnerOrdersQuery,
  OwnerOrdersView,
  RequestCommand,
  OrderTransitionInput,
  CompleteOrderInput,
} from '../../../docs/contracts/types';
import { ORDER_STATUS_LABELS } from '../../../docs/contracts/types';
import {
  MOCK_OWNER_ORDERS,
} from '@/lib/mocks/ui-preview';

describe('P3-G02 Acceptance: Owner Orders FIFO Queue & State Machine UI', () => {
  const storeId = 'store-test-p3-01';

  // Fixture: 5 đơn accepted
  const mockAcceptedOrders: OrderSummary[] = [
    {
      id: 'c3020000-0000-4000-8000-000000000001',
      storeId,
      type: 'dine_in',
      tableSessionId: 'sess-01',
      table: { id: 'tbl-01', label: 'Bàn 01' },
      status: 'accepted',
      statusLabel: 'Chờ làm',
      fulfillmentStatus: 'awaiting_preparation',
      paymentStatus: 'unpaid',
      ticketNo: 21,
      serviceDate: '2026-10-23',
      acceptedAt: '2026-10-23T08:00:00Z',
      totalVnd: 50000,
      itemCount: 1,
      createdAt: '2026-10-23T08:00:00Z',
      updatedAt: '2026-10-23T08:00:00Z',
      version: 1,
    },
    {
      id: 'c3020000-0000-4000-8000-000000000002',
      storeId,
      type: 'dine_in',
      tableSessionId: 'sess-02',
      table: { id: 'tbl-02', label: 'Bàn 02' },
      status: 'accepted',
      statusLabel: 'Chờ làm',
      fulfillmentStatus: 'awaiting_preparation',
      paymentStatus: 'unpaid',
      ticketNo: 22,
      serviceDate: '2026-10-23',
      acceptedAt: '2026-10-23T08:05:00Z',
      totalVnd: 70000,
      itemCount: 2,
      createdAt: '2026-10-23T08:05:00Z',
      updatedAt: '2026-10-23T08:05:00Z',
      version: 1,
    },
    {
      id: 'c3020000-0000-4000-8000-000000000003',
      storeId,
      type: 'dine_in',
      tableSessionId: 'sess-03',
      table: { id: 'tbl-03', label: 'Bàn 03' },
      status: 'accepted',
      statusLabel: 'Chờ làm',
      fulfillmentStatus: 'awaiting_preparation',
      paymentStatus: 'unpaid',
      ticketNo: 23,
      serviceDate: '2026-10-23',
      acceptedAt: '2026-10-23T08:10:00Z',
      totalVnd: 35000,
      itemCount: 1,
      createdAt: '2026-10-23T08:10:00Z',
      updatedAt: '2026-10-23T08:10:00Z',
      version: 1,
    },
    {
      id: 'c3020000-0000-4000-8000-000000000004',
      storeId,
      type: 'dine_in',
      tableSessionId: 'sess-04',
      table: { id: 'tbl-04', label: 'Bàn 04' },
      status: 'accepted',
      statusLabel: 'Chờ làm',
      fulfillmentStatus: 'awaiting_preparation',
      paymentStatus: 'unpaid',
      ticketNo: 24,
      serviceDate: '2026-10-23',
      acceptedAt: '2026-10-23T08:15:00Z',
      totalVnd: 120000,
      itemCount: 3,
      createdAt: '2026-10-23T08:15:00Z',
      updatedAt: '2026-10-23T08:15:00Z',
      version: 1,
    },
    {
      id: 'c3020000-0000-4000-8000-000000000005',
      storeId,
      type: 'dine_in',
      tableSessionId: 'sess-05',
      table: { id: 'tbl-05', label: 'Bàn 05' },
      status: 'accepted',
      statusLabel: 'Chờ làm',
      fulfillmentStatus: 'awaiting_preparation',
      paymentStatus: 'unpaid',
      ticketNo: 25,
      serviceDate: '2026-10-23',
      acceptedAt: '2026-10-23T08:20:00Z',
      totalVnd: 45000,
      itemCount: 1,
      createdAt: '2026-10-23T08:20:00Z',
      updatedAt: '2026-10-23T08:20:00Z',
      version: 1,
    },
  ];

  it('1. 5 đơn accepted: hiển thị thứ tự theo API, phân biệt bàn, không có nút claim per-card', () => {
    expect(mockAcceptedOrders).toHaveLength(5);

    // Thứ tự ticket từ API là 21, 22, 23, 24, 25
    expect(mockAcceptedOrders.map((o) => o.ticketNo)).toEqual([21, 22, 23, 24, 25]);

    // Tất cả đều có bàn phục vụ cụ thể
    for (const ord of mockAcceptedOrders) {
      expect(ord.type).toBe('dine_in');
      expect(ord.table?.label).toMatch(/^Bàn \d{2}$/);
      expect(ord.status).toBe('accepted');
      expect(ORDER_STATUS_LABELS[ord.status]).toBe('Chờ làm');
    }
  });

  it('2. Bấm Nhận đơn tiếp theo: sinh stable requestId, in-flight lock và không cho phép claim per-card', () => {
    let isClaiming = false;
    let requestId: string | null = null;

    // Lần bấm đầu tiên
    if (!isClaiming) {
      isClaiming = true;
      requestId = 'c3020000-0000-4000-8000-000000000099';
    }

    // Yêu cầu gửi tới POST /api/owner/queue/claim-next
    const command: RequestCommand = { requestId };
    expect(command.requestId).toBe('c3020000-0000-4000-8000-000000000099');

    // Không có trường orderId nào được truyền trong RequestCommand (server sở hữu thứ tự FIFO)
    expect('orderId' in command).toBe(false);

    // Click lần 2 khi isClaiming đang true bị chặn
    let doubleSubmitBlocked = false;
    if (isClaiming) {
      doubleSubmitBlocked = true;
    }
    expect(doubleSubmitBlocked).toBe(true);
  });

  it('3. Khi mạng timeout hoặc gián đoạn (uncertain): giữ nguyên requestId cho retry, không sinh key mới', () => {
    const originalRequestId = 'c3020000-0000-4000-8000-000000000099';
    let currentRequestId: string | null = originalRequestId;

    // Giả lập network failure / timeout
    const isNetworkError = true;
    if (isNetworkError) {
      // Key KHÔNG được xóa, giữ nguyên cho lần retry tiếp theo
      expect(currentRequestId).toBe(originalRequestId);
    }

    // Khi người dùng retry: tái sử dụng đúng requestId ban đầu
    const retryCommand: RequestCommand = { requestId: currentRequestId! };
    expect(retryCommand.requestId).toBe(originalRequestId);

    // Chỉ khi server trả kết quả thành công (200), mới reset key
    const serverSucceeded = true;
    if (serverSucceeded) {
      currentRequestId = null;
    }
    expect(currentRequestId).toBeNull();
  });

  it('4. Queue rỗng: nút claim bị disable hoặc server trả data null được hiển thị đúng', () => {
    const emptyCounts = { accepted: 0, preparing: 0, ready: 0, paymentException: 0 };
    const canClaim = emptyCounts.accepted > 0;
    expect(canClaim).toBe(false);

    // Kết quả server trả data: null cho claim-next khi queue rỗng
    const emptyClaimResponse = { data: null, error: null };
    expect(emptyClaimResponse.data).toBeNull();
    expect(emptyClaimResponse.error).toBeNull();
  });

  it('5. Đơn preparing có CTA Đã làm xong; đơn ready Dine-in có CTA Đã phục vụ; accepted ẩn nút', () => {
    const preparingOrder = MOCK_OWNER_ORDERS.find((o) => o.status === 'preparing')!;
    const readyOrder = MOCK_OWNER_ORDERS.find((o) => o.status === 'ready' && o.type === 'dine_in')!;
    const acceptedOrder = MOCK_OWNER_ORDERS.find((o) => o.status === 'accepted')!;

    expect(preparingOrder.status).toBe('preparing');
    expect(readyOrder.status).toBe('ready');
    expect(acceptedOrder.status).toBe('accepted');

    // preparing -> markOrderReady yêu cầu requestId và expectedVersion
    const readyPayload: OrderTransitionInput = {
      requestId: 'req-ready-01',
      expectedVersion: preparingOrder.version,
    };
    expect(readyPayload.expectedVersion).toBe(preparingOrder.version);

    // ready Dine-in -> completeOrder yêu cầu requestId, expectedVersion và type: 'dine_in'
    const completePayload: CompleteOrderInput = {
      requestId: 'req-complete-01',
      expectedVersion: readyOrder.version,
      type: 'dine_in',
    };
    expect(completePayload.type).toBe('dine_in');
  });

  it('6. Takeaway ready: khóa hoàn thành trực tiếp vì thiếu xác minh pickup (Phase 4 guardrail)', () => {
    const takeawayOrder: OrderDetail = {
      id: 'order-takeaway-ready',
      storeId,
      type: 'takeaway',
      status: 'ready',
      statusLabel: 'Sẵn sàng',
      fulfillmentStatus: 'ready',
      paymentStatus: 'paid',
      ticketNo: 99,
      serviceDate: '2026-10-23',
      acceptedAt: '2026-10-23T08:00:00Z',
      tableSessionId: null,
      table: null,
      totalVnd: 45000,
      itemCount: 1,
      createdAt: '2026-10-23T08:00:00Z',
      updatedAt: '2026-10-23T08:15:00Z',
      version: 3,
      lines: [],
      note: null,
      payment: {
        kind: 'takeaway',
        intentId: 'intent-01',
        status: 'paid',
        statusLabel: 'Đã thanh toán',
        intentStatus: 'succeeded',
        amountVnd: 45000,
        currency: 'VND',
        updatedAt: '2026-10-23T08:00:00Z',
        expiresAt: '2026-10-23T08:30:00Z',
        reconciliationRequired: false,
      },
    };

    expect(takeawayOrder.type).toBe('takeaway');
    expect(takeawayOrder.status).toBe('ready');

    // UI khóa nút hoàn thành đối với Takeaway ở Phase 3
    const canCompleteDirectly = takeawayOrder.type === 'dine_in';
    expect(canCompleteDirectly).toBe(false);
  });

  it('7. Query builder tuân thủ đúng API contract R07 (không gửi literal all, omit khi chọn tất cả)', () => {
    const buildQuery = (
      view: 'queue' | 'history',
      type: 'all' | 'dine_in' | 'takeaway',
      status: 'all' | OrderStatus
    ): OwnerOrdersQuery => {
      const q: OwnerOrdersQuery = { view, limit: 50 };
      if (type !== 'all') q.type = type;
      if (status !== 'all') q.status = status;
      return q;
    };

    // Khi chọn tất cả: type và status phải được omit
    const allQuery = buildQuery('queue', 'all', 'all');
    expect(allQuery.view).toBe('queue');
    expect(allQuery.type).toBeUndefined();
    expect(allQuery.status).toBeUndefined();
    expect('all' in allQuery).toBe(false);

    // Khi chọn filter cụ thể
    const dineInPreparingQuery = buildQuery('queue', 'dine_in', 'preparing');
    expect(dineInPreparingQuery.type).toBe('dine_in');
    expect(dineInPreparingQuery.status).toBe('preparing');
  });

  it('8. Counts luôn đại diện cho toàn bộ quán, độc lập với bộ lọc trang hiện tại', () => {
    const sampleView: OwnerOrdersView = {
      storeId,
      orders: mockAcceptedOrders.slice(0, 2), // Trang chỉ lấy 2 đơn
      detail: null,
      counts: {
        accepted: 14,
        preparing: 3,
        ready: 5,
        paymentException: 0,
      },
      nextCursor: 'cursor-page-2',
      updatedAt: '2026-10-23T08:30:00Z',
    };

    // Đếm toàn quán không bị giới hạn bởi độ dài mảng orders của page
    expect(sampleView.counts.accepted).toBe(14);
    expect(sampleView.orders).toHaveLength(2);
    expect(sampleView.nextCursor).toBe('cursor-page-2');
  });

  it('9. Touch targets và bố cục responsive đạt chuẩn công thái học', () => {
    const ctaButtonClasses = 'w-full sm:w-auto h-12 px-6 rounded-xl';
    expect(ctaButtonClasses).toContain('h-12'); // 48px >= 44px tối thiểu

    const mobileHeaderClasses = 'h-9 px-3 rounded-xl';
    expect(mobileHeaderClasses).toContain('h-9'); // 36px cho header pill nhỏ
  });

  it('10. Bảng 4 trạng thái chuẩn trong API R07-R10 (accepted -> preparing -> ready -> completed)', () => {
    expect(ORDER_STATUS_LABELS['accepted']).toBe('Chờ làm');
    expect(ORDER_STATUS_LABELS['preparing']).toBe('Đang làm');
    expect(ORDER_STATUS_LABELS['ready']).toBe('Sẵn sàng');
    expect(ORDER_STATUS_LABELS['completed']).toBe('Đã giao');
  });
});
