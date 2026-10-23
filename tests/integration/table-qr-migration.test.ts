import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("preflights legacy conflicts without changing rows, then installs on a fresh database with least privileges", () => {
  const name = `p2_c04_${randomUUID().replaceAll("-", "")}`;
  const sql = (db: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", db, "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const run = (input: string) => sql(name, input);
  const migration = readFileSync("supabase/migrations/20261023000600_owner_table_qr_lifecycle.sql", "utf8");
  const store = randomUUID(), table = randomUUID(), otherTable = randomUUID(), actor = randomUUID();
  sql("postgres", `create database ${name}`);
  try {
    run("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;create schema extensions;create extension pgcrypto schema extensions;");
    for (const file of ["20261023000100_foundation.sql", "20261023000200_owner_bootstrap_privileges.sql", "20261023000300_table_sessions_guest_access.sql", "20261023000400_session_row_lock_privileges.sql", "20261023000500_menu.sql"])
      run(readFileSync(`supabase/migrations/${file}`, "utf8"));
    run(`insert into auth.users values('${actor}');insert into public.stores(id,name) values('${store}','Legacy');insert into public.owner_members(store_id,auth_user_id) values('${store}','${actor}');
      insert into public.dining_tables(id,store_id,label) values('${table}','${store}','Bàn 01'),('${otherTable}','${store}',' bàn   01 ');
      insert into public.qr_codes(store_id,type,table_id,public_code) values('${store}','table','${table}','legacy-code');`);
    expect(() => run(migration)).toThrow();
    expect(run(`select label from public.dining_tables where id='${otherTable}'`)).toBe("bàn   01"); // psql trim only
    expect(run("select count(*) from information_schema.columns where table_name='qr_codes' and column_name='retired_at'")).toBe("0");
    run(`update public.dining_tables set label='Bàn 02' where id='${otherTable}';insert into public.qr_codes(store_id,type,table_id,public_code) values('${store}','table','${table}','duplicate-table');`);
    expect(() => run(migration)).toThrow();
    expect(run("select count(*) from public.qr_codes where active")).toBe("2");
    run("update public.qr_codes set active=false where public_code='duplicate-table'");
    run(`insert into public.qr_codes(store_id,type,public_code) values('${store}','takeaway','takeaway-a'),('${store}','takeaway','takeaway-b')`);
    expect(() => run(migration)).toThrow();
    expect(run("select count(*) from public.qr_codes where active and type='takeaway'")).toBe("2");
    run("update public.qr_codes set active=false where public_code='takeaway-b'");
    run(`update public.dining_tables set label=chr(1) where id='${otherTable}'`);
    expect(() => run(migration)).toThrow();
    run(`update public.dining_tables set label='Bàn 02' where id='${otherTable}'`);
    run(migration);
    expect(run("select public_code from public.qr_codes where public_code='legacy-code' and active")).toBe("legacy-code");
    expect(run("select count(*) from public.qr_codes")).toBe("4");
    expect(run("select has_column_privilege('authenticated','public.qr_codes','active','update')")).toBe("f");
    expect(run("select has_function_privilege('anon','public.p2_table_qr_execute(text,jsonb)','execute')")).toBe("f");
    const command = { ownerId: actor, storeId: store, requestId: randomUUID(), label: "Fresh invoker" };
    const output = run(`set role service_role;select public.p2_table_qr_execute('create_table','${JSON.stringify(command)}');`).split("\n").at(-1)!;
    const created = JSON.parse(output);
    expect(created.data).toMatchObject({ label: "Fresh invoker", active: true, qr: { type: "table", active: true } });
    const resolved = JSON.parse(run(`set role service_role;select public.p2_execute('resolve','${JSON.stringify({ qrCode: created.data.qr.publicCode, browserHash: "a".repeat(64), grantProof: "b".repeat(64), newBrowser: true })}');`).split("\n").at(-1)!);
    expect(resolved.data).toMatchObject({ type: "table", requiresSessionCode: true });
  } finally { sql("postgres", `drop database ${name} with (force)`); }
});
