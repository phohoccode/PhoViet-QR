'use client';

import React from 'react';
import { Coffee } from 'lucide-react';

interface OwnerEmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * OwnerEmptyState — Khung trạng thái rỗng trình diễn cho dashboard chủ quán.
 */
export const OwnerEmptyState: React.FC<OwnerEmptyStateProps> = ({
  icon: Icon = Coffee,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center text-[#727B77] bg-white rounded-2xl border border-[#E9ECEA] ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#F7F8F7] flex items-center justify-center text-[#35977D] mb-3">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </div>
      <h4 className="text-sm font-bold text-[#1D2522]">{title}</h4>
      {description && (
        <p className="text-xs text-[#727B77] mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-[#1D725E] text-white hover:bg-[#165B4B] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
