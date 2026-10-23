'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';
import { Store, LogOut, Loader2 } from 'lucide-react';
import { OwnerHeaderPills, type OwnerTabType } from './OwnerHeaderPills';

interface OwnerHeaderProps {
  storeName: string;
  activeTab: OwnerTabType;
  onTabChange: (tab: OwnerTabType) => void;
  ownerName?: string;
  roleLabel?: string;
  isLoggingOut?: boolean;
  logoutError?: string | null;
  onLogout?: () => void;
  logoutAction?: () => void | Promise<void>;
  className?: string;
}

function LogoutSubmitButton({ isMobile }: { isMobile?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        isMobile
          ? 'w-11 h-11 flex items-center justify-center text-[#727B77] hover:text-[#B42318] rounded-xl hover:bg-[#FEF3F2] active:scale-95 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318]'
          : 'p-2.5 text-[#727B77] hover:text-[#B42318] hover:bg-[#FEF3F2] rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318] disabled:opacity-50'
      }
      title={pending ? 'Đang đăng xuất...' : 'Đăng xuất khỏi hệ thống'}
      aria-label={pending ? 'Đang đăng xuất khỏi hệ thống' : 'Đăng xuất khỏi hệ thống'}
    >
      {pending ? (
        <Loader2 className="w-5 h-5 animate-spin text-[#727B77]" aria-hidden="true" />
      ) : (
        <LogOut className="w-5 h-5" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * OwnerHeader — Thanh header thanh lịch của dashboard chủ quán:
 * Logo bên trái, 4 tab viên thuốc căn giữa, tài khoản bên phải.
 * Đạt chuẩn touch target >= 44px và responsive tối ưu từ 375px đến 1440px.
 */
export const OwnerHeader: React.FC<OwnerHeaderProps> = ({
  storeName,
  activeTab,
  onTabChange,
  ownerName = 'Sania',
  roleLabel = 'Chủ quán',
  isLoggingOut = false,
  logoutError = null,
  onLogout,
  logoutAction,
  className = '',
}) => {
  return (
    <>
      <header
        className={`w-full bg-white border-b border-[#E9ECEA] px-3 sm:px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3 ${className}`}
      >
      {/* 1. Logo & Tên quán bên trái */}
      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#E8F4F0] flex items-center justify-center text-[#1D725E] font-bold text-lg shadow-xs flex-shrink-0">
            <Store className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-[#35977D] uppercase tracking-wider block">
              POS Đơn Giản
            </span>
            <h1 className="text-sm md:text-base font-bold text-[#1D2522] leading-tight truncate">
              {storeName}
            </h1>
          </div>
        </div>

        {/* Nút đăng xuất nhỏ trên mobile (Touch target 44x44px) */}
        {logoutAction ? (
          <form action={logoutAction} className="md:hidden flex-shrink-0">
            <LogoutSubmitButton isMobile />
          </form>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="md:hidden w-11 h-11 flex items-center justify-center text-[#727B77] hover:text-[#B42318] rounded-xl hover:bg-[#FEF3F2] disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318]"
            aria-label={isLoggingOut ? 'Đang đăng xuất khỏi hệ thống' : 'Đăng xuất khỏi hệ thống'}
          >
            {isLoggingOut ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#727B77]" aria-hidden="true" />
            ) : (
              <LogOut className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {/* 2. Thanh 4 Tab viên thuốc căn giữa */}
      <div className="flex-1 flex justify-center w-full md:w-auto overflow-x-auto py-1 scrollbar-none">
        <OwnerHeaderPills activeTab={activeTab} onTabChange={onTabChange} />
      </div>

      {/* 3. Khu vực tài khoản chủ quán bên phải (Desktop) */}
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#1D725E] text-white flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
            {ownerName.charAt(0).toUpperCase()}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-[#1D2522] leading-tight">{ownerName}</p>
            <p className="text-[11px] text-[#727B77]">{roleLabel}</p>
          </div>
        </div>

        {logoutAction ? (
          <form action={logoutAction} className="inline-flex">
            <LogoutSubmitButton />
          </form>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="p-2.5 text-[#727B77] hover:text-[#B42318] hover:bg-[#FEF3F2] rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318] disabled:opacity-50"
            title={isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất khỏi hệ thống'}
            aria-label={isLoggingOut ? 'Đang đăng xuất khỏi hệ thống' : 'Đăng xuất khỏi hệ thống'}
          >
            {isLoggingOut ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#727B77]" aria-hidden="true" />
            ) : (
              <LogOut className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </header>
    {logoutError && (
      <div
        role="alert"
        className="w-full bg-[#FEF3F2] border-b border-[#FECDCA] px-4 py-2 text-xs text-[#912018] flex items-center justify-between"
      >
        <span>{logoutError}</span>
      </div>
    )}
    </>
  );
};
