'use client';

import { ORDER_STATUS_LABELS, type OrderStatus } from '../../../../docs/contracts/types';

export interface ActiveOrderSummary {
  id: string;
  ticketNo: number;
  status: string;
  itemCount: number;
  totalVnd: number;
  tableLabel?: string;
  updatedAt?: string;
}

const GLOBAL_STORAGE_KEY = 'pv_active_order';
const ACTIVE_ORDER_EVENT = 'pv:active_order_updated';

/**
 * Tạo storage key tương ứng với từng QR code để tránh nhầm lẫn giữa các bàn / phiên
 */
export const getActiveOrderStorageKey = (qrCode?: string): string => {
  return qrCode ? `pv_order_${qrCode}` : GLOBAL_STORAGE_KEY;
};

/**
 * Lấy thông tin tóm tắt đơn hàng đang hoạt động từ sessionStorage
 */
export const getActiveOrderSummary = (qrCode?: string): ActiveOrderSummary | null => {
  if (typeof window === 'undefined') return null;
  try {
    const key = getActiveOrderStorageKey(qrCode);
    let stored = window.sessionStorage.getItem(key);
    if (!stored && qrCode) {
      // Fallback sang global key nếu key riêng chưa kịp ghi
      stored = window.sessionStorage.getItem(GLOBAL_STORAGE_KEY);
    }
    if (stored) {
      return JSON.parse(stored) as ActiveOrderSummary;
    }
  } catch {
    // ignore parse or storage errors
  }
  return null;
};

/**
 * Lưu trữ trạng thái đơn hàng và phát tín hiệu broadcast cho các component khác đồng bộ tức thì
 */
export const saveActiveOrderSummary = (
  summary: ActiveOrderSummary,
  qrCode?: string
): void => {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify(summary);
    if (qrCode) {
      window.sessionStorage.setItem(`pv_order_${qrCode}`, payload);
    }
    window.sessionStorage.setItem(GLOBAL_STORAGE_KEY, payload);

    // Phát custom event cho tất cả component trong cùng trang cập nhật realtime
    window.dispatchEvent(
      new CustomEvent<ActiveOrderSummary>(ACTIVE_ORDER_EVENT, { detail: summary })
    );
  } catch {
    // ignore storage quota errors
  }
};

/**
 * Xóa đơn hàng khỏi lưu trữ khi kết thúc hoặc làm mới
 */
export const clearActiveOrderSummary = (qrCode?: string): void => {
  if (typeof window === 'undefined') return;
  try {
    if (qrCode) {
      window.sessionStorage.removeItem(`pv_order_${qrCode}`);
    }
    window.sessionStorage.removeItem(GLOBAL_STORAGE_KEY);
    window.dispatchEvent(
      new CustomEvent<null>(ACTIVE_ORDER_EVENT, { detail: null })
    );
  } catch {
    // ignore
  }
};

/**
 * Lắng nghe sự kiện cập nhật đơn hàng từ bất kỳ màn hình nào
 */
export const subscribeActiveOrder = (
  callback: (summary: ActiveOrderSummary | null) => void
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<ActiveOrderSummary | null>;
    callback(customEvent.detail ?? null);
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === GLOBAL_STORAGE_KEY || (event.key && event.key.startsWith('pv_order_'))) {
      if (event.newValue) {
        try {
          callback(JSON.parse(event.newValue) as ActiveOrderSummary);
        } catch {
          // ignore
        }
      } else {
        callback(null);
      }
    }
  };

  window.addEventListener(ACTIVE_ORDER_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(ACTIVE_ORDER_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
};

/**
 * Kiểm tra trạng thái đơn đã vào trạng thái kết thúc (terminal) hay chưa
 */
export const isTerminalOrderStatus = (status: string): boolean => {
  return status === 'completed' || status === 'cancelled';
};

/**
 * Trả về cấu hình hiển thị Badge trạng thái chuẩn hóa
 */
export const getOrderStatusBadgeConfig = (
  status: string
): {
  label: string;
  badgeClass: string;
  isCompleted: boolean;
  isCancelled: boolean;
} => {
  const canonicalLabel =
    ORDER_STATUS_LABELS[status as OrderStatus] || status || 'Chờ làm';

  switch (status) {
    case 'completed':
      return {
        label: canonicalLabel, // 'Đã giao'
        badgeClass: 'bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]',
        isCompleted: true,
        isCancelled: false,
      };
    case 'ready':
      return {
        label: canonicalLabel, // 'Sẵn sàng'
        badgeClass: 'bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]',
        isCompleted: false,
        isCancelled: false,
      };
    case 'preparing':
      return {
        label: canonicalLabel, // 'Đang làm'
        badgeClass: 'bg-[#FEF6EE] text-[#B54708] border-[#F9DBAF]',
        isCompleted: false,
        isCancelled: false,
      };
    case 'cancelled':
      return {
        label: canonicalLabel, // 'Đã hủy'
        badgeClass: 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]',
        isCompleted: false,
        isCancelled: true,
      };
    case 'accepted':
    default:
      return {
        label: canonicalLabel, // 'Chờ làm'
        badgeClass: 'bg-[#E8F4F0] text-[#1D725E] border-[#C6E7DC]',
        isCompleted: false,
        isCancelled: false,
      };
  }
};

/**
 * Trả về mô tả tiến độ phù hợp cho từng màn hình
 */
export const getOrderStatusSubtitle = (
  summary: ActiveOrderSummary,
  includeTable = true
): string => {
  const prefix = includeTable && summary.tableLabel ? `${summary.tableLabel} · ` : '';
  const count = summary.itemCount;

  switch (summary.status) {
    case 'completed':
      return `${prefix}${count} phần món · Hoàn tất phục vụ`;
    case 'ready':
      return `${prefix}${count} phần món · Món đã sẵn sàng`;
    case 'preparing':
      return `${prefix}${count} phần món · Bếp đang chế biến`;
    case 'cancelled':
      return `${prefix}Đơn hàng đã được quán hủy`;
    case 'accepted':
    default:
      return `${prefix}${count} phần món · Chờ bếp làm món`;
  }
};
