'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  QrCode,
  X,
  ExternalLink,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import type {
  OwnerSessionOpenedView,
  TableSummary,
  QRCodeView,
} from '../../../docs/contracts/types';

interface TableSessionOpenedDialogProps {
  openedView: OwnerSessionOpenedView;
  qrCode?: QRCodeView | null;
  onClose: () => void;
}

/**
 * TableSessionOpenedDialog — Hộp thoại thông báo kết quả mở phiên bàn từ phản hồi private (R12).
 * Tuân thủ tuyệt đối quy định bảo mật:
 * - Chỉ hiển thị sessionCode từ private command result (POST /api/owner/tables/:id/sessions).
 * - Không lưu plaintext sessionCode vào state lâu dài hay localStorage.
 * - Cảnh báo rõ ràng cho chủ quán rằng mã không được lưu hay cấp lại sau khi đóng.
 */
export const TableSessionOpenedDialog: React.FC<TableSessionOpenedDialogProps> = ({
  openedView,
  qrCode,
  onClose,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedQrLink, setCopiedQrLink] = useState(false);

  const sessionCode = openedView.sessionCredential.sessionCode;
  const qrUrl = qrCode
    ? typeof window !== 'undefined'
      ? `${window.location.origin}${qrCode.path}`
      : qrCode.path
    : null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(sessionCode);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opened-dialog-title"
    >
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E9ECEA] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
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
              <p className="text-xs text-[#1D725E]/80">Phiên bàn mới đã sẵn sàng nhận đơn</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#1D725E] hover:bg-[#C6E7DC]/50 transition-colors"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Nội dung thông báo mã phiên private */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Hộp mã phiên bàn nổi bật */}
          <div className="p-4 rounded-2xl bg-[#F7F8F7] border-2 border-dashed border-[#35977D] text-center">
            <span className="text-[11px] font-bold text-[#1D725E] uppercase tracking-wider block mb-1">
              Mã xác nhận phiên bàn (Session Code)
            </span>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-[#1D2522] tracking-widest my-2 select-all">
              {sessionCode}
            </div>
            <p className="text-xs text-[#727B77] mb-3">
              Cung cấp mã này cho khách ngồi tại bàn để xác minh và bắt đầu gọi món.
            </p>
            <button
              type="button"
              onClick={handleCopyCode}
              className={`h-10 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all shadow-xs ${
                copiedCode
                  ? 'bg-[#1D725E] text-white'
                  : 'bg-white border border-[#E9ECEA] hover:border-[#35977D] text-[#1D2522]'
              }`}
            >
              {copiedCode ? (
                <>
                  <Check className="w-4 h-4 text-white" aria-hidden="true" />
                  <span>Đã sao chép mã!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#727B77]" aria-hidden="true" />
                  <span>Sao chép mã phiên</span>
                </>
              )}
            </button>
          </div>

          {/* Đường dẫn mã QR tương ứng nếu có */}
          {qrCode && (
            <div className="p-3 bg-[#FAFBFB] rounded-xl border border-[#E9ECEA] flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <QrCode className="w-4 h-4 text-[#1D725E] flex-shrink-0" aria-hidden="true" />
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
                  className="p-1 rounded-lg border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[#1D2522] transition-colors"
                  aria-label="Mở trang đặt món của bàn"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
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

          {/* Cảnh báo bảo mật bắt buộc theo handoff P2-C01 */}
          <div
            className="p-3 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] text-xs text-[#912018] flex items-start gap-2.5"
            role="note"
          >
            <AlertTriangle className="w-4 h-4 text-[#B42318] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong className="font-semibold block mb-0.5">Lưu ý bảo mật quan trọng:</strong>
              Mã phiên chỉ hiển thị duy nhất một lần tại thông báo này từ phản hồi riêng tư của máy chủ.
              Hệ thống không lưu trữ dạng văn bản thuần và không thể hiển thị lại mã sau khi đóng.
            </p>
          </div>
        </div>

        {/* Nút hoàn tất */}
        <div className="p-4 bg-[#F7F8F7] border-t border-[#E9ECEA] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto h-11 px-6 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            Đã ghi nhận mã / Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

interface TableDetailDialogProps {
  table: TableSummary;
  qrCode?: QRCodeView | null;
  onClose: () => void;
}

/**
 * TableDetailDialog — Xem chi tiết phiên bàn đang phục vụ (Occupied table).
 * Không hiển thị lại plaintext sessionCode (tuân thủ contract R11).
 */
export const TableDetailDialog: React.FC<TableDetailDialogProps> = ({
  table,
  qrCode,
  onClose,
}) => {
  const session = table.session;

  const openedAtDate = session ? new Date(session.openedAt) : null;
  const formattedOpenedAt =
    openedAtDate && !isNaN(openedAtDate.getTime())
      ? `${openedAtDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày ${openedAtDate.toLocaleDateString('vi-VN')}`
      : session?.openedAt || '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-detail-title"
    >
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E9ECEA] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
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
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#727B77] hover:bg-[#F7F8F7] transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Nội dung chi tiết */}
        <div className="p-5 space-y-4">
          {session ? (
            <>
              {/* Thẻ trạng thái phiên */}
              <div className="p-4 bg-[#E8F4F0]/60 rounded-2xl border border-[#C6E7DC] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1D725E]">Trạng thái phiên</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      session.status === 'checkout_pending'
                        ? 'bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]'
                        : 'bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]'
                    }`}
                  >
                    {session.status === 'checkout_pending' ? 'Chờ thanh toán' : 'Đang phục vụ'}
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

              {/* Thông báo bảo mật mã phiên */}
              <div className="p-3 bg-[#F7F8F7] rounded-xl border border-[#E9ECEA] flex items-start gap-2.5 text-xs text-[#727B77]">
                <ShieldCheck className="w-4 h-4 text-[#35977D] flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="leading-relaxed">
                  Mã xác minh phiên bàn đã được cung cấp cho khách khi mở bàn. Hệ thống bảo mật
                  không lưu văn bản thuần của mã trong cơ sở dữ liệu.
                </p>
              </div>
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
                <span>Xem QR</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#F7F8F7] border-t border-[#E9ECEA] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D2522] transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
