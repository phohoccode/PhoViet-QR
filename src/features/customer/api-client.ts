import type {
  TableBillView,
  ApiError,
  ApiResponse,
  MenuV1View,
  QRResolution,
  TableSessionVerifyInput,
} from "@contracts";
// Browser-safe adapters only. No Supabase SDK, server module or mock fallback.
export class MenuApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
    public readonly retryAfterSeconds?: number,
  ) {
    super(error.message);
  }
}
/** Network failures propagate as TypeError; API failures expose status/code. */
export async function menuRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    cache: "no-store",
    ...(signal ? { signal } : {}),
    headers:
      body === undefined
        ? { Accept: "application/json" }
        : { Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: ApiResponse<T> | null = await response
    .json()
    .catch(() => null);
  if (
    !response.ok ||
    !payload ||
    typeof payload !== "object" ||
    payload.error !== null ||
    !("data" in payload)
  ) {
    const header = response.headers.get("Retry-After");
    const headerSeconds =
      header === null
        ? NaN
        : /^\d+$/.test(header.trim())
          ? Number(header)
          : (Date.parse(header) - Date.now()) / 1000;
    const detailSeconds = payload?.error?.details?.retryAfterSeconds;
    const seconds = Math.max(
      Number.isFinite(headerSeconds) ? headerSeconds : 0,
      typeof detailSeconds === "number" && Number.isFinite(detailSeconds)
        ? detailSeconds
        : 0,
    );
    const retryAfterSeconds =
      response.status === 429
        ? Math.max(1, Math.ceil(seconds > 0 ? seconds : 60))
        : undefined;
    throw new MenuApiError(
      response.status,
      payload?.error ?? {
        code: response.status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
        message: "Không thể tải thực đơn.",
      },
      retryAfterSeconds,
    );
  }
  return payload.data as T;
}
export const fetchPublicMenu = (qrCode: string): Promise<MenuV1View> =>
  menuRequest(`/api/public/menu?qrCode=${encodeURIComponent(qrCode)}`);
export const fetchQrResolution = (qrCode: string): Promise<QRResolution> =>
  menuRequest(`/api/public/qr/${encodeURIComponent(qrCode)}`);
export const verifyPublicTableSession = (
  input: TableSessionVerifyInput,
): Promise<QRResolution> =>
  menuRequest("/api/public/table-sessions/verify", "POST", input);
export const fetchPublicSessionBill = (qrCode: string): Promise<TableBillView> =>
  menuRequest(`/api/public/table-sessions/current/bill?qrCode=${encodeURIComponent(qrCode)}`);
