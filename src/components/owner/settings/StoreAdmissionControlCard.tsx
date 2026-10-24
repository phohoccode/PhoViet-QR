"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  UtensilsCrossed,
  ShoppingBag,
  CheckCircle2,
  PauseCircle,
  Loader2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import type { OrderAdmissionType } from "../../shared/admission-types";
import type {
  OrderingSettingsView,
  PatchOrderingSettingsInput,
} from "@contracts";
import {
  fetchOrderingSettings,
  patchOrderingSettings,
  MenuApiError,
} from "@/features/owner/api-client";

export interface StoreAdmissionControlCardProps {
  masterAccepting?: boolean;
  dineInAccepting?: boolean;
  takeawayAccepting?: boolean;
  initialVersion?: number;
  onToggleAdmission?: (
    type: OrderAdmissionType | "master",
    accepting: boolean,
  ) => Promise<boolean>;
  className?: string;
}

interface UncertainCommand {
  requestId: string;
  expectedVersion: number;
  acceptingOrders?: boolean;
  acceptDineIn?: boolean;
  acceptTakeaway?: boolean;
  type: OrderAdmissionType | "master";
  targetState: boolean;
}

const generateRequestId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * StoreAdmissionControlCard — Điều khiển trạng thái tiếp nhận đơn hàng quán (Phase 6 — G02 / Codex P6-C02 Handoff).
 * - Phân định độc lập giữa "Tại bàn (Dine-in)" và "Mang đi (Takeaway)".
 * - Tuân thủ tính khả dụng thực tế (Effective availability): availability[].acceptingOrders = masterGate AND typeFlag.
 * - Hiển thị tường minh trạng thái Master Gate (công tắc nhận đơn tổng).
 * - Lưu giữ nguyên vẹn requestId & payload của request chưa chắc chắn (Uncertain mutation) để hỗ trợ Replay an toàn (chống trùng lặp).
 * - Tự động tải lại version mới nhất khi gặp xung đột phiên bản (INVALID_STATE_TRANSITION - 409).
 * - Tuyệt đối chờ server xác nhận thành công trước khi chuyển trạng thái (chống lạc quan giả).
 */
export const StoreAdmissionControlCard: React.FC<
  StoreAdmissionControlCardProps
> = ({
  masterAccepting = true,
  dineInAccepting = true,
  takeawayAccepting = true,
  initialVersion = 1,
  onToggleAdmission,
  className = "",
}) => {
  const [masterGate, setMasterGate] = useState<boolean>(masterAccepting);
  const [rawDineIn, setRawDineIn] = useState<boolean>(dineInAccepting);
  const [rawTakeaway, setRawTakeaway] = useState<boolean>(takeawayAccepting);
  const [version, setVersion] = useState<number>(initialVersion);
  const [pendingType, setPendingType] = useState<
    OrderAdmissionType | "master" | null
  >(null);

  // Lưu trữ command chưa chắc chắn để Retry bằng đúng requestId ban đầu
  const [uncertainCommand, setUncertainCommand] =
    useState<UncertainCommand | null>(null);

  const [statusFeedback, setStatusFeedback] = useState<{
    text: string;
    type: "success" | "error" | "warning" | "info";
    canRetry?: boolean;
  } | null>(null);

  // Tính toán trạng thái thực tế (Effective availability)
  const isDineInOpen = masterGate && rawDineIn;
  const isTakeawayOpen = masterGate && rawTakeaway;

  const syncSettings = useCallback((settings: OrderingSettingsView) => {
    if (typeof settings.version === "number") {
      setVersion(settings.version);
    }
    if (typeof settings.acceptingOrders === "boolean") {
      setMasterGate(settings.acceptingOrders);
    }
    if (typeof settings.acceptDineIn === "boolean") {
      setRawDineIn(settings.acceptDineIn);
    }
    if (typeof settings.acceptTakeaway === "boolean") {
      setRawTakeaway(settings.acceptTakeaway);
    }
  }, []);

  // Tải trạng thái và version đồng bộ mới nhất từ server khi hiển thị
  useEffect(() => {
    let cancelled = false;
    fetchOrderingSettings()
      .then((settings) => {
        if (!cancelled && settings) {
          syncSettings(settings);
        }
      })
      .catch(() => {
        // Giữ nguyên props ban đầu nếu fetch gặp sự cố mạng tạm thời
      });
    return () => {
      cancelled = true;
    };
  }, [syncSettings]);

  // Xử lý bật/tắt từng kênh (Dine-in / Takeaway)
  const handleToggleChannel = async (
    type: OrderAdmissionType,
    targetState: boolean,
    isRetry = false,
  ) => {
    if (pendingType) return;
    setPendingType(type);
    setStatusFeedback(null);

    // Requirement 2: Giữ nguyên requestId & body nếu là retry của uncertain command
    let cmd: UncertainCommand;
    if (
      isRetry &&
      uncertainCommand &&
      uncertainCommand.type === type &&
      uncertainCommand.targetState === targetState
    ) {
      cmd = uncertainCommand;
    } else {
      cmd = {
        requestId: generateRequestId(),
        expectedVersion: version || 1,
        type,
        targetState,
        ...(type === "dine_in"
          ? { acceptDineIn: targetState }
          : { acceptTakeaway: targetState }),
        // Nếu master gate đang tắt và chủ quán muốn mở lại kênh này, tự động bật master gate
        ...(targetState === true && !masterGate
          ? { acceptingOrders: true }
          : {}),
      };
    }

    try {
      if (onToggleAdmission) {
        const success = await onToggleAdmission(type, targetState);
        if (success) {
          setUncertainCommand(null);
          if (type === "dine_in") setRawDineIn(targetState);
          if (type === "takeaway") setRawTakeaway(targetState);
          if (targetState && !masterGate) setMasterGate(true);
          setStatusFeedback({
            type: "success",
            text: targetState
              ? `Đã mở nhận đơn ${type === "dine_in" ? "tại bàn" : "mang đi"}.`
              : `Đã tạm dừng nhận đơn ${type === "dine_in" ? "tại bàn" : "mang đi"}.`,
          });
        } else {
          setStatusFeedback({
            type: "error",
            text: "Không thể thay đổi trạng thái nhận đơn từ máy chủ.",
          });
        }
      } else {
        const payload: PatchOrderingSettingsInput = {
          requestId: cmd.requestId,
          expectedVersion: cmd.expectedVersion,
          ...(cmd.acceptingOrders !== undefined
            ? { acceptingOrders: cmd.acceptingOrders }
            : {}),
          ...(cmd.acceptDineIn !== undefined
            ? { acceptDineIn: cmd.acceptDineIn }
            : {}),
          ...(cmd.acceptTakeaway !== undefined
            ? { acceptTakeaway: cmd.acceptTakeaway }
            : {}),
        };

        const result = await patchOrderingSettings(payload);

        // THÀNH CÔNG: Xóa command uncertain và đồng bộ state mới từ server
        setUncertainCommand(null);
        syncSettings(result);
        setStatusFeedback({
          type: "success",
          text: targetState
            ? `Đã mở nhận đơn ${type === "dine_in" ? "tại bàn" : "mang đi"}.`
            : `Đã tạm dừng nhận đơn ${type === "dine_in" ? "tại bàn" : "mang đi"}.`,
        });
      }
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.status === 429) {
          // Bị giới hạn tần suất -> lưu cmd để chủ quán thử lại sau khoảng thời gian này
          setUncertainCommand(cmd);
          setStatusFeedback({
            type: "error",
            text: `Thao tác quá nhanh. Vui lòng thử lại sau ${err.retryAfterSeconds || 60} giây.`,
            canRetry: true,
          });
        } else if (
          err.error?.code === "INVALID_STATE_TRANSITION" ||
          err.status === 409
        ) {
          // Xung đột phiên bản dữ liệu -> xóa cmd cũ và tải lại phiên bản mới nhất
          setUncertainCommand(null);
          try {
            const fresh = await fetchOrderingSettings();
            syncSettings(fresh);
          } catch {
            // bỏ qua lỗi fetch lại
          }
          setStatusFeedback({
            type: "error",
            text: "Cài đặt quán vừa được cập nhật ở nơi khác. Đã tải lại dữ liệu mới nhất, vui lòng thử lại.",
          });
        } else if (err.status >= 500 || err.error?.code === "INTERNAL_ERROR") {
          // 5xx / Lỗi máy chủ -> UNCERTAIN: lưu cmd và cho phép retry với cùng requestId
          setUncertainCommand(cmd);
          setStatusFeedback({
            type: "warning",
            text: 'Máy chủ phản hồi chậm hoặc gián đoạn kết nối. Chưa rõ trạng thái đã được lưu hay chưa. Bấm "Thử lại" để kiểm tra lại bằng đúng mã yêu cầu.',
            canRetry: true,
          });
        } else {
          setUncertainCommand(null);
          setStatusFeedback({
            type: "error",
            text:
              err.message ||
              "Không thể thay đổi trạng thái nhận đơn từ máy chủ.",
          });
        }
      } else {
        // Lỗi mạng client (TypeError: Failed to fetch) -> UNCERTAIN
        setUncertainCommand(cmd);
        setStatusFeedback({
          type: "warning",
          text: 'Lỗi mạng khi cập nhật trạng thái nhận đơn. Bấm "Thử lại" để tiếp tục yêu cầu với đúng mã ban đầu.',
          canRetry: true,
        });
      }
    } finally {
      setPendingType(null);
    }
  };

  // Xử lý bật/tắt công tắc nhận đơn tổng (Master Gate)
  const handleToggleMaster = async (targetState: boolean, isRetry = false) => {
    if (pendingType) return;
    setPendingType("master");
    setStatusFeedback(null);

    let cmd: UncertainCommand;
    if (
      isRetry &&
      uncertainCommand &&
      uncertainCommand.type === "master" &&
      uncertainCommand.targetState === targetState
    ) {
      cmd = uncertainCommand;
    } else {
      cmd = {
        requestId: generateRequestId(),
        expectedVersion: version || 1,
        type: "master",
        targetState,
        acceptingOrders: targetState,
      };
    }

    try {
      if (onToggleAdmission) {
        const success = await onToggleAdmission("master", targetState);
        if (success) {
          setUncertainCommand(null);
          setMasterGate(targetState);
          setStatusFeedback({
            type: "success",
            text: targetState
              ? "Đã bật công tắc nhận đơn tổng của quán."
              : "Đã tạm dừng công tắc nhận đơn tổng (toàn bộ quán ngưng nhận đơn).",
          });
        }
      } else {
        const result = await patchOrderingSettings({
          requestId: cmd.requestId,
          expectedVersion: cmd.expectedVersion,
          acceptingOrders: targetState,
        });
        setUncertainCommand(null);
        syncSettings(result);
        setStatusFeedback({
          type: "success",
          text: targetState
            ? "Đã bật công tắc nhận đơn tổng của quán."
            : "Đã tạm dừng công tắc nhận đơn tổng (toàn bộ quán ngưng nhận đơn).",
        });
      }
    } catch (err: unknown) {
      if (
        err instanceof MenuApiError &&
        (err.status >= 500 || err.error?.code === "INTERNAL_ERROR")
      ) {
        setUncertainCommand(cmd);
        setStatusFeedback({
          type: "warning",
          text: 'Máy chủ phản hồi chậm khi cập nhật công tắc tổng. Bấm "Thử lại" để gửi lại yêu cầu.',
          canRetry: true,
        });
      } else if (err instanceof MenuApiError && err.status === 409) {
        setUncertainCommand(null);
        try {
          const fresh = await fetchOrderingSettings();
          syncSettings(fresh);
        } catch {
          // ignore
        }
        setStatusFeedback({
          type: "error",
          text: "Phiên bản cài đặt đã thay đổi. Đã tải lại dữ liệu mới nhất.",
        });
      } else {
        setStatusFeedback({
          type: "error",
          text: "Không thể cập nhật công tắc nhận đơn tổng.",
        });
      }
    } finally {
      setPendingType(null);
    }
  };

  return (
    <section
      className={`p-5 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs space-y-4 ${className}`}
    >
      {/* HEADER & MASTER GATE STATUS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-[#1D2522]">
              Tiếp nhận đơn hàng quán (Admission Control)
            </h4>
          </div>
          <p className="text-xs text-[#727B77] mt-0.5 leading-relaxed">
            Tạm dừng hoặc mở nhận đơn độc lập giữa khách dùng tại bàn và mua
            mang đi khi quán đông.
          </p>
        </div>

        {/* Nút Master Gate công tắc nhận đơn tổng */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-[#FAFBFB] px-2.5 py-1.5 rounded-xl border border-[#E9ECEA]">
          <span className="text-[11px] font-medium text-[#727B77] whitespace-nowrap">
            Trạng thái quán:
          </span>
          <button
            type="button"
            disabled={pendingType === "master"}
            onClick={() => handleToggleMaster(!masterGate)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-50 ${
              masterGate
                ? "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6] hover:bg-[#D1FADF]"
                : "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA] hover:bg-[#FEE4E2]"
            }`}
            title={
              masterGate
                ? "Bấm để tạm dừng toàn bộ quán"
                : "Bấm để mở lại công tắc nhận đơn quán"
            }
          >
            {pendingType === "master" ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  masterGate ? "bg-[#12B76A]" : "bg-[#F04438]"
                }`}
              />
            )}
            <span className="whitespace-nowrap">
              {masterGate ? "Đang nhận đơn" : "Tạm ngừng nhận đơn"}
            </span>
          </button>
        </div>
      </div>

      {/* CẢNH BÁO KHI MASTER GATE ĐANG TẮT */}
      {!masterGate && (
        <div
          role="status"
          className="p-3 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] text-xs text-[#8A4D00] flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-[#B54708] shrink-0 mt-0.5" />

          <div className="flex-1 leading-relaxed">
            <span className="font-bold text-[#B54708]">
              Quán đang tạm ngừng nhận đơn.{" "}
            </span>
            <span>
              Cả hai hình thức Tại bàn và Mang đi đều đang tạm dừng. Bật lại một
              trong hai hình thức để tiếp tục nhận đơn.
            </span>
          </div>
        </div>
      )}

      {/* THÔNG BÁO PHẢN HỒI KÈM NÚT RETRY CHO UNCERTAIN MUTATIONS */}
      {statusFeedback && (
        <div
          role="status"
          aria-live="polite"
          className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 ${
            statusFeedback.type === "success"
              ? "bg-[#ECFDF3] border-[#ABEFC6] text-[#027A48]"
              : statusFeedback.type === "error"
                ? "bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]"
                : statusFeedback.type === "warning"
                  ? "bg-[#FEF6EE] border-[#F9DBAF] text-[#8A4D00]"
                  : "bg-[#F0F9FF] border-[#B9E6FE] text-[#026AA2]"
          }`}
        >
          <div className="flex items-center gap-2 flex-1">
            {statusFeedback.type === "success" && (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#12B76A]" />
            )}
            {statusFeedback.type === "error" && (
              <AlertCircle className="w-4 h-4 shrink-0 text-[#D92D20]" />
            )}
            {statusFeedback.type === "warning" && (
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#B54708]" />
            )}
            <span>{statusFeedback.text}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {statusFeedback.canRetry && uncertainCommand && (
              <button
                type="button"
                onClick={() => {
                  if (uncertainCommand.type === "master") {
                    handleToggleMaster(uncertainCommand.targetState, true);
                  } else {
                    handleToggleChannel(
                      uncertainCommand.type,
                      uncertainCommand.targetState,
                      true,
                    );
                  }
                }}
                className="h-7 px-2.5 rounded-lg bg-[#B54708] hover:bg-[#8A4D00] text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Thử lại</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStatusFeedback(null);
                setUncertainCommand(null);
              }}
              className="text-[11px] font-bold underline px-1 py-0.5"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* 2 KÊNH TIẾP NHẬN ĐƠN ĐỘC LẬP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
        {/* 1. KÊNH TẠI BÀN (DINE-IN) */}
        <div className="p-4 rounded-xl border border-[#E9ECEA] bg-[#FAFBFB] flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center">
                <UtensilsCrossed className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1D2522]">Dùng tại bàn</p>
                <p className="text-[11px] text-[#727B77]">QR cố định gắn bàn</p>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                isDineInOpen
                  ? "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]"
                  : "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isDineInOpen ? "bg-[#12B76A]" : "bg-[#F04438]"
                }`}
              />
              <span>{isDineInOpen ? "Đang nhận đơn" : "Đã tạm dừng"}</span>
            </span>
          </div>

          <div className="pt-2 border-t border-[#E9ECEA] flex items-center justify-between">
            <span className="text-[11px] text-[#55605C]">
              {isDineInOpen
                ? "Khách tại bàn có thể đặt món"
                : !masterGate && rawDineIn
                  ? "Tạm dừng (do công tắc tổng đang tắt)"
                  : "Khách chỉ có thể xem menu"}
            </span>

            <button
              type="button"
              disabled={pendingType === "dine_in"}
              onClick={() => handleToggleChannel("dine_in", !isDineInOpen)}
              className={`h-9 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E] disabled:opacity-50 ${
                isDineInOpen
                  ? "bg-[#FEF3F2] text-[#B42318] hover:bg-[#FEE4E2] border border-[#FECDCA]"
                  : "bg-[#1D725E] text-white hover:bg-[#165B4B]"
              }`}
              aria-label={
                isDineInOpen
                  ? "Tạm dừng nhận đơn tại bàn"
                  : "Mở lại nhận đơn tại bàn"
              }
            >
              {pendingType === "dine_in" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isDineInOpen ? (
                <PauseCircle className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>{isDineInOpen ? "Tạm dừng" : "Mở lại"}</span>
            </button>
          </div>
        </div>

        {/* 2. KÊNH MANG ĐI (TAKEAWAY) */}
        <div className="p-4 rounded-xl border border-[#E9ECEA] bg-[#FAFBFB] flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F0F9FF] text-[#026AA2] flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1D2522]">Mua mang đi</p>
                <p className="text-[11px] text-[#727B77]">
                  QR quầy thanh toán VietQR
                </p>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                isTakeawayOpen
                  ? "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]"
                  : "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isTakeawayOpen ? "bg-[#12B76A]" : "bg-[#F04438]"
                }`}
              />
              <span>{isTakeawayOpen ? "Đang nhận đơn" : "Đã tạm dừng"}</span>
            </span>
          </div>

          <div className="pt-2 border-t border-[#E9ECEA] flex items-center justify-between">
            <span className="text-[11px] text-[#55605C]">
              {isTakeawayOpen
                ? "Khách có thể tạo mã VietQR"
                : !masterGate && rawTakeaway
                  ? "Tạm dừng (do công tắc tổng đang tắt)"
                  : "Khách chỉ có thể xem menu"}
            </span>

            <button
              type="button"
              disabled={pendingType === "takeaway"}
              onClick={() => handleToggleChannel("takeaway", !isTakeawayOpen)}
              className={`h-9 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#026AA2] disabled:opacity-50 ${
                isTakeawayOpen
                  ? "bg-[#FEF3F2] text-[#B42318] hover:bg-[#FEE4E2] border border-[#FECDCA]"
                  : "bg-[#026AA2] text-white hover:bg-[#025684]"
              }`}
              aria-label={
                isTakeawayOpen
                  ? "Tạm dừng nhận đơn mang đi"
                  : "Mở lại nhận đơn mang đi"
              }
            >
              {pendingType === "takeaway" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isTakeawayOpen ? (
                <PauseCircle className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>{isTakeawayOpen ? "Tạm dừng" : "Mở lại"}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
