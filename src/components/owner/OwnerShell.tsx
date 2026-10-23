'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Play, Plus, QrCode, RefreshCw, Loader2, KeyRound, ExternalLink } from 'lucide-react';
import type {
  OrderDetail,
  TableSummary,
  MenuItem,
  QRCodeView,
  OwnerSessionOpenedView,
} from '../../../docs/contracts/types';
import { OwnerHeader } from './OwnerHeader';
import { type OwnerTabType } from './OwnerHeaderPills';
import { OrderCardPreview } from './OrderCardPreview';
import { OrderDetailPreview } from './OrderDetailPreview';
import { OrderDetailSheet } from './OrderDetailSheet';
import { OwnerEmptyState } from './OwnerEmptyState';
import { OwnerErrorState } from './OwnerErrorState';
import { TableSessionOpenedDialog, TableDetailDialog } from './TableSessionDialog';
import {
  OrdersQueueSkeleton,
  TablesGridSkeleton,
  MenuGridSkeleton,
} from './OwnerTabSkeletons';

export type OwnerTabState = 'ready' | 'loading' | 'empty' | 'error';

export interface OwnerShellProps {
  storeName: string;
  orders: OrderDetail[];
  tables?: TableSummary[];
  menuItems?: MenuItem[];
  initialTab?: OwnerTabType;
  ownerName?: string;
  roleLabel?: string;
  isLoggingOut?: boolean;
  logoutError?: string | null;
  ordersState?: OwnerTabState;
  tablesState?: OwnerTabState;
  menuState?: OwnerTabState;
  onRetryOrders?: () => void;
  onRetryTables?: () => void;
  onRetryMenu?: () => void;
  onClaimNext?: () => void;
  onLogout?: () => void;
  logoutAction?: () => void | Promise<void>;
  className?: string;
}

/**
 * OwnerShell — Khung giao diện toàn diện cho Dashboard Chủ quán (Desktop & Responsive).
 * Phong cách: Minimal Emerald POS (khớp assets/ui-reference.png)
 * - Vỏ trang xám nhạt #F5F6F5
 * - Khung nổi nền trắng bo góc lớn 24px-28px (rounded-[24px] md:rounded-[28px])
 * - Phân chia 70/30 trên desktop, tự co về 1 cột trên tablet/mobile
 * - Chi tiết đơn hàng trên mobile hiển thị dạng Sheet/Dialog
 * - Đầy đủ 4 Tab: Đơn hàng, Bàn, Menu, Cài đặt với các trạng thái loading/empty/error.
 */
export const OwnerShell: React.FC<OwnerShellProps> = ({
  storeName,
  orders,
  tables = [],
  menuItems = [],
  initialTab = 'orders',
  ownerName,
  roleLabel,
  isLoggingOut = false,
  logoutError = null,
  ordersState = 'ready',
  tablesState = 'ready',
  menuState = 'ready',
  onRetryOrders,
  onRetryTables,
  onRetryMenu,
  onClaimNext,
  onLogout,
  logoutAction,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<OwnerTabType>(initialTab);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(
    orders[0] || null
  );
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState<boolean>(false);
  const [orderFilter, setOrderFilter] = useState<'all' | 'dine_in' | 'takeaway'>('all');
  const [isClaiming, setIsClaiming] = useState<boolean>(false);

  // =========================================================================
  // KẾT NỐI API THỰC TẾ CHO TAB BÀN (R11 GET /api/owner/tables & R17 GET /api/owner/qr-codes)
  // =========================================================================
  const [tablesList, setTablesList] = useState<TableSummary[]>(tables);
  const [qrCodesList, setQrCodesList] = useState<QRCodeView[]>([]);
  const [currentTablesState, setCurrentTablesState] = useState<OwnerTabState>(tablesState);
  const [tablesErrorMessage, setTablesErrorMessage] = useState<string | null>(null);
  const [isFetchingTables, setIsFetchingTables] = useState<boolean>(false);

  // Quản lý mở phiên bàn (R12 POST /api/owner/tables/:id/sessions)
  const [openingTableId, setOpeningTableId] = useState<string | null>(null);
  const [openedSessionView, setOpenedSessionView] = useState<OwnerSessionOpenedView | null>(null);
  const [selectedTableForDetail, setSelectedTableForDetail] = useState<TableSummary | null>(null);
  const [openSessionError, setOpenSessionError] = useState<{ tableId: string; message: string } | null>(null);

  // Nạp danh sách bàn từ R11 và danh sách QR từ R17 (Dùng khi user bấm "Làm mới" hoặc "Thử lại")
  const fetchTablesAndQRs = useCallback(async () => {
    setIsFetchingTables(true);
    setTablesErrorMessage(null);
    setOpenSessionError(null);
    onRetryTables?.();

    try {
      const [tablesRes, qrRes] = await Promise.all([
        fetch('/api/owner/tables', {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        }),
        fetch('/api/owner/qr-codes', {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        }),
      ]);

      let hasTablesData = false;

      if (tablesRes.ok) {
        const tablesJson = await tablesRes.json();
        if (tablesJson?.data?.tables) {
          setTablesList(tablesJson.data.tables);
          hasTablesData = true;
        }
      }

      if (qrRes.ok) {
        const qrJson = await qrRes.json();
        if (qrJson?.data) {
          setQrCodesList(qrJson.data);
        }
      }

      if (hasTablesData) {
        setCurrentTablesState('ready');
        setIsFetchingTables(false);
        return;
      }

      // Xử lý lỗi từ server
      let errMessage = 'Không thể tải sơ đồ bàn từ máy chủ.';
      try {
        const errJson = await tablesRes.json();
        if (errJson?.error?.message) {
          errMessage = errJson.error.message;
        }
      } catch {
        // Non-JSON
      }

      // Nếu ở dev mode và chưa đăng nhập Supabase, fallback sang fixtures
      if (process.env.NODE_ENV !== 'production' && tables.length > 0) {
        setTablesList(tables);
        setCurrentTablesState('ready');
        setIsFetchingTables(false);
        return;
      }

      setTablesErrorMessage(errMessage);
      setCurrentTablesState('error');
    } catch {
      if (process.env.NODE_ENV !== 'production' && tables.length > 0) {
        setTablesList(tables);
        setCurrentTablesState('ready');
        setIsFetchingTables(false);
        return;
      }
      setTablesErrorMessage('Lỗi mạng khi kết nối tới dịch vụ quản lý bàn.');
      setCurrentTablesState('error');
    } finally {
      setIsFetchingTables(false);
    }
  }, [tables, onRetryTables]);

  // Tự động tải dữ liệu khi chuyển sang tab bàn không gây cascading render
  useEffect(() => {
    if (activeTab !== 'tables') return;

    let isCancelled = false;

    (async () => {
      try {
        const [tablesRes, qrRes] = await Promise.all([
          fetch('/api/owner/tables', {
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          }),
          fetch('/api/owner/qr-codes', {
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          }),
        ]);

        if (isCancelled) return;

        let hasData = false;
        if (tablesRes.ok) {
          const tablesJson = await tablesRes.json();
          if (tablesJson?.data?.tables) {
            setTablesList(tablesJson.data.tables);
            hasData = true;
          }
        }

        if (qrRes.ok) {
          const qrJson = await qrRes.json();
          if (qrJson?.data) {
            setQrCodesList(qrJson.data);
          }
        }

        if (hasData) {
          setCurrentTablesState('ready');
          return;
        }

        let errMessage = 'Không thể tải sơ đồ bàn từ máy chủ.';
        try {
          const errJson = await tablesRes.json();
          if (errJson?.error?.message) {
            errMessage = errJson.error.message;
          }
        } catch {
          // Non-JSON
        }

        if (process.env.NODE_ENV !== 'production' && tables.length > 0) {
          setTablesList(tables);
          setCurrentTablesState('ready');
          return;
        }

        setTablesErrorMessage(errMessage);
        setCurrentTablesState('error');
      } catch {
        if (isCancelled) return;
        if (process.env.NODE_ENV !== 'production' && tables.length > 0) {
          setTablesList(tables);
          setCurrentTablesState('ready');
          return;
        }
        setTablesErrorMessage('Lỗi mạng khi kết nối tới dịch vụ quản lý bàn.');
        setCurrentTablesState('error');
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [activeTab, tables]);

  // Gọi R12 POST /api/owner/tables/:id/sessions để mở phiên bàn mới
  const handleOpenTableSession = async (table: TableSummary) => {
    setOpeningTableId(table.id);
    setOpenSessionError(null);

    // Sinh UUID duy nhất cho command request
    const requestId = crypto.randomUUID();

    try {
      const res = await fetch(`/api/owner/tables/${table.id}/sessions`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
      });

      if (res.status === 201) {
        const json = await res.json();
        const opened: OwnerSessionOpenedView = json.data;

        // Cập nhật trạng thái bàn trong tablesList
        setTablesList((prev) =>
          prev.map((item) =>
            item.id === table.id
              ? { ...item, session: opened.session }
              : item
          )
        );

        // Chỉ hiển thị mã từ phản hồi private của command này
        setOpenedSessionView(opened);
        setOpeningTableId(null);
        return;
      }

      let errorMsg = 'Không thể mở phiên bàn.';
      try {
        const errJson = await res.json();
        errorMsg = errJson?.error?.message || errorMsg;
      } catch {
        // Non-JSON
      }

      if (res.status === 409) {
        errorMsg = 'Bàn đã có phiên đang hoạt động hoặc trùng lặp yêu cầu. Đang tải lại sơ đồ bàn...';
        fetchTablesAndQRs();
      }

      setOpenSessionError({ tableId: table.id, message: errorMsg });
    } catch {
      setOpenSessionError({
        tableId: table.id,
        message: 'Lỗi mạng khi gửi lệnh mở phiên bàn. Vui lòng thử lại.',
      });
    } finally {
      setOpeningTableId(null);
    }
  };

  // Lọc đơn hàng theo loại
  const filteredOrders = orders.filter((o) => {
    if (orderFilter === 'all') return true;
    return o.type === orderFilter;
  });

  // Đếm nhanh trạng thái đơn
  const waitingCount = orders.filter((o) => o.status === 'accepted').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;

  // Giả lập tương tác nhận đơn FIFO (Preview Interaction)
  const handleClaimNextClick = () => {
    setIsClaiming(true);
    setTimeout(() => {
      setIsClaiming(false);
      onClaimNext?.();
    }, 400);
  };

  // Khi chọn một đơn hàng (hỗ trợ mobile Sheet và desktop right panel)
  const handleSelectOrder = (order: OrderDetail) => {
    setSelectedOrder(order);
    setIsMobileSheetOpen(true);
  };

  return (
    <div className={`min-h-screen bg-[#F5F6F5] p-2 sm:p-4 md:p-6 text-[#1D2522] ${className}`}>
      {/* =====================================================================
          SHELL CONTAINER: Panel trắng bo tròn nổi trên nền xám nhạt
         ===================================================================== */}
      <div className="max-w-[1440px] mx-auto bg-white rounded-[20px] sm:rounded-[24px] md:rounded-[28px] border border-[#E9ECEA] shadow-shell overflow-hidden min-h-[92vh] flex flex-col">
        {/* 1. Header chuẩn ảnh tham chiếu */}
        <OwnerHeader
          storeName={storeName}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ownerName={ownerName}
          roleLabel={roleLabel}
          isLoggingOut={isLoggingOut}
          logoutError={logoutError}
          onLogout={onLogout}
          logoutAction={logoutAction}
        />

        {/* 2. Nội dung 4 Tab */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 bg-white overflow-hidden flex flex-col">
          {/* =================================================================
              TAB 1: ĐƠN HÀNG (Default - Bố cục 70/30 trên Desktop)
             ================================================================= */}
          {activeTab === 'orders' && (
            <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full">
              {/* CỘT TRÁI: Hàng đợi đơn hàng (~70% trên desktop, 100% trên mobile/tablet) */}
              <section className="flex-1 lg:w-[68%] flex flex-col gap-4">
                {/* Thanh điều khiển: Bộ lọc & KPI */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#E9ECEA]">
                  <div className="flex items-center gap-1.5 p-1 bg-[#F7F8F7] rounded-xl border border-[#E9ECEA] text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setOrderFilter('all')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        orderFilter === 'all'
                          ? 'bg-white text-[#1D2522] shadow-sm'
                          : 'text-[#727B77] hover:text-[#1D2522]'
                      }`}
                    >
                      Tất cả ({orders.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderFilter('dine_in')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        orderFilter === 'dine_in'
                          ? 'bg-white text-[#1D2522] shadow-sm'
                          : 'text-[#727B77] hover:text-[#1D2522]'
                      }`}
                    >
                      Tại bàn
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderFilter('takeaway')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        orderFilter === 'takeaway'
                          ? 'bg-white text-[#1D2522] shadow-sm'
                          : 'text-[#727B77] hover:text-[#1D2522]'
                      }`}
                    >
                      Mang đi
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-medium text-[#727B77]">
                    <span className="px-2.5 py-1 rounded-lg bg-[#F1F3F2] text-[#55605C]">
                      Chờ: <strong>{waitingCount}</strong>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#EBF3FB] text-[#1D528A]">
                      Đang làm: <strong>{preparingCount}</strong>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#E8F4F0] text-[#165B4B]">
                      Sẵn sàng: <strong>{readyCount}</strong>
                    </span>
                  </div>
                </div>

                {/* NÚT FIFO DUY NHẤT: Bắt đầu đơn tiếp theo theo đúng thứ tự */}
                <div className="bg-[#FAFBFB] p-3 rounded-2xl border border-[#E9ECEA] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-xs">
                    <p className="font-bold text-[#1D2522]">Quy trình chế biến công bằng (FIFO)</p>
                    <p className="text-[#727B77]">
                      Hệ thống tự động tiếp nhận đơn cũ nhất đang chờ làm.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={waitingCount === 0 || isClaiming}
                    onClick={handleClaimNextClick}
                    className={`w-full sm:w-auto h-11 px-5 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
                      waitingCount > 0
                        ? 'bg-[#1D725E] hover:bg-[#165B4B] text-white active:scale-95'
                        : 'bg-[#F1F3F2] text-[#A0A8A5] cursor-not-allowed'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                    <span>
                      {isClaiming
                        ? 'Đang nhận đơn...'
                        : waitingCount > 0
                        ? `Nhận đơn tiếp theo (${waitingCount})`
                        : 'Không có đơn chờ làm'}
                    </span>
                  </button>
                </div>

                {/* Xử lý các trạng thái của Tab Đơn hàng */}
                {ordersState === 'loading' && <OrdersQueueSkeleton />}

                {ordersState === 'error' && (
                  <OwnerErrorState
                    title="Không thể tải danh sách đơn hàng"
                    description="Có lỗi khi đồng bộ đơn từ hệ thống máy chủ."
                    onRetry={onRetryOrders}
                  />
                )}

                {ordersState === 'ready' && (
                  <div className="flex-1 overflow-y-auto pr-1">
                    {filteredOrders.length === 0 ? (
                      <OwnerEmptyState
                        title="Không có đơn hàng nào"
                        description="Hàng đợi hiện đang trống hoặc không có đơn phù hợp với bộ lọc."
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredOrders.map((order) => (
                          <OrderCardPreview
                            key={order.id}
                            order={order}
                            isSelected={selectedOrder?.id === order.id}
                            onSelect={() => handleSelectOrder(order)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* CỘT PHẢI: Khung chi tiết đơn hàng (~32% trên Desktop, ẩn trên mobile/tablet) */}
              <aside className="hidden lg:flex lg:w-[32%] flex-col min-h-[420px]">
                <OrderDetailPreview
                  order={selectedOrder}
                  onMarkReady={(id) => {
                    if (selectedOrder && selectedOrder.id === id) {
                      setSelectedOrder({
                        ...selectedOrder,
                        status: 'ready',
                        statusLabel: 'Sẵn sàng',
                        fulfillmentStatus: 'ready',
                      } as OrderDetail);
                    }
                  }}
                  onComplete={(id) => {
                    if (selectedOrder && selectedOrder.id === id) {
                      setSelectedOrder({
                        ...selectedOrder,
                        status: 'completed',
                        statusLabel: 'Đã giao',
                        fulfillmentStatus: selectedOrder.type === 'dine_in' ? 'served' : 'collected',
                      } as OrderDetail);
                    }
                  }}
                />
              </aside>

              {/* Sheet / Dialog chi tiết đơn cho Mobile & Tablet (< lg) */}
              <OrderDetailSheet
                order={selectedOrder}
                isOpen={isMobileSheetOpen}
                onClose={() => setIsMobileSheetOpen(false)}
                onMarkReady={(id) => {
                  if (selectedOrder && selectedOrder.id === id) {
                    setSelectedOrder({
                      ...selectedOrder,
                      status: 'ready',
                      statusLabel: 'Sẵn sàng',
                      fulfillmentStatus: 'ready',
                    } as OrderDetail);
                  }
                }}
                onComplete={(id) => {
                  if (selectedOrder && selectedOrder.id === id) {
                    setSelectedOrder({
                      ...selectedOrder,
                      status: 'completed',
                      statusLabel: 'Đã giao',
                      fulfillmentStatus: selectedOrder.type === 'dine_in' ? 'served' : 'collected',
                    } as OrderDetail);
                  }
                }}
              />
            </div>
          )}

          {/* =================================================================
              TAB 2: BÀN (Lưới trạng thái bàn kết nối R11/R12/R17)
             ================================================================= */}
          {activeTab === 'tables' && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-[#E9ECEA]">
                <div>
                  <h3 className="text-base font-bold text-[#1D2522]">Quản lý bàn phục vụ</h3>
                  <p className="text-xs text-[#727B77]">
                    Lưới trạng thái bàn trực quan kết nối R11 và mở phiên bàn R12.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchTablesAndQRs}
                    disabled={isFetchingTables}
                    className="h-8 px-3 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D2522] flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-[#35977D] ${
                        isFetchingTables ? 'animate-spin' : ''
                      }`}
                      aria-hidden="true"
                    />
                    <span>Làm mới</span>
                  </button>
                  <span className="text-xs font-semibold px-3 py-1 bg-[#E8F4F0] text-[#1D725E] rounded-full">
                    {tablesList.filter((t) => t.session !== null).length} / {tablesList.length} bàn đang dùng
                  </span>
                </div>
              </div>

              {openSessionError && (
                <div
                  role="alert"
                  className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl text-xs text-[#912018] flex items-center justify-between"
                >
                  <span>{openSessionError.message}</span>
                  <button
                    type="button"
                    onClick={() => setOpenSessionError(null)}
                    className="text-[#912018] font-bold hover:underline ml-2"
                  >
                    Đóng
                  </button>
                </div>
              )}

              {currentTablesState === 'loading' && <TablesGridSkeleton />}

              {currentTablesState === 'error' && (
                <OwnerErrorState
                  title="Không thể tải sơ đồ bàn"
                  description={tablesErrorMessage || "Có lỗi khi kết nối dữ liệu phiên bàn từ máy chủ."}
                  onRetry={fetchTablesAndQRs}
                />
              )}

              {currentTablesState === 'ready' && tablesList.length === 0 && (
                <OwnerEmptyState
                  title="Chưa có bàn nào được thiết lập"
                  description="Quán chưa tạo danh sách bàn phục vụ. Hãy liên hệ quản trị hệ thống."
                />
              )}

              {currentTablesState === 'ready' && tablesList.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
                    {tablesList.map((t) => {
                      const isOccupied = t.session !== null;
                      const matchedQr = qrCodesList.find(
                        (q) => q.type === 'table' && q.table?.id === t.id
                      );
                      const isOpening = openingTableId === t.id;

                      return (
                        <div
                          key={t.id}
                          className={`p-3.5 rounded-2xl border flex flex-col justify-between text-center transition-all ${
                            isOccupied
                              ? 'bg-[#E8F4F0]/60 border-[#35977D] shadow-xs'
                              : 'bg-white border-[#E9ECEA] hover:border-[#C6E7DC]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-sm font-bold text-[#1D2522] truncate block">
                                {t.label}
                              </span>
                              {matchedQr && (
                                <span
                                  title={`QR Path: ${matchedQr.path}`}
                                  className="text-[10px] font-mono text-[#727B77] bg-white/80 px-1 rounded border border-[#E9ECEA]"
                                >
                                  QR
                                </span>
                              )}
                            </div>

                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                isOccupied
                                  ? t.session?.status === 'checkout_pending'
                                    ? 'bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]'
                                    : 'bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]'
                                  : 'bg-[#F7F8F7] text-[#727B77] border border-[#E9ECEA]'
                              }`}
                            >
                              {isOccupied
                                ? t.session?.status === 'checkout_pending'
                                  ? 'Chờ tính tiền'
                                  : 'Có khách'
                                : 'Bàn trống'}
                            </span>

                            {t.session && (
                              <div className="mt-2 text-left bg-white/70 p-2 rounded-xl border border-[#C6E7DC]/60 text-xs">
                                <p className="font-bold text-[#1D2522]">
                                  {new Intl.NumberFormat('vi-VN').format(t.session.totalVnd)} đ
                                </p>
                                <p className="text-[11px] text-[#727B77]">
                                  {t.session.orderCount} đơn gọi
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 pt-2 border-t border-[#E9ECEA]/60">
                            {isOccupied ? (
                              <button
                                type="button"
                                onClick={() => setSelectedTableForDetail(t)}
                                className="w-full h-8 px-2 rounded-xl bg-white hover:bg-[#F7F8F7] border border-[#C6E7DC] text-[#1D725E] text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                              >
                                <span>Chi tiết phiên</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenTableSession(t)}
                                disabled={isOpening || !t.active}
                                className={`w-full h-8 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                                  isOpening
                                    ? 'bg-[#1D725E]/70 text-white cursor-not-allowed'
                                    : !t.active
                                    ? 'bg-[#F1F3F2] text-[#A0A8A5] cursor-not-allowed'
                                    : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-95 text-white'
                                }`}
                              >
                                {isOpening ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                    <span>Đang mở...</span>
                                  </>
                                ) : (
                                  <>
                                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>Mở phiên bàn</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Hiển thị QR Mang đi từ R17 nếu có */}
                  {qrCodesList.filter((q) => q.type === 'takeaway').length > 0 && (
                    <div className="mt-4 p-4 bg-[#F7F8F7] border border-[#E9ECEA] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white border border-[#E9ECEA] flex items-center justify-center text-[#1D725E] shadow-xs">
                          <QrCode className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[#1D2522]">
                            Mã QR Mang đi tại quầy (R17)
                          </h4>
                          <p className="text-xs text-[#727B77]">
                            Khách quét mã này để đặt mang đi không cần xác minh phiên bàn.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium bg-white px-2.5 py-1 rounded-lg border border-[#E9ECEA]">
                          {qrCodesList.find((q) => q.type === 'takeaway')?.path}
                        </span>
                        <a
                          href={qrCodesList.find((q) => q.type === 'takeaway')?.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-8 px-3 rounded-lg bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <span>Mở link</span>
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* =================================================================
              TAB 3: MENU (Quản lý món ăn)
             ================================================================= */}
          {activeTab === 'menu' && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-[#E9ECEA]">
                <div>
                  <h3 className="text-base font-bold text-[#1D2522]">Thực đơn quán</h3>
                  <p className="text-xs text-[#727B77]">
                    Bật / tắt nhanh trạng thái còn hàng hoặc sửa giá món ăn.
                  </p>
                </div>
                <button
                  type="button"
                  className="h-9 px-3.5 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>Thêm món mới (Phase 2)</span>
                </button>
              </div>

              {menuState === 'loading' && <MenuGridSkeleton />}

              {menuState === 'error' && (
                <OwnerErrorState
                  title="Không thể tải thực đơn quán"
                  description="Có lỗi khi nạp danh sách món ăn từ máy chủ."
                  onRetry={onRetryMenu}
                />
              )}

              {menuState === 'ready' && menuItems.length === 0 && (
                <OwnerEmptyState
                  title="Thực đơn hiện đang trống"
                  description="Quán chưa có món ăn nào trong thực đơn."
                />
              )}

              {menuState === 'ready' && menuItems.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {menuItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-white rounded-2xl border border-[#E9ECEA] flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1D2522] truncate">{item.name}</p>
                        <p className="text-xs text-[#727B77] mt-0.5">
                          {new Intl.NumberFormat('vi-VN').format(item.priceVnd)} đ
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 ${
                          item.available
                            ? 'bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]'
                            : 'bg-[#FEF3F2] text-[#912018] border border-[#FECDCA]'
                        }`}
                      >
                        {item.available ? 'Còn hàng' : 'Hết hàng'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =================================================================
              TAB 4: CÀI ĐẶT (Thiết lập quán & QR)
             ================================================================= */}
          {activeTab === 'settings' && (
            <div className="flex-1 max-w-2xl mx-auto w-full py-4 space-y-4">
              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs">
                <h4 className="text-sm font-bold text-[#1D2522] mb-1">
                  1. Trạng thái nhận đơn của quán
                </h4>
                <p className="text-xs text-[#727B77] mb-3">
                  Khi tạm ngừng, khách quét QR chỉ có thể xem menu mà không thể gửi đơn mới.
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#E8F4F0] text-[#1D725E] text-xs font-bold border border-[#C6E7DC]">
                  <span>🟢 Đang mở cửa nhận đơn</span>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs">
                <h4 className="text-sm font-bold text-[#1D2522] mb-1">
                  2. Quản lý mã QR bàn & quầy
                </h4>
                <p className="text-xs text-[#727B77] mb-3">
                  Tải file in chất lượng cao để dán tại từng bàn hoặc đặt tại quầy thu ngân.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-10 px-3.5 rounded-xl border border-[#E9ECEA] bg-[#F7F8F7] hover:bg-[#E8F4F0] text-xs font-semibold flex items-center gap-1.5 text-[#1D2522] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D]"
                  >
                    <QrCode className="w-4 h-4 text-[#35977D]" aria-hidden="true" />
                    <span>Tải QR mang đi tại quầy</span>
                  </button>
                  <button
                    type="button"
                    className="h-10 px-3.5 rounded-xl border border-[#E9ECEA] bg-[#F7F8F7] hover:bg-[#E8F4F0] text-xs font-semibold flex items-center gap-1.5 text-[#1D2522] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D]"
                  >
                    <QrCode className="w-4 h-4 text-[#35977D]" aria-hidden="true" />
                    <span>Tải trọn bộ QR bàn (PDF)</span>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs">
                <h4 className="text-sm font-bold text-[#1D2522] mb-1">
                  3. Cổng thanh toán VietQR
                </h4>
                <p className="text-xs text-[#727B77] mb-2">
                  Trạng thái tích hợp tự động qua Webhook (không hiển thị secret keys).
                </p>
                <span className="text-xs text-[#165B4B] font-semibold bg-[#E8F4F0] border border-[#C6E7DC] px-2.5 py-1 rounded-lg inline-block">
                  🟢 Webhook đang hoạt động ổn định
                </span>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* =====================================================================
          MODAL DIALOGS CHO TAB BÀN (R12 Private Result & Detail View)
         ===================================================================== */}
      {openedSessionView && (
        <TableSessionOpenedDialog
          openedView={openedSessionView}
          qrCode={qrCodesList.find(
            (q) => q.type === 'table' && q.table?.id === openedSessionView.table.id
          )}
          onClose={() => setOpenedSessionView(null)}
        />
      )}

      {selectedTableForDetail && (
        <TableDetailDialog
          table={selectedTableForDetail}
          qrCode={qrCodesList.find(
            (q) => q.type === 'table' && q.table?.id === selectedTableForDetail.id
          )}
          onClose={() => setSelectedTableForDetail(null)}
        />
      )}
    </div>
  );
};
