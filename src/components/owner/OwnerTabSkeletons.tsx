'use client';

import React from 'react';

/**
 * OrdersQueueSkeleton — Khung xương tải hàng đợi đơn hàng
 */
export const OrdersQueueSkeleton: React.FC = () => {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Đang tải danh sách đơn hàng..."
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-4 rounded-2xl border border-[#E9ECEA] bg-white space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-16 h-5 rounded bg-[#E9ECEA]" />
              <div className="w-14 h-4 rounded bg-[#E9ECEA]" />
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
 * TablesGridSkeleton — Khung xương tải sơ đồ bàn
 */
export const TablesGridSkeleton: React.FC = () => {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 animate-pulse pt-2"
      role="status"
      aria-busy="true"
      aria-label="Đang tải sơ đồ bàn..."
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="p-4 rounded-2xl border border-[#E9ECEA] bg-white text-center space-y-2"
        >
          <div className="w-14 h-4 rounded bg-[#E9ECEA] mx-auto" />
          <div className="w-12 h-3.5 rounded-full bg-[#F7F8F7] mx-auto" />
          <div className="w-16 h-4 rounded bg-[#E9ECEA] mx-auto mt-2" />
        </div>
      ))}
    </div>
  );
};

/**
 * MenuGridSkeleton — Khung xương tải thực đơn quán
 */
export const MenuGridSkeleton: React.FC = () => {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse pt-2"
      role="status"
      aria-busy="true"
      aria-label="Đang tải danh mục món..."
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="p-3 bg-white rounded-2xl border border-[#E9ECEA] flex items-center justify-between gap-3"
        >
          <div className="space-y-1.5 flex-1">
            <div className="w-2/3 h-4 rounded bg-[#E9ECEA]" />
            <div className="w-1/3 h-3.5 rounded bg-[#F7F8F7]" />
          </div>
          <div className="w-16 h-5 rounded-full bg-[#E9ECEA]" />
        </div>
      ))}
    </div>
  );
};
