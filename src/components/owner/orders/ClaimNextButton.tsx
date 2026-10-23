'use client';

import React from 'react';
import { ChefHat, Loader2 } from 'lucide-react';

export interface ClaimNextButtonProps {
  hasAcceptedOrders: boolean;
  isClaiming: boolean;
  onClaimNext: () => Promise<void>;
  className?: string;
}

/**
 * ClaimNextButton — Nút nhận đơn FIFO duy nhất của Chủ quán (P3-G02).
 * - CTA nổi bật màu Emerald #1D725E
 * - Tuyệt đối không cho phép nhận đơn riêng lẻ qua từng thẻ để bảo vệ công bằng FIFO
 * - Khóa nút (disabled) khi không có đơn chờ hoặc khi đang gửi yêu cầu nhận đơn
 * - Có trạng thái xoay spinner khi đang tiếp nhận
 */
export const ClaimNextButton: React.FC<ClaimNextButtonProps> = ({
  hasAcceptedOrders,
  isClaiming,
  onClaimNext,
  className = '',
}) => {
  return (
    <div
      className={`bg-[#FAFBFB] p-3 sm:p-3.5 rounded-2xl border border-[#E9ECEA] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="text-xs">
        <p className="font-bold text-[#1D2522]">Quy trình chế biến công bằng (FIFO)</p>
        <p className="text-[#727B77] mt-0.5">
          Hệ thống tự động tiếp nhận đơn cũ nhất đang chờ làm.
        </p>
      </div>

      <button
        type="button"
        disabled={!hasAcceptedOrders || isClaiming}
        onClick={onClaimNext}
        className={`w-full sm:w-auto h-12 px-6 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
          hasAcceptedOrders && !isClaiming
            ? 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.98] text-white cursor-pointer'
            : 'bg-[#F1F3F2] text-[#A0A8A5] border border-[#E9ECEA] cursor-not-allowed shadow-none'
        }`}
        aria-label="Nhận đơn tiếp theo trong hàng đợi chế biến"
      >
        {isClaiming ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
            <span>Đang tiếp nhận...</span>
          </>
        ) : (
          <>
            <ChefHat className="w-4 h-4" aria-hidden="true" />
            <span>Nhận đơn tiếp theo</span>
          </>
        )}
      </button>
    </div>
  );
};
