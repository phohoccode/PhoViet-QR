'use client';

import React, { useState } from 'react';
import { Search, Sparkles, Coffee, AlertCircle, RefreshCw } from 'lucide-react';
import type { MenuCategory, MenuItem } from '../../../docs/contracts/types';
import { CategoryChips } from './CategoryChips';
import { MenuItemPreviewCard } from './MenuItemPreviewCard';

interface MenuPreviewSectionProps {
  categories: MenuCategory[];
  items: MenuItem[];
  isTableVerified?: boolean;
  isTakeaway?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onItemAdd?: (item: MenuItem) => void;
  className?: string;
}

/**
 * MenuPreviewSkeleton — Khung xương nạp trước thực đơn
 */
export const MenuPreviewSkeleton: React.FC = () => {
  return (
    <div className="space-y-3 animate-pulse px-4 pt-2">
      <div className="w-28 h-4 bg-[#E9ECEA] rounded" />
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E9ECEA]"
        >
          <div className="w-20 h-20 rounded-xl bg-[#F7F8F7] flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="w-3/4 h-4 bg-[#E9ECEA] rounded" />
            <div className="w-full h-3 bg-[#F7F8F7] rounded" />
            <div className="w-1/3 h-4 bg-[#E9ECEA] rounded mt-2" />
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#F7F8F7] flex-shrink-0" />
        </div>
      ))}
    </div>
  );
};

/**
 * EmptyMenuState — Khung rỗng khi danh mục chưa có món
 */
export const EmptyMenuState: React.FC<{ onResetFilter?: () => void }> = ({ onResetFilter }) => {
  return (
    <div className="py-12 px-4 text-center text-[#727B77] bg-white rounded-2xl border border-[#E9ECEA] mx-4 my-2">
      <Coffee className="w-8 h-8 text-[#A0A8A5] mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-semibold text-[#1D2522]">Chưa có món ăn phù hợp</p>
      <p className="text-xs text-[#727B77] mt-1 max-w-xs mx-auto">
        Không tìm thấy món ăn nào theo danh mục hoặc từ khóa tìm kiếm.
      </p>
      {onResetFilter && (
        <button
          type="button"
          onClick={onResetFilter}
          className="mt-3 text-xs font-semibold text-[#1D725E] hover:underline"
        >
          Xóa bộ lọc tìm kiếm
        </button>
      )}
    </div>
  );
};

/**
 * MenuErrorState — Khung báo lỗi khi không thể nạp thực đơn
 */
export const MenuErrorState: React.FC<{ message?: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => {
  return (
    <div className="py-8 px-4 text-center bg-[#FEF3F2]/60 rounded-2xl border border-[#FECDCA] mx-4 my-2">
      <AlertCircle className="w-8 h-8 text-[#B42318] mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-semibold text-[#912018]">Không thể tải thực đơn</p>
      <p className="text-xs text-[#727B77] mt-1 max-w-xs mx-auto">
        {message || 'Đã có lỗi khi kết nối tới máy chủ của quán.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#B42318] text-white hover:bg-[#912018] inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Thử tải lại</span>
        </button>
      )}
    </div>
  );
};

/**
 * MenuPreviewSection — Vỏ khung xem trước thực đơn chuẩn hóa cho Phase 2 (P2-G01 & P2-G02).
 * Hỗ trợ tìm kiếm, lọc chip danh mục, thẻ món ăn mẫu và nhãn cảnh báo demo rõ ràng.
 */
export const MenuPreviewSection: React.FC<MenuPreviewSectionProps> = ({
  categories,
  items,
  isTableVerified = false,
  isTakeaway = false,
  isLoading = false,
  errorMessage = null,
  onRetry,
  onItemAdd,
  className = '',
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    categories[0]?.id || 'cat-all'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (isLoading) {
    return <MenuPreviewSkeleton />;
  }

  if (errorMessage) {
    return <MenuErrorState message={errorMessage} onRetry={onRetry} />;
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

  const canAddToCart = isTakeaway || isTableVerified;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 1. Dải thông báo Dev Preview minh bạch (Task C) */}
      <div className="mx-4 px-3.5 py-2 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] flex items-center justify-between gap-2 text-xs text-[#727B77]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-4 h-4 text-[#35977D] flex-shrink-0" aria-hidden="true" />
          <span className="truncate">Thực đơn minh họa (Dev Preview P2-G01)</span>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E9ECEA] text-[#55605C] flex-shrink-0">
          {items.length} món mẫu
        </span>
      </div>

      {/* 2. Thanh tìm kiếm món */}
      <div className="px-4">
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

      {/* 3. Dải chip danh mục cuộn ngang */}
      <div className="py-1">
        <CategoryChips
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
        />
      </div>

      {/* 4. Danh sách thẻ món ăn */}
      <main className="px-4 pb-4">
        <div className="flex items-center justify-between py-2">
          <h3 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
            {categories.find((c) => c.id === activeCategoryId)?.name || 'Thực đơn'} (
            {filteredItems.length} món)
          </h3>
          {!canAddToCart && (
            <span className="text-[11px] font-medium text-[#8A4D00] bg-[#FEF6EE] px-2 py-0.5 rounded-md">
              Chế độ xem trước
            </span>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <EmptyMenuState onResetFilter={() => setSearchQuery('')} />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map((item) => (
              <MenuItemPreviewCard
                key={item.id}
                item={item}
                onAddClick={canAddToCart ? onItemAdd : undefined}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
