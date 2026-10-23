'use client';

import React from 'react';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Bell,
  PackageCheck,
  XCircle,
  AlertTriangle,
  CreditCard,
  Check,
} from 'lucide-react';
import type { OrderStatus, PaymentStatus } from '../../../docs/contracts/types';

interface OwnerStatusBadgeProps {
  status: OrderStatus | PaymentStatus;
  className?: string;
}

/**
 * OwnerStatusBadge — Huy hiệu trạng thái dành cho Dashboard chủ quán.
 * Tuân thủ nguyên tắc phân định màu sắc ngữ nghĩa tách biệt khỏi màu brand:
 * - Chờ làm: Xám trung tính
 * - Đang làm: Xanh dương Info
 * - Sẵn sàng: Xanh ngọc Success
 * - Chờ thanh toán / Ngoại lệ: Hổ phách Warning
 * - Đã giao: Xanh lá đậm
 * - Đã hủy: Đỏ Danger
 */
export const OwnerStatusBadge: React.FC<OwnerStatusBadgeProps> = ({
  status,
  className = '',
}) => {
  switch (status) {
    case 'pending_payment':
    case 'pending':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF6EE] text-[#8A4D00] border border-[#F9DBAF] ${className}`}
        >
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Chờ thanh toán</span>
        </span>
      );

    case 'accepted':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F1F3F2] text-[#55605C] border border-[#DDE2E0] ${className}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Chờ làm</span>
        </span>
      );

    case 'preparing':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EBF3FB] text-[#1D528A] border border-[#CFE2F5] ${className}`}
        >
          <ChefHat className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Đang làm</span>
        </span>
      );

    case 'ready':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F4F0] text-[#165B4B] border border-[#C6E7DC] ${className}`}
        >
          <Bell className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Sẵn sàng</span>
        </span>
      );

    case 'completed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EAF5EA] text-[#1E561E] border border-[#C3E4C3] ${className}`}
        >
          <PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Đã giao</span>
        </span>
      );

    case 'cancelled':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3F2] text-[#912018] border border-[#FECDCA] ${className}`}
        >
          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Đã hủy</span>
        </span>
      );

    case 'payment_exception':
    case 'exception':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF4E5] text-[#B25E00] border border-[#FFD699] ${className}`}
        >
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Cần đối soát</span>
        </span>
      );

    case 'paid':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F4F0] text-[#165B4B] border border-[#C6E7DC] ${className}`}
        >
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Đã trả tiền</span>
        </span>
      );

    case 'unpaid':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F7F8F7] text-[#727B77] border border-[#E9ECEA] ${className}`}
        >
          <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Chưa thanh toán</span>
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 ${className}`}
        >
          {String(status)}
        </span>
      );
  }
};
