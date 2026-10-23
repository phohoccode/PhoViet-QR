'use client';

/**
 * HOOK XỬ LÝ ĐẶT MÓN DINE-IN (P3-G01)
 *
 * Quản lý trạng thái:
 * - 'idle': Chưa gửi đơn
 * - 'submitting': Đang gửi POST /api/public/orders (khóa nút, spinner)
 * - 'uncertain': Timeout hoặc lỗi mạng chưa rõ kết quả -> giữ nguyên clientRequestId để retry
 * - 'error': Lỗi nghiệp vụ từ máy chủ (hết phiên bàn, giá đổi, hết món...)
 * - 'confirmed': Server trả 201 OrderDetail -> xóa giỏ hàng, chuyển sang vé đơn
 */

import { useState, useRef, useCallback } from 'react';
import type {
  CreateOrderV1Input,
  OrderDetail,
} from '../../../../docs/contracts/types';
import type { CartResult, OrderDraft } from '@/features/cart';
import {
  submitCustomerOrder,
  OrderApiError,
} from '@/features/orders/api-client';
import {
  DEV_MOCK_ORDER_DETAIL_ACCEPTED,
  type DineInOrderDetail,
} from './order-api';

export type CheckoutSubmissionStatus =
  | 'idle'
  | 'submitting'
  | 'uncertain'
  | 'confirmed'
  | 'error';

export interface CheckoutErrorState {
  code?: string;
  message: string;
  canRetrySameKey?: boolean;
  isSessionError?: boolean;
  isMenuError?: boolean;
  retryAfterSeconds?: number;
}

export interface UseDineInCheckoutProps {
  qrCode: string;
  isTableVerified: boolean;
  isTakeaway: boolean;
  prepareOrderDraft?: () => CartResult<OrderDraft>;
  clearCart?: () => CartResult<void>;
  refreshCart?: () => Promise<CartResult<void>>;
  onOrderConfirmed?: (order: OrderDetail) => void;
  isDemo?: boolean;
}

export function useDineInCheckout({
  qrCode,
  isTableVerified,
  isTakeaway,
  prepareOrderDraft,
  clearCart,
  refreshCart,
  onOrderConfirmed,
  isDemo = false,
}: UseDineInCheckoutProps) {
  const [status, setStatus] = useState<CheckoutSubmissionStatus>('idle');
  const [confirmedOrder, setConfirmedOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<CheckoutErrorState | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);

  // Stable clientRequestId (UUID v4) giữ nguyên qua timeout / retry cùng intent (P3-C01)
  const clientRequestIdRef = useRef<string | null>(null);
  // Snapshot payload ban đầu để retry nếu kết nối bị đứt
  const pendingPayloadRef = useRef<CreateOrderV1Input | null>(null);
  // Khóa chống double-click: tái sử dụng promise đang thực thi
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);

  const resetCheckout = useCallback(() => {
    setStatus('idle');
    setError(null);
    clientRequestIdRef.current = null;
    pendingPayloadRef.current = null;
    setClientRequestId(null);
  }, []);

  const handleExecuteSubmit = useCallback(
    async (payload: CreateOrderV1Input) => {
      setStatus('submitting');
      setError(null);

      // Chế độ demo chỉ áp dụng trong dev khi có cờ demo
      if (isDemo && process.env.NODE_ENV !== 'production') {
        // Giả lập network delay ngắn cho preview
        await new Promise((r) => setTimeout(r, 600));
        const mockOrder: DineInOrderDetail = {
          ...DEV_MOCK_ORDER_DETAIL_ACCEPTED,
          createdAt: new Date().toISOString(),
          acceptedAt: new Date().toISOString(),
          lines: payload.items.map((it, idx) => ({
            id: `line-${idx + 1}`,
            menuItemId: it.menuItemId,
            name: `Món #${idx + 1}`,
            baseUnitPriceVnd: 35000,
            options: [],
            unitPriceVnd: 35000,
            quantity: it.quantity,
            lineTotalVnd: 35000 * it.quantity,
            note: it.note,
          })),
          totalVnd: payload.items.reduce((s, it) => s + 35000 * it.quantity, 0),
          itemCount: payload.items.reduce((s, it) => s + it.quantity, 0),
        };

        clientRequestIdRef.current = null;
        pendingPayloadRef.current = null;
        setClientRequestId(null);
        setConfirmedOrder(mockOrder);
        setStatus('confirmed');
        clearCart?.();
        onOrderConfirmed?.(mockOrder);
        return;
      }

      try {
        const orderResult = await submitCustomerOrder(payload);

        // Thành công: Hủy ID chờ, lưu đơn đã chốt và làm sạch giỏ hàng
        clientRequestIdRef.current = null;
        pendingPayloadRef.current = null;
        setClientRequestId(null);
        setConfirmedOrder(orderResult);
        setStatus('confirmed');
        clearCart?.();
        onOrderConfirmed?.(orderResult);
      } catch (err: unknown) {
        if (err instanceof OrderApiError) {
          const code = err.error.code;
          const statusHttp = err.status;

          // Network/timeout/500 is UNCERTAIN: giữ nguyên immutable intent và key
          if (statusHttp >= 500 || code === 'INTERNAL_ERROR') {
            setStatus('uncertain');
            setError({
              code,
              message:
                'Máy chủ gặp sự cố trong khi tiếp nhận đơn. Chưa rõ quán đã nhận đơn hay chưa. Bạn có thể bấm "Kiểm tra lại / Thử lại" để xác nhận lại đơn bằng đúng mã yêu cầu ban đầu.',
              canRetrySameKey: true,
            });
            return;
          }

          if (
            code === 'SESSION_EXPIRED' ||
            code === 'SESSION_REQUIRED' ||
            statusHttp === 410 ||
            statusHttp === 403
          ) {
            // Giữ giỏ hàng an toàn, không xóa cart, dẫn khách về xác thực lại bàn
            setStatus('error');
            setError({
              code,
              message: 'Phiên bàn đã hết hạn hoặc chưa được xác thực. Vui lòng xác thực lại mã bàn.',
              isSessionError: true,
              canRetrySameKey: false,
            });
          } else if (code === 'SESSION_CHECKOUT_PENDING') {
            setStatus('error');
            setError({
              code,
              message: 'Bàn đang trong quá trình tính tiền. Không thể gửi thêm đơn mới.',
              isSessionError: true,
              canRetrySameKey: false,
            });
          } else if (code === 'STORE_NOT_ACCEPTING_ORDERS') {
            setStatus('error');
            setError({
              code,
              message: 'Quán đang tạm ngưng nhận đơn đặt món mới. Quý khách vui lòng liên hệ nhân viên.',
              canRetrySameKey: false,
            });
          } else if (code === 'INVALID_STATE_TRANSITION') {
            setStatus('error');
            setError({
              code,
              message: 'Đơn mang đi hiện chưa hỗ trợ đặt trực tiếp (sẽ mở ở Phase 4). Quý khách vui lòng gọi tại quầy thu ngân.',
              canRetrySameKey: false,
            });
          } else if (
            code === 'PRICE_CHANGED' ||
            code === 'OUT_OF_STOCK' ||
            code === 'RESOURCE_NOT_FOUND' ||
            code === 'VALIDATION_ERROR'
          ) {
            // Thực đơn đã thay đổi: Hủy clientRequestId vì payload cần được người dùng duyệt lại
            clientRequestIdRef.current = null;
            pendingPayloadRef.current = null;
            setClientRequestId(null);
            setStatus('error');
            setError({
              code,
              message:
                code === 'PRICE_CHANGED'
                  ? 'Giá món ăn đã được cập nhật trên thực đơn của quán. Vui lòng kiểm tra lại giỏ hàng.'
                  : code === 'OUT_OF_STOCK'
                    ? 'Một số món hoặc tùy chọn đã hết hàng. Vui lòng kiểm tra lại giỏ hàng.'
                    : 'Dữ liệu đơn hàng không hợp lệ hoặc thực đơn đã cập nhật. Vui lòng kiểm tra lại giỏ hàng.',
              isMenuError: true,
              canRetrySameKey: false,
            });
            // Tự động làm mới thực đơn để giỏ hàng reconcile
            void refreshCart?.();
          } else if (code === 'DUPLICATE_REQUEST_CONFLICT') {
            setStatus('error');
            setError({
              code,
              message:
                'Yêu cầu bị xung đột dữ liệu với lần gửi trước đó. Vui lòng kiểm tra lại đơn món.',
              canRetrySameKey: false,
            });
          } else if (code === 'RATE_LIMITED') {
            const waitSec = err.retryAfterSeconds ?? 5;
            setStatus('error');
            setError({
              code,
              message: `Thao tác quá nhanh. Vui lòng chờ ${waitSec} giây rồi thử lại.`,
              canRetrySameKey: true,
              retryAfterSeconds: waitSec,
            });
          } else {
            setStatus('error');
            setError({
              code,
              message: err.error.message || 'Không thể tạo đơn đặt món.',
              canRetrySameKey: true,
            });
          }
        } else {
          // Lỗi mạng hoặc TypeError / Timeout: Không thể xác định kết quả phía server!
          // Vào trạng thái UNCERTAIN, bảo lưu nguyên vẹn clientRequestId và payload
          setStatus('uncertain');
          setError({
            message:
              'Kết nối mạng bị gián đoạn. Chưa rõ quán đã nhận đơn hay chưa. Bạn có thể bấm "Kiểm tra lại / Thử lại" để xác nhận lại đơn bằng đúng mã yêu cầu ban đầu.',
            canRetrySameKey: true,
          });
        }
      }
    },
    [clearCart, isDemo, onOrderConfirmed, refreshCart]
  );

  const submitOrder = useCallback(async () => {
    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }
    if (status === 'submitting') return;

    if (isTakeaway) {
      setStatus('error');
      setError({
        message:
          'Đơn mang đi sẽ thanh toán trước khi quán chế biến (Chức năng này sẽ mở ở Phase 4).',
        canRetrySameKey: false,
      });
      return;
    }

    if (!isTableVerified) {
      setStatus('error');
      setError({
        message: 'Cần xác thực mã phiên bàn trước khi đặt món.',
        isSessionError: true,
        canRetrySameKey: false,
      });
      return;
    }

    if (!prepareOrderDraft) {
      setStatus('error');
      setError({
        message: 'Hệ thống giỏ hàng chưa sẵn sàng để lập phiếu đặt món.',
        canRetrySameKey: false,
      });
      return;
    }

    const draftResult = prepareOrderDraft();
    if (!draftResult.ok) {
      setStatus('error');
      setError({
        code: draftResult.issue.code,
        message:
          draftResult.issue.message ||
          'Giỏ hàng chưa đủ điều kiện đặt món. Vui lòng kiểm tra lại.',
        canRetrySameKey: false,
      });
      return;
    }

    // Sinh stable UUID v4 nếu chưa có
    if (!clientRequestIdRef.current) {
      const newId = crypto.randomUUID();
      clientRequestIdRef.current = newId;
      setClientRequestId(newId);
    }
    const targetRequestId = clientRequestIdRef.current;

    const payload: CreateOrderV1Input = {
      qrCode,
      clientRequestId: targetRequestId,
      menuRevision: draftResult.value.menuRevision,
      items: draftResult.value.items,
      note: draftResult.value.note ?? null,
    };
    pendingPayloadRef.current = payload;

    const promise = handleExecuteSubmit(payload);
    inFlightPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      inFlightPromiseRef.current = null;
    }
  }, [
    handleExecuteSubmit,
    isTableVerified,
    isTakeaway,
    prepareOrderDraft,
    qrCode,
    status,
  ]);

  const retryUncertainOrder = useCallback(async () => {
    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }
    if (!pendingPayloadRef.current) {
      await submitOrder();
      return;
    }
    const promise = handleExecuteSubmit(pendingPayloadRef.current);
    inFlightPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      inFlightPromiseRef.current = null;
    }
  }, [handleExecuteSubmit, submitOrder]);

  return {
    status,
    confirmedOrder,
    error,
    clientRequestId,
    submitOrder,
    retryUncertainOrder,
    resetCheckout,
  };
}
