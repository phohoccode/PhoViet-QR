'use client';

import React, { useState, useEffect, useId, useRef } from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface TableVerificationCardProps {
  tableLabel: string;
  isVerifying?: boolean;
  errorMessage?: string | null;
  onVerify: (sessionCode: string) => void | Promise<void>;
  isVerified?: boolean;
  className?: string;
}

/**
 * TableVerificationCard — UI nhập mã PIN 6 số dành cho khách quét mã QR Tại bàn.
 * HOTFIX P2-HF01:
 * - Thay thế mã dài bằng 6 chữ số số học (e.g. 482 619).
 * - inputMode="numeric", autoComplete="one-time-code", maxLength=6.
 * - Chỉ nhận chữ số 0-9, tự loại bỏ khoảng trắng khi paste, bảo toàn số 0 ở đầu.
 * - Hiển thị 6 ô chia thành 2 nhóm 3 ô (XXX XXX).
 * - CTA Xác nhận disable khi chưa đủ 6 số, touch target tối thiểu 48px.
 * - Xóa mã khỏi state khi xác minh thành công.
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

  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Dọn dẹp sạch mã PIN khỏi state khi unmount
  useEffect(() => {
    return () => {
      setPin('');
    };
  }, []);

  const displayError = errorMessage || localError;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Chỉ giữ lại chữ số 0-9, tối đa 6 ký tự, giữ nguyên leading zeros
    const rawVal = e.target.value;
    const cleanDigits = rawVal.replace(/\D/g, '').slice(0, 6);
    setPin(cleanDigits);
    if (localError) setLocalError(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const cleanDigits = pasteData.replace(/\D/g, '').slice(0, 6);
    if (cleanDigits) {
      setPin(cleanDigits);
      if (localError) setLocalError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pin.length !== 6) {
      setLocalError('Vui lòng nhập đủ 6 chữ số mã PIN.');
      inputRef.current?.focus();
      return;
    }

    setLocalError(null);
    const submittedPin = pin;
    setPin('');
    await onVerify(submittedPin);
  };

  const handleCardClick = () => {
    inputRef.current?.focus();
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
      className={`p-5 sm:p-6 bg-white border border-[#E9ECEA] rounded-3xl shadow-xs transition-all text-center ${className}`}
      aria-labelledby="verify-card-title"
    >
      {/* Tiêu đề & Hướng dẫn thân thiện */}
      <div className="mb-4">
        <h2 id="verify-card-title" className="text-base sm:text-lg font-bold text-[#1D2522]">
          Chào mừng đến {tableLabel}
        </h2>
        <p id={hintId} className="text-xs sm:text-sm text-[#727B77] mt-1">
          Nhập mã 6 số do quán cung cấp
        </p>
      </div>

      {/* Thông báo lỗi nếu có */}
      {displayError && (
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          className="mb-4 p-3 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018] flex items-center justify-center gap-2 text-left"
        >
          <AlertCircle className="w-4 h-4 text-[#B42318] flex-shrink-0" aria-hidden="true" />
          <span className="font-medium leading-relaxed">{displayError}</span>
        </div>
      )}

      {/* Form nhập PIN 6 số */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Vùng hiển thị 6 ô số chia 2 cụm (3 + 3) */}
        <div
          className="relative flex items-center justify-center gap-1.5 sm:gap-2.5 cursor-text py-2"
          onClick={handleCardClick}
        >
          {/* Input vô hình nhưng focusable & accessible */}
          <input
            ref={inputRef}
            id={inputId}
            name="sessionCode"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            value={pin}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isVerifying}
            aria-label="Mã PIN 6 số của bàn"
            aria-describedby={displayError ? errorId : hintId}
            aria-invalid={Boolean(displayError)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
          />

          {/* Cụm 3 số đầu */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {[0, 1, 2].map((idx) => {
              const digit = pin[idx] || '';
              const isCurrent = isFocused && (pin.length === idx || (idx === 5 && pin.length === 6));
              return (
                <div
                  key={idx}
                  className={`w-11 h-13 sm:w-13 sm:h-15 rounded-xl border-2 flex items-center justify-center text-xl sm:text-2xl font-mono font-bold tabular-nums transition-all ${
                    displayError
                      ? 'border-[#B42318] bg-[#FEF3F2]/40 text-[#912018]'
                      : isCurrent
                      ? 'border-[#35977D] ring-3 ring-[#35977D]/20 bg-white text-[#1D2522]'
                      : digit
                      ? 'border-[#35977D] bg-white text-[#1D2522] shadow-xs'
                      : 'border-[#E9ECEA] bg-[#F7F8F7] text-[#727B77]'
                  }`}
                >
                  {digit ? (
                    <span>{digit}</span>
                  ) : (
                    <span className="text-[#A0A8A5] font-normal text-sm select-none">_</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Dấu phân tách thẩm mỹ giữa 2 cụm 3 số */}
          <div className="w-2 sm:w-3 h-0.5 bg-[#C6E7DC] rounded-full mx-0.5 shrink-0" aria-hidden="true" />

          {/* Cụm 3 số sau */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {[3, 4, 5].map((idx) => {
              const digit = pin[idx] || '';
              const isCurrent = isFocused && pin.length === idx;
              return (
                <div
                  key={idx}
                  className={`w-11 h-13 sm:w-13 sm:h-15 rounded-xl border-2 flex items-center justify-center text-xl sm:text-2xl font-mono font-bold tabular-nums transition-all ${
                    displayError
                      ? 'border-[#B42318] bg-[#FEF3F2]/40 text-[#912018]'
                      : isCurrent
                      ? 'border-[#35977D] ring-3 ring-[#35977D]/20 bg-white text-[#1D2522]'
                      : digit
                      ? 'border-[#35977D] bg-white text-[#1D2522] shadow-xs'
                      : 'border-[#E9ECEA] bg-[#F7F8F7] text-[#727B77]'
                  }`}
                >
                  {digit ? (
                    <span>{digit}</span>
                  ) : (
                    <span className="text-[#A0A8A5] font-normal text-sm select-none">_</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Nút Xác nhận */}
        <div>
          <button
            type="submit"
            disabled={pin.length !== 6 || isVerifying}
            className={`w-full h-12 px-6 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] focus-visible:ring-offset-2 ${
              pin.length !== 6 || isVerifying
                ? 'bg-[#E9ECEA] text-[#727B77] cursor-not-allowed'
                : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white shadow-sm'
            }`}
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Đang xác nhận...</span>
              </>
            ) : (
              <span>Xác nhận</span>
            )}
          </button>
        </div>

        {/* Gợi ý hỏi chủ quán */}
        <p className="text-xs text-[#727B77] pt-1">
          Chưa có mã? Hỏi chủ quán nhé.
        </p>
      </form>
    </section>
  );
};
