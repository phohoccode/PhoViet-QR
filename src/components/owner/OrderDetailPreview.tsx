'use client';

import React from 'react';
import {
  Clock,
  MapPin,
  ShoppingBag,
  CheckCircle2,
  Bell,
  PackageCheck,
  FileText,
  AlertCircle,
} from 'lucide-react';
import type { OrderDetail } from '../../../docs/contracts/types';
import { OwnerStatusBadge } from './OwnerStatusBadge';

interface OrderDetailPreviewProps {
  order: OrderDetail | null;
  onMarkReady?: (orderId: string) => void;
  onComplete?: (orderId: string) => void;
  className?: string;
}

/**
 * OrderDetailPreview — Panel chi tiết đơn hàng (Cột phải ~30% trên Desktop).
 * Giao diện trình diễn với nhãn xem trước minh bạch, không tự ý mutate logic nghiệp vụ.
 */
export const OrderDetailPreview: React.FC<OrderDetailPreviewProps> = ({
  order,
  onMarkReady,
  onComplete,
  className = '',
}) => {
  if (!order) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-8 text-center text-[#727B77] bg-white rounded-2xl border border-[#E9ECEA] ${className}`}>
        <FileText className="w-12 h-12 text-[#E9ECEA] mb-3" aria-hidden="true" />
        <p className="text-sm font-semibold text-[#1D2522]">Chưa chọn đơn hàng</p>
        <p className="text-xs text-[#727B77] mt-1">
          Chọn một đơn từ danh sách bên trái để xem chi tiết và xử lý món.
        </p>
      </div>
    );
  }

  const isDineIn = order.type === 'dine_in';
  const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.totalVnd) + ' đ';

  return (
    <div className={`flex flex-col h-full bg-white rounded-2xl border border-[#E9ECEA] overflow-hidden ${className}`}>
      {/* 1. Header chi tiết đơn */}
      <div className="p-4 border-b border-[#E9ECEA] bg-[#FAFBFB]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-[#1D2522]">
              {order.ticketNo ? `#${String(order.ticketNo).padStart(3, '0')}` : 'Đơn mới'}
            </h3>
            {isDineIn ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-[#E8F4F0] text-[#1D725E]">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{order.table?.label || 'Tại bàn'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-[#F1F3F2] text-[#55605C]">
                <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mang đi</span>
              </span>
            )}
          </div>
          <OwnerStatusBadge status={order.status} />
        </div>

        <div className="flex items-center justify-between text-xs text-[#727B77] mt-2">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tạo lúc: {order.createdAt.substring(11, 16)}</span>
          </span>
          <OwnerStatusBadge status={order.payment.status} />
        </div>
      </div>

      {/* 2. Danh sách món ăn trong đơn */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h4 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
          Món ăn cần chuẩn bị ({order.itemCount} phần)
        </h4>

        <div className="divide-y divide-[#E9ECEA]">
          {order.lines.map((line) => {
            const formattedLineTotal =
              new Intl.NumberFormat('vi-VN').format(line.lineTotalVnd) + ' đ';

            return (
              <div key={line.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded bg-[#F7F8F7] text-[#1D2522] font-bold text-xs flex items-center justify-center flex-shrink-0 border border-[#E9ECEA]">
                      {line.quantity}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#1D2522] leading-tight">
                        {line.name}
                      </p>
                      {line.options && line.options.length > 0 && (
                        <p className="text-xs text-[#727B77] mt-0.5">
                          {line.options.map((o) => o.name).join(', ')}
                        </p>
                      )}
                      {line.note && (
                        <p className="text-xs text-[#8A4D00] bg-[#FEF6EE] px-2 py-0.5 rounded mt-1 inline-block">
                          Ghi chú: {line.note}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#1D2522]">
                    {formattedLineTotal}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ghi chú chung của đơn */}
        {order.note && (
          <div className="mt-4 p-3 bg-[#FEF6EE] border border-[#F9DBAF] rounded-xl text-xs text-[#8A4D00]">
            <p className="font-semibold flex items-center gap-1 mb-0.5">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ghi chú từ khách hàng:</span>
            </p>
            <p>{order.note}</p>
          </div>
        )}
      </div>

      {/* 3. Tóm tắt tổng tiền & Hành động hợp lệ */}
      <div className="p-4 border-t border-[#E9ECEA] bg-[#FAFBFB] space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#727B77]">Tổng cộng:</span>
          <span className="text-base font-bold text-[#1D2522]">{formattedTotal}</span>
        </div>

        {/* Thông báo bản xem trước */}
        <div className="p-2 rounded-xl bg-[#E8F4F0] border border-[#C6E7DC] text-[11px] text-[#1D725E] text-center font-medium">
          Bản xem trước UI · Phân quyền & state machine FIFO sẽ do Codex xây dựng ở Phase 3
        </div>

        {/* Nút hành động hợp lệ theo từng trạng thái */}
        {order.status === 'preparing' && (
          <button
            type="button"
            onClick={() => onMarkReady?.(order.id)}
            className="w-full h-11 bg-[#35977D] hover:bg-[#1D725E] text-white rounded-xl text-xs md:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D]"
          >
            <Bell className="w-4 h-4" aria-hidden="true" />
            <span>Đánh dấu món đã sẵn sàng (Xem trước)</span>
          </button>
        )}

        {order.status === 'ready' && (
          <button
            type="button"
            onClick={() => onComplete?.(order.id)}
            className="w-full h-11 bg-[#1D725E] hover:bg-[#165B4B] text-white rounded-xl text-xs md:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            <PackageCheck className="w-4 h-4" aria-hidden="true" />
            <span>{isDineIn ? 'Xác nhận đã phục vụ ra bàn' : 'Xác minh & Đã giao món'} (Xem trước)</span>
          </button>
        )}

        {order.status === 'accepted' && (
          <div className="p-2.5 rounded-xl bg-[#F1F3F2] text-[#55605C] text-xs text-center">
            Đơn đang ở hàng đợi chờ làm. Bấm <strong>&ldquo;Nhận đơn tiếp theo&rdquo;</strong> để tiếp nhận chế biến.
          </div>
        )}

        {order.status === 'completed' && (
          <div className="p-2.5 rounded-xl bg-[#EAF5EA] text-[#1E561E] text-xs font-semibold text-center flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            <span>Đơn hàng đã hoàn tất phục vụ</span>
          </div>
        )}
      </div>
    </div>
  );
};
