'use client';

/**
 * PRE-CHECKOUT REVIEW COMPONENT — QR Ordering Minimal MVP
 * Mã công việc: P3-G01 (Nâng cấp từ P2-G03)
 *
 * Màn hình xem lại trước khi đặt món & Xác nhận gửi đơn Dine-in:
 * - Phân định rõ 2 luồng phục vụ:
 *   + Dine-in: "Sau khi xác nhận đơn, quán sẽ bắt đầu xử lý. Quý khách thanh toán tại bàn hoặc quầy khi kết thúc bữa ăn."
 *   + Takeaway: "Đơn mang đi sẽ thanh toán qua VietQR trước khi quán chế biến (Mở ở Phase 4)."
 * - Tóm tắt chi tiết toàn bộ món, tùy chọn, số lượng, ghi chú và giá tạm tính.
 * - Kiểm tra readiness: Bàn chưa xác thực, món hết hàng, mất kết nối mạng.
 * - Kết nối thực tế với API POST /api/public/orders (R04) qua useDineInCheckout:
 *   + Khóa CTA, hiển thị spinner khi đang gửi đơn (chống double-click).
 *   + Xử lý lỗi mạng gián đoạn (uncertain) bằng cách replay cùng clientRequestId.
 *   + Khi thành công (201), chuyển sang màn hình vé đơn OrderConfirmedView.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  UtensilsCrossed,
  ShoppingBag,
  Info,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ArrowRight,
  Clock,
} from 'lucide-react';
import type { CustomerCartItem, CartReadiness, CustomerCartActions } from './types';
import { calculateLineTotalVnd } from './types';
import type { OrderDetail } from '../../../../docs/contracts/types';
import type { OrderAdmissionView, SubmitAvailability } from '../../shared/admission-types';
import { useDineInCheckout, type DineInCheckoutInstance } from '../order/useDineInCheckout';
import { OrderConfirmedView } from '../order/OrderConfirmedView';
import { TakeawayPaymentView } from '../payment/TakeawayPaymentView';

interface PreCheckoutReviewProps {
  items: CustomerCartItem[];
  subtotalVnd: number | null;
  totalQuantity: number;
  isTakeaway: boolean;
  tableLabel?: string;
  storeName?: string;
  qrCode?: string;
  isTableVerified: boolean;
  readiness: CartReadiness;
  admission?: OrderAdmissionView;
  submitAvailability?: SubmitAvailability;
  cartActions?: CustomerCartActions;
  checkout?: DineInCheckoutInstance;
  onBackToCart: () => void;
  onGoToVerifyTable?: () => void;
  onOrderConfirmed?: (order: OrderDetail) => void;
  onCloseSheet?: () => void;
  isCheckoutPending?: boolean;
  isSessionClosed?: boolean;
  isDemo?: boolean;
  className?: string;
}

export const PreCheckoutReview: React.FC<PreCheckoutReviewProps> = ({
  items,
  subtotalVnd,
  totalQuantity,
  isTakeaway,
  tableLabel = 'Bàn',
  storeName = 'PHỞ VIỆT QR',
  qrCode = '',
  isTableVerified,
  readiness,
  admission,
  submitAvailability,
  cartActions,
  checkout: checkoutProp,
  onBackToCart,
  onGoToVerifyTable,
  onOrderConfirmed,
  onCloseSheet,
  isCheckoutPending = false,
  isSessionClosed = false,
  isDemo = false,
  className = '',
}) => {
  const router = useRouter();
  const internalCheckout = useDineInCheckout({
    qrCode,
    isTableVerified,
    isTakeaway,
    prepareOrderDraft: cartActions?.prepareOrderDraft,
    clearCart: cartActions?.clearCart,
    refreshCart: cartActions?.refresh,
    onOrderConfirmed,
    isDemo,
  });

  const checkout = checkoutProp || internalCheckout;

  // 1. Kiểm tra trạng thái tạm dừng nhận đơn cho chế độ hiện tại
  const isPaused = Boolean(
    (admission && !admission.acceptingOrders && (isTakeaway ? admission.type === 'takeaway' : admission.type === 'dine_in')) ||
    submitAvailability?.state === 'paused'
  );

  // 2. Kiểm tra trạng thái giới hạn tần suất (Rate Limiting HTTP 429)
  const isRateLimited = Boolean(
    checkout.error?.code === 'RATE_LIMITED' ||
    submitAvailability?.state === 'rate_limited'
  );
  const initialRetryWait =
    checkout.error?.retryAfterSeconds ??
    (submitAvailability?.state === 'rate_limited' ? submitAvailability.retryAfterSeconds : undefined) ??
    0;

  const [countdown, setCountdown] = useState<number>(() => {
    return isRateLimited && initialRetryWait > 0 ? initialRetryWait : 0;
  });

  useEffect(() => {
    if (!isRateLimited || initialRetryWait <= 0) {
      return;
    }

    const targetTime = Date.now() + initialRetryWait * 1000;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isRateLimited, initialRetryWait]);

  // 3. Kiểm tra thay đổi thực đơn / giá / tình trạng hết hàng
  const isMenuChanged = Boolean(
    checkout.error?.code === 'PRICE_CHANGED' ||
    checkout.error?.code === 'ITEM_UNAVAILABLE' ||
    checkout.error?.code === 'OUT_OF_STOCK' ||
    checkout.error?.isMenuError
  );

  // 4. Kiểm tra hệ thống quá tải / HTTP 503 / STORE_AT_CAPACITY
  const isOverloaded = Boolean(
    checkout.error?.code === 'STORE_AT_CAPACITY' ||
    checkout.error?.code === 'TEMPORARILY_UNAVAILABLE' ||
    checkout.error?.code === 'PAYMENT_PROVIDER_UNAVAILABLE' ||
    (checkout.error?.code === 'INTERNAL_ERROR' && checkout.status === 'error') ||
    submitAvailability?.state === 'unavailable'
  );

  const formattedSubtotal =
    subtotalVnd === null
      ? 'Không tính được tổng (vượt giới hạn)'
      : new Intl.NumberFormat('vi-VN').format(subtotalVnd) + ' đ';

  // Khi đơn đã được xác nhận bởi máy chủ
  if (checkout.status === 'confirmed' && checkout.confirmedOrder) {
    // Nếu là đơn Takeaway đang chờ thanh toán hoặc cần đối soát VietQR -> hiển thị TakeawayPaymentView
    if (
      checkout.confirmedOrder.type === 'takeaway' &&
      (checkout.confirmedOrder.status === 'pending_payment' || checkout.confirmedOrder.status === 'payment_exception')
    ) {
      return (
        <TakeawayPaymentView
          order={checkout.confirmedOrder}
          qrCode={qrCode}
          className="h-full max-h-full"
          onBackToMenu={() => {
            checkout.resetCheckout();
            onBackToCart();
            onCloseSheet?.();
          }}
          onTrackOrder={(orderId) => {
            router.push(`/order/${encodeURIComponent(orderId)}?qrCode=${encodeURIComponent(qrCode)}`);
          }}
          onRetryNewPayment={() => {
            checkout.resetCheckout();
            onBackToCart();
          }}
        />
      );
    }

    return (
      <OrderConfirmedView
        order={checkout.confirmedOrder}
        qrCode={qrCode}
        tableLabel={tableLabel}
        onOrderMore={() => {
          checkout.resetCheckout();
          onBackToCart();
          onCloseSheet?.();
        }}
        onTrackOrder={(orderId) => {
          router.push(`/order/${encodeURIComponent(orderId)}?qrCode=${encodeURIComponent(qrCode)}`);
        }}
      />
    );
  }

  const canSubmitDineIn =
    readiness.canProceedToReview &&
    subtotalVnd !== null &&
    items.length > 0 &&
    isTableVerified &&
    !isCheckoutPending &&
    !isSessionClosed &&
    !isPaused &&
    !isMenuChanged &&
    countdown === 0 &&
    checkout.status !== 'submitting';

  const canSubmitTakeaway =
    readiness.canProceedToReview &&
    subtotalVnd !== null &&
    items.length > 0 &&
    !isPaused &&
    !isMenuChanged &&
    countdown === 0 &&
    checkout.status !== 'submitting';

  const canSubmit = isTakeaway ? canSubmitTakeaway : canSubmitDineIn;

  return (
    <div className={`flex flex-col h-full min-h-0 flex-1 ${className}`}>
      {/* Header thanh điều hướng quay lại */}
      <div className="p-4 border-b border-[#E9ECEA] bg-white flex items-center gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={onBackToCart}
          disabled={checkout.status === 'submitting'}
          className="w-11 h-11 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] flex items-center justify-center text-[#1D2522] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-50"
          aria-label="Quay lại giỏ hàng"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>

        <div>
          <h3 className="text-base font-bold text-[#1D2522] leading-tight">
            Xem lại trước khi gọi món
          </h3>
          <p className="text-xs text-[#727B77] mt-0.5">
            {storeName} · {isTakeaway ? 'Mang đi' : tableLabel}
          </p>
        </div>
      </div>

      {/* Nội dung cuộn chính */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* =====================================================================
            1. Thẻ Loại Đơn & Chính Sách Phục Vụ
           ===================================================================== */}
        {isTakeaway ? (
          <div className="p-4 rounded-2xl bg-[#F0F9FF] border border-[#B9E6FE] space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#026AA2] text-white flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              </div>
              <span className="text-xs font-bold text-[#026AA2] uppercase tracking-wide">
                Mang đi
              </span>
            </div>

            <p className="text-xs text-[#026AA2] leading-relaxed">
              Đơn mang đi sẽ thanh toán qua VietQR trước khi quán bắt đầu chế biến món.
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-[#E8F4F0] border border-[#C6E7DC] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#1D725E] text-white flex items-center justify-center">
                  <UtensilsCrossed className="w-4 h-4" aria-hidden="true" />
                </div>
                <span className="text-xs font-bold text-[#1D725E] uppercase tracking-wide">
                  Dùng tại bàn · {tableLabel}
                </span>
              </div>

              {isTableVerified ? (
                <span className="text-[11px] font-semibold text-[#1D725E] bg-white px-2 py-0.5 rounded-full border border-[#C6E7DC] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-[#1D725E]" />
                  <span>Đã xác thực bàn</span>
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-[#B54708] bg-[#FEF6EE] px-2 py-0.5 rounded-full border border-[#F9DBAF] flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-[#B54708]" />
                  <span>Chưa xác thực</span>
                </span>
              )}
            </div>

            <p className="text-xs text-[#1D725E] leading-relaxed">
              Sau khi xác nhận đơn, quán sẽ bắt đầu chuẩn bị món. Quý khách thanh toán tại bàn hoặc quầy thu ngân khi kết thúc bữa ăn.
            </p>
          </div>
        )}

        {/* Cảnh báo phiên đang chốt thanh toán hoặc đã đóng */}
        {!isTakeaway && isCheckoutPending && (
          <div className="p-3.5 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] flex items-start gap-2.5 text-xs text-[#8A4D00]">
            <AlertCircle className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-bold text-[#B54708]">Bàn đang được thanh toán</p>
              <p className="text-[11px] mt-0.5 text-[#8A4D00]">
                Bạn không thể gọi thêm món lúc này. Vui lòng đợi nhân viên hoàn tất hoặc hủy thanh toán.
              </p>
            </div>
          </div>
        )}

        {!isTakeaway && isSessionClosed && (
          <div className="p-3.5 rounded-xl bg-[#F0F2F1] border border-[#E9ECEA] flex items-start gap-2.5 text-xs text-[#55605C]">
            <CheckCircle2 className="w-4 h-4 text-[#1D725E] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-bold text-[#1D2522]">Phiên bàn đã kết thúc</p>
              <p className="text-[11px] mt-0.5 text-[#55605C]">
                Hóa đơn đã được thanh toán và phiên bàn đã đóng. Vui lòng liên hệ nhân viên quán nếu quý khách cần phục vụ thêm.
              </p>
            </div>
          </div>
        )}

        {/* =====================================================================
            2. Cảnh báo lỗi / Cần xác thực
           ===================================================================== */}
        {!isTakeaway && !isTableVerified && (
          <div className="p-3.5 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] flex items-start gap-2.5 text-xs text-[#8A4D00]">
            <AlertCircle className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold text-[#B54708]">Cần nhập mã bàn để gọi món</p>
              <p className="text-[11px] mt-0.5 text-[#8A4D00]">
                Vui lòng hỏi nhân viên mã bàn hiện tại để hoàn tất xác thực.
              </p>
              {onGoToVerifyTable && (
                <button
                  type="button"
                  onClick={onGoToVerifyTable}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-[#B54708] hover:bg-[#93370D] text-white text-xs font-bold transition-colors"
                >
                  Nhập mã bàn ngay
                </button>
              )}
            </div>
          </div>
        )}

        {/* Cảnh báo tạm dừng nhận đơn theo chế độ phục vụ */}
        {isPaused && (
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] flex items-start gap-2.5 text-xs text-[#8A4D00]"
          >
            <AlertCircle className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-bold text-[#B54708]">
                {isTakeaway
                  ? 'Quán đang tạm dừng nhận đơn mang đi'
                  : 'Quán đang tạm dừng nhận đơn tại bàn'}
              </p>
              <p className="text-[11px] mt-0.5 text-[#8A4D00] leading-relaxed">
                {admission?.message ||
                  (submitAvailability?.state === 'paused' ? submitAvailability.message : null) ||
                  'Hiện tại quán đang tạm ngưng tiếp nhận đơn mới. Quý khách vui lòng kiểm tra lại sau hoặc liên hệ nhân viên.'}
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo quá tải / HTTP 503 / STORE_AT_CAPACITY */}
        {isOverloaded && (
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] flex items-start gap-2.5 text-xs text-[#B42318]"
          >
            <AlertCircle className="w-4 h-4 text-[#D92D20] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-bold text-[#D92D20]">Hệ thống đang bận</p>
              <p className="text-[11px] mt-0.5 text-[#B42318] leading-relaxed">
                Hệ thống đang bận. Vui lòng kiểm tra lại trạng thái đơn trước khi đặt lại. Quán đang đông, thời gian chuẩn bị có thể lâu hơn.
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo giới hạn tần suất thao tác (HTTP 429 Rate Limiting) */}
        {isRateLimited && (
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] flex items-start gap-2.5 text-xs text-[#8A4D00]"
          >
            <Clock className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-bold text-[#B54708]">Bạn thao tác hơi nhanh</p>
              <p className="text-[11px] mt-0.5 text-[#8A4D00] leading-relaxed">
                Vui lòng thử lại sau{countdown > 0 ? ` (${countdown} giây)` : ''}.
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo thay đổi giá món hoặc tình trạng hết hàng (PRICE_CHANGED / ITEM_UNAVAILABLE) */}
        {isMenuChanged && (
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#B42318] space-y-2"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#D92D20] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-[#D92D20]">Thực đơn đã thay đổi</p>
                <p className="text-[11px] mt-0.5 text-[#B42318] leading-relaxed">
                  {checkout.error?.message ||
                    'Giá món ăn hoặc tình trạng món đã được cập nhật. Vui lòng xem lại giỏ hàng trước khi tiếp tục.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onBackToCart}
              className="w-full h-9 rounded-lg bg-[#D92D20] hover:bg-[#B42318] text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>Xem lại giỏ hàng</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Lỗi thông thường khác từ checkout hook */}
        {checkout.error && !isMenuChanged && !isRateLimited && !isOverloaded && (
          <div className="p-3.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#B42318] space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#D92D20] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Lỗi gửi đơn đặt món</p>
                <p className="text-[11px] mt-0.5 text-[#B42318] leading-relaxed">
                  {checkout.error.message}
                </p>
              </div>
            </div>

            {checkout.error.isSessionError && onGoToVerifyTable && (
              <button
                type="button"
                onClick={onGoToVerifyTable}
                className="text-xs font-bold text-[#D92D20] underline hover:text-[#912018]"
              >
                Nhập lại mã phiên bàn →
              </button>
            )}
          </div>
        )}

        {/* Trạng thái UNCERTAIN khi mất mạng / timeout */}
        {checkout.status === 'uncertain' && (
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] text-xs text-[#8A4D00] space-y-2"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-[#B54708]">Đang kiểm tra kết quả đơn hàng</p>
                <p className="text-[11px] mt-0.5 text-[#8A4D00] leading-relaxed">
                  Chưa thể xác nhận quán đã tiếp nhận đơn hay chưa do gián đoạn kết nối. Hãy bấm nút dưới đây để kiểm tra lại với đúng mã yêu cầu ban đầu (không gửi trùng đơn).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={checkout.retryUncertainOrder}
              className="w-full h-10 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Kiểm tra lại trạng thái đơn</span>
            </button>
          </div>
        )}

        {/* =====================================================================
            3. Danh sách tóm tắt các món trong đơn
           ===================================================================== */}
        <div className="bg-white rounded-2xl border border-[#E9ECEA] p-4 space-y-3">
          <h4 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
            Chi tiết món ({totalQuantity} phần)
          </h4>

          <div className="divide-y divide-[#E9ECEA]/70">
            {items.map((it) => {
              const lineTotal =
                it.estimatedLineTotalVnd ??
                calculateLineTotalVnd(
                  it.basePriceVnd,
                  it.selectedOptions,
                  it.quantity
                );

              return (
                <div key={it.lineId} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-[#F7F8F7] border border-[#E9ECEA] text-[11px] font-bold text-[#1D725E] flex items-center justify-center flex-shrink-0">
                        {it.quantity}×
                      </span>
                      <p className="text-xs font-bold text-[#1D2522] truncate">
                        {it.name}
                      </p>
                    </div>

                    {it.selectedOptions.length > 0 && (
                      <p className="text-[11px] text-[#727B77] mt-0.5 pl-6">
                        {it.selectedOptions.map((o) => o.name).join(', ')}
                      </p>
                    )}

                    {it.note && (
                      <p className="text-[11px] text-[#55605C] italic mt-0.5 pl-6">
                        Ghi chú: {it.note}
                      </p>
                    )}

                    {it.proposedUnitPriceVnd !== null && it.proposedUnitPriceVnd !== undefined && (
                      <p className="text-[11px] text-[#B54708] font-semibold mt-0.5 pl-6">
                        Giá mới: {new Intl.NumberFormat('vi-VN').format(it.proposedUnitPriceVnd)} đ
                      </p>
                    )}
                  </div>

                  <span className="text-xs font-bold text-[#1D2522] flex-shrink-0 pt-0.5">
                    {new Intl.NumberFormat('vi-VN').format(lineTotal)} đ
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* =====================================================================
            4. Tóm tắt Tiền Tạm Tính & Chú Thích Minh Bạch
           ===================================================================== */}
        <div className="bg-white rounded-2xl border border-[#E9ECEA] p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-[#727B77]">
            <span>Tổng số lượng:</span>
            <span className="font-semibold text-[#1D2522]">{totalQuantity} phần</span>
          </div>

          <div className="flex items-center justify-between text-xs text-[#727B77]">
            <span>Tạm tính (chưa gồm thuế/khuyến mãi):</span>
            <span className="text-sm font-bold text-[#1D725E]">{formattedSubtotal}</span>
          </div>

          <div className="pt-2 border-t border-[#E9ECEA] flex items-center justify-between">
            <span className="text-xs font-bold text-[#1D2522]">Tổng tiền tạm tính:</span>
            <span className="text-base font-bold text-[#1D2522]">{formattedSubtotal}</span>
          </div>

          <div className="p-3 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-start gap-2 text-[11px] text-[#727B77] mt-2">
            <Info className="w-3.5 h-3.5 text-[#35977D] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Tổng tiền tạm tính. Quán sẽ xác nhận giá và tình trạng món khi nhận đơn thật.
            </span>
          </div>
        </div>
      </div>

      {/* =======================================================================
          5. Khung Hành Động Đáy (Footer CTAs P3-G01 / P6-G02)
         ======================================================================= */}
      <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2 flex-shrink-0">
        {checkout.status === 'submitting' ? (
          <button
            type="button"
            disabled={true}
            className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E]/70 text-white flex items-center justify-center gap-2 cursor-wait"
            aria-label={isTakeaway ? 'Đang tạo mã thanh toán VietQR' : 'Đang gửi đơn đặt món'}
          >
            <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
            <span>{isTakeaway ? 'Đang tạo mã thanh toán VietQR...' : 'Đang gửi đơn...'}</span>
          </button>
        ) : checkout.status === 'uncertain' ? (
          <button
            type="button"
            onClick={checkout.retryUncertainOrder}
            className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label="Kiểm tra lại trạng thái đơn"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Kiểm tra lại trạng thái đơn</span>
          </button>
        ) : isMenuChanged ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onBackToCart}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#D92D20] hover:bg-[#B42318] text-white flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D92D20]"
              aria-label="Xem lại giỏ hàng do thực đơn thay đổi"
            >
              <span>Xem lại giỏ hàng</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <p className="text-[11px] text-[#D92D20] text-center leading-tight">
              Giá món hoặc tình trạng món đã thay đổi. Vui lòng duyệt lại giỏ hàng.
            </p>
          </div>
        ) : isPaused ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={true}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#FAFBFB] text-[#A0A8A5] border border-[#E9ECEA] flex items-center justify-center gap-2 cursor-not-allowed"
              aria-label="Quán đang tạm dừng nhận đơn"
            >
              <span>Quán đang tạm dừng nhận đơn</span>
            </button>
            <p className="text-[11px] text-[#B54708] text-center leading-tight font-medium">
              {isTakeaway
                ? 'Quán đang tạm dừng nhận đơn mang đi.'
                : 'Quán đang tạm dừng nhận đơn tại bàn.'}
            </p>
          </div>
        ) : countdown > 0 ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={true}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#FAFBFB] text-[#A0A8A5] border border-[#E9ECEA] flex items-center justify-center gap-2 cursor-not-allowed"
              aria-label={`Vui lòng chờ ${countdown} giây để thử lại`}
            >
              <Clock className="w-4 h-4 text-[#A0A8A5]" />
              <span>Vui lòng chờ {countdown}s để thử lại</span>
            </button>
            <p className="text-[11px] text-[#8A4D00] text-center leading-tight">
              Bạn thao tác hơi nhanh. Vui lòng chờ đồng hồ đếm ngược kết thúc để thử lại.
            </p>
          </div>
        ) : !isTakeaway && !isTableVerified ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onGoToVerifyTable}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#FEF6EE] hover:bg-[#FDE8D3] text-[#B54708] border border-[#F9DBAF] flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B54708]"
              aria-label="Vui lòng nhập mã bàn để đặt món"
            >
              <span>Vui lòng nhập mã bàn để đặt món</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <p className="text-[11px] text-[#8A4D00] text-center leading-tight">
              Bàn chưa được xác thực. Bạn cần nhập mã phiên bàn trước khi gửi đơn.
            </p>
          </div>
        ) : !isTakeaway && isCheckoutPending ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={true}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#FAFBFB] text-[#A0A8A5] border border-[#E9ECEA] flex items-center justify-center gap-2 cursor-not-allowed"
              aria-label="Bàn đang thanh toán — Đã khóa gọi thêm"
            >
              <span>Bàn đang thanh toán — Đã khóa gọi thêm</span>
            </button>
            <p className="text-[11px] text-[#B54708] text-center leading-tight font-medium">
              Bàn đang được thanh toán. Bạn không thể gọi thêm món lúc này.
            </p>
          </div>
        ) : !isTakeaway && isSessionClosed ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={true}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#FAFBFB] text-[#A0A8A5] border border-[#E9ECEA] flex items-center justify-center gap-2 cursor-not-allowed"
              aria-label="Phiên bàn đã kết thúc"
            >
              <span>Phiên bàn đã kết thúc</span>
            </button>
            <p className="text-[11px] text-[#727B77] text-center leading-tight">
              Hóa đơn đã được thanh toán và phiên bàn đã đóng.
            </p>
          </div>
        ) : isTakeaway ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={checkout.submitOrder}
              className={`w-full h-12 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
                !canSubmit
                  ? 'bg-[#FAFBFB] border border-[#E9ECEA] text-[#A0A8A5] cursor-not-allowed'
                  : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white'
              }`}
              aria-label="Tiếp tục thanh toán VietQR cho đơn mang đi"
            >
              <span>Tiếp tục thanh toán VietQR</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <p className="text-[11px] text-[#727B77] text-center leading-tight">
              Nhấn tiếp tục để nhận mã VietQR thanh toán chính thức trước khi quán bắt đầu chế biến.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={checkout.submitOrder}
              className={`w-full h-12 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
                !canSubmit
                  ? 'bg-[#FAFBFB] border border-[#E9ECEA] text-[#A0A8A5] cursor-not-allowed'
                  : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white'
              }`}
              aria-label="Xác nhận đặt món ăn tại bàn"
            >
              <span>Xác nhận đặt món</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={checkout.status === 'submitting'}
          onClick={onBackToCart}
          className="w-full h-10 rounded-xl text-xs font-semibold text-[#1D725E] hover:bg-[#E8F4F0] transition-colors disabled:opacity-50"
        >
          {checkout.status === 'uncertain'
            ? '← Xem giỏ hàng (giỏ hàng đang khóa)'
            : '← Quay lại chỉnh sửa giỏ hàng'}
        </button>
      </div>
    </div>
  );
};
