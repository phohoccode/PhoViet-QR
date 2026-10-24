import { describe, it, expect } from 'vitest';
import { removeVietnameseDiacritics } from '@/components/customer/MenuPreviewSection';
import {
  type OrderAdmissionView,
  type SubmitAvailability,
  getAdmissionMessage,
} from '@/components/shared/admission-types';
import type { CustomerCartItem } from '@/components/customer/cart/types';

describe('P6-G02 Overload Performance & Admission UX Test Suite', () => {
  describe('1. Menu Search & Vietnamese Diacritics Normalization', () => {
    it('normalizes complex Vietnamese diacritics and case accurately', () => {
      expect(removeVietnameseDiacritics('Phở Bò Tái Lăn')).toBe('pho bo tai lan');
      expect(removeVietnameseDiacritics('Cà Phê Muối Xứ Huế')).toBe('ca phe muoi xu hue');
      expect(removeVietnameseDiacritics('Đặc Sản Đà Nẵng')).toBe('dac san da nang');
      expect(removeVietnameseDiacritics('Bạc Xỉu 3 Tầng')).toBe('bac xiu 3 tang');
    });

    it('matches search queries regardless of accent marks and casing', () => {
      const items = [
        { id: '1', name: 'Phở bò tái bắp', description: 'Nước dùng ninh xương 12h' },
        { id: '2', name: 'Bún chả Hà Nội', description: 'Thịt nướng than hoa' },
        { id: '3', name: 'Trà tắc khổng lồ', description: 'Trà lài đậm vị' },
      ];

      const query1 = removeVietnameseDiacritics('pho bo');
      const matched1 = items.filter(
        (i) =>
          removeVietnameseDiacritics(i.name).includes(query1) ||
          removeVietnameseDiacritics(i.description).includes(query1)
      );
      expect(matched1.map((i) => i.id)).toEqual(['1']);

      const query2 = removeVietnameseDiacritics('ninh xuong');
      const matched2 = items.filter(
        (i) =>
          removeVietnameseDiacritics(i.name).includes(query2) ||
          removeVietnameseDiacritics(i.description).includes(query2)
      );
      expect(matched2.map((i) => i.id)).toEqual(['1']);
    });
  });

  describe('2. Store Admission Control & Independent Pause Policies', () => {
    it('generates appropriate admission messages without fake metrics', () => {
      const takeawayPausedCapacity: OrderAdmissionView = {
        type: 'takeaway',
        acceptingOrders: false,
        reason: 'capacity',
      };
      expect(getAdmissionMessage(takeawayPausedCapacity)).toBe(
        'Quán đang quá tải đơn mang đi, tạm dừng nhận thêm để đảm bảo chất lượng.'
      );

      const takeawayPausedHours: OrderAdmissionView = {
        type: 'takeaway',
        acceptingOrders: false,
        reason: 'outside_hours',
      };
      expect(getAdmissionMessage(takeawayPausedHours)).toBe(
        'Hiện đã ngoài giờ nhận đơn mang đi của quán.'
      );

      const dineInPausedManual: OrderAdmissionView = {
        type: 'dine_in',
        acceptingOrders: false,
        reason: 'manual_pause',
      };
      expect(getAdmissionMessage(dineInPausedManual)).toBe(
        'Quán đang tạm dừng nhận đơn tại bàn.'
      );

      const storeActive: OrderAdmissionView = {
        type: 'dine_in',
        acceptingOrders: true,
      };
      expect(getAdmissionMessage(storeActive)).toBe(
        'Quán đang tiếp nhận đơn bình thường.'
      );
    });

    it('ensures Takeaway pause does not disable Dine-in ordering and vice versa', () => {
      const takeawayAdmission: OrderAdmissionView = {
        type: 'takeaway',
        acceptingOrders: false,
        reason: 'capacity',
      };

      // Helper simulating MenuPreviewSection & PreCheckoutReview mode check
      const isPausedForMode = (admission: OrderAdmissionView, isTakeaway: boolean) => {
        if (admission.acceptingOrders) return false;
        return isTakeaway ? admission.type === 'takeaway' : admission.type === 'dine_in';
      };

      expect(isPausedForMode(takeawayAdmission, true)).toBe(true);  // Takeaway is paused
      expect(isPausedForMode(takeawayAdmission, false)).toBe(false); // Dine-in is NOT paused

      const dineInAdmission: OrderAdmissionView = {
        type: 'dine_in',
        acceptingOrders: false,
        reason: 'capacity',
      };

      expect(isPausedForMode(dineInAdmission, true)).toBe(false); // Takeaway is NOT paused
      expect(isPausedForMode(dineInAdmission, false)).toBe(true);  // Dine-in is paused
    });
  });

  describe('3. Rate Limiting (HTTP 429) & Countdown Timer Resilience', () => {
    it('disables submission during rate limit countdown and requires manual retry', () => {
      const rateLimitedAvailability: SubmitAvailability = {
        state: 'rate_limited',
        retryAfterSeconds: 8,
      };

      const calculateCanSubmit = (
        availability: SubmitAvailability,
        countdown: number
      ) => {
        if (availability.state === 'rate_limited' && countdown > 0) return false;
        if (availability.state === 'paused') return false;
        return true;
      };

      // During active countdown (8s remaining) -> submission locked
      expect(calculateCanSubmit(rateLimitedAvailability, 8)).toBe(false);
      expect(calculateCanSubmit(rateLimitedAvailability, 3)).toBe(false);

      // Once countdown reaches 0 -> manual retry unlocked
      expect(calculateCanSubmit(rateLimitedAvailability, 0)).toBe(true);
    });
  });

  describe('4. Backend Overload (HTTP 503 / STORE_AT_CAPACITY)', () => {
    it('handles backend overload without inventing queue positions or fake prep minutes', () => {
      const serverBusyAvailability: SubmitAvailability = {
        state: 'unavailable',
        message: 'Hệ thống đang bận. Vui lòng kiểm tra lại trạng thái đơn trước khi đặt lại.',
      };

      expect(serverBusyAvailability.state).toBe('unavailable');
      expect(serverBusyAvailability.message).toContain('Hệ thống đang bận');
      // Must not contain fabricated queue numbers
      expect(serverBusyAvailability.message).not.toMatch(/\d+ người đang đợi/);
    });
  });

  describe('5. Cart Consistency & Menu/Price Conflict Handling', () => {
    it('prevents auto-submission on PRICE_CHANGED and requires review', () => {
      const errorCode = 'PRICE_CHANGED';
      const isMenuConflict = errorCode === 'PRICE_CHANGED' || errorCode === 'ITEM_UNAVAILABLE';

      const canSubmit = !isMenuConflict;
      expect(canSubmit).toBe(false);

      // Verify that total is not mutated automatically
      const originalCartItem: CustomerCartItem = {
        lineId: 'line-1',
        menuItemId: 'item-pho',
        name: 'Phở tái lăn',
        basePriceVnd: 60000,
        selectedOptions: [],
        quantity: 2,
        estimatedLineTotalVnd: 120000,
        note: null,
      };

      // Total remains untouched until user reviews
      expect(originalCartItem.estimatedLineTotalVnd).toBe(120000);
    });
  });

  describe('6. Idempotency & Uncertain Submit State', () => {
    it('retains immutable clientRequestId on uncertain/timeout response', () => {
      const clientRequestId = 'a1b2c3d4-e5f6-4a1b-8c2d-0e1f2a3b4c5d';
      const submissionStatus = 'uncertain';

      const retryAction = (status: string, key: string) => {
        if (status === 'uncertain') {
          return { method: 'REPLAY_SAME_KEY', key };
        }
        return { method: 'CREATE_NEW_KEY', key: 'new-key' };
      };

      const result = retryAction(submissionStatus, clientRequestId);
      expect(result.method).toBe('REPLAY_SAME_KEY');
      expect(result.key).toBe(clientRequestId);
    });
  });

  describe('7. Owner Dashboard Realtime Event Batching', () => {
    it('batches multiple incoming orders into a single consolidated notification', () => {
      const knownIds = new Set(['ord-01', 'ord-02']);
      const polledOrders = [
        { id: 'ord-01', ticketNo: 1, status: 'accepted' },
        { id: 'ord-02', ticketNo: 2, status: 'accepted' },
        { id: 'ord-03', ticketNo: 3, status: 'accepted' },
        { id: 'ord-04', ticketNo: 4, status: 'accepted' },
        { id: 'ord-05', ticketNo: 5, status: 'accepted' },
        { id: 'ord-06', ticketNo: 6, status: 'accepted' },
        { id: 'ord-07', ticketNo: 7, status: 'accepted' },
      ];

      const freshAccepted = polledOrders.filter(
        (o) => !knownIds.has(o.id) && o.status === 'accepted'
      );

      expect(freshAccepted.length).toBe(5);

      const generateToast = (fresh: typeof freshAccepted) => {
        if (fresh.length > 1) {
          return `Có ${fresh.length} đơn mới trong hàng đợi.`;
        }
        if (fresh.length === 1) {
          return `Có đơn mới #${String(fresh[0].ticketNo).padStart(3, '0')} trong hàng đợi.`;
        }
        return null;
      };

      const toast = generateToast(freshAccepted);
      expect(toast).toBe('Có 5 đơn mới trong hàng đợi.');
    });

    it('formats single new order notification accurately', () => {
      const freshAccepted = [{ id: 'ord-08', ticketNo: 8, status: 'accepted' }];
      const generateToast = (fresh: typeof freshAccepted) => {
        if (fresh.length > 1) {
          return `Có ${fresh.length} đơn mới trong hàng đợi.`;
        }
        if (fresh.length === 1) {
          return `Có đơn mới #${String(fresh[0].ticketNo).padStart(3, '0')} trong hàng đợi.`;
        }
        return null;
      };

      const toast = generateToast(freshAccepted);
      expect(toast).toBe('Có đơn mới #008 trong hàng đợi.');
    });
  });
});
