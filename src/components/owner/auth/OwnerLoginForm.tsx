'use client';

import React, { useState, useId } from 'react';
import { Mail, Lock, Eye, EyeOff, Store, AlertCircle, Loader2, Info } from 'lucide-react';

import type { OwnerLoginActionState } from '@/features/owner/auth-actions';
export type { OwnerLoginActionState };

interface OwnerLoginFormProps {
  /**
   * Action function từ Codex server action (useActionState).
   * Nếu chưa có action, form chạy ở chế độ UI validation độc lập.
   */
  action?: (formData: FormData) => void | Promise<void>;
  actionState?: OwnerLoginActionState;
  isPending?: boolean;
  systemMessage?: string | null;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  className?: string;
}

/**
 * OwnerLoginForm — Form đăng nhập quản trị viên tối giản.
 * Tuân thủ hệ màu Minimal Emerald POS:
 * - Card trắng bo góc 24px trên canvas xám nhạt #F5F6F5
 * - Accent #35977D, CTA chữ trắng #1D725E
 * - Accessible: aria-describedby, aria-invalid, focus-visible
 * - Tuyệt đối không có link đăng ký / bypass auth
 */
export const OwnerLoginForm: React.FC<OwnerLoginFormProps> = ({
  action,
  actionState,
  isPending = false,
  systemMessage = null,
  onSubmit,
  className = '',
}) => {
  const emailInputId = useId();
  const passwordInputId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const serverErrorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clientErrors, setClientErrors] = useState<{ email?: string; password?: string }>({});
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [waitingNotice, setWaitingNotice] = useState<string | null>(null);

  // Tổng hợp lỗi từ server action (Codex) hoặc client validation (Gemini)
  const emailError = actionState?.fieldErrors?.email || clientErrors.email;
  const passwordError = actionState?.fieldErrors?.password || clientErrors.password;
  const serverMessage = actionState?.status === 'error' ? actionState.message : null;
  const displayError = serverMessage || systemMessage;
  const isLoading = isPending || localSubmitting;

  const validateClient = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      errors.email = 'Vui lòng nhập địa chỉ email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Định dạng email không hợp lệ (ví dụ: owner@quan.vn).';
    }

    if (!password) {
      errors.password = 'Vui lòng nhập mật khẩu.';
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (onSubmit) {
      onSubmit(e);
      return;
    }

    // Client-side validation: chặn submit nếu trường dữ liệu không hợp lệ
    const isValid = validateClient();
    if (!isValid) {
      e.preventDefault();
      return;
    }

    // Nếu không có server action được truyền vào (chờ Codex P1-C02 bàn giao)
    if (!action) {
      e.preventDefault();
      setLocalSubmitting(true);
      setWaitingNotice(null);
      setTimeout(() => {
        setLocalSubmitting(false);
        setWaitingNotice(
          'Đang chờ bàn giao server action từ Codex. Giao diện và validation đã hoàn tất, không kích hoạt auth giả.'
        );
      }, 400);
    }
  };

  return (
    <div
      className={`w-full max-w-[440px] bg-white rounded-[24px] border border-[#E9ECEA] p-6 sm:p-8 shadow-card ${className}`}
    >
      {/* 1. Brand Logo & Tiêu đề */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#E8F4F0] text-[#1D725E] mb-3 shadow-sm">
          <Store className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#1D2522] tracking-tight">
          Đăng nhập quản lý
        </h1>
        <p className="text-xs sm:text-sm text-[#727B77] mt-1">
          Quản lý đơn hàng và bàn của quán
        </p>
      </div>

      {/* 2. Thông báo lỗi từ Server hoặc Hệ thống (nếu có) */}
      {displayError && (
        <div
          id={serverErrorId}
          role="alert"
          aria-live="polite"
          className="mb-5 p-3.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs sm:text-sm text-[#912018] flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#B42318]" aria-hidden="true" />
          <div className="flex-1 font-medium leading-relaxed">{displayError}</div>
        </div>
      )}

      {/* 2b. Thông báo chờ kết nối hạ tầng (WAITING_FOR_AUTH_CONTRACT) */}
      {waitingNotice && (
        <div
          role="status"
          className="mb-5 p-3.5 rounded-xl bg-[#E8F4F0] border border-[#35977D]/20 text-xs sm:text-sm text-[#1D725E] flex items-start gap-2.5"
        >
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#35977D]" aria-hidden="true" />
          <div className="flex-1 font-medium leading-relaxed">{waitingNotice}</div>
        </div>
      )}

      {/* 3. Form Đăng nhập */}
      <form
        action={action}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
        aria-describedby={displayError ? serverErrorId : undefined}
      >
        {/* Trường Email */}
        <div>
          <label
            htmlFor={emailInputId}
            className="block text-xs sm:text-sm font-semibold text-[#1D2522] mb-1.5"
          >
            Email quản trị viên
          </label>
          <div className="relative">
            <Mail
              className="w-4 h-4 text-[#727B77] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id={emailInputId}
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (clientErrors.email) {
                  setClientErrors((prev) => ({ ...prev, email: undefined }));
                }
                if (waitingNotice) setWaitingNotice(null);
              }}
              autoComplete="username"
              placeholder="owner@quan.vn"
              disabled={isLoading}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? emailErrorId : undefined}
              className={`w-full h-12 pl-10 pr-4 bg-[#F7F8F7] border rounded-xl text-sm text-[#1D2522] placeholder-[#727B77] transition-all focus:outline-none focus:ring-2 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed ${
                emailError
                  ? 'border-[#B42318] focus:ring-[#B42318] bg-[#FEF3F2]/30'
                  : 'border-[#E9ECEA] focus:ring-[#35977D]'
              }`}
            />
          </div>
          {emailError && (
            <p
              id={emailErrorId}
              role="alert"
              className="text-xs text-[#B42318] mt-1.5 font-medium flex items-center gap-1"
            >
              <span>{emailError}</span>
            </p>
          )}
        </div>

        {/* Trường Mật khẩu */}
        <div>
          <label
            htmlFor={passwordInputId}
            className="block text-xs sm:text-sm font-semibold text-[#1D2522] mb-1.5"
          >
            Mật khẩu
          </label>
          <div className="relative">
            <Lock
              className="w-4 h-4 text-[#727B77] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id={passwordInputId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (clientErrors.password) {
                  setClientErrors((prev) => ({ ...prev, password: undefined }));
                }
                if (waitingNotice) setWaitingNotice(null);
              }}
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={isLoading}
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? passwordErrorId : undefined}
              className={`w-full h-12 pl-10 pr-11 bg-[#F7F8F7] border rounded-xl text-sm text-[#1D2522] placeholder-[#727B77] transition-all focus:outline-none focus:ring-2 focus:bg-white disabled:opacity-60 disabled:cursor-not-allowed ${
                passwordError
                  ? 'border-[#B42318] focus:ring-[#B42318] bg-[#FEF3F2]/30'
                  : 'border-[#E9ECEA] focus:ring-[#35977D]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={0}
              disabled={isLoading}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#727B77] hover:text-[#1D2522] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D]"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {passwordError && (
            <p
              id={passwordErrorId}
              role="alert"
              className="text-xs text-[#B42318] mt-1.5 font-medium flex items-center gap-1"
            >
              <span>{passwordError}</span>
            </p>
          )}
        </div>

        {/* Nút Đăng nhập CTA */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] focus-visible:ring-offset-2 ${
              isLoading
                ? 'bg-[#1D725E]/70 text-white cursor-not-allowed'
                : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Đang đăng nhập...</span>
              </>
            ) : (
              <span>Đăng nhập</span>
            )}
          </button>
        </div>
      </form>

      {/* 4. Footer ghi chú bảo mật (Tuyệt đối không có link đăng ký) */}
      <footer className="mt-6 pt-4 border-t border-[#E9ECEA] text-center">
        <p className="text-[11px] text-[#727B77]">
          Hệ thống xác thực nội bộ dành riêng cho chủ quán.
        </p>
      </footer>
    </div>
  );
};
