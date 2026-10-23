'use client';

import React from 'react';

interface CustomerSkeletonProps {
  className?: string;
}

/**
 * CustomerSkeleton — Khung xương tải trang (Skeleton loading) cho màn hình khách hàng.
 * Tối ưu hóa cho mobile 375px-430px, dùng hiệu ứng pulse nhẹ nhàng, không gây nhấp nháy giao diện.
 */
export const CustomerSkeleton: React.FC<CustomerSkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`w-full max-w-lg mx-auto bg-white min-h-screen shadow-sm flex flex-col relative pb-28 animate-pulse ${className}`}
      role="status"
      aria-busy="true"
      aria-label="Đang tải thực đơn quán..."
    >
      {/* 1. Sticky Header Skeleton */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E9ECEA] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#E9ECEA] flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="w-32 h-4 rounded-md bg-[#E9ECEA]" />
            <div className="w-20 h-3 rounded-full bg-[#E9ECEA]" />
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-[#E9ECEA]" />
      </header>

      {/* 2. Search Bar Skeleton */}
      <div className="px-4 pt-3 pb-1">
        <div className="w-full h-11 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA]" />
      </div>

      {/* 3. Category Chips Skeleton */}
      <div className="py-2 px-4 flex items-center gap-2 overflow-x-hidden">
        <div className="w-16 h-9 rounded-full bg-[#35977D]/20 flex-shrink-0" />
        <div className="w-20 h-9 rounded-full bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />
        <div className="w-24 h-9 rounded-full bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />
        <div className="w-20 h-9 rounded-full bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />
      </div>

      {/* 4. Menu Items Skeleton */}
      <main className="px-4 flex-1 space-y-3 pt-2">
        <div className="w-28 h-3.5 rounded bg-[#E9ECEA] mb-3" />

        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E9ECEA] shadow-sm"
          >
            {/* Ảnh vuông */}
            <div className="w-20 h-20 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />

            {/* Thông tin món */}
            <div className="flex-1 space-y-2">
              <div className="w-3/4 h-4 rounded bg-[#E9ECEA]" />
              <div className="w-full h-3 rounded bg-[#F7F8F7]" />
              <div className="w-1/3 h-4 rounded bg-[#E9ECEA] mt-2" />
            </div>

            {/* Nút thêm món */}
            <div className="w-11 h-11 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />
          </div>
        ))}
      </main>

      {/* Screen-reader text */}
      <span className="sr-only">Đang đồng bộ thực đơn từ máy chủ, vui lòng đợi trong giây lát...</span>
    </div>
  );
};
