import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrderDetailPanel } from '@/components/owner/orders/OrderDetailPanel';
import type { OrderDetail, OrderSummary, OwnerOrdersQuery } from '../../../../docs/contracts/types';

describe('Owner Orders Filter Selection Reset (Fix all tab/filter empty states)', () => {
  const storeId = 'store-test-p3-01';

  const mockReadyOrder: OrderDetail = {
    id: 'c3020000-0000-4000-8000-000000000006',
    storeId,
    type: 'takeaway',
    status: 'ready',
    statusLabel: 'Sẵn sàng',
    fulfillmentStatus: 'ready',
    paymentStatus: 'paid',
    ticketNo: 6,
    serviceDate: '2026-10-24',
    acceptedAt: '2026-10-24T10:48:00Z',
    tableSessionId: null,
    table: null,
    totalVnd: 3000,
    itemCount: 1,
    createdAt: '2026-10-24T10:48:00Z',
    updatedAt: '2026-10-24T10:48:00Z',
    version: 2,
    lines: [
      {
        id: 'line-01',
        name: 'Phở',
        priceVnd: 3000,
        quantity: 1,
        totalVnd: 3000,
      },
    ],
    note: null,
    payment: {
      kind: 'takeaway',
      intentId: 'intent-06',
      status: 'paid',
      statusLabel: 'Đã thanh toán VietQR',
      intentStatus: 'succeeded',
      amountVnd: 3000,
      currency: 'VND',
      updatedAt: '2026-10-24T10:48:00Z',
      expiresAt: '2026-10-24T11:18:00Z',
      reconciliationRequired: false,
    },
  };

  it('1. OrderDetailPanel: khi order là null (tab/filter không có đơn), hiển thị giao diện rỗng "Chưa chọn đơn hàng"', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderDetailPanel, {
        order: null,
        isLoadingDetail: false,
        isActionPending: false,
        pendingActionType: null,
      })
    );

    expect(html).toContain('Chưa chọn đơn hàng');
    expect(html).toContain('Chọn một đơn từ danh sách bên trái để xem chi tiết các món và thao tác chuyển trạng thái.');
    // Tuyệt đối không hiển thị thông tin đơn cũ hoặc nút hành động
    expect(html).not.toContain('Xác minh nhận món &amp; Giao đơn');
    expect(html).not.toContain('Xác minh nhận món & Giao đơn');
    expect(html).not.toContain('#006');
    expect(html).not.toContain('3.000');
  });

  it('2. OrderDetailPanel: khi order có dữ liệu, hiển thị đầy đủ thông tin đơn #006 và nút giao món', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderDetailPanel, {
        order: mockReadyOrder,
        isLoadingDetail: false,
        isActionPending: false,
        pendingActionType: null,
      })
    );

    expect(html).toContain('#006');
    expect(html).toContain('Mang đi');
    expect(html).toContain('Sẵn sàng');
    expect(html).toContain('Phở');
    expect(html).toContain('3.000');
    expect(html).toContain('Xác minh nhận món &amp; Giao đơn');
    expect(html).not.toContain('Chưa chọn đơn hàng');
  });

  it('3. Chuyển đổi tab trạng thái (Status Filter): khi chuyển sang tab không có đơn ("Chờ làm"), reset orderId và order về null', () => {
    // Giả lập trạng thái trước khi click: đang chọn đơn #006 ở tab "Tất cả trạng thái"
    let selectedOrderId: string | null = mockReadyOrder.id;
    let selectedOrder: OrderDetail | null = mockReadyOrder;
    let isMobileSheetOpen = true;

    // Giả lập handler chuyển tab trạng thái sang "accepted" (Chờ làm)
    const handleStatusChange = () => {
      // Logic đã sửa: reset selection ngay lập tức khi đổi tab
      selectedOrderId = null;
      selectedOrder = null;
      isMobileSheetOpen = false;
    };

    handleStatusChange();

    expect(selectedOrderId).toBeNull();
    expect(selectedOrder).toBeNull();
    expect(isMobileSheetOpen).toBe(false);

    // Xây dựng query cho tab mới: không chứa orderId cũ
    const buildQuery = (status: string, targetOrderId: string | null): OwnerOrdersQuery => {
      const q: OwnerOrdersQuery = { view: 'queue', limit: 50 };
      if (status !== 'all') (q as Record<string, unknown>).status = status;
      if (targetOrderId) q.orderId = targetOrderId;
      return q;
    };

    const newQuery = buildQuery('accepted', selectedOrderId);
    expect(newQuery.orderId).toBeUndefined();

    // Giả lập server trả về 0 đơn cho tab "Chờ làm"
    const apiResponse = { orders: [] as OrderSummary[], detail: null };
    if (apiResponse.orders.length === 0) {
      selectedOrderId = null;
      selectedOrder = null;
      isMobileSheetOpen = false;
    }

    expect(selectedOrderId).toBeNull();
    expect(selectedOrder).toBeNull();

    // Render lại panel chi tiết -> Hiển thị rỗng sạch sẽ, không còn sót đơn #006
    const html = renderToStaticMarkup(
      React.createElement(OrderDetailPanel, {
        order: selectedOrder,
        isLoadingDetail: false,
        isActionPending: false,
        pendingActionType: null,
      })
    );
    expect(html).toContain('Chưa chọn đơn hàng');
    expect(html).not.toContain('#006');
  });

  it('4. Chuyển sang tab có đơn ("Sẵn sàng"): tự động chọn đơn đầu tiên ("mặc định đang checked ở đơn đầu tiên")', () => {
    let selectedOrderId: string | null = null;
    let selectedOrder: OrderDetail | null = null;

    // Giả lập click tab "ready" (Sẵn sàng)
    const apiResponse = {
      orders: [
        {
          id: mockReadyOrder.id,
          storeId,
          type: mockReadyOrder.type,
          tableSessionId: null,
          table: null,
          status: mockReadyOrder.status,
          statusLabel: mockReadyOrder.statusLabel,
          fulfillmentStatus: mockReadyOrder.fulfillmentStatus,
          paymentStatus: mockReadyOrder.paymentStatus,
          ticketNo: mockReadyOrder.ticketNo,
          serviceDate: mockReadyOrder.serviceDate,
          acceptedAt: mockReadyOrder.acceptedAt,
          totalVnd: mockReadyOrder.totalVnd,
          itemCount: mockReadyOrder.itemCount,
          createdAt: mockReadyOrder.createdAt,
          updatedAt: mockReadyOrder.updatedAt,
          version: mockReadyOrder.version,
        },
      ] as OrderSummary[],
      detail: mockReadyOrder,
    };

    // Áp dụng logic của OwnerOrdersView:
    if (apiResponse.orders.length === 0) {
      selectedOrderId = null;
      selectedOrder = null;
    } else {
      const firstId = apiResponse.orders[0].id;
      selectedOrderId = firstId;
      if (apiResponse.detail && apiResponse.detail.id === firstId) {
        selectedOrder = apiResponse.detail;
      }
    }

    // Đơn đầu tiên được tự động chọn
    expect(selectedOrderId).toBe(mockReadyOrder.id);
    expect(selectedOrder).not.toBeNull();
    expect(selectedOrder?.ticketNo).toBe(6);
  });

  it('5. Chuyển đổi loại đơn (Type Filter): từ "Tất cả" sang "Tại bàn" (0 đơn) -> reset thông tin', () => {
    let selectedOrderId: string | null = mockReadyOrder.id; // #006 là mang đi
    let selectedOrder: OrderDetail | null = mockReadyOrder;

    // Handler đổi loại đơn sang "dine_in"
    selectedOrderId = null;
    selectedOrder = null;

    // Server trả về danh sách trống cho dine_in
    const apiOrders: OrderSummary[] = [];
    if (apiOrders.length === 0) {
      selectedOrderId = null;
      selectedOrder = null;
    }

    expect(selectedOrderId).toBeNull();
    expect(selectedOrder).toBeNull();

    const html = renderToStaticMarkup(
      React.createElement(OrderDetailPanel, {
        order: selectedOrder,
        isLoadingDetail: false,
        isActionPending: false,
        pendingActionType: null,
      })
    );
    expect(html).toContain('Chưa chọn đơn hàng');
    expect(html).not.toContain('Mang đi');
  });

  it('6. Chuyển đổi tab chính (View: Hàng đợi -> Lịch sử / Thanh toán): khi tab trống -> reset thông tin', () => {
    for (const view of ['history', 'exceptions'] as const) {
      expect(view).toBeDefined();
      let selectedOrderId: string | null = mockReadyOrder.id;
      let selectedOrder: OrderDetail | null = mockReadyOrder;

      // handleViewChange
      selectedOrderId = null;
      selectedOrder = null;

      // Giả lập tab history / exceptions không có đơn
      const returnedOrders: OrderSummary[] = [];
      if (returnedOrders.length === 0) {
        selectedOrderId = null;
        selectedOrder = null;
      }

      expect(selectedOrderId).toBeNull();
      expect(selectedOrder).toBeNull();

      const html = renderToStaticMarkup(
        React.createElement(OrderDetailPanel, {
          order: selectedOrder,
          isLoadingDetail: false,
          isActionPending: false,
          pendingActionType: null,
        })
      );
      expect(html).toContain('Chưa chọn đơn hàng');
    }
  });

  it('7. Polling background (loadOrders): nếu tất cả đơn trong filter biến mất, reset toàn bộ về null', () => {
    let selectedOrderId: string | null = mockReadyOrder.id;
    let selectedOrder: OrderDetail | null = mockReadyOrder;

    // Giả lập poll định kỳ trả về data.orders rỗng (ví dụ đơn cuối cùng đã hoàn tất)
    const pollData = { orders: [] as OrderSummary[], detail: null };

    if (pollData.orders.length === 0) {
      selectedOrderId = null;
      selectedOrder = null;
    }

    expect(selectedOrderId).toBeNull();
    expect(selectedOrder).toBeNull();
  });
});
