"use client";

import React from "react";
import { MapPin, ShoppingBag, Layers, History, Loader2 } from "lucide-react";
import type { OrderStatus } from "../../../../docs/contracts/types";

export type QueueViewType = "queue" | "history" | "exceptions";
export type OrderTypeFilter = "all" | "dine_in" | "takeaway";
export type OrderStatusFilter = "all" | OrderStatus;

export interface OrderFiltersProps {
  view: QueueViewType;
  onViewChange: (view: QueueViewType) => void;
  typeFilter: OrderTypeFilter;
  onTypeChange: (type: OrderTypeFilter) => void;
  statusFilter: OrderStatusFilter;
  onStatusChange: (status: OrderStatusFilter) => void;
  totalOrders: number;
  exceptionCount?: number;
  isLoading?: boolean;
  className?: string;
}

/**
 * OrderFilters — Bộ lọc danh sách đơn hàng cho Chủ quán (P3-G02).
 * - Nhóm 1: Chế độ xem: Hàng đợi (đang xử lý) vs Lịch sử (đã xong/hủy) vs Ngoại lệ (cần đối soát)
 * - Nhóm 2: Loại đơn: Tất cả | Tại bàn | Mang đi
 * - Nhóm 3: Trạng thái đơn (tương thích với view đang chọn theo API contract)
 * - Hiệu ứng loading động khi gọi API chuyển tab/bộ lọc.
 */
export const OrderFilters: React.FC<OrderFiltersProps> = ({
  view,
  onViewChange,
  typeFilter,
  onTypeChange,
  statusFilter,
  onStatusChange,
  totalOrders,
  exceptionCount = 0,
  isLoading = false,
  className = "",
}) => {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Hàng 1: Chế độ xem & Loại đơn */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Nhóm Hàng đợi vs Lịch sử vs Ngoại lệ */}
        <div className="flex items-center p-1 bg-[#F1F3F2] rounded-xl border border-[#E9ECEA] text-xs font-semibold">
          <button
            type="button"
            disabled={isLoading && view === "queue"}
            onClick={() => {
              if (view === "queue" && statusFilter === "all") return;
              onViewChange("queue");
              onStatusChange("all");
            }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors focus:outline-none ${
              view === "queue"
                ? "bg-white text-[#1D725E] shadow-xs"
                : "text-[#727B77] hover:text-[#1D2522]"
            } ${isLoading && view === "queue" ? "cursor-wait" : ""}`}
          >
            {isLoading && view === "queue" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1D725E]" />
            ) : (
              <Layers className="w-3.5 h-3.5" />
            )}
            <span>Hàng đợi</span>
          </button>

          <button
            type="button"
            disabled={isLoading && view === "history"}
            onClick={() => {
              if (view === "history" && statusFilter === "all") return;
              onViewChange("history");
              onStatusChange("all");
            }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors focus:outline-none ${
              view === "history"
                ? "bg-white text-[#1D725E] shadow-xs"
                : "text-[#727B77] hover:text-[#1D2522]"
            } ${isLoading && view === "history" ? "cursor-wait" : ""}`}
          >
            {isLoading && view === "history" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1D725E]" />
            ) : (
              <History className="w-3.5 h-3.5" />
            )}
            <span>Lịch sử</span>
          </button>

          <button
            type="button"
            disabled={isLoading && view === "exceptions"}
            onClick={() => {
              if (view === "exceptions" && statusFilter === "all") return;
              onViewChange("exceptions");
              onStatusChange("all");
            }}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors focus:outline-none ${
              view === "exceptions"
                ? "bg-white text-[#D92D20] shadow-xs"
                : "text-[#727B77] hover:text-[#1D2522]"
            } ${isLoading && view === "exceptions" ? "cursor-wait" : ""}`}
          >
            {isLoading && view === "exceptions" && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D92D20]" />
            )}
            <span>Thanh toán</span>
            {exceptionCount > 0 && !(isLoading && view === "exceptions") && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#FEF3F2] text-[#D92D20] text-[10px] font-extrabold border border-[#FECDCA]">
                {exceptionCount}
              </span>
            )}
          </button>
        </div>

        {/* Nhóm Loại đơn: Tất cả / Tại bàn / Mang đi */}
        <div className="flex items-center p-1 bg-[#F7F8F7] rounded-xl border border-[#E9ECEA] text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            disabled={isLoading && typeFilter === "all"}
            onClick={() => onTypeChange("all")}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap focus:outline-none ${
              typeFilter === "all"
                ? "bg-white text-[#1D2522] shadow-xs"
                : "text-[#727B77] hover:text-[#1D2522]"
            } ${isLoading && typeFilter === "all" ? "cursor-wait" : ""}`}
          >
            {isLoading && typeFilter === "all" ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-[#1D2522]" />
                <span>Tất cả</span>
              </>
            ) : (
              <span>Tất cả ({totalOrders})</span>
            )}
          </button>

          <button
            type="button"
            disabled={isLoading && typeFilter === "dine_in"}
            onClick={() => onTypeChange("dine_in")}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap focus:outline-none ${
              typeFilter === "dine_in"
                ? "bg-white text-[#1D725E] shadow-xs"
                : "text-[#727B77] hover:text-[#1D2522]"
            } ${isLoading && typeFilter === "dine_in" ? "cursor-wait" : ""}`}
          >
            {isLoading && typeFilter === "dine_in" ? (
              <Loader2 className="w-3 h-3 animate-spin text-[#1D725E]" />
            ) : (
              <MapPin className="w-3 h-3 text-[#1D725E]" />
            )}
            <span>Tại bàn</span>
          </button>

          <button
            type="button"
            disabled={isLoading && typeFilter === "takeaway"}
            onClick={() => onTypeChange("takeaway")}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap focus:outline-none ${
              typeFilter === "takeaway"
                ? "bg-white text-[#55605C] shadow-xs"
                : "text-[#727B77] hover:text-[#1D2522]"
            } ${isLoading && typeFilter === "takeaway" ? "cursor-wait" : ""}`}
          >
            {isLoading && typeFilter === "takeaway" ? (
              <Loader2 className="w-3 h-3 animate-spin text-[#55605C]" />
            ) : (
              <ShoppingBag className="w-3 h-3" />
            )}
            <span>Mang đi</span>
          </button>
        </div>
      </div>

      {/* Hàng 2: Trạng thái đơn (Pill tags) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold text-[#727B77]">
        <button
          type="button"
          disabled={isLoading && statusFilter === "all"}
          onClick={() => onStatusChange("all")}
          className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1.5 focus:outline-none ${
            statusFilter === "all"
              ? "bg-[#1D725E] text-white border-[#1D725E]"
              : "bg-white text-[#727B77] border-[#E9ECEA] hover:border-[#C6E7DC]"
          } ${isLoading && statusFilter === "all" ? "cursor-wait" : ""}`}
        >
          {isLoading && statusFilter === "all" && (
            <Loader2 className="w-3 h-3 animate-spin text-white" />
          )}
          <span>Tất cả trạng thái</span>
        </button>

        {view === "queue" ? (
          <>
            <button
              type="button"
              disabled={isLoading && statusFilter === "accepted"}
              onClick={() => onStatusChange("accepted")}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1.5 focus:outline-none ${
                statusFilter === "accepted"
                  ? "bg-[#1D725E] text-white border-[#1D725E]"
                  : "bg-white text-[#55605C] border-[#E9ECEA] hover:border-[#C6E7DC]"
              } ${isLoading && statusFilter === "accepted" ? "cursor-wait" : ""}`}
            >
              {isLoading && statusFilter === "accepted" && (
                <Loader2 className="w-3 h-3 animate-spin text-white" />
              )}
              <span>Chờ làm</span>
            </button>
            <button
              type="button"
              disabled={isLoading && statusFilter === "preparing"}
              onClick={() => onStatusChange("preparing")}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1.5 focus:outline-none ${
                statusFilter === "preparing"
                  ? "bg-[#1D528A] text-white border-[#1D528A]"
                  : "bg-white text-[#1D528A] border-[#D0E2F7] hover:bg-[#EBF3FB]"
              } ${isLoading && statusFilter === "preparing" ? "cursor-wait" : ""}`}
            >
              {isLoading && statusFilter === "preparing" && (
                <Loader2 className="w-3 h-3 animate-spin text-white" />
              )}
              <span>Đang làm</span>
            </button>
            <button
              type="button"
              disabled={isLoading && statusFilter === "ready"}
              onClick={() => onStatusChange("ready")}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1.5 focus:outline-none ${
                statusFilter === "ready"
                  ? "bg-[#165B4B] text-white border-[#165B4B]"
                  : "bg-white text-[#165B4B] border-[#C6E7DC] hover:bg-[#E8F4F0]"
              } ${isLoading && statusFilter === "ready" ? "cursor-wait" : ""}`}
            >
              {isLoading && statusFilter === "ready" && (
                <Loader2 className="w-3 h-3 animate-spin text-white" />
              )}
              <span>Sẵn sàng</span>
            </button>
          </>
        ) : view === "history" ? (
          <>
            <button
              type="button"
              disabled={isLoading && statusFilter === "completed"}
              onClick={() => onStatusChange("completed")}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1.5 focus:outline-none ${
                statusFilter === "completed"
                  ? "bg-[#1D725E] text-white border-[#1D725E]"
                  : "bg-white text-[#1D725E] border-[#C6E7DC] hover:bg-[#E8F4F0]"
              } ${isLoading && statusFilter === "completed" ? "cursor-wait" : ""}`}
            >
              {isLoading && statusFilter === "completed" && (
                <Loader2 className="w-3 h-3 animate-spin text-white" />
              )}
              <span>Đã phục vụ</span>
            </button>
            <button
              type="button"
              disabled={isLoading && statusFilter === "cancelled"}
              onClick={() => onStatusChange("cancelled")}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1.5 focus:outline-none ${
                statusFilter === "cancelled"
                  ? "bg-[#D92D20] text-white border-[#D92D20]"
                  : "bg-white text-[#D92D20] border-[#FECDCA] hover:bg-[#FEF3F2]"
              } ${isLoading && statusFilter === "cancelled" ? "cursor-wait" : ""}`}
            >
              {isLoading && statusFilter === "cancelled" && (
                <Loader2 className="w-3 h-3 animate-spin text-white" />
              )}
              <span>Đã hủy</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isLoading && statusFilter === "payment_exception"}
              onClick={() => onStatusChange("payment_exception")}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1.5 focus:outline-none ${
                statusFilter === "payment_exception"
                  ? "bg-[#D92D20] text-white border-[#D92D20]"
                  : "bg-white text-[#D92D20] border-[#FECDCA] hover:bg-[#FEF3F2]"
              } ${isLoading && statusFilter === "payment_exception" ? "cursor-wait" : ""}`}
            >
              {isLoading && statusFilter === "payment_exception" && (
                <Loader2 className="w-3 h-3 animate-spin text-white" />
              )}
              <span>Cần đối soát</span>
            </button>
            <button
              type="button"
              disabled={isLoading && statusFilter === "pending_payment"}
              onClick={() => onStatusChange("pending_payment")}
              className={`px-3 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1.5 focus:outline-none ${
                statusFilter === "pending_payment"
                  ? "bg-[#A76200] text-white border-[#A76200]"
                  : "bg-white text-[#A76200] border-[#FDE68A] hover:bg-[#FEF3C7]"
              } ${isLoading && statusFilter === "pending_payment" ? "cursor-wait" : ""}`}
            >
              {isLoading && statusFilter === "pending_payment" && (
                <Loader2 className="w-3 h-3 animate-spin text-white" />
              )}
              <span>Chờ thanh toán</span>
            </button>
          </>
        )}
      </div>

      {/* Thanh tiến trình loading khi call API */}
      <div className="h-0.5 w-full bg-[#E9ECEA]/60 rounded-full overflow-hidden">
        {isLoading && (
          <div className="h-full w-2/5 bg-[#1D725E] rounded-full animate-indeterminate-bar" />
        )}
      </div>
    </div>
  );
};
