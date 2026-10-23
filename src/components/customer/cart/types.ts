/**
 * CUSTOMER CART TYPES & PRESENTATION INTERFACES — QR Ordering Minimal MVP
 * Mã công việc: P2-G03
 *
 * Tuân thủ 100% docs/contracts/types.ts:
 * - CartLine: { menuItemId, quantity, optionIds, note }
 * - CreateOrderInput: { qrCode, clientRequestId, items, note }
 *
 * Ghi chú tích hợp:
 * WAITING_FOR_CODEX: Interface này được thiết kế để kết nối trực tiếp với
 * Cart Facade do Codex bàn giao trong P2-C03 (src/features/cart/**).
 * Tuyệt đối không tự viết logic thanh toán hay tạo order giả.
 */

import type { MenuItem, Id, MoneyVnd } from '../../../../docs/contracts/types';
import type {
  CartIssue,
  CheckoutStatus,
  CartResult,
  OrderDraft,
  AddCartLineInput,
} from '@/features/cart';

/**
 * Tùy chọn món ăn đã chọn trong giỏ hàng
 */
export interface SelectedCartOption {
  id: Id;
  name: string;
  priceDeltaVnd: MoneyVnd;
}

/**
 * Một dòng món ăn trong giỏ hàng (Cart Line Item)
 * Mở rộng từ CartLine contract để phục vụ hiển thị UI
 */
export interface CustomerCartItem {
  /** ID duy nhất định danh dòng trong giỏ (tương đương lineKey trong CartLineView) */
  lineId: string;
  /** ID món ăn theo contract */
  menuItemId: Id;
  /** Tên món hiển thị */
  name: string;
  /** Giá cơ bản món ăn (VND) */
  basePriceVnd: MoneyVnd;
  /** Số lượng món (1..99) */
  quantity: number;
  /** Danh sách tùy chọn đã chọn */
  selectedOptions: SelectedCartOption[];
  /** Ghi chú đặc biệt cho món (tối đa 500 ký tự) */
  note: string | null;
  /** URL ảnh món hoặc null */
  imageUrl: string | null;

  /* --- Các trạng thái xác thực dữ liệu từ thực đơn --- */
  /** Món còn phục vụ hay đã hết hàng */
  available: boolean;
  /** Giá món đã bị thay đổi so với thực đơn mới nhất */
  priceChanged?: boolean;
  /** Danh sách ID tùy chọn không còn hợp lệ */
  invalidOptionIds?: string[];
  /** Ghi chú cần người dùng xác nhận lại sau reload trang */
  noteNeedsReview?: boolean;
  /** Đơn giá đề xuất mới từ menu revision mới */
  proposedUnitPriceVnd?: MoneyVnd | null;
  /** Thành tiền dòng ước tính từ domain */
  estimatedLineTotalVnd?: MoneyVnd | null;
  /** Danh sách các cảnh báo / lỗi cụ thể của dòng */
  issues?: CartIssue[];
}

/**
 * Tổng quan trạng thái giỏ hàng
 */
export interface CustomerCartState {
  /** Danh sách các món trong giỏ */
  items: CustomerCartItem[];
  /** Tổng số lượng các phần món */
  totalQuantity: number;
  /** Tổng tiền tạm tính số nguyên VND (hoặc null nếu tràn số an toàn) */
  subtotalVnd: MoneyVnd | null;
  /** Trình duyệt có hỗ trợ lưu trữ cục bộ (session/localStorage) */
  isStorageAvailable: boolean;
  /** Thực đơn có bị stale hay cần làm mới */
  isStale?: boolean;
  /** Thông báo lỗi / cảnh báo toàn cục từ cart facade */
  notices?: CartIssue[];
}

/**
 * Bộ hành động tương tác với giỏ hàng (Cart Facade Actions)
 */
export interface CustomerCartActions {
  /** Thêm món vào giỏ với tùy chọn, số lượng và ghi chú */
  addLine: (
    payload:
      | {
          menuItem: MenuItem;
          quantity: number;
          optionIds: string[];
          note?: string | null;
        }
      | AddCartLineInput
  ) => CartResult;
  /** Tăng/giảm số lượng món theo delta (+1 / -1) hoặc số lượng tuyệt đối */
  updateQuantity: (lineId: string, quantityOrDelta: number) => CartResult;
  /** Đặt số lượng cụ thể (1..99) */
  setQuantity: (lineId: string, quantity: number) => CartResult;
  /** Xóa món khỏi giỏ */
  removeLine: (lineId: string) => CartResult;
  /** Sửa tùy chọn hoặc ghi chú của món đã có trong giỏ */
  editLine: (
    lineId: string,
    updates: {
      optionIds: string[];
      note?: string;
      quantity?: number;
    }
  ) => CartResult;
  /** Làm trống giỏ hàng */
  clearCart: () => CartResult;
  /** Làm mới giỏ hàng và thực đơn trước review */
  refresh?: () => Promise<CartResult>;
  /** Chấp nhận thay đổi giá/menu mới sau khi xem lại */
  confirmReview?: () => CartResult;
  /** Xác nhận chuyển ngữ cảnh phiên bàn */
  confirmContextChange?: () => CartResult;
  /** Chuẩn bị bản nháp đơn hàng */
  prepareOrderDraft?: () => CartResult<OrderDraft>;
}

/**
 * Đánh giá tính sẵn sàng trước khi xem lại (Readiness Check)
 */
export interface CartReadiness {
  /** Trạng thái gate theo Codex Cart domain */
  status?: CheckoutStatus;
  /** Đủ điều kiện để chuyển sang bước xem lại (Review) */
  canProceedToReview: boolean;
  /** Đủ điều kiện để gửi đơn (ở Phase 3) - Luôn disabled ở Phase 2 */
  canSubmitOrder: boolean;
  /** Bàn chưa được xác minh mã phiên (đối với QR Tại bàn) */
  tableNeedsVerification: boolean;
  /** Trong giỏ có món đã hết hàng */
  hasUnavailableItems: boolean;
  /** Trong giỏ có món bị đổi giá */
  hasPriceChanges: boolean;
  /** Trong giỏ có tùy chọn không hợp lệ */
  hasInvalidOptions: boolean;
  /** Có ghi chú cần xác nhận lại */
  noteReviewRequired?: boolean;
  /** Phiên bàn đã thay đổi cần xác nhận */
  contextChanged?: boolean;
  /** Giỏ hàng đang rỗng */
  isEmpty: boolean;
  /** Danh sách thông báo giải thích cụ thể cho khách */
  blockingReasons: string[];
  /** Danh sách issue domain */
  issues?: CartIssue[];
}

/**
 * Payload để mở hộp thoại chỉnh sửa món trong giỏ
 */
export interface EditCartItemPayload {
  lineId: string;
  menuItem: MenuItem;
  selectedOptionIds: Set<string>;
  quantity: number;
  note: string;
}

/**
 * Hàm tiện ích: Tính đơn giá 1 phần món (Giá gốc + Tổng delta các tùy chọn)
 */
export function calculateUnitPriceVnd(
  basePriceVnd: MoneyVnd,
  options: SelectedCartOption[]
): MoneyVnd {
  const optionsDelta = options.reduce((sum, opt) => sum + (Number(opt.priceDeltaVnd) || 0), 0);
  return Math.max(0, basePriceVnd + optionsDelta);
}

/**
 * Hàm tiện ích: Tính tổng tiền 1 dòng món (Đơn giá * Số lượng)
 */
export function calculateLineTotalVnd(
  basePriceVnd: MoneyVnd,
  options: SelectedCartOption[],
  quantity: number
): MoneyVnd {
  const unitPrice = calculateUnitPriceVnd(basePriceVnd, options);
  return unitPrice * Math.max(1, Math.min(99, quantity));
}

/**
 * Hàm tiện ích: Tạo lineId duy nhất từ menuItemId + sorted options + note
 */
export function generateCartLineId(
  menuItemId: string,
  optionIds: string[],
  note?: string | null
): string {
  const sortedOpts = [...optionIds].sort().join(',');
  const trimmedNote = (note || '').trim().toLowerCase();
  return `${menuItemId}::${sortedOpts}::${trimmedNote}`;
}
