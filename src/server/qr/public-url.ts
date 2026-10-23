import "server-only";
import { ApiFault } from "@/server/security/api";
import { publicQrCode } from "@/lib/validations/table-sessions";

/** Never accept a base URL from Host, Forwarded headers, or a request body. */
export function qrBaseUrl(): URL {
  try {
    const value = process.env.APP_BASE_URL;
    if (!value || value !== value.trim()) throw new Error();
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !(url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
    return url;
  } catch { throw new ApiFault("INTERNAL_ERROR", { field: "APP_BASE_URL" }); }
}
export function qrPublicUrl(code: string, base = qrBaseUrl()): string {
  return new URL(`/q/${encodeURIComponent(publicQrCode.parse(code))}`, base).toString();
}
