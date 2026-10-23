import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Explicit opt-in for future privileged server code; never called at module load. */
export function getServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    throw new Error("Cấu hình server thiếu hoặc không hợp lệ: SUPABASE_SERVICE_ROLE_KEY. Xem .env.example.");
  }

  return result.data;
}
