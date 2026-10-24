'use client';

/**
 * TAKEAWAY PICKUP VERIFICATION DIALOG — QR Ordering Minimal MVP (Phase 4 / P4-G03)
 *
 * Hộp thoại / Sheet xác minh mã nhận món mang đi của Chủ quán:
 * - Desktop: Modal nổi giữa màn hình (centered dialog).
 * - Mobile (<sm): Bottom sheet trượt từ đáy lên (slide-up sheet).
 * - Bàn phím số trên mobile (inputMode="numeric"), maxLength=6, giữ số 0 ở đầu, paste được.
 * - Tóm tắt chi tiết: Số thứ tự FIFO, danh sách món, tổng tiền, trạng thái Đã thanh toán / Sẵn sàng.
 * - Kiểm tra hợp lệ: Nút "Xác nhận đã giao" chỉ kích hoạt khi nhập đủ 6 chữ số và đơn đang ready.
 * - Chống double-submit, hiển thị spinner "Đang xác minh...".
 * - Báo lỗi inline chi tiết:
 *   + Sai mã: "Mã chưa chính xác, vui lòng kiểm tra lại." (không lộ mã đúng).
 *   + Quá giới hạn (rate-limited): "Đã thử quá nhiều lần. Vui lòng thử lại sau." (+ thời gian đợi nếu có).
 *   + Xung đột 409: "Trạng thái đơn đã thay đổi trên hệ thống."
 *   + Lỗi mạng / timeout: "Máy chủ chưa xác nhận được kết quả. Bấm lại để kiểm tra." (giữ nguyên requestId).
 * - Phím Escape để hủy, phím Enter để xác nhận khi đã đủ 6 số.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  PackageCheck,
  ShoppingBag,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Clock,
  RotateCcw,
} from 'lucide-react';
import type { OrderDetail } from '../../../../docs/contracts/types';
import { MenuApiError } from '@/features/owner/api-client';

export interface TakeawayPickupVerificationDialogProps {
  order: OrderDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmPickup: (
    order: OrderDetail,
    pickupCode: string,
    requestId: string
  ) => Promise<void>;
  onRefreshOrders?: () => Promise<void>;
  className?: string;
}

interface ModalContentProps {
  order: OrderDetail;
  onClose: () => void;
  onConfirmPickup: (
    order: OrderDetail,
    pickupCode: string,
    requestId: string
  ) => Promise<void>;
  onRefreshOrders?: () => Promise<void>;
  className?: string;
}

const TakeawayPickupModalContent: React.FC<ModalContentProps> = ({
  order,
  onClose,
  onConfirmPickup,
  onRefreshOrders,
  className = '',
}) => {
  const [pickupCode, setPickupCode] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState<boolean>(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  // Stable requestId per verification session
  const requestIdRef = useRef<string>(crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input khi mở modal
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAnimatedClose = useCallback(() => {
    if (isSubmitting) return; // Khóa đóng khi đang gửi
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 180);
  }, [isSubmitting, onClose]);

  // Lắng nghe phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleAnimatedClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAnimatedClose]);

  const ticketDisplay =
    order.ticketNo !== null && order.ticketNo !== undefined
      ? `#${String(order.ticketNo).padStart(3, '0')}`
      : `#${order.id.slice(0, 6).toUpperCase()}`;

  const formattedTotal = new Intl.NumberFormat('vi-VN').format(order.totalVnd) + ' đ';

  // Lọc chỉ giữ các ký tự số, tối đa 6 chữ số, giữ nguyên số 0 đầu
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const digitsOnly = rawVal.replace(/\D/g, '').slice(0, 6);
    setPickupCode(digitsOnly);
    if (errorMessage) {
      setErrorMessage(null);
      setIsConflict(false);
    }
  };

  const isCodeValid = /^[0-9]{6}$/.test(pickupCode);
  const canSubmit = isCodeValid && order.status === 'ready' && !isSubmitting;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setIsConflict(false);
    setRetryAfterSeconds(null);

    try {
      await onConfirmPickup(order, pickupCode, requestIdRef.current);
      handleAnimatedClose();
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        const status = err.status;
        const code = err.error.code;

        if (code === 'INVALID_PICKUP_CODE' || status === 422 || status === 400) {
          setErrorMessage('Mã chưa chính xác, vui lòng kiểm tra lại.');
        } else if (code === 'ORDER_ALREADY_COMPLETED') {
          setIsConflict(true);
          setErrorMessage('Đơn hàng này đã được xác nhận hoàn tất trước đó.');
          void onRefreshOrders?.();
        } else if (code === 'PAYMENT_REVIEW_REQUIRED') {
          setIsConflict(true);
          setErrorMessage('Đơn hàng đang bị tạm giữ để đối soát thanh toán. Không thể giao món.');
          void onRefreshOrders?.();
        } else if (code === 'PICKUP_NOT_ALLOWED') {
          setErrorMessage('Đơn hàng chưa đủ điều kiện giao món (chưa sẵn sàng hoặc chưa thanh toán).');
        } else if (code === 'PICKUP_CREDENTIAL_UNAVAILABLE' || status === 503) {
          setErrorMessage('Dịch vụ mã nhận món tạm thời không khả dụng. Vui lòng liên hệ hỗ trợ.');
        } else if (code === 'DUPLICATE_REQUEST_CONFLICT') {
          setErrorMessage('Mã yêu cầu bị xung đột dữ liệu. Vui lòng kiểm tra lại thao tác.');
        } else if (code === 'RATE_LIMITED' || status === 429) {
          const waitSec = err.retryAfterSeconds ?? 15;
          setRetryAfterSeconds(waitSec);
          setErrorMessage(`Đã thử quá nhiều lần. Vui lòng thử lại sau ${waitSec} giây.`);
        } else if (status === 409 || code === 'INVALID_STATE_TRANSITION') {
          setIsConflict(true);
          setErrorMessage('Trạng thái đơn hàng đã thay đổi trên hệ thống.');
          void onRefreshOrders?.();
        } else if (status >= 500 || code === 'INTERNAL_ERROR') {
          setErrorMessage(
            'Máy chủ chưa xác nhận được kết quả. Bấm lại để kiểm tra lại trạng thái.'
          );
        } else {
          setErrorMessage(err.error.message || 'Không thể xác minh mã nhận món.');
        }
      } else {
        setErrorMessage('Mất kết nối mạng. Hãy bấm thử lại để tiếp tục với đúng yêu cầu ban đầu.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pickup-dialog-title"
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200 ${
        isClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
      } ${className}`}
      onClick={handleAnimatedClose}
    >
      <div
        className={`w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-2xl border border-[#E9ECEA] shadow-2xl flex flex-col overflow-hidden max-h-[92vh] sm:max-h-[85vh] ${
          isClosing
            ? 'animate-sheet-slide-down sm:animate-dialog-card-out'
            : 'animate-sheet-slide-up sm:animate-dialog-card-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===================================================================
            1. Header Dialog
           =================================================================== */}
        <div className="px-5 py-4 border-b border-[#E9ECEA] bg-[#FAFBFB] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center flex-shrink-0">
              <PackageCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="pickup-dialog-title"
                className="text-sm sm:text-base font-bold text-[#1D2522] leading-tight"
              >
                Xác nhận giao món mang đi
              </h2>
              <p className="text-[11px] text-[#727B77] mt-0.5">
                Nhập mã 6 chữ số do khách hàng cung cấp
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleAnimatedClose}
            className="w-8 h-8 rounded-full bg-[#F1F3F2] hover:bg-[#E9ECEA] text-[#55605C] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-50"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ===================================================================
            2. Thân Dialog: Tóm tắt đơn & Form nhập mã
           =================================================================== */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Tóm tắt đơn hàng */}
          <div className="p-4 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-[#1D2522]">
                  {ticketDisplay}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#F1F3F2] text-[#55605C] border border-[#E9ECEA]">
                  <ShoppingBag className="w-3 h-3" />
                  <span>Mang đi</span>
                </span>
              </div>

              <div className="flex items-center gap-1 text-[11px] font-bold text-[#1D725E] bg-[#E8F4F0] px-2 py-0.5 rounded border border-[#C6E7DC]">
                <CheckCircle2 className="w-3 h-3" />
                <span>Đã thanh toán · Sẵn sàng</span>
              </div>
            </div>

            {/* Danh sách món tóm tắt */}
            {order.lines && order.lines.length > 0 && (
              <div className="text-xs text-[#55605C] space-y-1 pt-1 border-t border-[#E9ECEA]/80 max-h-24 overflow-y-auto">
                {order.lines.map((line) => (
                  <div key={line.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      <strong className="text-[#1D2522]">{line.quantity}×</strong> {line.name}
                    </span>
                    <span className="text-[#727B77] flex-shrink-0 font-medium">
                      {new Intl.NumberFormat('vi-VN').format(line.lineTotalVnd)} đ
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Tổng tiền */}
            <div className="pt-2 border-t border-[#E9ECEA]/80 flex items-center justify-between text-xs">
              <span className="text-[#727B77]">Tổng thanh toán:</span>
              <span className="font-extrabold text-[#1D725E] text-sm">
                {formattedTotal}
              </span>
            </div>
          </div>

          {/* Form nhập mã nhận món */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="pickup-code-input"
                className="block text-xs font-bold text-[#1D2522] uppercase tracking-wider"
              >
                Mã nhận món của khách (6 chữ số)
              </label>

              <div className="relative">
                <input
                  ref={inputRef}
                  id="pickup-code-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="off"
                  disabled={isSubmitting}
                  value={pickupCode}
                  onChange={handleInputChange}
                  placeholder="000 000"
                  className="w-full h-14 rounded-2xl border-2 border-[#E9ECEA] focus:border-[#1D725E] focus:outline-none focus:ring-4 focus:ring-[#1D725E]/15 text-center font-mono text-2xl sm:text-3xl font-extrabold tracking-widest text-[#1D2522] bg-white transition-all placeholder:text-[#C5CBC8] placeholder:font-normal placeholder:tracking-normal disabled:bg-[#FAFBFB] disabled:text-[#A0A8A5]"
                  aria-describedby={errorMessage ? 'pickup-error-msg' : undefined}
                />
              </div>

              <p className="text-[11px] text-[#727B77] text-center">
                Khách hàng xuất trình mã này trên màn hình theo dõi đơn
              </p>
            </div>

            {/* Thông báo lỗi inline (nếu có) */}
            {errorMessage && (
              <div
                id="pickup-error-msg"
                role="alert"
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 animate-dialog-card-in ${
                  isConflict
                    ? 'bg-[#FEF6EE] border-[#F9DBAF] text-[#8A4D00]'
                    : retryAfterSeconds
                      ? 'bg-[#FEF6EE] border-[#F9DBAF] text-[#8A4D00]'
                      : 'bg-[#FEF3F2] border-[#FECDCA] text-[#D92D20]'
                }`}
              >
                {isConflict ? (
                  <RotateCcw className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#B54708]" />
                ) : retryAfterSeconds ? (
                  <Clock className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#B54708]" />
                ) : (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#D92D20]" />
                )}
                <div className="flex-1 leading-relaxed text-[11px]">
                  <p className="font-bold">{errorMessage}</p>
                  {isConflict && onRefreshOrders && (
                    <button
                      type="button"
                      onClick={() => onRefreshOrders()}
                      className="mt-1.5 text-xs font-bold text-[#1D725E] underline flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Làm mới danh sách đơn ngay</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Nút thao tác dưới form */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleAnimatedClose}
                className="flex-1 h-12 rounded-xl border border-[#E9ECEA] bg-[#FAFBFB] hover:bg-[#E9ECEA] text-xs font-bold text-[#55605C] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-50"
              >
                Hủy bỏ
              </button>

              <button
                type="submit"
                disabled={!canSubmit}
                className="flex-1 h-12 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Xác nhận mã và hoàn tất giao món"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Đang xác minh...</span>
                  </>
                ) : (
                  <>
                    <PackageCheck className="w-4 h-4" />
                    <span>Xác nhận đã giao</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export const TakeawayPickupVerificationDialog: React.FC<TakeawayPickupVerificationDialogProps> = ({
  order,
  isOpen,
  onClose,
  onConfirmPickup,
  onRefreshOrders,
  className = '',
}) => {
  if (!isOpen || !order) return null;

  return (
    <TakeawayPickupModalContent
      key={order.id}
      order={order}
      onClose={onClose}
      onConfirmPickup={onConfirmPickup}
      onRefreshOrders={onRefreshOrders}
      className={className}
    />
  );
};
