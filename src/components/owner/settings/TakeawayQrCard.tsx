'use client';

import React, { useState } from 'react';
import {
  QrCode,
  Download,
  Printer,
  Copy,
  Check,
  RefreshCw,
  Plus,
  AlertTriangle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import type { OwnerQrCode } from '@/types/contracts/table-qr';
import { writeOwnerQrCode, rotateOwnerQrCode, MenuApiError } from '@/features/owner/api-client';
import { QrCodeView } from '../qr/QrCodeView';
import { PrintQrVoucher } from '../qr/PrintQrVoucher';
import {
  generateQrMatrix,
  matrixToSvg,
  downloadSvgString,
  downloadPngFromMatrix,
} from '@/lib/qr/qr-code';

export interface TakeawayQrCardProps {
  storeName?: string;
  initialQrCode?: OwnerQrCode | null;
  onQrUpdated?: (qr: OwnerQrCode) => void;
}

/**
 * TakeawayQrCard — Thẻ quản lý mã QR Mua mang đi tại quầy trong tab Cài đặt.
 * - Render QR từ publicUrl thật do server trả về (/q/[code]).
 * - Hỗ trợ Tải SVG/PNG, In phiếu A6/A7, Sao chép link.
 * - Tuyệt đối không nhúng STK hay mã chuyển khoản vào QR này.
 * - Tạo mới QR quầy qua POST /api/owner/qr-codes với type: 'takeaway', tableId: null.
 * - Đổi mã QR quầy an toàn qua POST /api/owner/qr-codes/:id/rotate với confirm: true và expectedUpdatedAt.
 */
export const TakeawayQrCard: React.FC<TakeawayQrCardProps> = ({
  storeName = 'PHỞ VIỆT QR',
  initialQrCode,
  onQrUpdated,
}) => {
  const [overrideQr, setOverrideQr] = useState<OwnerQrCode | null>(null);
  const currentQr: OwnerQrCode | null = overrideQr ?? initialQrCode ?? null;
  const [copiedLink, setCopiedLink] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [justRotated, setJustRotated] = useState(false);

  // Ưu tiên qr.publicUrl do server trả về
  const fullPublicUrl =
    currentQr?.publicUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}${currentQr?.path || '/q/COUNTER_PUBLIC'}`
      : '');
  const filenameBase = 'QR_Mang_Di_Tai_Quay';

  // Sao chép link
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

  // In phiếu QR
  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  // Tạo QR mang đi mới nếu chưa có (R18 create takeaway với tableId: null)
  const handleCreateTakeawayQr = async () => {
    setIsCreating(true);
    setErrorMessage(null);
    const requestId = crypto.randomUUID();

    try {
      const createdQr = await writeOwnerQrCode({
        action: 'create',
        type: 'takeaway',
        tableId: null,
        requestId,
      });

      setOverrideQr(createdQr);
      onQrUpdated?.(createdQr);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.error.details?.field === 'activeQr') {
          setErrorMessage('Quán đã có mã QR mang đi đang hoạt động.');
        } else {
          setErrorMessage(err.error.message || 'Không thể tạo mã QR mang đi.');
        }
      } else {
        setErrorMessage('Lỗi mạng khi gửi yêu cầu tạo mã QR mang đi.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Đổi mã QR mang đi qua POST /api/owner/qr-codes/:id/rotate
  const handleRotateTakeawayQr = async () => {
    if (!currentQr?.id) {
      setErrorMessage('Chưa có mã QR mang đi để thực hiện đổi mã.');
      return;
    }

    setIsRotating(true);
    setErrorMessage(null);
    const requestId = crypto.randomUUID();

    try {
      const newQr = await rotateOwnerQrCode(currentQr.id, {
        expectedUpdatedAt: currentQr.updatedAt,
        confirm: true,
        requestId,
      });

      setOverrideQr(newQr);
      setJustRotated(true);
      setShowRotateConfirm(false);
      onQrUpdated?.(newQr);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        const field = err.error.details?.field;
        if (field === 'expectedUpdatedAt') {
          setErrorMessage('Mã QR quầy đã bị cập nhật bởi thao tác khác. Vui lòng làm mới trang.');
        } else if (field === 'rotation' || field === 'retiredQr') {
          setErrorMessage('Mã QR quầy không hợp lệ hoặc đã ngừng hoạt động để đổi.');
        } else {
          setErrorMessage(err.error.message || 'Không thể đổi mã QR quầy.');
        }
      } else {
        setErrorMessage('Lỗi mạng khi yêu cầu đổi mã QR quầy.');
      }
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <>
      {/* VÙNG IN RIÊNG BIỆT CỦA QUẦY MANG ĐI (@media print) */}
      <div className="hidden print:block">
        <PrintQrVoucher
          type="takeaway"
          storeName={storeName}
          title="MUA MANG ĐI"
          publicUrl={fullPublicUrl}
          subtitle="Đặt món mang đi nhanh tại quầy thu ngân"
        />
      </div>

      {/* CARD HIỂN THỊ TRONG TAB CÀI ĐẶT */}
      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs space-y-4">
        {/* Header của Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E9ECEA]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-[#1D2522]">
                  Mã QR mua mang đi tại quầy
                </h4>
                {currentQr && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      currentQr.active
                        ? 'bg-[#E8F4F0] text-[#1D725E]'
                        : 'bg-[#FEF3F2] text-[#B42318]'
                    }`}
                  >
                    {currentQr.active ? '🟢 Đang hoạt động' : '⚪ Đã vô hiệu'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#727B77] mt-0.5">
                Khách quét mã này tại quầy để mở menu và đặt món mang về không cần mã phiên bàn.
              </p>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl text-xs text-[#912018] flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {justRotated && (
          <div
            role="alert"
            className="p-3 bg-[#E8F4F0] border border-[#C6E7DC] rounded-xl text-xs text-[#165B4B] flex items-start gap-2"
          >
            <RefreshCw className="w-4 h-4 shrink-0 text-[#1D725E] mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">Đã đổi mã QR quầy mới!</p>
              <p className="text-[11px] text-[#165B4B]/80 mt-0.5">
                Hãy in lại phiếu dán tại quầy để khách quét đúng địa chỉ mới nhất.
              </p>
            </div>
          </div>
        )}

        {!currentQr ? (
          /* Trạng thái chưa có QR Takeaway */
          <div className="p-6 bg-[#F7F8F7] border border-dashed border-[#E9ECEA] rounded-2xl text-center space-y-3">
            <p className="text-xs text-[#727B77]">
              Quán chưa tạo mã QR dùng chung cho khách đặt mang đi tại quầy.
            </p>
            <button
              type="button"
              disabled={isCreating}
              onClick={handleCreateTakeawayQr}
              className="h-10 px-4 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Đang tạo QR...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>Tạo mã QR mang đi</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Trạng thái đã có QR Takeaway */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-[#F7F8F7] rounded-2xl border border-[#E9ECEA]">
              {/* QR Preview thu nhỏ */}
              <QrCodeView
                value={fullPublicUrl}
                size={140}
                margin={4}
                fgColor="#1D2522"
                bgColor="#FFFFFF"
                className="shrink-0"
              />

              {/* Thông tin & Link */}
              <div className="flex-1 w-full space-y-2">
                <div>
                  <span className="text-[11px] font-bold text-[#1D725E] uppercase tracking-wider">
                    {storeName}
                  </span>
                  <p className="text-xs font-semibold text-[#1D2522]">
                    Điểm quét đặt món Mang đi (Tại quầy)
                  </p>
                </div>

                <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-[#E9ECEA] text-xs">
                  <span className="font-mono text-[#727B77] truncate select-all flex-1">
                    {fullPublicUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="p-1.5 rounded-lg hover:bg-[#F7F8F7] text-[#1D725E] font-semibold flex items-center gap-1 transition-colors"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#1D725E]" aria-hidden="true" />
                        <span className="text-[11px]">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="text-[11px]">Chép</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-[#727B77]">
                  Mã này dẫn trực tiếp vào chế độ Mang đi. Khách không cần mã phiên bàn.
                </p>
              </div>
            </div>

            {/* Bộ CTA Tải & In */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleDownloadSvg}
                className="h-10 px-3 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[#1D2522] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#35977D]" aria-hidden="true" />
                <span>Tải SVG</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPng}
                className="h-10 px-3 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[#1D2522] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#35977D]" aria-hidden="true" />
                <span>Tải PNG</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="h-10 px-3 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isPrinting ? 'Đang mở in...' : 'In phiếu quầy'}</span>
              </button>
            </div>

            {/* Menu phụ Đổi mã QR quầy */}
            <div className="pt-2 border-t border-[#E9ECEA]">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full py-1.5 flex items-center justify-between text-xs font-semibold text-[#727B77] hover:text-[#1D2522] transition-colors"
              >
                <span>Tùy chọn nâng cao (Đổi mã QR mang đi)</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    showAdvanced ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {showAdvanced && (
                <div className="mt-2 p-3 bg-[#FEF3F2]/50 border border-[#FECDCA] rounded-2xl space-y-2.5">
                  <p className="text-[11px] text-[#B42318]">
                    Đổi mã QR sẽ làm mất hiệu lực của toàn bộ phiếu in quầy trước đó.
                  </p>

                  {!showRotateConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowRotateConfirm(true)}
                      className="w-full h-8 px-3 rounded-xl border border-[#FECDCA] bg-white hover:bg-[#FEF3F2] text-[#B42318] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Đổi mã QR mang đi</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-[#FDA29B] space-y-2">
                      <p className="text-xs font-bold text-[#912018]">
                        Bạn chắc chắn muốn đổi mã QR quầy?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowRotateConfirm(false)}
                          disabled={isRotating}
                          className="flex-1 h-8 px-2 rounded-lg border border-[#E9ECEA] bg-[#F7F8F7] text-xs font-semibold text-[#1D2522]"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={handleRotateTakeawayQr}
                          disabled={isRotating}
                          className="flex-1 h-8 px-2 rounded-lg bg-[#B42318] hover:bg-[#912018] text-white text-xs font-bold flex items-center justify-center gap-1"
                        >
                          {isRotating ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                              <span>Đang đổi...</span>
                            </>
                          ) : (
                            <span>Xác nhận</span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
