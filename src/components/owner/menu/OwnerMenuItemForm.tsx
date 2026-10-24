'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  X,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Upload,
  RotateCcw,
} from 'lucide-react';
import type {
  OwnerMenuItem,
  MenuCategory,
  CreateMenuItemInput,
  PatchMenuItemInput,
  MenuOptionWrite,
} from '../../../../docs/contracts/types';
import { createMenuItem, updateMenuItem, uploadMenuItemImage, MenuApiError } from '../../../features/owner/api-client';

interface OwnerMenuItemFormProps {
  item: OwnerMenuItem | null;
  categories: (MenuCategory & { active: boolean; updatedAt?: string })[];
  isOpen?: boolean;
  onClose?: () => void;
  onSaved?: (savedItem: OwnerMenuItem) => void;
  onUploadImage?: (file: File) => Promise<{ url: string }>;
  isSidePanel?: boolean;
  className?: string;
}

/**
 * Hàm định dạng số nguyên thành chuỗi phân cách hàng ngàn kiểu Việt Nam (35000 -> "35.000")
 */
function formatNumberInput(value: number | string): string {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(digits));
}

/**
 * Hàm phân tích chuỗi nhập về số nguyên an toàn
 */
function parseNumberInput(formatted: string): number {
  const digits = formatted.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * OwnerMenuItemForm — Biểu mẫu thêm / chỉnh sửa món ăn cho chủ quán (Nhiệm vụ C).
 * Hỗ trợ các trường đầy đủ: tên, danh mục, giá VND, mô tả, URL ảnh (kèm live preview),
 * công tắc còn hàng (available), công tắc hiển thị (active), và bộ tùy chọn thêm (options).
 */
export const OwnerMenuItemForm: React.FC<OwnerMenuItemFormProps> = ({
  item,
  categories,
  isOpen = true,
  onClose,
  onSaved,
  onUploadImage,
  isSidePanel = false,
  className = '',
}) => {
  const isEditing = Boolean(item);

  // Form states - khởi tạo trực tiếp từ item được truyền vào
  const [name, setName] = useState<string>(() => item?.name || '');
  const [categoryId, setCategoryId] = useState<string>(
    () => item?.categoryId || (categories[0]?.id ?? '')
  );
  const [priceDisplay, setPriceDisplay] = useState<string>(
    () => (item ? formatNumberInput(item.priceVnd) : '')
  );
  const [description, setDescription] = useState<string>(() => item?.description || '');
  const [imageUrl, setImageUrl] = useState<string>(() => item?.imageUrl || '');
  const [isAvailable, setIsAvailable] = useState<boolean>(() => item?.available ?? true);
  const [isActive, setIsActive] = useState<boolean>(() => item?.active ?? true);
  const [options, setOptions] = useState<MenuOptionWrite[]>(
    () =>
      item?.options?.map((opt) => ({
        id: opt.id,
        name: opt.name,
        priceDeltaVnd: opt.priceDeltaVnd,
        available: opt.available,
      })) || []
  );

  // Image Upload state (HF01)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => item?.imageUrl || null);
  const [isObjectUrl, setIsObjectUrl] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'validating' | 'uploading' | 'uploaded' | 'failed'
  >('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Dọn dẹp object URL khi unmount hoặc đổi ảnh để tránh rò rỉ bộ nhớ
  const cleanupPreview = useCallback(() => {
    if (isObjectUrl && previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [isObjectUrl, previewUrl]);

  useEffect(() => {
    return () => {
      cleanupPreview();
    };
  }, [cleanupPreview]);

  // Validation & Mutation states
  const pendingRequestIdRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Điền dữ liệu khi item được chọn thay đổi
  const [prevItem, setPrevItem] = useState<OwnerMenuItem | null>(item);

  if (item !== prevItem) {
    setPrevItem(item);
    cleanupPreview();
    setSelectedFile(null);
    setUploadStatus('idle');
    setUploadError(null);
    setIsObjectUrl(false);
    if (item) {
      setName(item.name || '');
      setCategoryId(item.categoryId || (categories[0]?.id ?? ''));
      setPriceDisplay(formatNumberInput(item.priceVnd));
      setDescription(item.description || '');
      setImageUrl(item.imageUrl || '');
      setPreviewUrl(item.imageUrl || null);
      setIsAvailable(item.available);
      setIsActive(item.active);
      setOptions(
        item.options?.map((opt) => ({
          id: opt.id,
          name: opt.name,
          priceDeltaVnd: opt.priceDeltaVnd,
          available: opt.available,
        })) || []
      );
    } else {
      setName('');
      setCategoryId(categories[0]?.id ?? '');
      setPriceDisplay('');
      setDescription('');
      setImageUrl('');
      setPreviewUrl(null);
      setIsAvailable(true);
      setIsActive(true);
      setOptions([]);
    }
    setErrors({});
    setServerError(null);
    setSuccessMessage(null);
  }

  const [isClosing, setIsClosing] = useState<boolean>(false);

  // Đóng dialog với animation thoát nhẹ nhàng
  const handleAnimatedClose = useCallback(() => {
    if (isSubmitting) return;
    cleanupPreview();
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
      setIsClosing(false);
    }, 180);
  }, [isSubmitting, cleanupPreview, onClose]);

  // Reset requestId khi item thay đổi hoặc dialog đóng
  useEffect(() => {
    pendingRequestIdRef.current = null;
  }, [item, isOpen]);

  // Đóng dialog khi bấm ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting && onClose) {
        handleAnimatedClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose, handleAnimatedClose]);

  if (!isOpen && !isSidePanel) return null;

  // Xử lý thêm tùy chọn (Option)
  const handleAddOption = () => {
    setOptions((prev) => [
      ...prev,
      {
        name: '',
        priceDeltaVnd: 0,
        available: true,
      },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleOptionChange = (
    index: number,
    field: keyof MenuOptionWrite,
    value: unknown
  ) => {
    setOptions((prev) =>
      prev.map((opt, idx) => (idx === index ? { ...opt, [field]: value } : opt))
    );
  };

  // HF01: Các hàm xử lý upload ảnh món ăn từ thiết bị
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleProcessFile = async (file: File) => {
    setUploadError(null);
    setUploadStatus('validating');

    // 1. Kiểm tra định dạng (JPG, PNG, WebP)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadStatus('failed');
      setUploadError('Định dạng không được hỗ trợ. Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
      return;
    }

    // 2. Kiểm tra dung lượng (tối đa 5 MB = 5 * 1024 * 1024 bytes)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadStatus('failed');
      setUploadError('Dung lượng ảnh vượt quá 5 MB (5 MiB). Vui lòng chọn ảnh nhỏ hơn.');
      return;
    }

    // 3. Tạo preview thực tế (object URL)
    cleanupPreview();
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsObjectUrl(true);
    setSelectedFile(file);

    // 4. Tiến hành upload trực tiếp
    setUploadStatus('uploading');
    const uploader = onUploadImage || uploadMenuItemImage;

    try {
      const res = await uploader(file);
      setImageUrl(res.url);
      setUploadStatus('uploaded');
    } catch (err: unknown) {
      setUploadStatus('failed');
      const msg =
        err instanceof MenuApiError
          ? err.error?.message || 'Không thể tải ảnh lên máy chủ (Storage).'
          : err instanceof Error
          ? err.message
          : 'Lỗi kết nối khi tải ảnh lên máy chủ.';
      setUploadError(msg);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    cleanupPreview();
    setSelectedFile(null);
    setPreviewUrl(null);
    setIsObjectUrl(false);
    setImageUrl('');
    setUploadStatus('idle');
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRetryUpload = () => {
    if (selectedFile) {
      handleProcessFile(selectedFile);
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  // Kiểm tra tính hợp lệ trước khi gửi
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      errs.name = 'Tên món ăn bắt buộc từ 1 đến 120 ký tự.';
    }
    if (!categoryId) {
      errs.categoryId = 'Vui lòng chọn danh mục cho món ăn.';
    }
    const parsedPrice = parseNumberInput(priceDisplay);
    if (priceDisplay.trim() === '' || parsedPrice < 0 || !Number.isSafeInteger(parsedPrice)) {
      errs.price = 'Giá món phải là số nguyên VND lớn hơn hoặc bằng 0.';
    }
    if (description.trim().length > 1000) {
      errs.description = 'Mô tả không được vượt quá 1000 ký tự.';
    }

    const trimmedImg = imageUrl.trim();
    if (trimmedImg && trimmedImg.length > 2048) {
      errs.imageUrl = 'Đường dẫn ảnh không được vượt quá 2048 ký tự.';
    }

    if (uploadStatus === 'uploading' || uploadStatus === 'validating') {
      errs.upload = 'Ảnh đang được tải lên. Vui lòng đợi hoàn tất trước khi lưu.';
    }

    // Kiểm tra tên các tùy chọn nếu có
    options.forEach((opt, idx) => {
      if (!opt.name.trim()) {
        errs[`option_${idx}`] = 'Tên tùy chọn không được để trống.';
      }
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setSuccessMessage(null);

    if (!validate()) return;

    setIsSubmitting(true);
    const parsedPrice = parseNumberInput(priceDisplay);
    const trimmedImg = imageUrl.trim();

    const validOptions: MenuOptionWrite[] = options.map((opt) => ({
      ...(opt.id ? { id: opt.id } : {}),
      name: opt.name.trim(),
      priceDeltaVnd: Number(opt.priceDeltaVnd) || 0,
      available: opt.available !== false,
    }));

    // Giữ nguyên command requestId qua retry / timeout
    if (!pendingRequestIdRef.current) {
      pendingRequestIdRef.current = crypto.randomUUID();
    }
    const requestId = pendingRequestIdRef.current;

    try {
      let savedItem: OwnerMenuItem;

      if (isEditing && item) {
        // Gửi mutation PATCH R15 giữ nguyên expectedUpdatedAt (microsecond ISO)
        const patchInput: PatchMenuItemInput = {
          requestId,
          expectedUpdatedAt: item.updatedAt,
          name: name.trim(),
          categoryId,
          priceVnd: parsedPrice,
          description: description.trim() || null,
          imageUrl: trimmedImg || null,
          available: isAvailable,
          active: isActive,
          options: validOptions,
        };

        savedItem = await updateMenuItem(item.id, patchInput);
      } else {
        // Gửi mutation POST R14
        const createInput: CreateMenuItemInput = {
          requestId,
          name: name.trim(),
          categoryId,
          priceVnd: parsedPrice,
          description: description.trim() || null,
          imageUrl: trimmedImg || null,
          available: isAvailable,
          active: isActive,
          options: validOptions,
        };

        savedItem = await createMenuItem(createInput);
      }

      // Xóa pending command sau phản hồi thành công dứt khoát
      pendingRequestIdRef.current = null;
      setSuccessMessage(
        isEditing ? 'Cập nhật món ăn thành công!' : 'Thêm món mới thành công!'
      );
      onSaved?.(savedItem);

      if (!isSidePanel && onClose) {
        setTimeout(() => {
          setIsSubmitting(false);
          handleAnimatedClose();
        }, 500);
      } else {
        setIsSubmitting(false);
      }
    } catch (err: unknown) {
      setIsSubmitting(false);

      if (err instanceof MenuApiError) {
        if (err.status === 409) {
          setServerError(
            'Dữ liệu món đã bị thay đổi bởi phiên làm việc khác (CAS conflict). Vui lòng tải lại trang để lấy phiên bản mới nhất.'
          );
        } else if (err.status === 422) {
          setServerError(
            err.error.message ||
              'Dữ liệu không hợp lệ (danh mục không hoạt động hoặc tùy chọn trùng lặp).'
          );
        } else if (err.status === 429) {
          setServerError('Thao tác quá thường xuyên. Vui lòng thử lại sau giây lát.');
        } else if (err.status === 400) {
          setServerError(err.error.message || 'Dữ liệu nhập không hợp lệ.');
          pendingRequestIdRef.current = null;
        } else {
          setServerError(err.error.message || 'Lỗi xử lý từ máy chủ POS.');
        }
        return;
      }
      // Lỗi mạng hoặc server không phản hồi
      setServerError('Không thể kết nối đến máy chủ POS. Vui lòng kiểm tra mạng và thử lại.');
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header khu vực soạn thảo */}
      <div className="px-5 py-3.5 border-b border-[#E9ECEA] flex items-center justify-between bg-white flex-shrink-0 z-10">
        <div>
          <h3 className="text-sm font-bold text-[#1D2522]">
            {isEditing ? `Sửa món: ${item?.name}` : 'Thêm món mới vào thực đơn'}
          </h3>
          <p className="text-[11px] text-[#727B77]">
            {isEditing ? 'Cập nhật thông tin, giá và tình trạng' : 'Điền chi tiết để tạo món mới'}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={handleAnimatedClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg hover:bg-[#F7F8F7] active:scale-95 text-[#727B77] flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label="Đóng bảng chỉnh sửa"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Nội dung Form cuộn được */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 overscroll-contain scrollbar-thin">
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

        {/* 1. Tên món ăn */}
        <div className="space-y-1">
          <label htmlFor="item-name" className="text-xs font-semibold text-[#1D2522]">
            Tên món ăn <span className="text-[#B42318]">*</span>
          </label>
          <input
            id="item-name"
            type="text"
            disabled={isSubmitting}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
            }}
            placeholder="Ví dụ: Phở bò tái lăn, Cà phê muối..."
            className={`w-full h-10 px-3 rounded-xl border text-sm text-[#1D2522] placeholder-[#727B77] bg-[#F7F8F7] focus:bg-white focus:outline-none transition-colors ${
              errors.name
                ? 'border-[#FDA29B] focus:ring-2 focus:ring-[#FDA29B]'
                : 'border-[#E9ECEA] focus:ring-2 focus:ring-[#35977D]'
            }`}
          />
          {errors.name && <p className="text-[11px] text-[#B42318]">{errors.name}</p>}
        </div>

        {/* 2. Danh mục & Giá tiền */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Danh mục */}
          <div className="space-y-1">
            <label htmlFor="item-category" className="text-xs font-semibold text-[#1D2522]">
              Danh mục <span className="text-[#B42318]">*</span>
            </label>
            <select
              id="item-category"
              disabled={isSubmitting}
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                if (errors.categoryId) setErrors((prev) => ({ ...prev, categoryId: '' }));
              }}
              className="w-full h-10 px-3 rounded-xl border border-[#E9ECEA] text-sm text-[#1D2522] bg-[#F7F8F7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35977D] transition-colors"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} {!cat.active ? '(Đã ẩn)' : ''}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="text-[11px] text-[#B42318]">{errors.categoryId}</p>
            )}
          </div>

          {/* Giá tiền (VND) */}
          <div className="space-y-1">
            <label htmlFor="item-price" className="text-xs font-semibold text-[#1D2522]">
              Giá bán (VND) <span className="text-[#B42318]">*</span>
            </label>
            <div className="relative">
              <input
                id="item-price"
                type="text"
                disabled={isSubmitting}
                value={priceDisplay}
                onChange={(e) => {
                  setPriceDisplay(formatNumberInput(e.target.value));
                  if (errors.price) setErrors((prev) => ({ ...prev, price: '' }));
                }}
                placeholder="35.000"
                className={`w-full h-10 pl-3 pr-8 rounded-xl border text-sm text-[#1D2522] placeholder-[#727B77] bg-[#F7F8F7] focus:bg-white focus:outline-none transition-colors ${
                  errors.price
                    ? 'border-[#FDA29B] focus:ring-2 focus:ring-[#FDA29B]'
                    : 'border-[#E9ECEA] focus:ring-2 focus:ring-[#35977D]'
                }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#727B77] pointer-events-none">
                đ
              </span>
            </div>
            {errors.price && <p className="text-[11px] text-[#B42318]">{errors.price}</p>}
          </div>
        </div>

        {/* 3. Mô tả món */}
        <div className="space-y-1">
          <label htmlFor="item-desc" className="text-xs font-semibold text-[#1D2522]">
            Mô tả món ăn
          </label>
          <textarea
            id="item-desc"
            rows={2}
            disabled={isSubmitting}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả nguyên liệu, hương vị đặc trưng..."
            className="w-full p-3 rounded-xl border border-[#E9ECEA] text-xs text-[#1D2522] placeholder-[#727B77] bg-[#F7F8F7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35977D] transition-colors resize-none"
          />
        </div>

        {/* 4. Hình ảnh món ăn: Khung tải ảnh trực tiếp từ thiết bị (HF01) */}
        <div className="space-y-1.5">
          <label htmlFor="item-image-file-input" className="text-xs font-semibold text-[#1D2522] block">
            Hình ảnh món ăn
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isSubmitting || uploadStatus === 'uploading'}
            onChange={handleFileChange}
            className="hidden"
            id="item-image-file-input"
            aria-label="Tải ảnh món ăn từ thiết bị"
          />

          {!previewUrl ? (
            /* Khung upload ban đầu: icon + CTA + mô tả */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                if (!isSubmitting && uploadStatus !== 'uploading') {
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`w-full p-5 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-[#35977D] bg-[#E8F4F0]'
                  : 'border-[#D0D5DD] bg-[#F7F8F7] hover:border-[#35977D] hover:bg-[#F2F8F5]'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-white border border-[#E9ECEA] flex items-center justify-center mb-2 shadow-2xs">
                <Upload className="w-5 h-5 text-[#35977D]" aria-hidden="true" />
              </div>
              <span className="text-xs font-bold text-[#1D2522]">
                Chọn ảnh từ thiết bị
              </span>
              <span className="text-[11px] text-[#727B77] mt-0.5">
                Kéo thả hoặc bấm để duyệt file
              </span>
              <span className="text-[10px] text-[#A0A8A5] mt-1.5 font-medium">
                JPG, PNG, WebP · Tối đa 5 MB
              </span>
            </div>
          ) : (
            /* Khung preview sau khi chọn hoặc khi sửa món đã có ảnh */
            <div className="p-3 rounded-2xl bg-[#F7F8F7] border border-[#E9ECEA] space-y-2.5">
              <div className="flex items-center gap-3">
                {/* Ảnh preview 1:1 tỉ lệ vuông bo góc */}
                <div className="w-16 h-16 rounded-xl bg-white border border-[#E9ECEA] overflow-hidden flex-shrink-0 relative">
                  <Image
                    src={previewUrl}
                    alt={selectedFile ? selectedFile.name : (name || 'Ảnh món ăn')}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {uploadStatus === 'uploading' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                </div>

                {/* Thông tin ảnh & Các nút hành động */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1D2522] truncate">
                    {selectedFile ? selectedFile.name : 'Ảnh món hiện tại'}
                  </p>
                  <p className="text-[11px] text-[#727B77]">
                    {selectedFile ? formatFileSize(selectedFile.size) : 'Đã lưu trên hệ thống'}
                  </p>

                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      type="button"
                      disabled={isSubmitting || uploadStatus === 'uploading'}
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-semibold text-[#1D725E] hover:text-[#165B4B] disabled:opacity-50 transition-colors"
                    >
                      Thay ảnh
                    </button>
                    <span className="text-[#D0D5DD] text-xs">·</span>
                    <button
                      type="button"
                      disabled={isSubmitting || uploadStatus === 'uploading'}
                      onClick={handleRemoveImage}
                      className="text-xs font-semibold text-[#B42318] hover:text-[#912018] disabled:opacity-50 transition-colors"
                    >
                      Bỏ ảnh
                    </button>
                  </div>
                </div>

                {/* Status badge */}
                <div className="flex-shrink-0">
                  {uploadStatus === 'uploading' && (
                    <span className="text-[11px] text-[#1D725E] font-medium flex items-center gap-1 bg-[#E8F4F0] px-2 py-0.5 rounded-full border border-[#C6E7DC]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Đang tải...</span>
                    </span>
                  )}
                  {uploadStatus === 'uploaded' && (
                    <span className="text-[11px] text-[#1D725E] font-medium flex items-center gap-1 bg-[#E8F4F0] px-2 py-0.5 rounded-full border border-[#C6E7DC]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Đã tải lên</span>
                    </span>
                  )}
                  {uploadStatus === 'failed' && (
                    <button
                      type="button"
                      onClick={handleRetryUpload}
                      className="text-[11px] text-[#B42318] font-medium flex items-center gap-1 bg-[#FEF3F2] px-2 py-0.5 rounded-full border border-[#FECDCA] hover:bg-[#FEE4E2] transition-colors"
                      title="Bấm để thử lại"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Thử lại</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {uploadError && (
            <div className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] flex items-center gap-2 text-xs text-[#912018]">
              <AlertCircle className="w-4 h-4 text-[#B42318] flex-shrink-0" aria-hidden="true" />
              <span>{uploadError}</span>
            </div>
          )}

          {errors.upload && (
            <div className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] flex items-center gap-2 text-xs text-[#912018]">
              <AlertCircle className="w-4 h-4 text-[#B42318] flex-shrink-0" aria-hidden="true" />
              <span>{errors.upload}</span>
            </div>
          )}

          <p className="text-[10px] text-[#727B77]">
            Hỗ trợ JPG, PNG, WebP · Tối đa 5 MB
          </p>
        </div>

        {/* 5. Hai công tắc Trạng thái: Còn hàng & Đang hiển thị */}
        <div className="pt-2 border-t border-[#E9ECEA] space-y-2.5">
          {/* Còn hàng (available) */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA]">
            <div>
              <span className="text-xs font-semibold text-[#1D2522] block">Tình trạng còn hàng</span>
              <span className="text-[11px] text-[#727B77]">
                {isAvailable ? 'Còn món phục vụ khách' : 'Hết hàng (khách chỉ xem, không thể chọn)'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isAvailable}
              disabled={isSubmitting}
              onClick={() => setIsAvailable(!isAvailable)}
              className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
                isAvailable ? 'bg-[#1D725E]' : 'bg-[#E9ECEA]'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform ${
                  isAvailable ? 'translate-x-6' : 'translate-x-1'
                } top-1 absolute`}
              />
            </button>
          </div>

          {/* Hiển thị trên thực đơn (active) */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA]">
            <div>
              <span className="text-xs font-semibold text-[#1D2522] block">Hiển thị trong thực đơn</span>
              <span className="text-[11px] text-[#727B77]">
                {isActive ? 'Đang hiển thị cho khách quét QR' : 'Đã ẩn (khách không nhìn thấy món này)'}
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
        </div>

        {/* 6. Danh sách Tùy chọn món (Options Editor) */}
        <div className="pt-2 border-t border-[#E9ECEA] space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-[#1D2522] uppercase tracking-wider">
                Tùy chọn kèm theo ({options.length})
              </h4>
              <p className="text-[10px] text-[#727B77]">
                Các tùy chọn đơn giản (ví dụ: Ít ngọt, Thêm topping, Size lớn...)
              </p>
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleAddOption}
              className="px-2.5 py-1 rounded-lg bg-[#E8F4F0] text-[#1D725E] hover:bg-[#1D725E] hover:text-white text-xs font-bold flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Thêm tùy chọn</span>
            </button>
          </div>

          {options.length === 0 ? (
            <div className="p-3 rounded-xl bg-[#F7F8F7] border border-dashed border-[#E9ECEA] text-center text-[11px] text-[#727B77]">
              Món này chưa có tùy chọn thêm nào.
            </div>
          ) : (
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div
                  key={opt.id || idx}
                  className="p-2.5 rounded-xl border border-[#E9ECEA] bg-[#FAFBFB] flex items-center gap-2"
                >
                  {/* Tên tùy chọn */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      disabled={isSubmitting}
                      value={opt.name}
                      onChange={(e) => handleOptionChange(idx, 'name', e.target.value)}
                      placeholder="Tên tùy chọn (vd: Thêm kem muối)"
                      className="w-full h-8 px-2.5 rounded-lg border border-[#E9ECEA] text-xs bg-white text-[#1D2522] focus:outline-none focus:ring-1 focus:ring-[#35977D]"
                    />
                    {errors[`option_${idx}`] && (
                      <p className="text-[10px] text-[#B42318] mt-0.5">
                        {errors[`option_${idx}`]}
                      </p>
                    )}
                  </div>

                  {/* Giá phụ thu (priceDeltaVnd) */}
                  <div className="w-24 relative flex-shrink-0">
                    <input
                      type="text"
                      disabled={isSubmitting}
                      value={formatNumberInput(opt.priceDeltaVnd)}
                      onChange={(e) =>
                        handleOptionChange(
                          idx,
                          'priceDeltaVnd',
                          parseNumberInput(e.target.value)
                        )
                      }
                      placeholder="+0"
                      className="w-full h-8 pl-2 pr-6 rounded-lg border border-[#E9ECEA] text-xs bg-white text-[#1D2522] focus:outline-none focus:ring-1 focus:ring-[#35977D]"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#727B77] pointer-events-none">
                      đ
                    </span>
                  </div>

                  {/* Toggle Còn / Hết hàng cho tùy chọn */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleOptionChange(idx, 'available', opt.available === false)}
                    className={`h-8 px-2 rounded-lg text-[10px] font-semibold border flex items-center gap-1 transition-colors flex-shrink-0 ${
                      opt.available !== false
                        ? 'bg-[#E8F4F0] border-[#35977D]/30 text-[#1D725E]'
                        : 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]'
                    }`}
                    title={opt.available !== false ? 'Đang phục vụ (Bấm để tạm ngưng)' : 'Đang tạm ngưng (Bấm để phục vụ)'}
                  >
                    <span>{opt.available !== false ? 'Còn' : 'Hết'}</span>
                  </button>

                  {/* Xóa tùy chọn */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleRemoveOption(idx)}
                    className="w-8 h-8 rounded-lg text-[#727B77] hover:text-[#B42318] hover:bg-[#FEF3F2] flex items-center justify-center transition-colors flex-shrink-0"
                    aria-label={`Xóa tùy chọn ${opt.name || idx + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Form: Nút Lưu & Hủy - Luôn cố định ở chân dialog */}
      <div className="p-4 bg-white border-t border-[#E9ECEA] flex items-center justify-end gap-2 flex-shrink-0 z-10">
        {onClose && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleAnimatedClose}
            className="h-10 px-4 rounded-xl border border-[#E9ECEA] text-xs font-semibold text-[#55605C] hover:bg-[#F7F8F7] active:scale-95 transition-all"
          >
            Hủy
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || uploadStatus === 'uploading' || uploadStatus === 'validating'}
          className="h-10 px-5 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Đang lưu...</span>
            </>
          ) : uploadStatus === 'uploading' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Đang tải ảnh...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isEditing ? 'Lưu thay đổi' : 'Thêm vào thực đơn'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );

  // Nếu là Side panel (trên desktop lg+)
  if (isSidePanel) {
    return (
      <div className={`h-full bg-white rounded-2xl border border-[#E9ECEA] shadow-xs overflow-hidden flex flex-col ${className}`}>
        {formContent}
      </div>
    );
  }

  // Nếu là Dialog/Modal nổi (trên mobile/tablet/desktop)
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 ${
        isClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
      }`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 -z-10"
        onClick={handleAnimatedClose}
        aria-hidden="true"
      />

      <div
        className={`w-full max-w-2xl max-h-[88vh] bg-white rounded-2xl border border-[#E9ECEA] shadow-2xl overflow-hidden flex flex-col ${
          isClosing ? 'animate-dialog-card-out' : 'animate-dialog-card-in'
        } ${className}`}
      >
        {formContent}
      </div>
    </div>
  );
};
