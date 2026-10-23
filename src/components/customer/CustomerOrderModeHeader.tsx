'use client';

import React from 'react';
import { Store, ShoppingBag } from 'lucide-react';
import type { StoreView, OrderType } from '../../../docs/contracts/types';
import { CustomerModeBadge } from './CustomerModeBadge';

interface CustomerOrderModeHeaderProps {
  store: StoreView;
  mode: OrderType;
  tableLabel?: string | null;
  cartItemCount?: number;
  onOpenCart?: () => void;
  className?: string;
}

/**
 * CustomerOrderModeHeader — Header chuẩn hóa thống nhất cho cả hai chế độ QR (Tại bàn & Mang đi).
 * Tuân thủ triệt để phong cách Minimal Emerald POS:
 * - Logo quán bên trái bo góc 12px, nền #E8F4F0, icon #1D725E.
 * - Tên quán đậm, kèm nhãn ngữ cảnh Bàn XX hoặc Mang đi.
 * - Mô tả ngắn gọn ngữ cảnh: "Đặt món tại bàn" vs "Đặt và thanh toán trước — nhận món tại quầy".
 * - Nút giỏ hàng nhỏ trên header đạt touch target >= 44x44px.
 */
export const CustomerOrderModeHeader: React.FC<CustomerOrderModeHeaderProps> = ({
  store,
  mode,
  tableLabel,
  cartItemCount = 0,
  onOpenCart,
  className = '',
}) => {
  const isDineIn = mode === 'dine_in';
  const subtitle = isDineIn
    ? 'Đặt món trực tiếp tại bàn'
    : 'Đặt và thanh toán trước — nhận món tại quầy';

  return (
    <header
      className={`sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E9ECEA] px-4 py-3 flex items-center justify-between gap-3 ${className}`}
    >
      {/* 1. Logo quán & Tên quán & Badge loại đơn */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-[#E8F4F0] flex items-center justify-center flex-shrink-0 text-[#1D725E] shadow-xs">
          <Store className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-[#1D2522] truncate leading-tight">
              {store.name}
            </h1>
            <CustomerModeBadge mode={mode} tableLabel={tableLabel} />
          </div>
          <p className="text-[11px] text-[#727B77] mt-0.5 truncate">{subtitle}</p>
        </div>
      </div>

      {/* 2. Nút giỏ hàng nhỏ trên header (Touch target 44x44px) */}
      <button
        type="button"
        onClick={onOpenCart}
        className="relative w-11 h-11 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] flex items-center justify-center text-[#1D2522] hover:bg-[#E8F4F0] active:scale-95 transition-all flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
        aria-label={`Mở giỏ hàng xem trước, hiện có ${cartItemCount} món`}
      >
        <ShoppingBag className="w-5 h-5 text-[#1D2522]" aria-hidden="true" />
        {cartItemCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#1D725E] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs">
            {cartItemCount}
          </span>
        )}
      </button>
    </header>
  );
};
