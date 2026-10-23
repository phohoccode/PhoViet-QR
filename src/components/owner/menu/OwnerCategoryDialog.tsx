'use client';

import React, { useState, useId, useEffect, useRef, useCallback } from 'react';
import { X, FolderPlus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { OwnerMenuCategory } from '../../../../docs/contracts/types';
import { createCategory, MenuApiError } from '../../../features/owner/api-client';

interface OwnerCategoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated?: (category: OwnerMenuCategory) => void;
  existingCategoriesCount?: number;
}

/**
 * OwnerCategoryDialog — Dialog thêm danh mục thực đơn cho chủ quán.
 * Nối trực tiếp với API createCategory (P2-C02) khi có sẵn;
 * Có gắn nhãn WAITING_FOR_CODEX / MOCK_PREVIEW nếu backend chưa hỗ trợ đầy đủ.
 */
export const OwnerCategoryDialog: React.FC<OwnerCategoryDialogProps> = ({
  isOpen,
  onClose,
  onCategoryCreated,
  existingCategoriesCount = 0,
}) => {
  const titleId = useId();
  const pendingRequestIdRef = useRef<string | null>(null);
  const [name, setName] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<number>(existingCategoriesCount + 1);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isWaitingForCodex, setIsWaitingForCodex] = useState<boolean>(false);

  const [prevIsOpen, setPrevIsOpen] = useState<boolean>(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setName('');
      setSortOrder(existingCategoriesCount + 1);
      setIsActive(true);
      setFieldError(null);
      setServerError(null);
      setSuccessMessage(null);
      setIsWaitingForCodex(false);
    }
  }

  // Reset requestId khi dialog mở
  useEffect(() => {
    if (isOpen) {
      pendingRequestIdRef.current = null;
    }
  }, [isOpen]);

  const [isClosing, setIsClosing] = useState(false);

  const handleAnimatedClose = useCallback(() => {
    if (isClosing || isSubmitting) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 180);
  }, [isClosing, isSubmitting, onClose]);

  // Đóng khi nhấn Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        handleAnimatedClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, handleAnimatedClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setServerError(null);
    setSuccessMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      setFieldError('Tên danh mục bắt buộc từ 1 đến 120 ký tự.');
      return;
    }

    setIsSubmitting(true);

    if (!pendingRequestIdRef.current) {
      pendingRequestIdRef.current = crypto.randomUUID();
    }
    const requestId = pendingRequestIdRef.current;

    try {
      const newCategory = await createCategory({
        name: trimmedName,
        sortOrder: Number(sortOrder) || 1,
        active: isActive,
        requestId,
      });

      pendingRequestIdRef.current = null;
      setSuccessMessage('Đã thêm danh mục thành công!');
      onCategoryCreated?.(newCategory);
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 700);
    } catch (err: unknown) {
      setIsSubmitting(false);

      if (err instanceof MenuApiError) {
        if (err.status === 422) {
          setServerError(
            err.error.message || 'Tên danh mục đã tồn tại trong quán hoặc không hợp lệ.'
          );
        } else if (err.status === 429) {
          setServerError('Thao tác quá thường xuyên. Vui lòng thử lại sau giây lát.');
        } else if (err.status === 400) {
          setServerError(err.error.message || 'Dữ liệu danh mục không hợp lệ.');
          pendingRequestIdRef.current = null;
        } else {
          setServerError(err.error.message || 'Không thể tạo danh mục trên máy chủ.');
        }
        return;
      }

      if (process.env.NODE_ENV === 'production') {
        // Trong production, TUYỆT ĐỐI không mock onCategoryCreated
        setServerError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền.');
        return;
      }

      // Chỉ fallback preview trong dev mode khi API local chưa chạy
      setIsWaitingForCodex(true);
      const mockCat: OwnerMenuCategory = {
        id: `cat-mock-${Date.now()}`,
        name: trimmedName,
        sortOrder: Number(sortOrder) || 1,
        active: isActive,
        updatedAt: new Date().toISOString(),
      };
      onCategoryCreated?.(mockCat);
      setSuccessMessage('Đã thêm danh mục (chế độ Mock Preview Dev).');
      pendingRequestIdRef.current = null;
      setTimeout(() => {
        onClose();
      }, 900);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 ${
        isClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="fixed inset-0 -z-10"
        onClick={() => !isSubmitting && handleAnimatedClose()}
        aria-hidden="true"
      />

      <div
        className={`w-full max-w-md bg-white rounded-2xl border border-[#E9ECEA] shadow-2xl overflow-hidden flex flex-col ${
          isClosing ? 'animate-dialog-card-out' : 'animate-dialog-card-in'
        }`}
      >
        {/* Header Dialog */}
        <div className="px-5 py-4 border-b border-[#E9ECEA] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center">
              <FolderPlus className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 id={titleId} className="text-sm font-bold text-[#1D2522]">
                Thêm danh mục mới
              </h3>
              <p className="text-[11px] text-[#727B77]">Phân loại món ăn trong thực đơn</p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleAnimatedClose}
            className="w-8 h-8 rounded-lg hover:bg-[#F7F8F7] text-[#727B77] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Thông báo nếu đang ở chế độ chờ Codex */}
        {isWaitingForCodex && (
          <div className="px-5 py-2 bg-[#FEF6EE] border-b border-[#F9DBAF] text-[11px] text-[#8A4D00] flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>Chế độ xem trước (WAITING_FOR_CODEX: API danh mục đang được hoàn thiện).</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div
              className="p-3 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018] flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{serverError}</span>
            </div>
          )}

          {successMessage && (
            <div
              className="p-3 rounded-xl bg-[#E8F4F0] border border-[#C6E7DC] text-xs text-[#1D725E] flex items-center gap-2"
              role="status"
            >
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Tên danh mục */}
          <div className="space-y-1">
            <label htmlFor="cat-name-input" className="text-xs font-semibold text-[#1D2522]">
              Tên danh mục <span className="text-[#B42318]">*</span>
            </label>
            <input
              id="cat-name-input"
              type="text"
              disabled={isSubmitting}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              placeholder="Ví dụ: Cà phê, Trà sữa, Bánh mì..."
              className={`w-full h-10 px-3 rounded-xl border text-sm text-[#1D2522] placeholder-[#727B77] bg-[#F7F8F7] focus:bg-white focus:outline-none transition-colors ${
                fieldError
                  ? 'border-[#FDA29B] focus:ring-2 focus:ring-[#FDA29B]'
                  : 'border-[#E9ECEA] focus:ring-2 focus:ring-[#35977D]'
              }`}
            />
            {fieldError && <p className="text-[11px] text-[#B42318]">{fieldError}</p>}
          </div>

          {/* Thứ tự hiển thị */}
          <div className="space-y-1">
            <label htmlFor="cat-sort-input" className="text-xs font-semibold text-[#1D2522]">
              Thứ tự hiển thị
            </label>
            <input
              id="cat-sort-input"
              type="number"
              min={1}
              max={99}
              disabled={isSubmitting}
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 1)}
              className="w-full h-10 px-3 rounded-xl border border-[#E9ECEA] text-sm text-[#1D2522] bg-[#F7F8F7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35977D] transition-colors"
            />
            <p className="text-[10px] text-[#727B77]">Số nhỏ hơn sẽ hiển thị trước trên thực đơn khách.</p>
          </div>

          {/* Trạng thái hoạt động */}
          <div className="flex items-center justify-between pt-2 border-t border-[#E9ECEA]">
            <div>
              <span className="text-xs font-semibold text-[#1D2522] block">Trạng thái danh mục</span>
              <span className="text-[11px] text-[#727B77]">
                {isActive ? 'Đang kích hoạt và hiển thị' : 'Đang tạm ẩn'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              disabled={isSubmitting}
              onClick={() => setIsActive(!isActive)}
              className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
                isActive ? 'bg-[#1D725E]' : 'bg-[#E9ECEA]'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                } top-1 absolute`}
              />
            </button>
          </div>

          {/* Footer nút hành động */}
          <div className="pt-3 border-t border-[#E9ECEA] flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-[#E9ECEA] text-xs font-semibold text-[#55605C] hover:bg-[#F7F8F7] transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-10 px-5 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              <span>{isSubmitting ? 'Đang lưu...' : 'Lưu danh mục'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
