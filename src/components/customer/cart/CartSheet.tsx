'use client';

/**
 * CUSTOMER CART SHEET COMPONENT — QR Ordering Minimal MVP
 * Mã công việc: P2-G03
 *
 * Giao diện trọng tâm cho giỏ hàng khách hàng:
 * - Hiển thị dạng Bottom Sheet trên Mobile (<640px) và Slide-over Panel bên phải trên Desktop (>=640px).
 * - Tương thích 100% với phong cách Minimal Emerald (Primary #1D725E, nền trắng, viền #E9ECEA).
 * - Điều phối 2 bước (step):
 *   + Bước 1 ('cart'): Danh sách món, stepper tăng/giảm >=44px, sửa tùy chọn/ghi chú, xóa món.
 *   + Bước 2 ('review'): Tóm tắt trước đặt món, phân biệt rõ Dine-in vs Takeaway, disabled CTA ở Phase 2.
 * - Xử lý đầy đủ tất cả các trạng thái: Giỏ rỗng, Món hết hàng, Bàn chưa xác thực, Bộ nhớ bị giới hạn.
 * - Không tạo order, không thanh toán giả, không tạo mã đơn hay số FIFO.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  ShoppingBag,
  ArrowRight,
  Info,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import type { MenuItem } from '../../../../docs/contracts/types';
import type { CustomerCartState, CustomerCartActions, CartReadiness, CustomerCartItem } from './types';
import { CartLineItem } from './CartLineItem';
import { PreCheckoutReview } from './PreCheckoutReview';
import { EditCartItemDialog } from './EditCartItemDialog';

interface CartSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cartState: CustomerCartState;
  cartActions: CustomerCartActions;
  readiness: CartReadiness;
  isTakeaway?: boolean;
  tableLabel?: string;
  isTableVerified?: boolean;
  menuItems?: MenuItem[];
  onGoToVerifyTable?: () => void;
  className?: string;
}

export const CartSheet: React.FC<CartSheetProps> = ({
  isOpen,
  onClose,
  cartState,
  cartActions,
  readiness,
  isTakeaway = false,
  tableLabel = 'Bàn',
  isTableVerified = false,
  menuItems = [],
  onGoToVerifyTable,
  className = '',
}) => {
  // Trạng thái bước: 'cart' (xem danh sách món) | 'review' (xem lại trước đặt món)
  const [currentStep, setCurrentStep] = useState<'cart' | 'review'>('cart');
  // State mở dialog sửa món
  const [editingItem, setEditingItem] = useState<CustomerCartItem | null>(null);
  // State làm mới trước khi xem lại
  const [isRefreshingReview, setIsRefreshingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Reset về bước cart khi sheet được mở lại
  const [prevIsOpen, setPrevIsOpen] = useState<boolean>(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCurrentStep('cart');
      setEditingItem(null);
      setReviewError(null);
    }
  }

  // Đóng bằng phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !editingItem) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingItem, onClose]);

  // Xử lý mở màn hình xem lại trước khi đặt món (luôn refresh R01 + R03 mới nhất)
  const handleOpenReview = async () => {
    if (!readiness.canProceedToReview || subtotalVnd === null) return;
    setReviewError(null);
    if (cartActions.refresh) {
      setIsRefreshingReview(true);
      try {
        const res = await cartActions.refresh();
        setIsRefreshingReview(false);
        if (!res.ok) {
          setReviewError(res.issue.message || 'Không thể làm mới thực đơn.');
          return;
        }
      } catch {
        setIsRefreshingReview(false);
        setReviewError('Lỗi kết nối khi làm mới thực đơn từ máy chủ.');
        return;
      }
    }
    setCurrentStep('review');
  };

  if (!isOpen) return null;

  const { items, totalQuantity, subtotalVnd, isStorageAvailable } = cartState;
  const formattedSubtotal =
    subtotalVnd === null
      ? 'Không tính được tổng tạm tính'
      : new Intl.NumberFormat('vi-VN').format(subtotalVnd) + ' đ';

  // Tìm MenuItem gốc cho dialog sửa món nếu có
  const activeMenuItem = editingItem
    ? menuItems.find((m) => m.id === editingItem.menuItemId) || null
    : null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex sm:justify-end items-end sm:items-stretch animate-in fade-in duration-200 ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-sheet-title"
    >
      {/* Khung nội dung: Mobile Bottom Sheet (bo góc trên) hoặc Desktop Slide-over Panel */}
      <div
        className="w-full sm:max-w-md h-[90vh] sm:h-full bg-[#F5F6F5] rounded-t-3xl sm:rounded-none sm:rounded-l-3xl shadow-2xl border-t sm:border-t-0 sm:border-l border-[#E9ECEA] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-300 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {currentStep === 'review' ? (
          /* ===================================================================
              BƯỚC 2: MÀN HÌNH XEM LẠI TRƯỚC ĐẶT MÓN (PRE-CHECKOUT REVIEW)
             =================================================================== */
          <PreCheckoutReview
            items={items}
            subtotalVnd={subtotalVnd}
            totalQuantity={totalQuantity}
            isTakeaway={isTakeaway}
            tableLabel={tableLabel}
            isTableVerified={isTableVerified}
            readiness={readiness}
            cartActions={cartActions}
            onBackToCart={() => setCurrentStep('cart')}
            onGoToVerifyTable={() => {
              onClose();
              onGoToVerifyTable?.();
            }}
          />
        ) : (
          /* ===================================================================
              BƯỚC 1: DANH SÁCH MÓN ĐÃ CHỌN TRONG GIỎ HÀNG
             =================================================================== */
          <div className="flex flex-col h-full">
            {/* 1. Header Giỏ hàng */}
            <div className="p-4 bg-white border-b border-[#E9ECEA] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="cart-sheet-title" className="text-base font-bold text-[#1D2522]">
                      Giỏ hàng
                    </h3>
                    <span className="text-xs font-semibold text-[#1D725E] bg-[#E8F4F0] px-2 py-0.5 rounded-full">
                      {totalQuantity} món
                    </span>
                  </div>

                  {/* Mode Badge (Bàn / Mang đi) */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isTakeaway ? (
                      <span className="text-[11px] font-medium text-[#026AA2] bg-[#F0F9FF] px-1.5 py-0.2 rounded border border-[#B9E6FE]">
                        Mang đi · Nhận tại quầy
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-[#1D725E] bg-[#E8F4F0] px-1.5 py-0.2 rounded border border-[#C6E7DC]">
                        Dùng tại bàn · {tableLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Nút đóng (X) đạt touch target >= 44px */}
              <button
                type="button"
                onClick={onClose}
                className="w-11 h-11 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] text-[#55605C] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
                aria-label="Đóng giỏ hàng"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Cảnh báo storage bị hạn chế nếu có */}
            {!isStorageAvailable && (
              <div className="px-4 py-2 bg-[#FFFAEB] border-b border-[#FEDF89] text-[11px] text-[#B54708] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span>
                  Bộ nhớ tạm bị hạn chế (Private Browsing). Giỏ hàng chỉ lưu tạm trong phiên này.
                </span>
              </div>
            )}

            {/* Cảnh báo bàn chưa xác nhận trong chế độ Dine-in */}
            {!isTakeaway && !isTableVerified && items.length > 0 && (
              <div className="px-4 py-2.5 bg-[#FEF6EE] border-b border-[#F9DBAF] text-xs text-[#8A4D00] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#8A4D00]" aria-hidden="true" />
                  <span>Cần xác thực mã phiên bàn để gọi món.</span>
                </div>
                {onGoToVerifyTable && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToVerifyTable();
                    }}
                    className="text-xs font-bold text-[#8A4D00] underline hover:text-[#6C3C00]"
                  >
                    Xác thực ngay
                  </button>
                )}
              </div>
            )}

            {/* 2. Danh sách món cuộn mượt mà */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 ? (
                /* ===============================================================
                    TRẠNG THÁI GIỎ HÀNG RỖNG (EMPTY STATE)
                   =============================================================== */
                <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center mb-3">
                    <ShoppingBag className="w-8 h-8" aria-hidden="true" />
                  </div>
                  <h4 className="text-base font-bold text-[#1D2522]">Giỏ hàng đang trống</h4>
                  <p className="text-xs text-[#727B77] mt-1 max-w-xs">
                    Bạn chưa chọn món nào vào giỏ. Hãy xem thực đơn và chọn những món bạn yêu thích
                    nhé!
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-5 h-11 px-5 rounded-xl text-xs font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white transition-colors shadow-xs"
                  >
                    Chọn món ngay
                  </button>
                </div>
              ) : (
                /* ===============================================================
                    DANH SÁCH MÓN ĐÃ CHỌN
                   =============================================================== */
                <>
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
                      Món đã chọn ({totalQuantity})
                    </span>
                    <button
                      type="button"
                      onClick={cartActions.clearCart}
                      className="text-xs font-semibold text-[#B42318] hover:underline"
                    >
                      Xóa tất cả
                    </button>
                  </div>

                  {items.map((it) => (
                    <CartLineItem
                      key={it.lineId}
                      item={it}
                      onUpdateQuantity={cartActions.updateQuantity}
                      onRemove={cartActions.removeLine}
                      onEdit={(target) => setEditingItem(target)}
                    />
                  ))}

                  {/* Chú thích giá minh bạch */}
                  <div className="p-3 rounded-xl bg-white border border-[#E9ECEA] flex items-start gap-2 text-[11px] text-[#727B77]">
                    <Info className="w-3.5 h-3.5 text-[#35977D] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Giá hiển thị là tạm tính. Giá chính xác và tình trạng còn món sẽ được kiểm
                      tra khi gửi đơn.
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* 3. Khung Đáy: Tổng tạm tính & Nút Tiếp tục xem lại */}
            {items.length > 0 && (
              <div className="p-4 bg-white border-t border-[#E9ECEA] space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <span className="text-xs text-[#727B77] block">Tạm tính:</span>
                    <span className="text-lg font-bold text-[#1D2522] tracking-tight">
                      {formattedSubtotal}
                    </span>
                  </div>

                  <span className="text-xs font-medium text-[#727B77]">
                    ({totalQuantity} phần)
                  </span>
                </div>

                <button
                  type="button"
                  disabled={!readiness.canProceedToReview || subtotalVnd === null || isRefreshingReview}
                  onClick={handleOpenReview}
                  className={`w-full h-12 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
                    !readiness.canProceedToReview || subtotalVnd === null || isRefreshingReview
                      ? 'bg-[#F1F3F2] text-[#A0A8A5] cursor-not-allowed'
                      : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.99] text-white'
                  }`}
                  aria-label="Tiếp tục xem lại giỏ hàng"
                >
                  <span>{isRefreshingReview ? 'Đang cập nhật thực đơn...' : 'Tiếp tục xem lại đơn'}</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>

                {/* Thông báo lý do nếu không thể tiếp tục */}
                {reviewError ? (
                  <p className="text-[11px] text-[#B42318] text-center font-medium">
                    {reviewError}
                  </p>
                ) : subtotalVnd === null ? (
                  <p className="text-[11px] text-[#B42318] text-center font-medium">
                    Không thể tiếp tục do tổng tiền vượt quá giới hạn tính toán của quán.
                  </p>
                ) : readiness.hasUnavailableItems ? (
                  <p className="text-[11px] text-[#B42318] text-center font-medium">
                    Vui lòng xóa món đã hết hàng khỏi giỏ để tiếp tục.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hộp thoại chỉnh sửa tùy chọn món */}
      <EditCartItemDialog
        item={editingItem}
        menuItem={activeMenuItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        onSave={cartActions.editLine}
      />
    </div>
  );
};
