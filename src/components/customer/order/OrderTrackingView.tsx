'use client';

/**
 * ORDER TRACKING VIEW — QR Ordering Minimal MVP (P3-G01)
 *
 * Màn hình theo dõi tiến độ đơn hàng tại bàn (/order/[id]):
 * - Render trạng thái chuẩn từ API:
 *   + accepted (Chờ làm / Đã nhận đơn)
 *   + preparing (Đang làm / Đang chế biến)
 *   + ready (Sẵn sàng phục vụ)
 *   + completed (Đã giao / Đã phục vụ)
 *   + cancelled (Đã hủy)
 * - Progress stepper 4 bước tối giản, kết hợp màu sắc, biểu tượng và chữ tiếng Việt rõ ràng.
 * - Danh sách món, tùy chọn, ghi chú và đơn giá snapshot từ máy chủ.
 * - Tự động làm mới (polling tiết chế 12s) khi tab đang mở, tự động cleanup khi rời trang hoặc khi đơn đã hoàn thành/hủy.
 * - Hỗ trợ đầy đủ màn hình tải, lỗi 403/404/410/mất mạng.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  ChefHat,
  BellRing,
  CheckCircle2,
  XCircle,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  ArrowLeft,
  Info,
} from 'lucide-react';
import type { OrderDetail, OrderStatus } from '../../../../docs/contracts/types';
import { ORDER_STATUS_LABELS } from '../../../../docs/contracts/types';
import {
  getCustomerOrderTracking,
  OrderApiError,
} from '@/features/orders/api-client';
import {
  DEV_MOCK_ORDER_DETAIL_ACCEPTED,
  DEV_MOCK_ORDER_DETAIL_PREPARING,
  DEV_MOCK_ORDER_DETAIL_READY,
  DEV_MOCK_ORDER_DETAIL_COMPLETED,
  DEV_MOCK_ORDER_DETAIL_CANCELLED,
} from './order-api';

export interface OrderTrackingViewProps {
  orderId: string;
  qrCode?: string;
  initialOrder?: OrderDetail | null;
  isDemo?: boolean;
  demoStatus?: OrderStatus;
  className?: string;
}

const STEP_ORDER: Array<{
  status: OrderStatus;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    status: 'accepted',
    label: 'Đã nhận đơn',
    desc: 'Quán đã tiếp nhận',
    icon: Clock,
  },
  {
    status: 'preparing',
    label: 'Đang chế biến',
    desc: 'Bếp đang làm món',
    icon: ChefHat,
  },
  {
    status: 'ready',
    label: 'Sẵn sàng',
    desc: 'Món đã sẵn sàng',
    icon: BellRing,
  },
  {
    status: 'completed',
    label: 'Đã phục vụ',
    desc: 'Hoàn tất phục vụ',
    icon: CheckCircle2,
  },
];

function getStepIndex(status: OrderStatus): number {
  switch (status) {
    case 'accepted':
      return 0;
    case 'preparing':
      return 1;
    case 'ready':
      return 2;
    case 'completed':
      return 3;
    default:
      return -1;
  }
}

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({
  orderId,
  qrCode,
  initialOrder = null,
  isDemo = false,
  demoStatus,
  className = '',
}) => {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(() => {
    if (initialOrder) return initialOrder;
    if (isDemo) {
      switch (demoStatus) {
        case 'preparing':
          return DEV_MOCK_ORDER_DETAIL_PREPARING;
        case 'ready':
          return DEV_MOCK_ORDER_DETAIL_READY;
        case 'completed':
          return DEV_MOCK_ORDER_DETAIL_COMPLETED;
        case 'cancelled':
          return DEV_MOCK_ORDER_DETAIL_CANCELLED;
        default:
          return DEV_MOCK_ORDER_DETAIL_ACCEPTED;
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(!order);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Tham chiếu timer polling có thể thay đổi tần suất linh hoạt (5–8s mặc định, 30s khi lỗi)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTerminalRef = useRef<boolean>(false);
  const loadOrderRef = useRef<((isManual?: boolean) => Promise<void>) | null>(null);

  // Tải trạng thái đơn hàng từ API R05
  const loadOrder = useCallback(
    async (isManual = false) => {
      if (isDemo || isTerminalRef.current) return;

      if (isManual) {
        setIsRefreshing(true);
        setErrorMessage(null);
        setErrorCode(null);
      }

      try {
        const resolvedOrder = await getCustomerOrderTracking(orderId);
        setErrorMessage(null);
        setErrorCode(null);
        setOrder(resolvedOrder);

        if (resolvedOrder.status === 'completed' || resolvedOrder.status === 'cancelled') {
          isTerminalRef.current = true;
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
          return;
        }

        // Lên lịch lần poll tiếp theo sau 6 giây (trong khoảng khuyến nghị 5–8s)
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void loadOrderRef.current?.(false);
          }
        }, 6000);
      } catch (err: unknown) {
        if (err instanceof OrderApiError) {
          setErrorCode(err.error.code);
          const status = err.status;

          if (status === 404) {
            setErrorMessage('Không tìm thấy đơn hàng #' + orderId.slice(0, 8));
            isTerminalRef.current = true;
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            return;
          } else if (status === 401 || status === 403 || status === 410) {
            setErrorMessage(
              'Bạn không có quyền xem đơn hàng này hoặc phiên bàn của bạn đã kết thúc.'
            );
            isTerminalRef.current = true;
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            return;
          } else if (status === 429) {
            const waitMs = Math.max(10, err.retryAfterSeconds ?? 15) * 1000;
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            pollTimerRef.current = setTimeout(() => {
              if (document.visibilityState === 'visible' && navigator.onLine) {
                void loadOrderRef.current?.(false);
              }
            }, waitMs);
            return;
          } else {
            setErrorMessage(err.error.message || 'Không thể tải thông tin đơn hàng.');
          }
        } else {
          setErrorMessage('Mất kết nối mạng. Vui lòng kiểm tra đường truyền và thử lại.');
        }

        // Khi gặp lỗi mạng / 500: lùi thời gian polling (backoff) lên 30s
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void loadOrderRef.current?.(false);
          }
        }, 30000);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isDemo, orderId]
  );

  useEffect(() => {
    loadOrderRef.current = loadOrder;
  });

  // Khởi tạo tải lần đầu bằng pattern async IIFE có cancellation chuẩn React
  useEffect(() => {
    if (order || isDemo) return;

    let cancelled = false;
    void (async () => {
      try {
        const resolvedOrder = await getCustomerOrderTracking(orderId);
        if (cancelled) return;
        setOrder(resolvedOrder);

        if (resolvedOrder.status === 'completed' || resolvedOrder.status === 'cancelled') {
          isTerminalRef.current = true;
          return;
        }

        // Lên lịch poll lần tiếp theo sau 6s
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void loadOrderRef.current?.(false);
          }
        }, 6000);
      } catch (err: unknown) {
        if (cancelled) return;

        if (err instanceof OrderApiError) {
          setErrorCode(err.error.code);
          const status = err.status;

          if (status === 404) {
            setErrorMessage('Không tìm thấy đơn hàng #' + orderId.slice(0, 8));
            isTerminalRef.current = true;
            return;
          } else if (status === 401 || status === 403 || status === 410) {
            setErrorMessage(
              'Bạn không có quyền xem đơn hàng này hoặc phiên bàn của bạn đã kết thúc.'
            );
            isTerminalRef.current = true;
            return;
          } else if (status === 429) {
            const waitMs = Math.max(10, err.retryAfterSeconds ?? 15) * 1000;
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            pollTimerRef.current = setTimeout(() => {
              if (document.visibilityState === 'visible' && navigator.onLine) {
                void loadOrderRef.current?.(false);
              }
            }, waitMs);
            return;
          } else {
            setErrorMessage(err.error.message || 'Không thể tải thông tin đơn hàng.');
          }
        } else {
          setErrorMessage('Mất kết nối mạng. Vui lòng kiểm tra đường truyền và thử lại.');
        }

        // Backoff lên 30s khi lỗi
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void loadOrderRef.current?.(false);
          }
        }, 30000);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order, isDemo, orderId]);

  // Lắng nghe visibilitychange để tiếp tục poll khi quay lại tab
  useEffect(() => {
    if (isDemo) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isTerminalRef.current) {
        void loadOrder(false);
      }
    };

    const handleOnline = () => {
      if (!isTerminalRef.current) {
        void loadOrder(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [isDemo, loadOrder]);

  const handleManualRefresh = () => {
    loadOrder(true);
  };

  const handleOrderMore = () => {
    if (qrCode) {
      router.push(`/q/${encodeURIComponent(qrCode)}`);
    } else {
      router.back();
    }
  };

  // Skeleton loading khi đang fetch ban đầu
  if (isLoading) {
    return (
      <div className={`min-h-screen bg-[#F5F6F5] p-4 flex flex-col items-center justify-center ${className}`}>
        <div className="w-full max-w-lg bg-white rounded-2xl p-6 border border-[#E9ECEA] shadow-xs space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-[#E8F4F0] mx-auto flex items-center justify-center text-[#1D725E] animate-spin">
            <RefreshCw className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-[#1D2522]">Đang tải thông tin đơn hàng...</p>
        </div>
      </div>
    );
  }

  // Màn hình lỗi (404, 403, 410, mất mạng)
  if (errorMessage || !order) {
    return (
      <div className={`min-h-screen bg-[#F5F6F5] p-4 flex flex-col items-center justify-center ${className}`}>
        <div className="w-full max-w-lg bg-white rounded-2xl p-6 border border-[#E9ECEA] shadow-xs text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] mx-auto flex items-center justify-center">
            {errorCode === 'ORDER_NOT_FOUND' ? (
              <XCircle className="w-8 h-8" />
            ) : (
              <AlertTriangle className="w-8 h-8" />
            )}
          </div>

          <h3 className="text-base font-bold text-[#1D2522]">
            {errorCode === 'ORDER_NOT_FOUND' ? 'Không tìm thấy đơn hàng' : 'Thông báo'}
          </h3>

          <p className="text-xs text-[#55605C] leading-relaxed max-w-sm mx-auto">
            {errorMessage || 'Không thể hiển thị thông tin đơn hàng.'}
          </p>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => loadOrder(true)}
              className="w-full h-11 rounded-xl text-xs font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử lại</span>
            </button>

            {qrCode && (
              <button
                type="button"
                onClick={handleOrderMore}
                className="w-full h-11 rounded-xl text-xs font-bold bg-[#FAFBFB] hover:bg-[#E9ECEA] text-[#55605C] border border-[#E9ECEA] flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại thực đơn</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const currentStepIdx = getStepIndex(order.status);
  const isCancelled = order.status === 'cancelled';
  const ticketDisplay =
    order.ticketNo !== null && order.ticketNo !== undefined
      ? `#${String(order.ticketNo).padStart(3, '0')}`
      : `#${order.id.slice(0, 6).toUpperCase()}`;

  const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.totalVnd) + ' đ';

  return (
    <div className={`min-h-screen bg-[#F5F6F5] text-[#1D2522] ${className}`}>
      <div className="w-full max-w-lg mx-auto bg-white min-h-screen shadow-sm flex flex-col pb-12">
        {/* ===================================================================
            1. Header Thanh Điều Hướng
           =================================================================== */}
        <header className="px-4 py-3 border-b border-[#E9ECEA] bg-white flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            {qrCode && (
              <button
                type="button"
                onClick={handleOrderMore}
                className="w-9 h-9 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] text-[#1D2522] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
                aria-label="Quay lại thực đơn"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h1 className="text-sm font-bold text-[#1D2522] leading-tight">
                Tiến độ đơn {ticketDisplay}
              </h1>
              <p className="text-[11px] text-[#727B77] mt-0.5">
                {order.table?.label || 'Bàn phục vụ'} · Ăn tại bàn
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="h-9 px-3 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] text-xs font-semibold text-[#1D725E] flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-50"
            aria-label="Làm mới trạng thái đơn"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
        </header>

        {/* ===================================================================
            2. Thẻ Trạng Thái & Stepper Tiến Độ (Progress Stepper)
           =================================================================== */}
        <div className="p-4 bg-[#FAFBFB] border-b border-[#E9ECEA] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
              Trạng thái đơn hàng
            </span>
            <span className="text-xs font-bold text-[#1D725E]">
              {ORDER_STATUS_LABELS[order.status] || order.status}
            </span>
          </div>

          {/* Nếu đơn bị hủy */}
          {isCancelled ? (
            <div className="p-4 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-bold">Đơn hàng đã bị hủy</span>
              </div>
              <p className="text-xs text-[#55605C] leading-relaxed">
                Đơn hàng này đã được quán hủy. Quý khách vui lòng liên hệ nhân viên phục vụ tại bàn nếu cần hỗ trợ.
              </p>
            </div>
          ) : (
            /* Stepper 4 bước bình thường */
            <div className="py-2">
              <div className="grid grid-cols-4 gap-2 relative">
                {STEP_ORDER.map((step, idx) => {
                  const StepIcon = step.icon;
                  const isCompleted = currentStepIdx > idx;
                  const isCurrent = currentStepIdx === idx;

                  return (
                    <div key={step.status} className="flex flex-col items-center text-center">
                      {/* Biểu tượng trạng thái */}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isCompleted
                            ? 'bg-[#1D725E] text-white shadow-xs'
                            : isCurrent
                              ? 'bg-[#E8F4F0] border-2 border-[#1D725E] text-[#1D725E] shadow-sm'
                              : 'bg-[#F0F2F1] text-[#A0A8A5]'
                        }`}
                      >
                        <StepIcon className="w-5 h-5" />
                      </div>

                      {/* Tiêu đề bước */}
                      <span
                        className={`text-[11px] font-bold mt-2 leading-tight ${
                          isCurrent
                            ? 'text-[#1D725E]'
                            : isCompleted
                              ? 'text-[#1D2522]'
                              : 'text-[#A0A8A5]'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Mô tả bước hiện tại */}
              <div className="mt-4 p-3 rounded-xl bg-white border border-[#E9ECEA] flex items-center justify-between text-xs">
                <span className="text-[#727B77]">Tiến độ hiện tại:</span>
                <span className="font-bold text-[#1D725E]">
                  {STEP_ORDER[currentStepIdx]?.desc || 'Đang xử lý'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ===================================================================
            3. Chi Tiết Đơn Hàng (Order Detail Snapshot)
           =================================================================== */}
        <div className="p-4 space-y-4 flex-1">
          <div className="bg-white rounded-2xl border border-[#E9ECEA] p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E9ECEA] pb-2.5">
              <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
                Món đã gọi ({order.itemCount} phần)
              </span>
              <span className="text-xs font-semibold text-[#1D725E]">
                {ticketDisplay}
              </span>
            </div>

            <div className="divide-y divide-[#E9ECEA]/70">
              {order.lines.map((line) => (
                <div key={line.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-[#F7F8F7] border border-[#E9ECEA] text-[11px] font-bold text-[#1D725E] flex items-center justify-center flex-shrink-0">
                        {line.quantity}×
                      </span>
                      <p className="text-xs font-bold text-[#1D2522] truncate">
                        {line.name}
                      </p>
                    </div>

                    {line.options.length > 0 && (
                      <p className="text-[11px] text-[#727B77] mt-0.5 pl-6">
                        {line.options.map((o) => o.name).join(', ')}
                      </p>
                    )}

                    {line.note && (
                      <p className="text-[11px] text-[#55605C] italic mt-0.5 pl-6">
                        Ghi chú: {line.note}
                      </p>
                    )}
                  </div>

                  <span className="text-xs font-semibold text-[#1D2522] flex-shrink-0 pt-0.5">
                    {new Intl.NumberFormat('vi-VN').format(line.lineTotalVnd)} đ
                  </span>
                </div>
              ))}
            </div>

            {/* Tổng tiền chốt */}
            <div className="pt-3 border-t border-[#E9ECEA] flex items-center justify-between">
              <span className="text-xs font-bold text-[#1D2522]">Tổng tiền:</span>
              <span className="text-base font-extrabold text-[#1D725E]">{formattedTotal}</span>
            </div>
          </div>

          {/* Lưu ý thanh toán */}
          <div className="p-3.5 rounded-2xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-start gap-2.5 text-xs text-[#55605C]">
            <Info className="w-4 h-4 text-[#35977D] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-[#1D2522]">Thanh toán tại bàn</p>
              <p className="text-[11px] text-[#727B77] mt-0.5 leading-relaxed">
                Khi dùng xong bữa, quý khách vui lòng báo nhân viên để thanh toán toàn bộ các đơn tại bàn.
              </p>
            </div>
          </div>
        </div>

        {/* ===================================================================
            4. Nút Hành Động Đáy (Sticky Footer CTAs)
           =================================================================== */}
        <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2 sticky bottom-0">
          <button
            type="button"
            onClick={handleOrderMore}
            className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label="Gọi thêm món vào bàn này"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Gọi thêm món khác</span>
          </button>
        </div>
      </div>
    </div>
  );
};
