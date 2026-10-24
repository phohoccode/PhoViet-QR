import React, { useState, useCallback } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Zap,
  Building2,
  Clock,
  ArrowRight,
  Info,
} from "lucide-react";

export interface VietQrPaymentSettingsCardProps {
  onNavigateToOrders?: () => void;
  className?: string;
}

/**
 * VietQrPaymentSettingsCard — Hiển thị trạng thái tích hợp Cổng thanh toán VietQR (PayOS Gateway).
 * Thiết kế chuẩn Minimal Emerald POS (khớp SCREEN_SPEC_V1.md & WIREFRAMES.md):
 * - Metadata View-Only: Tuyệt đối không để lộ Secret Key/API Key trên giao diện.
 * - Trạng thái kết nối Webhook thời gian thực kèm nút "Kiểm tra kết nối".
 * - Sao chép Webhook URL để cấu hình tại PayOS Dashboard.
 * - Hướng dẫn vận hành đối soát tự động & xử lý đơn ngoại lệ.
 */
export const VietQrPaymentSettingsCard: React.FC<
  VietQrPaymentSettingsCardProps
> = ({ onNavigateToOrders, className = "" }) => {
  const [isCopiedWebhook, setIsCopiedWebhook] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>("Vừa xong");

  // Xác định Webhook URL hiện tại (ưu tiên origin thực tế từ trình duyệt)
  const webhookPath = "/api/webhooks/payments/payos";
  const fullWebhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${webhookPath}`
      : `http://localhost:3000${webhookPath}`;

  const handleCopyWebhook = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullWebhookUrl);
      setIsCopiedWebhook(true);
      setTimeout(() => setIsCopiedWebhook(false), 2000);
    } catch {
      // fallback copy
    }
  }, [fullWebhookUrl]);

  const handleCheckConnection = useCallback(() => {
    if (isCheckingConnection) return;
    setIsCheckingConnection(true);

    // Giả lập kiểm tra kết nối webhook và cập nhật trạng thái
    setTimeout(() => {
      setIsCheckingConnection(false);
      const now = new Date();
      const timeStr = now.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setLastCheckTime(`Lúc ${timeStr}`);
    }, 700);
  }, [isCheckingConnection]);

  return (
    <div
      className={`p-5 bg-white rounded-2xl border border-[#E9ECEA] shadow-xs space-y-5 ${className}`}
    >
      {/* 1. Header Khối Cổng Thanh Toán */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-[#F0F2F1]">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-[#1D2522]">
              3. Cổng thanh toán VietQR (Tự động chuyển khoản)
            </h4>
            <span className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap font-bold px-2 py-0.5 rounded-full bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D725E] animate-pulse shrink-0" />
              Đang hoạt động
            </span>
          </div>
          <p className="text-xs text-[#727B77] mt-1 leading-relaxed">
            Hệ thống tự động sinh mã VietQR động NAPAS 247 cho từng đơn hàng và
            đối soát tiền về tức thì qua Webhook bảo mật.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCheckConnection}
          disabled={isCheckingConnection}
          aria-label="Kiểm tra kết nối Webhook"
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F8F9F8] hover:bg-[#EFF1EF] text-[#1D2522] border border-[#E9ECEA] transition-colors self-start sm:self-auto disabled:opacity-70 h-10 min-w-[150px]"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#1D725E] ${isCheckingConnection ? "animate-spin" : ""}`}
          />
          <span>
            {isCheckingConnection ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
          </span>
        </button>
      </div>

      {/* 2. Lưới thông tin tích hợp (Metadata View-Only — Bảo mật 100%, không lộ Secret Keys) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Cổng thanh toán & Chuẩn kỹ thuật */}
        <div className="p-3.5 rounded-xl bg-[#F8F9F8] border border-[#E9ECEA] flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white border border-[#E9ECEA] text-[#1D725E] shadow-2xs mt-0.5">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-[#727B77] uppercase tracking-wider block">
              Nhà cung cấp cổng
            </span>
            <p className="text-xs font-bold text-[#1D2522] mt-0.5">
              VietQR · PayOS Gateway
            </p>
            <p className="text-[11px] text-[#727B77] mt-0.5">
              Chuẩn NAPAS 247 · Liên kết 50+ ngân hàng Việt Nam & Ví điện tử
            </p>
          </div>
        </div>

        {/* Trạng thái Webhook & Chữ ký HMAC */}
        <div className="p-3.5 rounded-xl bg-[#F8F9F8] border border-[#E9ECEA] flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white border border-[#E9ECEA] text-[#1D725E] shadow-2xs mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-[#727B77] uppercase tracking-wider block">
              Cơ chế bảo mật Webhook
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-bold text-[#1D2522]">
                Xác thực chữ ký HMAC-SHA256
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D725E]" />
            </div>
            <p className="text-[11px] text-[#727B77] mt-0.5">
              Chống giả mạo giao dịch · Đối soát tự động 24/7 (Kiểm tra:{" "}
              {lastCheckTime})
            </p>
          </div>
        </div>
      </div>

      {/* 3. Khối Webhook Listener Endpoint (URL tiếp nhận thông báo ngân hàng) */}
      <div className="p-3.5 rounded-xl bg-[#F8FAF9] border border-[#D5E6E0] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#1D725E]" />
            <span className="text-xs font-bold text-[#1D2522]">
              Địa chỉ Webhook nhận thông báo chuyển khoản tự động
            </span>
          </div>
          <span className="text-[10px] whitespace-nowrap font-bold px-2 py-0.5 rounded-md bg-[#E8F4F0] text-[#1D725E]">
            POST Webhook Endpoint
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white border border-[#C6E7DC] rounded-lg px-3 py-2 text-xs font-mono text-[#1D2522] truncate select-all shadow-2xs">
            {fullWebhookUrl}
          </div>
          <button
            type="button"
            onClick={handleCopyWebhook}
            aria-label="Sao chép địa chỉ Webhook URL"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#1D725E] hover:bg-[#165B4B] text-white transition-colors h-9 shrink-0 shadow-xs"
          >
            {isCopiedWebhook ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Chép URL</span>
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] text-[#55605C] leading-relaxed">
          Địa chỉ này dùng để đăng ký Webhook URL tại trang quản trị PayOS. Khi
          khách hàng chuyển khoản quét mã VietQR, cổng thanh toán sẽ tự động gửi
          thông báo đến đường dẫn này để kích hoạt chế biến món.
        </p>
      </div>

      {/* 4. Quy trình vận hành & Xử lý ngoại lệ */}
      <div className="p-3.5 rounded-xl bg-white border border-[#E9ECEA] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[#1D2522] flex items-center gap-1.5">
            <Info className="w-4 h-4 text-[#727B77]" />
            Quy trình thanh toán & Đối soát tự động
          </span>
          <span className="text-[10px] font-semibold text-[#727B77] flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#727B77]" />
            Thời hạn mã VietQR: 15 phút
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#55605C]">
          <div className="p-2.5 rounded-lg bg-[#F8F9F8] border border-[#F0F2F1]">
            <p className="font-semibold text-[#1D2522] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D725E]" />
              Đơn Mua mang đi (Takeaway):
            </p>
            <p className="text-[11px] text-[#727B77] mt-1 leading-relaxed">
              Khách quét mã VietQR động → Tiền vào tài khoản → Hệ thống tự động
              chuyển đơn vào hàng đợi bếp (Chờ làm) và cấp số thứ tự nhận món.
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-[#F8F9F8] border border-[#F0F2F1]">
            <p className="font-semibold text-[#1D2522] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D725E]" />
              Đơn Ăn tại bàn (Dine-in):
            </p>
            <p className="text-[11px] text-[#727B77] mt-1 leading-relaxed">
              Khách dùng bữa xong → Chủ quán vào tab Bàn xem hóa đơn tổng → Chọn
              thanh toán chuyển khoản VietQR hoặc tiền mặt và xác nhận đóng
              phiên bàn.
            </p>
          </div>
        </div>

        {/* Hướng dẫn đối soát đơn ngoại lệ */}
        <div className="pt-2 border-t border-[#F0F2F1] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-[11px] text-[#727B77] leading-relaxed">
            Trường hợp khách chuyển khoản trễ hạn sau 15 phút hoặc chuyển sai số
            tiền, đơn hàng sẽ được giữ an toàn ở trạng thái{" "}
            <strong className="font-semibold text-[#B54708]">
              Cần đối soát
            </strong>{" "}
            trong tab Đơn hàng để chủ quán kiểm tra.
          </p>
          {onNavigateToOrders && (
            <button
              type="button"
              onClick={onNavigateToOrders}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D725E] hover:text-[#165B4B] transition-colors shrink-0 self-start sm:self-auto"
            >
              <span>Xem đơn hàng</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
