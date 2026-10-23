'use client';

import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';

interface StickyCartPreviewProps {
  itemCount: number;
  totalVnd: number;
  onOpenCart?: () => void;
  className?: string;
}

/**
 * StickyCartPreview — Thanh giỏ hàng nổi cố định tại đáy màn hình mobile.
 * Đóng vai trò là thanh xem trước tương tác (Presentational UI Preview),
 * đạt chiều cao chạm 56px, màu xanh ngọc đậm #1D725E tương phản chuẩn WCAG AA.
 */
export const StickyCartPreview: React.FC<StickyCartPreviewProps> = ({
  itemCount,
  totalVnd,
  onOpenCart,
  className = '',
}) => {
  if (itemCount <= 0) return null;

  const formattedTotal = new Intl.NumberFormat('vi-VN').format(totalVnd) + ' đ';

  return (
    <aside
      className={`fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto ${className}`}
      aria-label="Xem giỏ hàng đã chọn"
    >
      <button
        type="button"
        onClick={onOpenCart}
        className="w-full h-14 px-4 bg-[#1D725E] text-white rounded-2xl shadow-xl flex items-center justify-between transition-transform active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D] focus-visible:ring-offset-2"
        aria-label={`Giỏ hàng có ${itemCount} món, tổng tiền ${formattedTotal}. Nhấn để mở giỏ hàng`}
      >
        {/* Số lượng món & icon giỏ */}
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-white" aria-hidden="true" />
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#E8F4F0] text-[#1D725E]">
              {itemCount}
            </span>
          </div>
          <div className="text-left">
            <p className="text-xs text-white/80 font-medium">Giỏ hàng tạm tính</p>
            <p className="text-sm font-bold tracking-tight text-white">{formattedTotal}</p>
          </div>
        </div>

        {/* Nút xem chi tiết giỏ */}
        <div className="flex items-center gap-1.5 text-xs font-semibold bg-white/10 px-3 py-1.5 rounded-xl hover:bg-white/20 transition-colors">
          <span>Xem giỏ</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </div>
      </button>
    </aside>
  );
};
