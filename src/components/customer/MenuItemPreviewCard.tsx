'use client';

import React from 'react';
import Image from 'next/image';
import { Coffee, Plus } from 'lucide-react';
import type { MenuItem } from '../../../docs/contracts/types';

interface MenuItemPreviewCardProps {
  item: MenuItem;
  onAddClick?: (item: MenuItem) => void;
  className?: string;
}

/**
 * MenuItemPreviewCard — Thẻ món ăn trình diễn cho danh sách thực đơn của khách.
 * Hỗ trợ trạng thái Còn hàng / Hết hàng, placeholder ảnh 1:1 và định dạng tiền VND.
 */
export const MenuItemPreviewCard: React.FC<MenuItemPreviewCardProps> = ({
  item,
  onAddClick,
  className = '',
}) => {
  const isAvailable = item.available;

  // Định dạng tiền tệ VND chuẩn tiếng Việt (ví dụ: 35.000 đ)
  const formattedPrice = new Intl.NumberFormat('vi-VN').format(item.priceVnd) + ' đ';

  return (
    <article
      className={`relative flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E9ECEA] shadow-sm transition-all duration-150 ${
        isAvailable ? 'hover:border-[#C6E7DC]' : 'opacity-60 bg-[#FAFAFA]'
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
            className="w-full h-full object-cover"
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
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#B42318] text-white uppercase tracking-wider">
              Hết món
            </span>
          </div>
        )}
      </div>

      {/* Nội dung thông tin món ăn */}
      <div className="flex-1 min-w-0 pr-1">
        <h4 className="text-sm font-semibold text-[#1D2522] truncate leading-tight">
          {item.name}
        </h4>
        {item.description && (
          <p className="text-xs text-[#727B77] line-clamp-2 mt-1 leading-relaxed">
            {item.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm font-bold text-[#1D2522]">
            {formattedPrice}
          </span>
          {item.options && item.options.length > 0 && (
            <span className="text-[11px] text-[#35977D] font-medium bg-[#E8F4F0] px-1.5 py-0.5 rounded">
              Có tùy chọn
            </span>
          )}
        </div>
      </div>

      {/* Nút thêm món (Touch target tối thiểu 44x44px) */}
      <div className="flex-shrink-0">
        <button
          type="button"
          disabled={!isAvailable || !onAddClick}
          onClick={() => onAddClick?.(item)}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
            isAvailable && onAddClick
              ? 'bg-[#E8F4F0] text-[#1D725E] hover:bg-[#1D725E] hover:text-white active:scale-95'
              : 'bg-[#F1F3F2] text-[#A0A8A5] cursor-not-allowed'
          }`}
          aria-label={
            !isAvailable
              ? `${item.name} đã hết hàng`
              : !onAddClick
              ? `Cần xác nhận bàn trước khi thêm ${item.name}`
              : `Thêm ${item.name} vào giỏ hàng`
          }
          title={!onAddClick ? 'Vui lòng xác nhận bàn để thêm món' : undefined}
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};
