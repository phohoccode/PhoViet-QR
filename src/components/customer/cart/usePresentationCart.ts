'use client';

/**
 * USE PRESENTATION CART HOOK — QR Ordering Minimal MVP
 * Mã công việc: P2-G03
 *
 * Tích hợp chính thức với Cart Domain Facade (src/features/cart/** do Codex bàn giao):
 * - Quản lý giỏ hàng chuẩn hoá theo QR store (createCartStore + useCart).
 * - Kết nối trực tiếp view.lines (CartLineView) thành danh sách CustomerCartItem cho UI.
 * - Hỗ trợ tràn số an toàn: subtotalVnd === null khi tổng tiền vượt số nguyên an toàn.
 * - Tôn trọng quyền riêng tư: Ghi chú chỉ lưu trong RAM, đánh dấu noteNeedsReview khi tải lại.
 * - Tuân thủ gate readiness từ getCheckoutReadiness: empty, menu_refresh_needed, verify_table_session, cart_invalid, ready_to_review.
 * - Disabled gửi đơn thật ở Phase 2 (chỉ preview nháp đơn qua prepareOrderDraft).
 */

import { useState, useMemo, useCallback } from 'react';
import type { MenuItem } from '../../../../docs/contracts/types';
import {
  createCartStore,
  useCart,
  type CartStore,
  type CartResult,
  type AddCartLineInput,
} from '@/features/cart';
import type {
  CustomerCartItem,
  CustomerCartState,
  CustomerCartActions,
  CartReadiness,
} from './types';

export interface UsePresentationCartProps {
  qrCode?: string;
  store?: CartStore;
  isTableVerified?: boolean;
  isTakeaway?: boolean;
  menuItems?: MenuItem[];
}

export function usePresentationCart({
  qrCode = 'DEFAULT_QR',
  store,
  menuItems = [],
}: UsePresentationCartProps = {}) {
  // Store ổn định per QR code nếu không được truyền từ container
  const [internalStore] = useState(() => store ?? createCartStore({ qrCode }));
  const activeStore = store ?? internalStore;

  // Sử dụng hook chính thức từ Codex cart facade
  const cart = useCart(activeStore);
  const displayMenuItems = cart.state.menu?.items ?? menuItems;

  // 1. Chuyển đổi CartLineView[] thành CustomerCartItem[] cho giao diện
  const items: CustomerCartItem[] = useMemo(() => {
    return cart.view.lines.map((line) => {
      const menuItem = displayMenuItems.find((m) => m.id === line.menuItemId);

      // Lấy danh sách options từ snapshot và menuItem
      const selectedOptions = line.snapshot.options.map((optSnapshot, idx) => {
        const optionDef = menuItem?.options?.find((o) => o.id === optSnapshot.id);
        const optionName =
          line.optionNames[idx] || optionDef?.name || optSnapshot.id;
        return {
          id: optSnapshot.id,
          name: optionName,
          priceDeltaVnd: optSnapshot.priceDeltaVnd,
        };
      });

      const isUnavailable = line.issues.some(
        (i) => i.code === 'ITEM_UNAVAILABLE' || i.code === 'ITEM_NOT_FOUND'
      );
      const priceChanged = line.issues.some(
        (i) => i.code === 'PRICE_CHANGED' || i.code === 'MENU_CHANGED'
      );
      const invalidOptionIds = line.issues
        .filter((i) => i.code === 'INVALID_OPTION')
        .map((i) => i.lineKey || '');

      return {
        lineId: line.lineKey,
        menuItemId: line.menuItemId,
        name: line.name || menuItem?.name || 'Món ăn',
        basePriceVnd: line.snapshot.basePriceVnd,
        quantity: line.quantity,
        selectedOptions,
        note: line.note,
        imageUrl: menuItem?.imageUrl || null,
        available: !isUnavailable,
        priceChanged,
        invalidOptionIds,
        noteNeedsReview: line.noteNeedsReview,
        proposedUnitPriceVnd: line.proposedUnitPriceVnd,
        estimatedLineTotalVnd: line.estimatedLineTotalVnd,
        issues: line.issues,
      };
    });
  }, [cart.view.lines, displayMenuItems]);

  // 2. Trạng thái tổng quát của giỏ hàng
  const cartState: CustomerCartState = useMemo(() => {
    const isStorageAvailable = !cart.view.issues.some(
      (i) => i.code === 'STORAGE_UNAVAILABLE'
    );
    const isStale = cart.view.issues.some(
      (i) => i.code === 'MENU_REFRESH_NEEDED' || i.code === 'OFFLINE'
    );

    return {
      items,
      totalQuantity: cart.view.itemCount,
      subtotalVnd: cart.view.estimatedSubtotalVnd, // null nếu tràn số an toàn!
      isStorageAvailable,
      isStale,
      notices: cart.view.issues,
    };
  }, [items, cart.view]);

  // 3. Tính toán tính sẵn sàng (Readiness) theo gate từ domain của Codex
  const readiness: CartReadiness = useMemo(() => {
    const status = cart.checkoutReadiness.status;
    const issues = cart.checkoutReadiness.issues;

    const hasUnavailableItems = items.some((it) => !it.available);
    const hasPriceChanges = items.some((it) => !!it.priceChanged);
    const hasInvalidOptions = items.some(
      (it) => (it.invalidOptionIds?.length || 0) > 0
    );
    const noteReviewRequired = items.some((it) => !!it.noteNeedsReview);
    const contextChanged = cart.state.contextNeedsReview;

    // Chỉ có thể sang bước review khi:
    // - Giỏ không rỗng
    // - Tổng tiền không bị overflow (khác null)
    // - Không có món hết hàng
    const canProceedToReview =
      !cart.view.isEmpty &&
      cart.view.estimatedSubtotalVnd !== null &&
      !hasUnavailableItems;

    return {
      status,
      issues,
      canProceedToReview,
      canSubmitOrder: false, // Phase 2: Luôn disabled
      tableNeedsVerification: status === 'verify_table_session',
      hasUnavailableItems,
      hasPriceChanges,
      hasInvalidOptions,
      noteReviewRequired,
      contextChanged,
      isEmpty: cart.view.isEmpty,
      blockingReasons: issues.map((i) => i.message),
    };
  }, [cart.checkoutReadiness, cart.view, cart.state.contextNeedsReview, items]);

  // 4. Các hành động Cart Facade
  const addLine = useCallback(
    (
      payload:
        | {
            menuItem: MenuItem;
            quantity: number;
            optionIds: string[];
            note?: string | null;
          }
        | AddCartLineInput
    ): CartResult => {
      const menuItemId =
        'menuItemId' in payload ? payload.menuItemId : payload.menuItem.id;
      const note = payload.note ? payload.note.trim() : null;

      return cart.addLine({
        menuItemId,
        quantity: payload.quantity,
        optionIds: payload.optionIds,
        note,
      });
    },
    [cart]
  );

  const updateQuantity = useCallback(
    (lineId: string, quantityOrDelta: number): CartResult => {
      const line = cart.view.lines.find((l) => l.lineKey === lineId);
      if (!line) {
        return {
          ok: false,
          issue: {
            code: 'ITEM_NOT_FOUND',
            message: 'Món không tồn tại trong giỏ hàng.',
          },
        };
      }

      // Hỗ trợ cả số lượng tuyệt đối lẫn delta (+1 / -1)
      let targetQuantity: number;
      if (quantityOrDelta === 1) {
        targetQuantity = line.quantity + 1;
      } else if (quantityOrDelta === -1) {
        targetQuantity = line.quantity - 1;
      } else {
        targetQuantity = quantityOrDelta;
      }

      if (targetQuantity <= 0) {
        return cart.removeLine(lineId);
      }
      return cart.updateQuantity(lineId, targetQuantity);
    },
    [cart]
  );

  const setQuantity = useCallback(
    (lineId: string, quantity: number): CartResult => {
      if (quantity <= 0) {
        return cart.removeLine(lineId);
      }
      return cart.updateQuantity(lineId, quantity);
    },
    [cart]
  );

  const removeLine = useCallback(
    (lineId: string): CartResult => {
      return cart.removeLine(lineId);
    },
    [cart]
  );

  const clearCart = useCallback((): CartResult => {
    return cart.clear();
  }, [cart]);

  const editLine = useCallback(
    (
      lineId: string,
      updates: {
        optionIds: string[];
        note?: string;
        quantity?: number;
      }
    ): CartResult => {
      const existing = cart.state.lines.find((l) => l.lineKey === lineId);
      if (!existing) {
        return {
          ok: false,
          issue: {
            code: 'ITEM_NOT_FOUND',
            message: 'Món không tồn tại trong giỏ.',
          },
        };
      }

      const optIdsSorted = [...updates.optionIds].sort();
      const existingOptIdsSorted = [...existing.optionIds].sort();
      const optionsChanged =
        JSON.stringify(optIdsSorted) !== JSON.stringify(existingOptIdsSorted);
      const targetNote =
        updates.note !== undefined ? (updates.note.trim() || null) : existing.note;
      const noteChanged = targetNote !== existing.note;
      const targetQuantity =
        updates.quantity !== undefined ? updates.quantity : existing.quantity;

      // Nếu không đổi options và không đổi note (và không cần review note):
      // Chỉ cập nhật số lượng trực tiếp trên dòng hiện tại
      if (!optionsChanged && !noteChanged && !existing.noteNeedsReview) {
        if (targetQuantity !== existing.quantity) {
          return cart.updateQuantity(lineId, targetQuantity);
        }
        return { ok: true, value: undefined };
      }

      // Xử lý chỉnh sửa nguyên tử (atomic edit) để bảo toàn ngữ nghĩa gộp (merge semantics) của domain:
      // Tách dòng cũ ra trước, sau đó addLine với options, note và quantity mục tiêu.
      // Nếu trùng với dòng khác đã có trong giỏ, addLine sẽ tự động gộp (ví dụ: B=2 + A=3 -> B=5).
      const removeRes = cart.removeLine(lineId);
      if (!removeRes.ok) return removeRes;

      const addRes = cart.addLine({
        menuItemId: existing.menuItemId,
        optionIds: updates.optionIds,
        note: targetNote,
        quantity: targetQuantity,
      });

      if (!addRes.ok) {
        // Rollback hoàn tác lại dòng ban đầu nếu addLine thất bại (ví dụ: vượt giới hạn giỏ)
        cart.addLine({
          menuItemId: existing.menuItemId,
          optionIds: existing.optionIds,
          note: existing.note,
          quantity: existing.quantity,
        });
        return addRes;
      }

      return { ok: true, value: undefined };
    },
    [cart]
  );

  const cartActions: CustomerCartActions = useMemo(
    () => ({
      addLine,
      updateQuantity,
      setQuantity,
      removeLine,
      editLine,
      clearCart,
      refresh: cart.refresh,
      confirmReview: cart.confirmReview,
      confirmContextChange: cart.confirmContextChange,
      prepareOrderDraft: cart.prepareOrderDraft,
    }),
    [
      addLine,
      updateQuantity,
      setQuantity,
      removeLine,
      editLine,
      clearCart,
      cart.refresh,
      cart.confirmReview,
      cart.confirmContextChange,
      cart.prepareOrderDraft,
    ]
  );

  return {
    cartStore: activeStore,
    cart,
    cartState,
    cartActions,
    readiness,
  };
}
