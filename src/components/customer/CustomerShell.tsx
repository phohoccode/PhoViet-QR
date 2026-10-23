'use client';

import React, { useState } from 'react';
import { Store, Search, ShoppingBag } from 'lucide-react';
import type { StoreView, OrderType, MenuCategory, MenuItem } from '../../../docs/contracts/types';
import { CustomerModeBadge } from './CustomerModeBadge';
import { CategoryChips } from './CategoryChips';
import { MenuItemPreviewCard } from './MenuItemPreviewCard';
import { StickyCartPreview } from './StickyCartPreview';

interface CustomerShellProps {
  store: StoreView;
  mode: OrderType;
  tableLabel?: string | null;
  categories: MenuCategory[];
  items: MenuItem[];
  cartItemCount?: number;
  cartTotalVnd?: number;
  onOpenCart?: () => void;
  onItemAdd?: (item: MenuItem) => void;
  className?: string;
}

/**
 * CustomerShell — Khung giao diện toàn diện cho Khách hàng (Mobile-first).
 * Sử dụng chung cho cả hai loại QR (Tại bàn & Mang đi), tối ưu hóa trải nghiệm
 * thao tác một ngón tay cái trên màn hình 375px.
 */
export const CustomerShell: React.FC<CustomerShellProps> = ({
  store,
  mode,
  tableLabel,
  categories,
  items,
  cartItemCount = 2,
  cartTotalVnd = 67000,
  onOpenCart,
  onItemAdd,
  className = '',
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    categories[0]?.id || 'cat-all'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

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
      <div className="w-full max-w-lg mx-auto bg-white min-h-screen shadow-sm flex flex-col relative pb-28">
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
            aria-label={`Mở giỏ hàng, hiện có ${cartItemCount} món`}
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
            2. Thanh tìm kiếm (Search Bar)
           ================================================================= */}
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search
              className="w-4 h-4 text-[#727B77] absolute left-3.5 top-1/2 -translate-y-1/2"
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

        {/* =================================================================
            3. Dải chip danh mục cuộn ngang (Category Pills)
           ================================================================= */}
        <div className="pt-1 pb-2">
          <CategoryChips
            categories={categories}
            activeCategoryId={activeCategoryId}
            onSelectCategory={setActiveCategoryId}
          />
        </div>

        {/* =================================================================
            4. Danh sách thẻ món ăn (Menu Item List)
           ================================================================= */}
        <main className="px-4 flex-1">
          <div className="flex items-center justify-between py-2">
            <h2 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
              {categories.find((c) => c.id === activeCategoryId)?.name || 'Thực đơn'} (
              {filteredItems.length} món)
            </h2>
          </div>

          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-[#727B77]">
              <p className="text-sm">Không tìm thấy món nào phù hợp.</p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs font-semibold text-[#1D725E] underline"
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
      </div>

      {/* =================================================================
          5. Thanh giỏ hàng nổi cố định tại đáy màn hình (Sticky Bottom Cart)
         ================================================================= */}
      <StickyCartPreview
        itemCount={cartItemCount}
        totalVnd={cartTotalVnd}
        onOpenCart={onOpenCart}
      />
    </div>
  );
};
