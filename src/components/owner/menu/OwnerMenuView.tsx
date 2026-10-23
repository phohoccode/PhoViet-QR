'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  Plus,
  Search,
  X,
  Edit2,
  FolderPlus,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Coffee,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import type {
  OwnerMenuItem,
  MenuCategory,
} from '../../../../docs/contracts/types';
import {
  fetchOwnerMenu,
  updateMenuItem,
  fetchCategories,
  MenuApiError,
} from '../../../features/owner/api-client';
import { MOCK_OWNER_MENU_VIEW } from '../../../lib/mocks/ui-preview';
import { OwnerMenuItemForm } from './OwnerMenuItemForm';
import { OwnerCategoryDialog } from './OwnerCategoryDialog';

type CategoryItem = MenuCategory & { active: boolean; updatedAt?: string };
type StatusFilter = 'all' | 'available' | 'out_of_stock' | 'hidden';

/**
 * Hàm chuẩn hóa loại bỏ dấu tiếng Việt để tìm kiếm không phân biệt hoa/thường và dấu
 */
function removeVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Skeleton nạp danh sách món
 */
const OwnerMenuSkeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className="p-4 bg-white rounded-2xl border border-[#E9ECEA] flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="w-14 h-14 rounded-xl bg-[#F7F8F7] flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="w-1/3 h-4 bg-[#E9ECEA] rounded" />
            <div className="w-1/4 h-3 bg-[#F7F8F7] rounded" />
          </div>
        </div>
        <div className="w-24 h-8 bg-[#F7F8F7] rounded-xl flex-shrink-0" />
      </div>
    ))}
  </div>
);

/**
 * OwnerMenuView — Giao diện chính tab Thực đơn trong Dashboard Chủ quán (P2-G02).
 * Hỗ trợ bố cục 65/35 trên Desktop và 1 cột trên Mobile/Tablet.
 */
export const OwnerMenuView: React.FC = () => {
  const isDev = process.env.NODE_ENV !== 'production';

  // Menu data states
  const [categories, setCategories] = useState<CategoryItem[]>(
    isDev ? MOCK_OWNER_MENU_VIEW.categories : []
  );
  const [items, setItems] = useState<OwnerMenuItem[]>(isDev ? MOCK_OWNER_MENU_VIEW.items : []);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMockPreview, setIsMockPreview] = useState<boolean>(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Editor states
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<OwnerMenuItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false); // Modal trên mobile
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState<boolean>(false);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);

  // Quick toggle mutating state
  const [mutatingItemId, setMutatingItemId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Tải dữ liệu thực đơn từ API R16 (GET /api/owner/menu?includeInactive=true) và R17 categories
  const loadMenu = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [menuRes, catRes] = await Promise.allSettled([
        fetchOwnerMenu(true),
        fetchCategories(),
      ]);

      if (menuRes.status === 'fulfilled' && menuRes.value) {
        setItems(menuRes.value.items);
        if (catRes.status === 'fulfilled' && catRes.value && catRes.value.length > 0) {
          setCategories(catRes.value);
        } else {
          setCategories(menuRes.value.categories);
        }
        setIsMockPreview(false);
      } else {
        throw new Error('Không thể tải thực đơn');
      }
    } catch {
      // Fallback dev preview nếu backend chưa chạy
      if (isDev) {
        setCategories(MOCK_OWNER_MENU_VIEW.categories);
        setItems(MOCK_OWNER_MENU_VIEW.items);
        setIsMockPreview(true);
      } else {
        setCategories([]);
        setItems([]);
        setErrorMessage('Không thể tải thực đơn chủ quán từ máy chủ.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isDev]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [menuRes, catRes] = await Promise.allSettled([
          fetchOwnerMenu(true),
          fetchCategories(),
        ]);

        if (!ignore && menuRes.status === 'fulfilled' && menuRes.value) {
          setItems(menuRes.value.items);
          if (catRes.status === 'fulfilled' && catRes.value && catRes.value.length > 0) {
            setCategories(catRes.value);
          } else {
            setCategories(menuRes.value.categories);
          }
          setIsMockPreview(false);
        } else if (!ignore) {
          throw new Error('Không thể tải thực đơn');
        }
      } catch {
        if (!ignore) {
          if (isDev) {
            setCategories(MOCK_OWNER_MENU_VIEW.categories);
            setItems(MOCK_OWNER_MENU_VIEW.items);
            setIsMockPreview(true);
          } else {
            setCategories([]);
            setItems([]);
            setErrorMessage('Không thể tải thực đơn chủ quán từ máy chủ.');
          }
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [isDev]);

  // Xóa thông báo sau 3 giây
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Bộ lọc dữ liệu món ăn
  const filteredItems = useMemo(() => {
    const normalizedQuery = removeVietnameseDiacritics(searchQuery.trim());

    return items.filter((item) => {
      // Lọc danh mục
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) {
        return false;
      }

      // Lọc trạng thái
      if (statusFilter === 'available' && (!item.active || !item.available)) {
        return false;
      }
      if (statusFilter === 'out_of_stock' && (!item.active || item.available)) {
        return false;
      }
      if (statusFilter === 'hidden' && item.active) {
        return false;
      }

      // Lọc từ khóa tìm kiếm
      if (normalizedQuery) {
        const normName = removeVietnameseDiacritics(item.name);
        const normDesc = item.description ? removeVietnameseDiacritics(item.description) : '';
        if (!normName.includes(normalizedQuery) && !normDesc.includes(normalizedQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [items, selectedCategoryId, statusFilter, searchQuery]);

  // Thao tác Bật / Tắt nhanh tình trạng còn hàng (available) — chỉ đổi switch sau khi server xác nhận thành công
  const handleToggleAvailable = async (item: OwnerMenuItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (mutatingItemId) return;

    const newAvailable = !item.available;
    setMutatingItemId(item.id);

    try {
      // Gọi mutation PATCH R16 trực tiếp, giữ nguyên expectedUpdatedAt từ server
      const updated = await updateMenuItem(item.id, {
        requestId: crypto.randomUUID(),
        expectedUpdatedAt: item.updatedAt,
        available: newAvailable,
      });

      // Chỉ cập nhật trạng thái switch khi server xác nhận thành công
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      setNotification({
        type: 'success',
        message: `Đã đổi trạng thái "${item.name}" sang ${newAvailable ? 'Còn hàng' : 'Hết hàng'}.`,
      });
    } catch (err: unknown) {
      if (err instanceof MenuApiError && err.status === 409) {
        // CAS conflict: nạp lại menu mới nhất từ server
        loadMenu();
        setNotification({
          type: 'error',
          message: 'Dữ liệu món đã được cập nhật bởi phiên làm việc khác (CAS stale). Đang làm mới...',
        });
      } else if (err instanceof MenuApiError) {
        setNotification({
          type: 'error',
          message: err.error.message || `Không thể đổi trạng thái món "${item.name}".`,
        });
      } else if (isDev) {
        // Mock fallback chỉ trong môi trường dev
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, available: newAvailable } : it))
        );
        setNotification({
          type: 'success',
          message: `Đã đổi trạng thái "${item.name}" (chế độ Mock Preview Dev).`,
        });
      } else {
        setNotification({
          type: 'error',
          message: `Lỗi kết nối máy chủ khi cập nhật "${item.name}".`,
        });
      }
    } finally {
      setMutatingItemId(null);
    }
  };

  // Mở form thêm món mới
  const handleOpenCreate = () => {
    setIsCreatingNew(true);
    setSelectedItemForEdit(null);
    setIsFormOpen(true);
  };

  // Mở form chỉnh sửa món
  const handleOpenEdit = (item: OwnerMenuItem) => {
    setIsCreatingNew(false);
    setSelectedItemForEdit(item);
    setIsFormOpen(true);
  };

  // Callback sau khi lưu món thành công
  const handleItemSaved = (savedItem: OwnerMenuItem) => {
    setItems((prev) => {
      const exists = prev.some((it) => it.id === savedItem.id);
      if (exists) {
        return prev.map((it) => (it.id === savedItem.id ? savedItem : it));
      }
      return [savedItem, ...prev];
    });

    setSelectedItemForEdit(savedItem);
    setIsCreatingNew(false);
    setNotification({
      type: 'success',
      message: `Đã lưu món "${savedItem.name}" thành công!`,
    });
  };

  // Callback sau khi thêm danh mục mới
  const handleCategoryCreated = (newCat: CategoryItem) => {
    setCategories((prev) => [...prev, newCat]);
    setSelectedCategoryId(newCat.id);
    setNotification({
      type: 'success',
      message: `Đã thêm danh mục "${newCat.name}"!`,
    });
  };

  return (
    <div className="flex-1 flex flex-col gap-4">
      {/* 1. Header Thực đơn & Nút hành động */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#E9ECEA]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#1D2522]">Quản lý Thực đơn</h2>
            {isMockPreview && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]">
                MOCK_PREVIEW
              </span>
            )}
          </div>
          <p className="text-xs text-[#727B77] mt-0.5">
            Cập nhật món ăn, điều chỉnh giá và bật/tắt nhanh tình trạng còn hàng.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setIsCategoryDialogOpen(true)}
            className="flex-1 sm:flex-initial h-9 px-3 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[#1D2522] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            <FolderPlus className="w-3.5 h-3.5 text-[#35977D]" aria-hidden="true" />
            <span>Thêm danh mục</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex-1 sm:flex-initial h-9 px-4 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Thêm món</span>
          </button>
        </div>
      </div>

      {/* Thông báo thao tác nhanh */}
      {notification && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]'
              : 'bg-[#FEF3F2] text-[#912018] border border-[#FECDCA]'
          }`}
          role="status"
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 2. Thanh tìm kiếm & Bộ lọc danh mục / trạng thái */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Thanh tìm kiếm */}
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-[#727B77] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên món hoặc mô tả..."
              className="w-full h-9 pl-9 pr-8 bg-white border border-[#E9ECEA] rounded-xl text-xs text-[#1D2522] placeholder-[#727B77] focus:outline-none focus:ring-2 focus:ring-[#35977D]"
              aria-label="Tìm kiếm món ăn"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-6 h-6 absolute right-1.5 top-1/2 -translate-y-1/2 text-[#727B77] hover:text-[#1D2522] flex items-center justify-center rounded"
                aria-label="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Bộ lọc trạng thái món */}
          <div className="flex items-center gap-1 bg-[#F7F8F7] p-1 rounded-xl border border-[#E9ECEA] overflow-x-auto scrollbar-none flex-shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white text-[#1D725E] shadow-2xs'
                  : 'text-[#727B77] hover:text-[#1D2522]'
              }`}
            >
              Tất cả ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('available')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'available'
                  ? 'bg-white text-[#1D725E] shadow-2xs'
                  : 'text-[#727B77] hover:text-[#1D2522]'
              }`}
            >
              Đang bán
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('out_of_stock')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'out_of_stock'
                  ? 'bg-white text-[#B42318] shadow-2xs'
                  : 'text-[#727B77] hover:text-[#1D2522]'
              }`}
            >
              Hết hàng
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('hidden')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'hidden'
                  ? 'bg-white text-[#55605C] shadow-2xs'
                  : 'text-[#727B77] hover:text-[#1D2522]'
              }`}
            >
              Đã ẩn
            </button>
          </div>
        </div>

        {/* Dải pill danh mục cuộn ngang */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategoryId === 'all'
                ? 'bg-[#1D725E] text-white'
                : 'bg-white border border-[#E9ECEA] text-[#55605C] hover:bg-[#F7F8F7]'
            }`}
          >
            Tất cả danh mục
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 ${
                selectedCategoryId === cat.id
                  ? 'bg-[#1D725E] text-white'
                  : 'bg-white border border-[#E9ECEA] text-[#55605C] hover:bg-[#F7F8F7]'
              }`}
            >
              <span>{cat.name}</span>
              {!cat.active && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#FDA29B]" title="Đang ẩn" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Bố cục chính: Split 65/35 trên Desktop lg+, 1 cột trên Mobile/Tablet */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Cột trái (65-70% trên desktop, toàn bộ trên mobile): Danh sách món */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
          {isLoading && <OwnerMenuSkeleton />}

          {errorMessage && (
            <div className="p-8 text-center bg-[#FEF3F2] rounded-2xl border border-[#FECDCA]">
              <AlertCircle className="w-8 h-8 text-[#B42318] mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-bold text-[#912018]">{errorMessage}</p>
              <button
                type="button"
                onClick={loadMenu}
                className="mt-3 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#B42318] text-white hover:bg-[#912018] inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Thử tải lại</span>
              </button>
            </div>
          )}

          {!isLoading && !errorMessage && filteredItems.length === 0 && (
            <div className="p-10 text-center bg-white rounded-2xl border border-[#E9ECEA]">
              <Coffee className="w-8 h-8 text-[#A0A8A5] mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-bold text-[#1D2522]">Không tìm thấy món ăn phù hợp</p>
              <p className="text-xs text-[#727B77] mt-1 max-w-sm mx-auto">
                Không có món nào khớp với danh mục hoặc từ khóa lọc hiện tại.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategoryId('all');
                  setStatusFilter('all');
                }}
                className="mt-3 text-xs font-bold text-[#1D725E] hover:underline"
              >
                Xóa tất cả bộ lọc
              </button>
            </div>
          )}

          {!isLoading && !errorMessage && filteredItems.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {filteredItems.map((item) => {
                const isSelected = selectedItemForEdit?.id === item.id;
                const isItemMutating = mutatingItemId === item.id;
                const categoryName =
                  categories.find((c) => c.id === item.categoryId)?.name || 'Chung';

                return (
                  <div
                    key={item.id}
                    onClick={() => handleOpenEdit(item)}
                    className={`p-3.5 bg-white rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs hover:shadow-xs ${
                      isSelected
                        ? 'border-[#1D725E] ring-1 ring-[#1D725E] bg-[#FAFDFB]'
                        : 'border-[#E9ECEA] hover:border-[#C6E7DC]'
                    }`}
                  >
                    {/* Ảnh và thông tin món */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="relative w-12 h-12 rounded-xl bg-[#F7F8F7] border border-[#E9ECEA] overflow-hidden flex items-center justify-center flex-shrink-0">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            width={48}
                            height={48}
                            className="object-cover w-full h-full"
                            unoptimized
                          />
                        ) : (
                          <Coffee className="w-5 h-5 text-[#35977D]" aria-hidden="true" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-[#1D2522] truncate">
                            {item.name}
                          </h4>
                          {!item.active && (
                            <span className="text-[10px] font-semibold text-[#55605C] bg-[#F1F3F2] px-1.5 py-0.2 rounded">
                              Đã ẩn
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-bold text-[#1D725E]">
                            {new Intl.NumberFormat('vi-VN').format(item.priceVnd)} đ
                          </span>
                          <span className="text-[10px] text-[#727B77] bg-[#F7F8F7] px-1.5 py-0.5 rounded">
                            {categoryName}
                          </span>
                          {item.options && item.options.length > 0 && (
                            <span className="text-[10px] text-[#727B77]">
                              +{item.options.length} tùy chọn
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bộ điều khiển nhanh: Toggle còn hàng & Nút sửa */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Nút toggle tình trạng còn hàng */}
                      <button
                        type="button"
                        disabled={isItemMutating}
                        onClick={(e) => handleToggleAvailable(item, e)}
                        className={`h-8 px-2.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] ${
                          item.available
                            ? 'bg-[#E8F4F0] text-[#1D725E] border-[#C6E7DC] hover:bg-[#C6E7DC]'
                            : 'bg-[#FEF3F2] text-[#912018] border-[#FECDCA] hover:bg-[#FECDCA]'
                        }`}
                        title="Bấm để đổi nhanh tình trạng còn / hết hàng"
                        aria-label={`Đổi tình trạng ${item.name}`}
                      >
                        {isItemMutating ? (
                          <Loader2 className="w-3 h-3 animate-spin text-[#1D725E]" />
                        ) : (
                          <span
                            className={`w-2 h-2 rounded-full ${
                              item.available ? 'bg-[#1D725E]' : 'bg-[#B42318]'
                            }`}
                          />
                        )}
                        <span>{isItemMutating ? 'Đang lưu...' : item.available ? 'Còn hàng' : 'Hết hàng'}</span>
                      </button>

                      {/* Nút sửa */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(item);
                        }}
                        className="w-8 h-8 rounded-xl bg-[#F7F8F7] hover:bg-[#E9ECEA] text-[#55605C] flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
                        aria-label={`Chỉnh sửa ${item.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cột phải (30-35% trên desktop lg+): Side Panel biên tập món */}
        <div className="hidden lg:block lg:col-span-5 xl:col-span-4 sticky top-4">
          {selectedItemForEdit || isCreatingNew ? (
            <OwnerMenuItemForm
              item={selectedItemForEdit}
              categories={categories}
              isOpen={true}
              isSidePanel={true}
              onClose={() => {
                setSelectedItemForEdit(null);
                setIsCreatingNew(false);
              }}
              onSaved={handleItemSaved}
            />
          ) : (
            <div className="h-[480px] bg-white rounded-2xl border border-dashed border-[#E9ECEA] p-6 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" aria-hidden="true" />
              </div>
              <h4 className="text-sm font-bold text-[#1D2522]">Khu vực biên tập món</h4>
              <p className="text-xs text-[#727B77] mt-1 max-w-[220px]">
                Chọn một món từ danh sách bên trái để chỉnh sửa thông tin, hoặc bấm nút bên dưới.
              </p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="mt-4 h-9 px-4 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Thêm món mới</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal chỉnh sửa cho màn hình Mobile / Tablet (< lg) */}
      <div className="lg:hidden">
        {isFormOpen && (
          <OwnerMenuItemForm
            item={selectedItemForEdit}
            categories={categories}
            isOpen={isFormOpen}
            isSidePanel={false}
            onClose={() => {
              setIsFormOpen(false);
              setSelectedItemForEdit(null);
              setIsCreatingNew(false);
            }}
            onSaved={handleItemSaved}
          />
        )}
      </div>

      {/* Dialog Thêm danh mục */}
      <OwnerCategoryDialog
        isOpen={isCategoryDialogOpen}
        onClose={() => setIsCategoryDialogOpen(false)}
        onCategoryCreated={handleCategoryCreated}
        existingCategoriesCount={categories.length}
      />
    </div>
  );
};
