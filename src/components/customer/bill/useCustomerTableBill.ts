'use client';

import { useState, useCallback, useEffect } from 'react';
import type { TableBillView } from './types';
import { fetchPublicSessionBill, MenuApiError } from '@/features/customer/api-client';

export interface UseCustomerTableBillOptions {
  qrCode: string;
  initialBill?: TableBillView | null;
  enabled?: boolean;
  refetchIntervalMs?: number;
}

export interface UseCustomerTableBillResult {
  bill: TableBillView | null;
  isLoading: boolean;
  isStale: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  refetch: () => Promise<void>;
  isBlockedByApi: boolean;
}

/**
 * useCustomerTableBill — Hook tải hóa đơn bàn cho khách ăn tại bàn (Dine-in).
 * Tích hợp theo chuẩn hợp đồng P5_C01 (Codex) & kiểm tra UX P5_G02:
 * - Tự động tải hóa đơn khi phiên bàn hợp lệ (enabled=true).
 * - Polling tiết chế khi tab active (refetchIntervalMs).
 * - Xử lý graceful mất mạng/lỗi kết nối: giữ nguyên dữ liệu bill đã lưu kèm cờ isStale.
 * - Xử lý 409 xung đột phiên bản billVersion (BILL_CHANGED) với thông báo tiếng Việt rõ ràng.
 * - Nếu backend chưa triển khai endpoint (404/501), gán isBlockedByApi=true.
 */
export function useCustomerTableBill({
  qrCode,
  initialBill = null,
  enabled = true,
  refetchIntervalMs,
}: UseCustomerTableBillOptions): UseCustomerTableBillResult {
  const [fetchedBill, setFetchedBill] = useState<TableBillView | null>(null);
  const bill = fetchedBill ?? initialBill ?? null;
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isBlockedByApi, setIsBlockedByApi] = useState<boolean>(false);

  const fetchBill = useCallback(async () => {
    if (!qrCode || !enabled) return;

    setIsLoading(true);

    try {
      const data = await fetchPublicSessionBill(qrCode);
      setFetchedBill(data);
      setIsStale(false);
      setErrorMessage(null);
      setErrorCode(null);
      setIsBlockedByApi(false);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        setErrorCode(err.error.code);
        if (err.status === 404 || err.status === 501) {
          setIsBlockedByApi(true);
          setErrorMessage(
            'Tính năng xem hóa đơn bàn đang được máy chủ hoàn thiện (BLOCKED_BY_API P5_C01).'
          );
        } else if (err.status === 410 || err.error.code === 'SESSION_EXPIRED') {
          setIsStale(true);
          setErrorMessage('Phiên bàn đã kết thúc hoặc không còn hiệu lực.');
        } else if (err.status === 403 || err.error.code === 'SESSION_REQUIRED') {
          setIsStale(true);
          setErrorMessage('Quyền xem hóa đơn bàn đã hết hiệu lực do phiên bàn đã đóng.');
        } else if (err.status === 409 || err.error.code === 'BILL_CHANGED') {
          setErrorMessage('Hóa đơn đã thay đổi từ lượt gọi món mới. Vui lòng tải lại hóa đơn.');
        } else {
          setErrorMessage(err.error.message || 'Không thể tải thông tin hóa đơn.');
        }
      } else {
        // Lỗi kết nối mạng: Giữ nguyên hóa đơn cũ đã lưu, gắn nhãn chưa cập nhật (isStale)
        setIsStale(true);
        setErrorMessage('Mất kết nối đến máy chủ. Đang hiển thị hóa đơn đã lưu (Chưa cập nhật).');
      }
    } finally {
      setIsLoading(false);
    }
  }, [qrCode, enabled]);

  // Tự động tải hóa đơn khi bàn hợp lệ, polling tiết chế, và khôi phục khi tab hiển thị / online trở lại
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
    if (refetchIntervalMs && refetchIntervalMs > 0) {
      timer = setInterval(() => {
        if (!cancelled && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          executeFetch();
        }
      }, refetchIntervalMs);
    }

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
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [qrCode, enabled, refetchIntervalMs, fetchBill]);

  return {
    bill,
    isLoading,
    isStale,
    errorMessage,
    errorCode,
    refetch: fetchBill,
    isBlockedByApi,
  };
}
