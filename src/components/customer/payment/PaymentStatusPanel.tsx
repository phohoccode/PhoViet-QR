"use client";

/**
 * PAYMENT STATUS PANEL — QR Ordering Minimal MVP (Phase 4 / P4-G01)
 *
 * Hiển thị 7 trạng thái thanh toán chuẩn xác theo đặc tả:
 * 1. pending_payment: Đang chờ thanh toán
 * 2. verifying: Đang xác nhận giao dịch (contextual loading)
 * 3. paid: Đã nhận thanh toán (chỉ hiển thị số FIFO khi backend cấp)
 * 4. expired: QR hết hạn (hướng dẫn thử lại, thông báo đơn chưa vào queue)
 * 5. failed: Không thể hoàn tất thanh toán (thông báo & hướng xử lý)
 * 6. review_required / mismatch: Thanh toán cần đối soát (cảnh báo KHÔNG chuyển tiền lần 2, liên hệ quán)
 * 7. network_error: Mất mạng (giữ nguyên context, nút thử kiểm tra lại, không gọi là lỗi thanh toán)
 *
 * Tuyệt đối không tự động set paid ở client và không sinh số thứ tự FIFO giả.
 */

import React from "react";
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  WifiOff,
  RefreshCw,
  PhoneCall,
  ShoppingBag,
} from "lucide-react";
import type { PaymentStatusPanelProps } from "./types";

export const PaymentStatusPanel: React.FC<PaymentStatusPanelProps> = ({
  status,
  ticketNo,
  onCheckStatus,
  onRetry,
  onContactSupport,
  errorMessage,
  className = "",
}) => {
  switch (status) {
    case "pending_payment":
      return (
        <div
          className={`p-4 rounded-3xl bg-[#F0F9FF] border border-[#B9E6FE] space-y-3 ${className}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#026AA2] text-white flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 animate-pulse" aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-bold text-[#026AA2] uppercase tracking-wide block">
                  Đang chờ thanh toán
                </span>
                <span className="text-[11px] text-[#026AA2]/80">
                  Hệ thống đang đợi xác nhận từ ngân hàng
                </span>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-[#026AA2] bg-white px-2.5 py-1 rounded-full border border-[#B9E6FE]">
              VietQR
            </span>
          </div>

          <p className="text-xs text-[#026AA2] leading-relaxed">
            Sau khi bạn chuyển khoản thành công, hệ thống sẽ tự động chuyển đơn
            sang hàng đợi của bếp.
          </p>
        </div>
      );

    case "verifying":
      return (
        <div
          className={`p-4 rounded-3xl bg-[#EFF8FF] border border-[#B2DDFF] space-y-3 ${className}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#175CD3] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#175CD3] uppercase tracking-wide block">
                Đang xác nhận giao dịch...
              </span>
              <p className="text-xs text-[#175CD3] mt-0.5 leading-relaxed">
                Đang kiểm tra kết quả giao dịch với ngân hàng, vui lòng giữ màn
                hình trong giây lát.
              </p>
            </div>
          </div>
        </div>
      );

    case "paid":
      return (
        <div
          className={`p-5 rounded-3xl bg-[#ECFDF3] border border-[#ABEFC6] space-y-3 text-center ${className}`}
        >
          <div className="w-12 h-12 rounded-full bg-[#027A48] text-white flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
          </div>

          <div>
            <h3 className="text-base font-bold text-[#027A48]">
              Đã nhận thanh toán thành công!
            </h3>
            <p className="text-xs text-[#027A48] mt-1 leading-relaxed">
              Đơn hàng mang đi của bạn đã được chuyển vào hàng đợi chế biến của
              quán.
            </p>
          </div>

          {/* Hiển thị số FIFO CHỈ KHI backend đã cấp số */}
          {ticketNo !== null && ticketNo !== undefined && ticketNo > 0 ? (
            <div className="p-3 bg-white rounded-2xl border border-[#ABEFC6] max-w-xs mx-auto">
              <span className="text-[11px] font-bold text-[#727B77] uppercase tracking-wider block">
                Số thứ tự nhận món
              </span>
              <span className="text-3xl font-extrabold text-[#1D725E] tracking-tight block mt-0.5">
                #{String(ticketNo).padStart(3, "0")}
              </span>
            </div>
          ) : (
            <div className="p-2.5 bg-white/80 rounded-xl border border-[#ABEFC6] text-xs text-[#027A48] inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang kết nối để nhận số thứ tự từ quán...</span>
            </div>
          )}
        </div>
      );

    case "expired":
      return (
        <div
          className={`p-4 rounded-3xl bg-[#FEF3F2] border border-[#FECDCA] space-y-3 ${className}`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D92D20] text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
              <Clock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-[#D92D20] uppercase tracking-wide block">
                Mã thanh toán đã hết hạn
              </span>
              <p className="text-xs text-[#B42318] mt-1 leading-relaxed">
                Đơn hàng{" "}
                <span className="font-bold">
                  chưa được ghi nhận vào hàng đợi
                </span>{" "}
                của quán. Quý khách vui lòng không chuyển khoản vào mã cũ và hãy
                tạo yêu cầu thanh toán mới.
              </p>
            </div>
          </div>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="w-full h-11 rounded-xl bg-[#D92D20] hover:bg-[#B42318] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-98 shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tạo lại đơn thanh toán mới</span>
            </button>
          )}
        </div>
      );

    case "failed":
      return (
        <div
          className={`p-4 rounded-3xl bg-[#FEF3F2] border border-[#FECDCA] space-y-3 ${className}`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D92D20] text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
              <XCircle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-[#D92D20] uppercase tracking-wide block">
                Không thể hoàn tất thanh toán
              </span>
              <p className="text-xs text-[#B42318] mt-1 leading-relaxed">
                {errorMessage ||
                  "Giao dịch không thành công. Quý khách có thể kiểm tra lại số dư tài khoản ngân hàng hoặc tạo yêu cầu thanh toán mới."}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex-1 h-11 rounded-xl bg-[#D92D20] hover:bg-[#B42318] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-98 shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử lại thanh toán</span>
              </button>
            )}
            {onContactSupport && (
              <button
                type="button"
                onClick={onContactSupport}
                className="h-11 px-3.5 rounded-xl bg-white hover:bg-[#FEE4E2] border border-[#FECDCA] text-[#D92D20] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Hỗ trợ</span>
              </button>
            )}
          </div>
        </div>
      );

    case "review_required":
      return (
        <div
          className={`p-4 sm:p-5 rounded-3xl bg-[#FFFAEB] border border-[#FEDF89] space-y-3 ${className}`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#B54708] text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-[#B54708] uppercase tracking-wide block">
                Thanh toán cần đối soát
              </span>
              <p className="text-xs text-[#8A4D00] mt-1 leading-relaxed">
                Hệ thống ghi nhận giao dịch của bạn có sự chênh lệch hoặc cần
                xác minh lại. Quý khách vui lòng{" "}
                <span className="font-bold underline text-[#B54708]">
                  KHÔNG chuyển khoản lần hai
                </span>
                .
              </p>
              <p className="text-xs text-[#8A4D00] mt-1.5 leading-relaxed">
                Xin vui lòng đến quầy thu ngân của quán hoặc liên hệ nhân viên
                để được đối soát và tiếp nhận đơn ngay.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            {onContactSupport && (
              <button
                type="button"
                onClick={onContactSupport}
                className="flex-1 h-11 rounded-xl bg-[#B54708] hover:bg-[#93370D] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-98 shadow-xs"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Đến quầy thu ngân đối soát</span>
              </button>
            )}

            {onCheckStatus && (
              <button
                type="button"
                onClick={onCheckStatus}
                className="h-11 px-4 rounded-xl bg-white hover:bg-[#FEF6EE] border border-[#FEDF89] text-[#B54708] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kiểm tra lại trạng thái</span>
              </button>
            )}
          </div>
        </div>
      );

    case "network_error":
      return (
        <div
          className={`p-4 rounded-3xl bg-[#FEF6EE] border border-[#F9DBAF] space-y-3 ${className}`}
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#B54708] text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
              <WifiOff className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-[#B54708] uppercase tracking-wide block">
                Mất kết nối mạng
              </span>
              <p className="text-xs text-[#8A4D00] mt-1 leading-relaxed">
                Chưa thể kiểm tra trạng thái giao dịch từ máy chủ do mạng gián
                đoạn.{" "}
                <span className="font-bold">Đây không phải lỗi thanh toán</span>
                , thông tin thanh toán của bạn vẫn được bảo toàn.
              </p>
            </div>
          </div>

          {onCheckStatus && (
            <button
              type="button"
              onClick={onCheckStatus}
              className="w-full h-11 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-98 shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử kiểm tra lại</span>
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
};
