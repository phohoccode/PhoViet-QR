'use client';

/**
 * TAKEAWAY PAYMENT VIEW — QR Ordering Minimal MVP (Phase 4 / P4-G01)
 *
 * Màn hình thanh toán VietQR cho khách mua mang đi (Takeaway Checkout):
 * - Tương thích 100% phong cách Minimal Emerald POS: primary #1D725E, nền xám nhạt #F5F6F5.
 * - Mobile-first, tối ưu màn 360-430px, container max-w-lg, nút chạm >= 44px.
 * - Tích hợp đầy đủ:
 *   + Header chế độ Mua mang đi · Nhận tại quầy
 *   + Tóm tắt chi tiết các món trong đơn (collapsible / readable card)
 *   + Panel hiển thị trạng thái thanh toán (7 trạng thái)
 *   + Panel mã VietQR động, số tiền, mã tham chiếu & countdown timer
 *   + Nút "Tôi đã chuyển khoản" để re-check với server, TUYỆT ĐỐI không set paid ở client
 *   + Xử lý hết hạn (expired), đối soát (review_required) và mất mạng (network_error)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import type { OrderDetail, TakeawayPaymentViewState } from '../../../../docs/contracts/types';
import {
  getCustomerPayment,
  getCustomerOrderTracking,
} from '@/features/orders/api-client';
import { PaymentQrPanel } from './PaymentQrPanel';
import { PaymentStatusPanel } from './PaymentStatusPanel';
import type { PaymentUiStatus, TakeawayPaymentDetails, TakeawayPaymentViewProps } from './types';

export const TakeawayPaymentView: React.FC<TakeawayPaymentViewProps> = ({
  order: initialOrder,
  payment: paymentProp,
  uiStatus: externalUiStatus,
  onCheckStatus,
  onRetryNewPayment,
  onBackToMenu,
  onTrackOrder,
  className = '',
}) => {
  const [currentOrder, setCurrentOrder] = useState<OrderDetail>(initialOrder);
  const initialPayment = (paymentProp || (initialOrder.payment as TakeawayPaymentViewState)) ?? null;
  const [currentPayment, setCurrentPayment] = useState<TakeawayPaymentViewState | TakeawayPaymentDetails | null>(initialPayment);

  // Suy luận trạng thái UI từ backend snapshot hoặc override từ bên ngoài
  const [internalStatus, setInternalStatus] = useState<PaymentUiStatus>(() => {
    if (externalUiStatus) return externalUiStatus;
    if (!initialPayment) return 'pending_payment';

    if (initialPayment.reconciliationRequired || initialPayment.status === 'exception' || initialOrder.status === 'payment_exception') {
      return 'review_required';
    }
    if (initialPayment.status === 'paid' || initialOrder.status === 'accepted' || initialOrder.status === 'preparing' || initialOrder.status === 'ready' || initialOrder.status === 'completed') {
      return 'paid';
    }
    if (initialPayment.status === 'expired') {
      return 'expired';
    }
    if (initialPayment.status === 'failed') {
      return 'failed';
    }
    return 'pending_payment';
  });

  const activeStatus = externalUiStatus || internalStatus;
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [showItemDetails, setShowItemDetails] = useState<boolean>(false);
  const [isExpiredLocal, setIsExpiredLocal] = useState<boolean>(false);

  const amountVnd = currentPayment?.amountVnd ?? currentOrder.totalVnd;
  // Theo handoff Codex P4-C01: intentId và order.id không phải là nội dung chuyển khoản, không dùng làm reference
  const reference = (currentPayment as { reference?: string | null })?.reference || null;
  const expiresAt = currentPayment?.expiresAt || null;
  const checkoutUrl = currentPayment && 'checkoutUrl' in currentPayment ? currentPayment.checkoutUrl : null;
  const qrPayload = currentPayment && 'qrPayload' in currentPayment ? currentPayment.qrPayload : null;

  // Xử lý kiểm tra trạng thái thanh toán từ máy chủ qua R06 (payments/:id) và R05 (orders/:id)
  const handleCheckStatus = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);
    setInternalStatus('verifying');

    try {
      if (onCheckStatus) {
        await onCheckStatus();
      }

      const intentId = currentPayment?.intentId;
      if (intentId) {
        const freshPayment = await getCustomerPayment(intentId);
        setCurrentPayment(freshPayment);

        if (freshPayment.status === 'paid') {
          const freshOrder = await getCustomerOrderTracking(currentOrder.id);
          setCurrentOrder(freshOrder);
          setInternalStatus('paid');
          return;
        } else if (freshPayment.status === 'expired') {
          setInternalStatus('expired');
          return;
        } else if (freshPayment.status === 'exception' || freshPayment.reconciliationRequired) {
          setInternalStatus('review_required');
          return;
        } else if (freshPayment.status === 'failed') {
          setInternalStatus('failed');
          return;
        } else {
          setInternalStatus('pending_payment');
        }
      }

      // Luôn đồng bộ order snapshot
      const freshOrder = await getCustomerOrderTracking(currentOrder.id);
      setCurrentOrder(freshOrder);
      if (freshOrder.payment && freshOrder.payment.kind === 'takeaway') {
        setCurrentPayment(freshOrder.payment);
      }
      if (freshOrder.status === 'accepted' || freshOrder.status === 'preparing' || freshOrder.status === 'ready' || freshOrder.status === 'completed') {
        setInternalStatus('paid');
      } else if (freshOrder.status === 'payment_exception') {
        setInternalStatus('review_required');
      }
    } catch {
      // Khi gặp lỗi mạng trong lúc kiểm tra: chuyển sang network_error giữ nguyên context
      setInternalStatus('network_error');
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, onCheckStatus, currentPayment, currentOrder.id]);

  // Tự động poll R06 để nhận instructions (sau khi POST 201 trả về ban đầu với instructions null) và theo dõi kết quả
  useEffect(() => {
    if (activeStatus === 'paid' || activeStatus === 'expired' || activeStatus === 'failed') return;

    let cancelled = false;
    const pollPayment = async () => {
      const intentId = currentPayment?.intentId;
      try {
        if (intentId) {
          const freshPayment = await getCustomerPayment(intentId);
          if (cancelled) return;
          setCurrentPayment(freshPayment);

          if (freshPayment.status === 'paid') {
            const freshOrder = await getCustomerOrderTracking(currentOrder.id);
            if (cancelled) return;
            setCurrentOrder(freshOrder);
            setInternalStatus('paid');
            return;
          } else if (freshPayment.status === 'expired') {
            setInternalStatus('expired');
            return;
          } else if (freshPayment.status === 'exception' || freshPayment.reconciliationRequired) {
            setInternalStatus('review_required');
            return;
          } else if (freshPayment.status === 'failed') {
            setInternalStatus('failed');
            return;
          }
        }
      } catch {
        // im lặng bỏ qua lỗi poll nền
      }
    };

    // Nếu chưa có qrPayload hoặc checkoutUrl: poll nhanh 2s để nhận instructions
    const needsInstructions = !currentPayment || (!('qrPayload' in currentPayment && currentPayment.qrPayload) && !('checkoutUrl' in currentPayment && currentPayment.checkoutUrl));
    const intervalMs = needsInstructions ? 2000 : 5000;

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void pollPayment();
      }
    }, intervalMs);

    if (needsInstructions) {
      const initialTimeout = setTimeout(() => {
        void pollPayment();
      }, 1000);
      return () => {
        cancelled = true;
        clearTimeout(initialTimeout);
        clearInterval(intervalId);
      };
    }

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentPayment, activeStatus, currentOrder.id]);

  const handleExpiredTrigger = async () => {
    setIsExpiredLocal(true);
    // Theo P4-C01: Đồng hồ đếm ngược cục bộ không tự ý chốt hết hạn nếu máy chủ chưa xác nhận
    await handleCheckStatus();
  };

  const formattedTotal = new Intl.NumberFormat('vi-VN').format(currentOrder.totalVnd) + ' đ';

  const heightClasses = className
    ? className
    : 'h-screen h-[100dvh] max-h-screen max-h-[100dvh]';

  return (
    <div className={`w-full flex flex-col flex-1 min-h-0 bg-[#F5F6F5] text-[#1D2522] overflow-hidden ${heightClasses}`}>
      <div className="w-full max-w-lg mx-auto bg-white flex flex-col h-full max-h-full flex-1 min-h-0 shadow-sm overflow-hidden">
        {/* ===================================================================
            1. Header Thanh Điều Hướng (Cố định ở đỉnh, luôn hiển thị)
           =================================================================== */}
        <header className="px-4 py-3 border-b border-[#E9ECEA] bg-white flex items-center justify-between flex-shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            {onBackToMenu && (
              <button
                type="button"
                onClick={onBackToMenu}
                className="w-11 h-11 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] text-[#1D2522] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
                aria-label="Quay lại thực đơn"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-sm font-bold text-[#1D2522] leading-tight">
                Thanh toán VietQR
              </h1>
              <p className="text-[11px] text-[#727B77] mt-0.5">
                Đơn mang đi · Nhận tại quầy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#026AA2] bg-[#F0F9FF] px-2.5 py-1 rounded-full border border-[#B9E6FE] flex items-center gap-1">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Mang đi</span>
            </span>
          </div>
        </header>

        {/* ===================================================================
            2. Vùng Cuộn Nội Dung Chính
           =================================================================== */}
        <div className="p-4 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* Panel trạng thái thanh toán */}
          <PaymentStatusPanel
            status={activeStatus}
            ticketNo={currentOrder.ticketNo}
            onCheckStatus={handleCheckStatus}
            onRetry={onRetryNewPayment}
            onContactSupport={() => {
              // Hướng dẫn khách đến quầy thu ngân
              const alertBox = document.getElementById('contact-cashier-alert');
              alertBox?.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          {/* Panel hiển thị mã VietQR & Copy actions (chỉ hiện khi chưa thanh toán xong) */}
          {activeStatus !== 'paid' && (
            <PaymentQrPanel
              amountVnd={amountVnd}
              reference={reference}
              qrPayload={qrPayload}
              checkoutUrl={checkoutUrl}
              expiresAt={expiresAt}
              isExpired={isExpiredLocal || activeStatus === 'expired'}
              onExpired={handleExpiredTrigger}
            />
          )}

          {/* ===================================================================
              3. Thẻ Tóm Tắt Món Đã Đặt (Collapsible Summary)
             =================================================================== */}
          <div className="bg-white rounded-3xl border border-[#E9ECEA] overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setShowItemDetails(!showItemDetails)}
              className="w-full p-4 flex items-center justify-between hover:bg-[#FAFBFB] transition-colors text-left"
              aria-expanded={showItemDetails}
            >
              <div>
                <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider block">
                  Chi tiết đơn hàng ({currentOrder.itemCount} phần)
                </span>
                <span className="text-sm font-bold text-[#1D2522] mt-0.5 block">
                  Tổng thanh toán: <span className="text-[#1D725E]">{formattedTotal}</span>
                </span>
              </div>

              <div className="flex items-center gap-1 text-xs font-semibold text-[#727B77]">
                <span>{showItemDetails ? 'Thu gọn' : 'Xem món'}</span>
                {showItemDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {showItemDetails && (
              <div className="p-4 pt-0 border-t border-[#E9ECEA]/60 divide-y divide-[#E9ECEA]/70">
                {currentOrder.lines.map((line) => (
                  <div key={line.id} className="py-2.5 first:pt-2.5 last:pb-0 flex items-start justify-between gap-3">
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
            )}
          </div>

          {/* ===================================================================
              4. Cảnh Báo Đối Soát / Quầy Thu Ngân Anchor
             =================================================================== */}
          <div
            id="contact-cashier-alert"
            className="p-3.5 rounded-2xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-start gap-2.5 text-xs text-[#55605C]"
          >
            <ShieldAlert className="w-4 h-4 text-[#35977D] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-[#1D2522]">Hỗ trợ thanh toán tại quầy</p>
              <p className="text-[11px] text-[#727B77] mt-0.5 leading-relaxed">
                Nếu gặp bất kỳ sự cố chuyển tiền hoặc không thể quét mã, quý khách chỉ cần đọc số tiền ({formattedTotal}) cho thu ngân để được tiếp nhận nhanh nhất.
              </p>
            </div>
          </div>
        </div>

        {/* ===================================================================
            5. Khung Nút Hành Động Đáy (Cố định ở đáy, luôn hiển thị)
           =================================================================== */}
        <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2 flex-shrink-0 z-20 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {activeStatus === 'paid' ? (
            <button
              type="button"
              onClick={() => onTrackOrder?.(currentOrder.id)}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
              aria-label="Xem tiến độ chế biến đơn hàng"
            >
              <span>Xem tiến độ làm món</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : activeStatus === 'expired' ? (
            <button
              type="button"
              onClick={onRetryNewPayment}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#D92D20] hover:bg-[#B42318] text-white flex items-center justify-center gap-2 shadow-xs transition-all"
              aria-label="Tạo lại yêu cầu thanh toán mới"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tạo lại đơn thanh toán mới</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isChecking}
              onClick={handleCheckStatus}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-60"
              aria-label="Kiểm tra trạng thái thanh toán từ máy chủ"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Đang kiểm tra...' : 'Tôi đã chuyển khoản / Kiểm tra trạng thái'}</span>
            </button>
          )}

          {onBackToMenu && (
            <button
              type="button"
              onClick={onBackToMenu}
              className="w-full h-10 rounded-xl text-xs font-semibold text-[#1D725E] hover:bg-[#E8F4F0] transition-colors"
            >
              ← Quay lại thực đơn món ăn
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
