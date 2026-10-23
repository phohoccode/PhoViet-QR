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
          ? 'p-2 text-[#727B77] hover:text-[#B42318] rounded-xl hover:bg-[#FEF3F2] disabled:opacity-50 transition-colors'
          : 'p-2 text-[#727B77] hover:text-[#B42318] hover:bg-[#FEF3F2] rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318] disabled:opacity-50'
      }
      title={pending ? 'Đang đăng xuất...' : 'Đăng xuất khỏi hệ thống'}
      aria-label={pending ? 'Đang đăng xuất...' : 'Đăng xuất'}
    >
      {pending ? (
        <Loader2 className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'} animate-spin text-[#727B77]`} aria-hidden="true" />
      ) : (
        <LogOut className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * OwnerHeader — Thanh header thanh lịch của dashboard chủ quán:
 * Logo bên trái, 4 tab viên thuốc căn giữa, tài khoản bên phải.
 */
export const OwnerHeader: React.FC<OwnerHeaderProps> = ({
  storeName,
  activeTab,
  onTabChange,
  ownerName = 'Sania',
  roleLabel = 'Chủ quán',
  isLoggingOut = false,
  onLogout,
  logoutAction,
  className = '',
}) => {
  return (
    <header
      className={`w-full bg-white border-b border-[#E9ECEA] px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3 ${className}`}
    >
      {/* 1. Logo & Tên quán bên trái */}
      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#E8F4F0] flex items-center justify-center text-[#1D725E] font-bold text-lg shadow-sm">
            <Store className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-semibold text-[#35977D] uppercase tracking-wider block">
              POS Đơn Giản
            </span>
            <h1 className="text-sm md:text-base font-bold text-[#1D2522] leading-tight">
              {storeName}
            </h1>
          </div>
        </div>

        {/* Nút đăng xuất nhỏ trên mobile */}
        {logoutAction ? (
          <form action={logoutAction} className="md:hidden">
            <LogoutSubmitButton isMobile />
          </form>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            className="md:hidden p-2 text-[#727B77] hover:text-[#B42318] rounded-xl hover:bg-[#FEF3F2] disabled:opacity-50 transition-colors"
            aria-label={isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
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
      <div className="flex-1 flex justify-center w-full md:w-auto overflow-x-auto py-1">
        <OwnerHeaderPills activeTab={activeTab} onTabChange={onTabChange} />
      </div>

      {/* 3. Khu vực tài khoản chủ quán bên phải */}
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#1D725E] text-white flex items-center justify-center font-bold text-sm shadow-sm">
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
            className="p-2 text-[#727B77] hover:text-[#B42318] hover:bg-[#FEF3F2] rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318] disabled:opacity-50"
            title={isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất khỏi hệ thống'}
            aria-label={isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
          >
            {isLoggingOut ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#727B77]" aria-hidden="true" />
            ) : (
              <LogOut className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </header>
  );
};
