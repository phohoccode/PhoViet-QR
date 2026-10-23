'use client';

import React from 'react';
import { RefreshCw, Clock } from 'lucide-react';

export interface QueueHeaderProps {
  counts: {
    accepted: number;
    preparing: number;
    ready: number;
    paymentException: number;
  };
  lastUpdated: Date | null;
  isLoading: boolean;
  onRefresh: () => void;
  className?: string;
}

/**
 * QueueHeader — Header thanh điều khiển cho Tab Đơn hàng (P3-G02).
 * - Hiển thị tiêu đề "Đơn hàng" và quy trình FIFO
 * - Các huy hiệu số đếm trạng thái: Chờ / Đang làm / Sẵn sàng (từ counts API)
 * - Nút Làm mới và trạng thái "Cập nhật lúc ..."
 */
export const QueueHeader: React.FC<QueueHeaderProps> = ({
  counts,
  lastUpdated,
  isLoading,
  onRefresh,
  className = '',
}) => {
  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E9ECEA] ${className}`}
    >
      {/* Khối tiêu đề và số đếm */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#1D2522] leading-tight">
            Đơn hàng
          </h2>
          <p className="text-[11px] text-[#727B77] mt-0.5">
            Quy trình chế biến công bằng (FIFO)
          </p>
        </div>

        {/* Nhóm huy hiệu số đếm toàn quán */}
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span
            className="px-2.5 py-1 rounded-lg bg-[#F1F3F2] text-[#55605C] border border-[#E9ECEA]"
            title="Đơn đang chờ làm"
          >
            Chờ: <strong className="text-[#1D2522]">{counts.accepted}</strong>
          </span>
          <span
            className="px-2.5 py-1 rounded-lg bg-[#EBF3FB] text-[#1D528A] border border-[#D0E2F7]"
            title="Đơn đang được chế biến"
          >
            Đang làm: <strong>{counts.preparing}</strong>
          </span>
          <span
            className="px-2.5 py-1 rounded-lg bg-[#E8F4F0] text-[#165B4B] border border-[#C6E7DC]"
            title="Đơn đã sẵn sàng phục vụ"
          >
            Sẵn sàng: <strong>{counts.ready}</strong>
          </span>
        </div>
      </div>

      {/* Khối làm mới & thời gian cập nhật */}
      <div className="flex items-center gap-2.5 text-xs text-[#727B77]">
        {formattedTime && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#727B77]">
            <Clock className="w-3 h-3" />
            <span>Cập nhật lúc {formattedTime}</span>
          </span>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-9 px-3 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] active:scale-95 text-xs font-semibold text-[#1D725E] flex items-center gap-1.5 border border-[#E9ECEA] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-50"
          aria-label="Làm mới danh sách đơn hàng"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
        </button>
      </div>
    </div>
  );
};
