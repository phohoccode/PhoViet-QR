import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { hashSecret, newBrowserToken } from "./crypto";
import { ApiFault } from "./api";

// __Host- prevents sibling subdomains from planting a Domain cookie with this name.
export const GUEST_COOKIE = process.env.NODE_ENV === "production" ? "__Host-qr_guest" : "qr_guest";
export const BROWSER_TTL_SECONDS = 30 * 24 * 3600;
export type GuestRequestContext = { token: string; browserHash: string; grantProof: string; isNew: boolean; ipHash?: string };
export function guestRequestContext(request: NextRequest, allowCreate = true, forceNew = false): GuestRequestContext {
  const existing = forceNew ? undefined : request.cookies.get(GUEST_COOKIE)?.value;
  const valid = existing && /^[A-Za-z0-9_-]{43}$/.test(existing);
  if (!valid && !allowCreate) throw new ApiFault("UNAUTHORIZED");
  const token = valid ? existing : newBrowserToken();
  let ipHash: string | undefined;
  // Trust only an explicitly configured ingress that overwrites this header.
  if (process.env.VERCEL === "1" || process.env.TRUST_PROXY_IP === "true") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    if (ip && isIP(ip)) ipHash = hashSecret(`ip:${ip}`);
  }
  return { token, browserHash: hashSecret(token), grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: !valid, ipHash };
}
export function setGuestCookie(response: NextResponse, context: GuestRequestContext) {
  response.cookies.set(GUEST_COOKIE, context.token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: BROWSER_TTL_SECONDS,
  });
}
