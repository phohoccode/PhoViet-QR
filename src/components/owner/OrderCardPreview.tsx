'use client';

import React from 'react';
import { Clock, ShoppingBag, MapPin } from 'lucide-react';
import type { OrderDetail } from '../../../docs/contracts/types';
import { OwnerStatusBadge } from './OwnerStatusBadge';

interface OrderCardPreviewProps {
  order: OrderDetail;
  isSelected: boolean;
  onSelect: () => void;
  className?: string;
}

/**
 * OrderCardPreview — Thẻ đơn hàng đơn lẻ trong hàng đợi của chủ quán.
 * Hiển thị số Ticket lớn (FIFO), loại đơn, số lượng món, trạng thái và thời gian chờ.
 */
export const OrderCardPreview: React.FC<OrderCardPreviewProps> = ({
  order,
  isSelected,
  onSelect,
  className = '',
}) => {
  const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.totalVnd) + ' đ';
  const isDineIn = order.type === 'dine_in';

  return (
    <article
      onClick={onSelect}
      className={`p-4 rounded-2xl border transition-all duration-150 cursor-pointer select-none ${
        isSelected
          ? 'bg-[#E8F4F0]/60 border-[#35977D] shadow-sm ring-1 ring-[#35977D]'
          : 'bg-white border-[#E9ECEA] hover:border-[#C6E7DC] hover:bg-[#FAFBFB]'
      } ${className}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Đơn hàng ticket ${order.ticketNo || 'chưa cấp'}, loại ${
        isDineIn ? order.table?.label || 'Tại bàn' : 'Mang đi'
      }, trạng thái ${order.statusLabel}`}
      aria-pressed={isSelected}
    >
      {/* Hàng 1: Số Ticket & Trạng thái */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-[#1D2522]">
            {order.ticketNo ? `#${String(order.ticketNo).padStart(3, '0')}` : 'Chưa có ticket'}
          </span>

          {/* Huy hiệu loại đơn */}
          {isDineIn ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E8F4F0] text-[#1D725E]">
              <MapPin className="w-3 h-3" />
              <span>{order.table?.label || 'Tại bàn'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F1F3F2] text-[#55605C]">
              <ShoppingBag className="w-3 h-3" />
              <span>Mang đi</span>
            </span>
          )}
        </div>

        {/* Trạng thái đơn */}
        <OwnerStatusBadge status={order.status} />
      </div>

      {/* Hàng 2: Tóm tắt món ăn */}
      <div className="mt-2 text-xs text-[#727B77] line-clamp-1">
        {order.lines && order.lines.length > 0
          ? order.lines.map((l) => `${l.quantity}x ${l.name}`).join(', ')
          : `${order.itemCount} món ăn`}
      </div>

      {/* Hàng 3: Thời gian chờ & Tổng tiền */}
      <div className="mt-3 pt-2.5 border-t border-[#E9ECEA] flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-[#727B77]">
          <Clock className="w-3.5 h-3.5" />
          <span>Vừa nhận</span>
        </div>
        <span className="font-bold text-[#1D2522]">{formattedTotal}</span>
      </div>
    </article>
  );
};
