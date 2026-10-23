'use client';

import React, { useState } from 'react';
import {
  X,
  Plus,
  Edit2,
  Loader2,
  AlertCircle,
  QrCode,
  CheckCircle2,
} from 'lucide-react';
import type { OwnerTable } from '@/types/contracts/table-qr';
import { createOwnerTable, updateOwnerTable, MenuApiError } from '@/features/owner/api-client';

export interface AddEditTableDialogProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  tableToEdit?: OwnerTable | null;
  onClose: () => void;
  onSuccess: (table: OwnerTable, createdQrPath?: string | null) => void;
  onViewQr?: (table: OwnerTable) => void;
}

/**
 * AddEditTableDialog — Modal thêm / sửa tên bàn.
 * - Desktop Dialog / Mobile responsive Sheet.
 * - Validation: không rỗng, 1-80 ký tự, hiển thị lỗi trùng nhãn tại field.
 * - Giữ nguyên form state khi lỗi mạng hoặc xung đột.
 * - Giữ nguyên requestId khi retry sau lỗi mạng cùng intent; tạo key mới khi đổi intent.
 */
export const AddEditTableDialog: React.FC<AddEditTableDialogProps> = ({
  isOpen,
  mode,
  tableToEdit,
  onClose,
  onSuccess,
  onViewQr,
}) => {
  const [prevKey, setPrevKey] = useState<string>(`${mode}-${tableToEdit?.id ?? 'new'}`);
  const [label, setLabel] = useState(mode === 'edit' && tableToEdit ? tableToEdit.label : '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    table: OwnerTable;
    qrPath?: string | null;
  } | null>(null);

  // requestId gắn với intent hiện tại; giữ nguyên khi retry mạng, sinh mới khi thay đổi nội dung
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());

  const currentKey = `${mode}-${tableToEdit?.id ?? 'new'}`;
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setLabel(mode === 'edit' && tableToEdit ? tableToEdit.label : '');
    setFieldError(null);
    setFormError(null);
    setIsSubmitting(false);
    setSuccessResult(null);
    setRequestId(crypto.randomUUID());
  }

  if (!isOpen) return null;

  const validateInput = (): boolean => {
    const trimmed = label.trim();
    if (!trimmed) {
      setFieldError('Tên bàn không được để trống.');
      return false;
    }
    if (trimmed.length > 80) {
      setFieldError('Tên bàn không được vượt quá 80 ký tự.');
      return false;
    }
    setFieldError(null);
    return true;
  };

  const handleLabelChange = (newVal: string) => {
    setLabel(newVal);
    if (fieldError) setFieldError(null);
    // Sinh requestId mới khi thay đổi nội dung
    setRequestId(crypto.randomUUID());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInput() || isSubmitting) return;

    setIsSubmitting(true);
    setFieldError(null);
    setFormError(null);

    const trimmedLabel = label.trim();

    try {
      if (mode === 'create') {
        const createdTable = await createOwnerTable({
          label: trimmedLabel,
          requestId,
        });

        const qrPath = createdTable.qr?.path || null;
        onSuccess(createdTable, qrPath);
        setSuccessResult({ table: createdTable, qrPath });
        setIsSubmitting(false);
        return;
      } else {
        // Mode Edit: PATCH /api/owner/tables/:id
        if (!tableToEdit) return;

        const updatedTable = await updateOwnerTable(tableToEdit.id, {
          label: trimmedLabel,
          expectedUpdatedAt: tableToEdit.updatedAt,
          requestId,
        });

        onSuccess(updatedTable);
        onClose();
        return;
      }
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        const field = err.error.details?.field;
        const code = err.error.code;

        if (code === 'VALIDATION_ERROR' || err.status === 409 || field === 'label') {
          setFieldError('Tên bàn này đã tồn tại trong quán hoặc không hợp lệ. Vui lòng chọn tên khác.');
        } else if (code === 'INVALID_STATE_TRANSITION' && field === 'expectedUpdatedAt') {
          setFormError('Thông tin bàn đã bị cập nhật bởi người khác. Vui lòng đóng và làm mới danh sách bàn.');
        } else if (code === 'RATE_LIMITED') {
          setFormError('Thao tác quá nhanh. Vui lòng chờ vài giây rồi thử lại.');
        } else {
          setFormError(err.error.message || 'Không thể lưu thông tin bàn.');
        }
      } else {
        setFormError(
          'Lỗi mạng hoặc không thể kết nối tới máy chủ. Nội dung nhập đã được giữ nguyên, vui lòng thử lại.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-dialog-title"
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-3xl border border-[#E9ECEA] shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E9ECEA] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center">
              {mode === 'create' ? (
                <Plus className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Edit2 className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <div>
              <h3
                id="table-dialog-title"
                className="text-base font-bold text-[#1D2522]"
              >
                {mode === 'create' ? 'Thêm bàn mới' : 'Chỉnh sửa nhãn bàn'}
              </h3>
              <p className="text-xs text-[#727B77]">
                {mode === 'create'
                  ? 'Tạo bàn phục vụ mới và tự động kích hoạt mã QR tương ứng'
                  : `Đổi tên cho ${tableToEdit?.label || 'bàn'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#727B77] hover:bg-[#F7F8F7] hover:text-[#1D2522] transition-colors"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Nội dung khi đã tạo thành công */}
        {successResult ? (
          <div className="p-5 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
            </div>
            <div>
              <h4 className="text-base font-bold text-[#1D2522]">
                Đã tạo thành công {successResult.table.label}
              </h4>
              <p className="text-xs text-[#727B77] mt-1">
                Bàn mới đã được thêm vào hệ thống và sẵn sàng nhận khách.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewQr?.(successResult.table);
                }}
                className="flex-1 h-11 px-4 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <QrCode className="w-4 h-4" aria-hidden="true" />
                <span>Xem mã QR</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D2522] transition-colors"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        ) : (
          /* Form Thêm/Sửa */
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {formError && (
              <div
                role="alert"
                className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl text-xs text-[#912018] flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="table-label-input"
                className="block text-xs font-bold text-[#1D2522]"
              >
                Tên / Nhãn bàn <span className="text-[#B42318]">*</span>
              </label>
              <input
                id="table-label-input"
                type="text"
                value={label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="VD: Bàn 01, Bàn 02, Sân thượng 03..."
                maxLength={80}
                disabled={isSubmitting}
                className={`w-full h-11 px-3.5 rounded-xl border text-sm text-[#1D2522] placeholder:text-[#A0A8A5] bg-[#F7F8F7] focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  fieldError
                    ? 'border-[#FDA29B] focus:ring-[#FDA29B] bg-[#FEF3F2]/40'
                    : 'border-[#E9ECEA] focus:ring-[#35977D]'
                }`}
              />
              {fieldError ? (
                <p className="text-xs text-[#B42318] font-medium flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{fieldError}</span>
                </p>
              ) : (
                <p className="text-[11px] text-[#727B77]">
                  Tên hiển thị để phục vụ và phân biệt vị trí bàn (1–80 ký tự).
                </p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#E9ECEA]">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-10 px-4 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D2522] transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !label.trim()}
                className={`h-10 px-5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                  isSubmitting || !label.trim()
                    ? 'bg-[#A0A8A5] cursor-not-allowed'
                    : 'bg-[#1D725E] hover:bg-[#165B4B] active:scale-95'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <span>{mode === 'create' ? 'Tạo bàn' : 'Lưu thay đổi'}</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
