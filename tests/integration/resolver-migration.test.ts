import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const container = "supabase_db_qr-ordering-p1c02-local";
const migration = readFileSync("supabase/migrations/20261023000600_owner_table_qr_lifecycle.sql", "utf8");
const lf = (value: string) => value.replaceAll("\r\n", "\n");
const endings = (value: string, eol: string) => lf(value).replaceAll("\n", eol);
const sql = (db: string, input: string) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", db, "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const md5 = (value: string) => createHash("md5").update(value).digest("hex");
const foundation = lf(readFileSync("supabase/migrations/20261023000300_table_sessions_guest_access.sql", "utf8"));
const body = foundation.split("create function public.p2_execute(action text,input jsonb) returns jsonb\nlanguage plpgsql set search_path=pg_catalog as $$")[1].split("$$;")[0];
const functionSql = (value: string) => `create or replace function public.p2_execute(action text,input jsonb) returns jsonb language plpgsql set search_path=pg_catalog as $body$${value}$body$;`;
const patchedBody = body.replace("and active for share;", "and active;").replace("  if action='resolve' then", "  select * into q from public.qr_codes where public_code=input->>'qrCode' and active for share;\n  if not found then return public.p2_fail('INVALID_QR'); end if;\n  if action='resolve' then");

function scratch(eol: string, test: (run: (input: string) => string, ids: { store: string; table: string; actor: string }) => void) {
  const name = `p2_resolver_${randomUUID().replaceAll("-", "")}`;
  const run = (input: string) => sql(name, input);
  const store = randomUUID(), table = randomUUID(), actor = randomUUID();
  sql("postgres", `create database ${name}`);
  try {
    run("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;create schema extensions;create extension pgcrypto schema extensions;");
    for (const file of ["20261023000100_foundation.sql", "20261023000200_owner_bootstrap_privileges.sql", "20261023000300_table_sessions_guest_access.sql", "20261023000400_session_row_lock_privileges.sql", "20261023000500_menu.sql"])
      run(endings(readFileSync(`supabase/migrations/${file}`, "utf8"), eol));
    run(`insert into auth.users values('${actor}');insert into public.stores(id,name) values('${store}','Resolver legacy');
      insert into public.owner_members(store_id,auth_user_id) values('${store}','${actor}');
      insert into public.dining_tables(id,store_id,label) values('${table}','${store}','Legacy 01');
      insert into public.qr_codes(store_id,type,table_id,public_code) values('${store}','table','${table}','legacy-table'),('${store}','takeaway',null,'legacy-takeaway');
      insert into public.table_sessions(store_id,table_id,code_hash,code_expires_at) values('${store}','${table}',repeat('c',64),clock_timestamp()+interval '24 hours');`);
    test(run, { store, table, actor });
  } finally { sql("postgres", `drop database ${name} with (force)`); }
}

// Compare the logical public schema (including ACLs, triggers, functions,
// constraints and indexes) as well as every pre-existing resource row.
// pg_class physical statistics/hint flags may survive aborted DDL; those are
// not schema changes, so inspect actual catalog definitions instead.
const snapshot = `select jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'kind',c.relkind,'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'options',c.reloptions) order by c.oid) from pg_class c where c.relnamespace='public'::regnamespace),
 'columns',(select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace),
 'defaults',(select jsonb_agg(to_jsonb(a) order by a.oid) from pg_attrdef a join pg_class c on c.oid=a.adrelid where c.relnamespace='public'::regnamespace),
 'indexes',(select jsonb_agg(to_jsonb(i) order by i.indexrelid) from pg_index i join pg_class c on c.oid=i.indrelid where c.relnamespace='public'::regnamespace),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace),
 'constraints',(select jsonb_agg(to_jsonb(c) order by c.oid) from pg_constraint c where c.connamespace='public'::regnamespace),
 'functions',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p where p.pronamespace='public'::regnamespace),
 'triggers',(select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace),
 'stores',(select jsonb_agg(to_jsonb(t) order by id) from public.stores t),
 'tables',(select jsonb_agg(to_jsonb(t) order by id) from public.dining_tables t),
 'qrs',(select jsonb_agg(to_jsonb(t) order by id) from public.qr_codes t),
 'sessions',(select jsonb_agg(to_jsonb(t) order by id) from public.table_sessions t));`;
function expectSnapshot(run: (input: string) => string, before: string) {
  const after = JSON.parse(run(snapshot)), expected = JSON.parse(before);
  const differences: string[] = [];
  function compare(a: unknown, b: unknown, path: string) {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    } else differences.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  }
  compare(expected, after, "snapshot");
  expect(differences).toEqual([]);
}
const resources = `select jsonb_build_object(
 'tables',(select jsonb_agg(to_jsonb(t) order by id) from public.dining_tables t),
 'qrs',(select jsonb_agg(to_jsonb(t)-'retired_at' order by id) from public.qr_codes t),
 'sessions',(select jsonb_agg(to_jsonb(t) order by id) from public.table_sessions t));`;

it.each([
  { baselineName: "LF", baselineEol: "\n", migrationName: "LF", migrationEol: "\n" },
  { baselineName: "LF", baselineEol: "\n", migrationName: "CRLF", migrationEol: "\r\n" },
  { baselineName: "CRLF", baselineEol: "\r\n", migrationName: "LF", migrationEol: "\n" },
  { baselineName: "CRLF", baselineEol: "\r\n", migrationName: "CRLF", migrationEol: "\r\n" },
])("installs foundation $baselineName / migration006 $migrationName", ({ baselineEol, migrationEol }) => {
    scratch(baselineEol, (run) => {
      expect(md5(body)).toBe("7fb5e08b689e4bd0f6f2ac1b98130396");
      expect(md5(patchedBody)).toBe("f80bcdba939630909ac8cf32cc8b8280");
      const before = run(resources);
      run(endings(migration, migrationEol));
      expect(run(resources)).toBe(before);
      expect(run("select md5(replace(prosrc,E'\\r\\n',E'\\n')) from pg_proc where oid='public.p2_execute(text,jsonb)'::regprocedure")).toBe(md5(patchedBody));
      expect(run("select count(*) from pg_constraint where conname in ('qr_retired_inactive','dining_tables_normalized_label_valid') and convalidated")).toBe("2");
      expect(run("select count(*) from pg_indexes where indexname in ('dining_tables_normalized_label','qr_codes_one_active_table','qr_codes_one_active_takeaway')")).toBe("3");
      // Same key/threshold/response as migration003: the 61st read is limited.
      const input = JSON.stringify({ qrCode: "legacy-takeaway", browserHash: "a".repeat(64), grantProof: "b".repeat(64), newBrowser: true });
      const resolved = run(`set role service_role;select public.p2_execute('resolve','${input}') from generate_series(1,61);`).split("\n").map(v => JSON.parse(v));
      expect(resolved.slice(0,60).every(v => v.data?.type === "takeaway")).toBe(true);
      expect(resolved[60]).toMatchObject({ error: "RATE_LIMITED" });
      expect(resolved[60].retryAfterSeconds).toBeGreaterThan(0);
    });
  });

it("reproduces the old CRLF marker failure and rolls back preceding migration DDL and grants", () => {
  scratch("\r\n", run => {
    const before = run(snapshot);
    const start = migration.indexOf("do $$ declare source text;");
    const end = migration.indexOf("end $$;", start) + "end $$;".length;
    const legacy = `do $$ declare source text; original text; begin
 source:=replace(pg_get_functiondef('public.p2_execute(text,jsonb)'::regprocedure),E'\\r\\n',E'\\n');
 original:=$old$if action='resolve' then
   retry:=public.p2_rate('read:'$old$;
 if position(original in source)=0 then raise exception 'P2-C04 resolver preflight: unexpected rate marker'; end if;
end $$;`;
    const broken = endings(migration.slice(0,start)+legacy+migration.slice(end), "\r\n");
    try { run(broken); throw Error("Expected marker rejection"); }
    catch (error) { expect(String((error as { stderr?: string }).stderr)).toContain("P2-C04 resolver preflight: unexpected rate marker"); }
    expectSnapshot(run, before);
  });
});

it.each([
  ["rate policy", (s: string) => s.replace("||q.id,60)", "||q.id,61)")],
  ["missing marker", (s: string) => s.replace("if action='resolve' then", "if action = 'resolve' then")],
  ["duplicate marker", (s: string) => `${s}\n-- if action='resolve' then\n--    retry:=public.p2_rate('read:'`],
  ["session lock", (s: string) => s.replace("status in ('open','checkout_pending') for share", "status in ('open','checkout_pending')")],
] as const)("rejects unknown %s drift without touching schema, grants, resources or the existing function", (_name, change) => {
  scratch("\n", run => {
    run(functionSql(change(body)));
    const before = run(snapshot);
    try { run(migration); throw Error("Expected baseline rejection"); }
    catch (error) { expect(String((error as { stderr?: string }).stderr)).toContain("P2-C04 resolver preflight: unexpected p2_execute baseline"); }
    expectSnapshot(run, before);
  });
});

it("can roll back the entire successful migration before commit, preserving live sessions and printed QR", () => {
  scratch("\n", run => {
    const before = run(snapshot);
    run(migration.replace(/commit;\s*$/, "rollback;"));
    expectSnapshot(run, before);
    // Diagnostic runs without writes on the baseline too.
    const diagnostic = JSON.parse(run(readFileSync("supabase/diagnostics/p2_c04_resolver_preflight.sql", "utf8")));
    expect(diagnostic.function.body_status).toBe("migration003_baseline");
    expect(diagnostic.marker_diagnostics.normalized_lf_marker_position).toBeGreaterThan(0);
    expect(diagnostic.marker_diagnostics.old_crlf_marker_in_normalized_source).toBe(0);
    expect(diagnostic.migration006_artifacts).toEqual({ lifecycle_rpc: null, label_normalizer: null, audit_table: null, retired_at_column: false });
    expect(diagnostic.row_counts).toEqual({ dining_tables: 1, qr_codes: 2, table_sessions: 1 });
    expectSnapshot(run, before);
  });
});
