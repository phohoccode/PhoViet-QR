'use client';

import React from 'react';
import Link from 'next/link';
import { QrCode, LogIn } from 'lucide-react';

export const HomeFooter: React.FC = () => {
  return (
    <footer className="w-full bg-[#FFFFFF] border-t border-[#E9ECEA] py-10 sm:py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-8 border-b border-[#F0F2F1]">
          {/* Logo & Tên hệ thống */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1D725E] flex items-center justify-center text-white shadow-xs">
              <QrCode className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <span className="font-bold text-base text-[#1D2522] tracking-tight block leading-tight">
                QR Ordering
              </span>
              <span className="text-xs text-[#727B77]">
                Hệ thống gọi món tại quán bằng điện thoại
              </span>
            </div>
          </div>

          {/* Links điều hướng nhanh */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium text-[#55605C]">
            <a
              href="#ordering-options"
              className="hover:text-[#1D725E] transition-colors focus:outline-none focus-visible:underline"
            >
              Cách gọi món
            </a>
            <a
              href="#benefits"
              className="hover:text-[#1D725E] transition-colors focus:outline-none focus-visible:underline"
            >
              Lợi ích
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#1D725E] transition-colors focus:outline-none focus-visible:underline"
            >
              3 bước đặt món
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[#1D725E] hover:text-[#165B4B] font-semibold focus:outline-none focus-visible:underline"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Dành cho chủ quán</span>
            </Link>
          </div>
        </div>

        {/* Thông tin bản quyền & ghi chú thân thiện */}
        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#727B77]">
          <p>© 2026 QR Ordering. Tất cả các quyền được bảo lưu.</p>
          <p className="text-[11px] text-[#727B77]">
            Ứng dụng gọi món bằng mã QR trên điện thoại · Phục vụ nhanh chóng, chính xác và đúng thứ tự
          </p>
        </div>
      </div>
    </footer>
  );
};
