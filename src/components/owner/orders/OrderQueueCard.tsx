'use client';

import React from 'react';
import { Clock, MapPin, ShoppingBag, AlertTriangle } from 'lucide-react';
import type { OrderSummary, OrderDetail } from '../../../../docs/contracts/types';
import { OwnerStatusBadge } from '../OwnerStatusBadge';
import { isPaymentReviewRequired } from '@/lib/validations/orders';

export interface OrderQueueCardProps {
  order: OrderSummary | OrderDetail;
  isSelected: boolean;
  onSelect: () => void;
  className?: string;
}

/**
 * Tính toán thời gian tương đối từ ISO timestamp (vd: "2 phút trước", "15:30")
 * Tuyệt đối không dựng timer giả hay ước tính thời gian chế biến không có từ API.
 */
function formatTimeAgo(isoString?: string | null): string {
  if (!isoString) return 'Vừa nhận';
  try {
    const timestamp = new Date(isoString).getTime();
    if (Number.isNaN(timestamp)) return 'Vừa nhận';

    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 60) return 'Vừa nhận';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} giờ trước`;

    return new Date(isoString).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Vừa nhận';
  }
}

/**
 * OrderQueueCard — Thẻ đơn hàng trong hàng đợi FIFO của Chủ quán (P3-G02).
 * - Hiển thị số Ticket lớn từ API (#028)
 * - Tên bàn hoặc Mang đi có chữ và icon
 * - Huy hiệu trạng thái chính thức từ API
 * - Số lượng món, tổng tiền VND snapshot
 * - Tuyệt đối KHÔNG có nút per-card "Bắt đầu làm" trên thẻ accepted để bảo vệ nghiêm ngặt thứ tự FIFO.
 */
export const OrderQueueCard: React.FC<OrderQueueCardProps> = ({
  order,
  isSelected,
  onSelect,
  className = '',
}) => {
  const isDineIn = order.type === 'dine_in';
  const isHeld = isPaymentReviewRequired(order);
  const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.totalVnd) + ' đ';

  // Hiển thị ticketNo nếu có, nếu null hiển thị 6 ký tự ID
  const ticketDisplay =
    order.ticketNo !== null && order.ticketNo !== undefined
      ? `#${String(order.ticketNo).padStart(3, '0')}`
      : `#${order.id.slice(0, 6).toUpperCase()}`;

  const timeLabel = formatTimeAgo(order.acceptedAt || order.createdAt);

  // Nếu là OrderDetail thì có lines, OrderSummary thì chỉ có itemCount
  const lines = 'lines' in order && Array.isArray(order.lines) ? order.lines : null;

  return (
    <article
      onClick={onSelect}
      className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-150 cursor-pointer select-none ${
        isSelected
          ? 'bg-[#E8F4F0]/60 border-[#1D725E] shadow-sm ring-1 ring-[#1D725E]'
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
      aria-label={`Đơn hàng ${ticketDisplay}, ${
        isDineIn ? order.table?.label || 'Bàn phục vụ' : 'Mang đi'
      }, trạng thái ${order.statusLabel}`}
      aria-pressed={isSelected}
    >
      {/* Hàng 1: Số Ticket lớn & Trạng thái */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base sm:text-lg font-extrabold text-[#1D2522]">
            {ticketDisplay}
          </span>

          {/* Huy hiệu loại đơn: Bàn hoặc Mang đi */}
          {isDineIn ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              <span>{order.table?.label || 'Tại bàn'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#F1F3F2] text-[#55605C] border border-[#E9ECEA]">
              <ShoppingBag className="w-3 h-3" aria-hidden="true" />
              <span>Mang đi</span>
            </span>
          )}
        </div>

        {/* Trạng thái đơn từ API hoặc cảnh báo cần đối soát nếu held */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isHeld && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF3F2] text-[#D92D20] border border-[#FECDCA]">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              <span>Cần đối soát</span>
            </span>
          )}
          <OwnerStatusBadge status={order.status} />
        </div>
      </div>

      {/* Hàng 2: Tóm tắt món ăn (nếu có lines) hoặc số lượng món */}
      <div className="mt-2 text-xs text-[#55605C]">
        {lines && lines.length > 0 ? (
          <div className="space-y-0.5 line-clamp-2">
            {lines.map((l) => (
              <p key={l.id} className="truncate">
                <span className="font-bold text-[#1D2522]">{l.quantity}×</span> {l.name}
                {l.note && (
                  <span className="italic text-[#8A4D00] ml-1.5 font-normal">
                    ({l.note})
                  </span>
                )}
              </p>
            ))}
          </div>
        ) : (
          <p className="font-semibold text-[#1D2522]">
            Tổng số: <span>{order.itemCount} phần món</span>
          </p>
        )}
      </div>

      {/* Hàng 3: Thời gian đã trôi qua & Tổng tiền */}
      <div className="mt-3 pt-2.5 border-t border-[#E9ECEA]/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-[#727B77]">
          <Clock className="w-3.5 h-3.5 text-[#A0A8A5]" aria-hidden="true" />
          <span>{timeLabel}</span>
        </div>

        <span className="font-extrabold text-[#1D2522] text-sm">
          {formattedTotal}
        </span>
      </div>
    </article>
  );
};
