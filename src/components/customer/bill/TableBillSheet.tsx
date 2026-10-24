'use client';

import React, { useState } from 'react';
import {
  X,
  Receipt,
  UtensilsCrossed,
  Clock,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { TableBillView, TableBillOrder } from './types';
import { ORDER_STATUS_LABELS } from '../../../../docs/contracts/types';

export interface TableBillSheetProps {
  isOpen: boolean;
  onClose: () => void;
  bill: TableBillView | null;
  isLoading?: boolean;
  isStale?: boolean;
  errorMessage?: string | null;
  isBlockedByApi?: boolean;
  onRefresh?: () => void;
  onOrderMore?: () => void;
  tableLabel?: string;
  className?: string;
}

/**
 * TableBillSheet — Hóa đơn theo bàn cho khách dùng tại bàn (Dine-in Session Bill).
 * Tiêu chuẩn Minimal Emerald POS (Phase 5):
 * - Xem toàn bộ các lượt gọi món (tickets) và từng món đã gọi trong cùng phiên bàn.
 * - Hiển thị Tổng tạm tính chính thức từ server, không tự cộng dồn ở client.
 * - Nhãn trạng thái chuẩn xác: Đang phục vụ / Đang thanh toán / Đã thanh toán.
 * - Khóa gọi thêm khi bàn ở trạng thái checkout_pending hoặc closed.
 * - Không có nút bấm giả để khách tự đánh dấu đã thanh toán.
 */
export const TableBillSheet: React.FC<TableBillSheetProps> = ({
  isOpen,
  onClose,
  bill,
  isLoading = false,
  isStale,
  errorMessage = null,
  isBlockedByApi = false,
  onRefresh,
  onOrderMore,
  tableLabel,
  className = '',
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [collapsedTickets, setCollapsedTickets] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 180);
  };

  const toggleTicketCollapse = (orderId: string) => {
    setCollapsedTickets((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const displayTable = bill?.table.label || tableLabel || 'Bàn phục vụ';
  const sessionStatus = bill?.session.status;
  const isCheckoutPending = sessionStatus === 'checkout_pending';
  const isClosed = sessionStatus === 'closed';
  const canOrderMore = Boolean(bill?.canAcceptMoreOrders && !isCheckoutPending && !isClosed);

  const formattedTotal = bill
    ? new Intl.NumberFormat('vi-VN').format(bill.totalVnd) + ' đ'
    : '0 đ';

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex sm:justify-end items-end sm:items-stretch ${
        isClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
      } ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-bill-title"
      onClick={handleAnimatedClose}
    >
      <div
        className={`w-full sm:max-w-md h-[92vh] sm:h-full bg-[#F5F6F5] rounded-t-3xl sm:rounded-none sm:rounded-l-3xl shadow-2xl border-t sm:border-t-0 sm:border-l border-[#E9ECEA] flex flex-col overflow-hidden pointer-events-auto ${
          isClosing
            ? 'animate-sheet-slide-down sm:animate-drawer-out'
            : 'animate-sheet-slide-up sm:animate-drawer-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* =====================================================================
            1. Header Hóa Đơn Bàn
           ===================================================================== */}
        <div className="p-4 bg-white border-b border-[#E9ECEA] flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center flex-shrink-0 shadow-xs">
              <Receipt className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="table-bill-title" className="text-base font-bold text-[#1D2522] leading-tight">
                  Hóa đơn {displayTable}
                </h2>
                {/* Badge trạng thái phiên */}
                {isClosed ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Đã thanh toán</span>
                  </span>
                ) : isCheckoutPending ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] flex items-center gap-1 animate-pulse">
                    <Clock className="w-3 h-3" />
                    <span>Đang thanh toán</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC] flex items-center gap-1">
                    <UtensilsCrossed className="w-3 h-3" />
                    <span>Đang phục vụ</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#727B77] mt-0.5">
                {isLoading && !bill
                  ? 'Đang tải thông tin hóa đơn...'
                  : bill?.orders.length
                  ? `${bill.orders.length} lượt gọi món trong phiên này`
                  : 'Chi tiết các lần gọi món tại bàn'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F7F8F7] text-[#727B77] flex items-center justify-center transition-colors disabled:opacity-50"
                aria-label="Tải lại hóa đơn"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#1D725E]' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F7F8F7] text-[#727B77] flex items-center justify-center transition-colors"
              aria-label="Đóng hóa đơn"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            2. Vùng Cuộn Nội Dung Hóa Đơn
           ===================================================================== */}
        <div
          className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 overscroll-contain"
          aria-busy={isLoading}
        >
          {/* Cảnh báo khi phiên đang chốt thanh toán (checkout_pending) */}
          {isCheckoutPending && (
            <div className="p-4 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] space-y-2 animate-dialog-card-in">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#D92D20] flex-shrink-0" aria-hidden="true" />
                <h3 className="text-xs font-bold text-[#D92D20]">
                  Bàn đang được thanh toán. Bạn không thể gọi thêm món lúc này.
                </h3>
              </div>
              <p className="text-[11px] text-[#55605C] leading-relaxed pl-6">
                Chủ quán đang kiểm tra và chốt hóa đơn cho bàn của bạn. Nếu cần gọi thêm món hoặc thay đổi, vui lòng báo nhân viên phục vụ tại quầy.
              </p>
            </div>
          )}

          {/* Cảnh báo khi phiên đã hoàn tất thanh toán (closed) */}
          {isClosed && (
            <div className="p-4 rounded-2xl bg-[#ECFDF3] border border-[#ABEFC6] space-y-1.5 animate-dialog-card-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#027A48] flex-shrink-0" aria-hidden="true" />
                <h3 className="text-xs font-bold text-[#027A48]">
                  Hóa đơn đã được thanh toán. Cảm ơn quý khách!
                </h3>
              </div>
              <p className="text-[11px] text-[#55605C] leading-relaxed pl-6">
                Bữa ăn tại bàn đã kết thúc. Nếu quý khách muốn tiếp tục dùng bữa mới, vui lòng thông báo nhân viên quán để mở bàn.
              </p>
            </div>
          )}

          {/* Thông báo dữ liệu cũ chưa cập nhật khi mất kết nối mạng */}
          {isStale && bill && (
            <div className="p-3.5 rounded-2xl bg-[#FEF6EE] border border-[#F9DBAF] text-xs text-[#8A4D00] flex items-center justify-between gap-2 shadow-2xs animate-dialog-card-in">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-[#B54708] flex-shrink-0" />
                <span className="font-semibold truncate">Chưa cập nhật — Đang hiển thị hóa đơn đã lưu</span>
              </div>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="px-2.5 py-1 rounded-lg bg-[#B54708] hover:bg-[#93370D] text-white text-[11px] font-bold shrink-0 shadow-2xs transition-colors"
                >
                  Thử lại
                </button>
              )}
            </div>
          )}

          {/* Lỗi tải hóa đơn hoặc mạng */}
          {errorMessage && !isStale && (
            <div
              className={`p-4 rounded-2xl border flex items-start gap-2.5 text-xs ${
                isBlockedByApi
                  ? 'bg-[#FEF6EE] border-[#F9DBAF] text-[#8A4D00]'
                  : 'bg-[#FEF3F2] border-[#FECDCA] text-[#D92D20]'
              }`}
            >
              <AlertCircle
                className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                  isBlockedByApi ? 'text-[#B54708]' : 'text-[#D92D20]'
                }`}
              />
              <div className="flex-1">
                <p className="font-bold">
                  {isBlockedByApi ? 'Đang kết nối API máy chủ' : 'Không thể tải thông tin hóa đơn'}
                </p>
                <p className="text-[11px] text-[#55605C] mt-0.5">{errorMessage}</p>
                {onRefresh && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="mt-2 text-xs font-bold underline hover:opacity-80"
                  >
                    Thử tải lại
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Skeleton loading phong phú, không flash 0đ */}
          {isLoading && !bill && (
            <div className="space-y-4 animate-pulse" role="status" aria-label="Đang tải hóa đơn...">
              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] space-y-2">
                <div className="h-4 w-32 bg-[#E9ECEA] rounded" />
                <div className="h-3 w-48 bg-[#F7F8F7] rounded" />
              </div>
              <div className="space-y-3">
                <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-3.5 w-28 bg-[#E9ECEA] rounded" />
                    <div className="h-3.5 w-20 bg-[#F7F8F7] rounded" />
                  </div>
                  <div className="h-3 w-44 bg-[#F7F8F7] rounded" />
                </div>
                <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-3.5 w-28 bg-[#E9ECEA] rounded" />
                    <div className="h-3.5 w-20 bg-[#F7F8F7] rounded" />
                  </div>
                  <div className="h-3 w-44 bg-[#F7F8F7] rounded" />
                </div>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] flex justify-between items-center">
                <div className="space-y-1.5">
                  <div className="h-3.5 w-28 bg-[#E9ECEA] rounded" />
                  <div className="h-2.5 w-40 bg-[#F7F8F7] rounded" />
                </div>
                <div className="h-7 w-28 bg-[#E8F4F0] rounded-xl" />
              </div>
            </div>
          )}

          {/* Danh sách các lượt gọi món */}
          {bill && bill.orders.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
                  Các lượt gọi món ({bill.orders.length})
                </span>
                {bill.outstandingOrders > 0 && (
                  <span className="text-[11px] font-semibold text-[#B54708] bg-[#FEF6EE] px-2 py-0.5 rounded-full border border-[#F9DBAF]">
                    Còn {bill.outstandingOrders} đơn đang làm
                  </span>
                )}
              </div>

              {bill.orders.map((order: TableBillOrder, idx: number) => {
                const isCollapsed = Boolean(collapsedTickets[order.id]);
                const ticketText =
                  order.ticketNo !== null && order.ticketNo !== undefined
                    ? `#${String(order.ticketNo).padStart(3, '0')}`
                    : `#${order.id.slice(0, 6).toUpperCase()}`;

                const orderTime = order.acceptedAt || order.createdAt;
                const formattedTime = orderTime
                  ? new Date(orderTime).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';

                const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status;
                const isCancelled = order.status === 'cancelled';
                const isReady = order.status === 'ready';
                const isCompleted = order.status === 'completed';

                return (
                  <div
                    key={order.id}
                    className={`bg-white rounded-2xl border overflow-hidden shadow-2xs transition-colors ${
                      isCancelled
                        ? 'border-[#FECDCA] opacity-75'
                        : isReady
                        ? 'border-[#B2DDFF]'
                        : 'border-[#E9ECEA]'
                    }`}
                  >
                    {/* Header lượt gọi */}
                    <button
                      type="button"
                      onClick={() => toggleTicketCollapse(order.id)}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-[#FAFBFB] transition-colors"
                      aria-expanded={!isCollapsed}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#F7F8F7] border border-[#E9ECEA] text-xs font-bold text-[#1D725E] flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#1D2522]">
                              Lượt gọi {ticketText}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                isCancelled
                                  ? 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]'
                                  : isCompleted
                                  ? 'bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]'
                                  : isReady
                                  ? 'bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]'
                                  : 'bg-[#E8F4F0] text-[#1D725E] border-[#C6E7DC]'
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          {formattedTime && (
                            <span className="text-[11px] text-[#727B77] block mt-0.5">
                              {formattedTime} · {order.itemCount} món
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#1D2522]">
                          {new Intl.NumberFormat('vi-VN').format(order.totalVnd)} đ
                        </span>
                        {isCollapsed ? (
                          <ChevronDown className="w-4 h-4 text-[#727B77]" />
                        ) : (
                          <ChevronUp className="w-4 h-4 text-[#727B77]" />
                        )}
                      </div>
                    </button>

                    {/* Danh sách món trong lượt gọi */}
                    {!isCollapsed && (
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-[#E9ECEA]/60 divide-y divide-[#E9ECEA]/60">
                        {order.lines.map((line) => (
                          <div key={line.id} className="py-2 first:pt-2 last:pb-0 flex items-start justify-between gap-3 text-xs">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded bg-[#F7F8F7] border border-[#E9ECEA] text-[10px] font-bold text-[#1D725E] flex items-center justify-center flex-shrink-0">
                                  {line.quantity}×
                                </span>
                                <span className="font-semibold text-[#1D2522] truncate">
                                  {line.name}
                                </span>
                              </div>

                              {line.options && line.options.length > 0 && (
                                <p className="text-[11px] text-[#727B77] mt-0.5 pl-5.5">
                                  {line.options.map((o) => o.name).join(', ')}
                                </p>
                              )}

                              {line.note && (
                                <p className="text-[11px] text-[#55605C] italic mt-0.5 pl-5.5">
                                  Ghi chú: {line.note}
                                </p>
                              )}
                            </div>

                            <span className="font-semibold text-[#1D2522] flex-shrink-0">
                              {new Intl.NumberFormat('vi-VN').format(line.lineTotalVnd)} đ
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : !isLoading && !errorMessage ? (
            /* Khi bàn chưa có đơn hàng nào */
            <div className="p-8 bg-white rounded-2xl border border-[#E9ECEA] text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-[#F7F8F7] text-[#727B77] mx-auto flex items-center justify-center">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#1D2522]">Bàn chưa có đơn hàng</h4>
                <p className="text-xs text-[#727B77] mt-1 max-w-xs mx-auto leading-relaxed">
                  Quý khách có thể xem thực đơn và chọn món bất cứ lúc nào trong bữa ăn.
                </p>
              </div>
            </div>
          ) : null}

          {/* ===================================================================
              3. Thẻ Tổng Hóa Đơn & Lưu Ý Thanh Toán
             =================================================================== */}
          {bill && (
            <div className="bg-white rounded-2xl border border-[#E9ECEA] p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider block">
                    Tổng hóa đơn bàn
                  </span>
                  <span className="text-[11px] text-[#727B77] mt-0.5 block">
                    Đã bao gồm tất cả các lượt gọi món hợp lệ
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg sm:text-xl font-extrabold text-[#1D725E] block leading-tight">
                    {formattedTotal}
                  </span>
                </div>
              </div>

              {/* Hướng dẫn thanh toán tại quầy */}
              <div className="p-3 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-start gap-2 text-xs text-[#55605C]">
                <Info className="w-4 h-4 text-[#35977D] flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-[11px] text-[#727B77] leading-relaxed">
                  Khi dùng xong bữa, quý khách vui lòng báo nhân viên hoặc đến quầy để thanh toán toàn bộ hóa đơn của bàn.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* =====================================================================
            4. Footer Hành Động
           ===================================================================== */}
        <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2 flex-shrink-0 z-10 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {canOrderMore ? (
            <button
              type="button"
              onClick={() => {
                handleAnimatedClose();
                onOrderMore?.();
              }}
              className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Gọi thêm món</span>
            </button>
          ) : isCheckoutPending ? (
            <div className="w-full h-12 rounded-xl text-xs sm:text-sm font-semibold bg-[#FEF3F2] border border-[#FECDCA] text-[#D92D20] flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 animate-spin" />
              <span>Bàn đang thanh toán — Đã khóa gọi thêm</span>
            </div>
          ) : isClosed ? (
            <div className="w-full h-12 rounded-xl text-xs sm:text-sm font-semibold bg-[#ECFDF3] border border-[#ABEFC6] text-[#027A48] flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Phiên bàn đã kết thúc</span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleAnimatedClose}
            className="w-full h-10 rounded-xl text-xs font-semibold text-[#55605C] hover:bg-[#F7F8F7] transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
