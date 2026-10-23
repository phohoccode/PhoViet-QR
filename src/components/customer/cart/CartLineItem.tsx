'use client';

/**
 * CART LINE ITEM COMPONENT — QR Ordering Minimal MVP
 * Mã công việc: P2-G03
 *
 * Hiển thị chi tiết 1 dòng món trong giỏ hàng:
 * - Ảnh thumbnail 64x64px hoặc placeholder sắc nét
 * - Tên món, đơn giá cơ bản và tổng tiền dòng (tạm tính VND)
 * - Danh sách tùy chọn đi kèm (+X.000 đ) và ghi chú đặc biệt
 * - Bộ điều khiển số lượng (- / số lượng / +) đạt touch target >= 44px
 * - Nút chỉnh sửa tùy chọn & nút xóa món trực quan
 * - Cảnh báo trạng thái: Hết hàng, Giá thay đổi, Tùy chọn không hợp lệ
 */

import React from 'react';
import Image from 'next/image';
import { Plus, Minus, Trash2, Edit2, Coffee, AlertCircle, AlertTriangle } from 'lucide-react';
import { CustomerCartItem, calculateLineTotalVnd, calculateUnitPriceVnd } from './types';

interface CartLineItemProps {
  item: CustomerCartItem;
  onUpdateQuantity: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onEdit?: (item: CustomerCartItem) => void;
  className?: string;
}

export const CartLineItem: React.FC<CartLineItemProps> = ({
  item,
  onUpdateQuantity,
  onRemove,
  onEdit,
  className = '',
}) => {
  const unitPriceVnd = calculateUnitPriceVnd(item.basePriceVnd, item.selectedOptions);
  const lineTotalVnd = calculateLineTotalVnd(
    item.basePriceVnd,
    item.selectedOptions,
    item.quantity
  );

  const formattedUnitPrice = new Intl.NumberFormat('vi-VN').format(unitPriceVnd) + ' đ';
  const formattedLineTotal = new Intl.NumberFormat('vi-VN').format(lineTotalVnd) + ' đ';

  const isUnavailable = !item.available;
  const hasPriceChanged = !!item.priceChanged;
  const hasInvalidOptions = (item.invalidOptionIds?.length || 0) > 0;

  return (
    <div
      className={`p-3.5 bg-white rounded-2xl border transition-all ${
        isUnavailable
          ? 'border-[#FECDCA] bg-[#FEF3F2]/40'
          : hasPriceChanged
          ? 'border-[#FEDF89] bg-[#FFFAEB]/30'
          : 'border-[#E9ECEA] hover:border-[#C6E7DC]'
      } shadow-2xs ${className}`}
    >
      <div className="flex items-start gap-3">
        {/* Ảnh thumbnail món hoặc placeholder */}
        <div className="relative w-16 h-16 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] overflow-hidden flex items-center justify-center flex-shrink-0">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              width={64}
              height={64}
              className={`object-cover w-full h-full ${isUnavailable ? 'grayscale opacity-60' : ''}`}
              unoptimized
            />
          ) : (
            <Coffee
              className={`w-6 h-6 ${isUnavailable ? 'text-[#A0A8A5]' : 'text-[#35977D]'}`}
              aria-hidden="true"
            />
          )}

          {/* Badge hết hàng chèn trên ảnh */}
          {isUnavailable && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-0.5">
              <span className="text-[9px] font-bold text-white bg-[#B42318] px-1 py-0.5 rounded leading-none text-center">
                Hết hàng
              </span>
            </div>
          )}
        </div>

        {/* Nội dung thông tin món */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4
              className={`text-sm font-bold truncate leading-tight ${
                isUnavailable ? 'text-[#727B77] line-through' : 'text-[#1D2522]'
              }`}
            >
              {item.name}
            </h4>

            {/* Nút xóa nhanh */}
            <button
              type="button"
              onClick={() => onRemove(item.lineId)}
              className="w-8 h-8 rounded-lg text-[#A0A8A5] hover:text-[#B42318] hover:bg-[#FEF3F2] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318] flex-shrink-0"
              title={`Xóa ${item.name} khỏi giỏ hàng`}
              aria-label={`Xóa món ${item.name} khỏi giỏ hàng`}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Đơn vị giá 1 phần */}
          <p className="text-xs font-semibold text-[#1D725E] mt-0.5">
            {formattedUnitPrice}
          </p>

          {/* Danh sách tùy chọn đã chọn */}
          {item.selectedOptions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.selectedOptions.map((opt) => (
                <span
                  key={opt.id}
                  className="text-[11px] text-[#55605C] bg-[#F7F8F7] border border-[#E9ECEA] px-1.5 py-0.5 rounded-md inline-flex items-center gap-1"
                >
                  <span>{opt.name}</span>
                  {opt.priceDeltaVnd > 0 && (
                    <span className="text-[#1D725E] font-medium">
                      +{new Intl.NumberFormat('vi-VN').format(opt.priceDeltaVnd)} đ
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Ghi chú món ăn nếu có */}
          {item.note && (
            <p className="text-xs text-[#55605C] italic mt-1 bg-[#F7F8F7] px-2 py-1 rounded-md border border-[#E9ECEA]/60 line-clamp-2">
              &ldquo;{item.note}&rdquo;
            </p>
          )}

          {/* Cảnh báo lỗi trạng thái */}
          {isUnavailable && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[#B42318]">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span>Món ăn hiện đã hết hàng. Vui lòng xóa món để tiếp tục.</span>
            </div>
          )}

          {hasPriceChanged && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[#B54708]">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span>Giá món đã thay đổi trên thực đơn mới nhất.</span>
            </div>
          )}

          {hasInvalidOptions && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[#B54708]">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span>Một số tùy chọn đã ngừng phục vụ.</span>
            </div>
          )}
        </div>
      </div>

      {/* Dải dưới: Bộ điều khiển số lượng, nút sửa tùy chọn và tổng tiền dòng */}
      <div className="mt-3 pt-2.5 border-t border-[#E9ECEA] flex items-center justify-between gap-2">
        {/* Nút sửa tùy chọn / ghi chú */}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="h-10 px-2.5 rounded-xl text-xs font-semibold text-[#1D725E] bg-[#E8F4F0] hover:bg-[#C6E7DC] flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label={`Chỉnh sửa tùy chọn và ghi chú cho ${item.name}`}
          >
            <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sửa</span>
          </button>
        )}

        {/* Bộ điều khiển số lượng đạt touch target >= 44px */}
        <div className="flex items-center gap-1 bg-[#F7F8F7] border border-[#E9ECEA] rounded-xl p-0.5">
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.lineId, -1)}
            className="w-10 h-10 rounded-lg bg-white border border-[#E9ECEA] flex items-center justify-center text-[#1D2522] hover:bg-[#F7F8F7] active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            title={item.quantity === 1 ? 'Xóa món khỏi giỏ' : 'Giảm 1 phần'}
            aria-label={`Giảm số lượng ${item.name}`}
          >
            {item.quantity === 1 ? (
              <Trash2 className="w-4 h-4 text-[#B42318]" aria-hidden="true" />
            ) : (
              <Minus className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <span
            className="w-8 text-center text-xs font-bold text-[#1D2522]"
            aria-label={`Số lượng hiện tại: ${item.quantity}`}
          >
            {item.quantity}
          </span>

          <button
            type="button"
            disabled={item.quantity >= 99 || isUnavailable}
            onClick={() => onUpdateQuantity(item.lineId, 1)}
            className="w-10 h-10 rounded-lg bg-white border border-[#E9ECEA] flex items-center justify-center text-[#1D2522] hover:bg-[#F7F8F7] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            title="Tăng 1 phần (tối đa 99 phần)"
            aria-label={`Tăng số lượng ${item.name}`}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Thành tiền dòng */}
        <div className="text-right">
          <span className="text-[10px] text-[#727B77] block leading-none">Thành tiền</span>
          <span className="text-sm font-bold text-[#1D2522] tracking-tight">
            {formattedLineTotal}
          </span>
        </div>
      </div>
    </div>
  );
};
