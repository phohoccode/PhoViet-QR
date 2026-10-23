'use client';

import React from 'react';
import { MapPin, ShoppingBag } from 'lucide-react';
import type { OrderType } from '../../../docs/contracts/types';

interface CustomerModeBadgeProps {
  mode: OrderType;
  tableLabel?: string | null;
  className?: string;
}

/**
 * CustomerModeBadge — Hiển thị ngữ cảnh vị trí rõ ràng của khách hàng.
 * Phân định rạch ròi giữa Tại bàn (Dine-in) và Mang đi (Takeaway).
 */
export const CustomerModeBadge: React.FC<CustomerModeBadgeProps> = ({
  mode,
  tableLabel,
  className = '',
}) => {
  if (mode === 'dine_in') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC] ${className}`}
        role="status"
        aria-label={`Ngữ cảnh gọi món: ${tableLabel || 'Tại bàn'}`}
      >
        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{tableLabel ? `Bàn ${tableLabel.replace(/bàn\s*/i, '')}` : 'Tại bàn'}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F1F3F2] text-[#55605C] border border-[#DDE2E0] ${className}`}
      role="status"
      aria-label="Ngữ cảnh gọi món: Mua mang đi"
    >
      <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Mang đi · Nhận tại quầy</span>
    </span>
  );
};
