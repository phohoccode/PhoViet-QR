'use client';

import type { OrderDetail, TakeawayPaymentViewState } from '../../../../docs/contracts/types';

export type PaymentUiStatus =
  | 'pending_payment'   // Đang chờ thanh toán (hiển thị VietQR, đếm ngược)
  | 'verifying'         // Đang xác nhận giao dịch (contextual loading)
  | 'paid'              // Đã nhận thanh toán thành công (chuyển sang tracking)
  | 'expired'           // QR hết hạn (hướng dẫn tạo yêu cầu mới)
  | 'failed'            // Không thể hoàn tất thanh toán (thông báo & cách xử lý)
  | 'review_required'   // Thanh toán cần đối soát (cảnh báo không trả tiền lần 2)
  | 'network_error';     // Mất mạng (giữ nguyên context, nút thử lại)

export interface TakeawayPaymentDetails {
  amountVnd: number;
  currency: 'VND';
  expiresAt: string | null;
  checkoutUrl?: string | null;
  qrPayload?: string | null;
  reference?: string | null;
  intentId?: string | null;
  status?: string;
  reconciliationRequired?: boolean;
}

export interface PaymentQrPanelProps {
  amountVnd: number;
  reference?: string | null;
  qrPayload?: string | null;
  checkoutUrl?: string | null;
  expiresAt?: string | null;
  isExpired?: boolean;
  onExpired?: () => void;
  className?: string;
}

export interface PaymentStatusPanelProps {
  status: PaymentUiStatus;
  ticketNo?: number | null;
  onCheckStatus?: () => void;
  onRetry?: () => void;
  onContactSupport?: () => void;
  errorMessage?: string | null;
  className?: string;
}

export interface TakeawayPaymentViewProps {
  order: OrderDetail;
  payment?: TakeawayPaymentViewState | TakeawayPaymentDetails;
  uiStatus?: PaymentUiStatus;
  qrCode?: string;
  onCheckStatus?: () => Promise<void> | void;
  onRetryNewPayment?: () => void;
  onBackToMenu?: () => void;
  onTrackOrder?: (orderId: string) => void;
  className?: string;
}

export interface TakeawayOrderTrackingProps {
  order: OrderDetail;
  pickupCode?: string | null;
  pickupExpiresAt?: string | null;
  qrCode?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOrderMore?: () => void;
  className?: string;
}
