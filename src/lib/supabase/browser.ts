"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getClientEnv } from "@/lib/env/client";
import type { Database } from "./database";

/** Public, RLS-bound data client only. Owner login/logout use server actions. */
export function createBrowserSupabaseClient() {
  const env = getClientEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // Owner sessions stay in HttpOnly server cookies; this data helper must not
      // discover URL tokens, persist a second browser session, or refresh it.
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      cookieOptions: { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    },
  );
}
