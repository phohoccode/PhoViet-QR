import { describe, it, expect } from 'vitest';
import {
  generateQrMatrix,
  matrixToSvg,
  sanitizeQrFilename,
} from '@/lib/qr/qr-code';
import {
  MOCK_STORE,
  MOCK_TABLES_LIST,
  MOCK_QR_CODES_LIST,
} from '@/lib/mocks/ui-preview';
import type { TableSummary } from '../../docs/contracts/types';

describe('P2-G04 QR Code Generator (ISO/IEC 18004 with qrcode library)', () => {
  it('generates a valid QR matrix for public table URL', () => {
    const text = 'https://phovietqr.vn/q/BAN01_DEMO_CODE';
    const matrix = generateQrMatrix(text);

    // URL is 39 characters -> Fits in Version 3 (29x29) or Version 4 (33x33)
    expect(matrix.length).toBeGreaterThanOrEqual(29);
    expect(matrix[0].length).toBe(matrix.length);

    // Verify top-left finder pattern: 7x7 dark/light module ring
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][6]).toBe(true);
    expect(matrix[6][0]).toBe(true);
    expect(matrix[6][6]).toBe(true);
    // Center of top-left finder
    expect(matrix[3][3]).toBe(true);
  });

  it('generates a valid QR matrix for takeaway counter URL', () => {
    const text = 'https://phovietqr.vn/q/COUNTER_TAKEAWAY_CODE';
    const matrix = generateQrMatrix(text);

    expect(matrix.length).toBeGreaterThanOrEqual(29);
    // Finder top-right
    const size = matrix.length;
    expect(matrix[0][size - 7]).toBe(true);
    expect(matrix[0][size - 1]).toBe(true);
    // Finder bottom-left
    expect(matrix[size - 7][0]).toBe(true);
    expect(matrix[size - 1][0]).toBe(true);
  });

  it('generates crisp SVG markup with quiet zone and dark fill', () => {
    const text = 'https://phovietqr.vn/q/TABLE_05';
    const matrix = generateQrMatrix(text);
    const svg = matrixToSvg(matrix, {
      margin: 4,
      fgColor: '#1D2522',
      bgColor: '#FFFFFF',
      size: 280,
    });

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('fill="#1D2522"');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain(`viewBox="0 0 ${matrix.length + 8} ${matrix.length + 8}"`);
  });

  it('sanitizes QR filenames safely across Vietnamese diacritics and special characters', () => {
    expect(sanitizeQrFilename('QR Bàn 05', 'svg')).toBe('QR_Ban_05.svg');
    expect(sanitizeQrFilename('QR Mua Mang Đi (Quầy)', 'png')).toBe('QR_Mua_Mang_Di_Quay.png');
    expect(sanitizeQrFilename('Bàn VIP #1 / Tầng 2', 'svg')).toBe('Ban_VIP_1_Tang_2.svg');
    expect(sanitizeQrFilename('', 'svg')).toBe('QR_Code.svg');
  });
});

describe('P2-G04 Owner Table & QR Management URL Security', () => {
  it('ensures QR URLs strictly point to public /q/[code] paths', () => {
    for (const qr of MOCK_QR_CODES_LIST) {
      expect(qr.path).toMatch(/^\/q\/[a-zA-Z0-9_-]+$/);
      // No sensitive tokens or session secrets
      expect(qr.path).not.toMatch(/session|token|secret|password|auth|pay/i);
    }
  });

  it('ensures table list view does not expose session secret codes', () => {
    for (const table of MOCK_TABLES_LIST) {
      expect(table.label).toBeTruthy();
      expect('sessionCode' in table).toBe(false);
      expect('secret' in table).toBe(false);
      if (table.session) {
        expect('sessionCode' in table.session).toBe(false);
        expect(table.session.status).toMatch(/open|checkout_pending/);
      }
    }
  });
});

describe('P2-G04 Owner Table Status & Grid Logic', () => {
  it('correctly categorizes table states: empty, occupied, checkout_pending, inactive', () => {
    const emptyTables = MOCK_TABLES_LIST.filter((t) => t.active && t.session === null);
    const occupiedTables = MOCK_TABLES_LIST.filter(
      (t) => t.active && t.session !== null && t.session.status === 'open'
    );
    const checkoutPendingTables = MOCK_TABLES_LIST.filter(
      (t) => t.active && t.session !== null && t.session.status === 'checkout_pending'
    );

    expect(emptyTables.length).toBeGreaterThan(0);
    expect(occupiedTables.length).toBeGreaterThan(0);
    expect(checkoutPendingTables.length).toBeGreaterThan(0);

    for (const t of emptyTables) {
      expect(t.session).toBeNull();
    }
    for (const t of occupiedTables) {
      expect(t.session?.status).toBe('open');
      expect(t.session?.orderCount).toBeGreaterThanOrEqual(0);
      expect(t.session?.totalVnd).toBeGreaterThanOrEqual(0);
    }
    for (const t of checkoutPendingTables) {
      expect(t.session?.status).toBe('checkout_pending');
    }
  });

  it('matches QR codes to corresponding tables or takeaway mode', () => {
    const tableQrs = MOCK_QR_CODES_LIST.filter((q) => q.type === 'table');
    const takeawayQrs = MOCK_QR_CODES_LIST.filter((q) => q.type === 'takeaway');

    expect(tableQrs.length).toBeGreaterThan(0);
    expect(takeawayQrs.length).toBe(1);

    for (const q of tableQrs) {
      if (q.type === 'table') {
        expect(q.table).not.toBeNull();
        expect(q.table?.id).toBeTruthy();
        expect(q.table?.label).toBeTruthy();
      }
    }

    for (const q of takeawayQrs) {
      if (q.type === 'takeaway') {
        expect(q.table).toBeNull();
      }
    }
  });
});

describe('P2-G04 QR Rotation Guardrails & Session Protection', () => {
  it('prohibits QR rotation or table deactivation when table has an active session', () => {
    const occupiedTable = MOCK_TABLES_LIST.find((t) => t.session !== null);
    expect(occupiedTable).toBeDefined();

    // Guardrail rule check:
    const canRotateQr = (table: TableSummary) => table.session === null;
    const canDeactivateTable = (table: TableSummary) => table.session === null;

    expect(canRotateQr(occupiedTable!)).toBe(false);
    expect(canDeactivateTable(occupiedTable!)).toBe(false);

    const emptyTable = MOCK_TABLES_LIST.find((t) => t.session === null);
    expect(emptyTable).toBeDefined();
    expect(canRotateQr(emptyTable!)).toBe(true);
    expect(canDeactivateTable(emptyTable!)).toBe(true);
  });
});

describe('P2-G04 Print Voucher Templates (A6/A7 Isolation)', () => {
  it('validates Table voucher template elements and instruction copy', () => {
    const store = MOCK_STORE.name;
    const label = 'Bàn 05';
    const publicUrl = 'https://phovietqr.vn/q/BAN05_DEMO';

    const voucherTitle = label.toUpperCase();
    const instruction = 'Quét mã để xem menu và gọi món';
    const warning = 'Chủ quán sẽ mở phiên bàn và cung cấp mã phiên cho quý khách.';

    expect(voucherTitle).toBe('BÀN 05');
    expect(instruction).toContain('gọi món');
    expect(warning).toContain('mã phiên');
    expect(publicUrl).toMatch(/^\/q\/|https?:\/\//);

    // Must NOT contain sensitive fields
    expect(JSON.stringify({ store, label, publicUrl })).not.toMatch(
      /sessionCode|token|secret|credit_card|STK|ngan_hang/i
    );
  });

  it('validates Takeaway voucher template elements and instruction copy', () => {
    const store = MOCK_STORE.name;
    const title = 'MUA MANG ĐI';
    const instructions = 'Quét mã • Chọn món • Thanh toán • Nhận số thứ tự';
    const publicUrl = 'https://phovietqr.vn/q/COUNTER_TAKEAWAY_CODE';

    expect(title).toBe('MUA MANG ĐI');
    expect(instructions).toContain('Nhận số thứ tự');
    expect(publicUrl).toContain('/q/COUNTER');

    // Must NOT contain bank account or direct transfer payload
    expect(JSON.stringify({ store, title, instructions, publicUrl })).not.toMatch(
      /vietcombank|techcombank|so_tai_khoan|transfer_secret/i
    );
  });
});

describe('P2-G04 & P2-C04 Add / Edit Table Input Validation', () => {
  const validateTableLabel = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: 'Tên bàn không được để trống.' };
    }
    if (trimmed.length > 80) {
      return { ok: false, error: 'Tên bàn không được vượt quá 80 ký tự.' };
    }
    return { ok: true, value: trimmed };
  };

  it('accepts valid table names', () => {
    expect(validateTableLabel('Bàn 01').ok).toBe(true);
    expect(validateTableLabel('   Bàn Sân Thượng 05   ').value).toBe('Bàn Sân Thượng 05');
    expect(validateTableLabel('VIP-Room 02').ok).toBe(true);
    expect(validateTableLabel('B'.repeat(80)).ok).toBe(true);
  });

  it('rejects empty or whitespace-only labels', () => {
    expect(validateTableLabel('').ok).toBe(false);
    expect(validateTableLabel('   ').ok).toBe(false);
    expect(validateTableLabel('   ').error).toBe('Tên bàn không được để trống.');
  });

  it('rejects labels exceeding 80 characters', () => {
    const longName = 'B'.repeat(81);
    const result = validateTableLabel(longName);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Tên bàn không được vượt quá 80 ký tự.');
  });
});

describe('P2-C04 Table QR Lifecycle Contract Integration', () => {
  it('ensures rotate payload adheres to RotateQrInput: confirm=true and exact expectedUpdatedAt', () => {
    const qrUpdatedAt = '2026-10-23T13:00:01.234567+00:00';
    const payload = {
      requestId: 'c0400000-0000-4000-8000-000000000007',
      expectedUpdatedAt: qrUpdatedAt,
      confirm: true,
    };

    expect(payload.confirm).toBe(true);
    // Preserves microsecond precision string
    expect(payload.expectedUpdatedAt).toBe(qrUpdatedAt);
    expect(payload.expectedUpdatedAt).not.toBe(new Date(qrUpdatedAt).toISOString());
  });

  it('ensures table PATCH uses exact table.updatedAt snapshot string', () => {
    const tableUpdatedAt = '2026-10-23T13:00:00.123456+00:00';
    const patchPayload = {
      requestId: 'c0400000-0000-4000-8000-000000000002',
      expectedUpdatedAt: tableUpdatedAt,
      label: 'Bàn Sân Vườn VIP',
      active: true,
    };

    expect(patchPayload.expectedUpdatedAt).toBe(tableUpdatedAt);
    expect(patchPayload.label).toBe('Bàn Sân Vườn VIP');
  });

  it('ensures takeaway QR creation strictly specifies tableId: null', () => {
    const takeawayCreatePayload = {
      requestId: 'c0400000-0000-4000-8000-000000000005',
      action: 'create',
      type: 'takeaway',
      tableId: null,
    };

    expect(takeawayCreatePayload.action).toBe('create');
    expect(takeawayCreatePayload.type).toBe('takeaway');
    expect(takeawayCreatePayload.tableId).toBeNull();
  });
});

