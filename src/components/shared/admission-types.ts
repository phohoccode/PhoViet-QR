/**
 * ADMISSION & OVERLOAD PRESENTATION CONTRACTS (Phase 6 — G02)
 *
 * Định nghĩa hợp đồng hiển thị trạng thái tiếp nhận đơn (Admission)
 * và kiểm soát quá tải / rate-limiting (Overload UX) cho cả Customer UI và Owner UI.
 * Thiết kế hoàn toàn presentation-only, khớp 100% với backend contracts do Codex quản lý.
 */

export type OrderAdmissionType = 'dine_in' | 'takeaway';

export type OrderAdmissionReason =
  | 'manual_pause'
  | 'capacity'
  | 'outside_hours';

export interface OrderAdmissionView {
  type: OrderAdmissionType;
  acceptingOrders: boolean;
  reason?: OrderAdmissionReason;
  retryAfterSeconds?: number;
  message?: string;
}

export type SubmitAvailabilityState =
  | 'ready'
  | 'paused'
  | 'rate_limited'
  | 'unknown_result'
  | 'unavailable';

export type SubmitAvailability =
  | { state: 'ready' }
  | { state: 'paused'; message: string; reason?: OrderAdmissionReason }
  | { state: 'rate_limited'; retryAfterSeconds?: number; message?: string }
  | { state: 'unknown_result'; message?: string }
  | { state: 'unavailable'; message?: string };

/**
 * Helper sinh thông điệp giải thích ngắn gọn, thân thiện chuẩn Minimal Emerald
 * dựa trên admission state từ server. Không bịa số người chờ hoặc thời gian giả.
 */
export function getAdmissionMessage(admission: OrderAdmissionView): string {
  if (admission.acceptingOrders) {
    return 'Quán đang tiếp nhận đơn bình thường.';
  }

  if (admission.message) {
    return admission.message;
  }

  const isTakeaway = admission.type === 'takeaway';
  switch (admission.reason) {
    case 'capacity':
      return isTakeaway
        ? 'Quán đang quá tải đơn mang đi, tạm dừng nhận thêm để đảm bảo chất lượng.'
        : 'Quán đang quá tải tại bàn, tạm dừng nhận đơn mới.';
    case 'outside_hours':
      return isTakeaway
        ? 'Hiện đã ngoài giờ nhận đơn mang đi của quán.'
        : 'Hiện đã ngoài giờ phục vụ tại bàn của quán.';
    case 'manual_pause':
    default:
      return isTakeaway
        ? 'Quán đang tạm dừng nhận đơn mang đi.'
        : 'Quán đang tạm dừng nhận đơn tại bàn.';
  }
}
