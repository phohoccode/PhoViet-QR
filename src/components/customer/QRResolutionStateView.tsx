'use client';

import React from 'react';
import {
  QrCode,
  AlertCircle,
  Clock,
  WifiOff,
  RefreshCw,
  Lock,
  Store,
  ShieldAlert,
} from 'lucide-react';

export type QRResolutionUiState =
  | 'resolving'
  | 'invalid_qr'
  | 'inactive_qr'
  | 'inactive_table'
  | 'no_active_session'
  | 'session_locked_or_closed'
  | 'store_closed'
  | 'rate_limited'
  | 'network_error'
  | 'offline';

interface QRResolutionStateViewProps {
  state: QRResolutionUiState;
  retryAfterSeconds?: number;
  onRetry?: () => void;
  className?: string;
}

/**
 * QRResolutionStateView — Hiển thị các trạng thái đặc biệt khi quét mã QR của khách hàng:
 * mapping chuẩn từ các mã lỗi server (INVALID_QR, SESSION_EXPIRED, SESSION_CHECKOUT_PENDING, RATE_LIMITED...).
 * Không tạo nút bấm giả thay đổi nghiệp vụ; tuân thủ triệt để WCAG AA.
 */
export const QRResolutionStateView: React.FC<QRResolutionStateViewProps> = ({
  state,
  retryAfterSeconds,
  onRetry,
  className = '',
}) => {
  switch (state) {
    // 1. Trạng thái phân giải QR (Resolving skeleton)
    case 'resolving':
      return (
        <section
          className={`p-6 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs animate-pulse mx-4 my-6 text-center space-y-3 ${className}`}
          role="status"
          aria-busy="true"
          aria-label="Đang kiểm tra mã QR..."
        >
          <div className="w-12 h-12 rounded-2xl bg-[#E9ECEA] mx-auto" />
          <div className="w-40 h-4 rounded-md bg-[#E9ECEA] mx-auto" />
          <div className="w-56 h-3 rounded bg-[#F7F8F7] mx-auto" />
          <span className="sr-only">Đang phân giải mã QR từ quán...</span>
        </section>
      );

    // 2. Mã QR không hợp lệ (INVALID_QR)
    case 'invalid_qr':
      return (
        <main
          className={`p-6 sm:p-8 bg-white rounded-2xl border border-[#FECDCA] shadow-sm mx-4 my-8 text-center ${className}`}
          role="alert"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#FEF3F2] text-[#B42318] flex items-center justify-center mx-auto mb-3.5 shadow-xs">
            <QrCode className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[#912018]">
            Mã QR không hợp lệ
          </h2>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-sm mx-auto leading-relaxed">
            Mã QR này không tồn tại trong hệ thống quán hoặc đường dẫn đã thay đổi. Vui lòng quét lại mã QR tại bàn hoặc liên hệ nhân viên.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 h-11 px-5 rounded-xl text-xs font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white active:scale-95 transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Thử quét lại</span>
            </button>
          )}
        </main>
      );

    // 3. Mã QR hoặc Bàn bị tạm khóa (INACTIVE_QR / INACTIVE_TABLE)
    case 'inactive_qr':
    case 'inactive_table':
      return (
        <main
          className={`p-6 sm:p-8 bg-white rounded-2xl border border-[#E9ECEA] shadow-sm mx-4 my-8 text-center ${className}`}
          role="alert"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#F7F8F7] text-[#55605C] flex items-center justify-center mx-auto mb-3.5 shadow-xs">
            <Lock className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[#1D2522]">
            Khu vực đang tạm ngừng phục vụ
          </h2>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-sm mx-auto leading-relaxed">
            Mã QR hoặc vị trí bàn này hiện đang được tạm dừng nhận khách. Vui lòng chuyển sang bàn khác hoặc nhờ nhân viên hướng dẫn.
          </p>
        </main>
      );

    // 4. Bàn chưa mở phiên (NO_ACTIVE_SESSION)
    case 'no_active_session':
      return (
        <main
          className={`p-6 sm:p-8 bg-white rounded-2xl border border-[#FFE082] shadow-sm mx-4 my-8 text-center bg-[#FFF8E6]/40 ${className}`}
          role="alert"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#FFF3CD] text-[#8A5A00] flex items-center justify-center mx-auto mb-3.5 shadow-xs">
            <ShieldAlert className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[#664D03]">
            Bàn chưa được mở phiên phục vụ
          </h2>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-sm mx-auto leading-relaxed">
            Bàn này hiện chưa được nhân viên kích hoạt phiên gọi món. Bạn có thể nhờ chủ quán mở bàn trên POS, sau đó bấm nút kiểm tra lại.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 h-11 px-5 rounded-xl text-xs font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white active:scale-95 transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Kiểm tra lại bàn</span>
            </button>
          )}
        </main>
      );

    // 5. Phiên bàn đã đóng hoặc đang chờ tính tiền (SESSION_CHECKOUT_PENDING / SESSION_EXPIRED)
    case 'session_locked_or_closed':
      return (
        <main
          className={`p-6 sm:p-8 bg-white rounded-2xl border border-[#E9ECEA] shadow-sm mx-4 my-8 text-center ${className}`}
          role="alert"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#FEF6EE] text-[#8A4D00] flex items-center justify-center mx-auto mb-3.5 shadow-xs">
            <Clock className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[#1D2522]">
            Bàn đang chờ thanh toán hoặc đã đóng
          </h2>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-sm mx-auto leading-relaxed">
            Phiên phục vụ của bàn này đang ở trạng thái tính tiền hoặc đã kết thúc. Vui lòng liên hệ nhân viên nếu bạn muốn mở phiên mới.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 h-11 px-5 rounded-xl text-xs font-bold bg-[#F7F8F7] hover:bg-[#E8F4F0] text-[#1D2522] border border-[#E9ECEA] active:scale-95 transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D]"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Tải lại trạng thái</span>
            </button>
          )}
        </main>
      );

    // 6. Quán tạm ngưng nhận đơn (STORE_NOT_ACCEPTING_ORDERS)
    case 'store_closed':
      return (
        <aside
          className={`p-4 bg-[#FEF6EE] border border-[#F9DBAF] rounded-2xl mx-4 my-4 flex items-center gap-3 ${className}`}
          role="status"
          aria-live="polite"
        >
          <div className="w-9 h-9 rounded-xl bg-[#FFF4E5] text-[#8A4D00] flex items-center justify-center flex-shrink-0 shadow-xs">
            <Store className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs sm:text-sm font-bold text-[#8A4D00]">
              Quán hiện đang tạm ngừng nhận đơn
            </h3>
            <p className="text-[11px] text-[#A76200] mt-0.5">
              Bạn vẫn có thể xem trước thực đơn bên dưới, nhưng tính năng gửi đơn tạm khóa.
            </p>
          </div>
        </aside>
      );

    // 7. Vượt quá tần suất kiểm tra (RATE_LIMITED)
    case 'rate_limited':
      return (
        <main
          className={`p-6 sm:p-8 bg-white rounded-2xl border border-[#FECDCA] shadow-sm mx-4 my-8 text-center ${className}`}
          role="alert"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#FEF3F2] text-[#B42318] flex items-center justify-center mx-auto mb-3.5 shadow-xs">
            <AlertCircle className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[#912018]">
            Thao tác quá thường xuyên
          </h2>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-sm mx-auto leading-relaxed">
            {retryAfterSeconds
              ? `Vui lòng chờ khoảng ${retryAfterSeconds} giây trước khi thử nhập lại mã phiên bàn.`
              : 'Hệ thống đang tạm hạn chế yêu cầu để bảo đảm an toàn. Vui lòng chờ ít giây rồi thử lại.'}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 h-11 px-5 rounded-xl text-xs font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white active:scale-95 transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Thử lại</span>
            </button>
          )}
        </main>
      );

    // 8. Lỗi mạng hoặc Mất kết nối (NETWORK_ERROR / OFFLINE)
    case 'network_error':
    case 'offline':
      return (
        <main
          className={`p-6 sm:p-8 bg-white rounded-2xl border border-[#DDE2E0] shadow-sm mx-4 my-8 text-center ${className}`}
          role="alert"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#F7F8F7] text-[#55605C] flex items-center justify-center mx-auto mb-3.5 shadow-xs">
            <WifiOff className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[#1D2522]">
            Không có kết nối mạng Internet
          </h2>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-sm mx-auto leading-relaxed">
            Không thể kiểm tra thông tin phiên bàn lúc này. Vui lòng kiểm tra Wi-Fi hoặc 4G/5G rồi bấm thử lại.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 h-11 px-5 rounded-xl text-xs font-bold bg-[#1D725E] hover:bg-[#165B4B] text-white active:scale-95 transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Thử kết nối lại</span>
            </button>
          )}
        </main>
      );

    default:
      return null;
  }
};
