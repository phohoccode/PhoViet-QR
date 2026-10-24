'use client';

import React from 'react';

/**
 * OrdersQueueSkeleton — Khung xương tải hàng đợi đơn hàng (Tab Đơn hàng - Cột trái).
 * Đồng bộ pixel-perfect với thẻ OrderQueueCard.
 */
export const OrdersQueueSkeleton: React.FC = () => {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Đang tải danh sách đơn hàng..."
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="p-4 rounded-2xl border border-[#E9ECEA] bg-white space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-16 h-5 rounded bg-[#E9ECEA]" />
              <div className="w-14 h-4 rounded bg-[#E8F4F0]" />
            </div>
            <div className="w-20 h-5 rounded-full bg-[#E9ECEA]" />
          </div>
          <div className="w-3/4 h-3.5 rounded bg-[#F7F8F7]" />
          <div className="pt-2 border-t border-[#E9ECEA] flex items-center justify-between">
            <div className="w-16 h-3 rounded bg-[#F7F8F7]" />
            <div className="w-20 h-4 rounded bg-[#E9ECEA]" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * OrderDetailSkeleton — Khung xương chi tiết phiếu đơn (Tab Đơn hàng - Cột phải).
 * Đồng bộ bố cục với OrderDetailPanel.
 */
export const OrderDetailSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`flex flex-col h-full bg-white rounded-2xl border border-[#E9ECEA] overflow-hidden animate-pulse ${className}`}
      role="status"
      aria-busy="true"
      aria-label="Đang tải chi tiết đơn hàng..."
    >
      {/* 1. Header chi tiết */}
      <div className="p-4 border-b border-[#E9ECEA] bg-[#FAFBFB] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-20 h-6 bg-[#E9ECEA] rounded-lg" />
          <div className="w-16 h-5 bg-[#E8F4F0] rounded" />
        </div>
        <div className="w-22 h-6 bg-[#E9ECEA] rounded-full" />
      </div>

      {/* 2. Danh sách món đang làm */}
      <div className="p-4 flex-1 space-y-3.5 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start justify-between gap-3 pb-3 border-b border-[#F7F8F7]">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#E8F4F0]" />
                <div className="w-32 h-4 rounded bg-[#E9ECEA]" />
              </div>
              <div className="w-24 h-3 rounded bg-[#F7F8F7] ml-7" />
            </div>
            <div className="w-16 h-4 rounded bg-[#E9ECEA]" />
          </div>
        ))}
      </div>

      {/* 3. Tạm tính & Nút hành động */}
      <div className="p-4 bg-[#FAFBFB] border-t border-[#E9ECEA] space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="w-16 h-4 bg-[#E9ECEA] rounded" />
          <div className="w-24 h-5 bg-[#E8F4F0] rounded" />
        </div>
        <div className="w-full h-11 bg-[#E8F4F0] rounded-xl" />
      </div>
    </div>
  );
};

/**
 * TablesGridSkeleton — Khung xương tải sơ đồ bàn (Tab Bàn).
 * Đồng bộ với lưới card trong TableManagementView: Tên bàn + menu, badges trạng thái, 2 nút hành động.
 */
export const TablesGridSkeleton: React.FC = () => {
  return (
    <div
      className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-1 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Đang tải sơ đồ bàn..."
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <div
          key={i}
          className="p-3.5 rounded-2xl border border-[#E9ECEA] bg-white flex flex-col justify-between text-left space-y-3 min-h-[148px]"
        >
          {/* Hàng trên: Nhãn bàn + nút menu 3 chấm */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="w-16 h-4.5 rounded bg-[#E9ECEA]" />
              <div className="w-6 h-6 rounded-lg bg-[#F7F8F7]" />
            </div>

            {/* Badges trạng thái bàn & QR */}
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-16 h-4 rounded-full bg-[#E9ECEA]" />
              <div className="w-14 h-4 rounded-full bg-[#F7F8F7]" />
            </div>
          </div>

          {/* Hàng dưới: 2 nút Xem QR + Mở phiên */}
          <div className="pt-2 border-t border-[#E9ECEA]/60 grid grid-cols-2 gap-1.5">
            <div className="h-8 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA]" />
            <div className="h-8 rounded-xl bg-[#E8F4F0]" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * MenuGridSkeleton — Khung xương tải thực đơn quán (Tab Menu).
 * Đồng bộ với lưới thẻ món ăn trong OwnerMenuView.
 */
export const MenuGridSkeleton: React.FC = () => {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 animate-pulse pt-2"
      role="status"
      aria-busy="true"
      aria-label="Đang tải danh mục món..."
    >
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-[#E9ECEA] overflow-hidden flex flex-col min-h-[260px]"
        >
          <div className="h-36 sm:h-40 bg-[#F7F8F7] w-full" />
          <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-2/3 h-4 bg-[#E9ECEA] rounded" />
              <div className="w-full h-3 bg-[#F7F8F7] rounded" />
              <div className="w-1/3 h-5 bg-[#E8F4F0] rounded mt-2" />
            </div>
            <div className="pt-2.5 border-t border-[#F2F4F2] flex items-center justify-between">
              <div className="w-20 h-7 bg-[#F7F8F7] rounded-xl" />
              <div className="w-16 h-7 bg-[#F7F8F7] rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * TakeawayQrSkeleton — Khung xương tải mã QR mang đi (Tab Cài đặt).
 * Đồng bộ chính xác với bố cục thẻ QrCodeView, thông tin chi tiết và 3 nút tải/in.
 */
export const TakeawayQrSkeleton: React.FC = () => {
  return (
    <div
      className="space-y-4 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Đang kiểm tra mã QR mang đi..."
    >
      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-[#F7F8F7] rounded-2xl border border-[#E9ECEA]">
        {/* QR preview box */}
        <div className="w-[140px] h-[140px] rounded-xl bg-[#E9ECEA] flex-shrink-0" />
        {/* Detail info */}
        <div className="flex-1 space-y-2.5 w-full">
          <div className="w-24 h-5 rounded-full bg-[#E8F4F0]" />
          <div className="w-3/4 h-5 rounded bg-[#E9ECEA]" />
          <div className="w-1/2 h-3.5 rounded bg-[#F7F8F7]" />
          <div className="pt-2 flex items-center gap-2">
            <div className="w-28 h-8 rounded-xl bg-[#E9ECEA]" />
          </div>
        </div>
      </div>
      {/* Action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="h-10 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA]" />
        <div className="h-10 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA]" />
        <div className="h-10 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA]" />
      </div>
    </div>
  );
};
