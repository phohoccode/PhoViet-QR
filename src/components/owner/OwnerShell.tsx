'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Play } from 'lucide-react';
import type {
  OrderDetail,
  TableSummary,
  MenuItem,
} from '../../../docs/contracts/types';
import type { OwnerTable, OwnerQrCode } from '@/types/contracts/table-qr';
import { OwnerHeader } from './OwnerHeader';
import { type OwnerTabType } from './OwnerHeaderPills';
import { OrderCardPreview } from './OrderCardPreview';
import { OrderDetailPreview } from './OrderDetailPreview';
import { OrderDetailSheet } from './OrderDetailSheet';
import { OwnerEmptyState } from './OwnerEmptyState';
import { OwnerErrorState } from './OwnerErrorState';
import { OrdersQueueSkeleton } from './OwnerTabSkeletons';
import { OwnerMenuView } from './menu/OwnerMenuView';
import { TableManagementView } from './tables/TableManagementView';
import { TakeawayQrCard } from './settings/TakeawayQrCard';

export type OwnerTabState = 'ready' | 'loading' | 'empty' | 'error';

export interface OwnerShellProps {
  storeName: string;
  acceptingOrders?: boolean;
  orders: OrderDetail[];
  tables?: (OwnerTable | TableSummary)[];
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

function toOwnerTables(items: (TableSummary | OwnerTable)[]): OwnerTable[] {
  return items.map((t) => ({
    ...t,
    updatedAt: (t as OwnerTable).updatedAt || '1970-01-01T00:00:00.000000+00:00',
    qr: (t as OwnerTable).qr ?? null,
  }));
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
  acceptingOrders = true,
  orders,
  tables = [],
  initialTab = 'orders',
  ownerName,
  roleLabel,
  isLoggingOut = false,
  logoutError = null,
  ordersState = 'ready',
  tablesState = 'ready',
  onRetryOrders,
  onRetryTables,
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
  const [tablesList, setTablesList] = useState<OwnerTable[]>(toOwnerTables(tables));
  const [qrCodesList, setQrCodesList] = useState<OwnerQrCode[]>([]);
  const [currentTablesState, setCurrentTablesState] = useState<OwnerTabState>(tablesState);
  const [tablesErrorMessage, setTablesErrorMessage] = useState<string | null>(null);
  const [isFetchingTables, setIsFetchingTables] = useState<boolean>(false);

  // Nạp danh sách bàn từ R11 và danh sách QR từ R17 (Dùng khi user bấm "Làm mới" hoặc "Thử lại")
  const fetchTablesAndQRs = useCallback(async () => {
    setIsFetchingTables(true);
    setTablesErrorMessage(null);
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
        setTablesList(toOwnerTables(tables));
        setCurrentTablesState('ready');
        setIsFetchingTables(false);
        return;
      }

      setTablesErrorMessage(errMessage);
      setCurrentTablesState('error');
    } catch {
      if (process.env.NODE_ENV !== 'production' && tables.length > 0) {
        setTablesList(toOwnerTables(tables));
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

  // Tự động tải dữ liệu khi chuyển sang tab bàn hoặc cài đặt (UI-01)
  useEffect(() => {
    if (activeTab !== 'tables' && activeTab !== 'settings') return;

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
          setTablesList(toOwnerTables(tables));
          setCurrentTablesState('ready');
          return;
        }

        setTablesErrorMessage(errMessage);
        setCurrentTablesState('error');
      } catch {
        if (isCancelled) return;
        if (process.env.NODE_ENV !== 'production' && tables.length > 0) {
          setTablesList(toOwnerTables(tables));
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
                        title="Chưa có đơn hàng trong ca"
                        description="Hàng đợi đơn hàng thời gian thực và điều phối chế biến (FIFO) sẽ được kích hoạt ở Phase 3 khi kết nối API đặt món. Đơn gọi món từ khách quét QR sẽ tự động hiển thị tại đây."
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
              TAB 2: BÀN (Toàn diện: Danh sách, Thêm/Sửa, QR Preview/Tải/In, R12)
             ================================================================= */}
          {activeTab === 'tables' && (
            <TableManagementView
              tables={tablesList}
              qrCodes={qrCodesList}
              storeName={storeName}
              isLoading={isFetchingTables || currentTablesState === 'loading'}
              errorMessage={tablesErrorMessage}
              onRefresh={fetchTablesAndQRs}
              onTableCreated={(newTable) => {
                setTablesList((prev) => {
                  const existingIdx = prev.findIndex((t) => t.id === newTable.id);
                  if (existingIdx >= 0) {
                    const copy = [...prev];
                    copy[existingIdx] = newTable;
                    return copy;
                  }
                  return [...prev, newTable];
                });
                if (newTable.qr) {
                  setQrCodesList((prev) => [
                    ...prev.filter((q) => q.id !== newTable.qr?.id),
                    newTable.qr!,
                  ]);
                }
                fetchTablesAndQRs();
              }}
              onTableUpdated={(updatedTable) => {
                setTablesList((prev) =>
                  prev.map((t) => (t.id === updatedTable.id ? updatedTable : t))
                );
                fetchTablesAndQRs();
              }}
            />
          )}

          {/* =================================================================
              TAB 3: MENU (Quản lý món ăn P2-G02)
             ================================================================= */}
          {activeTab === 'menu' && <OwnerMenuView />}

          {/* =================================================================
              TAB 4: CÀI ĐẶT (Thiết lập quán & QR Mua mang đi tại quầy)
             ================================================================= */}
          {activeTab === 'settings' && (
            <div className="flex-1 max-w-3xl mx-auto w-full py-4 space-y-4">
              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="text-sm font-bold text-[#1D2522]">
                    1. Trạng thái nhận đơn của quán
                  </h4>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F3F2] text-[#727B77]">
                    Thiết lập ở Phase 4
                  </span>
                </div>
                <p className="text-xs text-[#727B77] mb-3">
                  Cấu hình bật/tắt nhận đơn trực tiếp qua API R19/R20 (Store Settings) sẽ được kết nối ở Phase 4. Hiện hiển thị theo trạng thái snapshot thực tế của quán.
                </p>
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    acceptingOrders !== false
                      ? 'bg-[#E8F4F0] text-[#1D725E] border-[#C6E7DC]'
                      : 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]'
                  }`}
                >
                  <span>{acceptingOrders !== false ? '🟢 Đang mở cửa nhận đơn' : '🔴 Đang tạm ngừng nhận đơn'}</span>
                </div>
              </div>

              {/* CARD 2: QR Mua mang đi tại quầy (P2-G04, lọc chính xác mã active chưa thu hồi theo UI-01) */}
              <TakeawayQrCard
                storeName={storeName}
                initialQrCode={qrCodesList.find((q) => q.type === 'takeaway' && q.active && !q.retiredAt)}
                onQrUpdated={(updatedQr) => {
                  setQrCodesList((prev) => {
                    const filtered = prev.filter((q) => q.type !== 'takeaway');
                    return [...filtered, updatedQr];
                  });
                  fetchTablesAndQRs();
                }}
              />

              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs opacity-90">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="text-sm font-bold text-[#1D2522]">
                    3. Cổng thanh toán VietQR (Phase 4)
                  </h4>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F3F2] text-[#727B77]">
                    Thiết lập ở giai đoạn sau
                  </span>
                </div>
                <p className="text-xs text-[#727B77]">
                  Cấu hình tài khoản ngân hàng và đối soát thanh toán tự động qua Webhook sẽ được triển khai ở Phase 4. Hiện không lưu cấu hình giả lập.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
