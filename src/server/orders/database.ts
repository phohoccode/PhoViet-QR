import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { ApiErrorCode, ApiErrorDetails, ApiResponse } from "@contracts";
import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";
import { apiFailure, ApiFault } from "@/server/security/api";

const errors = {
  INVALID_QR: [404, "Mã QR không hợp lệ hoặc đã bị khóa."],
  UNAUTHORIZED: [401, "Vui lòng quét QR và xác minh lại quyền truy cập."],
  FORBIDDEN: [403, "Bạn không có quyền thực hiện thao tác này."],
  SESSION_REQUIRED: [403, "Vui lòng xác minh mã phiên bàn."],
  SESSION_EXPIRED: [410, "Phiên bàn hoặc quyền truy cập đã hết hiệu lực."],
  SESSION_CHECKOUT_PENDING: [409, "Bàn đang thanh toán, chưa thể đặt thêm món."],
  OUT_OF_STOCK: [409, "Một số món trong giỏ không còn bán."],
  PRICE_CHANGED: [409, "Thực đơn đã thay đổi. Vui lòng xem lại giỏ hàng."],
  STORE_NOT_ACCEPTING_ORDERS: [409, "Quán đang tạm ngừng nhận đơn."],
  DUPLICATE_REQUEST_CONFLICT: [409, "Mã yêu cầu đã được dùng cho nội dung khác."],
  INVALID_STATE_TRANSITION: [409, "Trạng thái, phiên bản hoặc loại đơn không cho phép thao tác này. Vui lòng tải lại đơn."],
  ORDER_NOT_FOUND: [404, "Không tìm thấy đơn hàng."],
  VALIDATION_ERROR: [422, "Món, tùy chọn hoặc tổng tiền không hợp lệ."],
  RATE_LIMITED: [429, "Bạn thao tác quá nhanh. Vui lòng thử lại sau."],
  INTERNAL_ERROR: [500, "Dịch vụ tạm thời không khả dụng. Vui lòng thử lại."],
} as const satisfies Partial<Record<ApiErrorCode, readonly [number, string]>>;
type OrderErrorCode = keyof typeof errors;
export class OrderFault extends Error {
  constructor(public readonly code: OrderErrorCode, public readonly details?: ApiErrorDetails) { super(errors[code][1]); }
}
export async function executeOrder<T>(action: "create" | "get", input: Record<string, unknown>): Promise<T> {
  try {
    const env = getClientEnv();
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await client.rpc("p3_order_execute", { action, input });
    if (error || !data || typeof data !== "object") throw new OrderFault("INTERNAL_ERROR");
    if (data.error) {
      const code: OrderErrorCode = Object.hasOwn(errors, data.error) ? data.error : "INTERNAL_ERROR";
      const details: ApiErrorDetails | undefined = code === "RATE_LIMITED"
        ? { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) }
        : code === "INVALID_STATE_TRANSITION" ? { field: "orderType" } : undefined;
      throw new OrderFault(code, details);
    }
    if (!data.data || typeof data.data !== "object") throw new OrderFault("INTERNAL_ERROR");
    return data.data as T;
  } catch (error) {
    if (error instanceof OrderFault) throw error;
    throw new OrderFault("INTERNAL_ERROR");
  }
}
export function orderFailure(error: unknown): NextResponse<ApiResponse<never>> {
  if (!(error instanceof OrderFault)) return apiFailure(error instanceof ApiFault ? error : new ApiFault("INTERNAL_ERROR"));
  if (error.code === "INTERNAL_ERROR") return apiFailure(new ApiFault("INTERNAL_ERROR"));
  const response = NextResponse.json({ data: null, error: { code: error.code, message: error.message,
    ...(error.details ? { details: error.details } : {}) } }, { status: errors[error.code][0] });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (error.code === "RATE_LIMITED") response.headers.set("Retry-After", String(error.details?.retryAfterSeconds ?? 60));
  return response;
}
