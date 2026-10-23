'use client';

import React, { useState } from 'react';
import {
  X,
  Download,
  Printer,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import type { OwnerTable, OwnerQrCode } from '@/types/contracts/table-qr';
import { rotateOwnerQrCode, MenuApiError } from '@/features/owner/api-client';
import { QrCodeView } from '../qr/QrCodeView';
import { PrintQrVoucher } from '../qr/PrintQrVoucher';
import {
  generateQrMatrix,
  matrixToSvg,
  downloadSvgString,
  downloadPngFromMatrix,
} from '@/lib/qr/qr-code';

export interface TableQrModalProps {
  table: OwnerTable;
  qrCode?: OwnerQrCode | null;
  storeName?: string;
  isOpen: boolean;
  onClose: () => void;
  onQrRotated?: (newQr: OwnerQrCode) => void;
}

/**
 * TableQrModal — Dialog xem, tải, in và quản lý vòng đời QR của một bàn.
 * - Sử dụng publicUrl trực tiếp do server trả về (chuẩn P2-C04), không tự ghép browser origin.
 * - Hỗ trợ tải file SVG vector sắc nét hoặc PNG 1024px chất lượng cao.
 * - Hỗ trợ in phiếu dán bàn chuẩn A6/A7 cách ly qua print stylesheet.
 * - Đổi mã QR (rotate) an toàn qua POST /api/owner/qr-codes/:id/rotate với confirm:true và expectedUpdatedAt.
 * - Chặn tuyệt đối khi bàn có phiên open hoặc checkout_pending.
 */
export const TableQrModal: React.FC<TableQrModalProps> = ({
  table,
  qrCode: initialQrCode,
  storeName = 'PHỞ VIỆT QR',
  isOpen,
  onClose,
  onQrRotated,
}) => {
  const [prevTableId, setPrevTableId] = useState<string>(table.id);
  const [overrideQr, setOverrideQr] = useState<OwnerQrCode | null>(null);
  const currentQr: OwnerQrCode | null = overrideQr ?? initialQrCode ?? table.qr ?? null;

  const [copiedLink, setCopiedLink] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [justRotated, setJustRotated] = useState(false);

  if (table.id !== prevTableId) {
    setPrevTableId(table.id);
    setOverrideQr(null);
    setRotateError(null);
    setShowRotateConfirm(false);
    setJustRotated(false);
  }

  if (!isOpen) return null;

  // Ưu tiên tuyệt đối qr.publicUrl do server trả về theo yêu cầu P2-C04
  const fullPublicUrl =
    currentQr?.publicUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}${currentQr?.path || `/q/${table.id.replace(/[^a-zA-Z0-9]/g, '_')}`}`
      : '');
  const filenameBase = `QR_${table.label.replace(/\s+/g, '_')}`;

  // Kiểm tra phiên hoạt động
  const hasActiveSession = table.session !== null;

  // Xử lý sao chép link
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullPublicUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Tải SVG
  const handleDownloadSvg = () => {
    try {
      const matrix = generateQrMatrix(fullPublicUrl);
      const svg = matrixToSvg(matrix, {
        margin: 4,
        size: 512,
        fgColor: '#1D2522',
        bgColor: '#FFFFFF',
      });
      downloadSvgString(svg, filenameBase);
    } catch {
      // Fallback
    }
  };

  // Tải PNG
  const handleDownloadPng = async () => {
    try {
      const matrix = generateQrMatrix(fullPublicUrl);
      await downloadPngFromMatrix(matrix, filenameBase, 1024, 4);
    } catch {
      // Fallback
    }
  };

  // Xử lý In
  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  // Xử lý Đổi mã QR (Rotate) qua POST /api/owner/qr-codes/:id/rotate
  const handleRotateQr = async () => {
    if (!currentQr?.id) {
      setRotateError('Bàn chưa có mã QR active để thực hiện đổi mã.');
      return;
    }

    if (hasActiveSession) {
      setRotateError(
        'Không thể đổi mã QR khi bàn đang có phiên hoạt động hoặc chờ thanh toán. Vui lòng đóng hoặc kết thúc phiên bàn trước.'
      );
      setShowRotateConfirm(false);
      return;
    }

    setIsRotating(true);
    setRotateError(null);

    const requestId = crypto.randomUUID();

    try {
      const newQrData = await rotateOwnerQrCode(currentQr.id, {
        expectedUpdatedAt: currentQr.updatedAt,
        confirm: true,
        requestId,
      });

      setOverrideQr(newQrData);
      setJustRotated(true);
      setShowRotateConfirm(false);
      onQrRotated?.(newQrData);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        const field = err.error.details?.field;
        const code = err.error.code;

        if (code === 'INVALID_STATE_TRANSITION' && field === 'activeSession') {
          setRotateError(
            'Đổi mã QR bị chặn vì bàn đang có phiên hoạt động hoặc chờ thanh toán.'
          );
        } else if (code === 'INVALID_STATE_TRANSITION' && field === 'expectedUpdatedAt') {
          setRotateError(
            'Mã QR đã được cập nhật bởi một thao tác khác. Vui lòng tải lại trang.'
          );
        } else if (code === 'INVALID_STATE_TRANSITION' && (field === 'rotation' || field === 'retiredQr')) {
          setRotateError('Mã QR không hợp lệ hoặc đã bị vô hiệu hóa.');
        } else if (code === 'RATE_LIMITED') {
          setRotateError('Thao tác quá nhanh. Vui lòng chờ vài giây rồi thử lại.');
        } else {
          setRotateError(err.error.message || 'Không thể đổi mã QR.');
        }
      } else {
        setRotateError('Lỗi mạng khi gửi yêu cầu đổi mã QR. Vui lòng thử lại.');
      }
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <>
      {/* VÙNG IN RIÊNG BIỆT CỦA BÀN (@media print) */}
      <div className="hidden print:block">
        <PrintQrVoucher
          type="table"
          storeName={storeName}
          title={table.label}
          publicUrl={fullPublicUrl}
          subtitle="Quét mã xem thực đơn và gọi món trực tiếp"
        />
      </div>

      {/* DIALOG CHÍNH TRÊN MÀN HÌNH */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 print:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-dialog-title"
      >
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#E9ECEA] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-[#E9ECEA] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#1D725E] uppercase tracking-wider bg-[#E8F4F0] px-2 py-0.5 rounded-md">
                  {storeName}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    currentQr?.active !== false
                      ? 'bg-[#E8F4F0] text-[#1D725E]'
                      : 'bg-[#FEF3F2] text-[#B42318]'
                  }`}
                >
                  {currentQr?.active !== false ? 'QR Đang hoạt động' : 'QR Đã khóa'}
                </span>
              </div>
              <h3
                id="qr-dialog-title"
                className="text-lg font-extrabold text-[#1D2522] mt-0.5"
              >
                Mã QR — {table.label}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[#727B77] hover:bg-[#F7F8F7] hover:text-[#1D2522] transition-colors"
              aria-label="Đóng hộp thoại"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto">
            {/* Thông báo vừa rotate */}
            {justRotated && (
              <div
                role="alert"
                className="p-3 bg-[#E8F4F0] border border-[#C6E7DC] rounded-2xl text-xs text-[#165B4B] flex items-start gap-2 animate-in fade-in"
              >
                <RefreshCw className="w-4 h-4 shrink-0 text-[#1D725E] mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-bold">Đã đổi mã QR mới thành công!</p>
                  <p className="text-[11px] text-[#165B4B]/80 mt-0.5">
                    Mã QR cũ đã mất hiệu lực. Vui lòng in và dán lại mã mới lên bàn cho khách quét.
                  </p>
                </div>
              </div>
            )}

            {/* Thông báo lỗi nếu có */}
            {rotateError && (
              <div
                role="alert"
                className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-2xl text-xs text-[#912018] flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{rotateError}</span>
              </div>
            )}

            {/* QR Code trung tâm */}
            <div className="flex flex-col items-center justify-center p-4 bg-[#F7F8F7] rounded-2xl border border-[#E9ECEA]">
              <QrCodeView
                value={fullPublicUrl}
                size={210}
                margin={4}
                fgColor="#1D2522"
                bgColor="#FFFFFF"
                className="shadow-sm"
              />

              <div className="mt-3 w-full flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-[#E9ECEA] text-xs">
                <span className="font-mono text-[#727B77] truncate select-all">
                  {fullPublicUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-[#F7F8F7] text-[#1D725E] font-semibold flex items-center gap-1 transition-colors"
                  title="Sao chép liên kết"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#1D725E]" aria-hidden="true" />
                      <span className="text-[11px]">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="text-[11px]">Chép link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Cảnh báo bảo mật phiên bàn */}
            <div className="p-3 bg-[#FAFBFB] border border-[#E9ECEA] rounded-xl text-xs text-[#55605C] flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-[#727B77] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">
                Mã QR dán tại bàn chỉ dẫn đến trang gọi món công khai. Để tránh gọi nhầm bàn,
                khách cần nhập <strong>mã phiên bàn</strong> do bạn cung cấp khi bắt đầu.
              </p>
            </div>

            {/* Bộ CTA chính: Tải SVG, Tải PNG, In */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleDownloadSvg}
                className="h-11 px-3 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[#1D2522] text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:border-[#35977D]"
              >
                <Download className="w-3.5 h-3.5 text-[#35977D]" aria-hidden="true" />
                <span>Tải SVG</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPng}
                className="h-11 px-3 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[#1D2522] text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:border-[#35977D]"
              >
                <Download className="w-3.5 h-3.5 text-[#35977D]" aria-hidden="true" />
                <span>Tải PNG</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="h-11 px-3 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
                <span>{isPrinting ? 'Đang mở in...' : 'In phiếu QR'}</span>
              </button>
            </div>

            {/* Menu phụ: Đổi mã QR (Rotate) có xác nhận */}
            <div className="pt-2 border-t border-[#E9ECEA]">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full py-2 flex items-center justify-between text-xs font-semibold text-[#727B77] hover:text-[#1D2522] transition-colors"
              >
                <span>Tùy chọn nâng cao (Đổi mã QR)</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    showAdvanced ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {showAdvanced && (
                <div className="mt-2 p-3 bg-[#FEF3F2]/50 border border-[#FECDCA] rounded-2xl space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#B42318] shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h5 className="text-xs font-bold text-[#912018]">Đổi mã QR cho bàn</h5>
                      <p className="text-[11px] text-[#B42318] mt-0.5">
                        Khi đổi mã, mã QR cũ đã in sẽ lập tức vô hiệu hóa. Bạn phải in và dán lại mã mới.
                      </p>
                    </div>
                  </div>

                  {hasActiveSession ? (
                    <div className="p-2 bg-white rounded-xl border border-[#FECDCA] text-[11px] text-[#B42318] font-medium">
                      Bàn đang có phiên hoạt động hoặc chờ thanh toán. Đổi mã bị khóa để tránh gián đoạn khách đang dùng bữa.
                    </div>
                  ) : (
                    <>
                      {!showRotateConfirm ? (
                        <button
                          type="button"
                          onClick={() => setShowRotateConfirm(true)}
                          className="w-full h-9 px-3 rounded-xl border border-[#FECDCA] bg-white hover:bg-[#FEF3F2] text-[#B42318] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Yêu cầu đổi mã QR</span>
                        </button>
                      ) : (
                        <div className="p-3 bg-white rounded-xl border border-[#FDA29B] space-y-2.5 animate-in fade-in">
                          <p className="text-xs font-bold text-[#912018]">
                            Xác nhận: Mã QR cũ sẽ không còn hoạt động. Bạn chắc chắn muốn đổi?
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowRotateConfirm(false)}
                              disabled={isRotating}
                              className="flex-1 h-8 px-2 rounded-lg border border-[#E9ECEA] bg-[#F7F8F7] hover:bg-white text-xs font-semibold text-[#1D2522]"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={handleRotateQr}
                              disabled={isRotating}
                              className="flex-1 h-8 px-2 rounded-lg bg-[#B42318] hover:bg-[#912018] text-white text-xs font-bold flex items-center justify-center gap-1"
                            >
                              {isRotating ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                                  <span>Đang đổi...</span>
                                </>
                              ) : (
                                <span>Xác nhận đổi</span>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
