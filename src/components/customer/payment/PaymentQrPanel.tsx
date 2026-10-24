'use client';

/**
 * PAYMENT QR PANEL — QR Ordering Minimal MVP (Phase 4 / P4-G01)
 *
 * Hiển thị mã thanh toán VietQR động, số tiền, mã tham chiếu và đếm ngược:
 * - Hỗ trợ cả chuỗi EMVCo (tự động render SVG qua `generateQrMatrix`) và URL ảnh.
 * - Skeleton đồng bộ khi đang tải mã QR từ provider.
 * - Nút "Sao chép số tiền" và "Sao chép nội dung" với phản hồi xúc giác (tactile feedback).
 * - Live countdown timer đếm ngược đến `expiresAt`. Khi hết giờ, tự động kích hoạt callback `onExpired`.
 * - Tối ưu mobile-first (360-430px), không tràn màn hình, nút chạm >= 44px.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  Copy,
  Check,
  Clock,
  AlertTriangle,
  QrCode as QrCodeIcon,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { generateQrMatrix, matrixToSvg } from '@/lib/qr/qr-code';
import type { PaymentQrPanelProps } from './types';

export const PaymentQrPanel: React.FC<PaymentQrPanelProps> = ({
  amountVnd,
  reference,
  qrPayload,
  checkoutUrl,
  expiresAt,
  isExpired = false,
  onExpired,
  className = '',
}) => {
  const [copiedAmount, setCopiedAmount] = useState<boolean>(false);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() => {
    if (!expiresAt) return null;
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  // Countdown timer
  useEffect(() => {
    if (!expiresAt || isExpired) return;

    const updateTimer = () => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (diff <= 0) {
        setRemainingSeconds(0);
        onExpired?.();
      } else {
        setRemainingSeconds(diff);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, isExpired, onExpired]);

  // Tạo SVG QR từ payload
  const qrSvgDataUri = useMemo(() => {
    if (!qrPayload) return null;
    // Nếu qrPayload đã là URL ảnh (http/https hoặc data:)
    if (qrPayload.startsWith('http') || qrPayload.startsWith('data:image')) {
      return null;
    }
    try {
      const matrix = generateQrMatrix(qrPayload);
      const svg = matrixToSvg(matrix, {
        size: 260,
        margin: 2,
        fgColor: '#1D2522',
        bgColor: '#FFFFFF',
      });
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    } catch {
      return null;
    }
  }, [qrPayload]);

  const handleCopyAmount = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(String(amountVnd));
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    } catch {
      // fallback
    }
  }, [amountVnd]);

  const handleCopyReference = useCallback(async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      // fallback
    }
  }, [reference]);

  const formattedAmount = new Intl.NumberFormat('vi-VN').format(amountVnd) + ' đ';

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isLowTime = remainingSeconds !== null && remainingSeconds <= 120 && remainingSeconds > 0;
  const isTimeOver = isExpired || (remainingSeconds !== null && remainingSeconds <= 0);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Thẻ hiển thị mã VietQR & Đồng hồ đếm ngược */}
      <div className="bg-white rounded-3xl border border-[#E9ECEA] p-5 shadow-xs flex flex-col items-center text-center">
        {/* Đồng hồ đếm ngược thời gian còn hiệu lực */}
        {expiresAt && (
          <div className="mb-4">
            {isTimeOver ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FEF3F2] text-[#D92D20] border border-[#FECDCA]">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mã thanh toán đã hết hạn</span>
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                  isLowTime
                    ? 'bg-[#FEF6EE] text-[#B54708] border-[#F9DBAF] animate-pulse'
                    : 'bg-[#E8F4F0] text-[#1D725E] border-[#C6E7DC]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Thời gian còn hiệu lực: {remainingSeconds !== null ? formatCountdown(remainingSeconds) : '--:--'}</span>
              </span>
            )}
          </div>
        )}

        {/* Khung ảnh QR code */}
        <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl border border-[#E9ECEA] bg-white p-3 flex items-center justify-center shadow-xs overflow-hidden">
          {isTimeOver ? (
            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2 bg-[#FAFBFB] rounded-xl w-full h-full">
              <Clock className="w-10 h-10 text-[#A0A8A5]" aria-hidden="true" />
              <p className="text-xs font-bold text-[#55605C]">QR đã hết hạn</p>
              <p className="text-[11px] text-[#727B77]">Vui lòng tạo yêu cầu thanh toán mới</p>
            </div>
          ) : qrSvgDataUri ? (
            <Image
              unoptimized
              src={qrSvgDataUri}
              alt="Mã VietQR thanh toán"
              className="w-full h-full object-contain select-none pointer-events-none"
              width={240}
              height={240}
            />
          ) : qrPayload && (qrPayload.startsWith('http') || qrPayload.startsWith('data:image')) ? (
            <Image
              unoptimized
              src={qrPayload}
              alt="Mã VietQR thanh toán"
              className="w-full h-full object-contain select-none pointer-events-none"
              width={240}
              height={240}
            />
          ) : qrPayload ? (
            // Nếu payload không render được SVG: hiển thị fallback an toàn
            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
              <QrCodeIcon className="w-8 h-8 text-[#1D725E]" />
              <p className="text-xs font-semibold text-[#1D2522]">Quét mã VietQR trên App Ngân hàng</p>
            </div>
          ) : checkoutUrl ? (
            // Hosted checkout mode khi qrPayload=null
            <div className="flex flex-col items-center justify-center p-4 text-center space-y-3 bg-[#F0F9FF] rounded-xl w-full h-full">
              <ExternalLink className="w-10 h-10 text-[#026AA2]" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold text-[#026AA2]">Cổng thanh toán payOS</p>
                <p className="text-[11px] text-[#026AA2]/80 mt-0.5">Mở liên kết bảo mật để thanh toán</p>
              </div>
            </div>
          ) : (
            // Loading skeleton khi đang chờ adapter trả về instructions
            <div className="flex flex-col items-center justify-center space-y-3 p-4 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-[#E9ECEA] flex items-center justify-center text-[#727B77]">
                <QrCodeIcon className="w-6 h-6 animate-spin" />
              </div>
              <p className="text-xs font-medium text-[#727B77]">Đang tải mã VietQR...</p>
            </div>
          )}
        </div>

        {/* Hướng dẫn quét hoặc mở link */}
        {checkoutUrl && !qrPayload && !isTimeOver ? (
          <div className="mt-4 w-full">
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-11 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-98 shadow-xs"
            >
              <span>Mở trang thanh toán payOS</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <p className="text-xs text-[#55605C] mt-3.5 leading-relaxed">
            Mở ứng dụng Ngân hàng hoặc Ví điện tử (ZaloPay, Momo, ShopeePay...) để quét mã
          </p>
        )}

        {checkoutUrl && qrPayload && !isTimeOver && (
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 text-xs font-bold text-[#1D725E] hover:underline inline-flex items-center gap-1"
          >
            <span>Hoặc thanh toán qua cổng payOS</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* 2. Chi tiết chuyển khoản & Các nút sao chép */}
      <div className="bg-white rounded-3xl border border-[#E9ECEA] p-4 sm:p-5 shadow-xs space-y-3.5">
        <h4 className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
          Thông tin chuyển khoản chính xác
        </h4>

        {/* Dòng Số tiền cần thanh toán */}
        <div className="p-3.5 rounded-2xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-[#727B77] block">Số tiền thanh toán:</span>
            <span className="text-base sm:text-lg font-extrabold text-[#1D725E] mt-0.5 block truncate">
              {formattedAmount}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyAmount}
            className="h-11 px-3.5 rounded-xl bg-white hover:bg-[#E8F4F0] border border-[#E9ECEA] text-xs font-bold text-[#1D725E] flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] active:scale-95 flex-shrink-0"
            aria-label="Sao chép số tiền thanh toán"
          >
            {copiedAmount ? (
              <>
                <Check className="w-4 h-4 text-[#027A48]" />
                <span className="text-[#027A48]">Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Sao chép</span>
              </>
            )}
          </button>
        </div>

        {/* Dòng Nội dung chuyển khoản (chỉ hiển thị nếu provider cung cấp reference cụ thể) */}
        {reference && (
          <div className="p-3.5 rounded-2xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] text-[#727B77] block">Nội dung chuyển khoản (Tham chiếu):</span>
              <span className="text-sm sm:text-base font-bold font-mono text-[#1D2522] mt-0.5 block truncate">
                {reference}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyReference}
              className="h-11 px-3.5 rounded-xl bg-white hover:bg-[#E8F4F0] border border-[#E9ECEA] text-xs font-bold text-[#1D725E] flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] active:scale-95 flex-shrink-0"
              aria-label="Sao chép nội dung chuyển khoản"
            >
              {copiedRef ? (
                <>
                  <Check className="w-4 h-4 text-[#027A48]" />
                  <span className="text-[#027A48]">Đã chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Cảnh báo không sửa đổi nội dung */}
        <div className="p-3 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] flex items-start gap-2 text-xs text-[#8A4D00]">
          <AlertTriangle className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="leading-relaxed text-[11px]">
            <span className="font-bold">Lưu ý quan trọng: </span>
            Quý khách vui lòng chuyển đúng <span className="font-bold">chính xác số tiền</span> và{' '}
            <span className="font-bold">nội dung chuyển khoản</span> để đơn được tự động xác nhận ngay.
          </div>
        </div>

        {/* Lưu ý bảo mật */}
        <div className="p-2.5 rounded-xl bg-[#FAFBFB] flex items-center gap-2 text-[11px] text-[#727B77]">
          <ShieldCheck className="w-4 h-4 text-[#35977D] flex-shrink-0" aria-hidden="true" />
          <span>Hệ thống bảo mật giao dịch tự động. Không chuyển tiền lần hai nếu chưa có kết quả.</span>
        </div>
      </div>
    </div>
  );
};
