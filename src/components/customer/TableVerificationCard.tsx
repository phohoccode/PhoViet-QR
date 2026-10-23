'use client';

import React, { useState, useId, useRef } from 'react';
import { KeyRound, Loader2, AlertCircle, Info, CheckCircle2 } from 'lucide-react';

interface TableVerificationCardProps {
  tableLabel: string;
  isVerifying?: boolean;
  errorMessage?: string | null;
  onVerify: (sessionCode: string) => void | Promise<void>;
  isVerified?: boolean;
  className?: string;
}

/**
 * TableVerificationCard — Khối nhập mã phiên bàn dành cho khách quét mã QR Tại bàn.
 * Tuân thủ yêu cầu Task A & Task B của P2-G01:
 * - Hỗ trợ chuỗi 1–64 ký tự (chữ và số theo contract R02 TableSessionVerifyInput).
 * - Tự động trim khoảng trắng thừa, không xóa mã bừa bãi khi báo lỗi (giữ focus).
 * - Nút "Xác nhận bàn" với touch target 48px, loading indicator khi đang verify, khóa bấm lặp.
 * - Giải thích rõ ràng: "Hỏi chủ quán mã phiên của bàn để bắt đầu".
 */
export const TableVerificationCard: React.FC<TableVerificationCardProps> = ({
  tableLabel,
  isVerifying = false,
  errorMessage = null,
  onVerify,
  isVerified = false,
  className = '',
}) => {
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [sessionCode, setSessionCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = errorMessage || localError;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanCode = sessionCode.trim();

    if (!cleanCode) {
      setLocalError('Vui lòng nhập mã phiên bàn.');
      inputRef.current?.focus();
      return;
    }

    if (cleanCode.length > 64) {
      setLocalError('Mã phiên bàn không vượt quá 64 ký tự.');
      inputRef.current?.focus();
      return;
    }

    setLocalError(null);
    await onVerify(cleanCode);
  };

  // Trạng thái đã xác minh thành công
  if (isVerified) {
    return (
      <section
        className={`p-4 bg-[#E8F4F0] border border-[#C6E7DC] rounded-2xl flex items-center justify-between gap-3 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white text-[#1D725E] flex items-center justify-center flex-shrink-0 shadow-xs">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#165B4B]">
              Đã xác nhận {tableLabel}
            </h3>
            <p className="text-xs text-[#1D725E]/80">
              Phiên gọi món đã sẵn sàng. Bạn có thể chọn món và gửi đơn.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`p-4 sm:p-5 bg-white border border-[#E9ECEA] rounded-2xl shadow-card transition-all ${className}`}
      aria-labelledby="verify-card-title"
    >
      {/* Tiêu đề & Hướng dẫn */}
      <div className="flex items-start gap-3 mb-3.5">
        <div className="w-10 h-10 rounded-xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5">
          <KeyRound className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h2 id="verify-card-title" className="text-sm sm:text-base font-bold text-[#1D2522]">
            Xác nhận {tableLabel}
          </h2>
          <p id={hintId} className="text-xs text-[#727B77] mt-0.5 leading-relaxed">
            Hỏi chủ quán hoặc nhân viên mã phiên của bàn để bắt đầu đặt món.
          </p>
        </div>
      </div>

      {/* Thông báo lỗi bên cạnh input nếu có */}
      {displayError && (
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          className="mb-3.5 p-3 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018] flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#B42318] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="font-medium leading-relaxed">{displayError}</span>
        </div>
      )}

      {/* Form nhập mã phiên bàn */}
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <div>
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-[#1D2522] mb-1.5"
          >
            Mã phiên của bàn
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={inputRef}
              id={inputId}
              name="sessionCode"
              type="text"
              value={sessionCode}
              onChange={(e) => {
                setSessionCode(e.target.value);
                if (localError) setLocalError(null);
              }}
              disabled={isVerifying}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="Nhập mã phiên (do quán cung cấp)"
              aria-describedby={displayError ? errorId : hintId}
              aria-invalid={!!displayError}
              className={`flex-1 h-12 px-3.5 bg-[#F7F8F7] border rounded-xl text-sm font-semibold text-[#1D2522] placeholder-[#727B77] transition-all focus:outline-none focus:ring-2 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed ${
                displayError
                  ? 'border-[#B42318] focus:ring-[#B42318] bg-[#FEF3F2]/30'
                  : 'border-[#E9ECEA] focus:ring-[#35977D]'
              }`}
            />

            <button
              type="submit"
              disabled={isVerifying}
              className={`h-12 px-5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] focus-visible:ring-offset-2 ${
                isVerifying
                  ? 'bg-[#1D725E]/70 text-white cursor-not-allowed'
                  : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-95 text-white'
              }`}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Đang kiểm tra...</span>
                </>
              ) : (
                <span>Xác nhận bàn</span>
              )}
            </button>
          </div>
        </div>

        {/* Thông báo chế độ xem trước */}
        <div className="flex items-center gap-1.5 text-[11px] text-[#727B77] pt-0.5">
          <Info className="w-3.5 h-3.5 text-[#35977D] flex-shrink-0" aria-hidden="true" />
          <span>Bạn vẫn có thể xem trước thực đơn bên dưới trước khi xác nhận bàn.</span>
        </div>
      </form>
    </section>
  );
};
