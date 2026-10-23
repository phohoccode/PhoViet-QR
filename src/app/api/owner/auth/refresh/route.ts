import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getClientEnv } from "@/lib/env/client";
import type { Database } from "@/lib/supabase/database";
import { OwnerAccessError, verifyOwner } from "@/server/auth/verify-owner";
import { logAuthEvent } from "@/server/auth/log";

/** Cookie refresh transport only; authorization still runs in the dashboard guard. */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  try {
    const env = getClientEnv();
    const client = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookieOptions: { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values, cacheHeaders) => {
          for (const { name, value, options } of values) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(cacheHeaders)) response.headers.set(name, value);
        },
      },
    });
    const owner = await verifyOwner(client);
    if (!owner) response.headers.set("Location", new URL("/login", request.url).href);
  } catch (error) {
    if (!(error instanceof OwnerAccessError)) logAuthEvent("auth.refresh_failed");
    const reason = error instanceof OwnerAccessError && error.code === "forbidden"
      ? "access_denied" : "service_unavailable";
    response.headers.set("Location", new URL(`/login?reason=${reason}`, request.url).href);
  }
  return response;
}
