import { traceEvent } from "@/server/security/trace";
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ApiErrorCode, ApiErrorDetails, ApiResponse } from "@contracts";

const messages: Partial<Record<ApiErrorCode, string>> = {
  INVALID_PICKUP_CODE: "Mã nhận món không hợp lệ hoặc đã hết hiệu lực.",
  PICKUP_NOT_ALLOWED: "Đơn chưa đủ điều kiện giao món.",
  PICKUP_CREDENTIAL_UNAVAILABLE: "Chưa thể xác minh mã nhận món. Vui lòng thử lại sau.",
  ORDER_ALREADY_COMPLETED: "Đơn đã được giao.",
  PAYMENT_PROVIDER_UNAVAILABLE: "Chưa cấu hình cổng thanh toán. Vui lòng liên hệ chủ quán.",
  PAYMENT_REVIEW_REQUIRED: "Thanh toán cần được đối soát. Không chuyển tiền thêm.",
  INVALID_QR: "Mã QR không hợp lệ hoặc đã bị khóa.",
  SESSION_REQUIRED: "Vui lòng xác minh mã phiên bàn.",
  SESSION_EXPIRED: "Phiên bàn hoặc quyền truy cập đã hết hiệu lực.",
  SESSION_CHECKOUT_PENDING: "Bàn đang thanh toán, chưa thể đặt thêm món.",
  INVALID_SESSION_CODE: "Mã phiên không hợp lệ.",
  INVALID_STATE_TRANSITION: "Bàn không hoạt động hoặc đã có phiên đang mở.",
  RESOURCE_NOT_FOUND: "Không tìm thấy tài nguyên.",
  UNAUTHORIZED: "Vui lòng đăng nhập hoặc xác minh lại quyền truy cập.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  VALIDATION_ERROR: "Dữ liệu yêu cầu không hợp lệ.",
  DUPLICATE_REQUEST_CONFLICT: "Mã yêu cầu đã được dùng cho nội dung khác.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Vui lòng thử lại sau.",
  INTERNAL_ERROR: "Dịch vụ tạm thời không khả dụng. Vui lòng thử lại.",
};
const statuses: Partial<Record<ApiErrorCode, number>> = {
  INVALID_PICKUP_CODE: 422, PICKUP_NOT_ALLOWED: 409,
  PICKUP_CREDENTIAL_UNAVAILABLE: 503, ORDER_ALREADY_COMPLETED: 409,
  PAYMENT_PROVIDER_UNAVAILABLE: 503, PAYMENT_REVIEW_REQUIRED: 409,
  INVALID_QR: 404, RESOURCE_NOT_FOUND: 404, SESSION_REQUIRED: 403, SESSION_EXPIRED: 410,
  SESSION_CHECKOUT_PENDING: 409, INVALID_SESSION_CODE: 422, INVALID_STATE_TRANSITION: 409,
  UNAUTHORIZED: 401, FORBIDDEN: 403, VALIDATION_ERROR: 400, DUPLICATE_REQUEST_CONFLICT: 409,
  RATE_LIMITED: 429, INTERNAL_ERROR: 500,
};
export class ApiFault extends Error {
  constructor(public readonly code: ApiErrorCode, public readonly details?: ApiErrorDetails) {
    super(messages[code] ?? messages.INTERNAL_ERROR);
  }
}
export function apiFailure(error: unknown): NextResponse<ApiResponse<never>> {
  const fault = error instanceof ApiFault ? error : new ApiFault("INTERNAL_ERROR");
  if (fault.code === "INTERNAL_ERROR") traceEvent("api.internal_failure");
  const response = NextResponse.json({ data: null, error: {
    code: fault.code, message: fault.message, ...(fault.details ? { details: fault.details } : {}),
  } }, { status: statuses[fault.code] ?? 500 });
  privateHeaders(response);
  if (fault.code === "RATE_LIMITED") response.headers.set("Retry-After", String(fault.details?.retryAfterSeconds ?? 60));
  return response;
}
export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  const response = NextResponse.json({ data, error: null }, { status });
  privateHeaders(response);
  return response;
}
function privateHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
}
export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiFault("VALIDATION_ERROR");
  return result.data;
}
export function noQuery(request: Request) {
  if (new URL(request.url).search) throw new ApiFault("VALIDATION_ERROR");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Never construct the trusted origin from a caller-controlled forwarded header.
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiFault("FORBIDDEN");
}
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new ApiFault("VALIDATION_ERROR");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiFault("VALIDATION_ERROR");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); throw new ApiFault("VALIDATION_ERROR"); }
      chunks.push(value);
    }
    return validate(schema, JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault("VALIDATION_ERROR");
  } finally { reader.releaseLock(); }
}
