import React, { useState, useRef, useEffect, useCallback } from "react";
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
} from "lucide-react";
import type { OwnerQrCode } from "@/types/contracts/table-qr";
import {
  fetchOwnerQrCodes,
  writeOwnerQrCode,
  rotateOwnerQrCode,
  MenuApiError,
} from "@/features/owner/api-client";
import { QrCodeView } from "../qr/QrCodeView";
import { PrintQrVoucher } from "../qr/PrintQrVoucher";
import { TakeawayQrSkeleton } from "../OwnerTabSkeletons";
import {
  generateQrMatrix,
  matrixToSvg,
  downloadSvgString,
  downloadPngFromMatrix,
} from "@/lib/qr/qr-code";

export interface TakeawayQrCardProps {
  storeName?: string;
  initialQrCode?: OwnerQrCode | null;
  onQrUpdated?: (qr: OwnerQrCode) => void;
}

/**
 * TakeawayQrCard — Thẻ quản lý mã QR Mua mang đi tại quầy trong tab Cài đặt.
 * - Render QR từ publicUrl thật do server trả về (/q/[code]). Không dùng URL giả.
 * - Hỗ trợ Tải SVG/PNG, In phiếu A6/A7, Sao chép link.
 * - Tự động tải mã QR mang đi active từ máy chủ khi vào tab Cài đặt.
 * - Giữ nguyên requestId qua các lần retry để hỗ trợ replay idempotency an toàn (UI-02).
 * - Tạo mới QR quầy qua POST /api/owner/qr-codes với type: 'takeaway', tableId: null.
 * - Đổi mã QR quầy an toàn qua POST /api/owner/qr-codes/:id/rotate với confirm: true và expectedUpdatedAt.
 */
export const TakeawayQrCard: React.FC<TakeawayQrCardProps> = ({
  storeName = "PHỞ VIỆT QR",
  initialQrCode,
  onQrUpdated,
}) => {
  // Lọc chỉ nhận initialQrCode nếu nó thực sự active và chưa thu hồi
  const cleanInitialQr =
    initialQrCode && initialQrCode.active && !initialQrCode.retiredAt
      ? initialQrCode
      : null;

  const [overrideQr, setOverrideQr] = useState<OwnerQrCode | null>(null);
  const currentQr: OwnerQrCode | null = overrideQr ?? cleanInitialQr ?? null;
  const [isLoadingQr, setIsLoadingQr] = useState<boolean>(!cleanInitialQr);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [justRotated, setJustRotated] = useState(false);

  // Idempotent Request IDs: giữ nguyên command requestId qua retry / timeout (UI-02)
  const createRequestIdRef = useRef<string | null>(null);
  const rotateRequestIdRef = useRef<string | null>(null);

  // Tải danh sách QR codes từ server để chọn đúng mã active và chưa retired (UI-01)
  const loadTakeawayQr = useCallback(async () => {
    setIsLoadingQr(true);
    setErrorMessage(null);
    try {
      const qrs = await fetchOwnerQrCodes();
      const activeTakeaway = qrs.find(
        (q) =>
          q.type === "takeaway" &&
          q.active &&
          (q.retiredAt === null || q.retiredAt === undefined),
      );
      if (activeTakeaway) {
        setOverrideQr(activeTakeaway);
        onQrUpdated?.(activeTakeaway);
      } else {
        setOverrideQr(null);
      }
    } catch {
      setErrorMessage("Không thể tải thông tin mã QR mang đi từ máy chủ.");
    } finally {
      setIsLoadingQr(false);
    }
  }, [onQrUpdated]);

  useEffect(() => {
    if (cleanInitialQr) return;

    let cancelled = false;
    void (async () => {
      try {
        const qrs = await fetchOwnerQrCodes();
        if (cancelled) return;
        const activeTakeaway = qrs.find(
          (q) =>
            q.type === "takeaway" &&
            q.active &&
            (q.retiredAt === null || q.retiredAt === undefined),
        );
        if (activeTakeaway) {
          setOverrideQr(activeTakeaway);
          onQrUpdated?.(activeTakeaway);
        } else {
          setOverrideQr(null);
        }
      } catch {
        if (!cancelled) {
          setErrorMessage("Không thể tải thông tin mã QR mang đi từ máy chủ.");
        }
      } finally {
        setIsLoadingQr(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cleanInitialQr, onQrUpdated]);

  // UI-03: Chỉ coi là valid khi có publicUrl thật do máy chủ cấp và đang active
  const isValidPublicUrl = Boolean(
    currentQr &&
    currentQr.publicUrl &&
    currentQr.active &&
    !currentQr.retiredAt,
  );
  const fullPublicUrl = isValidPublicUrl ? currentQr!.publicUrl : "";
  const filenameBase = "QR_Mang_Di_Tai_Quay";

  // Sao chép link (chỉ thực hiện khi có URL server hợp lệ)
  const handleCopyLink = async () => {
    if (!isValidPublicUrl) return;
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
    if (!isValidPublicUrl) return;
    try {
      const matrix = generateQrMatrix(fullPublicUrl);
      const svg = matrixToSvg(matrix, {
        margin: 4,
        size: 512,
        fgColor: "#1D2522",
        bgColor: "#FFFFFF",
      });
      downloadSvgString(svg, filenameBase);
    } catch {
      // Fallback
    }
  };

  // Tải PNG
  const handleDownloadPng = async () => {
    if (!isValidPublicUrl) return;
    try {
      const matrix = generateQrMatrix(fullPublicUrl);
      await downloadPngFromMatrix(matrix, filenameBase, 1024, 4);
    } catch {
      // Fallback
    }
  };

  // In phiếu QR
  const handlePrint = () => {
    if (!isValidPublicUrl) return;
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
    if (!createRequestIdRef.current) {
      createRequestIdRef.current = crypto.randomUUID();
    }
    const requestId = createRequestIdRef.current;

    try {
      const createdQr = await writeOwnerQrCode({
        action: "create",
        type: "takeaway",
        tableId: null,
        requestId,
      });

      // Thành công -> xóa requestId chờ
      createRequestIdRef.current = null;
      setOverrideQr(createdQr);
      onQrUpdated?.(createdQr);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.error.details?.field === "activeQr") {
          // Quán đã có active QR -> refetch để đồng bộ ngay (UI-01)
          createRequestIdRef.current = null;
          await loadTakeawayQr();
          setErrorMessage(
            "Quán đã có mã QR mang đi đang hoạt động. Đã đồng bộ mã mới nhất.",
          );
          return;
        }
        setErrorMessage(err.error.message || "Không thể tạo mã QR mang đi.");
      } else {
        setErrorMessage(
          "Lỗi mạng khi tạo mã QR mang đi. Vui lòng bấm thử lại.",
        );
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Đổi mã QR mang đi qua POST /api/owner/qr-codes/:id/rotate
  const handleRotateTakeawayQr = async () => {
    if (!currentQr?.id) {
      setErrorMessage("Chưa có mã QR mang đi để thực hiện đổi mã.");
      return;
    }

    setIsRotating(true);
    setErrorMessage(null);
    if (!rotateRequestIdRef.current) {
      rotateRequestIdRef.current = crypto.randomUUID();
    }
    const requestId = rotateRequestIdRef.current;

    try {
      const newQr = await rotateOwnerQrCode(currentQr.id, {
        expectedUpdatedAt: currentQr.updatedAt,
        confirm: true,
        requestId,
      });

      // Thành công -> xóa requestId chờ
      rotateRequestIdRef.current = null;
      setOverrideQr(newQr);
      setJustRotated(true);
      setShowRotateConfirm(false);
      onQrUpdated?.(newQr);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        const field = err.error.details?.field;
        if (field === "expectedUpdatedAt") {
          rotateRequestIdRef.current = null;
          setErrorMessage(
            "Mã QR quầy đã bị cập nhật bởi thao tác khác. Đang làm mới dữ liệu...",
          );
          await loadTakeawayQr();
        } else if (field === "rotation" || field === "retiredQr") {
          rotateRequestIdRef.current = null;
          setErrorMessage("Mã QR quầy không hợp lệ hoặc đã ngừng hoạt động.");
          await loadTakeawayQr();
        } else {
          setErrorMessage(err.error.message || "Không thể đổi mã QR quầy.");
        }
      } else {
        setErrorMessage(
          "Lỗi mạng khi yêu cầu đổi mã QR quầy. Bấm thử lại để gửi lại yêu cầu.",
        );
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
                    className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      currentQr.active
                        ? "bg-[#E8F4F0] text-[#1D725E] border-[#C6E7DC]"
                        : "bg-[#F1F3F2] text-[#727B77] border-[#E9ECEA]"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        currentQr.active
                          ? "bg-[#1D725E] animate-pulse"
                          : "bg-[#727B77]"
                      }`}
                    />
                    <span className="whitespace-nowrap">{currentQr.active ? "Đang hoạt động" : "Đã vô hiệu"}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[#727B77] mt-0.5">
                Khách quét mã này tại quầy để mở menu và đặt món mang về không
                cần mã phiên bàn.
              </p>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl text-xs text-[#912018] flex items-start gap-2"
          >
            <AlertTriangle
              className="w-4 h-4 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>{errorMessage}</span>
          </div>
        )}

        {justRotated && (
          <div
            role="alert"
            className="p-3 bg-[#E8F4F0] border border-[#C6E7DC] rounded-xl text-xs text-[#165B4B] flex items-start gap-2"
          >
            <RefreshCw
              className="w-4 h-4 shrink-0 text-[#1D725E] mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold">Đã đổi mã QR quầy mới!</p>
              <p className="text-[11px] text-[#165B4B]/80 mt-0.5">
                Hãy in lại phiếu dán tại quầy để khách quét đúng địa chỉ mới
                nhất.
              </p>
            </div>
          </div>
        )}

        {isLoadingQr ? (
          <TakeawayQrSkeleton />
        ) : !currentQr ? (
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
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
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
        ) : !isValidPublicUrl ? (
          /* Trạng thái QR đã bị thu hồi / không hợp lệ */
          <div className="p-6 bg-[#FEF3F2] border border-dashed border-[#FECDCA] rounded-2xl text-center space-y-3">
            <p className="text-xs font-semibold text-[#912018]">
              Mã QR mang đi hiện tại đã ngừng hoạt động hoặc bị thu hồi.
            </p>
            <button
              type="button"
              disabled={isCreating}
              onClick={handleCreateTakeawayQr}
              className="h-10 px-4 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Tạo lại mã QR mang đi</span>
            </button>
          </div>
        ) : (
          /* Trạng thái đã có QR Takeaway hợp lệ */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-[#F7F8F7] rounded-2xl border border-[#E9ECEA] min-w-0 overflow-hidden">
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
              <div className="flex-1 w-full min-w-0 space-y-2">
                <div>
                  <span className="text-[11px] font-bold text-[#1D725E] uppercase tracking-wider">
                    {storeName}
                  </span>
                  <p className="text-xs font-semibold text-[#1D2522]">
                    Điểm quét đặt món Mang đi (Tại quầy)
                  </p>
                </div>

                <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-[#E9ECEA] text-xs min-w-0 overflow-hidden">
                  <span className="font-mono text-[#727B77] truncate select-all flex-1 min-w-0">
                    {fullPublicUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-[#F7F8F7] text-[#1D725E] font-semibold flex items-center gap-1 transition-colors"
                  >
                    {copiedLink ? (
                      <>
                        <Check
                          className="w-3.5 h-3.5 text-[#1D725E]"
                          aria-hidden="true"
                        />
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
                  Mã này dẫn trực tiếp vào chế độ Mang đi. Khách không cần mã
                  phiên bàn.
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
                <Download
                  className="w-3.5 h-3.5 text-[#35977D]"
                  aria-hidden="true"
                />
                <span>Tải SVG</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPng}
                className="h-10 px-3 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-[#1D2522] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download
                  className="w-3.5 h-3.5 text-[#35977D]"
                  aria-hidden="true"
                />
                <span>Tải PNG</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="h-10 px-3 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isPrinting ? "Đang mở in..." : "In phiếu"}</span>
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
                    showAdvanced ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {showAdvanced && (
                <div className="mt-2 p-3 bg-[#FEF3F2]/50 border border-[#FECDCA] rounded-2xl space-y-2.5">
                  <p className="text-[11px] text-[#B42318]">
                    Đổi mã QR sẽ làm mất hiệu lực của toàn bộ phiếu in quầy
                    trước đó.
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
                              <Loader2
                                className="w-3 h-3 animate-spin"
                                aria-hidden="true"
                              />
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
