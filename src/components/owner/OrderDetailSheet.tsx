'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock, MapPin, ShoppingBag, Bell, PackageCheck, AlertCircle } from 'lucide-react';
import type { OrderDetail } from '../../../docs/contracts/types';
import { OwnerStatusBadge } from './OwnerStatusBadge';

interface OrderDetailSheetProps {
  order: OrderDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkReady?: (orderId: string) => void;
  onComplete?: (orderId: string) => void;
}

/**
 * OrderDetailSheet — Sheet/Dialog hiển thị chi tiết đơn hàng cho màn hình Mobile & Tablet (< lg).
 * Cho phép chủ quán xem toàn bộ món ăn, ghi chú, tổng tiền và thao tác trạng thái
 * mà không cần cuộn dọc dài ở đáy trang hoặc bị tràn ngang tại 375px.
 */
export const OrderDetailSheet: React.FC<OrderDetailSheetProps> = ({
  order,
  isOpen,
  onClose,
  onMarkReady,
  onComplete,
}) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleAnimatedClose = useCallback(() => {
    setIsClosing((prev) => {
      if (prev) return prev;
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, 180);
      return true;
    });
  }, [onClose]);

  // Lắng nghe phím Escape để đóng Sheet
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleAnimatedClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleAnimatedClose]);

  if (!isOpen || !order) return null;

  const isDineIn = order.type === 'dine_in';
  const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.totalVnd) + ' đ';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs lg:hidden ${
        isClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-order-title"
      onClick={handleAnimatedClose}
    >
      {/* Container của Sheet */}
      <div
        className={`w-full sm:max-w-lg bg-white rounded-t-[24px] sm:rounded-2xl border border-[#E9ECEA] shadow-2xl max-h-[85vh] flex flex-col overflow-hidden ${
          isClosing
            ? 'animate-sheet-slide-down sm:animate-dialog-card-out'
            : 'animate-sheet-slide-up sm:animate-dialog-card-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Sheet */}
        <div className="p-4 border-b border-[#E9ECEA] bg-[#FAFBFB] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 id="sheet-order-title" className="text-lg font-bold text-[#1D2522]">
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
            <OwnerStatusBadge status={order.status} />
          </div>

          {/* Nút đóng */}
          <button
            type="button"
            onClick={handleAnimatedClose}
            className="w-9 h-9 rounded-xl text-[#727B77] hover:text-[#1D2522] hover:bg-[#E9ECEA] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D]"
            aria-label="Đóng bảng chi tiết đơn"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Thanh thông tin phụ: Giờ tạo & Trạng thái thanh toán */}
        <div className="px-4 py-2 bg-[#F7F8F7] border-b border-[#E9ECEA] flex items-center justify-between text-xs text-[#727B77]">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tạo lúc: {order.createdAt.substring(11, 16)}</span>
          </span>
          <OwnerStatusBadge status={order.payment.status} />
        </div>

        {/* Thân danh sách món ăn trong đơn */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h4 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
            Món cần chuẩn bị ({order.itemCount} phần)
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
                    <span className="text-xs font-bold text-[#1D2522] flex-shrink-0">
                      {formattedLineTotal}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ghi chú chung của khách */}
          {order.note && (
            <div className="mt-3 p-3 bg-[#FEF6EE] border border-[#F9DBAF] rounded-xl text-xs text-[#8A4D00]">
              <p className="font-semibold flex items-center gap-1 mb-0.5">
                <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ghi chú từ khách:</span>
              </p>
              <p>{order.note}</p>
            </div>
          )}
        </div>

        {/* Footer: Tổng tiền & Thao tác */}
        <div className="p-4 border-t border-[#E9ECEA] bg-[#FAFBFB] space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#727B77]">Tổng cộng:</span>
            <span className="text-base font-bold text-[#1D2522]">{formattedTotal}</span>
          </div>

          {/* Badge cảnh báo bản xem trước */}
          <div className="p-2 rounded-xl bg-[#E8F4F0] border border-[#C6E7DC] text-[11px] text-[#1D725E] text-center font-medium">
            Bản xem trước UI · Logic chuyển trạng thái FIFO sẽ do Codex kích hoạt ở Phase 3
          </div>

          {/* Nút hành động theo trạng thái */}
          {order.status === 'preparing' && (
            <button
              type="button"
              onClick={() => {
                onMarkReady?.(order.id);
                onClose();
              }}
              className="w-full h-11 bg-[#35977D] hover:bg-[#1D725E] text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D]"
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              <span>Đánh dấu sẵn sàng (Xem trước)</span>
            </button>
          )}

          {order.status === 'ready' && (
            <button
              type="button"
              onClick={() => {
                onComplete?.(order.id);
                onClose();
              }}
              className="w-full h-11 bg-[#1D725E] hover:bg-[#165B4B] text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <PackageCheck className="w-4 h-4" aria-hidden="true" />
              <span>{isDineIn ? 'Xác nhận đã phục vụ ra bàn' : 'Xác minh & Đã giao món'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
