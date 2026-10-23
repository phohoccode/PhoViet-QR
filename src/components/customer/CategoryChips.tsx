'use client';

import React from 'react';
import type { MenuCategory } from '../../../docs/contracts/types';

interface CategoryChipsProps {
  categories: MenuCategory[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
  className?: string;
}

/**
 * CategoryChips — Dải chip danh mục cuộn ngang dạng viên thuốc (Pill),
 * kế thừa trực tiếp từ phong cách ảnh tham chiếu.
 */
export const CategoryChips: React.FC<CategoryChipsProps> = ({
  categories,
  activeCategoryId,
  onSelectCategory,
  className = '',
}) => {
  return (
    <nav
      className={`w-full overflow-x-auto scrollbar-none py-2 px-4 flex items-center gap-2 select-none ${className}`}
      aria-label="Danh mục thực đơn"
    >
      {categories.map((cat) => {
        const isActive = cat.id === activeCategoryId;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            className={`flex-shrink-0 h-9 px-4 rounded-full text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D] focus-visible:ring-offset-1 ${
              isActive
                ? 'bg-[#35977D] text-white shadow-sm font-semibold'
                : 'bg-[#F7F8F7] text-[#727B77] border border-[#E9ECEA] hover:bg-[#E8F4F0] hover:text-[#1D725E]'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {cat.name}
          </button>
        );
      })}
    </nav>
  );
};
