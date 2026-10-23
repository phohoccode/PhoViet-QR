'use client';

/**
 * PRE-CHECKOUT REVIEW COMPONENT — QR Ordering Minimal MVP
 * Mã công việc: P2-G03
 *
 * Màn hình xem lại trước khi đặt món (Bước 2 trong Cart Sheet):
 * - Phân định rõ 2 luồng phục vụ:
 *   + Dine-in: "Sau khi xác nhận đơn, quán sẽ bắt đầu xử lý. Thanh toán cuối phiên tại bàn."
 *   + Takeaway: "Bạn sẽ thanh toán bằng VietQR và đơn chỉ được chuyển sang chế biến sau khi hệ thống xác nhận thanh toán."
 * - Tóm tắt chi tiết toàn bộ món, tùy chọn, số lượng, ghi chú và giá tạm tính.
 * - Kiểm tra readiness: Bàn chưa xác thực, món hết hàng, mất kết nối mạng.
 * - Tuân thủ nghiêm ngặt Phase 2: Nút gửi đơn bị DISABLED kèm nhãn minh bạch:
 *   "Xác nhận & đặt món (Sẽ mở ở giai đoạn tiếp theo)".
 * - Tuyệt đối không giả mạo mã đơn, số FIFO hay thanh toán VietQR giả.
 */

import React from 'react';
import {
  ArrowLeft,
  UtensilsCrossed,
  ShoppingBag,
  Info,
  AlertCircle,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import type { CustomerCartItem, CartReadiness, CustomerCartActions } from './types';
import { calculateLineTotalVnd } from './types';

interface PreCheckoutReviewProps {
  items: CustomerCartItem[];
  subtotalVnd: number | null;
  totalQuantity: number;
  isTakeaway: boolean;
  tableLabel?: string;
  isTableVerified: boolean;
  readiness: CartReadiness;
  cartActions?: CustomerCartActions;
  onBackToCart: () => void;
  onGoToVerifyTable?: () => void;
  className?: string;
}

export const PreCheckoutReview: React.FC<PreCheckoutReviewProps> = ({
  items,
  subtotalVnd,
  totalQuantity,
  isTakeaway,
  tableLabel = 'Bàn',
  isTableVerified,
  readiness,
  cartActions,
  onBackToCart,
  onGoToVerifyTable,
  className = '',
}) => {
  const formattedSubtotal =
    subtotalVnd === null
      ? 'Không tính được tổng (vượt giới hạn)'
      : new Intl.NumberFormat('vi-VN').format(subtotalVnd) + ' đ';

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header thanh điều hướng quay lại */}
      <div className="p-4 border-b border-[#E9ECEA] bg-white flex items-center gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={onBackToCart}
          className="w-11 h-11 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] flex items-center justify-center text-[#1D2522] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          aria-label="Quay lại giỏ hàng"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>

        <div>
          <h3 className="text-base font-bold text-[#1D2522] leading-tight">
            Xem lại trước khi gọi món
          </h3>
          <p className="text-xs text-[#727B77] mt-0.5">
            Kiểm tra kỹ các món và tùy chọn đã chọn
          </p>
        </div>
      </div>

      {/* Nội dung cuộn chính */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* =====================================================================
            1. Thẻ Loại Đơn & Chính Sách Thanh Toán (Quy chuẩn theo Prompt P2-G03)
           ===================================================================== */}
        {isTakeaway ? (
          <div className="p-4 rounded-2xl bg-[#F0F9FF] border border-[#B9E6FE] space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#026AA2] text-white flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              </div>
              <span className="text-xs font-bold text-[#026AA2] uppercase tracking-wide">
                Mang đi · Nhận tại quầy
              </span>
            </div>
            <p className="text-xs text-[#026AA2] leading-relaxed">
              Bạn sẽ thanh toán bằng VietQR và đơn chỉ được chuyển sang chế biến sau khi hệ
              thống xác nhận thanh toán.
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
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D725E] bg-white px-2 py-0.5 rounded-md border border-[#C6E7DC]">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Đã xác nhận bàn</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B54708] bg-[#FFFAEB] px-2 py-0.5 rounded-md border border-[#FEDF89]">
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Chưa xác nhận bàn</span>
                </span>
              )}
            </div>

            <p className="text-xs text-[#1D725E] leading-relaxed">
              Sau khi xác nhận đơn, quán sẽ bắt đầu xử lý. Thanh toán cuối phiên tại bàn.
            </p>
          </div>
        )}

        {/* =====================================================================
            2. Cảnh báo Bàn chưa xác nhận mã phiên (Dine-in Unverified Callout)
           ===================================================================== */}
        {!isTakeaway && !isTableVerified && (
          <div className="p-3.5 rounded-2xl bg-[#FEF6EE] border border-[#F9DBAF] space-y-2.5">
            <div className="flex items-start gap-2 text-xs text-[#8A4D00]">
              <AlertCircle className="w-4 h-4 text-[#8A4D00] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-bold">Mã phiên bàn chưa được xác thực</p>
                <p className="mt-0.5 leading-relaxed">
                  Để đảm bảo tính chính xác cho hóa đơn tại bàn, bạn cần nhập mã phiên bàn (do nhân
                  viên cung cấp) trước khi gửi đơn.
                </p>
              </div>
            </div>

            {onGoToVerifyTable && (
              <button
                type="button"
                onClick={onGoToVerifyTable}
                className="w-full h-10 px-3 rounded-xl text-xs font-bold bg-[#8A4D00] hover:bg-[#6C3C00] text-white transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Nhập mã phiên bàn ngay</span>
              </button>
            )}
          </div>
        )}

        {/* Cảnh báo Phiên bàn thay đổi (Context Changed) */}
        {readiness.contextChanged && (
          <div className="p-3.5 rounded-2xl bg-[#FFFAEB] border border-[#FEDF89] space-y-2.5">
            <div className="flex items-start gap-2 text-xs text-[#B54708]">
              <AlertCircle className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-bold">Phiên bàn đã thay đổi</p>
                <p className="mt-0.5 leading-relaxed">
                  Bàn này đã được mở phiên mới hoặc chuyển phiên. Bạn có muốn tiếp tục dùng giỏ hàng này không?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cartActions?.confirmContextChange?.()}
                className="flex-1 h-9 rounded-xl text-xs font-bold bg-[#B54708] hover:bg-[#93370D] text-white transition-colors"
              >
                Tiếp tục phiên mới
              </button>
              <button
                type="button"
                onClick={() => {
                  cartActions?.clearCart();
                  onBackToCart();
                }}
                className="h-9 px-3 rounded-xl text-xs font-semibold bg-white border border-[#FEDF89] text-[#B54708] hover:bg-[#FFFAEB]"
              >
                Xóa giỏ
              </button>
            </div>
          </div>
        )}

        {/* Cảnh báo Giá thay đổi / Menu thay đổi */}
        {readiness.hasPriceChanges && (
          <div className="p-3.5 rounded-2xl bg-[#FFFAEB] border border-[#FEDF89] space-y-2.5">
            <div className="flex items-start gap-2 text-xs text-[#B54708]">
              <AlertCircle className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-bold">Giá hoặc thực đơn đã cập nhật</p>
                <p className="mt-0.5 leading-relaxed">
                  Một số món trong giỏ có đơn giá mới từ quán. Vui lòng xác nhận để áp dụng bảng giá mới.
                </p>
              </div>
            </div>
            {cartActions?.confirmReview && (
              <button
                type="button"
                onClick={() => cartActions.confirmReview?.()}
                className="w-full h-9 rounded-xl text-xs font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white transition-colors"
              >
                Xác nhận thay đổi giá thực đơn
              </button>
            )}
          </div>
        )}

        {/* Cảnh báo Ghi chú cần kiểm tra lại (Note Privacy in RAM) */}
        {readiness.noteReviewRequired && (
          <div className="p-3.5 rounded-2xl bg-[#F0F9FF] border border-[#B9E6FE] text-xs text-[#026AA2] flex items-start gap-2">
            <Info className="w-4 h-4 text-[#026AA2] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">Ghi chú cần xác nhận lại</p>
              <p className="mt-0.5 leading-relaxed">
                Để bảo vệ thông tin riêng tư, ghi chú không được lưu vào bộ nhớ trình duyệt. Vui lòng kiểm tra lại ghi chú các món trước khi gửi đơn.
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo món hết hàng trong giỏ nếu có */}
        {readiness.hasUnavailableItems && (
          <div className="p-3.5 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#B42318] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">Trong giỏ có món hiện đã hết hàng</p>
              <p className="mt-0.5">
                Vui lòng quay lại giỏ hàng và xóa các món đã hết hàng trước khi gửi đơn.
              </p>
            </div>
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

                    {/* Danh sách tùy chọn */}
                    {it.selectedOptions.length > 0 && (
                      <p className="text-[11px] text-[#727B77] mt-0.5 pl-6">
                        {it.selectedOptions.map((o) => o.name).join(', ')}
                      </p>
                    )}

                    {/* Ghi chú */}
                    {it.note && (
                      <p className="text-[11px] text-[#55605C] italic mt-0.5 pl-6">
                        Ghi chú: {it.note}
                        {it.noteNeedsReview && (
                          <span className="ml-1 text-[#B54708] font-medium not-italic">
                            (cần xác nhận)
                          </span>
                        )}
                      </p>
                    )}

                    {/* Đơn giá đề xuất mới nếu menu có giá mới */}
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
              Giá và tình trạng món sẽ được máy chủ của quán kiểm tra và xác nhận khi gửi đơn thật.
            </span>
          </div>
        </div>
      </div>

      {/* =======================================================================
          5. Khung Hành Động Đáy (Footer CTA Phase 2)
          Tuân thủ: Nút gửi đơn bị DISABLED, giải thích rõ giai đoạn tiếp theo.
         ======================================================================= */}
      <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2 flex-shrink-0">
        <button
          type="button"
          disabled={true}
          className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#FAFBFB] border border-[#E9ECEA] text-[#A0A8A5] flex items-center justify-center gap-2 cursor-not-allowed shadow-none"
          title="Chức năng gửi đơn sẽ được mở ở Phase 3"
          aria-label="Xác nhận và đặt món (Sẽ được mở ở giai đoạn tiếp theo)"
        >
          <Lock className="w-4 h-4 text-[#A0A8A5]" aria-hidden="true" />
          <span>Xác nhận &amp; đặt món (Sẽ mở ở Phase 3)</span>
        </button>

        <p className="text-[11px] text-[#727B77] text-center leading-tight">
          Chức năng gửi đơn và thanh toán đang hoàn thiện. Ở Phase 2, quý khách có thể kiểm tra thực
          đơn và xem trước giỏ hàng.
        </p>

        <button
          type="button"
          onClick={onBackToCart}
          className="w-full h-10 rounded-xl text-xs font-semibold text-[#1D725E] hover:bg-[#E8F4F0] transition-colors"
        >
          ← Quay lại chỉnh sửa giỏ hàng
        </button>
      </div>
    </div>
  );
};
