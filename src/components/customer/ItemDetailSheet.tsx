'use client';

import React, { useState, useEffect, useId } from 'react';
import Image from 'next/image';
import {
  X,
  Plus,
  Minus,
  Check,
  Coffee,
  Info,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react';
import type { MenuItem, MenuOption } from '../../../docs/contracts/types';

export interface SelectedItemPayload {
  menuItemId: string;
  quantity: number;
  optionIds: string[];
  note?: string;
  previewTotalVnd: number;
}

interface ItemDetailSheetProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  canAddToCart?: boolean;
  isTableVerified?: boolean;
  isTakeaway?: boolean;
  onSelectItem?: (selection: SelectedItemPayload) => void;
  className?: string;
}

/**
 * ItemDetailSheet — Khung trượt (Sheet / Dialog) hiển thị chi tiết món ăn và chọn tùy chọn (Options).
 * Tuân thủ yêu cầu Nhiệm vụ B (P2-G02 & P2-G03):
 * - Hiển thị ảnh lớn (hoặc placeholder sắc nét), tên, mô tả, giá cơ bản.
 * - Danh sách tùy chọn lấy từ data contract (`item.options`), tính tổng tiền tạm tính số nguyên VND.
 * - Cho phép chọn số lượng (1–99) và nhập ghi chú (tối đa 500 ký tự).
 * - Cảnh báo rõ ràng nếu bàn chưa xác thực hoặc nếu món hết hàng.
 * - Phát event callback `onSelectItem` để nạp vào giỏ hàng thật.
 */
export const ItemDetailSheet: React.FC<ItemDetailSheetProps> = ({
  item,
  isOpen,
  onClose,
  canAddToCart = true,
  isTableVerified = false,
  isTakeaway = false,
  onSelectItem,
  className = '',
}) => {
  const titleId = useId();
  const descId = useId();

  // State cục bộ cho sheet
  const [prevItemId, setPrevItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string>('');
  const [isAddedFeedback, setIsAddedFeedback] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reset state khi đổi món theo mẫu chuẩn React mà không dùng setState trong effect
  if (item && item.id !== prevItemId) {
    setPrevItemId(item.id);
    setQuantity(1);
    setSelectedOptionIds(new Set());
    setNote('');
    setIsAddedFeedback(false);
    setActionError(null);
  }

  // Đóng khi nhấn ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) {
    return null;
  }

  // Tùy chọn chỉ lấy từ contract
  const availableOptions: MenuOption[] = item.options || [];

  // Toggle chọn / bỏ chọn một option
  const handleToggleOption = (option: MenuOption) => {
    if (!option.available) return;
    setSelectedOptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(option.id)) {
        next.delete(option.id);
      } else {
        next.add(option.id);
      }
      return next;
    });
  };

  // Tính tổng tiền tạm tính hiển thị cho khách
  const optionDeltasTotal = availableOptions
    .filter((opt) => selectedOptionIds.has(opt.id))
    .reduce((sum, opt) => sum + opt.priceDeltaVnd, 0);

  const unitPriceVnd = item.priceVnd + optionDeltasTotal;
  const previewTotalVnd = unitPriceVnd * quantity;

  // Xử lý xác nhận chọn món
  const handleConfirmSelect = () => {
    if (!item.available || !canAddToCart) return;

    if (onSelectItem) {
      const res = onSelectItem({
        menuItemId: item.id,
        quantity,
        optionIds: Array.from(selectedOptionIds),
        note: note.trim() || undefined,
        previewTotalVnd,
      }) as unknown as { ok?: boolean; issue?: { message?: string } } | undefined;

      if (res && res.ok === false) {
        setActionError(res.issue?.message || 'Không thể thêm món vào giỏ hàng.');
        return;
      }
    }

    setActionError(null);
    setIsAddedFeedback(true);
    setTimeout(() => {
      setIsAddedFeedback(false);
      onClose();
    }, 400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={item.description ? descId : undefined}
    >
      {/* Backdrop click to close */}
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Container: Bottom sheet trên mobile, Dialog giữa màn hình trên tablet/desktop */}
      <div
        className={`w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-[28px] sm:rounded-3xl border-t sm:border border-[#E9ECEA] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250 ${className}`}
      >
        {/* Thanh cầm kéo nhẹ trên mobile (Drag handle indicator) */}
        <div className="w-12 h-1.5 bg-[#E9ECEA] rounded-full mx-auto mt-2.5 sm:hidden" />

        {/* Header với nút đóng */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-[#E9ECEA]/60">
          <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
            Chi tiết món ăn
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F7F8F7] hover:bg-[#E9ECEA] flex items-center justify-center text-[#727B77] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label="Đóng chi tiết món"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Vùng nội dung cuộn được khi danh sách topping/mô tả dài */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
          {/* Ảnh món ăn lớn hoặc Placeholder */}
          <div className="relative w-full aspect-video rounded-2xl bg-[#F7F8F7] border border-[#E9ECEA] overflow-hidden flex items-center justify-center">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-[#727B77]">
                <div className="w-14 h-14 rounded-2xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center shadow-xs">
                  <Coffee className="w-8 h-8" aria-hidden="true" />
                </div>
                <span className="text-xs font-medium text-[#727B77] mt-2">
                  Phở Việt QR · Món ngon
                </span>
              </div>
            )}

            {/* Badge hết hàng nếu có */}
            {!item.available && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#B42318] text-white uppercase tracking-wider shadow-sm">
                  Tạm hết món hôm nay
                </span>
              </div>
            )}
          </div>

          {/* Tiêu đề, giá và mô tả */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-lg sm:text-xl font-bold text-[#1D2522] leading-snug">
                {item.name}
              </h2>
              <span className="text-base sm:text-lg font-bold text-[#1D725E] flex-shrink-0">
                {new Intl.NumberFormat('vi-VN').format(item.priceVnd)} đ
              </span>
            </div>

            {item.description && (
              <p id={descId} className="text-xs sm:text-sm text-[#727B77] mt-1.5 leading-relaxed">
                {item.description}
              </p>
            )}
          </div>

          {/* Danh sách Tùy chọn món (Options) từ Contract */}
          {availableOptions.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[#E9ECEA]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#1D2522] uppercase tracking-wider">
                  Tùy chọn thêm
                </h3>
                <span className="text-[11px] text-[#727B77]">Tùy chọn</span>
              </div>

              <div className="space-y-2" role="group" aria-label="Danh sách tùy chọn">
                {availableOptions.map((option) => {
                  const isChecked = selectedOptionIds.has(option.id);
                  const isOptAvailable = option.available;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!isOptAvailable}
                      onClick={() => handleToggleOption(option)}
                      role="checkbox"
                      aria-checked={isChecked}
                      className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-all ${
                        !isOptAvailable
                          ? 'bg-[#F7F8F7] border-[#E9ECEA] opacity-50 cursor-not-allowed'
                          : isChecked
                          ? 'bg-[#E8F4F0]/60 border-[#35977D] text-[#1D2522]'
                          : 'bg-white border-[#E9ECEA] hover:border-[#C6E7DC] text-[#1D2522]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Checkbox vuông bo tròn */}
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                            isChecked
                              ? 'bg-[#1D725E] text-white'
                              : 'border border-[#CBD5E1] bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />}
                        </div>
                        <span className="text-xs sm:text-sm font-medium truncate">
                          {option.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-xs font-semibold text-[#1D725E]">
                          {option.priceDeltaVnd > 0
                            ? `+${new Intl.NumberFormat('vi-VN').format(option.priceDeltaVnd)} đ`
                            : 'Miễn phí'}
                        </span>
                        {!isOptAvailable && (
                          <span className="text-[10px] text-[#B42318] bg-[#FEF3F2] px-1.5 py-0.5 rounded">
                            Hết
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ô nhập ghi chú món ăn */}
          <div className="space-y-1.5 pt-2 border-t border-[#E9ECEA]">
            <div className="flex items-center justify-between">
              <label htmlFor="item-note-input" className="text-xs font-bold text-[#1D2522] uppercase tracking-wider">
                Ghi chú cho món ăn
              </label>
              <span className="text-[11px] text-[#727B77]">{note.length}/500</span>
            </div>
            <textarea
              id="item-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Ví dụ: ít đường, 70% đá, không hành..."
              rows={2}
              className="w-full p-3 bg-[#F7F8F7] border border-[#E9ECEA] rounded-xl text-xs text-[#1D2522] placeholder-[#727B77] focus:outline-none focus:ring-2 focus:ring-[#35977D] focus:bg-white transition-all resize-none"
            />
          </div>

          {/* Bộ điều khiển số lượng (Quantity Selector) */}
          <div className="flex items-center justify-between pt-2 border-t border-[#E9ECEA]">
            <div>
              <span className="text-xs font-bold text-[#1D2522] block uppercase tracking-wider">
                Số lượng
              </span>
              <span className="text-[11px] text-[#727B77]">Tối đa 99 phần mỗi lượt</span>
            </div>

            <div className="flex items-center gap-3 bg-[#F7F8F7] border border-[#E9ECEA] rounded-xl p-1">
              <button
                type="button"
                disabled={quantity <= 1 || !item.available}
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="w-8 h-8 rounded-lg bg-white border border-[#E9ECEA] flex items-center justify-center text-[#1D2522] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F7F8F7] transition-colors focus:outline-none"
                aria-label="Giảm 1 phần"
              >
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <span className="w-7 text-center text-sm font-bold text-[#1D2522]">
                {quantity}
              </span>

              <button
                type="button"
                disabled={quantity >= 99 || !item.available}
                onClick={() => setQuantity((prev) => Math.min(99, prev + 1))}
                className="w-8 h-8 rounded-lg bg-white border border-[#E9ECEA] flex items-center justify-center text-[#1D2522] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F7F8F7] transition-colors focus:outline-none"
                aria-label="Tăng 1 phần"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Chú thích giá tạm tính minh bạch */}
          <div className="p-3 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-start gap-2 text-[11px] text-[#727B77]">
            <Info className="w-3.5 h-3.5 text-[#35977D] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Giá hiển thị là giá tạm tính tại thời điểm xem menu. Giá chính xác sẽ được máy chủ
              xác thực khi gửi đơn hàng.
            </span>
          </div>

          {/* Cảnh báo bàn chưa xác nhận nếu có */}
          {!isTableVerified && !isTakeaway && (
            <div className="p-3 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] flex items-start gap-2 text-xs text-[#8A4D00]">
              <AlertCircle className="w-4 h-4 text-[#8A4D00] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Món sẽ được thêm vào giỏ hàng. Bạn cần xác thực mã phiên bàn trước khi gửi đơn đặt món.
              </span>
            </div>
          )}
        </div>

        {/* Footer: Tổng tiền tạm tính & Nút hành động */}
        <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-2">
          {actionError && (
            <div className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] flex items-center gap-2 text-xs text-[#B42318]">
              <AlertCircle className="w-4 h-4 text-[#B42318] flex-shrink-0" aria-hidden="true" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-[#727B77]">Tổng tạm tính:</span>
            <span className="text-base font-bold text-[#1D2522]">
              {new Intl.NumberFormat('vi-VN').format(previewTotalVnd)} đ
            </span>
          </div>

          <button
            type="button"
            disabled={!item.available || !canAddToCart || isAddedFeedback}
            onClick={handleConfirmSelect}
            className={`w-full h-12 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
              isAddedFeedback
                ? 'bg-[#1D725E] text-white'
                : !item.available
                ? 'bg-[#F1F3F2] text-[#A0A8A5] cursor-not-allowed'
                : !canAddToCart
                ? 'bg-[#FAFBFB] border border-[#E9ECEA] text-[#727B77] cursor-not-allowed'
                : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-95 text-white'
            }`}
          >
            {isAddedFeedback ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />
                <span>Đã thêm vào giỏ hàng!</span>
              </>
            ) : !item.available ? (
              <span>Món ăn hiện đã hết hàng</span>
            ) : !canAddToCart ? (
              <span>Cần xác nhận bàn để chọn món</span>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                <span>
                  Thêm vào giỏ · {new Intl.NumberFormat('vi-VN').format(previewTotalVnd)} đ
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
