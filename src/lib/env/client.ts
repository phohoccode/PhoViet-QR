import { z } from "zod";

function isPublicSupabaseKey(value: string): boolean {
  if (value.startsWith("sb_publishable_")) return value.length > "sb_publishable_".length;
  // Legacy anon keys are JWTs. Inspect only the role to reject an accidentally
  // configured service-role key; Supabase remains responsible for verification.
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon";
  } catch {
    return false;
  }
}

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine((value) => {
    // Zod refinements can also run after a URL-format issue; never throw raw input.
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1).refine(isPublicSupabaseKey),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/** Lazy validation: build and the placeholder route need no Supabase credentials. */
export function getClientEnv(): ClientEnv {
  // Explicit reads are required for Next.js to inline public browser variables.
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Cấu hình Supabase public thiếu hoặc không hợp lệ: ${fields.join(", ")}. Xem .env.example.`);
  }

  return result.data;
}
