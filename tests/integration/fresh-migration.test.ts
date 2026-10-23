import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
it("applies all migrations to a fresh isolated local database", () => {
  const name = `p2_migration_${randomUUID().replaceAll("-", "")}`;
  const psql = (db: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", db, "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  psql("postgres", `create database ${name}`);
  try {
    psql(name, "create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select null::uuid $$; create schema extensions; create extension pgcrypto schema extensions;");
    for (const file of ["20261023000100_foundation.sql", "20261023000200_owner_bootstrap_privileges.sql", "20261023000300_table_sessions_guest_access.sql"]) psql(name, readFileSync(`supabase/migrations/${file}`, "utf8"));
    expect(psql(name, "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity")).toBe("11");
    expect(psql(name, "select has_function_privilege('anon','public.p2_execute(text,jsonb)','execute')")).toBe("f");
    expect(psql(name, "select has_function_privilege('service_role','public.p2_execute(text,jsonb)','execute')")).toBe("t");
  } finally { psql("postgres", `drop database ${name} with (force)`); }
});
