'use client';

import React from 'react';
import { Coffee, AlertCircle, QrCode, WifiOff, RefreshCw } from 'lucide-react';

export type CustomerStateType = 'empty' | 'error' | 'invalid_table_session' | 'offline';

interface CustomerStateViewProps {
  type: CustomerStateType;
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * CustomerStateView — Khung hiển thị các trạng thái đặc biệt cho khách hàng:
 * empty (chưa có món), error (lỗi tải), invalid_table_session (mã phiên bàn sai/hết hạn), offline (mất mạng).
 * Tuân thủ hệ màu Minimal Emerald POS, WCAG AA, không dùng duy nhất màu sắc để báo trạng thái.
 */
export const CustomerStateView: React.FC<CustomerStateViewProps> = ({
  type,
  title,
  description,
  onRetry,
  className = '',
}) => {
  switch (type) {
    case 'empty':
      return (
        <section
          className={`flex flex-col items-center justify-center p-8 text-center text-[#727B77] bg-white rounded-2xl border border-[#E9ECEA] mx-4 my-8 ${className}`}
          role="status"
          aria-label={title || 'Thực đơn đang cập nhật'}
        >
          <div className="w-14 h-14 rounded-2xl bg-[#E8F4F0] flex items-center justify-center text-[#1D725E] mb-3.5 shadow-sm">
            <Coffee className="w-7 h-7" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-[#1D2522]">
            {title || 'Thực đơn đang được chuẩn bị'}
          </h3>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-xs leading-relaxed">
            {description ||
              'Quán hiện chưa cập nhật món ăn hoặc đang chuẩn bị nguyên liệu phục vụ. Vui lòng quay lại sau ít phút hoặc hỏi nhân viên.'}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1D725E] text-white hover:bg-[#165B4B] active:scale-95 transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tải lại thực đơn</span>
            </button>
          )}
        </section>
      );

    case 'error':
      return (
        <section
          className={`flex flex-col items-center justify-center p-8 text-center bg-[#FEF3F2]/40 rounded-2xl border border-[#FECDCA] mx-4 my-8 ${className}`}
          role="alert"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#FEF3F2] flex items-center justify-center text-[#B42318] mb-3.5 shadow-sm">
            <AlertCircle className="w-7 h-7" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-[#912018]">
            {title || 'Không thể tải thực đơn'}
          </h3>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-xs leading-relaxed">
            {description ||
              'Đã xảy ra sự cố khi kết nối tới máy chủ của quán. Vui lòng kiểm tra lại kết nối và thử lại.'}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#B42318] text-white hover:bg-[#912018] active:scale-95 transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318]"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Thử kết nối lại</span>
            </button>
          )}
        </section>
      );

    case 'invalid_table_session':
      return (
        <section
          className={`flex flex-col items-center justify-center p-8 text-center bg-[#FFF8E6]/60 rounded-2xl border border-[#FFE082] mx-4 my-8 ${className}`}
          role="alert"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#FFF3CD] flex items-center justify-center text-[#8A5A00] mb-3.5 shadow-sm">
            <QrCode className="w-7 h-7" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-[#664D03]">
            {title || 'Mã phiên bàn không hợp lệ hoặc đã hết hạn'}
          </h3>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-xs leading-relaxed">
            {description ||
              'Phiên gọi món của bàn này đã đóng hoặc chưa được khởi tạo. Vui lòng quét lại mã QR tại bàn hoặc yêu cầu nhân viên hỗ trợ mở bàn.'}
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 w-full max-w-xs">
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 h-11 px-4 rounded-xl text-xs font-bold bg-[#1D725E] text-white hover:bg-[#165B4B] active:scale-95 transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Quét lại mã QR</span>
            </button>
          </div>
        </section>
      );

    case 'offline':
      return (
        <section
          className={`flex flex-col items-center justify-center p-8 text-center bg-[#F7F8F7] rounded-2xl border border-[#DDE2E0] mx-4 my-8 ${className}`}
          role="status"
          aria-live="polite"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#E9ECEA] flex items-center justify-center text-[#55605C] mb-3.5 shadow-sm">
            <WifiOff className="w-7 h-7" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-[#1D2522]">
            {title || 'Mất kết nối mạng Internet'}
          </h3>
          <p className="text-xs sm:text-sm text-[#727B77] mt-1.5 max-w-xs leading-relaxed">
            {description ||
              'Không thể gửi đơn hoặc tải dữ liệu mới khi thiết bị ngoại tuyến. Hệ thống không tạo đơn giả; vui lòng kiểm tra Wi-Fi hoặc 4G/5G.'}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1D725E] text-white hover:bg-[#165B4B] active:scale-95 transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Kiểm tra kết nối lại</span>
            </button>
          )}
        </section>
      );

    default:
      return null;
  }
};
