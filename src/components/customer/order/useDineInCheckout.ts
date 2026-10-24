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

const PENDING_ORDER_STORAGE_PREFIX = 'pv_pending_order_';

export interface PersistedPendingIntent {
  qrCode: string;
  clientRequestId: string;
  menuRevision: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    optionIds: string[];
    note: null; // Explicit privacy-safe: tuyệt đối không lưu ghi chú người dùng vào storage
  }>;
  timestamp: number;
}

function savePendingIntentToStorage(payload: CreateOrderV1Input): void {
  if (typeof window === 'undefined' || !payload.qrCode) return;
  try {
    const safeIntent: PersistedPendingIntent = {
      qrCode: payload.qrCode,
      clientRequestId: payload.clientRequestId,
      menuRevision: payload.menuRevision,
      items: payload.items.map((it) => ({
        menuItemId: it.menuItemId,
        quantity: it.quantity,
        optionIds: [...it.optionIds],
        note: null,
      })),
      timestamp: Date.now(),
    };
    window.sessionStorage.setItem(
      `${PENDING_ORDER_STORAGE_PREFIX}${payload.qrCode}`,
      JSON.stringify(safeIntent)
    );
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

function clearPendingIntentFromStorage(qrCode?: string): void {
  if (typeof window === 'undefined' || !qrCode) return;
  try {
    window.sessionStorage.removeItem(`${PENDING_ORDER_STORAGE_PREFIX}${qrCode}`);
  } catch {
    // Ignore errors
  }
}

function loadPendingIntentFromStorage(qrCode?: string): PersistedPendingIntent | null {
  if (typeof window === 'undefined' || !qrCode) return null;
  try {
    const raw = window.sessionStorage.getItem(`${PENDING_ORDER_STORAGE_PREFIX}${qrCode}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPendingIntent;
    if (Date.now() - parsed.timestamp > 15 * 60 * 1000) {
      clearPendingIntentFromStorage(qrCode);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useDineInCheckout({
  qrCode,
  isTableVerified,
  isTakeaway,
  prepareOrderDraft,
  clearCart,
  refreshCart,
  onOrderConfirmed,
}: UseDineInCheckoutProps) {
  // Check on mount if there is a saved pending intent
  const initialPendingIntent =
    typeof window !== 'undefined' && qrCode
      ? loadPendingIntentFromStorage(qrCode)
      : null;

  const [status, setStatus] = useState<CheckoutSubmissionStatus>(() =>
    initialPendingIntent ? 'uncertain' : 'idle'
  );
  const [confirmedOrder, setConfirmedOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<CheckoutErrorState | null>(() =>
    initialPendingIntent
      ? {
          message:
            'Có yêu cầu đặt món trước đó chưa xác nhận được kết quả. Hãy bấm "Kiểm tra lại / Thử lại" để kiểm tra với đúng mã yêu cầu ban đầu.',
          canRetrySameKey: true,
        }
      : null
  );
  const [clientRequestId, setClientRequestId] = useState<string | null>(
    () => initialPendingIntent?.clientRequestId || null
  );
  const [pendingPayload, setPendingPayload] = useState<CreateOrderV1Input | null>(() =>
    initialPendingIntent
      ? {
          qrCode: initialPendingIntent.qrCode,
          clientRequestId: initialPendingIntent.clientRequestId,
          menuRevision: initialPendingIntent.menuRevision,
          items: initialPendingIntent.items,
          note: null,
        }
      : null
  );

  // Stable clientRequestId (UUID v4) giữ nguyên qua timeout / retry cùng intent (P3-C01/P3-C03)
  const clientRequestIdRef = useRef<string | null>(
    initialPendingIntent?.clientRequestId || null
  );
  // Snapshot payload ban đầu để retry nếu kết nối bị đứt
  const pendingPayloadRef = useRef<CreateOrderV1Input | null>(
    initialPendingIntent
      ? {
          qrCode: initialPendingIntent.qrCode,
          clientRequestId: initialPendingIntent.clientRequestId,
          menuRevision: initialPendingIntent.menuRevision,
          items: initialPendingIntent.items,
          note: null,
        }
      : null
  );
  // Khóa chống double-click: tái sử dụng promise đang thực thi
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);

  const resetCheckout = useCallback(() => {
    setStatus('idle');
    setError(null);
    clientRequestIdRef.current = null;
    pendingPayloadRef.current = null;
    setClientRequestId(null);
    setPendingPayload(null);
    clearPendingIntentFromStorage(qrCode);
  }, [qrCode]);

  const handleExecuteSubmit = useCallback(
    async (payload: CreateOrderV1Input) => {
      setStatus('submitting');
      setError(null);
      savePendingIntentToStorage(payload);

      try {
        const orderResult = await submitCustomerOrder(payload);

        // Thành công: Hủy ID chờ, xóa pending storage, lưu đơn đã chốt và làm sạch giỏ hàng
        clearPendingIntentFromStorage(qrCode);
        clientRequestIdRef.current = null;
        pendingPayloadRef.current = null;
        setClientRequestId(null);
        setPendingPayload(null);
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
            savePendingIntentToStorage(payload);
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
            clearPendingIntentFromStorage(qrCode);
            // Giữ giỏ hàng an toàn, không xóa cart, dẫn khách về xác thực lại bàn
            setStatus('error');
            setError({
              code,
              message: 'Phiên bàn đã hết hạn hoặc chưa được xác thực. Vui lòng xác thực lại mã bàn.',
              isSessionError: true,
              canRetrySameKey: false,
            });
          } else if (code === 'SESSION_CHECKOUT_PENDING') {
            clearPendingIntentFromStorage(qrCode);
            setStatus('error');
            setError({
              code,
              message: 'Bàn đang trong quá trình tính tiền. Không thể gửi thêm đơn mới.',
              isSessionError: true,
              canRetrySameKey: false,
            });
          } else if (code === 'STORE_NOT_ACCEPTING_ORDERS') {
            clearPendingIntentFromStorage(qrCode);
            setStatus('error');
            setError({
              code,
              message: 'Quán đang tạm ngưng nhận đơn đặt món mới. Quý khách vui lòng liên hệ nhân viên.',
              canRetrySameKey: false,
            });
          } else if (code === 'INVALID_STATE_TRANSITION') {
            clearPendingIntentFromStorage(qrCode);
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
            clearPendingIntentFromStorage(qrCode);
            clientRequestIdRef.current = null;
            pendingPayloadRef.current = null;
            setClientRequestId(null);
            setPendingPayload(null);
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
            clearPendingIntentFromStorage(qrCode);
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
            clearPendingIntentFromStorage(qrCode);
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
          savePendingIntentToStorage(payload);
          setStatus('uncertain');
          setError({
            message:
              'Kết nối mạng bị gián đoạn. Chưa rõ quán đã nhận đơn hay chưa. Bạn có thể bấm "Kiểm tra lại / Thử lại" để xác nhận lại đơn bằng đúng mã yêu cầu ban đầu.',
            canRetrySameKey: true,
          });
        }
      }
    },
    [clearCart, onOrderConfirmed, qrCode, refreshCart]
  );

  const retryUncertainOrder = useCallback(async () => {
    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }
    if (!pendingPayloadRef.current) {
      return;
    }
    const promise = handleExecuteSubmit(pendingPayloadRef.current);
    inFlightPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      inFlightPromiseRef.current = null;
    }
  }, [handleExecuteSubmit]);

  const submitOrder = useCallback(async () => {
    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }
    if (status === 'submitting') return;

    // F01: Khi đang ở trạng thái UNCERTAIN, KHÔNG tạo request ID mới! Chuyển thẳng sang retry
    if (status === 'uncertain' && pendingPayloadRef.current) {
      return retryUncertainOrder();
    }

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
    setPendingPayload(payload);

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
    retryUncertainOrder,
    status,
  ]);

  return {
    status,
    confirmedOrder,
    error,
    clientRequestId,
    pendingPayload,
    submitOrder,
    retryUncertainOrder,
    resetCheckout,
  };
}

export type DineInCheckoutInstance = ReturnType<typeof useDineInCheckout>;

