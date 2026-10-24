import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveActiveOrderSummary,
  getActiveOrderSummary,
  clearActiveOrderSummary,
  subscribeActiveOrder,
  getOrderStatusBadgeConfig,
  getOrderStatusSubtitle,
  isTerminalOrderStatus,
  type ActiveOrderSummary,
} from '@/components/customer/order/active-order-storage';
import { ORDER_STATUS_LABELS } from '../../../docs/contracts/types';

describe('Customer Order Status Synchronization (3-Screen Consistency)', () => {
  const store: Record<string, string> = {};
  const listeners: Record<string, ((event: unknown) => void)[]> = {};

  beforeEach(() => {
    for (const key in store) {
      delete store[key];
    }
    for (const key in listeners) {
      delete listeners[key];
    }

    // Mock window and sessionStorage for Node test environment
    const mockSessionStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        for (const key in store) delete store[key];
      }),
    };

    const mockWindow = {
      sessionStorage: mockSessionStorage,
      addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((l) => l !== listener);
        }
      }),
      dispatchEvent: vi.fn((event: { type: string; detail?: unknown }) => {
        const eventListeners = listeners[event.type] || [];
        for (const l of eventListeners) {
          l(event);
        }
        return true;
      }),
    };

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('CustomEvent', class {
      type: string;
      detail?: unknown;
      constructor(type: string, params?: { detail?: unknown }) {
        this.type = type;
        this.detail = params?.detail;
      }
    });
  });

  it('persists and retrieves active order summary across QR sessions with qr-specific key and global key', () => {
    const summary: ActiveOrderSummary = {
      id: 'c0300000-0000-4000-8000-000000000002',
      ticketNo: 2,
      status: 'completed',
      itemCount: 1,
      totalVnd: 30000,
      tableLabel: 'Bàn 8',
    };

    saveActiveOrderSummary(summary, 'tbl_08');

    // Retrieve via specific qrCode
    const retrieved = getActiveOrderSummary('tbl_08');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(summary.id);
    expect(retrieved?.ticketNo).toBe(2);
    expect(retrieved?.status).toBe('completed');

    // Retrieve via global fallback if qrCode not specified
    const retrievedGlobal = getActiveOrderSummary();
    expect(retrievedGlobal).not.toBeNull();
    expect(retrievedGlobal?.id).toBe(summary.id);
    expect(retrievedGlobal?.status).toBe('completed');
  });

  it('broadcasts status update to subscribers via custom event', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeActiveOrder(callback);

    const summary: ActiveOrderSummary = {
      id: 'c0300000-0000-4000-8000-000000000005',
      ticketNo: 5,
      status: 'ready',
      itemCount: 2,
      totalVnd: 60000,
      tableLabel: 'Bàn 3',
    };

    saveActiveOrderSummary(summary, 'tbl_03');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      id: summary.id,
      status: 'ready',
      ticketNo: 5,
    }));

    unsubscribe();
  });

  it('clears active order and broadcasts null to subscribers', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeActiveOrder(callback);

    const summary: ActiveOrderSummary = {
      id: 'c0300000-0000-4000-8000-000000000002',
      ticketNo: 2,
      status: 'completed',
      itemCount: 1,
      totalVnd: 30000,
    };
    saveActiveOrderSummary(summary, 'tbl_08');

    clearActiveOrderSummary('tbl_08');
    expect(getActiveOrderSummary('tbl_08')).toBeNull();
    expect(callback).toHaveBeenCalledWith(null);

    unsubscribe();
  });

  it('correctly classifies terminal statuses (completed and cancelled)', () => {
    expect(isTerminalOrderStatus('completed')).toBe(true);
    expect(isTerminalOrderStatus('cancelled')).toBe(true);
    expect(isTerminalOrderStatus('accepted')).toBe(false);
    expect(isTerminalOrderStatus('preparing')).toBe(false);
    expect(isTerminalOrderStatus('ready')).toBe(false);
    expect(isTerminalOrderStatus('pending_payment')).toBe(false);
  });

  it('provides standardized badge configs and canonical Vietnamese labels for all statuses', () => {
    // 1. completed -> 'Đã giao'
    const completedConfig = getOrderStatusBadgeConfig('completed');
    expect(completedConfig.label).toBe(ORDER_STATUS_LABELS.completed);
    expect(completedConfig.label).toBe('Đã giao');
    expect(completedConfig.isCompleted).toBe(true);
    expect(completedConfig.isCancelled).toBe(false);
    expect(completedConfig.badgeClass).toContain('text-[#027A48]');

    // 2. ready -> 'Sẵn sàng'
    const readyConfig = getOrderStatusBadgeConfig('ready');
    expect(readyConfig.label).toBe(ORDER_STATUS_LABELS.ready);
    expect(readyConfig.label).toBe('Sẵn sàng');
    expect(readyConfig.isCompleted).toBe(false);
    expect(readyConfig.badgeClass).toContain('text-[#175CD3]');

    // 3. preparing -> 'Đang làm'
    const preparingConfig = getOrderStatusBadgeConfig('preparing');
    expect(preparingConfig.label).toBe(ORDER_STATUS_LABELS.preparing);
    expect(preparingConfig.label).toBe('Đang làm');
    expect(preparingConfig.isCompleted).toBe(false);
    expect(preparingConfig.badgeClass).toContain('text-[#B54708]');

    // 4. accepted -> 'Chờ làm'
    const acceptedConfig = getOrderStatusBadgeConfig('accepted');
    expect(acceptedConfig.label).toBe(ORDER_STATUS_LABELS.accepted);
    expect(acceptedConfig.label).toBe('Chờ làm');
    expect(acceptedConfig.isCompleted).toBe(false);
    expect(acceptedConfig.badgeClass).toContain('text-[#1D725E]');

    // 5. cancelled -> 'Đã hủy'
    const cancelledConfig = getOrderStatusBadgeConfig('cancelled');
    expect(cancelledConfig.label).toBe(ORDER_STATUS_LABELS.cancelled);
    expect(cancelledConfig.label).toBe('Đã hủy');
    expect(cancelledConfig.isCancelled).toBe(true);
  });

  it('generates consistent status subtitles across screens (main menu, tracking, and cart sheet)', () => {
    const summary: ActiveOrderSummary = {
      id: 'c0300000-0000-4000-8000-000000000002',
      ticketNo: 2,
      status: 'completed',
      itemCount: 1,
      totalVnd: 30000,
      tableLabel: 'Bàn 8',
    };

    // Main screen: with table prefix
    expect(getOrderStatusSubtitle(summary, true)).toBe('Bàn 8 · 1 phần món · Hoàn tất phục vụ');
    // Cart sheet: without table prefix
    expect(getOrderStatusSubtitle(summary, false)).toBe('1 phần món · Hoàn tất phục vụ');

    const preparingSummary = { ...summary, status: 'preparing', itemCount: 3 };
    expect(getOrderStatusSubtitle(preparingSummary, true)).toBe('Bàn 8 · 3 phần món · Bếp đang chế biến');
    expect(getOrderStatusSubtitle(preparingSummary, false)).toBe('3 phần món · Bếp đang chế biến');

    const readySummary = { ...summary, status: 'ready', itemCount: 2 };
    expect(getOrderStatusSubtitle(readySummary, true)).toBe('Bàn 8 · 2 phần món · Món đã sẵn sàng');
    expect(getOrderStatusSubtitle(readySummary, false)).toBe('2 phần món · Món đã sẵn sàng');

    const acceptedSummary = { ...summary, status: 'accepted' };
    expect(getOrderStatusSubtitle(acceptedSummary, true)).toBe('Bàn 8 · 1 phần món · Chờ bếp làm món');
    expect(getOrderStatusSubtitle(acceptedSummary, false)).toBe('1 phần món · Chờ bếp làm món');
  });
});
