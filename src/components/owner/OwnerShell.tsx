'use client';

import React, { useState } from 'react';
import { Play, Plus, QrCode } from 'lucide-react';
import type { OrderDetail, TableSummary, MenuItem } from '../../../docs/contracts/types';
import { OwnerHeader } from './OwnerHeader';
import { type OwnerTabType } from './OwnerHeaderPills';
import { OrderCardPreview } from './OrderCardPreview';
import { OrderDetailPreview } from './OrderDetailPreview';
import { OwnerEmptyState } from './OwnerEmptyState';

interface OwnerShellProps {
  storeName: string;
  orders: OrderDetail[];
  tables?: TableSummary[];
  menuItems?: MenuItem[];
  initialTab?: OwnerTabType;
  onClaimNext?: () => void;
  onLogout?: () => void;
  className?: string;
}

/**
 * OwnerShell — Khung giao diện toàn diện cho Dashboard Chủ quán (Desktop & Responsive).
 * Phong cách: Minimal Emerald POS (khớp assets/ui-reference.png)
 * - Vỏ trang xám nhạt #F5F6F5
 * - Khung nổi nền trắng bo góc lớn 28px (rounded-[28px])
 * - Phân chia 70/30 trên desktop, tự co về 1 cột trên tablet/mobile
 * - 4 Tab duy nhất: Đơn hàng, Bàn, Menu, Cài đặt.
 */
export const OwnerShell: React.FC<OwnerShellProps> = ({
  storeName,
  orders,
  tables = [],
  menuItems = [],
  initialTab = 'orders',
  onClaimNext,
  onLogout,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<OwnerTabType>(initialTab);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(
    orders[0] || null
  );
  const [orderFilter, setOrderFilter] = useState<'all' | 'dine_in' | 'takeaway'>('all');
  const [isClaiming, setIsClaiming] = useState<boolean>(false);

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

  return (
    <div className={`min-h-screen bg-[#F5F6F5] p-2 md:p-6 text-[#1D2522] ${className}`}>
      {/* =====================================================================
          SHELL CONTAINER: Panel trắng bo tròn 28px nổi trên nền xám nhạt
         ===================================================================== */}
      <div className="max-w-[1440px] mx-auto bg-white rounded-[24px] md:rounded-[28px] border border-[#E9ECEA] shadow-shell overflow-hidden min-h-[92vh] flex flex-col">
        {/* 1. Header chuẩn ảnh tham chiếu */}
        <OwnerHeader
          storeName={storeName}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={onLogout}
        />

        {/* 2. Nội dung các Tab */}
        <main className="flex-1 p-4 md:p-6 bg-white overflow-hidden flex flex-col">
          {/* =================================================================
              TAB 1: ĐƠN HÀNG (Default - Bố cục 70/30)
             ================================================================= */}
          {activeTab === 'orders' && (
            <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full">
              {/* CỘT TRÁI: Hàng đợi đơn hàng (~70% chiều ngang) */}
              <section className="flex-1 lg:w-[68%] flex flex-col gap-4">
                {/* Thanh điều khiển trên cùng: Bộ lọc & KPI */}
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
                <div className="bg-[#FAFBFB] p-3 rounded-2xl border border-[#E9ECEA] flex items-center justify-between gap-3">
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
                    className={`h-11 px-5 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
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

                {/* Danh sách thẻ đơn hàng (Cuộn độc lập) */}
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
                          onSelect={() => setSelectedOrder(order)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* CỘT PHẢI: Khung chi tiết đơn hàng (~32% chiều ngang) */}
              <aside className="lg:w-[32%] flex flex-col min-h-[420px]">
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
            </div>
          )}

          {/* =================================================================
              TAB 2: BÀN (Lưới bàn tối giản)
             ================================================================= */}
          {activeTab === 'tables' && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E9ECEA]">
                <div>
                  <h3 className="text-base font-bold text-[#1D2522]">Quản lý bàn phục vụ</h3>
                  <p className="text-xs text-[#727B77]">
                    Lưới trạng thái bàn trực quan (không kéo thả floorplan).
                  </p>
                </div>
                <span className="text-xs font-semibold px-3 py-1 bg-[#E8F4F0] text-[#1D725E] rounded-full">
                  {tables.filter((t) => t.session !== null).length} / {tables.length} bàn đang dùng
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
                {tables.map((t) => {
                  const isOccupied = t.session !== null;
                  return (
                    <div
                      key={t.id}
                      className={`p-4 rounded-2xl border text-center transition-all ${
                        isOccupied
                          ? 'bg-[#E8F4F0]/60 border-[#35977D]'
                          : 'bg-white border-[#E9ECEA] hover:border-[#C6E7DC]'
                      }`}
                    >
                      <span className="text-sm font-bold text-[#1D2522] block">{t.label}</span>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                          isOccupied
                            ? 'bg-[#E8F4F0] text-[#1D725E]'
                            : 'bg-[#F7F8F7] text-[#727B77]'
                        }`}
                      >
                        {isOccupied ? 'Có khách' : 'Trống'}
                      </span>
                      {t.session && (
                        <p className="text-xs font-bold text-[#1D2522] mt-2">
                          {new Intl.NumberFormat('vi-VN').format(t.session.totalVnd)} đ
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 3: MENU (Quản lý món ăn & Toggle còn/hết)
             ================================================================= */}
          {activeTab === 'menu' && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E9ECEA]">
                <div>
                  <h3 className="text-base font-bold text-[#1D2522]">Thực đơn quán</h3>
                  <p className="text-xs text-[#727B77]">
                    Bật / tắt nhanh trạng thái còn hàng hoặc sửa giá món ăn.
                  </p>
                </div>
                <button
                  type="button"
                  className="h-9 px-3.5 rounded-xl bg-[#1D725E] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#165B4B]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm món mới</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {menuItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-white rounded-2xl border border-[#E9ECEA] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1D2522] truncate">{item.name}</p>
                      <p className="text-xs text-[#727B77] mt-0.5">
                        {new Intl.NumberFormat('vi-VN').format(item.priceVnd)} đ
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        item.available
                          ? 'bg-[#E8F4F0] text-[#1D725E]'
                          : 'bg-[#FEF3F2] text-[#912018]'
                      }`}
                    >
                      {item.available ? 'Còn hàng' : 'Hết hàng'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 4: CÀI ĐẶT (Thiết lập quán & QR)
             ================================================================= */}
          {activeTab === 'settings' && (
            <div className="flex-1 max-w-2xl mx-auto w-full py-4 space-y-4">
              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA]">
                <h4 className="text-sm font-bold text-[#1D2522] mb-1">
                  1. Trạng thái nhận đơn của quán
                </h4>
                <p className="text-xs text-[#727B77] mb-3">
                  Khi tạm ngừng, khách quét QR chỉ có thể xem menu mà không thể gửi đơn mới.
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#E8F4F0] text-[#1D725E] text-xs font-bold">
                  <span>🟢 Đang mở cửa nhận đơn</span>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA]">
                <h4 className="text-sm font-bold text-[#1D2522] mb-1">
                  2. Quản lý mã QR bàn & quầy
                </h4>
                <p className="text-xs text-[#727B77] mb-3">
                  Tải file in chất lượng cao để dán tại từng bàn hoặc đặt tại quầy thu ngân.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-xl border border-[#E9ECEA] bg-[#F7F8F7] hover:bg-[#E8F4F0] text-xs font-semibold flex items-center gap-1.5 text-[#1D2522]"
                  >
                    <QrCode className="w-4 h-4 text-[#35977D]" />
                    <span>Tải QR mang đi tại quầy</span>
                  </button>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-xl border border-[#E9ECEA] bg-[#F7F8F7] hover:bg-[#E8F4F0] text-xs font-semibold flex items-center gap-1.5 text-[#1D2522]"
                  >
                    <QrCode className="w-4 h-4 text-[#35977D]" />
                    <span>Tải trọn bộ QR 12 bàn (PDF)</span>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#E9ECEA]">
                <h4 className="text-sm font-bold text-[#1D2522] mb-1">
                  3. Cổng thanh toán VietQR
                </h4>
                <p className="text-xs text-[#727B77] mb-2">
                  Trạng thái tích hợp tự động qua Webhook (không hiển thị secret keys).
                </p>
                <span className="text-xs text-[#165B4B] font-semibold bg-[#E8F4F0] px-2.5 py-1 rounded-lg inline-block">
                  🟢 Webhook đang hoạt động ổn định
                </span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
