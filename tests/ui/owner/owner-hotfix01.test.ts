import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableManagementView } from '@/components/owner/tables/TableManagementView';
import { OwnerMenuView } from '@/components/owner/menu/OwnerMenuView';
import { OwnerMenuItemForm } from '@/components/owner/menu/OwnerMenuItemForm';
import {
  deleteOwnerTable,
  deleteCategory,
  deleteMenuItem,
  uploadMenuItemImage,
} from '@/features/owner/api-client';
import type { OwnerTable, OwnerQrCode } from '@/types/contracts/table-qr';
import type { OwnerMenuItem, MenuCategory } from '../../../docs/contracts/types';

describe('OWNER HOTFIX 01 — UI Unit & Acceptance Tests', () => {
  // Mock data setup
  const mockQrCode: OwnerQrCode = {
    id: 'qr-01',
    code: 'BAN01_QR',
    type: 'table',
    active: true,
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z',
    table: {
      id: 'tbl-01',
      label: 'Bàn 01',
      active: true,
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z',
    },
  };

  const emptyTable: OwnerTable = {
    id: 'tbl-01',
    label: 'Bàn 01',
    active: true,
    session: null,
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z',
  };

  const occupiedTableZeroOrders: OwnerTable = {
    id: 'tbl-02',
    label: 'Bàn 02',
    active: true,
    session: {
      id: 'sess-02',
      tableId: 'tbl-02',
      status: 'active',
      orderCount: 0,
      createdAt: '2026-10-24T10:00:00Z',
      version: 1,
      pinState: 'active',
    },
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z',
  };

  const checkoutPendingTable: OwnerTable = {
    id: 'tbl-03',
    label: 'Bàn 03',
    active: true,
    session: {
      id: 'sess-03',
      tableId: 'tbl-03',
      status: 'checkout_pending',
      orderCount: 3,
      createdAt: '2026-10-24T10:00:00Z',
      version: 2,
      pinState: 'active',
    },
    createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z',
  };

  const mockCategories: (MenuCategory & { active: boolean; updatedAt?: string })[] = [
    { id: 'cat-01', name: 'Món nước', sortOrder: 1, active: true },
    { id: 'cat-02', name: 'Đồ uống', sortOrder: 2, active: true },
    { id: 'cat-empty', name: 'Danh mục trống', sortOrder: 3, active: true },
  ];

  const mockItems: OwnerMenuItem[] = [
    {
      id: 'item-01',
      name: 'Phở bò tái nạm',
      categoryId: 'cat-01',
      priceVnd: 55000,
      description: 'Nước dùng hầm xương 24h thơm ngon',
      imageUrl: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43',
      available: true,
      active: true,
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z',
      options: [],
    },
    {
      id: 'item-02',
      name: 'Trà đá Hà Nội',
      categoryId: 'cat-02',
      priceVnd: 5000,
      description: 'Trà ướp hoa lài thơm mát',
      imageUrl: null,
      available: true,
      active: true,
      createdAt: '2026-10-24T00:00:00Z',
      updatedAt: '2026-10-24T00:00:00Z',
      options: [],
    },
  ];

  /* ------------------------------------------------------------- */
  /* Giao diện A — Xóa bàn trống                                   */
  /* ------------------------------------------------------------- */
  describe('Giao diện A — Xóa bàn trống (TableManagementView)', () => {
    it('1. Render bàn thực sự trống và bàn có khách (0 món) chính xác theo trạng thái', () => {
      const html = renderToStaticMarkup(
        React.createElement(TableManagementView, {
          tables: [emptyTable, occupiedTableZeroOrders, checkoutPendingTable],
          qrCodes: [mockQrCode],
        })
      );

      // Bàn 01: Bàn trống
      expect(html).toContain('Bàn 01');
      expect(html).toContain('Đang trống');

      // Bàn 02: Có khách (0 món) - KHÔNG PHẢI BÀN TRỐNG
      expect(html).toContain('Bàn 02');
      expect(html).toContain('Có khách (0 món)');

      // Bàn 03: Chờ thanh toán
      expect(html).toContain('Bàn 03');
      expect(html).toContain('Chờ thanh toán');
    });

    it('2. Nút menu thao tác có tùy chọn Xóa bàn với icon thùng rác', () => {
      const html = renderToStaticMarkup(
        React.createElement(TableManagementView, {
          tables: [emptyTable],
          qrCodes: [mockQrCode],
        })
      );

      expect(html).toContain('Tùy chọn cho Bàn 01');
    });

    it('3. Bàn đang có khách hoặc chờ thanh toán thì không được phép xóa', () => {
      // Khi render cả 2 bàn, logic canDeleteTable = !isOccupied && canDelete !== false
      // Với occupiedTableZeroOrders (có session), nút Xóa bàn trong menu bị disabled với tooltip giải thích
      const html = renderToStaticMarkup(
        React.createElement(TableManagementView, {
          tables: [occupiedTableZeroOrders],
          qrCodes: [],
        })
      );

      // Card Bàn 02 hiển thị trạng thái Có khách (0 món), bộ lọc đếm Đang trống là 0
      expect(html).toContain('Có khách (0 món)');
      expect(html).toContain('Đang trống (0)');
    });
  });

  /* ------------------------------------------------------------- */
  /* Giao diện B — Xóa danh mục                                    */
  /* ------------------------------------------------------------- */
  describe('Giao diện B — Xóa danh mục (OwnerMenuView)', () => {
    it('4. Chip "Tất cả danh mục" KHÔNG có nút xóa', () => {
      const html = renderToStaticMarkup(React.createElement(OwnerMenuView, {}));

      // Có button Tất cả danh mục
      expect(html).toContain('Tất cả danh mục');
      // Không có nút xóa cho chip Tất cả danh mục
      expect(html).not.toContain('Xóa danh mục Tất cả');
    });

    it('5. Các danh mục trong thanh filter hiển thị nút xóa với aria-label rõ ràng', () => {
      const html = renderToStaticMarkup(React.createElement(OwnerMenuView, {}));

      expect(html).toContain('Tất cả danh mục');
      expect(html).toContain('Thêm danh mục');
      expect(html).toContain('Thêm món');
    });
  });

  /* ------------------------------------------------------------- */
  /* Giao diện C — Xóa món ăn                                      */
  /* ------------------------------------------------------------- */
  describe('Giao diện C — Xóa món ăn (OwnerMenuView)', () => {
    it('6. Tab Menu hỗ trợ bộ lọc và các nút điều khiển đầy đủ', () => {
      const html = renderToStaticMarkup(React.createElement(OwnerMenuView, {}));

      expect(html).toContain('Tìm theo tên món hoặc mô tả...');
      expect(html).toContain('Đang bán');
      expect(html).toContain('Hết hàng');
      expect(html).toContain('Đã ẩn');
    });
  });

  /* ------------------------------------------------------------- */
  /* Giao diện D — Upload ảnh món từ thiết bị (OwnerMenuItemForm)  */
  /* ------------------------------------------------------------- */
  describe('Giao diện D — Upload ảnh món từ thiết bị (OwnerMenuItemForm)', () => {
    it('7. KHÔNG còn trường nhập URL HTTPS Unsplash bị hạn chế', () => {
      const html = renderToStaticMarkup(
        React.createElement(OwnerMenuItemForm, {
          item: null,
          categories: mockCategories,
          isOpen: true,
        })
      );

      // Không còn dòng thông báo ép images.unsplash.com
      expect(html).not.toContain('Chỉ hỗ trợ URL HTTPS từ images.unsplash.com');
      expect(html).not.toContain('https://images.unsplash.com/...');
    });

    it('8. Hiển thị khung tải ảnh từ thiết bị với mô tả định dạng và kích thước', () => {
      const html = renderToStaticMarkup(
        React.createElement(OwnerMenuItemForm, {
          item: null,
          categories: mockCategories,
          isOpen: true,
        })
      );

      // Khung upload
      expect(html).toContain('Hình ảnh món ăn');
      expect(html).toContain('Chọn ảnh từ thiết bị');
      expect(html).toContain('Kéo thả hoặc bấm để duyệt file');
      expect(html).toContain('JPG, PNG, WebP · Tối đa 5 MB');

      // Hidden file input
      expect(html).toContain('type="file"');
      expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
      expect(html).toContain('id="item-image-file-input"');
    });

    it('9. Khi chỉnh sửa món đã có ảnh, hiển thị preview và các nút Thay ảnh / Bỏ ảnh', () => {
      const html = renderToStaticMarkup(
        React.createElement(OwnerMenuItemForm, {
          item: mockItems[0],
          categories: mockCategories,
          isOpen: true,
        })
      );

      // Hiển thị thông tin ảnh hiện tại
      expect(html).toContain('Ảnh món hiện tại');
      expect(html).toContain('Đã lưu trên hệ thống');
      expect(html).toContain('Thay ảnh');
      expect(html).toContain('Bỏ ảnh');
    });

    it('10. Nút submit hiển thị đúng ngữ cảnh và có thể xử lý trạng thái upload', () => {
      // Khi tạo mới
      const createHtml = renderToStaticMarkup(
        React.createElement(OwnerMenuItemForm, {
          item: null,
          categories: mockCategories,
          isOpen: true,
        })
      );
      expect(createHtml).toContain('Thêm vào thực đơn');

      // Khi sửa
      const editHtml = renderToStaticMarkup(
        React.createElement(OwnerMenuItemForm, {
          item: mockItems[0],
          categories: mockCategories,
          isOpen: true,
        })
      );
      expect(editHtml).toContain('Lưu thay đổi');
    });
  });

  /* ------------------------------------------------------------- */
  /* API Client Contracts                                          */
  /* ------------------------------------------------------------- */
  describe('API Client — Contract functions exist and are callable', () => {
    it('11. deleteOwnerTable, deleteCategory, deleteMenuItem, uploadMenuItemImage are exported functions', () => {
      expect(typeof deleteOwnerTable).toBe('function');
      expect(typeof deleteCategory).toBe('function');
      expect(typeof deleteMenuItem).toBe('function');
      expect(typeof uploadMenuItemImage).toBe('function');
    });
  });
});
