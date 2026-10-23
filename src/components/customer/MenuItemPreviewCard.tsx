'use client';

import React from 'react';
import Image from 'next/image';
import { Coffee, Plus, ChevronRight } from 'lucide-react';
import type { MenuItem } from '../../../docs/contracts/types';

interface MenuItemPreviewCardProps {
  item: MenuItem;
  onItemClick?: (item: MenuItem) => void;
  onAddClick?: (item: MenuItem) => void;
  canAddToCart?: boolean;
  className?: string;
}

/**
 * MenuItemPreviewCard — Thẻ món ăn trình diễn cho danh sách thực đơn của khách.
 * Hỗ trợ trạng thái Còn hàng / Hết hàng, placeholder ảnh 1:1, định dạng tiền VND và xem chi tiết món.
 */
export const MenuItemPreviewCard: React.FC<MenuItemPreviewCardProps> = ({
  item,
  onItemClick,
  onAddClick,
  canAddToCart = false,
  className = '',
}) => {
  const isAvailable = item.available;

  // Định dạng tiền tệ VND chuẩn tiếng Việt (ví dụ: 35.000 đ)
  const formattedPrice = new Intl.NumberFormat('vi-VN').format(item.priceVnd) + ' đ';

  const handleCardClick = () => {
    onItemClick?.(item);
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAvailable) return;
    if (onAddClick) {
      onAddClick(item);
    } else {
      onItemClick?.(item);
    }
  };

  return (
    <article
      onClick={handleCardClick}
      className={`group relative flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs transition-all duration-150 cursor-pointer ${
        isAvailable
          ? 'hover:border-[#35977D] hover:shadow-sm active:scale-[0.99]'
          : 'opacity-70 bg-[#FAFAFA] cursor-default'
      } ${className}`}
      aria-label={`${item.name}, giá ${formattedPrice}, ${isAvailable ? 'còn hàng' : 'hết hàng'}`}
    >
      {/* Khung ảnh 1:1 tỉ lệ vuông bo góc 12px */}
      <div className="relative flex-shrink-0 w-20 h-20 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] overflow-hidden flex items-center justify-center">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            width={80}
            height={80}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#727B77]">
            <Coffee className="w-6 h-6 text-[#35977D]" aria-hidden="true" />
            <span className="text-[10px] mt-1 text-[#727B77]">Món ngon</span>
          </div>
        )}

        {/* Badge hết hàng đè lên ảnh nếu item.available = false */}
        {!isAvailable && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center p-1 text-center">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#B42318] text-white uppercase tracking-wider">
              Hết hàng
            </span>
          </div>
        )}
      </div>

      {/* Nội dung thông tin món ăn */}
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-start justify-between gap-1">
          <h4 className="text-sm font-semibold text-[#1D2522] truncate leading-tight group-hover:text-[#1D725E] transition-colors">
            {item.name}
          </h4>
        </div>

        {item.description && (
          <p className="text-xs text-[#727B77] line-clamp-2 mt-1 leading-relaxed">
            {item.description}
          </p>
        )}

        <div className="flex items-center flex-wrap gap-2 mt-2">
          <span className="text-sm font-bold text-[#1D2522]">
            {formattedPrice}
          </span>
          {item.options && item.options.length > 0 && (
            <span className="text-[10px] text-[#1D725E] font-medium bg-[#E8F4F0] px-1.5 py-0.5 rounded-md">
              +{item.options.length} tùy chọn
            </span>
          )}
          {!isAvailable && (
            <span className="text-[10px] font-semibold text-[#B42318] bg-[#FEF3F2] px-1.5 py-0.5 rounded-md">
              Tạm ngưng phục vụ
            </span>
          )}
        </div>
      </div>

      {/* Nút hành động (Touch target tối thiểu 44x44px) */}
      <div className="flex-shrink-0">
        {isAvailable ? (
          <button
            type="button"
            onClick={handleActionClick}
            className={`min-w-[44px] h-11 px-2.5 rounded-xl flex items-center justify-center gap-1 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
              canAddToCart
                ? 'bg-[#E8F4F0] text-[#1D725E] hover:bg-[#1D725E] hover:text-white active:scale-95'
                : 'bg-[#F7F8F7] text-[#727B77] hover:bg-[#E9ECEA]'
            }`}
            aria-label={
              canAddToCart
                ? `Chọn ${item.name}`
                : `Xem chi tiết ${item.name}`
            }
          >
            {canAddToCart ? (
              <>
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span className="text-xs font-bold hidden sm:inline">Chọn</span>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold">Xem</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#727B77]" aria-hidden="true" />
              </>
            )}
          </button>
        ) : (
          <div
            className="min-w-[44px] h-11 px-2.5 rounded-xl flex items-center justify-center bg-[#F1F3F2] text-[#A0A8A5] text-xs font-medium cursor-not-allowed"
            aria-disabled="true"
            aria-label={`${item.name} đã hết hàng`}
          >
            <span>Hết</span>
          </div>
        )}
      </div>
    </article>
  );
};

