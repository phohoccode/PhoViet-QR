import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("009 preserves legacy data/grants, validates constraints/ACLs and atomically rolls back both success and preflight failure", () => {
  const db = `pin_migration_${randomUUID().replaceAll("-", "")}`;
  const sql = (database: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const run = (input: string) => sql(db, input);
  sql("postgres", `create database ${db}`);
  try {
    run("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < "20261024000900").sort()) {
      run(readFileSync(`supabase/migrations/${file}`, "utf8"));
      if (file.includes("foundation")) run("revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;");
    }
    const sid = randomUUID(), table = randomUUID(), session = randomUUID();
    run(`insert into public.stores(id,name) values('${sid}','Legacy PIN migration');insert into public.dining_tables(id,store_id,label) values('${table}','${sid}','Legacy');
     insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session}','${sid}','${table}',repeat('a',64),clock_timestamp()+interval '24 hours');
     insert into public.guest_browser_contexts(token_hash) values(repeat('b',64));insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at) values('${sid}','${session}',repeat('c',64),repeat('b',64),clock_timestamp()+interval '6 hours');`);
    const rows = () => run("select jsonb_build_object('sessions',(select jsonb_agg(to_jsonb(s)-'pin_key_id'-'pin_generation'-'pin_issued_at') from public.table_sessions s),'grants',(select jsonb_agg(to_jsonb(g)) from public.guest_access g))");
    const catalog = () => run("select md5(jsonb_build_object('columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attname,a.atttypid) order by c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped),'functions',(select jsonb_agg(jsonb_build_array(p.proname,p.prosrc,p.proacl,p.proconfig) order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace))::text)");
    const before = rows(), schemaBefore = catalog(), migration = readFileSync("supabase/migrations/20261024000900_six_digit_table_pin.sql", "utf8");
    run(migration.replace(/commit;\s*$/, "rollback;")); expect(rows()).toBe(before); expect(catalog()).toBe(schemaBefore);
    run("create or replace function public.p2_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $$ begin return '{}'::jsonb;end;$$;");
    const drift = catalog(); expect(() => run(migration)).toThrow(); expect(catalog()).toBe(drift); expect(rows()).toBe(before);
    expect(run("select to_regclass('public.table_pin_audit_log') is null")).toBe("t");
    // Restore exact known resolver from foundation +006 in this scratch DB.
    const base = readFileSync("supabase/migrations/20261023000300_table_sessions_guest_access.sql", "utf8").replaceAll("\r\n", "\n");
    let fn = base.match(/create function public\.p2_execute[\s\S]*?end; \$\$;/)![0].replace("create function", "create or replace function");
    fn = fn.replace("and active for share;", "and active;").replace("  if action='resolve' then", "  select * into q from public.qr_codes where public_code=input->>'qrCode' and active for share;\n  if not found then return public.p2_fail('INVALID_QR'); end if;\n  if action='resolve' then");
    run(fn); run(migration);
    expect(rows()).toBe(before); expect(run(`select pin_generation||':'||(pin_key_id is null) from public.table_sessions where id='${session}'`)).toBe("0:true");
    expect(run("select count(*) from pg_constraint where conrelid in('public.table_sessions'::regclass,'public.session_code_deliveries'::regclass,'public.table_pin_audit_log'::regclass) and not convalidated")).toBe("0");
    for (const role of ["anon", "authenticated"]) expect(run(`select has_function_privilege('${role}','public.p2_pin_execute(text,jsonb)','execute'),has_function_privilege('${role}','public.p2_execute_legacy(text,jsonb)','execute'),has_table_privilege('${role}','public.table_pin_audit_log','select')`)).toBe("f|f|f");
    expect(run("set role service_role;select public.p2_pin_execute('reveal','{}'::jsonb)")).toBe('{"error": "FORBIDDEN"}');
    expect(() => run(`update public.table_sessions set pin_generation=1 where id='${session}'`)).toThrow();
  } finally { sql("postgres", `drop database ${db} with (force)`); }
});
