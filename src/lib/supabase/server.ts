import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getClientEnv } from "@/lib/env/client";
import type { Database } from "./database";

type ServerClientOptions = {
  /** Only server actions may write via cookies(); rendering must use read-only. */
  cookieMode: "read-only" | "write";
  onRefreshRequired?: () => void;
};

/** New client per request; never a shared server singleton or service-role client. */
export async function createServerSupabaseClient(options: ServerClientOptions) {
  const cookieStore = await cookies(); // Request-time API before lazy env validation.
  const env = getClientEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: {
        path: "/", sameSite: "lax", httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          if (options.cookieMode === "read-only") {
            options.onRefreshRequired?.();
            return;
          }
          // Do not swallow failed writes in a context that must persist auth.
          for (const { name, value, options: cookieOptions } of values) {
            cookieStore.set(name, value, cookieOptions);
          }
          // Server Actions are private/no-store in Next; refresh route separately
          // forwards the SSR SDK's explicit cache headers with cookie writes.
        },
      },
    },
  );
}
