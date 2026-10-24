import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("010 applies fresh under hosted grants, rolls back catalog atomically, preserves fixture, validates ACL and constraints", () => {
  const db = `p4_migration_${randomUUID().replaceAll("-", "")}`;
  const sql = (database: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  sql("postgres", `create database ${db}`);
  try {
    sql(db, "create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < "20261024001000").sort()) {
      sql(db, readFileSync(`supabase/migrations/${file}`, "utf8"));
      if (file.includes("foundation")) sql(db, "revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;");
    }
    const fixture = randomUUID(); sql(db, `insert into public.stores(id,name) values('${fixture}','Preserved')`);
    const catalog = () => sql(db, "select md5(string_agg(p.oid::regprocedure::text||':'||p.prosrc,',' order by p.proname)) from pg_proc p where pronamespace='public'::regnamespace");
    const before = catalog();
    const migration = readFileSync("supabase/migrations/20261024001000_takeaway_payments.sql", "utf8");
    sql(db, migration.replace(/commit;\s*$/, "rollback;"));
    expect(catalog()).toBe(before);
    expect(sql(db, "select to_regclass('public.payments') is null")).toBe("t");
    expect(sql(db, "select attnotnull from pg_attribute where attrelid='public.orders'::regclass and attname='ticket_no'")).toBe("t");
    const original = sql(db, "select pg_get_functiondef('public.p3_order_summary(public.orders)'::regprocedure)");
    sql(db, "create or replace function public.p3_order_summary(o public.orders) returns jsonb language sql stable set search_path=pg_catalog as $$ select '{}'::jsonb $$;");
    expect(() => sql(db, migration)).toThrow();
    expect(sql(db, "select to_regclass('public.payment_intents') is null")).toBe("t");
    expect(sql(db, "select attnotnull from pg_attribute where attrelid='public.orders'::regclass and attname='ticket_no'")).toBe("t");
    sql(db, original);
    sql(db, migration);
    expect(sql(db, `select name from public.stores where id='${fixture}'`)).toBe("Preserved");
    expect(sql(db, "select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated")).toBe("0");
    for (const name of ["p4_checkout(jsonb)", "p4_ingest(jsonb)", "p4_process(uuid)", "p4_payment_execute(text,jsonb)"]) {
      expect(sql(db, `select has_function_privilege('anon','public.${name}','execute'),has_function_privilege('authenticated','public.${name}','execute'),has_function_privilege('service_role','public.${name}','execute')`)).toBe("f|f|t");
    }
    for (const name of ["payment_intents", "payments", "payment_webhook_inbox", "takeaway_requests"]) {
      expect(sql(db, `select relrowsecurity,has_table_privilege('anon','public.${name}','select'),has_table_privilege('authenticated','public.${name}','select') from pg_class where oid='public.${name}'::regclass`)).toBe("t|f|f");
    }
    expect(sql(db, "set role service_role;select public.p4_checkout('{}')")).toBe('{"error": "UNAUTHORIZED"}');
  } finally { sql("postgres", `drop database ${db} with (force)`); }
});
