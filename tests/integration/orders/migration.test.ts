import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("fresh schema applies 001–008 under hosted-style grants; migrations007/008 rollback restore catalog/data", () => {
  const name = `p3_migration_${randomUUID().replaceAll("-", "")}`;
  const sql = (db: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", db, "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  sql("postgres", `create database ${name}`);
  try {
    sql(name, "create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < "20261023000700").sort()) {
      sql(name, readFileSync(`supabase/migrations/${file}`, "utf8"));
      if (file.includes("foundation")) sql(name, "revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;");
    }
    const id = randomUUID(); sql(name, `insert into public.stores(id,name) values('${id}','Preserved fixture')`);
    const catalog = () => sql(name, "select md5(string_agg(oid::regclass::text||':'||relrowsecurity::text,',' order by relname)) from pg_class where relnamespace='public'::regnamespace and relkind='r'");
    const before = catalog();
    const migration = readFileSync("supabase/migrations/20261023000700_dine_in_orders_fifo.sql", "utf8");
    sql(name, migration.replace(/commit;\s*$/, "rollback;"));
    expect(catalog()).toBe(before); expect(sql(name, "select to_regclass('public.orders') is null")).toBe("t");
    expect(sql(name, "select to_regprocedure('public.p3_order_execute(text,jsonb)') is null")).toBe("t");
    sql(name, migration);
    expect(sql(name, `select name from public.stores where id='${id}'`)).toBe("Preserved fixture");
    expect(sql(name, "select count(*) from pg_constraint where conrelid in('public.orders'::regclass,'public.order_items'::regclass) and not convalidated")).toBe("0");
    expect(sql(name, "set role service_role;select public.p3_order_execute('get','{}'::jsonb)")).toBe('{"error": "UNAUTHORIZED"}');
    expect(sql(name, "select has_function_privilege('anon','public.p3_order_execute(text,jsonb)','execute'),has_function_privilege('authenticated','public.p3_order_execute(text,jsonb)','execute')")).toBe("f|f");
    const queueMigration = readFileSync("supabase/migrations/20261023000800_owner_order_queue.sql", "utf8");
    const queueCatalog = () => sql(name, "select md5(string_agg(attname||':'||atttypid::text,',' order by attnum)) from pg_attribute where attrelid='public.order_events'::regclass and attnum>0 and not attisdropped");
    const queueBefore = queueCatalog();
    sql(name, queueMigration.replace(/commit;\s*$/, "rollback;"));
    expect(queueCatalog()).toBe(queueBefore);
    expect(sql(name, "select to_regprocedure('public.p3_owner_orders_execute(text,jsonb)') is null")).toBe("t");
    expect(sql(name, "select to_regclass('public.orders_owner_queue') is null")).toBe("t");
    sql(name, queueMigration);
    expect(sql(name, `select name from public.stores where id='${id}'`)).toBe("Preserved fixture");
    expect(sql(name, "select count(*) from pg_constraint where conrelid='public.order_events'::regclass and not convalidated")).toBe("0");
    expect(sql(name, "select has_function_privilege('anon','public.p3_owner_orders_execute(text,jsonb)','execute'),has_function_privilege('authenticated','public.p3_owner_orders_execute(text,jsonb)','execute')")).toBe("f|f");
    expect(sql(name, "set role service_role;select public.p3_owner_orders_execute('claim','{}'::jsonb)")).toBe('{"error": "FORBIDDEN"}');
  } finally { sql("postgres", `drop database ${name} with (force)`); }
});
