'use client';

import React from 'react';
import {
  Clock,
  MapPin,
  ShoppingBag,
  Bell,
  PackageCheck,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Lock,
} from 'lucide-react';
import type { OrderDetail } from '../../../../docs/contracts/types';
import { OwnerStatusBadge } from '../OwnerStatusBadge';

export interface OrderDetailPanelProps {
  order: OrderDetail | null;
  isLoadingDetail?: boolean;
  isActionPending?: boolean;
  pendingActionType?: 'ready' | 'complete' | null;
  onMarkReady?: (order: OrderDetail) => Promise<void>;
  onComplete?: (order: OrderDetail) => Promise<void>;
  onCloseMobile?: () => void;
  className?: string;
}

/**
 * OrderDetailPanel — Bảng hiển thị chi tiết đơn hàng cho Chủ quán (P3-G02).
 * - Cột phải ~30% trên Desktop (>=1024px) và dùng trong Sheet/Drawer trên Mobile/Tablet.
 * - Danh sách món, tùy chọn (options), ghi chú riêng và tổng tiền snapshot từ server.
 * - Trạng thái preparing: CTA "Đã làm xong"
 * - Trạng thái ready (Dine-in): CTA "Đã phục vụ ra bàn"
 * - Trạng thái ready (Takeaway): Khóa nút & thông báo xác minh mã nhận món ở Phase 4
 * - Trạng thái accepted / completed / cancelled: Không có nút hành động trái nguyên tắc
 */
export const OrderDetailPanel: React.FC<OrderDetailPanelProps> = ({
  order,
  isLoadingDetail = false,
  isActionPending = false,
  pendingActionType = null,
  onMarkReady,
  onComplete,
  className = '',
}) => {
  if (isLoadingDetail && !order) {
    return (
      <div
        className={`h-full flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-[#E9ECEA] ${className}`}
      >
        <Loader2 className="w-8 h-8 text-[#1D725E] animate-spin mb-3" aria-hidden="true" />
        <p className="text-sm font-semibold text-[#1D2522]">Đang tải chi tiết đơn hàng...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div
        className={`h-full flex flex-col items-center justify-center p-8 text-center text-[#727B77] bg-white rounded-2xl border border-[#E9ECEA] ${className}`}
      >
        <FileText className="w-12 h-12 text-[#E9ECEA] mb-3" aria-hidden="true" />
        <p className="text-sm font-semibold text-[#1D2522]">Chưa chọn đơn hàng</p>
        <p className="text-xs text-[#727B77] mt-1 max-w-xs">
          Chọn một đơn từ danh sách bên trái để xem chi tiết các món và thao tác chuyển trạng thái.
        </p>
      </div>
    );
  }

  const isDineIn = order.type === 'dine_in';
  const ticketDisplay =
    order.ticketNo !== null && order.ticketNo !== undefined
      ? `#${String(order.ticketNo).padStart(3, '0')}`
      : `#${order.id.slice(0, 6).toUpperCase()}`;

  const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.totalVnd) + ' đ';

  return (
    <div
      className={`flex flex-col h-full bg-white rounded-2xl border border-[#E9ECEA] overflow-hidden ${className}`}
    >
      {/* 1. Header chi tiết phiếu đơn */}
      <div className="p-4 border-b border-[#E9ECEA] bg-[#FAFBFB] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-extrabold text-[#1D2522]">{ticketDisplay}</h3>
            {isDineIn ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{order.table?.label || 'Tại bàn'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-[#F1F3F2] text-[#55605C] border border-[#E9ECEA]">
                <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mang đi</span>
              </span>
            )}
          </div>
          <OwnerStatusBadge status={order.status} />
        </div>

        <div className="flex items-center justify-between text-xs text-[#727B77] mt-2">
          <span className="flex items-center gap-1 text-[11px]">
            <Clock className="w-3.5 h-3.5 text-[#A0A8A5]" aria-hidden="true" />
            <span>
              Tiếp nhận:{' '}
              {new Date(order.acceptedAt || order.createdAt).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </span>

          <span className="text-[11px] font-semibold text-[#55605C]">
            {isDineIn ? 'Thanh toán tại bàn' : 'Chưa thanh toán'}
          </span>
        </div>
      </div>

      {/* 2. Danh sách món ăn trong phiếu đơn */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h4 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
          Chi tiết món ({order.itemCount} phần)
        </h4>

        <div className="divide-y divide-[#E9ECEA]/80">
          {order.lines && order.lines.length > 0 ? (
            order.lines.map((line) => {
              const formattedLineTotal =
                new Intl.NumberFormat('vi-VN').format(line.lineTotalVnd) + ' đ';

              return (
                <div key={line.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span className="w-6 h-6 rounded-md bg-[#F7F8F7] text-[#1D725E] font-bold text-xs flex items-center justify-center flex-shrink-0 border border-[#E9ECEA]">
                        {line.quantity}×
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#1D2522] leading-tight truncate">
                          {line.name}
                        </p>
                        {line.options && line.options.length > 0 && (
                          <p className="text-[11px] text-[#727B77] mt-0.5">
                            {line.options.map((o) => o.name).join(', ')}
                          </p>
                        )}
                        {line.note && (
                          <p className="text-[11px] text-[#8A4D00] bg-[#FEF6EE] px-2 py-0.5 rounded-md mt-1 inline-block border border-[#F9DBAF]">
                            Ghi chú: {line.note}
                          </p>
                        )}
                      </div>
                    </div>

                    <span className="text-xs font-semibold text-[#1D2522] flex-shrink-0 pt-0.5">
                      {formattedLineTotal}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-[#727B77] py-2">Không có chi tiết dòng món</p>
          )}
        </div>

        {/* Ghi chú chung của toàn đơn */}
        {order.note && (
          <div className="mt-3 p-3 bg-[#FEF6EE] border border-[#F9DBAF] rounded-xl text-xs text-[#8A4D00]">
            <p className="font-bold flex items-center gap-1 mb-0.5">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ghi chú từ khách:</span>
            </p>
            <p className="mt-0.5">{order.note}</p>
          </div>
        )}
      </div>

      {/* 3. Tóm tắt tổng tiền & Hành động chuyển trạng thái chuẩn */}
      <div className="p-4 border-t border-[#E9ECEA] bg-[#FAFBFB] space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[#727B77]">Tổng tiền:</span>
          <span className="text-lg font-extrabold text-[#1D725E]">{formattedTotal}</span>
        </div>

        {/* =====================================================================
            HÀNH ĐỘNG HỢP LỆ THEO TỪNG TRẠNG THÁI (P3-G02 / P3-C02)
           ===================================================================== */}

        {/* 1. Trạng thái ACCEPTED: Tuyệt đối không có nút per-card Start */}
        {order.status === 'accepted' && (
          <div className="p-3 rounded-xl bg-[#F1F3F2] text-[#55605C] text-xs leading-relaxed text-center">
            Đơn đang ở hàng đợi chờ làm. Bấm <strong>&ldquo;Nhận đơn tiếp theo&rdquo;</strong> ở danh
            sách để tiếp nhận chế biến theo đúng thứ tự FIFO.
          </div>
        )}

        {/* 2. Trạng thái PREPARING: Nút "Đã làm xong" */}
        {order.status === 'preparing' && (
          <button
            type="button"
            disabled={isActionPending}
            onClick={() => onMarkReady?.(order)}
            className="w-full h-12 bg-[#35977D] hover:bg-[#1D725E] active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D] disabled:opacity-50"
            aria-label="Đánh dấu món đã làm xong và sẵn sàng phục vụ"
          >
            {isActionPending && pendingActionType === 'ready' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
                <span>Đang cập nhật...</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" aria-hidden="true" />
                <span>Đã làm xong (Chuyển sang Sẵn sàng)</span>
              </>
            )}
          </button>
        )}

        {/* 3. Trạng thái READY: Phục vụ */}
        {order.status === 'ready' && isDineIn && (
          <button
            type="button"
            disabled={isActionPending}
            onClick={() => onComplete?.(order)}
            className="w-full h-12 bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-50"
            aria-label="Xác nhận đã phục vụ món ra bàn"
          >
            {isActionPending && pendingActionType === 'complete' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
                <span>Đang cập nhật...</span>
              </>
            ) : (
              <>
                <PackageCheck className="w-4 h-4" aria-hidden="true" />
                <span>Đã phục vụ ra bàn (Hoàn thành)</span>
              </>
            )}
          </button>
        )}

        {/* Takeaway Ready: Khóa nút & giải thích rõ ràng theo Phase 3 guardrail */}
        {order.status === 'ready' && !isDineIn && (
          <div className="p-3 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] text-[#8A4D00] text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[#B54708]">
              <Lock className="w-3.5 h-3.5" />
              <span>Chờ xác minh mã nhận món</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Đơn mang đi yêu cầu mã nhận món của khách hàng để hoàn tất. Tính năng xác minh mã nhận
              món sẽ được bổ sung ở Phase 4.
            </p>
          </div>
        )}

        {/* 4. Trạng thái COMPLETED: Read-only */}
        {order.status === 'completed' && (
          <div className="p-3 rounded-xl bg-[#EAF5EA] text-[#1E561E] text-xs font-bold text-center flex items-center justify-center gap-1.5 border border-[#C2E4C2]">
            <CheckCircle2 className="w-4 h-4 text-[#1E561E]" />
            <span>Đơn hàng đã hoàn tất phục vụ</span>
          </div>
        )}

        {/* 5. Trạng thái CANCELLED: Read-only */}
        {order.status === 'cancelled' && (
          <div className="p-3 rounded-xl bg-[#FEF3F2] text-[#D92D20] text-xs font-bold text-center flex items-center justify-center gap-1.5 border border-[#FECDCA]">
            <XCircle className="w-4 h-4 text-[#D92D20]" />
            <span>Đơn hàng này đã bị hủy</span>
          </div>
        )}
      </div>
    </div>
  );
};
