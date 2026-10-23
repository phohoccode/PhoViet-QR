'use client';

import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';

interface StickyCartPreviewProps {
  itemCount: number;
  totalVnd: number | null;
  onOpenCart?: () => void;
  className?: string;
}

/**
 * StickyCartPreview — Thanh giỏ hàng nổi cố định tại đáy màn hình mobile.
 * Đóng vai trò là thanh xem trước tương tác (Presentational UI Preview),
 * đạt chiều cao chạm 56px (h-14), màu xanh ngọc đậm #1D725E tương phản chuẩn WCAG AA.
 * Hỗ trợ Safe-area inset bottom trên iPhone (Home indicator).
 */
export const StickyCartPreview: React.FC<StickyCartPreviewProps> = ({
  itemCount,
  totalVnd,
  onOpenCart,
  className = '',
}) => {
  if (itemCount <= 0) return null;

  const formattedTotal =
    totalVnd === null
      ? 'Vượt giới hạn tạm tính'
      : new Intl.NumberFormat('vi-VN').format(totalVnd) + ' đ';

  return (
    <aside
      className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 max-w-md mx-auto pointer-events-auto ${className}`}
      aria-label="Xem giỏ hàng đã chọn (Bản xem trước)"
    >
      <button
        type="button"
        onClick={onOpenCart}
        className="w-full h-14 px-4 bg-[#1D725E] hover:bg-[#165B4B] text-white rounded-2xl shadow-sticky flex items-center justify-between transition-transform active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D] focus-visible:ring-offset-2"
        aria-label={`Giỏ hàng xem trước có ${itemCount} món, tổng tiền ${formattedTotal}. Nhấn để mở giỏ hàng xem trước.`}
      >
        {/* Số lượng món & icon giỏ */}
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="w-5 h-5 text-white" aria-hidden="true" />
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#E8F4F0] text-[#1D725E] border border-white/50">
              {itemCount}
            </span>
          </div>
          <div className="text-left">
            <p className="text-[11px] text-white/80 font-medium leading-none">
              Tạm tính · {itemCount} món
            </p>
            <p className="text-sm font-bold tracking-tight text-white mt-1 leading-none">
              {formattedTotal}
            </p>
          </div>
        </div>

        {/* Nút xem chi tiết giỏ */}
        <div className="flex items-center gap-1.5 text-xs font-semibold bg-white/15 px-3 py-1.5 rounded-xl hover:bg-white/25 transition-colors">
          <span>Xem giỏ</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </div>
      </button>
    </aside>
  );
};
