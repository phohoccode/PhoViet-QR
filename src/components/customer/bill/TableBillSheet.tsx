'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  ShieldAlert,
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
  errorCode?: string | null;
  isBlockedByApi?: boolean;
  onRefresh?: () => void;
  onOrderMore?: () => void;
  tableLabel?: string;
  storeName?: string;
  className?: string;
}

/**
 * Format thời gian thanh toán từ ISO timestamp sang định dạng tiếng Việt.
 */
function formatSettledTime(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Chuyển đổi mã phương thức thanh toán sang nhãn tiếng Việt chuẩn.
 */
function formatPaymentMethod(method?: string | null): string {
  if (method === 'cash') return 'Tiền mặt';
  if (method === 'bank_transfer') return 'Chuyển khoản';
  return 'Thanh toán tại quầy';
}

/**
 * TableBillSheet — Hóa đơn theo bàn cho khách dùng tại bàn (Dine-in Session Bill).
 * Tiêu chuẩn Minimal Emerald POS (Phase 5 & Hotfix P5_HF01):
 * - Trước thanh toán: xem đầy đủ các lượt gọi món, tổng tiền tạm tính, khóa gọi thêm khi checkout_pending.
 * - Sau thanh toán (paid): chuyển sang màn hình Thanh toán thành công + Thẻ cảm ơn + Hóa đơn chi tiết.
 * - Hiển thị toast Sonner nổi đúng 1 lần khi chuyển sang trạng thái đã thanh toán.
 * - Xử lý an toàn khi mất quyền / hết hạn phiên: thông báo bảo mật riêng tư, không leak thông tin bàn khác.
 * - Không có nút bấm giả, không tự đánh dấu paid khi chưa có xác thực server.
 */
export const TableBillSheet: React.FC<TableBillSheetProps> = ({
  isOpen,
  onClose,
  bill,
  isLoading = false,
  isStale,
  errorMessage = null,
  errorCode = null,
  isBlockedByApi = false,
  onRefresh,
  onOrderMore,
  tableLabel,
  storeName,
  className = '',
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [collapsedTickets, setCollapsedTickets] = useState<Record<string, boolean>>({});
  const [showPaidToast, setShowPaidToast] = useState(false);
  const toastedRef = useRef<string | null>(null);

  const displayTable = bill?.table.label || tableLabel || 'Bàn phục vụ';
  const sessionStatus = bill?.session.status;
  const isCheckoutPending = sessionStatus === 'checkout_pending';
  const isClosed = sessionStatus === 'closed';

  // Nhận diện trạng thái ĐÃ THANH TOÁN chính thức từ máy chủ
  const isPaid = Boolean(
    bill &&
      (bill.session.paymentStatus === 'paid' ||
        (isClosed && Boolean(bill.settledAt)))
  );

  // Quyền truy cập bị từ chối / hết hạn mà chưa có hóa đơn thanh toán
  const isAccessDenied = Boolean(
    !isPaid &&
      (errorCode === 'SESSION_REQUIRED' ||
        errorCode === 'SESSION_EXPIRED' ||
        errorCode === 'FORBIDDEN')
  );

  const canOrderMore = Boolean(bill?.canAcceptMoreOrders && !isCheckoutPending && !isClosed && !isPaid);

  const formattedTotal = bill
    ? new Intl.NumberFormat('vi-VN').format(bill.totalVnd) + ' đ'
    : '0 đ';

  // Kích hoạt Toast Sonner nổi đúng duy nhất 1 lần khi phiên bàn chuyển sang paid
  useEffect(() => {
    if (isPaid && bill) {
      const toastKey = `${bill.session.id}:${bill.settledAt || 'paid'}`;
      if (toastedRef.current !== toastKey) {
        toastedRef.current = toastKey;
        setShowPaidToast(true);
        const timer = setTimeout(() => {
          setShowPaidToast(false);
        }, 4500);
        return () => clearTimeout(timer);
      }
    }
  }, [isPaid, bill]);

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

  return (
    <>
      {/* =====================================================================
          0. Floating Sonner-Style Toast (Một lần khi thanh toán thành công)
         ===================================================================== */}
      {showPaidToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] w-[90%] max-w-sm px-4 py-3 rounded-2xl bg-[#ECFDF3] border border-[#ABEFC6] text-[#027A48] shadow-lg flex items-center justify-between gap-3 animate-dialog-card-in"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#027A48] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#027A48] truncate">
                Thanh toán hoàn tất
              </p>
              <p className="text-[11px] text-[#05603A]">Cảm ơn quý khách!</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPaidToast(false)}
            className="p-1 rounded-lg hover:bg-black/5 text-[#027A48] transition-colors"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          Sheet Backdrop & Container
         ===================================================================== */}
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
              1. Header Hóa Đơn Bàn / Thanh Toán Thành Công
             ===================================================================== */}
          <div className="p-4 bg-white border-b border-[#E9ECEA] flex items-center justify-between flex-shrink-0 z-10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xs ${
                  isPaid
                    ? 'bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6]'
                    : 'bg-[#E8F4F0] text-[#1D725E]'
                }`}
              >
                {isPaid ? (
                  <CheckCircle2 className="w-5 h-5 text-[#027A48]" aria-hidden="true" />
                ) : (
                  <Receipt className="w-5 h-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2
                    id="table-bill-title"
                    className="text-base font-bold text-[#1D2522] leading-tight"
                  >
                    {isPaid ? 'THANH TOÁN THÀNH CÔNG' : `Hóa đơn ${displayTable}`}
                  </h2>
                  {/* Badge trạng thái phiên */}
                  {isPaid ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Đã thanh toán</span>
                    </span>
                  ) : isCheckoutPending ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF6EE] text-[#B54708] border border-[#F9DBAF] flex items-center gap-1 animate-pulse">
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
                <p className="text-[11px] text-[#727B77] mt-0.5 truncate">
                  {isPaid
                    ? `${displayTable}${storeName ? ` · ${storeName}` : ''}`
                    : isLoading && !bill
                    ? 'Đang tải thông tin hóa đơn...'
                    : bill?.orders.length
                    ? `${bill.orders.length} lượt gọi món trong phiên này`
                    : 'Chi tiết các lần gọi món tại bàn'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F7F8F7] text-[#727B77] flex items-center justify-center transition-colors disabled:opacity-50"
                  aria-label="Tải lại hóa đơn"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#1D725E]' : ''}`}
                  />
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
            {/* -----------------------------------------------------------------
                A. Giao Diện ĐÃ THANH TOÁN (Paid Receipt & Thank-you Section)
               ----------------------------------------------------------------- */}
            {isPaid && bill ? (
              <div className="space-y-4 animate-dialog-card-in">
                {/* 1. Hero Thẻ Cảm Ơn */}
                <div className="p-5 rounded-3xl bg-gradient-to-b from-[#ECFDF3] via-[#F4FBF7] to-white border border-[#C6E7DC] text-center shadow-xs space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#ECFDF3] border border-[#ABEFC6] text-[#027A48] flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="w-6 h-6 text-[#027A48]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#1D2522]">
                      Cảm ơn quý khách đã sử dụng dịch vụ!
                    </h3>
                    <p className="text-xs text-[#55605C] mt-1 leading-relaxed">
                      Hẹn gặp lại quý khách trong lần ghé quán tiếp theo.
                    </p>
                  </div>
                </div>

                {/* 2. Cảnh báo mất kết nối mạng khi đang xem hóa đơn đã thanh toán */}
                {isStale && (
                  <div className="p-3 rounded-2xl bg-[#FEF6EE] border border-[#F9DBAF] text-xs text-[#8A4D00] flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-[#B54708] flex-shrink-0" />
                      <span className="font-semibold truncate">
                        Mất kết nối — Đang hiển thị hóa đơn đã thanh toán từ bộ nhớ đệm
                      </span>
                    </div>
                    {onRefresh && (
                      <button
                        type="button"
                        onClick={onRefresh}
                        className="px-2 py-0.5 rounded-lg bg-[#B54708] text-white text-[10px] font-bold shrink-0"
                      >
                        Thử lại
                      </button>
                    )}
                  </div>
                )}

                {/* 3. Chi Tiết Hóa Đơn Đã Thanh Toán (Receipt Card) */}
                <div className="bg-white rounded-3xl border border-[#E9ECEA] p-4 sm:p-5 shadow-xs space-y-4">
                  {/* Tiêu đề & Metadata hóa đơn */}
                  <div className="border-b border-[#E9ECEA] pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
                        HÓA ĐƠN {displayTable.toUpperCase()}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6]">
                        Đã thanh toán
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 text-[#55605C]">
                      <div>
                        <span className="text-[11px] text-[#727B77] block">Thời gian:</span>
                        <span className="font-semibold text-[#1D2522]">
                          {formatSettledTime(bill.settledAt) || 'Vừa xong'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-[#727B77] block">Phương thức:</span>
                        <span className="font-semibold text-[#1D2522]">
                          {formatPaymentMethod(bill.paymentMethod)}
                        </span>
                      </div>
                      {(bill as { receiptId?: string }).receiptId && (
                        <div className="col-span-2 pt-1 border-t border-[#E9ECEA]/60 flex items-center justify-between text-[11px] text-[#727B77]">
                          <span>Mã biên nhận:</span>
                          <span className="font-mono font-medium text-[#1D2522]">
                            #{(bill as { receiptId: string }).receiptId.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Danh sách các lượt gọi món & món đã dùng */}
                  <div className="space-y-3">
                    <span className="text-[11px] font-bold text-[#727B77] uppercase tracking-wider block">
                      Chi tiết món đã phục vụ ({bill.orders.length} lượt gọi)
                    </span>

                    {bill.orders.map((order: TableBillOrder) => {
                      const ticketText =
                        order.ticketNo !== null && order.ticketNo !== undefined
                          ? `#${String(order.ticketNo).padStart(3, '0')}`
                          : `#${order.id.slice(0, 6).toUpperCase()}`;

                      return (
                        <div
                          key={order.id}
                          className="rounded-2xl border border-[#E9ECEA] bg-[#FAFBFB] overflow-hidden"
                        >
                          <div className="px-3.5 py-2.5 bg-[#F5F6F5] border-b border-[#E9ECEA] flex items-center justify-between text-xs">
                            <span className="font-bold text-[#1D2522]">
                              Lượt gọi {ticketText}
                            </span>
                            <span className="font-semibold text-[#1D725E]">
                              {new Intl.NumberFormat('vi-VN').format(order.totalVnd)} đ
                            </span>
                          </div>

                          <div className="p-3 divide-y divide-[#E9ECEA]/60">
                            {order.lines.map((line) => (
                              <div
                                key={line.id}
                                className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-4 h-4 rounded bg-[#E8F4F0] text-[10px] font-bold text-[#1D725E] flex items-center justify-center flex-shrink-0">
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
                        </div>
                      );
                    })}
                  </div>

                  {/* Phân cách nét đứt & Tổng tiền đã thanh toán */}
                  <div className="border-t border-dashed border-[#CBD5E1] pt-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider block">
                          Tổng đã thanh toán
                        </span>
                        <span className="text-[11px] text-[#027A48] font-medium block">
                          Giao dịch đã hoàn tất
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xl sm:text-2xl font-extrabold text-[#1D725E] block leading-tight">
                          {formattedTotal}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : isAccessDenied && !bill ? (
              /* -----------------------------------------------------------------
                  B. Quyền Hóa Đơn Hết Hiệu Lực / Session Closed Không Có Receipt
                 ----------------------------------------------------------------- */
              <div className="p-6 bg-white rounded-3xl border border-[#E9ECEA] text-center space-y-4 shadow-xs animate-dialog-card-in">
                <div className="w-14 h-14 rounded-2xl bg-[#FEF6EE] text-[#B54708] mx-auto flex items-center justify-center border border-[#F9DBAF]">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1D2522]">
                    Không thể mở lại hóa đơn trên thiết bị này
                  </h3>
                  <p className="text-xs text-[#55605C] mt-1.5 leading-relaxed max-w-xs mx-auto">
                    Phiên bàn đã kết thúc hoặc quyền xem hóa đơn trên thiết bị này không còn hiệu lực.
                    Vui lòng liên hệ quán nếu quý khách cần hỗ trợ!
                  </p>
                </div>
                {onRefresh && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="px-4 py-2 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] border border-[#E9ECEA] text-xs font-bold text-[#1D2522] transition-colors"
                  >
                    Thử tải lại
                  </button>
                )}
              </div>
            ) : (
              /* -----------------------------------------------------------------
                  C. Giao Diện Phiên Bàn Bình Thường / Đang Chốt Thanh Toán
                 ----------------------------------------------------------------- */
              <>
                {/* Cảnh báo khi phiên đang chốt thanh toán (checkout_pending) */}
                {isCheckoutPending && (
                  <div className="p-4 rounded-2xl bg-[#FEF6EE] border border-[#F9DBAF] space-y-1.5 animate-dialog-card-in">
                    <div className="flex items-center gap-2">
                      <Clock
                        className="w-4 h-4 text-[#B54708] flex-shrink-0 animate-spin"
                        aria-hidden="true"
                      />
                      <h3 className="text-xs font-bold text-[#B54708]">
                        Quán đang chốt hóa đơn. Bạn tạm thời không thể gọi thêm món.
                      </h3>
                    </div>
                    <p className="text-[11px] text-[#55605C] leading-relaxed pl-6">
                      Đang chờ xác nhận thanh toán từ quầy… Danh sách các món đã gọi được giữ nguyên bên dưới.
                    </p>
                  </div>
                )}

                {/* Thông báo dữ liệu cũ chưa cập nhật khi mất kết nối mạng (chỉ cho open/checkout_pending) */}
                {isStale && bill && (
                  <div className="p-3.5 rounded-2xl bg-[#FEF6EE] border border-[#F9DBAF] text-xs text-[#8A4D00] flex items-center justify-between gap-2 shadow-2xs animate-dialog-card-in">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-[#B54708] flex-shrink-0" />
                      <span className="font-semibold truncate">
                        Mất kết nối — Đang hiển thị hóa đơn đã lưu (Chưa cập nhật)
                      </span>
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
                  <div
                    className="space-y-4 animate-pulse"
                    role="status"
                    aria-label="Đang tải hóa đơn..."
                  >
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
                                <div
                                  key={line.id}
                                  className="py-2 first:pt-2 last:pb-0 flex items-start justify-between gap-3 text-xs"
                                >
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

                {/* Thẻ Tổng Hóa Đơn Tạm Tính */}
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
                      <Info
                        className="w-4 h-4 text-[#35977D] flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <p className="text-[11px] text-[#727B77] leading-relaxed">
                        Khi dùng xong bữa, quý khách vui lòng báo nhân viên hoặc đến quầy để thanh toán toàn bộ hóa đơn của bàn.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* =====================================================================
              3. Footer Hành Động
             ===================================================================== */}
          <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2 flex-shrink-0 z-10 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {isPaid ? (
              <button
                type="button"
                onClick={handleAnimatedClose}
                className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Hoàn tất</span>
              </button>
            ) : canOrderMore ? (
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
              <div className="w-full h-12 rounded-xl text-xs sm:text-sm font-semibold bg-[#FEF6EE] border border-[#F9DBAF] text-[#B54708] flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 animate-spin" />
                <span>Đang chờ xác nhận thanh toán…</span>
              </div>
            ) : isClosed ? (
              <div className="w-full h-12 rounded-xl text-xs sm:text-sm font-semibold bg-[#ECFDF3] border border-[#ABEFC6] text-[#027A48] flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Phiên bàn đã kết thúc</span>
              </div>
            ) : null}

            {!isPaid && (
              <button
                type="button"
                onClick={handleAnimatedClose}
                className="w-full h-10 rounded-xl text-xs font-semibold text-[#55605C] hover:bg-[#F7F8F7] transition-colors"
              >
                Đóng
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
