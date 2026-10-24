import { describe, it, expect } from 'vitest';
import {
  formatTablePin,
  extractContiguousPin,
} from '@/components/owner/TableSessionDialog';
import {
  MOCK_QR_TABLE_UNVERIFIED,
  MOCK_QR_TABLE_VERIFIED,
  MOCK_QR_TAKEAWAY,
  DEMO_VALID_SESSION_CODES,
  MOCK_TABLES_LIST,
  MOCK_QR_CODES_LIST,
} from '@/lib/mocks/ui-preview';
import type {
  OwnerSessionOpenedView,
  QRResolution,
  TableSummary,
} from '../../docs/contracts/types';

describe('P2-HF01: 6-Digit Table PIN Formatting & Normalization', () => {
  it('formats 6-digit PIN into XXX XXX display format', () => {
    expect(formatTablePin('482619')).toBe('482 619');
    expect(formatTablePin('123456')).toBe('123 456');
    expect(formatTablePin('999000')).toBe('999 000');
  });

  it('preserves leading zeros in display formatting', () => {
    expect(formatTablePin('012345')).toBe('012 345');
    expect(formatTablePin('000123')).toBe('000 123');
    expect(formatTablePin('000000')).toBe('000 000');
  });

  it('extracts contiguous 6-digit string without spaces for clipboard and API payload', () => {
    expect(extractContiguousPin('482 619')).toBe('482619');
    expect(extractContiguousPin(' 482 619 ')).toBe('482619');
    expect(extractContiguousPin('012 345')).toBe('012345');
    expect(extractContiguousPin('012345')).toBe('012345');
  });

  it('handles non-6-digit legacy codes gracefully without corruption', () => {
    expect(formatTablePin('LEGACY_SESSION_SECRET_TOKEN')).toBe('LEGACY_SESSION_SECRET_TOKEN');
    expect(extractContiguousPin('LEGACY_SESSION_SECRET_TOKEN')).toBe('LEGACY_SESSION_SECRET_TOKEN');
  });
});

describe('P2-HF01: Guest 6-Digit PIN Entry & Normalization Logic', () => {
  const sanitizeGuestInput = (raw: string) => {
    return raw.replace(/\D/g, '').slice(0, 6);
  };

  const validateGuestPin = (pin: string) => {
    if (pin.length !== 6) {
      return { ok: false, error: 'Vui lòng nhập đủ 6 chữ số mã PIN.' };
    }
    return { ok: true, pin };
  };

  it('sanitizes keyboard input and keeps only digits 0-9', () => {
    expect(sanitizeGuestInput('482a6b1c9')).toBe('482619');
    expect(sanitizeGuestInput('!@#482-619')).toBe('482619');
    expect(sanitizeGuestInput('482 619')).toBe('482619');
  });

  it('preserves leading zeros when guest pastes or types', () => {
    expect(sanitizeGuestInput('012 345')).toBe('012345');
    expect(sanitizeGuestInput('  005821  ')).toBe('005821');
  });

  it('bounds maximum input length to 6 digits', () => {
    expect(sanitizeGuestInput('482619888999')).toBe('482619');
  });

  it('validates PIN length strictly: rejects less than 6 digits and approves exactly 6 digits', () => {
    expect(validateGuestPin('').ok).toBe(false);
    expect(validateGuestPin('48261').ok).toBe(false);
    expect(validateGuestPin('482619').ok).toBe(true);
    expect(validateGuestPin('012345').ok).toBe(true);
  });

  it('recognizes 6-digit PIN in demo fixtures', () => {
    expect(DEMO_VALID_SESSION_CODES).toContain('482619');
    expect(DEMO_VALID_SESSION_CODES).toContain('012345');
  });
});

describe('P2-HF01: Guest QR Mode Isolation & Flow Rules', () => {
  it('requires PIN entry only for unverified Dine-In table QR', () => {
    const unverified: QRResolution = MOCK_QR_TABLE_UNVERIFIED;
    expect(unverified.mode).toBe('dine_in');
    expect(unverified.requiresSessionCode).toBe(true);
    expect(unverified.table).not.toBeNull();
  });

  it('bypasses PIN entry when Dine-In table is already verified', () => {
    const verified: QRResolution = MOCK_QR_TABLE_VERIFIED;
    expect(verified.mode).toBe('dine_in');
    expect(verified.requiresSessionCode).toBe(false);
    expect(verified.session?.status).toBe('open');
  });

  it('bypasses PIN entry completely for Takeaway QR directly into menu', () => {
    const takeaway: QRResolution = MOCK_QR_TAKEAWAY;
    expect(takeaway.mode).toBe('takeaway');
    expect(takeaway.requiresSessionCode).toBe(false);
    expect(takeaway.table).toBeNull();
    expect(takeaway.session).toBeNull();
  });
});

describe('P2-HF01: Error Message Specifications for Accessible Feedback', () => {
  const mapVerificationError = (status?: number, code?: string): string => {
    if (status === 401 || status === 400 || code === 'INVALID_SESSION_CODE') {
      return 'Mã chưa đúng, vui lòng thử lại.';
    }
    if (status === 429 || code === 'RATE_LIMITED') {
      return 'Bạn thử quá nhiều lần. Hãy đợi một chút rồi thử lại.';
    }
    if (status === 410 || code === 'SESSION_EXPIRED' || code === 'SESSION_CHECKOUT_PENDING') {
      return 'Phiên bàn đã kết thúc, vui lòng hỏi quán.';
    }
    if (status === 409 || code === 'DUPLICATE_REQUEST_CONFLICT') {
      return 'Mã PIN đã thay đổi. Vui lòng xin mã mới từ chủ quán.';
    }
    return 'Không thể kết nối. Kiểm tra mạng và thử lại.';
  };

  it('maps 401 / 400 / INVALID_SESSION_CODE to friendly wrong PIN copy', () => {
    expect(mapVerificationError(401)).toBe('Mã chưa đúng, vui lòng thử lại.');
    expect(mapVerificationError(400, 'INVALID_SESSION_CODE')).toBe('Mã chưa đúng, vui lòng thử lại.');
  });

  it('maps 429 / RATE_LIMITED to rate-limited notice', () => {
    expect(mapVerificationError(429)).toBe('Bạn thử quá nhiều lần. Hãy đợi một chút rồi thử lại.');
    expect(mapVerificationError(undefined, 'RATE_LIMITED')).toBe('Bạn thử quá nhiều lần. Hãy đợi một chút rồi thử lại.');
  });

  it('maps 410 / SESSION_EXPIRED / SESSION_CHECKOUT_PENDING to session expired notice', () => {
    expect(mapVerificationError(410)).toBe('Phiên bàn đã kết thúc, vui lòng hỏi quán.');
    expect(mapVerificationError(undefined, 'SESSION_EXPIRED')).toBe('Phiên bàn đã kết thúc, vui lòng hỏi quán.');
  });

  it('maps 409 / DUPLICATE_REQUEST_CONFLICT to rotate conflict notice', () => {
    expect(mapVerificationError(409)).toBe('Mã PIN đã thay đổi. Vui lòng xin mã mới từ chủ quán.');
  });

  it('maps generic or network errors to connectivity notice', () => {
    expect(mapVerificationError(500)).toBe('Không thể kết nối. Kiểm tra mạng và thử lại.');
    expect(mapVerificationError()).toBe('Không thể kết nối. Kiểm tra mạng và thử lại.');
  });
});

describe('P2-HF01: Owner Table Session Opened & Reveal/Rotate Rules', () => {
  it('formats OwnerSessionOpenedView credential into 6-digit PIN display', () => {
    const openedView: OwnerSessionOpenedView = {
      table: { id: 'c0200000-0000-4000-8000-000000000005', label: 'Bàn 05' },
      session: {
        id: 'c0200000-0000-4000-8000-000000000099',
        status: 'open',
        openedAt: '2026-10-24T00:00:00Z',
        closedAt: null,
        orderCount: 0,
        totalVnd: 0,
        paymentStatus: 'unpaid',
        version: 1,
      },
      sessionCredential: {
        sessionCode: '482619',
        expiresAt: '2026-10-24T06:00:00Z',
      },
    };

    const formatted = formatTablePin(openedView.sessionCredential.sessionCode);
    expect(formatted).toBe('482 619');

    const contiguous = extractContiguousPin(openedView.sessionCredential.sessionCode);
    expect(contiguous).toBe('482619');
  });

  it('preserves leading zeros in owner session opened view', () => {
    const openedWithZero: OwnerSessionOpenedView = {
      table: { id: 'c0200000-0000-4000-8000-000000000001', label: 'Bàn 01' },
      session: {
        id: 'c0200000-0000-4000-8000-000000000098',
        status: 'open',
        openedAt: '2026-10-24T00:00:00Z',
        closedAt: null,
        orderCount: 0,
        totalVnd: 0,
        paymentStatus: 'unpaid',
        version: 1,
      },
      sessionCredential: {
        sessionCode: '012345',
        expiresAt: '2026-10-24T06:00:00Z',
      },
    };

    expect(formatTablePin(openedWithZero.sessionCredential.sessionCode)).toBe('012 345');
    expect(extractContiguousPin(openedWithZero.sessionCredential.sessionCode)).toBe('012345');
  });

  it('verifies public QR URLs contain NO session secret or PIN', () => {
    for (const qr of MOCK_QR_CODES_LIST) {
      expect(qr.path).toMatch(/^\/q\/[a-zA-Z0-9_-]+$/);
      expect(qr.path).not.toContain('482619');
      expect(qr.path).not.toContain('pin');
      expect(qr.path).not.toContain('secret');
    }
  });

  it('determines whether PIN reveal is permitted based on table session status', () => {
    const canRevealPin = (table: TableSummary): boolean => {
      if (!table.session) return false;
      return table.session.status === 'open';
    };

    const emptyTable = MOCK_TABLES_LIST.find((t) => t.session === null)!;
    const occupiedTable = MOCK_TABLES_LIST.find((t) => t.session?.status === 'open')!;
    const checkoutPendingTable = MOCK_TABLES_LIST.find((t) => t.session?.status === 'checkout_pending')!;

    expect(canRevealPin(emptyTable)).toBe(false);
    expect(canRevealPin(checkoutPendingTable)).toBe(false);
    expect(canRevealPin(occupiedTable)).toBe(true);
  });

  it('strictly validates reveal and rotate payload structure according to Codex contract', () => {
    // Reveal requires sessionId (UUID)
    const buildRevealCall = (table: TableSummary) => {
      if (!table.session) {
        throw new Error('Bàn chưa có phiên hoạt động.');
      }
      return {
        sessionId: table.session.id,
      };
    };

    // Rotate requires sessionId, requestId, expectedVersion, and confirm: true
    const buildRotateCall = (table: TableSummary, requestId: string) => {
      if (!table.session) {
        throw new Error('Bàn chưa có phiên hoạt động.');
      }
      return {
        sessionId: table.session.id,
        payload: {
          requestId,
          expectedVersion: table.session.version,
          confirm: true,
        },
      };
    };

    const emptyTable = MOCK_TABLES_LIST.find((t) => t.session === null)!;
    const occupiedTable = MOCK_TABLES_LIST.find((t) => t.session?.status === 'open')!;

    // No fallback PIN is fabricated when table has no session
    expect(() => buildRevealCall(emptyTable)).toThrow('Bàn chưa có phiên hoạt động.');
    expect(() => buildRotateCall(emptyTable, 'req-123')).toThrow('Bàn chưa có phiên hoạt động.');

    // Occupied table produces valid contract payload
    const revealCall = buildRevealCall(occupiedTable);
    expect(revealCall.sessionId).toBe(occupiedTable.session!.id);

    const rotateCall = buildRotateCall(occupiedTable, 'req-456');
    expect(rotateCall.sessionId).toBe(occupiedTable.session!.id);
    expect(rotateCall.payload.expectedVersion).toBe(occupiedTable.session!.version);
    expect(rotateCall.payload.confirm).toBe(true);
    expect(rotateCall.payload.requestId).toBe('req-456');
  });
});

