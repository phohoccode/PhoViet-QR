import type { ApiError, ApiResponse, MenuV1View } from "@contracts";
// Browser-safe adapters only. No Supabase SDK, server module or mock fallback.
export class MenuApiError extends Error {
  constructor(public readonly status: number, public readonly error: ApiError) { super(error.message); }
}
/** Network failures propagate as TypeError; API failures expose status/code. */
export async function menuRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: "include", cache: "no-store",
    headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: ApiResponse<T> = await response.json();
  if (!response.ok || payload.error) throw new MenuApiError(response.status, payload.error ?? { code: "INTERNAL_ERROR", message: "Không thể tải thực đơn." });
  return payload.data as T;
}
export const fetchPublicMenu = (qrCode: string): Promise<MenuV1View> => menuRequest(`/api/public/menu?qrCode=${encodeURIComponent(qrCode)}`);
