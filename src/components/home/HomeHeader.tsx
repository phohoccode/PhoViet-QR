'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { LogIn } from 'lucide-react';

export const HomeHeader: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#F5F6F5]/90 backdrop-blur-md border-b border-[#E9ECEA]/80 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Tên hệ thống */}
        <Link
          href="/"
          className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] rounded-xl p-1 -m-1 transition-transform active:scale-95"
          aria-label="QR Ordering — Trang chủ"
        >
          <div className="w-9 h-9 rounded-xl bg-[#1D725E] overflow-hidden flex items-center justify-center text-white shadow-xs">
            <Image
              src="/brand/logo.png"
              alt="Phở Việt Logo"
              width={36}
              height={36}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base text-[#1D2522] tracking-tight leading-tight">
              QR Ordering
            </span>
            <span className="text-[10px] font-medium text-[#727B77] leading-none">
              Gọi món bằng điện thoại
            </span>
          </div>
        </Link>

        {/* Navigation Pills (Ẩn trên màn hình rất nhỏ, hiện từ md) */}
        <nav
          className="hidden md:flex items-center gap-1 bg-[#FFFFFF] p-1.5 rounded-full border border-[#E9ECEA] shadow-xs"
          aria-label="Điều hướng chính"
        >
          <a
            href="#ordering-options"
            className="px-4 py-1.5 rounded-full text-xs font-semibold text-[#55605C] hover:text-[#1D2522] hover:bg-[#F5F6F5] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            Cách gọi món
          </a>
          <a
            href="#how-it-works"
            className="px-4 py-1.5 rounded-full text-xs font-semibold text-[#55605C] hover:text-[#1D2522] hover:bg-[#F5F6F5] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            3 bước đặt món
          </a>
        </nav>

        {/* CTA Dành cho chủ quán dẫn về /login */}
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="h-10 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold bg-[#FFFFFF] hover:bg-[#E8F4F0] active:scale-95 text-[#1D725E] border border-[#E9ECEA] hover:border-[#35977D]/40 transition-all shadow-xs flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            <span>Dành cho chủ quán</span>
          </Link>
        </div>
      </div>
    </header>
  );
};
