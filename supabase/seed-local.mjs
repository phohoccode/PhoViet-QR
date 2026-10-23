import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

assert.match(readFileSync("supabase/config.toml", "utf8"), /^project_id\s*=\s*"qr-ordering-p1c02-local"/m);
const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "--workdir", process.cwd(), "status", "-o", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(status.API_URL, "http://127.0.0.1:15421", "Refusing seed outside the configured local project");
try {
  execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: readFileSync("supabase/seed.sql"), stdio: ["pipe", "pipe", "pipe"] });
  console.log("Local demo seed applied (UTF-8, idempotent; no Auth user or membership created).");
} catch {
  throw new Error("Local seed failed. Inspect the configured local PostgreSQL service; raw SQL output withheld.");
}
