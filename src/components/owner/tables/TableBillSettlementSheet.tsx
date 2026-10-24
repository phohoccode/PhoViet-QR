'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Receipt,
  KeyRound,
  UtensilsCrossed,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Banknote,
  Building2,
  ExternalLink,
  Eye,
  EyeOff,
  RotateCcw,
  Copy,
  Check,
  QrCode,
  ArrowRight,
} from 'lucide-react';
import type { OwnerTableBillSettlementProps } from './billing-types';
import type { TableBillView, TablePaymentMethod, TableBillOrder } from '../../customer/bill/types';
import { ORDER_STATUS_LABELS } from '../../../../docs/contracts/types';
import { formatTablePin, extractContiguousPin } from '../TableSessionDialog';
import {
  revealOwnerTablePin,
  rotateOwnerTablePin,
  MenuApiError,
} from '@/features/owner/api-client';

/**
 * TableBillSettlementSheet — Hộp thoại Hóa đơn & Chốt tiền Bàn cho Chủ quán (Phase 5).
 * Tích hợp trực tiếp trong Tab Bàn (không thêm tab thứ 5, không tạo trang thu ngân riêng):
 * 1. Hóa đơn chi tiết: xem các lượt gọi món (tickets), món, qty, snapshot price, options, line total.
 * 2. Tổng hóa đơn: hiển thị số tiền VND lớn từ API bill thật (totalVnd), không tự tính từ menu.
 * 3. Chặn chốt tiền khi còn đơn chưa hoàn tất (outstandingOrders > 0 hoặc canSettle=false).
 * 4. Luồng chốt tiền an toàn:
 *    - Chốt hóa đơn -> chuyển sang checkout_pending (khách bị khóa gọi thêm).
 *    - Hủy chốt -> quay lại open (khách được gọi thêm).
 *    - Chọn phương thức: Tiền mặt hoặc Chuyển khoản (chủ quán tự xác nhận).
 *    - Dialog xác nhận thu tiền với ghi chú: "Chỉ xác nhận khi đã nhận đủ tiền".
 *    - Đóng phiên: hiển thị Đã thanh toán, khóa mọi thao tác thu tiền lần 2.
 * 5. Giữ nguyên 100% tính năng quản lý PIN 6 số và mã QR từ Phase 2.
 */
export const TableBillSettlementSheet: React.FC<OwnerTableBillSettlementProps> = ({
  table,
  bill: billProp,
  qrCode,
  isOpen,
  onClose,
  isLoadingBill = false,
  billErrorMessage = null,
  onRefreshBill,
  onBeginCheckout,
  onCancelCheckout,
  onConfirmSettlement,
  onNavigateToOrders,
  onRevealPin,
  onRotatePin,
  onSessionUpdated,
  onTableSessionClosed,
}) => {
  const [activeTab, setActiveTab] = useState<'billing' | 'pin'>('billing');
  const [isClosing, setIsClosing] = useState(false);
  const [collapsedTickets, setCollapsedTickets] = useState<Record<string, boolean>>({});

  // Payment method selection & checkout state
  const [selectedMethod, setSelectedMethod] = useState<TablePaymentMethod>('cash');
  const [showConfirmSettlement, setShowConfirmSettlement] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isSubmittingSettle, setIsSubmittingSettle] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const beginRequestIdRef = useRef<string | null>(null);
  const cancelRequestIdRef = useRef<string | null>(null);
  const settlePendingCommandRef = useRef<{
    requestId: string;
    paymentMethod: TablePaymentMethod;
    version: number;
    billVersion: string;
  } | null>(null);

  // Phase 2 PIN states & session reference
  const session = table.session;
  const isOccupied = session !== null;

  // Local bill state sau khi thực hiện action (begin/cancel/settle)
  const [actionBill, setActionBill] = useState<TableBillView | null>(null);

  // Ưu tiên snapshot mới nhất: Nếu billProp từ GET có version cao hơn hoặc có cập nhật hoàn tất món
  const localBill = useMemo(() => {
    // Nếu actionBill thuộc phiên bàn khác thì bỏ qua
    const validActionBill = actionBill && session?.id && actionBill.session.id === session.id ? actionBill : null;
    if (!validActionBill) return billProp ?? null;
    if (!billProp) return validActionBill;
    // 1. Phiên bản phiên bàn từ GET cao hơn -> billProp mới hơn
    if (billProp.session.version > validActionBill.session.version) return billProp;
    if (validActionBill.session.version > billProp.session.version) return validActionBill;
    // 2. Cùng session.version nhưng billProp có số món chưa phục vụ ít hơn hoặc billVersion đã đổi
    // (ví dụ: bếp vừa giao xong món trong tab Đơn hàng và chủ quán bấm Làm mới hóa đơn)
    if (
      billProp.billVersion !== validActionBill.billVersion ||
      billProp.outstandingOrders < validActionBill.outstandingOrders ||
      (billProp.canSettle && !validActionBill.canSettle)
    ) {
      return billProp;
    }
    return validActionBill;
  }, [actionBill, billProp, session?.id]);

  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copiedPin, setCopiedPin] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<number>(session?.version ?? 1);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const rotateRequestIdRef = useRef<string | null>(null);

  // Keep command keys across a close/reopen so an ambiguous response can be
  // retried safely; a different session gets a fresh command namespace.
  useEffect(() => {
    beginRequestIdRef.current = null;
    cancelRequestIdRef.current = null;
    settlePendingCommandRef.current = null;
  }, [session?.id]);

  // Dọn sạch PIN khỏi RAM khi đóng hoặc unmount
  useEffect(() => {
    return () => {
      setRevealedPin(null);
    };
  }, []);

  if (!isOpen) return null;

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setRevealedPin(null);
    setActionBill(null);
    setIsAcknowledged(false);
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

  // Xác định trạng thái phiên hiện tại (ưu tiên localBill, fallback session)
  const currentStatus = localBill?.session.status || session?.status || 'open';
  const isCheckoutPending = currentStatus === 'checkout_pending';
  const isClosed = currentStatus === 'closed';
  const hasOrders = (localBill?.orders && localBill.orders.length > 0) || (session?.orderCount && session.orderCount > 0);
  const outstandingCount = localBill?.outstandingOrders ?? 0;
  const canSettleBackend = localBill ? localBill.canSettle : outstandingCount === 0;

  const totalVnd = localBill?.totalVnd ?? session?.totalVnd ?? 0;
  const formattedTotal = new Intl.NumberFormat('vi-VN').format(totalVnd) + ' đ';

  // 1. Hành động Bắt đầu Chốt Hóa Đơn (begin_checkout)
  const handleBeginCheckout = async () => {
    if (!session || isSubmittingCheckout) return;
    setIsSubmittingCheckout(true);
    setActionError(null);
    if (!beginRequestIdRef.current) beginRequestIdRef.current = crypto.randomUUID();
    const requestId = beginRequestIdRef.current;
    try {
      const version = localBill?.session.version ?? session.version;
      const billVersion = String(localBill?.billVersion ?? '');
      if (!onBeginCheckout) {
        throw new Error('Chưa cấu hình hàm bắt đầu chốt hóa đơn.');
      }
      const res = await onBeginCheckout(session.id, version, billVersion, requestId);
      if (res) {
        setActionBill(res);
        beginRequestIdRef.current = null;
      } else {
        await onRefreshBill?.();
      }
      await onRefreshBill?.();
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.error.code === 'BILL_CHANGED' || err.status === 409) {
          beginRequestIdRef.current = null;
          setActionError('Hóa đơn đã thay đổi từ lượt gọi món mới. Vui lòng tải lại hóa đơn.');
          await onRefreshBill?.();
        } else {
          setActionError(err.error.message || 'Không thể bắt đầu chốt hóa đơn. Vui lòng thử lại.');
        }
      } else {
        setActionError(
          err instanceof Error ? err.message : 'Không thể bắt đầu chốt hóa đơn. Vui lòng thử lại.'
        );
      }
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  // 2. Hành động Hủy Chốt Hóa Đơn (cancel_checkout)
  const handleCancelCheckout = async () => {
    if (!session || isSubmittingCancel) return;
    setIsSubmittingCancel(true);
    setActionError(null);
    if (!cancelRequestIdRef.current) cancelRequestIdRef.current = crypto.randomUUID();
    const requestId = cancelRequestIdRef.current;
    try {
      const version = localBill?.session.version ?? session.version;
      if (!onCancelCheckout) {
        throw new Error('Chưa cấu hình hàm hủy chốt hóa đơn.');
      }
      const res = await onCancelCheckout(session.id, version, requestId);
      if (res) {
        setActionBill(res);
        cancelRequestIdRef.current = null;
      } else {
        await onRefreshBill?.();
      }
      await onRefreshBill?.();
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        cancelRequestIdRef.current = null;
        setActionError(err.error.message || 'Không thể hủy chốt hóa đơn. Vui lòng thử lại.');
      } else {
        setActionError(
          err instanceof Error ? err.message : 'Không thể hủy chốt hóa đơn. Vui lòng thử lại.'
        );
      }
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // 3. Hành động Xác Nhận Đã Thu Tiền (confirm_received)
  const handleConfirmSettlement = async () => {
    if (!session || isSubmittingSettle || !isAcknowledged) return;
    setIsSubmittingSettle(true);
    setActionError(null);

    const version = localBill?.session.version ?? session.version;
    const billVersion = String(localBill?.billVersion ?? '');

    // Kiểm tra xem có lệnh pending trùng khớp hoàn toàn payload hay không
    let requestId: string;
    if (
      settlePendingCommandRef.current &&
      settlePendingCommandRef.current.paymentMethod === selectedMethod &&
      settlePendingCommandRef.current.version === version &&
      settlePendingCommandRef.current.billVersion === billVersion
    ) {
      // Tái sử dụng cùng requestId khi thử lại cùng payload
      requestId = settlePendingCommandRef.current.requestId;
    } else {
      // Lần đầu hoặc payload thay đổi (đổi phương thức thanh toán / version thay đổi):
      // Bắt buộc cấp requestId mới để tránh DUPLICATE_REQUEST_CONFLICT trên server
      requestId = crypto.randomUUID();
      settlePendingCommandRef.current = {
        requestId,
        paymentMethod: selectedMethod,
        version,
        billVersion,
      };
    }

    try {
      if (!onConfirmSettlement) {
        throw new Error('Chưa cấu hình hàm xác nhận thanh toán.');
      }
      const res = await onConfirmSettlement(session.id, version, selectedMethod, billVersion, requestId);
      if (res) {
        setActionBill(res);
        settlePendingCommandRef.current = null;
        setShowConfirmSettlement(false);
        setIsAcknowledged(false);
        onTableSessionClosed?.(table.id);
        await onRefreshBill?.();
      } else {
        // Tuyệt đối không tự suy diễn paid nếu server không trả về kết quả; bắt buộc gọi refresh từ server
        await onRefreshBill?.();
      }
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        // 1. Phân loại SESSION_ORDERS_OUTSTANDING trước các lỗi 409 khác
        if (err.error.code === 'SESSION_ORDERS_OUTSTANDING') {
          settlePendingCommandRef.current = null;
          setActionError('Còn món đang làm chưa hoàn tất phục vụ. Vui lòng kiểm tra lại trước khi chốt tiền.');
          await onRefreshBill?.();
        } else if (err.error.code === 'BILL_CHANGED' || err.status === 409) {
          settlePendingCommandRef.current = null;
          setActionError('Hóa đơn đã thay đổi từ lượt gọi món mới hoặc phiên bàn đã được chốt. Vui lòng tải lại.');
          await onRefreshBill?.();
        } else if (err.status === 400 && err.error.code === 'INVALID_STATE_TRANSITION') {
          settlePendingCommandRef.current = null;
          setActionError('Trạng thái phiên bàn không hợp lệ để chốt thanh toán. Vui lòng tải lại.');
          await onRefreshBill?.();
        } else {
          setActionError(err.error.message || 'Không thể xác nhận thanh toán. Vui lòng thử lại.');
        }
      } else {
        // Lỗi timeout / mất mạng: Giữ nguyên settlePendingCommandRef để retry an toàn (UI-02),
        // đồng thời thử tải lại bill xem lệnh đã được ghi nhận trên server chưa
        try {
          await onRefreshBill?.();
        } catch {
          // im lặng nếu mất mạng
        }
        setActionError('Chưa xác định kết quả thu tiền do kết nối mạng. Vui lòng kiểm tra lại hóa đơn hoặc thử lại.');
      }
    } finally {
      setIsSubmittingSettle(false);
    }
  };

  // Phase 2 PIN handlers
  const handleRevealPin = async () => {
    if (isRevealing || !session) return;
    setIsRevealing(true);
    setRevealError(null);
    try {
      if (onRevealPin) {
        const res = await onRevealPin(table.id);
        setRevealedPin(res.pin);
      } else {
        const res = await revealOwnerTablePin(session.id);
        setRevealedPin(res.pin);
        if (res.sessionVersion) setCurrentVersion(res.sessionVersion);
      }
    } catch (err: unknown) {
      setRevealError(err instanceof Error ? err.message : 'Không thể tải mã PIN.');
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopyPin = async () => {
    if (!revealedPin) return;
    try {
      await navigator.clipboard.writeText(extractContiguousPin(revealedPin));
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleRotatePin = async () => {
    if (isRotating || !session) return;
    setIsRotating(true);
    setRotateError(null);
    if (!rotateRequestIdRef.current) rotateRequestIdRef.current = crypto.randomUUID();
    const requestId = rotateRequestIdRef.current;
    try {
      if (onRotatePin) {
        const res = await onRotatePin(table.id);
        setRevealedPin(res.pin);
      } else {
        const res = await rotateOwnerTablePin(session.id, {
          requestId,
          expectedVersion: currentVersion,
          confirm: true,
        });
        setRevealedPin(res.pin);
        setCurrentVersion(res.sessionVersion);
        onSessionUpdated?.(table.id, res);
      }
      setShowRotateConfirm(false);
      rotateRequestIdRef.current = null;
    } catch (err: unknown) {
      setRotateError(err instanceof Error ? err.message : 'Không thể tạo PIN mới.');
    } finally {
      setIsRotating(false);
    }
  };

  const openedAtDate = session?.openedAt ? new Date(session.openedAt) : null;
  const formattedOpenedAt =
    openedAtDate && !isNaN(openedAtDate.getTime())
      ? `${openedAtDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
      : '—';

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex sm:justify-end items-end sm:items-stretch ${
          isClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-table-bill-title"
        onClick={handleAnimatedClose}
      >
        <div
          className={`w-full sm:max-w-xl h-[94vh] sm:h-full bg-[#F5F6F5] rounded-t-3xl sm:rounded-none sm:rounded-l-3xl shadow-2xl border-t sm:border-t-0 sm:border-l border-[#E9ECEA] flex flex-col overflow-hidden pointer-events-auto ${
            isClosing
              ? 'animate-sheet-slide-down sm:animate-drawer-out'
              : 'animate-sheet-slide-up sm:animate-drawer-in'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ===================================================================
              1. Header Chi Tiết Bàn & Pill Navigation
             =================================================================== */}
          <div className="p-4 bg-white border-b border-[#E9ECEA] flex-shrink-0 z-20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center flex-shrink-0 shadow-xs">
                  <UtensilsCrossed className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 id="owner-table-bill-title" className="text-base font-bold text-[#1D2522]">
                      {table.label}
                    </h2>
                    {isClosed ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6]">
                        Đã thanh toán
                      </span>
                    ) : isCheckoutPending ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] animate-pulse">
                        Đang thanh toán
                      </span>
                    ) : isOccupied ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]">
                        Đang phục vụ
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F7F8F7] text-[#727B77] border border-[#E9ECEA]">
                        Bàn trống
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#727B77] mt-0.5">
                    Mở lúc {formattedOpenedAt} · ID: {table.id.slice(0, 8)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {onRefreshBill && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionBill(null);
                      void onRefreshBill();
                    }}
                    disabled={isLoadingBill}
                    className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F7F8F7] text-[#727B77] flex items-center justify-center transition-colors disabled:opacity-50"
                    aria-label="Tải lại hóa đơn"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingBill ? 'animate-spin text-[#1D725E]' : ''}`} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAnimatedClose}
                  className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F7F8F7] text-[#727B77] flex items-center justify-center transition-colors"
                  aria-label="Đóng chi tiết bàn"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Pill Navigation chuyển đổi giữa Hóa đơn và Mã PIN/QR */}
            <div className="flex bg-[#F7F8F7] p-1 rounded-xl border border-[#E9ECEA]">
              <button
                type="button"
                onClick={() => setActiveTab('billing')}
                className={`flex-1 h-9 sm:h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all min-h-[36px] ${
                  activeTab === 'billing'
                    ? 'bg-white text-[#1D725E] shadow-2xs'
                    : 'text-[#727B77] hover:text-[#1D2522]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Hóa đơn & Chốt tiền</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pin')}
                className={`flex-1 h-9 sm:h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all min-h-[36px] ${
                  activeTab === 'pin'
                    ? 'bg-white text-[#1D725E] shadow-2xs'
                    : 'text-[#727B77] hover:text-[#1D2522]'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Mã PIN & QR Bàn</span>
              </button>
            </div>
          </div>

          {/* ===================================================================
              2. Vùng Cuộn Nội Dung Chính (Scrollable Body)
             =================================================================== */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 overscroll-contain">
            {activeTab === 'billing' ? (
              <>
                {/* Lỗi tải hóa đơn bàn nếu có */}
                {billErrorMessage && (
                  <div className="p-3.5 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#D92D20] flex items-start gap-2.5 animate-dialog-card-in">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold">Lỗi tải hóa đơn bàn</p>
                      <p className="text-[11px] mt-0.5 leading-relaxed">{billErrorMessage}</p>
                    </div>
                  </div>
                )}

                {/* Thông báo lỗi thao tác nếu có */}
                {actionError && (
                  <div className="p-3.5 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#D92D20] flex items-start justify-between gap-2.5 animate-dialog-card-in">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Lưu ý thao tác</p>
                        <p className="text-[11px] mt-0.5 leading-relaxed">{actionError}</p>
                      </div>
                    </div>
                    {onRefreshBill && (
                      <button
                        type="button"
                        onClick={onRefreshBill}
                        className="px-2.5 py-1 bg-[#D92D20] hover:bg-[#B42318] text-white rounded-lg text-[11px] font-bold shrink-0 transition-colors shadow-2xs"
                      >
                        Tải lại
                      </button>
                    )}
                  </div>
                )}

                {/* Banner cảnh báo khi phiên đang ở trạng thái checkout_pending */}
                {isCheckoutPending && (
                  <div className="p-4 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] space-y-2 animate-dialog-card-in">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#D92D20] flex-shrink-0" />
                      <h4 className="text-xs font-bold text-[#D92D20]">
                        Bàn đang trong quá trình thanh toán
                      </h4>
                    </div>
                    <p className="text-[11px] text-[#55605C] leading-relaxed pl-6">
                      Thiết bị của khách đã bị khóa gọi thêm món. Hãy kiểm tra các món đã phục vụ đủ và xác nhận phương thức thu tiền bên dưới.
                    </p>
                  </div>
                )}

                {/* Banner khi phiên đã thanh toán hoàn tất */}
                {isClosed && (
                  <div className="p-4 rounded-2xl bg-[#ECFDF3] border border-[#ABEFC6] space-y-1.5 animate-dialog-card-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#027A48] flex-shrink-0" />
                      <h4 className="text-xs font-bold text-[#027A48]">
                        Phiên bàn đã thanh toán thành công
                      </h4>
                    </div>
                    <p className="text-[11px] text-[#55605C] leading-relaxed pl-6">
                      {localBill?.settledAt
                        ? `Xác nhận lúc ${new Date(localBill.settledAt).toLocaleTimeString('vi-VN')} qua hình thức ${
                            localBill.paymentMethod === 'bank_transfer' ? 'Chuyển khoản' : 'Tiền mặt'
                          }.`
                        : 'Bàn đã đóng phiên phục vụ.'}
                    </p>
                  </div>
                )}

                {/* Cảnh báo món chưa hoàn tất phục vụ (outstanding orders) */}
                {outstandingCount > 0 && !isClosed && (
                  <div className="p-4 rounded-2xl bg-[#FEF6EE] border border-[#F9DBAF] space-y-2 animate-dialog-card-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#B54708] flex-shrink-0" />
                        <h4 className="text-xs font-bold text-[#B54708]">
                          Còn {outstandingCount} đơn hàng chưa hoàn tất
                        </h4>
                      </div>
                      {onNavigateToOrders && (
                        <button
                          type="button"
                          onClick={() => {
                            handleAnimatedClose();
                            onNavigateToOrders();
                          }}
                          className="text-[11px] font-bold text-[#1D725E] hover:underline flex items-center gap-1"
                        >
                          <span>Xem tab Đơn</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8A4D00] leading-relaxed pl-6">
                      Theo quy định an toàn, chủ quán cần hoàn tất hoặc xử lý toàn bộ đơn của bàn tại tab Đơn hàng trước khi có thể xác nhận thu tiền.
                    </p>
                  </div>
                )}

                {/* Danh sách các lượt gọi món (Orders breakdown) */}
                {localBill && localBill.orders.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
                        Danh sách lần đặt ({localBill.orders.length} lượt)
                      </span>
                      <span className="text-xs font-semibold text-[#727B77]">
                        Mã phiên: {localBill.session.id.slice(0, 8)}
                      </span>
                    </div>

                    {localBill.orders.map((order: TableBillOrder, idx: number) => {
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
                          className={`bg-white rounded-2xl border overflow-hidden shadow-2xs ${
                            isCancelled
                              ? 'border-[#FECDCA] opacity-75'
                              : isReady
                              ? 'border-[#B2DDFF]'
                              : 'border-[#E9ECEA]'
                          }`}
                        >
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
                                    {formattedTime} · {order.itemCount} phần món
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
                ) : !isOccupied ? (
                  <div className="p-8 bg-white rounded-2xl border border-[#E9ECEA] text-center space-y-2">
                    <p className="text-sm font-bold text-[#1D2522]">Bàn hiện đang trống</p>
                    <p className="text-xs text-[#727B77]">Mở phiên bàn để nhận khách và cấp mã PIN.</p>
                  </div>
                ) : (
                  <div className="p-8 bg-white rounded-2xl border border-[#E9ECEA] text-center space-y-2">
                    <p className="text-sm font-bold text-[#1D2522]">Bàn chưa có đơn hàng</p>
                    <p className="text-xs text-[#727B77]">Khách chưa gửi đơn nào trong phiên này.</p>
                  </div>
                )}

                {/* ===================================================================
                    Thẻ Tổng Tiền Hóa Đơn & Phương Thức Thu Tiền
                   =================================================================== */}
                {isOccupied && (
                  <div className="bg-white rounded-2xl border border-[#E9ECEA] p-4 space-y-4 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider block">
                          Tổng hóa đơn phải thu
                        </span>
                        <span className="text-[11px] text-[#727B77] mt-0.5 block">
                          Dựa trên hóa đơn chuẩn từ máy chủ (billVersion)
                        </span>
                      </div>
                      <span className="text-xl sm:text-2xl font-extrabold text-[#1D725E] leading-tight">
                        {formattedTotal}
                      </span>
                    </div>

                    {/* Lựa chọn phương thức thanh toán khi đang checkout_pending */}
                    {isCheckoutPending && (
                      <div className="pt-3 border-t border-[#E9ECEA] space-y-2">
                        <span className="text-xs font-bold text-[#1D2522] block">
                          Phương thức thanh toán đã nhận:
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedMethod('cash')}
                            className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                              selectedMethod === 'cash'
                                ? 'bg-[#E8F4F0] border-[#1D725E] text-[#1D725E] shadow-2xs'
                                : 'bg-white border-[#E9ECEA] text-[#55605C] hover:bg-[#FAFBFB]'
                            }`}
                          >
                            <Banknote className="w-4 h-4" />
                            <span>Tiền mặt</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedMethod('bank_transfer')}
                            className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                              selectedMethod === 'bank_transfer'
                                ? 'bg-[#E8F4F0] border-[#1D725E] text-[#1D725E] shadow-2xs'
                                : 'bg-white border-[#E9ECEA] text-[#55605C] hover:bg-[#FAFBFB]'
                            }`}
                          >
                            <Building2 className="w-4 h-4" />
                            <span>Chuyển khoản</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-[#727B77] italic leading-tight">
                          * Lưu ý: Chủ quán tự kiểm tra thực tế đã nhận tiền trước khi xác nhận.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* ===============================================================
                  TAB 2: Quản Lý PIN & QR Bàn (Bảo Tồn 100% Phase 2)
                 =============================================================== */
              <div className="space-y-4">
                {isOccupied ? (
                  <>
                    <div className="p-4 bg-[#F7F8F7] rounded-2xl border border-[#E9ECEA] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#1D2522]">Mã xác nhận bàn (PIN)</span>
                        {revealedPin && (
                          <span className="text-[11px] font-semibold text-[#1D725E] bg-[#E8F4F0] px-2 py-0.5 rounded-md">
                            Đang hiển thị
                          </span>
                        )}
                      </div>

                      {revealError && (
                        <div className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018] flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          <span>{revealError}</span>
                        </div>
                      )}

                      {revealedPin === null ? (
                        <div className="text-center py-3 space-y-2">
                          <p className="text-xs text-[#727B77]">
                            Chỉ hiển thị khi chủ quán chủ động bấm xem lại.
                          </p>
                          <button
                            type="button"
                            onClick={handleRevealPin}
                            disabled={isRevealing || isCheckoutPending}
                            className="h-10 px-4 rounded-xl bg-white border border-[#E9ECEA] hover:border-[#35977D] text-xs font-bold text-[#1D725E] inline-flex items-center gap-2 shadow-2xs transition-all disabled:opacity-60"
                          >
                            {isRevealing ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Đang tải PIN...</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>Hiện PIN</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 text-center pt-1">
                          <div className="p-3 bg-white rounded-xl border-2 border-dashed border-[#35977D]">
                            <div className="text-3xl sm:text-4xl font-mono font-bold text-[#1D2522] tracking-widest tabular-nums select-all">
                              {formatTablePin(revealedPin)}
                            </div>
                            <p className="text-[11px] text-[#727B77] mt-1">
                              PIN dùng cho phiên bàn hiện tại. Không đăng công khai mã.
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleCopyPin}
                              className="h-9 px-3.5 rounded-xl bg-white border border-[#E9ECEA] hover:border-[#35977D] text-xs font-semibold text-[#1D2522] flex items-center gap-1.5 transition-colors shadow-2xs"
                            >
                              {copiedPin ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#1D725E]" />
                                  <span className="text-[#1D725E] font-bold">Đã chép!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-[#727B77]" />
                                  <span>Sao chép PIN</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setRevealedPin(null)}
                              className="h-9 px-3.5 rounded-xl bg-white border border-[#E9ECEA] hover:bg-[#F7F8F7] text-xs font-semibold text-[#727B77] flex items-center gap-1.5 transition-colors"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Ẩn PIN</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setShowRotateConfirm(true)}
                              disabled={isCheckoutPending}
                              className="h-9 px-3.5 rounded-xl bg-white border border-[#FECDCA] hover:bg-[#FEF3F2] text-xs font-semibold text-[#B42318] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Tạo PIN mới</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-xs text-[#727B77] bg-white rounded-2xl border border-[#E9ECEA]">
                    Bàn hiện đang trống. Hãy mở phiên bàn để nhận mã PIN.
                  </div>
                )}

                {/* Đường dẫn mã QR của bàn */}
                {qrCode && (
                  <div className="p-3.5 bg-white rounded-2xl border border-[#E9ECEA] flex items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <QrCode className="w-4 h-4 text-[#1D725E] flex-shrink-0" />
                      <span className="font-mono text-[#1D2522] truncate">{qrCode.path}</span>
                    </div>
                    <a
                      href={qrCode.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 h-8 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] text-xs font-semibold text-[#1D2522] flex items-center gap-1.5 transition-colors"
                    >
                      <span className='whitespace-nowrap'>Xem QR</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ===================================================================
              3. Footer Cố Định Chứa Các Nút Hành Động Chốt Tiền
             =================================================================== */}
          <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2 flex-shrink-0 z-20 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {activeTab === 'billing' ? (
              <>
                {isClosed ? (
                  <button
                    type="button"
                    onClick={handleAnimatedClose}
                    className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white flex items-center justify-center gap-2 shadow-xs transition-all"
                  >
                    <span>Hoàn tất & Đóng</span>
                  </button>
                ) : isCheckoutPending ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={isSubmittingSettle || !canSettleBackend}
                      onClick={() => setShowConfirmSettlement(true)}
                      className={`w-full h-12 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all ${
                        !canSettleBackend
                          ? 'bg-[#E9ECEA] text-[#A0A8A5] cursor-not-allowed'
                          : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác nhận đã thu {formattedTotal}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmittingCancel}
                      onClick={handleCancelCheckout}
                      className="w-full h-10 rounded-xl text-xs font-semibold text-[#B42318] hover:bg-[#FEF3F2] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isSubmittingCancel ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang hủy chốt...</span>
                        </>
                      ) : (
                        <span>Tiếp tục nhận món / Hủy chốt</span>
                      )}
                    </button>
                  </div>
                ) : isOccupied ? (
                  <button
                    type="button"
                    disabled={isSubmittingCheckout || !hasOrders || outstandingCount > 0}
                    onClick={handleBeginCheckout}
                    className={`w-full h-12 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all ${
                      !hasOrders || outstandingCount > 0
                        ? 'bg-[#E9ECEA] text-[#A0A8A5] cursor-not-allowed'
                        : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white'
                    }`}
                  >
                    {isSubmittingCheckout ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang chốt hóa đơn...</span>
                      </>
                    ) : (
                      <>
                        <Receipt className="w-4 h-4" />
                        <span>
                          {outstandingCount > 0
                            ? 'Chưa thể chốt (còn đơn chưa hoàn tất)'
                            : !hasOrders
                            ? 'Chưa có đơn hàng'
                            : 'Chốt hóa đơn (Khóa gọi thêm)'}
                        </span>
                      </>
                    )}
                  </button>
                ) : null}
              </>
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

      {/* =======================================================================
          Dialog Xác Nhận Đã Thu Tiền (Chỉ xác nhận khi đã nhận đủ tiền)
         ======================================================================= */}
      {showConfirmSettlement && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-dialog-backdrop-in"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="settle-dialog-title"
          aria-describedby="settle-dialog-desc"
        >
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#E9ECEA] shadow-2xl p-5 sm:p-6 space-y-4 animate-dialog-card-in">
            <div className="w-11 h-11 rounded-2xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h4 id="settle-dialog-title" className="text-base font-bold text-[#1D2522]">
                Xác nhận đã thu tiền {table.label}?
              </h4>
              <p id="settle-dialog-desc" className="text-xs text-[#727B77] mt-1.5 leading-relaxed">
                Số tiền phải thu:{' '}
                <span className="font-extrabold text-[#1D725E] text-sm">{formattedTotal}</span>{' '}
                qua hình thức{' '}
                <span className="font-bold text-[#1D2522]">
                  {selectedMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                </span>
                .
              </p>
            </div>

            <label className="p-3 bg-[#FEF6EE] rounded-xl border border-[#F9DBAF] text-xs text-[#8A4D00] flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAcknowledged}
                onChange={(e) => setIsAcknowledged(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-[#1D725E] focus:ring-[#1D725E] border-[#F9DBAF] cursor-pointer"
              />
              <span className="font-medium leading-relaxed">
                Tôi xác nhận đã nhận đủ <strong className="text-[#B54708]">{formattedTotal}</strong> qua{' '}
                <strong>{selectedMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản'}</strong> thực tế.
              </span>
            </label>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={isSubmittingSettle || !isAcknowledged}
                onClick={handleConfirmSettlement}
                className="w-full h-11 rounded-xl text-xs sm:text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingSettle ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang hoàn tất thanh toán...</span>
                  </>
                ) : (
                  <span>Xác nhận đã thu tiền</span>
                )}
              </button>

              <button
                type="button"
                disabled={isSubmittingSettle}
                onClick={() => setShowConfirmSettlement(false)}
                className="w-full h-10 rounded-xl text-xs font-semibold text-[#55605C] hover:bg-[#F7F8F7] transition-colors"
              >
                Quay lại kiểm tra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AlertDialog Tạo PIN mới (Phase 2) */}
      {showRotateConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-dialog-backdrop-in"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="rotate-dialog-title"
          aria-describedby="rotate-dialog-desc"
        >
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#E9ECEA] shadow-2xl p-5 sm:p-6 space-y-4 animate-dialog-card-in">
            <div className="w-10 h-10 rounded-2xl bg-[#FEF3F2] text-[#B42318] flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>

            <div>
              <h4 id="rotate-dialog-title" className="text-base font-bold text-[#1D2522]">
                Tạo PIN mới cho {table.label}?
              </h4>
              <p id="rotate-dialog-desc" className="text-xs text-[#727B77] mt-1.5 leading-relaxed">
                PIN cũ sẽ ngừng hiệu lực ngay lập tức. Thiết bị của khách đã xác minh trước đó vẫn có thể tiếp tục gọi món.
              </p>
            </div>

            {rotateError && (
              <div className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018]">
                {rotateError}
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={isRotating}
                onClick={handleRotatePin}
                className="w-full h-11 rounded-xl text-xs font-bold bg-[#D92D20] hover:bg-[#B42318] text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {isRotating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tạo PIN...</span>
                  </>
                ) : (
                  <span>Xác nhận tạo PIN mới</span>
                )}
              </button>

              <button
                type="button"
                disabled={isRotating}
                onClick={() => setShowRotateConfirm(false)}
                className="w-full h-10 rounded-xl text-xs font-semibold text-[#55605C] hover:bg-[#F7F8F7] transition-colors"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
