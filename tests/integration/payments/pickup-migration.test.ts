import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("011 fresh/rollback/guard/CRLF preserves data, verifies validated constraints, RLS and server-only privileges", () => {
  const db = `pickup_migration_${randomUUID().replaceAll("-", "")}`;
  const sql = (database: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  sql("postgres", `create database ${db}`);
  try {
    sql(db, "create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < "20261024001100").sort()) {
      sql(db, readFileSync(`supabase/migrations/${file}`, "utf8"));
      if (file.includes("foundation")) sql(db, "revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;");
    }
    const fixture = randomUUID(), table = randomUUID(), qr = randomUUID();
    sql(db, `insert into public.stores(id,name) values('${fixture}','Preserved');
      insert into public.dining_tables(id,store_id,label) values('${table}','${fixture}','Preserved');
      insert into public.qr_codes(id,store_id,type,table_id) values('${qr}','${fixture}','table','${table}');`);
    const rows = () => sql(db, `select row_to_json(t) from (select s.*,d.*,q.* from public.stores s join public.dining_tables d on d.store_id=s.id join public.qr_codes q on q.table_id=d.id where s.id='${fixture}') t`);
    const originalRows = rows();
    const catalog = () => sql(db, "select md5(string_agg(p.oid::regprocedure::text||':'||p.prosrc,',' order by p.proname)) from pg_proc p where pronamespace='public'::regnamespace");
    const before = catalog(), migration = readFileSync("supabase/migrations/20261024001100_takeaway_pickup.sql", "utf8");
    sql(db, migration.replace(/commit;\s*$/, "rollback;"));
    expect(catalog()).toBe(before); expect(rows()).toBe(originalRows);
    expect(sql(db, "select to_regclass('public.pickup_credentials') is null")).toBe("t");
    const original = sql(db, "select pg_get_functiondef('public.p3_order_summary(public.orders)'::regprocedure)");
    sql(db, "create or replace function public.p3_order_summary(o public.orders) returns jsonb language sql stable set search_path=pg_catalog as $$ select '{}'::jsonb $$;");
    expect(() => sql(db, migration)).toThrow();
    expect(sql(db, "select to_regclass('public.pickup_credentials') is null")).toBe("t");
    sql(db, original.replaceAll("\n", "\r\n"));
    sql(db, migration.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
    expect(rows()).toBe(originalRows);
    expect(sql(db, "select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated")).toBe("0");
    for (const name of ["p4_pickup_execute(text,jsonb)", "p4_pickup_equal(text,text)"]) {
      expect(sql(db, `select has_function_privilege('anon','public.${name}','execute'),has_function_privilege('authenticated','public.${name}','execute'),has_function_privilege('service_role','public.${name}','execute')`)).toBe("f|f|t");
    }
    for (const name of ["pickup_credentials", "pickup_attempt_log"]) {
      expect(sql(db, `select relrowsecurity,has_table_privilege('anon','public.${name}','select'),has_table_privilege('authenticated','public.${name}','select'),has_table_privilege('service_role','public.${name}','delete') from pg_class where oid='public.${name}'::regclass`)).toBe("t|f|f|f");
    }
    expect(sql(db, "set role service_role;select public.p4_pickup_execute('complete','{}')")).toBe('{"error": "FORBIDDEN"}');
    expect(sql(db, "select count(*) from pg_trigger where tgname in('pickup_completed_order','pickup_completed_credential') and tgdeferrable and tginitdeferred")).toBe("2");
  } finally { sql("postgres", `drop database ${db} with (force)`); }
});
