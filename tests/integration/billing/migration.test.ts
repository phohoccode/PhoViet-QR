import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

it("015 clean chain, atomic rollback, preflight drift and CRLF preserve existing sessions; financial evidence is server-only and immutable", () => {
  const db = `billing_${randomUUID().replaceAll("-", "")}`;
  const sql = (database: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const run = (s: string) => sql(db, s);
  const migration = readFileSync("supabase/migrations/20261024001500_dinein_session_settlement.sql", "utf8");
  sql("postgres", `create database ${db}`);
  try {
    run("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < "20261024001500").sort()) {
      run(readFileSync(`supabase/migrations/${file}`, "utf8"));
      if (file.includes("foundation")) run("revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;");
    }
    const store = randomUUID(), table = randomUUID(), session = randomUUID();
    run(`insert into public.stores(id,name) values('${store}','Preserved');insert into public.dining_tables(id,store_id,label) values('${table}','${store}','Preserved');
     insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session}','${store}','${table}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours');`);
    const rows = () => run(`select row_to_json(s) from public.table_sessions s where id='${session}'`);
    const beforeRows = rows(), catalog = () => run("select md5(string_agg(p.oid::regprocedure::text||':'||p.prosrc||':'||coalesce(p.proacl::text,''),',' order by p.proname)) from pg_proc p where pronamespace='public'::regnamespace");
    const beforeCatalog = catalog();
    run(migration.replace(/commit;\s*$/, "rollback;")); expect(catalog()).toBe(beforeCatalog); expect(rows()).toBe(beforeRows);
    expect(run("select to_regclass('public.session_settlements') is null")).toBe("t");
    for (const signature of ["p2_session_view(public.table_sessions)", "p4_dine_in_view(public.orders)", "p4_dine_in_summary(public.orders)", "p3_order_view(public.orders)", "p3_order_summary(public.orders)", "p3_order_execute(text,jsonb)"]) {
      const def = run(`select pg_get_functiondef('public.${signature}'::regprocedure)`);
      run(def.replace("AS $function$", "AS $function$\n-- TEST ONLY unexpected drift"));
      expect(() => run(migration)).toThrow();
      expect(run("select to_regclass('public.session_settlements') is null")).toBe("t"); run(def);
    }
    const sessionView = run("select pg_get_functiondef('public.p2_session_view(public.table_sessions)'::regprocedure)");
    run("alter function public.p2_session_view(public.table_sessions) reset all");
    expect(() => run(migration)).toThrow(); run(sessionView);
    run("alter function public.p2_session_view(public.table_sessions) security definer");
    expect(() => run(migration)).toThrow(); run(sessionView);
    run(migration.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")); expect(rows()).toBe(beforeRows);
    expect(run("select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated")).toBe("0");
    for (const relation of ["session_settlements", "session_checkout_snapshots", "session_settlement_audit_log"]) {
      expect(run(`select relrowsecurity,has_table_privilege('anon','public.${relation}','select'),has_table_privilege('authenticated','public.${relation}','insert'),has_table_privilege('service_role','public.${relation}','update'),has_table_privilege('service_role','public.${relation}','delete') from pg_class where oid='public.${relation}'::regclass`)).toBe("t|f|f|f|f");
    }
    for (const fn of ["p5_session_execute(text,jsonb)", "p5_session_bill(uuid)", "p5_bill_version(uuid)", "p5_session_paid(uuid)", "p4_dine_in_view(public.orders)"]) {
      expect(run(`select has_function_privilege('anon','public.${fn}','execute'),has_function_privilege('authenticated','public.${fn}','execute'),has_function_privilege('service_role','public.${fn}','execute')`)).toBe("f|f|t");
    }
    expect(run("select indisunique from pg_index where indexrelid='public.session_settlements_one_success'::regclass")).toBe("t");
    expect(run("select count(*) from pg_trigger where tgname in('session_settlement_consistency','settled_order_consistency') and tgdeferrable and tginitdeferred")).toBe("2");
    expect(JSON.parse(run(`set role service_role;select public.p5_session_bill('${session}')`))).toMatchObject({ totalVnd: 0, orders: [], session: { status: "open", paymentStatus: "unpaid" } });
  } finally { sql("postgres", `drop database ${db} with (force)`); }
});
