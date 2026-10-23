import nextEnv from "@next/env";
import { bootstrapOwner, OwnerBootstrapError } from "./lib/owner-bootstrap.mjs";

// Match Next's .env precedence: production start and development dev.
nextEnv.loadEnvConfig(process.cwd(), process.env.npm_lifecycle_event !== "prestart" && process.env.NODE_ENV !== "production");

try {
  const result = await bootstrapOwner(process.env);
  console.log(JSON.stringify({ event: "owner.bootstrap", status: result.status }));
} catch (error) {
  // Never print raw SDK/network errors, credentials, email or user objects.
  console.error(JSON.stringify({
    event: "owner.bootstrap_failed",
    code: error instanceof OwnerBootstrapError ? error.code : "service_unavailable",
    message: error instanceof OwnerBootstrapError ? error.message : "Bootstrap không hoàn tất. Kiểm tra kết nối Supabase và cấu hình server.",
  }));
  process.exitCode = 1;
}
