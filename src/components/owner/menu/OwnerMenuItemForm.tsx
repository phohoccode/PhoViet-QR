'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  X,
  Plus,
  Trash2,
  Coffee,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Info,
} from 'lucide-react';
import type {
  OwnerMenuItem,
  MenuCategory,
  CreateMenuItemInput,
  PatchMenuItemInput,
  MenuOptionWrite,
} from '../../../../docs/contracts/types';
import { createMenuItem, updateMenuItem, MenuApiError } from '../../../features/owner/api-client';

interface OwnerMenuItemFormProps {
  item: OwnerMenuItem | null;
  categories: (MenuCategory & { active: boolean; updatedAt?: string })[];
  isOpen?: boolean;
  onClose?: () => void;
  onSaved?: (savedItem: OwnerMenuItem) => void;
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
  isSidePanel = false,
  className = '',
}) => {
  const isEditing = Boolean(item);

  // Form states
  const [name, setName] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [priceDisplay, setPriceDisplay] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [options, setOptions] = useState<MenuOptionWrite[]>([]);

  // Validation & Mutation states
  const pendingRequestIdRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Điền dữ liệu khi đổi món được chọn theo mẫu chuẩn React
  const [prevItem, setPrevItem] = useState<OwnerMenuItem | null>(item);
  if (item !== prevItem) {
    setPrevItem(item);
    if (item) {
      setName(item.name || '');
      setCategoryId(item.categoryId || (categories[0]?.id ?? ''));
      setPriceDisplay(formatNumberInput(item.priceVnd));
      setDescription(item.description || '');
      setImageUrl(item.imageUrl || '');
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
      setIsAvailable(true);
      setIsActive(true);
      setOptions([]);
    }
    setErrors({});
    setServerError(null);
    setSuccessMessage(null);
  }

  // Reset requestId khi item thay đổi
  useEffect(() => {
    pendingRequestIdRef.current = null;
  }, [item]);

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
    if (trimmedImg) {
      if (trimmedImg.length > 2048) {
        errs.imageUrl = 'URL ảnh không được vượt quá 2048 ký tự.';
      } else {
        try {
          const parsedUrl = new URL(trimmedImg);
          if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'images.unsplash.com') {
            errs.imageUrl = 'URL ảnh phải sử dụng giao thức HTTPS từ images.unsplash.com.';
          }
        } catch {
          errs.imageUrl = 'Đường dẫn ảnh không hợp lệ.';
        }
      }
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
      available: opt.available,
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
          onClose();
        }, 600);
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
      if (process.env.NODE_ENV === 'production') {
        // Trong production, TUYỆT ĐỐI không mock onSaved thành công
        setServerError('Không thể kết nối đến máy chủ POS. Vui lòng kiểm tra mạng và thử lại.');
        return;
      }

      // Chỉ fallback preview trong môi trường dev khi API local chưa chạy
      const mockItem: OwnerMenuItem = {
        id: item?.id || `item-mock-${Date.now()}`,
        name: name.trim(),
        categoryId,
        priceVnd: parsedPrice,
        description: description.trim() || null,
        imageUrl: trimmedImg || null,
        available: isAvailable,
        active: isActive,
        options: validOptions.map((o, idx) => ({
          id: o.id || `opt-mock-${idx}`,
          name: o.name,
          priceDeltaVnd: o.priceDeltaVnd,
          available: o.available,
        })),
        updatedAt: item?.updatedAt || new Date().toISOString(),
      };

      setSuccessMessage(
        isEditing
          ? 'Đã cập nhật (chế độ Mock Preview Dev)'
          : 'Đã thêm món mới (chế độ Mock Preview Dev)'
      );
      onSaved?.(mockItem);
      pendingRequestIdRef.current = null;

      if (!isSidePanel && onClose) {
        setTimeout(() => {
          onClose();
        }, 800);
      }
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      {/* Header khu vực soạn thảo */}
      <div className="px-5 py-3.5 border-b border-[#E9ECEA] flex items-center justify-between bg-white flex-shrink-0">
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
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg hover:bg-[#F7F8F7] text-[#727B77] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            aria-label="Đóng bảng chỉnh sửa"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Nội dung Form cuộn được */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
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

        {/* 4. URL Ảnh món ăn & Live Preview */}
        <div className="space-y-1.5">
          <label htmlFor="item-image-url" className="text-xs font-semibold text-[#1D2522]">
            URL hình ảnh món ăn
          </label>
          <div className="flex gap-3 items-center">
            {/* Khung preview ảnh nhỏ */}
            <div className="w-14 h-14 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] overflow-hidden flex items-center justify-center flex-shrink-0 relative">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt="Xem trước ảnh món"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <Coffee className="w-5 h-5 text-[#35977D]" aria-hidden="true" />
              )}
            </div>

            <div className="flex-1 space-y-1">
              <input
                id="item-image-url"
                type="url"
                disabled={isSubmitting}
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  if (errors.imageUrl) setErrors((prev) => ({ ...prev, imageUrl: '' }));
                }}
                placeholder="https://images.unsplash.com/... (ảnh HTTPS Unsplash)"
                className={`w-full h-10 px-3 rounded-xl border text-xs text-[#1D2522] placeholder-[#727B77] bg-[#F7F8F7] focus:bg-white focus:outline-none transition-colors ${
                  errors.imageUrl
                    ? 'border-[#FDA29B] focus:ring-2 focus:ring-[#FDA29B]'
                    : 'border-[#E9ECEA] focus:ring-2 focus:ring-[#35977D]'
                }`}
              />
              {errors.imageUrl && <p className="text-[11px] text-[#B42318]">{errors.imageUrl}</p>}
              <p className="text-[10px] text-[#727B77] flex items-center gap-1">
                <Info className="w-3 h-3 text-[#35977D] flex-shrink-0" aria-hidden="true" />
                <span>Chỉ hỗ trợ URL HTTPS từ images.unsplash.com (tối đa 2048 ký tự).</span>
              </p>
            </div>
          </div>
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

      {/* Footer Form: Nút Lưu & Hủy */}
      <div className="p-4 bg-white border-t border-[#E9ECEA] flex items-center justify-end gap-2 flex-shrink-0">
        {onClose && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-[#E9ECEA] text-xs font-semibold text-[#55605C] hover:bg-[#F7F8F7] transition-colors"
          >
            Hủy
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-10 px-5 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Đang lưu...</span>
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

  // Nếu là Dialog/Modal nổi (trên mobile/tablet)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 -z-10"
        onClick={() => !isSubmitting && onClose?.()}
        aria-hidden="true"
      />

      <div
        className={`w-full max-w-lg max-h-[92vh] bg-white rounded-2xl border border-[#E9ECEA] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 ${className}`}
      >
        {formContent}
      </div>
    </div>
  );
};
