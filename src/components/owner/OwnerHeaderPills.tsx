'use client';

import React from 'react';
import { ClipboardList, LayoutGrid, BookOpen, Settings } from 'lucide-react';

export type OwnerTabType = 'orders' | 'tables' | 'menu' | 'settings';

interface OwnerHeaderPillsProps {
  activeTab: OwnerTabType;
  onTabChange: (tab: OwnerTabType) => void;
  className?: string;
}

interface TabItem {
  id: OwnerTabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabItem[] = [
  { id: 'orders', label: 'Đơn hàng', icon: ClipboardList },
  { id: 'tables', label: 'Bàn', icon: LayoutGrid },
  { id: 'menu', label: 'Menu', icon: BookOpen },
  { id: 'settings', label: 'Cài đặt', icon: Settings },
];

/**
 * OwnerHeaderPills — Thanh điều hướng 4 tab dạng viên thuốc (Centered Pill Navigation),
 * kế thừa 100% tinh thần thị giác từ assets/ui-reference.png.
 */
export const OwnerHeaderPills: React.FC<OwnerHeaderPillsProps> = ({
  activeTab,
  onTabChange,
  className = '',
}) => {
  return (
    <nav
      className={`inline-flex items-center p-1 bg-[#F7F8F7] border border-[#E9ECEA] rounded-full shadow-inner ${className}`}
      aria-label="Các phân hệ quản trị của chủ quán"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs md:text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35977D] ${
              isActive
                ? 'bg-[#35977D] text-white shadow-sm'
                : 'text-[#727B77] hover:text-[#1D2522] hover:bg-black/5'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
