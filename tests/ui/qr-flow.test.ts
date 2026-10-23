import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  MOCK_STORE,
  MOCK_TABLE_05,
  MOCK_TABLES_LIST,
  MOCK_QR_CODES_LIST,
  MOCK_QR_TABLE_UNVERIFIED,
  MOCK_QR_TABLE_VERIFIED,
  MOCK_QR_TAKEAWAY,
  DEMO_VALID_SESSION_CODES,
  MOCK_MENU_ITEMS,
  MOCK_CATEGORIES,
} from '@/lib/mocks/ui-preview';
import type {
  QRResolution,
  OwnerSessionOpenedView,
} from '../../../docs/contracts/types';

describe('P2-G01 QR Resolution Contract & Verification Flow', () => {
  it('correctly models unverified table QR resolution', () => {
    const res: QRResolution = MOCK_QR_TABLE_UNVERIFIED;
    expect(res.type).toBe('table');
    expect(res.mode).toBe('dine_in');
    expect(res.requiresSessionCode).toBe(true);
    expect(res.session).toBeNull();
    expect(res.table).not.toBeNull();
    expect(res.table?.label).toBe('Bàn 05');
  });

  it('correctly models verified table QR resolution', () => {
    const res: QRResolution = MOCK_QR_TABLE_VERIFIED;
    expect(res.type).toBe('table');
    expect(res.mode).toBe('dine_in');
    expect(res.requiresSessionCode).toBe(false);
    expect(res.session).not.toBeNull();
    expect(res.session?.status).toBe('open');
  });

  it('correctly models takeaway QR resolution without table or session code requirement', () => {
    const res: QRResolution = MOCK_QR_TAKEAWAY;
    expect(res.type).toBe('takeaway');
    expect(res.mode).toBe('takeaway');
    expect(res.table).toBeNull();
    expect(res.requiresSessionCode).toBe(false);
    expect(res.session).toBeNull();
  });

  it('validates demo session codes properly in dev mode', () => {
    expect(DEMO_VALID_SESSION_CODES).toContain('8821');
    expect(DEMO_VALID_SESSION_CODES).toContain('MOC88');
    expect(DEMO_VALID_SESSION_CODES).not.toContain('WRONG_CODE_999');
  });

  it('ensures menu items have valid categories and price format', () => {
    expect(MOCK_MENU_ITEMS.length).toBeGreaterThan(0);
    expect(MOCK_CATEGORIES.length).toBeGreaterThan(0);

    for (const item of MOCK_MENU_ITEMS) {
      expect(item.priceVnd).toBeGreaterThan(0);
      expect(Number.isSafeInteger(item.priceVnd)).toBe(true);
      expect(item.name).toBeTruthy();
    }
  });

  it('differentiates available vs unavailable items for menu preview', () => {
    const unavailable = MOCK_MENU_ITEMS.filter((i) => !i.available);
    const available = MOCK_MENU_ITEMS.filter((i) => i.available);
    expect(available.length).toBeGreaterThan(0);
    expect(unavailable.length).toBeGreaterThan(0);
  });
});

describe('P2-G01 Integration Verification: UUIDs, Owner Tables & Private Credential Delivery', () => {
  const uuidSchema = z.string().uuid();

  it('ensures all store and table fixtures use valid RFC 4122 UUIDs', () => {
    expect(uuidSchema.safeParse(MOCK_STORE.id).success).toBe(true);
    expect(uuidSchema.safeParse(MOCK_TABLE_05.id).success).toBe(true);

    for (const table of MOCK_TABLES_LIST) {
      expect(uuidSchema.safeParse(table.id).success).toBe(true);
      if (table.session) {
        expect(uuidSchema.safeParse(table.session.id).success).toBe(true);
      }
    }
  });

  it('ensures TableSummary never leaks plaintext session credentials', () => {
    for (const table of MOCK_TABLES_LIST) {
      // TableSummary and TableSessionView must NOT contain sessionCode or credentials
      expect('sessionCode' in table).toBe(false);
      expect('sessionCredential' in table).toBe(false);
      if (table.session) {
        expect('sessionCode' in table.session).toBe(false);
        expect('sessionCredential' in table.session).toBe(false);
      }
    }
  });

  it('validates R12 private response format (OwnerSessionOpenedView)', () => {
    const mockR12Response: OwnerSessionOpenedView = {
      table: { id: MOCK_TABLES_LIST[1].id, label: MOCK_TABLES_LIST[1].label },
      session: {
        id: 'c0200000-0000-4000-8000-000000000099',
        status: 'open',
        openedAt: '2026-10-23T10:00:00Z',
        closedAt: null,
        orderCount: 0,
        totalVnd: 0,
        paymentStatus: 'unpaid',
        version: 1,
      },
      sessionCredential: {
        sessionCode: 'TEST-SECRET-SESSION-CODE',
        expiresAt: '2026-10-24T10:00:00Z',
      },
    };

    expect(uuidSchema.safeParse(mockR12Response.table.id).success).toBe(true);
    expect(uuidSchema.safeParse(mockR12Response.session.id).success).toBe(true);
    expect(mockR12Response.session.status).toBe('open');
    expect(mockR12Response.sessionCredential.sessionCode).toBeTruthy();
    expect(mockR12Response.sessionCredential.expiresAt).toBeTruthy();
  });

  it('validates R17 QRCodeView fixtures for table and takeaway mapping', () => {
    expect(MOCK_QR_CODES_LIST.length).toBeGreaterThan(0);

    const tableQrs = MOCK_QR_CODES_LIST.filter((q) => q.type === 'table');
    const takeawayQrs = MOCK_QR_CODES_LIST.filter((q) => q.type === 'takeaway');

    expect(tableQrs.length).toBeGreaterThan(0);
    expect(takeawayQrs.length).toBeGreaterThan(0);

    for (const q of tableQrs) {
      expect(q.path.startsWith('/q/')).toBe(true);
      expect(q.table).not.toBeNull();
      if (q.table) {
        expect(uuidSchema.safeParse(q.table.id).success).toBe(true);
      }
    }

    for (const q of takeawayQrs) {
      expect(q.path.startsWith('/q/')).toBe(true);
      expect(q.table).toBeNull();
    }
  });
});
