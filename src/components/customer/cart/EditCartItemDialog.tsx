'use client';

/**
 * EDIT CART ITEM DIALOG — QR Ordering Minimal MVP
 * Mã công việc: P2-G03
 *
 * Hộp thoại cho phép khách hàng chỉnh sửa tùy chọn, ghi chú hoặc số lượng
 * của một món đã nằm trong giỏ mà không cần phải xóa đi chọn lại.
 */

import React, { useState, useEffect } from 'react';
import { X, Check, Plus, Minus } from 'lucide-react';
import type { MenuItem } from '../../../../docs/contracts/types';
import type { CustomerCartItem } from './types';
import { calculateLineTotalVnd } from './types';

interface EditCartItemDialogProps {
  item: CustomerCartItem | null;
  menuItem?: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    lineId: string,
    updates: {
      optionIds: string[];
      note?: string;
      quantity?: number;
    }
  ) => void;
}

export const EditCartItemDialog: React.FC<EditCartItemDialogProps> = ({
  item,
  menuItem,
  isOpen,
  onClose,
  onSave,
}) => {
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);

  // Điền dữ liệu ban đầu khi mở dialog theo mẫu chuẩn React
  const [prevLineId, setPrevLineId] = useState<string | null>(null);
  if (item && isOpen && item.lineId !== prevLineId) {
    setPrevLineId(item.lineId);
    setSelectedOptionIds(new Set(item.selectedOptions.map((o) => o.id)));
    setNote(item.note || '');
    setQuantity(item.quantity);
  } else if (!isOpen && prevLineId !== null) {
    setPrevLineId(null);
  }

  // Hỗ trợ đóng bằng phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  // Lấy danh sách options từ menuItem nếu có, hoặc từ options đã lưu
  const availableOptions =
    menuItem?.options ||
    item.selectedOptions.map((o) => ({
      id: o.id,
      name: o.name,
      priceDeltaVnd: o.priceDeltaVnd,
      available: true,
    }));

  const handleToggleOption = (optId: string) => {
    setSelectedOptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(optId)) {
        next.delete(optId);
      } else {
        next.add(optId);
      }
      return next;
    });
  };

  const handleSave = () => {
    onSave(item.lineId, {
      optionIds: Array.from(selectedOptionIds),
      note: note.trim() || undefined,
      quantity,
    });
    onClose();
  };

  const currentSelectedOptions = availableOptions
    .filter((o) => selectedOptionIds.has(o.id))
    .map((o) => ({
      id: o.id,
      name: o.name,
      priceDeltaVnd: o.priceDeltaVnd,
    }));

  const currentTotalVnd = calculateLineTotalVnd(
    item.basePriceVnd,
    currentSelectedOptions,
    quantity
  );

  return (
    <div
      className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-cart-item-title"
    >
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-xl border border-[#E9ECEA] flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E9ECEA]">
          <div>
            <h3 id="edit-cart-item-title" className="text-sm font-bold text-[#1D2522]">
              Sửa tùy chọn món
            </h3>
            <p className="text-xs text-[#1D725E] font-medium mt-0.5">{item.name}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F7F8F7] hover:bg-[#E9ECEA] flex items-center justify-center text-[#727B77]"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Nội dung tùy chọn & ghi chú cuộn */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {/* Tùy chọn */}
          {availableOptions.length > 0 && (
            <div>
              <p className="text-xs font-bold text-[#1D2522] mb-2">Tùy chọn thêm:</p>
              <div className="space-y-1.5">
                {availableOptions.map((opt) => {
                  const isChecked = selectedOptionIds.has(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleToggleOption(opt.id)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-colors ${
                        isChecked
                          ? 'border-[#1D725E] bg-[#E8F4F0] text-[#1D725E] font-semibold'
                          : 'border-[#E9ECEA] hover:bg-[#F7F8F7] text-[#1D2522]'
                      }`}
                    >
                      <span>{opt.name}</span>
                      <div className="flex items-center gap-2">
                        {opt.priceDeltaVnd > 0 && (
                          <span className="text-[11px] text-[#727B77]">
                            +{new Intl.NumberFormat('vi-VN').format(opt.priceDeltaVnd)} đ
                          </span>
                        )}
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                            isChecked
                              ? 'bg-[#1D725E] border-[#1D725E] text-white'
                              : 'border-[#CED3D0] bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ghi chú */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="edit-item-note" className="text-xs font-bold text-[#1D2522]">
                Ghi chú cho bếp:
              </label>
              <span className="text-[10px] text-[#727B77]">{note.length}/500</span>
            </div>
            <textarea
              id="edit-item-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="VD: Không hành, ít đá, nhiều tương..."
              rows={2}
              className="w-full p-2.5 rounded-xl border border-[#E9ECEA] bg-[#F7F8F7] text-xs text-[#1D2522] focus:bg-white focus:outline-none focus:border-[#1D725E]"
            />
          </div>

          {/* Số lượng */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-[#1D2522]">Số lượng:</span>
            <div className="flex items-center gap-1 bg-[#F7F8F7] border border-[#E9ECEA] rounded-xl p-0.5">
              <button
                type="button"
                disabled={quantity <= 1}
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="w-8 h-8 rounded-lg bg-white border border-[#E9ECEA] flex items-center justify-center text-[#1D2522] disabled:opacity-40"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-7 text-center text-xs font-bold text-[#1D2522]">
                {quantity}
              </span>
              <button
                type="button"
                disabled={quantity >= 99}
                onClick={() => setQuantity((prev) => Math.min(99, prev + 1))}
                className="w-8 h-8 rounded-lg bg-white border border-[#E9ECEA] flex items-center justify-center text-[#1D2522] disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#E9ECEA] flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl text-xs font-bold border border-[#E9ECEA] text-[#55605C] hover:bg-[#F7F8F7]"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 h-11 rounded-xl text-xs font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white flex items-center justify-center gap-1 shadow-xs"
          >
            <span>Cập nhật · {new Intl.NumberFormat('vi-VN').format(currentTotalVnd)} đ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
