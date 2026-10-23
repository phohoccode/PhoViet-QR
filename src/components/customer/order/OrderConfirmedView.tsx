'use client';

/**
 * ORDER CONFIRMED VIEW — QR Ordering Minimal MVP (P3-G01)
 *
 * Màn hình xác nhận đặt món thành công sau khi API trả 201 Created:
 * - Hiển thị số thứ tự phiếu lớn (#028), tên bàn, trạng thái "Chờ làm / Đã nhận đơn".
 * - Hiển thị tổng tiền chốt từ máy chủ (totalVnd) và thời gian quán nhận đơn.
 * - Nhắc nhở thanh toán tại bàn khi xong bữa; tuyệt đối không yêu cầu trả trước hay hiện QR thanh toán.
 * - Hai nút hành động chính: "Theo dõi tiến độ đơn" và "Gọi thêm món" (quay lại menu với giỏ mới).
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  UtensilsCrossed,
  ArrowRight,
  PlusCircle,
  Info,
} from 'lucide-react';
import type { OrderDetail } from '../../../../docs/contracts/types';
import { ORDER_STATUS_LABELS } from '../../../../docs/contracts/types';

export interface OrderConfirmedViewProps {
  order: OrderDetail;
  qrCode: string;
  tableLabel?: string;
  onTrackOrder?: (orderId: string) => void;
  onOrderMore?: () => void;
  className?: string;
}

export const OrderConfirmedView: React.FC<OrderConfirmedViewProps> = ({
  order,
  qrCode,
  tableLabel = 'Bàn',
  onTrackOrder,
  onOrderMore,
  className = '',
}) => {
  const router = useRouter();
  const formattedTicketNo =
    order.ticketNo !== null && order.ticketNo !== undefined
      ? `#${String(order.ticketNo).padStart(3, '0')}`
      : `#${order.id.slice(0, 6).toUpperCase()}`;

  const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.totalVnd) + ' đ';

  const orderTime = order.acceptedAt || order.createdAt;
  const formattedTime = orderTime
    ? new Date(orderTime).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      }) +
      ', ' +
      new Date(orderTime).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
      })
    : '';

  const statusText = ORDER_STATUS_LABELS[order.status] || 'Đã nhận đơn';

  const handleTrackClick = () => {
    if (onTrackOrder) {
      onTrackOrder(order.id);
    } else {
      router.push(`/order/${encodeURIComponent(order.id)}?qrCode=${encodeURIComponent(qrCode)}`);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-[#F5F6F5] ${className}`}>
      {/* Vùng cuộn nội dung */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ===================================================================
            1. Header Thành Công
           =================================================================== */}
        <div className="text-center pt-3 pb-2 space-y-2">
          <div className="w-16 h-16 rounded-full bg-[#E8F4F0] border-2 border-[#1D725E] text-[#1D725E] mx-auto flex items-center justify-center shadow-xs">
            <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
          </div>

          <h2 className="text-xl font-bold text-[#1D2522] tracking-tight">
            Đặt món thành công!
          </h2>
          <p className="text-xs text-[#55605C] max-w-xs mx-auto leading-relaxed">
            Quán đã nhận đơn và chuẩn bị chế biến món cho bạn.
          </p>
        </div>

        {/* ===================================================================
            2. Thẻ Phiếu Đơn Hàng (Ticket Card)
           =================================================================== */}
        <div className="bg-white rounded-2xl border border-[#E9ECEA] p-5 shadow-xs space-y-4">
          {/* Hàng trên: Số phiếu & Trạng thái */}
          <div className="flex items-center justify-between border-b border-[#E9ECEA] pb-3">
            <div>
              <span className="text-[11px] font-bold text-[#727B77] uppercase tracking-wider block">
                Số thứ tự đơn
              </span>
              <span className="text-3xl font-extrabold text-[#1D725E] tracking-tight">
                {formattedTicketNo}
              </span>
            </div>

            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]">
                <Clock className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
                <span>{statusText}</span>
              </span>
              {formattedTime && (
                <p className="text-[11px] text-[#727B77] mt-1">{formattedTime}</p>
              )}
            </div>
          </div>

          {/* Thông tin bàn & hình thức */}
          <div className="grid grid-cols-2 gap-3 py-1 text-xs">
            <div className="p-2.5 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA]">
              <span className="text-[#727B77] block text-[11px]">Bàn phục vụ:</span>
              <span className="font-bold text-[#1D2522] text-sm mt-0.5 block">
                {order.table?.label || tableLabel}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA]">
              <span className="text-[#727B77] block text-[11px]">Hình thức:</span>
              <span className="font-bold text-[#1D725E] text-sm mt-0.5 block flex items-center gap-1">
                <UtensilsCrossed className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ăn tại bàn</span>
              </span>
            </div>
          </div>

          {/* Chi tiết các món trong đơn */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider block">
              Món trong đơn ({order.itemCount} phần)
            </span>

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
          </div>

          {/* Tổng tiền chốt từ máy chủ */}
          <div className="pt-3 border-t border-[#E9ECEA] flex items-center justify-between">
            <span className="text-xs font-bold text-[#1D2522]">Tổng tiền chốt:</span>
            <span className="text-base font-extrabold text-[#1D725E]">{formattedTotal}</span>
          </div>

          {/* Chú thích thanh toán Dine-in minh bạch */}
          <div className="p-3 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-start gap-2 text-[11px] text-[#55605C]">
            <Info className="w-4 h-4 text-[#35977D] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Quý khách thanh toán tại bàn hoặc quầy thu ngân khi dùng xong bữa. Đơn này không cần thanh toán trước.
            </span>
          </div>
        </div>
      </div>

      {/* ===================================================================
          3. Khung Nút Hành Động Đáy (Footer CTAs)
         =================================================================== */}
      <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleTrackClick}
          className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          aria-label="Theo dõi tiến độ đơn hàng"
        >
          <span>Theo dõi tiến độ đơn</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>

        {onOrderMore && (
          <button
            type="button"
            onClick={onOrderMore}
            className="w-full h-11 rounded-xl text-xs sm:text-sm font-bold bg-[#FAFBFB] hover:bg-[#E8F4F0] text-[#1D725E] border border-[#E9ECEA] flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label="Gọi thêm món"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            <span>Gọi thêm món</span>
          </button>
        )}
      </div>
    </div>
  );
};
