'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface OwnerErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * OwnerErrorState — Hiển thị trạng thái lỗi tải dữ liệu trong các tab Dashboard chủ quán.
 */
export const OwnerErrorState: React.FC<OwnerErrorStateProps> = ({
  title,
  description,
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-[#FEF3F2]/40 rounded-2xl border border-[#FECDCA] my-4 ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="w-12 h-12 rounded-2xl bg-[#FEF3F2] flex items-center justify-center text-[#B42318] mb-3 shadow-xs">
        <AlertCircle className="w-6 h-6" aria-hidden="true" />
      </div>
      <h4 className="text-sm font-bold text-[#912018]">{title}</h4>
      {description && (
        <p className="text-xs text-[#727B77] mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-[#B42318] text-white hover:bg-[#912018] active:scale-95 transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B42318]"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Thử tải lại</span>
        </button>
      )}
    </div>
  );
};
