'use client';

import React from 'react';
import { QrCodeView } from './QrCodeView';

export interface PrintQrVoucherProps {
  type: 'table' | 'takeaway';
  storeName: string;
  title: string; // e.g. "BÀN 05" or "MUA MANG ĐI"
  publicUrl: string;
  subtitle?: string;
  className?: string;
}

/**
 * PrintQrVoucher — Phiếu in mã QR chuẩn khổ A6/A7 tối ưu để dán tại bàn hoặc đặt tại quầy.
 * - Cô lập trong vùng id="qr-printable-area" khi in ấn (@media print).
 * - Sử dụng mực đen tương phản cao trên nền trắng tinh, có quiet zone chuẩn.
 * - Không chứa thông tin nhạy cảm: không mã phiên, không token owner, không STK ngân hàng.
 */
export const PrintQrVoucher: React.FC<PrintQrVoucherProps> = ({
  type,
  storeName,
  title,
  publicUrl,
  subtitle,
  className = '',
}) => {
  return (
    <div
      id="qr-printable-area"
      className={`print-voucher bg-white text-black p-6 sm:p-8 flex flex-col items-center justify-between text-center border-2 border-dashed border-gray-300 rounded-3xl max-w-sm mx-auto shadow-sm print:border-none print:shadow-none print:max-w-none print:w-full print:h-full print:p-0 ${className}`}
    >
      {/* Header phiếu in */}
      <div className="w-full pb-3 border-b border-gray-200 print:border-black/20">
        <p className="text-xs uppercase tracking-widest font-semibold text-gray-500 print:text-black/70 mb-1">
          {storeName}
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-gray-900 print:text-black">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-gray-500 print:text-black/70 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Mã QR trung tâm */}
      <div className="my-5 flex flex-col items-center justify-center">
        <QrCodeView
          value={publicUrl}
          size={240}
          margin={4}
          fgColor="#000000"
          bgColor="#FFFFFF"
          className="p-1 border-none shadow-none print:p-0"
        />
        <div className="mt-2 text-center">
          <p className="text-[11px] font-mono text-gray-400 print:text-black/60 break-all max-w-[260px]">
            {publicUrl}
          </p>
        </div>
      </div>

      {/* Hướng dẫn cho khách hàng */}
      <div className="w-full pt-3 border-t border-gray-200 print:border-black/20">
        {type === 'table' ? (
          <div className="space-y-1">
            <p className="text-sm font-bold text-gray-900 print:text-black">
              Quét mã để xem menu và gọi món
            </p>
            <p className="text-[11px] text-gray-500 print:text-black/70">
              Chủ quán sẽ mở phiên bàn và cung cấp mã phiên cho quý khách.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-bold text-gray-900 print:text-black">
              MUA MANG ĐI TẠI QUẦY
            </p>
            <p className="text-xs font-medium text-gray-700 print:text-black">
              Quét mã • Chọn món • Thanh toán • Nhận số thứ tự
            </p>
          </div>
        )}

        <div className="mt-3 text-[10px] text-gray-400 print:text-black/50 tracking-wider uppercase">
          Hệ thống đặt món nhanh Phở Việt QR
        </div>
      </div>
    </div>
  );
};
