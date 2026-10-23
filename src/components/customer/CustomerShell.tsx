'use client';

import React, { useState } from 'react';
import { Store, Search, ShoppingBag, WifiOff } from 'lucide-react';
import type { StoreView, OrderType, MenuCategory, MenuItem } from '../../../docs/contracts/types';
import { CustomerModeBadge } from './CustomerModeBadge';
import { CategoryChips } from './CategoryChips';
import { MenuItemPreviewCard } from './MenuItemPreviewCard';
import { StickyCartPreview } from './StickyCartPreview';
import { CustomerSkeleton } from './CustomerSkeleton';
import { CustomerStateView } from './CustomerStateView';

export type CustomerShellState =
  | 'preview'
  | 'loading'
  | 'empty'
  | 'error'
  | 'invalid_table_session'
  | 'offline';

export interface CustomerShellProps {
  store: StoreView;
  mode: OrderType;
  tableLabel?: string | null;
  categories: MenuCategory[];
  items: MenuItem[];
  cartItemCount?: number;
  cartTotalVnd?: number;
  uiState?: CustomerShellState;
  errorMessage?: string;
  onRetry?: () => void;
  onOpenCart?: () => void;
  onItemAdd?: (item: MenuItem) => void;
  className?: string;
}

/**
 * CustomerShell — Khung giao diện toàn diện cho Khách hàng (Mobile-first).
 * Sử dụng chung cho cả hai loại QR (Tại bàn & Mang đi) mà không phân mảnh codebase.
 * Hỗ trợ đầy đủ các trạng thái giao diện: loading, preview, empty, error, invalid_table_session, offline.
 * Đảm bảo safe-area trên iPhone và tuân thủ nguyên tắc WCAG AA.
 */
export const CustomerShell: React.FC<CustomerShellProps> = ({
  store,
  mode,
  tableLabel,
  categories,
  items,
  cartItemCount = 2,
  cartTotalVnd = 67000,
  uiState = 'preview',
  errorMessage,
  onRetry,
  onOpenCart,
  onItemAdd,
  className = '',
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    categories[0]?.id || 'cat-all'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Nếu đang ở trạng thái loading (Skeleton loading)
  if (uiState === 'loading') {
    return (
      <div className={`min-h-screen bg-[#F5F6F5] text-[#1D2522] flex flex-col justify-between ${className}`}>
        <CustomerSkeleton />
      </div>
    );
  }

  // Lọc món theo danh mục và tìm kiếm cục bộ (chỉ phục vụ tương tác preview)
  const filteredItems = items.filter((item) => {
    const matchesCategory =
      activeCategoryId === 'cat-all' || item.categoryId === activeCategoryId;
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div
      className={`min-h-screen bg-[#F5F6F5] text-[#1D2522] flex flex-col justify-between ${className}`}
    >
      <div className="w-full max-w-lg mx-auto bg-white min-h-screen shadow-sm flex flex-col relative pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]">
        {/* Banner cảnh báo ngoại tuyến (Offline Banner) nếu đang mất mạng */}
        {uiState === 'offline' && (
          <aside
            role="status"
            aria-live="polite"
            className="sticky top-0 z-40 bg-[#1D2522] text-white px-4 py-2 text-xs flex items-center justify-between gap-2 shadow-md"
          >
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-[#FECDCA]" aria-hidden="true" />
              <span className="font-medium">Mất kết nối mạng. Đang chờ kết nối lại...</span>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-[11px] font-bold text-[#35977D] hover:underline px-2 py-0.5 rounded bg-white/10"
              >
                Thử lại
              </button>
            )}
          </aside>
        )}

        {/* =================================================================
            1. Header cố định đỉnh (Sticky Header)
           ================================================================= */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E9ECEA] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#E8F4F0] flex items-center justify-center flex-shrink-0 text-[#1D725E]">
              <Store className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-[#1D2522] truncate leading-tight">
                {store.name}
              </h1>
              <CustomerModeBadge mode={mode} tableLabel={tableLabel} className="mt-0.5" />
            </div>
          </div>

          {/* Nút giỏ hàng nhỏ trên header */}
          <button
            type="button"
            onClick={onOpenCart}
            className="relative w-10 h-10 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] flex items-center justify-center text-[#1D2522] hover:bg-[#E8F4F0] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label={`Mở giỏ hàng xem trước, hiện có ${cartItemCount} món`}
          >
            <ShoppingBag className="w-5 h-5 text-[#1D2522]" aria-hidden="true" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#1D725E] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {cartItemCount}
              </span>
            )}
          </button>
        </header>

        {/* =================================================================
            2. Xử lý các trạng thái đặc biệt: error / invalid_table_session / empty
           ================================================================= */}
        {uiState === 'error' && (
          <CustomerStateView
            type="error"
            title="Không thể tải thực đơn"
            description={errorMessage || 'Không thể đồng bộ món ăn từ máy chủ. Vui lòng thử lại sau.'}
            onRetry={onRetry}
          />
        )}

        {uiState === 'invalid_table_session' && (
          <CustomerStateView
            type="invalid_table_session"
            onRetry={onRetry}
          />
        )}

        {uiState === 'empty' && (
          <CustomerStateView
            type="empty"
            onRetry={onRetry}
          />
        )}

        {/* =================================================================
            3. Trạng thái bình thường hoặc tìm kiếm: Danh mục & Danh sách món
           ================================================================= */}
        {uiState !== 'error' && uiState !== 'invalid_table_session' && uiState !== 'empty' && (
          <>
            {/* Thanh tìm kiếm (Search Bar) */}
            <div className="px-4 pt-3 pb-1">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-[#727B77] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm món ăn, thức uống..."
                  className="w-full h-11 pl-10 pr-4 bg-[#F7F8F7] border border-[#E9ECEA] rounded-xl text-sm text-[#1D2522] placeholder-[#727B77] focus:outline-none focus:ring-2 focus:ring-[#35977D] focus:bg-white transition-all"
                  aria-label="Tìm kiếm món trong thực đơn"
                />
              </div>
            </div>

            {/* Dải chip danh mục cuộn ngang (Category Pills) */}
            <div className="pt-1 pb-2">
              <CategoryChips
                categories={categories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={setActiveCategoryId}
              />
            </div>

            {/* Danh sách thẻ món ăn (Menu Item List) */}
            <main className="px-4 flex-1">
              <div className="flex items-center justify-between py-2">
                <h2 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
                  {categories.find((c) => c.id === activeCategoryId)?.name || 'Thực đơn'} (
                  {filteredItems.length} món)
                </h2>
              </div>

              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-[#727B77]">
                  <p className="text-sm font-medium">Không tìm thấy món nào phù hợp.</p>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-2 text-xs font-semibold text-[#1D725E] hover:underline"
                    >
                      Xóa bộ lọc tìm kiếm
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredItems.map((item) => (
                    <MenuItemPreviewCard
                      key={item.id}
                      item={item}
                      onAddClick={onItemAdd}
                    />
                  ))}
                </div>
              )}
            </main>
          </>
        )}
      </div>

      {/* =================================================================
          4. Thanh giỏ hàng nổi cố định tại đáy màn hình (Sticky Bottom Cart)
          Không render khi đang ở trạng thái lỗi hoặc phiên bàn không hợp lệ
         ================================================================= */}
      {uiState !== 'error' && uiState !== 'invalid_table_session' && (
        <StickyCartPreview
          itemCount={cartItemCount}
          totalVnd={cartTotalVnd}
          onOpenCart={onOpenCart}
        />
      )}
    </div>
  );
};
