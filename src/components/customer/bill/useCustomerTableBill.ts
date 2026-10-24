'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { TableBillView } from './types';
import { fetchPublicSessionBill, MenuApiError } from '@/features/customer/api-client';

export interface UseCustomerTableBillOptions {
  qrCode: string;
  sessionId?: string;
  initialBill?: TableBillView | null;
  enabled?: boolean;
  refetchIntervalMs?: number;
}

export interface UseCustomerTableBillResult {
  bill: TableBillView | null;
  isLoading: boolean;
  isStale: boolean;
  isPaid: boolean;
  isAccessDenied: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  refetch: () => Promise<void>;
  isBlockedByApi: boolean;
}

/**
 * useCustomerTableBill — Hook tải hóa đơn bàn cho khách ăn tại bàn (Dine-in).
 * Tích hợp theo chuẩn hợp đồng P5_C01 (Codex), P5_G02 & Hotfix P5_HF01:
 * - Tự động tải hóa đơn khi phiên bàn hợp lệ (enabled=true).
 * - Ghim (pin) session ID đã xác thực để truy vấn chính xác cả khi QR bàn đã đóng.
 * - Nhận diện hóa đơn đã thanh toán chính thức từ server (paymentStatus='paid' hoặc settledAt).
 * - Sử dụng AbortController và sequence number để hủy request cũ, ngăn chặn race condition/out-of-order.
 * - Chống ghi đè snapshot cũ: không cho phép snapshot chưa thanh toán ghi đè lên hóa đơn đã thanh toán.
 * - Khi quyền truy cập hết hạn hoặc bị thu hồi (401/403/410/RECEIPT_ACCESS_DENIED/RECEIPT_EXPIRED):
 *   xóa sạch cache hóa đơn, hiển thị màn hình riêng tư bảo mật (không giữ authorization cũ).
 * - Giữ recovery listeners (online / visibilitychange) để tái xác thực khi cần, nhưng dừng interval timer sau khi paid.
 */
export function useCustomerTableBill({
  qrCode,
  sessionId: initialSessionId,
  initialBill = null,
  enabled = true,
  refetchIntervalMs,
}: UseCustomerTableBillOptions): UseCustomerTableBillResult {
  const [fetchedBill, setFetchedBill] = useState<TableBillView | null>(null);
  const bill = fetchedBill ?? initialBill ?? null;
  const pinnedSessionId = initialSessionId || fetchedBill?.session.id || initialBill?.session.id;
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isBlockedByApi, setIsBlockedByApi] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);

  const isPaid = Boolean(
    bill &&
      (bill.session.paymentStatus === 'paid' ||
        (bill.session.status === 'closed' && Boolean(bill.settledAt)))
  );

  const isAccessDenied = Boolean(
    errorCode === 'RECEIPT_ACCESS_DENIED' ||
      errorCode === 'RECEIPT_EXPIRED' ||
      errorCode === 'UNAUTHORIZED' ||
      errorCode === 'FORBIDDEN' ||
      errorCode === 'SESSION_REQUIRED' ||
      errorCode === 'SESSION_EXPIRED'
  );

  const fetchBill = useCallback(async () => {
    if (!qrCode || !enabled) return;

    // Hủy request đang thực hiện dở dang trước đó để tránh race condition
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentSeq = ++requestSeqRef.current;

    setIsLoading(true);

    try {
      const targetSessionId = pinnedSessionId ?? initialBill?.session.id;
      const data = await fetchPublicSessionBill(qrCode, targetSessionId, controller.signal);

      // Nếu request đã bị hủy hoặc không còn là response mới nhất thì bỏ qua
      if (controller.signal.aborted || currentSeq !== requestSeqRef.current) {
        return;
      }

      // Kiểm tra tính tuần tự: không cho phép snapshot cũ chưa thanh toán ghi đè hóa đơn đã thanh toán
      setFetchedBill((prev) => {
        const prevIsPaid = Boolean(
          prev &&
            (prev.session.paymentStatus === 'paid' ||
              (prev.session.status === 'closed' && Boolean(prev.settledAt)))
        );
        const dataIsPaid = Boolean(
          data &&
            (data.session.paymentStatus === 'paid' ||
              (data.session.status === 'closed' && Boolean(data.settledAt)))
        );

        if (prevIsPaid && !dataIsPaid) {
          return prev;
        }

        // Nếu cả hai đều có receiptVersion, không hạ cấp phiên bản cũ hơn
        const prevReceiptVersion = (prev as { receiptVersion?: number } | null)?.receiptVersion;
        const dataReceiptVersion = (data as { receiptVersion?: number } | null)?.receiptVersion;
        if (
          typeof prevReceiptVersion === 'number' &&
          typeof dataReceiptVersion === 'number' &&
          dataReceiptVersion < prevReceiptVersion
        ) {
          return prev;
        }

        return data;
      });

      setIsStale(false);
      setErrorMessage(null);
      setErrorCode(null);
      setIsBlockedByApi(false);
    } catch (err: unknown) {
      if (controller.signal.aborted || currentSeq !== requestSeqRef.current) {
        return;
      }

      if (err instanceof MenuApiError) {
        setErrorCode(err.error.code);
        if (err.status === 404 || err.status === 501) {
          setIsBlockedByApi(true);
          setErrorMessage(
            'Tính năng xem hóa đơn bàn đang được máy chủ hoàn thiện (BLOCKED_BY_API P5_C01).'
          );
        } else if (
          err.status === 401 ||
          err.error.code === 'UNAUTHORIZED' ||
          err.status === 403 ||
          err.error.code === 'RECEIPT_ACCESS_DENIED' ||
          err.error.code === 'FORBIDDEN' ||
          err.error.code === 'SESSION_REQUIRED' ||
          err.status === 410 ||
          err.error.code === 'RECEIPT_EXPIRED' ||
          err.error.code === 'SESSION_EXPIRED'
        ) {
          // Quyền truy cập bị từ chối / hết hạn / bị thu hồi:
          // Xóa bỏ hoàn toàn cache hóa đơn (không tiếp tục ủy quyền giả định với dữ liệu cũ)
          setFetchedBill(null);
          setIsStale(false);
          setErrorMessage('Không thể mở lại hóa đơn trên thiết bị này. Vui lòng liên hệ quán nếu cần hỗ trợ.');
        } else if (err.status === 409 && err.error.code === 'RECEIPT_NOT_READY') {
          setErrorMessage('Hóa đơn đang được quán xử lý thanh toán...');
        } else if (err.status === 409 || err.error.code === 'BILL_CHANGED') {
          setErrorMessage('Hóa đơn đã thay đổi từ lượt gọi món mới. Vui lòng tải lại hóa đơn.');
        } else if (err.status === 429 || err.error.code === 'RATE_LIMITED') {
          const retrySec = err.retryAfterSeconds || 60;
          setErrorMessage(`Thao tác quá thường xuyên. Vui lòng thử lại sau ${retrySec} giây.`);
        } else {
          setErrorMessage(err.error.message || 'Không thể tải thông tin hóa đơn.');
        }
      } else {
        // Lỗi kết nối mạng: Giữ nguyên hóa đơn cũ đã lưu, gắn nhãn chưa cập nhật (isStale)
        setIsStale(true);
        setErrorMessage('Mất kết nối đến máy chủ. Đang hiển thị hóa đơn đã lưu (Chưa cập nhật).');
      }
    } finally {
      if (currentSeq === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [qrCode, enabled, pinnedSessionId, initialBill]);

  // Tự động tải hóa đơn khi bàn hợp lệ, polling tiết chế, và duy trì recovery listeners
  useEffect(() => {
    if (!qrCode || !enabled) return;

    let cancelled = false;

    const executeFetch = () => {
      if (!cancelled) {
        void fetchBill();
      }
    };

    executeFetch();

    let timer: NodeJS.Timeout | null = null;
    // Polling định kỳ CHỈ chạy khi chưa chốt thanh toán, chưa bị từ chối quyền, và không bị block
    if (!isPaid && !isAccessDenied && !isBlockedByApi && refetchIntervalMs && refetchIntervalMs > 0) {
      timer = setInterval(() => {
        if (!cancelled && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          executeFetch();
        }
      }, refetchIntervalMs);
    }

    // Luôn duy trì recovery listeners khi visibility thay đổi hoặc online trở lại
    // Kể cả sau khi đã paid, để có thể tái xác thực nếu tab được mở lại
    const handleVisibilityChange = () => {
      if (!cancelled && typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine) {
        executeFetch();
      }
    };

    const handleOnline = () => {
      if (!cancelled) {
        executeFetch();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [qrCode, enabled, refetchIntervalMs, fetchBill, isPaid, isAccessDenied, isBlockedByApi]);

  return {
    bill,
    isLoading,
    isStale,
    isPaid,
    isAccessDenied,
    errorMessage,
    errorCode,
    refetch: fetchBill,
    isBlockedByApi,
  };
}
