'use client';

import React, { useState, useMemo } from 'react';
import { Search, Coffee, AlertCircle, RefreshCw, X } from 'lucide-react';
import type { MenuCategory, MenuItem } from '../../../docs/contracts/types';
import type { OrderAdmissionView } from '../shared/admission-types';
import { CategoryChips } from './CategoryChips';
import { MenuItemPreviewCard } from './MenuItemPreviewCard';

interface MenuPreviewSectionProps {
  categories: MenuCategory[];
  items: MenuItem[];
  isTableVerified?: boolean;
  isTakeaway?: boolean;
  isLoading?: boolean;
  isMockPreview?: boolean;
  errorMessage?: string | null;
  admission?: OrderAdmissionView;
  onRetry?: () => void;
  onItemClick?: (item: MenuItem) => void;
  onItemAdd?: (item: MenuItem) => void;
  className?: string;
}

/**
 * Hàm chuẩn hóa loại bỏ dấu tiếng Việt để tìm kiếm không phân biệt hoa/thường và dấu
 */
export function removeVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * MenuPreviewSkeleton — Khung xương nạp trước thực đơn
 */
export const MenuPreviewSkeleton: React.FC = () => {
  return (
    <div
      className="space-y-3 animate-pulse"
      role="status"
      aria-busy="true"
      aria-label="Đang nạp danh sách món..."
    >
      {/* 1. Search Bar Skeleton */}
      <div className="px-4">
        <div className="w-full h-11 bg-[#F7F8F7] border border-[#E9ECEA] rounded-xl" />
      </div>

      {/* 2. Category Chips Skeleton */}
      <div className="py-1 px-4 flex items-center gap-2 overflow-x-hidden">
        <div className="w-20 h-8 rounded-full bg-[#E9ECEA] flex-shrink-0" />
        <div className="w-24 h-8 rounded-full bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />
        <div className="w-20 h-8 rounded-full bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />
        <div className="w-24 h-8 rounded-full bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />
      </div>

      {/* 3. Items List Skeleton */}
      <div className="px-4 space-y-3 pt-1">
        <div className="flex items-center justify-between py-1">
          <div className="w-28 h-3.5 bg-[#E9ECEA] rounded" />
        </div>

        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E9ECEA]"
          >
            <div className="w-20 h-20 rounded-xl bg-[#F7F8F7] flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="w-3/4 h-4 bg-[#E9ECEA] rounded" />
              <div className="w-full h-3 bg-[#F7F8F7] rounded" />
              <div className="w-1/3 h-4 bg-[#E8F4F0] rounded mt-2" />
            </div>
            <div className="w-11 h-11 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * EmptyMenuState — Khung rỗng khi danh mục chưa có món hoặc tìm kiếm không thấy
 */
export const EmptyMenuState: React.FC<{ onResetFilter?: () => void; isSearch?: boolean }> = ({
  onResetFilter,
  isSearch,
}) => {
  return (
    <div className="py-12 px-4 text-center text-[#727B77] bg-white rounded-2xl border border-[#E9ECEA] my-2">
      <Coffee className="w-8 h-8 text-[#A0A8A5] mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-semibold text-[#1D2522]">
        {isSearch ? 'Không tìm thấy món phù hợp' : 'Chưa có món trong danh mục'}
      </p>
      <p className="text-xs text-[#727B77] mt-1 max-w-xs mx-auto">
        {isSearch
          ? 'Vui lòng thử tìm với từ khóa khác hoặc xóa bộ lọc để xem toàn bộ thực đơn.'
          : 'Danh mục này hiện chưa có món ăn nào đang phục vụ.'}
      </p>
      {onResetFilter && (
        <button
          type="button"
          onClick={onResetFilter}
          className="mt-3 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#1D725E] bg-[#E8F4F0] hover:bg-[#1D725E] hover:text-white transition-colors"
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
 * MenuPreviewSection — Vỏ khung xem trước thực đơn chuẩn hóa Minimal Emerald.
 * Hỗ trợ tìm kiếm tiếng Việt chuẩn hóa memoized, lọc chip danh mục, lọc inactive items,
 * và hiển thị trạng thái tiếp nhận đơn (admission / overload) chính xác từ server.
 */
export const MenuPreviewSection: React.FC<MenuPreviewSectionProps> = ({
  categories,
  items,
  isTableVerified = false,
  isTakeaway = false,
  isLoading = false,
  errorMessage = null,
  admission,
  onRetry,
  onItemClick,
  onItemAdd,
  className = '',
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    categories[0]?.id || 'cat-all'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Memoize active items (lọc bỏ inactive do server trả dư thừa nếu có)
  const activeItems = useMemo(() => {
    return items.filter(
      (item) => (item as unknown as { active?: boolean }).active !== false
    );
  }, [items]);

  // 2. Memoize normalized search query
  const normalizedQuery = useMemo(() => {
    return removeVietnameseDiacritics(searchQuery.trim());
  }, [searchQuery]);

  // 3. Memoize filtered items: chỉ tính toán lại khi category, query hoặc items thay đổi
  const filteredItems = useMemo(() => {
    if (!normalizedQuery && activeCategoryId === 'cat-all') {
      return activeItems;
    }

    return activeItems.filter((item) => {
      const matchesCategory =
        activeCategoryId === 'cat-all' || item.categoryId === activeCategoryId;

      if (!matchesCategory) return false;
      if (!normalizedQuery) return true;

      const normalizedName = removeVietnameseDiacritics(item.name);
      const normalizedDesc = item.description ? removeVietnameseDiacritics(item.description) : '';
      return normalizedName.includes(normalizedQuery) || normalizedDesc.includes(normalizedQuery);
    });
  }, [activeItems, activeCategoryId, normalizedQuery]);

  // Kiểm tra trạng thái tạm dừng riêng biệt cho từng chế độ:
  // Takeaway bị dừng thì KHÔNG làm ảnh hưởng Dine-in và ngược lại.
  const isPausedForMode = Boolean(
    admission &&
    !admission.acceptingOrders &&
    (isTakeaway ? admission.type === 'takeaway' : admission.type === 'dine_in')
  );

  const canAddToCart = (isTakeaway || isTableVerified) && !isPausedForMode;

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleResetFilter = () => {
    setSearchQuery('');
    setActiveCategoryId('cat-all');
  };

  if (isLoading) {
    return <MenuPreviewSkeleton />;
  }

  if (errorMessage) {
    return <MenuErrorState message={errorMessage} onRetry={onRetry} />;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 1. Thanh tìm kiếm món có nút Xóa tìm kiếm */}
      <div className="px-4">
        <label htmlFor="customer-menu-search" className="sr-only">
          Tìm món ăn hoặc thức uống
        </label>
        <div className="relative">
          <Search
            className="w-4 h-4 text-[#727B77] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="customer-menu-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm món ăn, thức uống..."
            className="w-full h-11 pl-10 pr-10 bg-[#F7F8F7] border border-[#E9ECEA] rounded-xl text-sm text-[#1D2522] placeholder-[#727B77] focus:outline-none focus:ring-2 focus:ring-[#35977D] focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="w-8 h-8 absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-[#727B77] hover:text-[#1D2522] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
              aria-label="Xóa tìm kiếm"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Dải chip danh mục cuộn ngang */}
      <div className="py-1">
        <CategoryChips
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
        />
      </div>

      {/* Banner nhẹ thông báo tạm dừng nhận đơn theo đúng chế độ phục vụ */}
      {isPausedForMode && (
        <div
          role="status"
          aria-live="polite"
          className="mx-4 p-3.5 rounded-2xl bg-[#FEF6EE] border border-[#F9DBAF] flex items-start gap-2.5 shadow-xs"
        >
          <AlertCircle className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#B54708]">
              {isTakeaway
                ? 'Quán đang tạm dừng nhận đơn mang đi'
                : 'Quán đang tạm dừng nhận đơn tại bàn'}
            </p>
            <p className="text-[11px] text-[#8A4D00] mt-0.5 leading-relaxed">
              {admission?.message ||
                (admission?.reason === 'capacity'
                  ? 'Quán đang quá tải đơn, tạm ngưng nhận thêm để đảm bảo chất lượng phục vụ.'
                  : admission?.reason === 'outside_hours'
                    ? 'Hiện đã ngoài khung giờ nhận đơn của quán.'
                    : 'Quý khách vẫn có thể xem trước thực đơn trong lúc chờ quán mở nhận đơn lại.')}
            </p>
          </div>
        </div>
      )}

      {/* 3. Danh sách thẻ món ăn */}
      <main className="px-4 pb-4">
        <div className="flex items-center justify-between py-2">
          <h3 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
            {categories.find((c) => c.id === activeCategoryId)?.name || 'Thực đơn'} (
            {filteredItems.length} món)
          </h3>
          {!canAddToCart && (
            <span className="text-[11px] font-medium text-[#8A4D00] bg-[#FEF6EE] px-2 py-0.5 rounded-md">
              {isPausedForMode ? 'Tạm dừng nhận đơn' : 'Chế độ xem trước'}
            </span>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <EmptyMenuState
            onResetFilter={handleResetFilter}
            isSearch={Boolean(searchQuery || activeCategoryId !== 'cat-all')}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map((item) => (
              <MenuItemPreviewCard
                key={item.id}
                item={item}
                canAddToCart={canAddToCart}
                onItemClick={onItemClick}
                onAddClick={canAddToCart ? (onItemClick || onItemAdd) : undefined}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

