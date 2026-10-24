'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  QrCode,
  X,
  ExternalLink,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
  RotateCcw,
  RefreshCw,
  Loader2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import type {
  OwnerSessionOpenedView,
  TableSummary,
  QRCodeView,
  OwnerTablePinView,
} from '../../../docs/contracts/types';
import {
  revealOwnerTablePin,
  rotateOwnerTablePin,
  MenuApiError,
} from '@/features/owner/api-client';

/**
 * Format mã PIN 6 số cho giao diện người dùng (XXX XXX).
 * Ví dụ: '482619' -> '482 619', '012345' -> '012 345'.
 * Nếu là chuỗi không phải 6 số (legacy), giữ nguyên.
 */
export function formatTablePin(pin: string): string {
  const digitsOnly = pin.replace(/\D/g, '');
  if (digitsOnly.length === 6) {
    return `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 6)}`;
  }
  return pin;
}

/**
 * Trích xuất 6 chữ số liền nhau để sao chép vào clipboard hoặc gửi API,
 * bảo toàn số 0 ở đầu.
 */
export function extractContiguousPin(pin: string): string {
  const digitsOnly = pin.replace(/\D/g, '');
  if (digitsOnly.length === 6) {
    return digitsOnly;
  }
  return pin.trim();
}

interface TableSessionOpenedDialogProps {
  openedView: OwnerSessionOpenedView;
  qrCode?: QRCodeView | null;
  onClose: () => void;
}

/**
 * TableSessionOpenedDialog — Hộp thoại thông báo kết quả mở phiên bàn (HOTFIX P2-HF01).
 * Thiết kế chuẩn Minimal Emerald POS:
 * - Thay mã dài bằng PIN 6 chữ số định dạng XXX XXX (e.g. 482 619).
 * - Sao chép 6 số liền nhau, bảo toàn số 0 đầu.
 * - Thay cảnh báo đỏ bằng ghi chú trung tính: "PIN chỉ dùng cho phiên bàn hiện tại. Không đăng công khai mã."
 * - QR link công khai /q/[code], không nhúng PIN.
 */
export const TableSessionOpenedDialog: React.FC<TableSessionOpenedDialogProps> = ({
  openedView,
  qrCode,
  onClose,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedQrLink, setCopiedQrLink] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 180);
  };

  const rawSessionCode = openedView.sessionCredential.sessionCode;
  const displayPin = formatTablePin(rawSessionCode);
  const copyablePin = extractContiguousPin(rawSessionCode);

  const qrUrl = qrCode
    ? typeof window !== 'undefined'
      ? `${window.location.origin}${qrCode.path}`
      : qrCode.path
    : null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(copyablePin);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback nếu clipboard API bị chặn
    }
  };

  const handleCopyQrLink = async () => {
    if (!qrUrl) return;
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopiedQrLink(true);
      setTimeout(() => setCopiedQrLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Định dạng thời gian hết hạn
  const expiresAtDate = new Date(openedView.sessionCredential.expiresAt);
  const formattedExpiresAt = isNaN(expiresAtDate.getTime())
    ? openedView.sessionCredential.expiresAt
    : `${expiresAtDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày ${expiresAtDate.toLocaleDateString('vi-VN')}`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs ${
        isClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="opened-dialog-title"
      onClick={handleAnimatedClose}
    >
      <div
        className={`w-full max-w-md bg-white rounded-3xl border border-[#E9ECEA] shadow-2xl overflow-hidden flex flex-col ${
          isClosing ? 'animate-dialog-card-out' : 'animate-dialog-card-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header thành công */}
        <div className="p-5 sm:p-6 bg-[#E8F4F0] border-b border-[#C6E7DC] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1D725E] text-white flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h3 id="opened-dialog-title" className="text-base sm:text-lg font-bold text-[#165B4B]">
                Mở phiên {openedView.table.label}
              </h3>
              <p className="text-xs text-[#1D725E]/80">Bàn đã sẵn sàng nhận đơn</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAnimatedClose}
            className="p-1.5 rounded-xl text-[#1D725E] hover:bg-[#C6E7DC]/50 transition-colors"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Nội dung thông báo mã PIN 6 số */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Hộp PIN xác nhận bàn nổi bật chuẩn thiết kế P2-HF01 */}
          <div className="p-5 rounded-2xl bg-[#F7F8F7] border-2 border-dashed border-[#35977D] text-center">
            <span className="text-[11px] font-bold text-[#1D725E] uppercase tracking-wider block mb-1">
              MÃ XÁC NHẬN BÀN
            </span>
            <div className="text-4xl sm:text-5xl font-mono font-bold text-[#1D2522] tracking-widest my-2 select-all tabular-nums">
              {displayPin}
            </div>
            <p className="text-xs text-[#727B77] mb-3.5">
              Đọc mã này cho khách để gọi món
            </p>
            <button
              type="button"
              onClick={handleCopyCode}
              className={`h-10 px-5 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all shadow-xs ${
                copiedCode
                  ? 'bg-[#1D725E] text-white'
                  : 'bg-white border border-[#E9ECEA] hover:border-[#35977D] text-[#1D2522] hover:bg-[#F7F8F7]'
              }`}
            >
              {copiedCode ? (
                <>
                  <Check className="w-4 h-4 text-white" aria-hidden="true" />
                  <span>Đã sao chép PIN!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#727B77]" aria-hidden="true" />
                  <span>Sao chép PIN</span>
                </>
              )}
            </button>
          </div>

          {/* Đường dẫn mã QR tương ứng */}
          {qrCode && (
            <div className="p-3 bg-[#FAFBFB] rounded-xl border border-[#E9ECEA] flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <QrCode className="w-4 h-4 text-[#1D725E] flex-shrink-0" aria-hidden="true" />
                <span className="text-[#727B77]">QR bàn:</span>
                <span className="font-mono text-[#1D2522] truncate">{qrCode.path}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleCopyQrLink}
                  className="px-2.5 py-1 rounded-lg border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[11px] font-semibold text-[#1D2522] transition-colors"
                >
                  {copiedQrLink ? 'Đã chép link' : 'Chép link QR'}
                </button>
                <a
                  href={qrCode.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[11px] font-semibold text-[#1D2522] flex items-center gap-1 transition-colors"
                  aria-label="Mở trang đặt món của bàn"
                >
                  <span>Xem QR</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          )}

          {/* Thời gian hiệu lực */}
          <div className="flex items-center justify-between text-xs text-[#727B77] px-1">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#35977D]" aria-hidden="true" />
              <span>Hiệu lực đến:</span>
            </span>
            <span className="font-medium text-[#1D2522]">{formattedExpiresAt}</span>
          </div>

          {/* Ghi chú trung tính bảo mật theo P2-HF01 */}
          <div
            className="p-3 rounded-2xl bg-[#F7F8F7] border border-[#E9ECEA] text-xs text-[#727B77] flex items-center gap-2.5"
            role="note"
          >
            <ShieldCheck className="w-4 h-4 text-[#35977D] flex-shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              PIN chỉ dùng cho phiên bàn hiện tại. Không đăng công khai mã.
            </p>
          </div>
        </div>

        {/* Nút Đóng */}
        <div className="p-4 bg-[#F7F8F7] border-t border-[#E9ECEA] flex justify-end">
          <button
            type="button"
            onClick={handleAnimatedClose}
            className="w-full sm:w-auto h-11 px-6 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export interface TableDetailDialogProps {
  table: TableSummary;
  qrCode?: QRCodeView | null;
  onClose: () => void;
  onSessionUpdated?: (tableId: string, pinView: OwnerTablePinView) => void;
  onRefresh?: () => void;
  // Props-based handlers cho PIN lifecycle (HOTFIX P2-HF01)
  onRevealPin?: (tableId: string) => Promise<{ pin: string; isLegacy?: boolean }>;
  onRotatePin?: (tableId: string) => Promise<{ pin: string }>;
  onMigrateLegacyPin?: (tableId: string) => Promise<{ pin: string }>;
}

/**
 * TableDetailDialog — Xem chi tiết phiên bàn đang phục vụ & Quản lý PIN 6 số.
 * HOTFIX P2-HF01:
 * - Nút "Hiện PIN" gọi API owner reveal, hiển thị PIN 6 số an toàn.
 * - Nút "Ẩn PIN" và tự động dọn sạch PIN khỏi RAM/state khi đóng Dialog hoặc unmount.
 * - Nút "Tạo PIN mới" với AlertDialog xác nhận rõ: PIN cũ vô hiệu ngay, thiết bị cũ vẫn tiếp tục.
 * - CTA "Chuyển sang PIN 6 số" khi phiên là legacy.
 * - Chặn reveal khi bàn chưa có phiên hoặc checkout pending/closed.
 * - Không lưu PIN trong localStorage/sessionStorage.
 */
export const TableDetailDialog: React.FC<TableDetailDialogProps> = ({
  table,
  qrCode,
  onClose,
  onSessionUpdated,
  onRefresh,
  onRevealPin,
  onRotatePin,
  onMigrateLegacyPin,
}) => {
  const session = table.session;
  const isOccupied = session !== null;
  const isCheckoutPending = session?.status === 'checkout_pending';

  const [isClosing, setIsClosing] = useState(false);

  // Trạng thái PIN bí mật trong bộ nhớ tạm thời
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copiedPin, setCopiedPin] = useState(false);

  // Trạng thái phiên legacy
  const [isLegacySession, setIsLegacySession] = useState(session?.pinState === 'legacy');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(session?.version ?? 1);

  // Xác nhận tạo PIN mới
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const rotateRequestIdRef = useRef<string | null>(null);
  const migrateRequestIdRef = useRef<string | null>(null);

  // Tự động xóa PIN khỏi RAM khi unmount hoặc đóng dialog
  useEffect(() => {
    return () => {
      setRevealedPin(null);
    };
  }, []);

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setRevealedPin(null);
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 180);
  };

  // Thao tác Hiện PIN
  const handleRevealPin = async () => {
    if (isRevealing) return;
    if (!session) {
      setRevealError('Bàn chưa có phiên hoạt động.');
      return;
    }
    setIsRevealing(true);
    setRevealError(null);
    try {
      if (onRevealPin) {
        const res = await onRevealPin(table.id);
        setRevealedPin(res.pin);
        setIsLegacySession(Boolean(res.isLegacy));
      } else {
        const res = await revealOwnerTablePin(session.id);
        setRevealedPin(res.pin);
        setIsLegacySession(res.pinFormat !== 'numeric_6');
        if (res.sessionVersion) {
          setCurrentVersion(res.sessionVersion);
        }
      }
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.status === 404 || err.status === 410) {
          setRevealError('Phiên bàn đã kết thúc hoặc không tìm thấy.');
        } else if (err.status === 429) {
          setRevealError('Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.');
        } else {
          setRevealError(err.error.message || 'Không thể lấy mã PIN. Vui lòng thử lại.');
        }
      } else {
        setRevealError(
          err instanceof Error ? err.message : 'Không thể lấy mã PIN. Vui lòng thử lại.'
        );
      }
    } finally {
      setIsRevealing(false);
    }
  };

  // Thao tác Ẩn PIN
  const handleHidePin = () => {
    setRevealedPin(null);
    setCopiedPin(false);
  };

  // Sao chép PIN
  const handleCopyPin = async () => {
    if (!revealedPin) return;
    try {
      const cleanDigits = extractContiguousPin(revealedPin);
      await navigator.clipboard.writeText(cleanDigits);
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Thao tác Tạo PIN mới
  const handleConfirmRotatePin = async () => {
    if (isRotating) return;
    if (!session) {
      setRotateError('Bàn chưa có phiên hoạt động.');
      return;
    }
    setIsRotating(true);
    setRotateError(null);
    if (!rotateRequestIdRef.current) {
      rotateRequestIdRef.current = crypto.randomUUID();
    }
    const requestId = rotateRequestIdRef.current;
    const expectedVersion = currentVersion;

    try {
      if (onRotatePin) {
        const res = await onRotatePin(table.id);
        setRevealedPin(res.pin);
        setIsLegacySession(false);
      } else {
        const res = await rotateOwnerTablePin(session.id, {
          requestId,
          expectedVersion,
          confirm: true,
        });
        setRevealedPin(res.pin);
        setIsLegacySession(false);
        setCurrentVersion(res.sessionVersion);
        onSessionUpdated?.(table.id, res);
        onRefresh?.();
      }
      rotateRequestIdRef.current = null;
      setShowRotateConfirm(false);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.status === 409) {
          rotateRequestIdRef.current = null;
          setRotateError('Xung đột phiên bàn hoặc phiên đã thay đổi. Vui lòng thử lại sau.');
          onRefresh?.();
        } else if (err.status === 429) {
          setRotateError('Bạn thao tác quá nhanh. Vui lòng đợi một lát.');
        } else {
          setRotateError(err.error.message || 'Không thể tạo PIN mới. Vui lòng thử lại.');
        }
      } else {
        setRotateError(
          err instanceof Error ? err.message : 'Không thể tạo PIN mới. Vui lòng thử lại.'
        );
      }
    } finally {
      setIsRotating(false);
    }
  };

  // Thao tác Chuyển đổi Legacy sang PIN 6 số
  const handleMigrateLegacy = async () => {
    if (isMigrating) return;
    if (!session) {
      setMigrateError('Bàn chưa có phiên hoạt động.');
      return;
    }
    setIsMigrating(true);
    setMigrateError(null);
    if (!migrateRequestIdRef.current) {
      migrateRequestIdRef.current = crypto.randomUUID();
    }
    const requestId = migrateRequestIdRef.current;
    const expectedVersion = currentVersion;

    try {
      if (onMigrateLegacyPin) {
        const res = await onMigrateLegacyPin(table.id);
        setRevealedPin(res.pin);
        setIsLegacySession(false);
      } else {
        const res = await rotateOwnerTablePin(session.id, {
          requestId,
          expectedVersion,
          confirm: true,
        });
        setRevealedPin(res.pin);
        setIsLegacySession(false);
        setCurrentVersion(res.sessionVersion);
        onSessionUpdated?.(table.id, res);
        onRefresh?.();
      }
      migrateRequestIdRef.current = null;
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.status === 409) {
          migrateRequestIdRef.current = null;
          setMigrateError('Xung đột phiên bàn hoặc phiên đã thay đổi. Vui lòng thử lại.');
          onRefresh?.();
        } else {
          setMigrateError(err.error.message || 'Không thể chuyển đổi sang PIN 6 số. Vui lòng thử lại.');
        }
      } else {
        setMigrateError(
          err instanceof Error ? err.message : 'Không thể chuyển đổi sang PIN 6 số. Vui lòng thử lại.'
        );
      }
    } finally {
      setIsMigrating(false);
    }
  };

  const openedAtDate = session ? new Date(session.openedAt) : null;
  const formattedOpenedAt =
    openedAtDate && !isNaN(openedAtDate.getTime())
      ? `${openedAtDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày ${openedAtDate.toLocaleDateString('vi-VN')}`
      : session?.openedAt || '—';

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs ${
          isClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-detail-title"
        onClick={handleAnimatedClose}
      >
        <div
          className={`w-full max-w-md bg-white rounded-3xl border border-[#E9ECEA] shadow-2xl overflow-hidden flex flex-col ${
            isClosing ? 'animate-dialog-card-out' : 'animate-dialog-card-in'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 bg-white border-b border-[#E9ECEA] flex items-center justify-between">
            <div>
              <h3 id="table-detail-title" className="text-base font-bold text-[#1D2522]">
                Chi tiết {table.label}
              </h3>
              <p className="text-xs text-[#727B77] font-mono mt-0.5">ID: {table.id}</p>
            </div>
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="p-1.5 rounded-xl text-[#727B77] hover:bg-[#F7F8F7] transition-colors"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Nội dung chi tiết */}
          <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {isOccupied ? (
              <>
                {/* Thẻ trạng thái phiên */}
                <div className="p-4 bg-[#E8F4F0]/60 rounded-2xl border border-[#C6E7DC] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1D725E]">Trạng thái phiên</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        isCheckoutPending
                          ? 'bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]'
                          : 'bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]'
                      }`}
                    >
                      {isCheckoutPending ? 'Chờ thanh toán' : 'Đang phục vụ'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#C6E7DC]/60">
                    <div>
                      <span className="text-[11px] text-[#727B77] block">Số đơn gọi</span>
                      <span className="text-sm font-bold text-[#1D2522]">
                        {session.orderCount} đơn
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#727B77] block">Tổng tiền tạm tính</span>
                      <span className="text-sm font-bold text-[#1D725E]">
                        {new Intl.NumberFormat('vi-VN').format(session.totalVnd)} đ
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-[#727B77] pt-1">
                    <span>Mở lúc: </span>
                    <span className="font-medium text-[#1D2522]">{formattedOpenedAt}</span>
                  </div>
                </div>

                {/* Quản lý PIN Bàn (Chỉ cho phép khi phiên đang mở, chặn khi checkout_pending) */}
                {isCheckoutPending ? (
                  <div className="p-3.5 bg-[#FAFBFB] rounded-2xl border border-[#E9ECEA] text-xs text-[#727B77] flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#727B77] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="leading-relaxed">
                      Bàn đang ở trạng thái chờ thanh toán. Phiên gọi món đã khóa và không yêu cầu cấp lại mã PIN.
                    </p>
                  </div>
                ) : isLegacySession ? (
                  /* CTA Chuyển sang PIN 6 số cho phiên legacy */
                  <div className="p-4 bg-[#FEF6EE] rounded-2xl border border-[#F9DBAF] space-y-3">
                    <div className="flex items-start gap-2.5">
                      <KeyRound className="w-4 h-4 text-[#B54708] flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <h4 className="text-xs font-bold text-[#B54708]">
                          Phiên bàn đang dùng mã phiên cũ (Legacy)
                        </h4>
                        <p className="text-[11px] text-[#B54708]/90 mt-0.5 leading-relaxed">
                          Chuyển sang mã PIN 6 số để khách dễ dàng nhập khi quét QR. Hệ thống không khôi phục mã cũ nhưng vẫn giữ nguyên toàn bộ đơn gọi và phiên hiện tại.
                        </p>
                      </div>
                    </div>

                    {migrateError && (
                      <div className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[11px] text-[#912018] flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                        <span>{migrateError}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleMigrateLegacy}
                      disabled={isMigrating}
                      className="w-full h-10 px-4 rounded-xl bg-[#B54708] hover:bg-[#93370D] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                    >
                      {isMigrating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          <span>Đang chuyển đổi...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Chuyển sang PIN 6 số</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  /* Vùng hiển thị & quản lý PIN 6 số */
                  <div className="p-4 bg-[#F7F8F7] rounded-2xl border border-[#E9ECEA] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1D2522]">Mã xác nhận bàn (PIN)</span>
                      {revealedPin && (
                        <span className="text-[11px] font-semibold text-[#1D725E] bg-[#E8F4F0] px-2 py-0.5 rounded-md">
                          Đang hiển thị
                        </span>
                      )}
                    </div>

                    {revealError && (
                      <div className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018] flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                        <span>{revealError}</span>
                      </div>
                    )}

                    {revealedPin === null ? (
                      /* Khi chưa bấm Hiện PIN */
                      <div className="text-center py-2 space-y-2">
                        <p className="text-xs text-[#727B77]">
                          Chỉ hiển thị khi chủ quán chủ động bấm xem lại.
                        </p>
                        <button
                          type="button"
                          onClick={handleRevealPin}
                          disabled={isRevealing}
                          className="h-10 px-4 rounded-xl bg-white border border-[#E9ECEA] hover:border-[#35977D] text-xs font-bold text-[#1D725E] inline-flex items-center gap-2 shadow-2xs transition-all disabled:opacity-60"
                        >
                          {isRevealing ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              <span>Đang tải PIN...</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Hiện PIN</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      /* Khi đã Hiện PIN thành công từ server */
                      <div className="space-y-3 text-center pt-1">
                        <div className="p-3 bg-white rounded-xl border-2 border-dashed border-[#35977D]">
                          <div className="text-3xl sm:text-4xl font-mono font-bold text-[#1D2522] tracking-widest tabular-nums select-all">
                            {formatTablePin(revealedPin)}
                          </div>
                          <p className="text-[11px] text-[#727B77] mt-1">
                            PIN dùng cho phiên bàn hiện tại. Không đăng công khai mã.
                          </p>
                        </div>

                        {/* Các hành động trên PIN: Sao chép / Ẩn / Tạo PIN mới */}
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleCopyPin}
                            className="h-9 px-3.5 rounded-xl bg-white border border-[#E9ECEA] hover:border-[#35977D] text-xs font-semibold text-[#1D2522] flex items-center gap-1.5 transition-colors shadow-2xs"
                          >
                            {copiedPin ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#1D725E]" aria-hidden="true" />
                                <span className="text-[#1D725E] font-bold">Đã chép!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-[#727B77]" aria-hidden="true" />
                                <span>Sao chép PIN</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={handleHidePin}
                            className="h-9 px-3.5 rounded-xl bg-white border border-[#E9ECEA] hover:bg-[#F7F8F7] text-xs font-semibold text-[#727B77] flex items-center gap-1.5 transition-colors"
                          >
                            <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Ẩn PIN</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowRotateConfirm(true)}
                            className="h-9 px-3.5 rounded-xl bg-white border border-[#FECDCA] hover:bg-[#FEF3F2] text-xs font-semibold text-[#B42318] flex items-center gap-1.5 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Tạo PIN mới</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-6 text-center text-xs text-[#727B77] bg-[#F7F8F7] rounded-2xl">
                Bàn hiện đang trống và chưa có phiên phục vụ.
              </div>
            )}

            {/* Đường dẫn mã QR của bàn */}
            {qrCode && (
              <div className="p-3 bg-white rounded-xl border border-[#E9ECEA] flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <QrCode className="w-4 h-4 text-[#1D725E] flex-shrink-0" aria-hidden="true" />
                  <span className="font-mono text-[#1D2522] truncate">{qrCode.path}</span>
                </div>
                <a
                  href={qrCode.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-[#F7F8F7] hover:bg-[#E9ECEA] text-[11px] font-semibold text-[#1D2522] flex items-center gap-1 transition-colors"
                >
                  <span className="whitespace-nowrap">Xem QR</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-[#F7F8F7] border-t border-[#E9ECEA] flex justify-end">
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="h-10 px-5 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D2522] transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {/* AlertDialog xác nhận Tạo PIN mới */}
      {showRotateConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-dialog-backdrop-in"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="rotate-dialog-title"
          aria-describedby="rotate-dialog-desc"
        >
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#E9ECEA] shadow-2xl p-5 sm:p-6 space-y-4 animate-dialog-card-in">
            <div className="w-10 h-10 rounded-2xl bg-[#FEF3F2] text-[#B42318] flex items-center justify-center">
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
            </div>

            <div>
              <h4 id="rotate-dialog-title" className="text-base font-bold text-[#1D2522]">
                Tạo PIN mới cho {table.label}?
              </h4>
              <p id="rotate-dialog-desc" className="text-xs text-[#727B77] mt-1.5 leading-relaxed">
                PIN cũ sẽ ngừng hiệu lực ngay lập tức. Những thiết bị của khách đã xác minh trước đó vẫn có thể tiếp tục gọi món. Thiết bị mới quét QR sẽ cần nhập PIN mới.
              </p>
            </div>

            {rotateError && (
              <div className="p-2.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span>{rotateError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowRotateConfirm(false);
                  setRotateError(null);
                }}
                disabled={isRotating}
                className="h-10 px-4 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D2522] transition-colors disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmRotatePin}
                disabled={isRotating}
                className="h-10 px-4 rounded-xl bg-[#B42318] hover:bg-[#912018] text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 shadow-xs"
              >
                {isRotating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Đang tạo PIN...</span>
                  </>
                ) : (
                  <span>Xác nhận tạo PIN mới</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
