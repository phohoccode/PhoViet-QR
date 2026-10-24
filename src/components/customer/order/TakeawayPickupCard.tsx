'use client';

/**
 * TAKEAWAY PICKUP CARD — QR Ordering Minimal MVP (Phase 4 / P4-G03)
 *
 * Thẻ thông tin nhận món mang đi cho khách hàng:
 * - Hiển thị mã nhận món 6 chữ số (format: "012 345", khi sao chép giữ nguyên "012345").
 * - Nút "Sao chép mã" với phản hồi xúc giác (tactile feedback).
 * - Phân biệt rõ ràng theo trạng thái đơn hàng:
 *   + 'accepted' / 'preparing': Hiển thị mã hoặc skeleton "Đang chuẩn bị mã nhận món..." nếu API đang cấp mã.
 *   + 'ready': Nhấn mạnh "Món của bạn đã sẵn sàng" & "Vui lòng đến quầy nhận món", mã hiển thị nổi bật.
 *   + 'completed': Hiển thị "Đã nhận món", không tiếp tục thúc giục đến quầy, mask mã "••••••" (Mã đã sử dụng).
 * - Mobile-first (360-430px), touch targets >= 44px, không log mã ra console/URL.
 */

import React, { useState, useCallback } from 'react';
import {
  BellRing,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  PackageCheck,
} from 'lucide-react';
import type { OrderStatus } from '../../../../docs/contracts/types';

export interface TakeawayPickupCardProps {
  ticketNo: number | null;
  orderStatus: OrderStatus;
  pickupCode: string | null;
  isLoadingPickup?: boolean;
  pickupMessage?: string | null;
  completedAt?: string | null;
  className?: string;
}

/**
 * Định dạng mã 6 số thành 2 cụm 3 số (vd: '012345' -> '012 345') cho dễ đọc
 */
export function formatPickupCodeDisplay(code?: string | null): string {
  if (!code) return '';
  const digits = code.replace(/\D/g, '');
  if (digits.length === 6) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)}`;
  }
  return code;
}

export const TakeawayPickupCard: React.FC<TakeawayPickupCardProps> = ({
  ticketNo,
  orderStatus,
  pickupCode,
  isLoadingPickup = false,
  pickupMessage = null,
  completedAt,
  className = '',
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const rawCode = pickupCode ? pickupCode.replace(/\D/g, '') : '';
  const formattedCode = formatPickupCodeDisplay(rawCode);

  const handleCopyCode = useCallback(async () => {
    if (!rawCode) return;
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback nếu clipboard API bị hạn chế
    }
  }, [rawCode]);

  const ticketDisplay =
    ticketNo !== null && ticketNo !== undefined
      ? `#${String(ticketNo).padStart(3, '0')}`
      : null;

  // 1. Trạng thái COMPLETED: Đã nhận món, mask mã và không tiếp tục giục tới quầy
  if (orderStatus === 'completed') {
    return (
      <section
        role="region"
        aria-label="Thông tin nhận món đã hoàn thành"
        className={`bg-white rounded-2xl border border-[#C2E4C2] p-4 sm:p-5 shadow-xs space-y-3 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#EAF5EA] text-[#1E561E] flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E561E]">Đã nhận món tại quầy</h3>
              <p className="text-[11px] text-[#55605C]">
                {completedAt
                  ? `Hoàn tất lúc: ${new Date(completedAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Cảm ơn quý khách đã ủng hộ quán!'}
              </p>
            </div>
          </div>

          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#EAF5EA] text-[#1E561E] border border-[#C2E4C2]">
            Đã giao
          </span>
        </div>

        {/* Mã đã sử dụng bị mask */}
        <div className="p-3 bg-[#FAFBFB] rounded-xl border border-[#E9ECEA] flex items-center justify-between text-xs">
          <span className="text-[#727B77]">Mã nhận món:</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm tracking-widest text-[#A0A8A5] select-none">
              ••••••
            </span>
            <span className="text-[10px] font-semibold text-[#727B77] bg-[#F1F3F2] px-1.5 py-0.5 rounded">
              Đã sử dụng
            </span>
          </div>
        </div>
      </section>
    );
  }

  // 2. Trạng thái READY: Món đã sẵn sàng -> Nhấn mạnh đưa mã nhận món tại quầy
  if (orderStatus === 'ready') {
    return (
      <section
        role="region"
        aria-label="Món đã sẵn sàng nhận tại quầy"
        className={`bg-gradient-to-b from-[#EFF8FF] to-white rounded-2xl border-2 border-[#B2DDFF] p-4 sm:p-5 shadow-sm space-y-4 animate-dialog-card-in ${className}`}
      >
        {/* Banner Sẵn sàng nhận món */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#175CD3] text-white flex items-center justify-center flex-shrink-0 shadow-xs animate-bounce">
            <BellRing className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#D1E9FF] text-[#175CD3]">
                <Sparkles className="w-3 h-3" />
                Sẵn sàng
              </span>
              {ticketDisplay && (
                <span className="text-xs font-bold text-[#175CD3]">Số phiếu {ticketDisplay}</span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-[#101828] mt-1 leading-snug">
              Món của bạn đã sẵn sàng!
            </h3>
            <p className="text-xs text-[#175CD3] font-semibold mt-0.5">
              Vui lòng đến quầy nhận món và xuất trình mã dưới đây
            </p>
          </div>
        </div>

        {/* Khối hiển thị mã 6 số nổi bật */}
        <div className="bg-white rounded-xl border border-[#B2DDFF] p-4 text-center shadow-xs space-y-2">
          <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider block">
            Mã nhận món 6 chữ số
          </span>

          {rawCode ? (
            <div className="py-1">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono text-[#175CD3] tracking-widest block select-all">
                {formattedCode}
              </span>
            </div>
          ) : isLoadingPickup ? (
            <div className="py-2 animate-pulse space-y-1">
              <div className="w-32 h-8 bg-[#E9ECEA] rounded-lg mx-auto" />
              <p className="text-[11px] text-[#727B77]">Đang chuẩn bị mã nhận món...</p>
            </div>
          ) : (
            <p role="status" className="text-[11px] text-[#727B77]">
              {pickupMessage || 'Chưa có mã nhận món. Bấm Làm mới để kiểm tra hoặc liên hệ quầy.'}
            </p>
          )}

          {/* Nút sao chép mã */}
          {rawCode && (
            <div className="pt-1 flex justify-center">
              <button
                type="button"
                onClick={handleCopyCode}
                className="h-11 px-4 rounded-xl bg-[#EFF8FF] hover:bg-[#D1E9FF] border border-[#B2DDFF] text-xs font-bold text-[#175CD3] flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#175CD3] active:scale-95"
                aria-label="Sao chép mã nhận món"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-[#027A48]" />
                    <span className="text-[#027A48]">Đã chép mã</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Sao chép mã nhận món</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Hướng dẫn nhận món */}
        <div className="p-3 bg-[#FAFBFB] rounded-xl border border-[#E9ECEA] flex items-start gap-2 text-xs text-[#55605C]">
          <ShieldCheck className="w-4 h-4 text-[#1D725E] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed text-[11px]">
            Đưa mã nhận món này cho nhân viên quầy thu ngân để hoàn tất nhận món.
          </p>
        </div>
      </section>
    );
  }

  // 3. Trạng thái ACCEPTED hoặc PREPARING: Bếp đang làm món
  return (
    <section
      role="region"
      aria-label="Thông tin nhận món đang chuẩn bị"
      className={`bg-white rounded-2xl border border-[#E9ECEA] p-4 sm:p-5 shadow-xs space-y-3.5 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-[#E9ECEA] pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center flex-shrink-0">
            <PackageCheck className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#1D2522] uppercase tracking-wider">
              Thông tin nhận món mang đi
            </h3>
            <p className="text-[11px] text-[#727B77]">Nhận tại quầy khi hoàn tất chế biến</p>
          </div>
        </div>

        {ticketDisplay && (
          <span className="text-xs font-extrabold text-[#1D725E] bg-[#E8F4F0] px-2.5 py-1 rounded-lg border border-[#C6E7DC]">
            Số phiếu {ticketDisplay}
          </span>
        )}
      </div>

      {/* Thẻ nhỏ độc lập cho Mã nhận món */}
      {rawCode ? (
        <div className="p-3.5 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-[#727B77] block font-medium">Mã nhận món:</span>
            <span className="text-xl sm:text-2xl font-extrabold font-mono text-[#1D725E] mt-0.5 block tracking-wider select-all">
              {formattedCode}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            className="h-11 px-3.5 rounded-xl bg-white hover:bg-[#E8F4F0] border border-[#E9ECEA] text-xs font-bold text-[#1D725E] flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] active:scale-95 flex-shrink-0"
            aria-label="Sao chép mã nhận món"
          >
            {copied ? (
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
      ) : isLoadingPickup ? (
        <div className="p-3.5 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-center gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-lg bg-[#E9ECEA] flex items-center justify-center text-[#727B77]">
            <Clock className="w-4 h-4 animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#1D2522]">Đang chuẩn bị mã nhận món...</p>
            <p className="text-[11px] text-[#727B77]">Mã sẽ tự động cập nhật ngay</p>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-[#FAFBFB] border border-[#E9ECEA] flex items-center gap-2.5 text-xs text-[#55605C]">
          <Clock className="w-4 h-4 text-[#727B77] flex-shrink-0" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed">
            {pickupMessage || 'Chưa có mã nhận món. Bấm Làm mới để kiểm tra hoặc liên hệ quầy.'}
          </p>
        </div>
      )}

      {/* Lời nhắc */}
      <p className="text-[11px] text-[#55605C] leading-relaxed">
        Khi món sẵn sàng, thông báo sẽ xuất hiện trên màn hình. Quý khách hãy đưa mã này cho quán để nhận món.
      </p>
    </section>
  );
};
