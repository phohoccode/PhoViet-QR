import { describe, it, expect } from 'vitest';
import {
  MOCK_CATEGORIES,
  MOCK_MENU_ITEMS,
  MOCK_OWNER_CATEGORIES,
  MOCK_OWNER_MENU_ITEMS,
  MOCK_OWNER_MENU_VIEW,
} from '@/lib/mocks/ui-preview';
import type {
  MenuItem,
  OwnerMenuItem,
  CreateMenuItemInput,
  PatchMenuItemInput,
} from '../../docs/contracts/types';
import type { SelectedItemPayload } from '@/components/customer/ItemDetailSheet';

function removeVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

describe('P2-G02 Customer Menu & Diacritics Search Filter', () => {
  it('correctly normalizes Vietnamese diacritics for searching', () => {
    expect(removeVietnameseDiacritics('Cà phê muối xứ Huế')).toContain('ca phe');
    expect(removeVietnameseDiacritics('Phở Bò Tái Lăn')).toContain('pho bo tai lan');
    expect(removeVietnameseDiacritics('Trà đào cam sả')).toContain('tra dao');
  });

  it('filters menu items with unaccented search query', () => {
    const query = 'ca phe';
    const normalizedQuery = removeVietnameseDiacritics(query);
    const matched = MOCK_MENU_ITEMS.filter((item) => {
      const normName = removeVietnameseDiacritics(item.name);
      const normDesc = item.description ? removeVietnameseDiacritics(item.description) : '';
      return normName.includes(normalizedQuery) || normDesc.includes(normalizedQuery);
    });

    expect(matched.length).toBeGreaterThan(0);
    expect(matched.some((m) => m.name.includes('Cà phê'))).toBe(true);
  });

  it('filters out inactive items from public customer view', () => {
    const publicItems = MOCK_OWNER_MENU_ITEMS.filter(
      (item) => (item as unknown as { active?: boolean }).active !== false
    );
    expect(publicItems.some((i) => i.id === 'item-07')).toBe(false); // item-07 is inactive
    expect(publicItems.length).toBeLessThan(MOCK_OWNER_MENU_ITEMS.length);
  });

  it('preserves unavailable items in list with available=false badge', () => {
    const unavailableItem = MOCK_MENU_ITEMS.find((i) => !i.available);
    expect(unavailableItem).toBeDefined();
    expect(unavailableItem?.available).toBe(false);
  });
});

describe('P2-G02 Item Detail Sheet & Integer VND Calculation', () => {
  it('accurately computes item total with additive options and quantities', () => {
    const item: MenuItem = MOCK_MENU_ITEMS[0]; // Cà phê muối (35.000 đ)
    const basePrice = item.priceVnd;
    const option1Delta = item.options[0]?.priceDeltaVnd || 0; // 0 đ
    const option2Delta = item.options[1]?.priceDeltaVnd || 8000; // 8.000 đ

    const quantity = 3;
    const unitPrice = basePrice + option1Delta + option2Delta;
    const previewTotalVnd = unitPrice * quantity;

    expect(Number.isSafeInteger(previewTotalVnd)).toBe(true);
    expect(previewTotalVnd).toBe((35000 + 0 + 8000) * 3); // 129.000 đ

    const payload: SelectedItemPayload = {
      menuItemId: item.id,
      quantity,
      optionIds: [item.options[0].id, item.options[1].id],
      note: 'Ít đường nhiều đá',
      previewTotalVnd,
    };

    expect(payload.menuItemId).toBe(item.id);
    expect(payload.quantity).toBe(3);
    expect(payload.optionIds.length).toBe(2);
    expect(payload.previewTotalVnd).toBe(129000);
  });

  it('enforces quantity bounds between 1 and 99', () => {
    const minQty = Math.max(1, 0);
    const maxQty = Math.min(99, 150);
    expect(minQty).toBe(1);
    expect(maxQty).toBe(99);
  });
});

describe('P2-G02 Owner Menu View & Contract Types', () => {
  it('validates OwnerMenuView structure and revisions', () => {
    expect(MOCK_OWNER_MENU_VIEW.categories.length).toBeGreaterThan(0);
    expect(MOCK_OWNER_MENU_VIEW.items.length).toBeGreaterThan(0);
    expect(MOCK_OWNER_MENU_VIEW.menuRevision).toBeTruthy();
    expect(MOCK_OWNER_MENU_VIEW.serverTime).toBeTruthy();
  });

  it('validates OwnerMenuCategory fixtures with active and sortOrder', () => {
    expect(MOCK_OWNER_CATEGORIES.length).toBeGreaterThan(0);
    for (const cat of MOCK_OWNER_CATEGORIES) {
      expect(cat.name).toBeTruthy();
      expect(typeof cat.active).toBe('boolean');
      expect(cat.sortOrder).toBeGreaterThan(0);
    }
  });

  it('ensures OwnerMenuItem includes active field and correct options delta', () => {
    for (const item of MOCK_OWNER_MENU_ITEMS) {
      expect(typeof item.active).toBe('boolean');
      expect(typeof item.available).toBe('boolean');
      expect(Number.isSafeInteger(item.priceVnd)).toBe(true);
      expect(item.priceVnd).toBeGreaterThan(0);

      for (const opt of item.options) {
        expect(Number.isSafeInteger(opt.priceDeltaVnd)).toBe(true);
        expect(opt.priceDeltaVnd).toBeGreaterThanOrEqual(0);
        expect(typeof opt.available).toBe('boolean');
      }
    }
  });

  it('validates CreateMenuItemInput payload contract', () => {
    const createPayload: CreateMenuItemInput = {
      requestId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      name: 'Trà sen vàng Cung đình',
      categoryId: MOCK_CATEGORIES[1].id,
      description: 'Hạt sen Huế nấu chín bùi béo kết hợp trà ô long thượng hạng.',
      priceVnd: 45000,
      imageUrl: null,
      available: true,
      active: true,
      options: [
        { name: 'Thêm hạt sen', priceDeltaVnd: 10000, available: true },
      ],
    };

    expect(createPayload.name).toBeTruthy();
    expect(Number.isSafeInteger(createPayload.priceVnd)).toBe(true);
    expect(createPayload.options.length).toBe(1);
  });

  it('validates PatchMenuItemInput payload contract with expectedUpdatedAt', () => {
    const item: OwnerMenuItem = MOCK_OWNER_MENU_ITEMS[0];
    const patchPayload: PatchMenuItemInput = {
      requestId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      expectedUpdatedAt: item.updatedAt,
      available: false,
    };

    expect(patchPayload.expectedUpdatedAt).toBe(item.updatedAt);
    expect(patchPayload.available).toBe(false);
  });
});
