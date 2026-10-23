'use client';

import React from 'react';
import { MapPin, ShoppingBag, Layers, History } from 'lucide-react';
import type { OrderStatus } from '../../../../docs/contracts/types';

export type QueueViewType = 'queue' | 'history';
export type OrderTypeFilter = 'all' | 'dine_in' | 'takeaway';
export type OrderStatusFilter = 'all' | OrderStatus;

export interface OrderFiltersProps {
  view: QueueViewType;
  onViewChange: (view: QueueViewType) => void;
  typeFilter: OrderTypeFilter;
  onTypeChange: (type: OrderTypeFilter) => void;
  statusFilter: OrderStatusFilter;
  onStatusChange: (status: OrderStatusFilter) => void;
  totalOrders: number;
  className?: string;
}

/**
 * OrderFilters — Bộ lọc danh sách đơn hàng cho Chủ quán (P3-G02).
 * - Nhóm 1: Chế độ xem: Hàng đợi (đang xử lý) vs Lịch sử (đã xong/hủy)
 * - Nhóm 2: Loại đơn: Tất cả | Tại bàn | Mang đi
 * - Nhóm 3: Trạng thái đơn (tương thích với view đang chọn theo API contract)
 */
export const OrderFilters: React.FC<OrderFiltersProps> = ({
  view,
  onViewChange,
  typeFilter,
  onTypeChange,
  statusFilter,
  onStatusChange,
  totalOrders,
  className = '',
}) => {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Hàng 1: Chế độ xem & Loại đơn */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Nhóm Hàng đợi vs Lịch sử */}
        <div className="flex items-center p-1 bg-[#F1F3F2] rounded-xl border border-[#E9ECEA] text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              onViewChange('queue');
              onStatusChange('all');
            }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors focus:outline-none ${
              view === 'queue'
                ? 'bg-white text-[#1D725E] shadow-xs'
                : 'text-[#727B77] hover:text-[#1D2522]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Hàng đợi</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onViewChange('history');
              onStatusChange('all');
            }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors focus:outline-none ${
              view === 'history'
                ? 'bg-white text-[#1D725E] shadow-xs'
                : 'text-[#727B77] hover:text-[#1D2522]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Lịch sử</span>
          </button>
        </div>

        {/* Nhóm Loại đơn: Tất cả / Tại bàn / Mang đi */}
        <div className="flex items-center p-1 bg-[#F7F8F7] rounded-xl border border-[#E9ECEA] text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => onTypeChange('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus:outline-none ${
              typeFilter === 'all'
                ? 'bg-white text-[#1D2522] shadow-xs'
                : 'text-[#727B77] hover:text-[#1D2522]'
            }`}
          >
            Tất cả ({totalOrders})
          </button>

          <button
            type="button"
            onClick={() => onTypeChange('dine_in')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap focus:outline-none ${
              typeFilter === 'dine_in'
                ? 'bg-white text-[#1D725E] shadow-xs'
                : 'text-[#727B77] hover:text-[#1D2522]'
            }`}
          >
            <MapPin className="w-3 h-3 text-[#1D725E]" />
            <span>Tại bàn</span>
          </button>

          <button
            type="button"
            onClick={() => onTypeChange('takeaway')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap focus:outline-none ${
              typeFilter === 'takeaway'
                ? 'bg-white text-[#55605C] shadow-xs'
                : 'text-[#727B77] hover:text-[#1D2522]'
            }`}
          >
            <ShoppingBag className="w-3 h-3" />
            <span>Mang đi</span>
          </button>
        </div>
      </div>

      {/* Hàng 2: Trạng thái đơn (Pill tags) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold text-[#727B77]">
        <button
          type="button"
          onClick={() => onStatusChange('all')}
          className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap focus:outline-none ${
            statusFilter === 'all'
              ? 'bg-[#1D725E] text-white border-[#1D725E]'
              : 'bg-white text-[#727B77] border-[#E9ECEA] hover:border-[#C6E7DC]'
          }`}
        >
          Tất cả trạng thái
        </button>

        {view === 'queue' ? (
          <>
            <button
              type="button"
              onClick={() => onStatusChange('accepted')}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap focus:outline-none ${
                statusFilter === 'accepted'
                  ? 'bg-[#1D725E] text-white border-[#1D725E]'
                  : 'bg-white text-[#55605C] border-[#E9ECEA] hover:border-[#C6E7DC]'
              }`}
            >
              Chờ làm
            </button>
            <button
              type="button"
              onClick={() => onStatusChange('preparing')}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap focus:outline-none ${
                statusFilter === 'preparing'
                  ? 'bg-[#1D528A] text-white border-[#1D528A]'
                  : 'bg-white text-[#1D528A] border-[#D0E2F7] hover:bg-[#EBF3FB]'
              }`}
            >
              Đang làm
            </button>
            <button
              type="button"
              onClick={() => onStatusChange('ready')}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap focus:outline-none ${
                statusFilter === 'ready'
                  ? 'bg-[#165B4B] text-white border-[#165B4B]'
                  : 'bg-white text-[#165B4B] border-[#C6E7DC] hover:bg-[#E8F4F0]'
              }`}
            >
              Sẵn sàng
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onStatusChange('completed')}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap focus:outline-none ${
                statusFilter === 'completed'
                  ? 'bg-[#1D725E] text-white border-[#1D725E]'
                  : 'bg-white text-[#1D725E] border-[#C6E7DC] hover:bg-[#E8F4F0]'
              }`}
            >
              Đã phục vụ
            </button>
            <button
              type="button"
              onClick={() => onStatusChange('cancelled')}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap focus:outline-none ${
                statusFilter === 'cancelled'
                  ? 'bg-[#D92D20] text-white border-[#D92D20]'
                  : 'bg-white text-[#D92D20] border-[#FECDCA] hover:bg-[#FEF3F2]'
              }`}
            >
              Đã hủy
            </button>
          </>
        )}
      </div>
    </div>
  );
};
