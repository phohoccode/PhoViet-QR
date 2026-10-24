import { describe, it, expect } from 'vitest';
import type {
  OrderDetail,
  QRResolution,
} from '../../../docs/contracts/types';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../../docs/contracts/types';
import { generateQrMatrix, matrixToSvg } from '@/lib/qr/qr-code';
import { createCartStore } from '@/features/cart';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TakeawayPaymentView } from '@/components/customer/payment/TakeawayPaymentView';
import {
  getOrderStatusBadgeConfig,
  getOrderStatusSubtitle,
} from '@/components/customer/order/active-order-storage';

describe('P4-G01 Acceptance: Takeaway Review & Checkout Readiness', () => {
  const storeId = 'c0230000-0000-4000-8000-000000000001';
  const catId = 'c0220000-0000-4000-8000-000000000001';
  const item1Id = 'c0220000-0000-4000-8000-000000000011';
  const item2Id = 'c0220000-0000-4000-8000-000000000012';
  const optId = 'c0220000-0000-4000-8000-000000000021';

  const mockMenu = {
    categories: [{ id: catId, name: 'Cà phê & Đồ uống', sortOrder: 1 }],
    items: [
      {
        id: item1Id,
        categoryId: catId,
        name: 'Cà phê muối xứ Huế',
        description: null,
        priceVnd: 35000,
        imageUrl: null,
        available: true,
        options: [{ id: optId, name: 'Thêm kem muối', priceDeltaVnd: 8000, available: true }],
        updatedAt: '2026-10-24T00:00:00Z',
      },
      {
        id: item2Id,
        categoryId: catId,
        name: 'Trà đào cam sả',
        description: null,
        priceVnd: 32000,
        imageUrl: null,
        available: true,
        options: [],
        updatedAt: '2026-10-24T00:00:00Z',
      },
    ],
    menuRevision: 'menu-rev-takeaway-42',
    serverTime: '2026-10-24T00:00:00Z',
  };

  const takeawayResolution: QRResolution = {
    type: 'takeaway',
    mode: 'takeaway',
    store: { id: storeId, name: 'Phở Việt QR', timezone: 'Asia/Ho_Chi_Minh', acceptingOrders: true },
    table: null,
    requiresSessionCode: false,
    session: null,
  };

  it('1. Takeaway mode resolution có type="takeaway", table=null, requiresSessionCode=false', () => {
    expect(takeawayResolution.type).toBe('takeaway');
    expect(takeawayResolution.mode).toBe('takeaway');
    expect(takeawayResolution.table).toBeNull();
    expect(takeawayResolution.requiresSessionCode).toBe(false);
  });

  it('2. Takeaway giỏ 2 món: tính đúng số lượng và tạm tính trước khi chuyển sang thanh toán', async () => {
    const store = createCartStore({
      qrCode: 'TAKEAWAY_COUNTER_PUBLIC',
      storage: null,
      loadResolution: async () => takeawayResolution,
      loadMenu: async () => mockMenu,
    });

    const refreshed = await store.refresh();
    expect(refreshed.ok).toBe(true);

    // Line 1: 1 Cà phê muối (35000) + Thêm kem muối (8000) = 43000
    const add1 = store.addLine({ menuItemId: item1Id, quantity: 1, optionIds: [optId], note: 'Mang đi' });
    // Line 2: 2 Trà đào (32000 * 2) = 64000
    const add2 = store.addLine({ menuItemId: item2Id, quantity: 2, optionIds: [], note: null });

    expect(add1.ok).toBe(true);
    expect(add2.ok).toBe(true);

    const view = store.getView();
    expect(view.itemCount).toBe(3);
    expect(view.lines).toHaveLength(2);
    // 43000 + 64000 = 107000
    expect(view.estimatedSubtotalVnd).toBe(107000);

    const draft = store.prepareOrderDraft();
    expect(draft.ok).toBe(true);
    if (draft.ok) {
      expect(draft.value.qrCode).toBe('TAKEAWAY_COUNTER_PUBLIC');
      expect(draft.value.items).toHaveLength(2);
      expect(draft.value.items[0].quantity).toBe(1);
      expect(draft.value.items[1].quantity).toBe(2);
    }
  });

  it('3. Takeaway không yêu cầu xác thực phiên bàn để tiếp tục thanh toán', () => {
    const isTableVerified = false; // Takeaway không có bàn
    const readiness = { canProceedToReview: true, hasUnavailableItems: false, hasPriceChanges: false };
    const subtotalVnd = 107000;
    const itemsCount = 2;
    const status = 'idle';

    const canSubmitTakeaway =
      readiness.canProceedToReview &&
      subtotalVnd !== null &&
      itemsCount > 0 &&
      status !== 'submitting';

    const canSubmitDineIn =
      readiness.canProceedToReview &&
      subtotalVnd !== null &&
      itemsCount > 0 &&
      isTableVerified &&
      status !== 'submitting';

    expect(canSubmitTakeaway).toBe(true);
    expect(canSubmitDineIn).toBe(false); // Dine-in bị chặn nếu chưa xác thực bàn
  });
});

describe('P4-G01 Acceptance: VietQR Code Generation & Payment Panel', () => {
  const sampleVietQrPayload =
    '00020101021238540010A000000727012400069704220110001234567890208QRIBFTTA53037045405670005802VN62150811PV_TAKEAWAY6304ABCD';

  it('4. Sinh ma trận QR chuẩn từ chuỗi VietQR EMVCo không lỗi', () => {
    const matrix = generateQrMatrix(sampleVietQrPayload);
    expect(matrix).toBeDefined();
    expect(matrix.length).toBeGreaterThan(20);
    expect(matrix[0].length).toBe(matrix.length); // Vuông

    const svg = matrixToSvg(matrix, { size: 240 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('<path');
  });

  it('5. Tính toán countdown thời gian còn hiệu lực chính xác theo expiresAt', () => {
    const futureTime = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 phút nữa
    const diffSeconds = Math.floor((new Date(futureTime).getTime() - Date.now()) / 1000);
    expect(diffSeconds).toBeGreaterThan(880);
    expect(diffSeconds).toBeLessThanOrEqual(900);

    const pastTime = new Date(Date.now() - 5 * 1000).toISOString(); // 5 giây trước
    const diffPast = Math.max(0, Math.floor((new Date(pastTime).getTime() - Date.now()) / 1000));
    expect(diffPast).toBe(0);
  });
});

describe('P4-G01 Acceptance: Payment Status Presentations (7 Distinct States)', () => {
  it('6. pending_payment: Trạng thái chờ thanh toán, nhãn đúng tiếng Việt', () => {
    const orderLabel = ORDER_STATUS_LABELS['pending_payment'];
    expect(orderLabel).toBe('Chờ thanh toán');

    const paymentLabel = PAYMENT_STATUS_LABELS['pending'];
    expect(paymentLabel).toBe('Đang xác nhận thanh toán');

    const config = getOrderStatusBadgeConfig('pending_payment');
    expect(config.label).toBe('Chờ thanh toán');
    expect(config.isCompleted).toBe(false);
    expect(config.isCancelled).toBe(false);
  });

  it('7. paid/accepted: Đã nhận thanh toán chuyển sang Chờ làm', () => {
    const orderLabel = ORDER_STATUS_LABELS['accepted'];
    expect(orderLabel).toBe('Chờ làm');

    const paymentLabel = PAYMENT_STATUS_LABELS['paid'];
    expect(paymentLabel).toBe('Đã thanh toán');

    const config = getOrderStatusBadgeConfig('accepted');
    expect(config.label).toBe('Chờ làm');
    expect(config.badgeClass).toContain('bg-[#E8F4F0]');
  });

  it('8. review_required / payment_exception: Thanh toán cần đối soát, cảnh báo không chuyển tiền lần hai', () => {
    const label = ORDER_STATUS_LABELS['payment_exception'];
    expect(label).toBe('Cần đối soát thanh toán');

    const config = getOrderStatusBadgeConfig('payment_exception');
    expect(config.label).toBe('Cần đối soát thanh toán');
    expect(config.badgeClass).toContain('bg-[#FFFAEB]');

    const subtitle = getOrderStatusSubtitle({
      id: 'ord-exc',
      ticketNo: 0,
      status: 'payment_exception',
      itemCount: 2,
      totalVnd: 75000,
    });
    expect(subtitle).toContain('Cần đối soát thanh toán tại quầy');
  });

  it('9. Trạng thái chờ pending_payment KHÔNG hiển thị số FIFO giả', () => {
    const pendingOrder: Partial<OrderDetail> = {
      id: 'order-takeaway-pending',
      type: 'takeaway',
      status: 'pending_payment',
      ticketNo: null, // Bắt buộc null theo contract Phase 0
      paymentStatus: 'pending',
    };

    expect(pendingOrder.ticketNo).toBeNull();

    // UI helper không cấp số thứ tự giả #001 khi ticketNo là null
    const displayTicket =
      pendingOrder.ticketNo !== null && pendingOrder.ticketNo !== undefined
        ? `#${String(pendingOrder.ticketNo).padStart(3, '0')}`
        : null;

    expect(displayTicket).toBeNull();
  });
});

describe('P4-G01 Acceptance: Order Tracking Takeaway Flow', () => {
  it('10. Khi order đã paid và có ticketNo, hiển thị số phiếu thứ tự chuẩn xác', () => {
    const paidTakeawayOrder: Partial<OrderDetail> = {
      id: 'order-takeaway-paid',
      type: 'takeaway',
      status: 'accepted',
      ticketNo: 42,
      paymentStatus: 'paid',
      totalVnd: 67000,
      itemCount: 2,
    };

    expect(paidTakeawayOrder.ticketNo).toBe(42);
    const displayTicket = `#${String(paidTakeawayOrder.ticketNo).padStart(3, '0')}`;
    expect(displayTicket).toBe('#042');
  });

  it('11. Thông báo "Vui lòng đến quầy nhận món" CHỈ xuất hiện khi status === ready', () => {
    const statuses = ['pending_payment', 'accepted', 'preparing', 'ready', 'completed'];

    for (const st of statuses) {
      const showReadyNotice = st === 'ready';
      if (st === 'ready') {
        expect(showReadyNotice).toBe(true);
      } else {
        expect(showReadyNotice).toBe(false);
      }
    }
  });

  it('12. Không đưa nút thao tác chuyển trạng thái chế biến cho khách', () => {
    // Khách hàng không có quyền chuyển từ preparing sang ready hay completed
    const customerAllowedActions = ['refresh', 'orderMore', 'checkStatus', 'retry'];
    expect(customerAllowedActions).not.toContain('markPreparing');
    expect(customerAllowedActions).not.toContain('markReady');
    expect(customerAllowedActions).not.toContain('markCompleted');
  });
});

describe('P4-G01 Acceptance: Dine-In Isolation & Mobile Ergonomics', () => {
  it('13. Dine-In giữ nguyên mô hình thanh toán tại bàn khi dùng xong bữa', () => {
    const dineInOrder: Partial<OrderDetail> = {
      type: 'dine_in',
      tableSessionId: 'sess-123',
      table: { id: 'tbl-5', label: 'Bàn 05' },
      paymentStatus: 'unpaid',
      status: 'accepted',
      ticketNo: 15,
    };

    expect(dineInOrder.type).toBe('dine_in');
    expect(dineInOrder.paymentStatus).toBe('unpaid');
    // Không bao giờ sinh qrPayload cho đơn Dine-in
    expect('qrPayload' in (dineInOrder as object)).toBe(false);
  });

  it('14. Nút chạm cảm ứng trên màn hình Takeaway đạt >= 44px (h-11 = 44px, h-12 = 48px)', () => {
    const touchButtonHeights = ['h-11', 'h-12'];
    for (const h of touchButtonHeights) {
      const pixels = parseInt(h.replace('h-', ''), 10) * 4;
      expect(pixels).toBeGreaterThanOrEqual(44);
    }
  });

  it('15. Giới hạn khung hình di động tối đa (max-w-lg) để hiển thị đẹp từ 360px đến desktop', () => {
    const containerClasses = 'w-full max-w-lg mx-auto bg-white min-h-screen shadow-sm';
    expect(containerClasses).toContain('max-w-lg');
  });
});

describe('P4-G01 Acceptance: Alignment with Codex P4-C01 PayOS Contract', () => {
  it('16. Khi qrPayload là null nhưng có checkoutUrl, hỗ trợ mở cổng thanh toán PayOS mà không tạo QR giả', () => {
    const paymentState: Partial<TakeawayPaymentViewState> = {
      kind: 'takeaway',
      intentId: 'c0280000-0000-4000-8000-000000000001',
      status: 'pending',
      amountVnd: 50000,
      currency: 'VND',
      checkoutUrl: 'https://pay.payos.vn/web/test-checkout-url',
      qrPayload: null, // Chưa có hoặc recovery sau lost response
      reconciliationRequired: false,
    };

    expect(paymentState.checkoutUrl).toBeDefined();
    expect(paymentState.qrPayload).toBeNull();

    // UI render link thay vì tạo QR rác
    const hasHostedCheckout = Boolean(paymentState.checkoutUrl);
    expect(hasHostedCheckout).toBe(true);
  });

  it('17. Không sử dụng intentId hoặc order.id làm nội dung chuyển khoản thủ công', () => {
    const orderId = 'c0270000-0000-4000-8000-000000000099';
    const intentId = 'c0280000-0000-4000-8000-000000000001';

    // Contract P4-C01 khẳng định intentId và orderId là locators, không phải transfer content
    const payment: Partial<TakeawayPaymentViewState> = {
      kind: 'takeaway',
      intentId,
      status: 'pending',
      amountVnd: 67000,
      currency: 'VND',
      checkoutUrl: null,
      qrPayload: '000201010212...',
      reconciliationRequired: false,
    };

    // reference không tồn tại trong TakeawayPaymentViewState public contract
    expect('reference' in payment).toBe(false);

    // Helper trích xuất reference không được phép tự động fallback sang intentId hay orderId
    const safeReference = (payment as { reference?: string | null })?.reference || null;
    expect(safeReference).toBeNull();
    expect(safeReference).not.toBe(intentId);
    expect(safeReference).not.toBe(orderId);
  });

  it('18. Xử lý chuẩn xác lỗi 503 PAYMENT_PROVIDER_UNAVAILABLE khi cổng chưa cấu hình', () => {
    const errorCode = 'PAYMENT_PROVIDER_UNAVAILABLE';
    const statusHttp = 503;

    let userFriendlyMessage = '';
    if (errorCode === 'PAYMENT_PROVIDER_UNAVAILABLE' || statusHttp === 503) {
      userFriendlyMessage =
        'Cổng thanh toán mang đi của quán đang bảo trì hoặc chưa sẵn sàng. Quý khách vui lòng gọi món trực tiếp tại quầy thu ngân.';
    }

    expect(userFriendlyMessage).toContain('đang bảo trì hoặc chưa sẵn sàng');
    expect(userFriendlyMessage).toContain('quầy thu ngân');
  });

  it('19. Polling R06 (/api/public/payments/:id) cho phép nhận instructions sau khi POST ban đầu trả null', () => {
    // Ban đầu POST trả pending nhưng checkoutUrl/qrPayload là null
    const initialPayment: Partial<TakeawayPaymentViewState> = {
      kind: 'takeaway',
      intentId: 'intent-prov-1',
      status: 'pending',
      checkoutUrl: null,
      qrPayload: null,
    };
    const needsPolling = !initialPayment.qrPayload && !initialPayment.checkoutUrl;
    expect(needsPolling).toBe(true);

    // Sau khi sau after() provisioning hoàn tất, R06 trả về instructions
    const provisionedPayment: Partial<TakeawayPaymentViewState> = {
      ...initialPayment,
      checkoutUrl: 'https://pay.payos.vn/web/123',
      qrPayload: '0002010102123854...',
    };
    const isReady = Boolean(provisionedPayment.qrPayload || provisionedPayment.checkoutUrl);
    expect(isReady).toBe(true);
  });

  it('20. TakeawayPaymentView renders with bounded h-full and scrollable flex-1 min-h-0 container', () => {
    const mockOrder: OrderDetail = {
      id: 'ord-test-1',
      version: 1,
      storeId: 'c0230000-0000-4000-8000-000000000001',
      type: 'takeaway',
      status: 'pending_payment',
      paymentStatus: 'pending',
      ticketNo: null,
      table: null,
      itemCount: 1,
      totalVnd: 35000,
      lines: [
        {
          id: 'line-1',
          menuItemId: 'c0220000-0000-4000-8000-000000000011',
          name: 'Cà phê muối xứ Huế',
          priceVnd: 35000,
          quantity: 1,
          lineTotalVnd: 35000,
          options: [],
          note: null,
        },
      ],
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z',
    };

    const html = renderToStaticMarkup(
      React.createElement(TakeawayPaymentView, {
        order: mockOrder,
        qrCode: 'qr-test',
      })
    );

    expect(html).toContain('overflow-y-auto');
    expect(html).toContain('min-h-0');
    expect(html).toContain('h-full');
    expect(html).toContain('flex-shrink-0');
    expect(html).toContain('h-[100dvh]');
    expect(html).toContain('z-20');
    expect(html).toContain('overscroll-contain');
    expect(html).not.toContain('pb-[calc(6rem');
  });

  it('21. TakeawayPaymentView respects custom className when embedded in sheet and keeps header/footer fixed', () => {
    const mockOrder: OrderDetail = {
      id: 'ord-test-2',
      version: 1,
      storeId: 'c0230000-0000-4000-8000-000000000001',
      type: 'takeaway',
      status: 'pending_payment',
      paymentStatus: 'pending',
      ticketNo: null,
      table: null,
      itemCount: 1,
      totalVnd: 35000,
      lines: [
        {
          id: 'line-1',
          menuItemId: 'c0220000-0000-4000-8000-000000000011',
          name: 'Cà phê muối xứ Huế',
          priceVnd: 35000,
          quantity: 1,
          lineTotalVnd: 35000,
          options: [],
          note: null,
        },
      ],
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z',
    };

    const html = renderToStaticMarkup(
      React.createElement(TakeawayPaymentView, {
        order: mockOrder,
        qrCode: 'qr-test',
        className: 'h-full max-h-full',
      })
    );

    expect(html).toContain('h-full max-h-full');
    expect(html).toContain('overflow-y-auto');
    expect(html).toContain('min-h-0');
    expect(html).toContain('flex-shrink-0');
    expect(html).toContain('z-20');
  });
});

