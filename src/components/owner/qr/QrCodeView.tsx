'use client';

import React, { useMemo } from 'react';
import { generateQrMatrix, matrixToSvg, type QrMatrix } from '@/lib/qr/qr-code';

export interface QrCodeViewProps {
  value: string;
  size?: number;
  margin?: number;
  className?: string;
  fgColor?: string;
  bgColor?: string;
  alt?: string;
}

/**
 * QrCodeView — Render mã QR chuẩn ISO/IEC 18004 trực tiếp trên client (Zero-dependency SVG).
 * Đảm bảo độ sắc nét cao, quiet zone chuẩn, hiển thị tốt trên màn hình và in ấn.
 */
export const QrCodeView: React.FC<QrCodeViewProps> = ({
  value,
  size = 200,
  margin = 4,
  className = '',
  fgColor = '#1D2522',
  bgColor = '#FFFFFF',
  alt = 'Mã QR quét đặt món',
}) => {
  const { svgMarkup, matrix } = useMemo(() => {
    try {
      const mat = generateQrMatrix(value);
      const svg = matrixToSvg(mat, { margin, fgColor, bgColor, size });
      return { svgMarkup: svg, matrix: mat };
    } catch {
      return { svgMarkup: null, matrix: null as QrMatrix | null };
    }
  }, [value, margin, fgColor, bgColor, size]);

  if (!svgMarkup || !matrix) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500 p-4 text-center ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label={alt}
      >
        <span>Không thể tạo mã QR (Dữ liệu vượt quá dung lượng)</span>
      </div>
    );
  }

  // Render SVG data URI in an <img> tag for maximum CSP safety and print stability
  const svgDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`;

  return (
    <div
      className={`inline-flex items-center justify-center p-2 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs select-none ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={svgDataUri}
        alt={alt}
        width={size}
        height={size}
        className="block max-w-full h-auto aspect-square"
      />
    </div>
  );
};
