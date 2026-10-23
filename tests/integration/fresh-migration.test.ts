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
    psql(name, readFileSync("supabase/migrations/20261023000100_foundation.sql", "utf8"));
    // Reproduce hosted projects without the local template's default grants.
    psql(name, "revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;");
    for (const file of ["20261023000200_owner_bootstrap_privileges.sql", "20261023000300_table_sessions_guest_access.sql", "20261023000400_session_row_lock_privileges.sql"]) psql(name, readFileSync(`supabase/migrations/${file}`, "utf8"));
    expect(psql(name, "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity")).toBe("11");
    expect(psql(name, "select has_function_privilege('anon','public.p2_execute(text,jsonb)','execute')")).toBe("f");
    expect(psql(name, "select has_function_privilege('service_role','public.p2_execute(text,jsonb)','execute')")).toBe("t");
    const store = randomUUID(), table = randomUUID(), actor = randomUUID(), session = randomUUID(), request = randomUUID();
    psql(name, `insert into auth.users values('${actor}');
      insert into public.stores(id,name) values('${store}','Row lock fixture');
      insert into public.owner_members(store_id,auth_user_id) values('${store}','${actor}');
      insert into public.dining_tables(id,store_id,label) values('${table}','${store}','Table');
      insert into public.qr_codes(store_id,type,table_id,public_code) values('${store}','table','${table}','row-lock-fixture');`);
    const execute = (action: string, input: Record<string, unknown>) => JSON.parse(psql(name,
      `set role service_role; select public.p2_execute('${action}','${JSON.stringify(input)}'::jsonb);`).split("\n").at(-1)!);
    // Actual invoker-role RPC calls exercise FOR SHARE and FOR UPDATE, rather
    // than testing as postgres (which would conceal missing object privileges).
    expect(execute("resolve", { qrCode: "row-lock-fixture", browserHash: "a".repeat(64), grantProof: "b".repeat(64), newBrowser: true }).data.type).toBe("table");
    expect(execute("open", { ownerId: actor, storeId: store, tableId: table, sessionId: session, requestId: request,
      codeHash: "c".repeat(64), keyId: "fixture", artifact: {}, fingerprint: "fixture" }).data.session.id).toBe(session);
  } finally { psql("postgres", `drop database ${name} with (force)`); }
});
