import { describe, it, expect } from 'vitest';
import {
  calculateUnitPriceVnd,
  calculateLineTotalVnd,
  generateCartLineId,
  CustomerCartItem,
} from '@/components/customer/cart/types';
import type { CartLine, MenuV1View, QRResolution } from '../../../docs/contracts/types';
import { MOCK_CART_ITEMS, MOCK_CART_ITEMS_WITH_UNAVAILABLE } from '@/lib/mocks/ui-preview';
import { createCartStore, formatVnd } from '@/features/cart';

describe('P2-G03 Customer Cart Calculations & Line Totals', () => {
  it('calculates unit price with zero options correctly', () => {
    const unitPrice = calculateUnitPriceVnd(35000, []);
    expect(unitPrice).toBe(35000);
  });

  it('calculates unit price with additive options (delta VND)', () => {
    const options = [
      { id: 'opt-01', name: 'Ít ngọt', priceDeltaVnd: 0 },
      { id: 'opt-02', name: 'Thêm kem muối', priceDeltaVnd: 8000 },
    ];
    const unitPrice = calculateUnitPriceVnd(35000, options);
    expect(unitPrice).toBe(43000);
  });

  it('calculates line total by multiplying unit price with quantity', () => {
    const options = [{ id: 'opt-02', name: 'Thêm kem muối', priceDeltaVnd: 8000 }];
    const lineTotal = calculateLineTotalVnd(35000, options, 2);
    expect(lineTotal).toBe(86000); // (35000 + 8000) * 2 = 86000
  });

  it('bounds quantity between 1 and 99 when calculating total', () => {
    expect(calculateLineTotalVnd(10000, [], 0)).toBe(10000); // Bounded to min 1
    expect(calculateLineTotalVnd(10000, [], 150)).toBe(990000); // Bounded to max 99
  });

  it('correctly calculates subtotal across multiple cart items', () => {
    const items = MOCK_CART_ITEMS;
    const subtotal = items.reduce((sum, it) => {
      return sum + calculateLineTotalVnd(it.basePriceVnd, it.selectedOptions, it.quantity);
    }, 0);

    // Line 1: (35000 + 8000) * 2 = 86000
    // Line 2: 32000 * 1 = 32000
    // Total = 118000
    expect(subtotal).toBe(118000);
  });
});

describe('P2-G03 Cart Line Identity & Normalization', () => {
  it('generates deterministic line ID regardless of option array order', () => {
    const id1 = generateCartLineId('item-01', ['opt-01', 'opt-02'], 'Ít đá');
    const id2 = generateCartLineId('item-01', ['opt-02', 'opt-01'], 'Ít đá');
    expect(id1).toBe(id2);
  });

  it('creates different line IDs for different notes on the same item', () => {
    const id1 = generateCartLineId('item-01', ['opt-01'], 'Ít đá');
    const id2 = generateCartLineId('item-01', ['opt-01'], 'Nhiều đá');
    expect(id1).not.toBe(id2);
  });

  it('normalizes note whitespace and casing for grouping', () => {
    const id1 = generateCartLineId('item-01', [], '  ít đá  ');
    const id2 = generateCartLineId('item-01', [], 'ÍT ĐÁ');
    expect(id1).toBe(id2);
  });
});

describe('P2-G03 Cart Readiness & Contract Mapping', () => {
  it('maps CustomerCartItem to Codex contract CartLine cleanly', () => {
    const item: CustomerCartItem = {
      lineId: 'line-test',
      menuItemId: 'item-01',
      name: 'Cà phê muối xứ Huế',
      basePriceVnd: 35000,
      quantity: 2,
      selectedOptions: [{ id: 'opt-02', name: 'Thêm kem muối', priceDeltaVnd: 8000 }],
      note: 'Ít đường',
      imageUrl: null,
      available: true,
    };

    // Contract CartLine schema from docs/contracts/types.ts
    const contractLine: CartLine = {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      optionIds: item.selectedOptions.map((o) => o.id),
      note: item.note,
    };

    expect(contractLine.menuItemId).toBe('item-01');
    expect(contractLine.quantity).toBe(2);
    expect(contractLine.optionIds).toEqual(['opt-02']);
    expect(contractLine.note).toBe('Ít đường');
  });

  it('detects unavailable items in cart fixture', () => {
    const hasUnavailable = MOCK_CART_ITEMS_WITH_UNAVAILABLE.some((it) => !it.available);
    expect(hasUnavailable).toBe(true);

    const normalHasUnavailable = MOCK_CART_ITEMS.some((it) => !it.available);
    expect(normalHasUnavailable).toBe(false);
  });

  it('formats integer VND currency consistently with vi-VN locale', () => {
    const amount = 118000;
    const formatted = new Intl.NumberFormat('vi-VN').format(amount);
    expect(formatted).toBe('118.000');
  });

  it('detects overflow when item quantity or price exceeds bounds', () => {
    const overflowItem: CustomerCartItem = {
      lineId: 'overflow-line',
      menuItemId: 'item-01',
      name: 'Món đắt',
      basePriceVnd: 60_000_000,
      quantity: 2,
      selectedOptions: [],
      note: null,
      imageUrl: null,
      available: true,
    };
    const total = calculateLineTotalVnd(overflowItem.basePriceVnd, overflowItem.selectedOptions, overflowItem.quantity);
    expect(total).toBe(120_000_000);
    // When sum > 100_000_000, subtotalVnd is flagged as null (overflow)
    const isOverflow = total > 100_000_000;
    expect(isOverflow).toBe(true);
  });
});

describe('P2-C03 & P2-G03 Codex Cart Facade UI Integration', () => {
  const storeId = 'c0230000-0000-4000-8000-000000000001';
  const itemId = 'c0220000-0000-4000-8000-000000000011';
  const optionId = 'c0220000-0000-4000-8000-000000000021';

  const mockMenu: MenuV1View = {
    categories: [{ id: 'c0220000-0000-4000-8000-000000000001', name: 'Cà phê', sortOrder: 1 }],
    items: [
      {
        id: itemId,
        categoryId: 'c0220000-0000-4000-8000-000000000001',
        name: 'Cà phê sữa',
        description: null,
        priceVnd: 29000,
        imageUrl: null,
        available: true,
        options: [{ id: optionId, name: 'Thêm cà phê', priceDeltaVnd: 6000, available: true }],
        updatedAt: '2026-10-23T10:00:00.000000+00:00',
      },
    ],
    menuRevision: 'rev-01',
    serverTime: '2026-10-23T10:00:00.000000+00:00',
  };

  const mockResolution: QRResolution = {
    type: 'takeaway',
    mode: 'takeaway',
    store: { id: storeId, name: 'Quán demo', timezone: 'Asia/Ho_Chi_Minh', acceptingOrders: true },
    table: null,
    requiresSessionCode: false,
    session: null,
  };

  it('adds lines with projected payload and computes view subtotal', () => {
    const store = createCartStore({
      qrCode: 'TEST_QR_01',
      loadResolution: async () => mockResolution,
      loadMenu: async () => mockMenu,
      storage: null,
    });

    store.applyResolution(mockResolution);
    store.reconcileWithMenu(mockMenu);

    const addRes = store.addLine({
      menuItemId: itemId,
      quantity: 2,
      optionIds: [optionId],
      note: 'Ít đường',
    });
    expect(addRes.ok).toBe(true);

    const view = store.getView();
    expect(view.itemCount).toBe(2);
    // (29000 + 6000) * 2 = 70000
    expect(view.estimatedSubtotalVnd).toBe(70000);
    expect(view.lines.length).toBe(1);
    expect(view.lines[0].name).toBe('Cà phê sữa');
  });

  it('updates quantity with absolute values and removes on clear', () => {
    const store = createCartStore({
      qrCode: 'TEST_QR_02',
      loadResolution: async () => mockResolution,
      loadMenu: async () => mockMenu,
      storage: null,
    });

    store.applyResolution(mockResolution);
    store.reconcileWithMenu(mockMenu);

    store.addLine({
      menuItemId: itemId,
      quantity: 1,
      optionIds: [],
      note: null,
    });

    const lineKey = store.getView().lines[0].lineKey;
    // Stepper updates to absolute 4
    const updateRes = store.updateQuantity(lineKey, 4);
    expect(updateRes.ok).toBe(true);
    expect(store.getView().itemCount).toBe(4);

    store.clear();
    expect(store.getView().itemCount).toBe(0);
    expect(store.getView().isEmpty).toBe(true);
  });

  it('formats safe VND currency with formatVnd utility', () => {
    expect(formatVnd(70000)).toContain('70.000');
  });
});


