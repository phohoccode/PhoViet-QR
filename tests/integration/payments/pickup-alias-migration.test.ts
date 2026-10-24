import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("HF02: audited Production shadowing reproduces; guarded 013 restores authorized tracking and recovery without rewriting evidence", () => {
  const db = `pickup_alias_${randomUUID().replaceAll("-", "")}`;
  const sql = (database: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const run = (input: string) => sql(db, input);
  const migration = readFileSync("supabase/migrations/20261024001300_pickup_alias_resolution.sql", "utf8");
  sql("postgres", `create database ${db}`);
  try {
    run("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < "20261024001300").sort()) {
      run(readFileSync(`supabase/migrations/${file}`, "utf8"));
      if (file.includes("foundation")) run("revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;");
    }
    const definition = run("select pg_get_functiondef('public.p4_pickup_execute(text,jsonb)'::regprocedure)").replaceAll("\r", "");
    const digest = () => run("select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.p4_pickup_execute(text,jsonb)'::regprocedure");
    expect(digest()).toBe("7c86603159699872946cc1625f510289");
    const legacy = definition.replace("#variable_conflict use_column", "#variable_conflict use_variable")
      .replace("and o.accepted_at+interval '24 hours'>clock_timestamp()\n    and i.status", "and i.status");
    run(legacy.replaceAll("\n", "\r\n"));
    expect(digest()).toBe("3f34f992a922d5f4f108f0225edbe9b9");

    const store = randomUUID(), category = randomUUID(), item = randomUUID(), order = randomUUID(), intent = randomUUID(), inbox = randomUUID();
    const browser = "b".repeat(64), proof = "TEST_ONLY_GRANT";
    run(`begin;
      insert into public.stores(id,name) values('${store}','HF02 isolated fixture');
      insert into public.menu_categories(id,store_id,name) values('${category}','${store}','Test');
      insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${store}','${category}','Test',3000);
      insert into public.orders(id,store_id,type,status,client_request_id,total_vnd,item_count)
        values('${order}','${store}','takeaway','pending_payment','${randomUUID()}',3000,1);
      insert into public.order_items(store_id,order_id,ordinal,item_id,name_snapshot,base_unit_price_vnd,options_snapshot,unit_price_vnd,qty,line_total_vnd)
        values('${store}','${order}',1,'${item}','Test',3000,'[]',3000,1,3000);
      insert into public.payment_intents(id,store_id,order_id,channel_hash,account_number,amount_vnd)
        values('${intent}','${store}','${order}','${"a".repeat(64)}','12345678',3000);
      insert into public.guest_browser_contexts(token_hash) values('${browser}');
      insert into public.takeaway_requests(store_id,client_request_id,order_id,browser_context_hash,proof_hash,request_fingerprint,result_json)
        values('${store}','${randomUUID()}','${order}','${browser}',encode(extensions.digest('${proof}:${order}','sha256'),'hex'),'TEST_ONLY','{}');
      insert into public.payment_webhook_inbox(id,provider,event_id,transaction_id,channel_hash,event,evidence)
        select '${inbox}','payos','test-event','test-transaction',channel_hash,
        jsonb_build_object('reference',provider_reference,'amountVnd',3000,'currency','VND','accountNumber',account_number,
          'paymentLinkId','test-link','paid',true,'occurredAt',clock_timestamp()),'{}'
        from public.payment_intents where id='${intent}';commit;`);
    expect(JSON.parse(run(`set role service_role;select public.p4_process('${inbox}')`)).data.outcome).toBe("accepted");
    run(`update public.orders set status='ready' where id='${order}'`);
    const rpc = (action: string, input: Record<string, unknown>) => JSON.parse(run(`set role service_role;select public.p4_pickup_execute('${action}','${JSON.stringify(input)}')`));
    const valid = { orderId: order, browserHash: browser, grantProof: proof };
    // These three observed failures occur despite a valid ledger and guest scope.
    expect(rpc("tracking", valid)).toEqual({ error: "ORDER_NOT_FOUND" });
    expect(rpc("missing", {}).data).not.toContain(order);
    expect(rpc("issue_context", { orderId: order }).data).toBeNull();
    const rows = () => run(`select jsonb_build_object(${["orders", "payment_intents", "payments", "payment_webhook_inbox", "order_events", "outbox_events", "pickup_credentials", "takeaway_requests"]
      .map(name => `'${name}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${name} t)`).join(",")})`);
    const before = rows();
    run(migration.replace(/commit;\s*$/, "rollback;"));
    expect(digest()).toBe("3f34f992a922d5f4f108f0225edbe9b9");
    expect(rows()).toBe(before);
    run(legacy.replace(/AS \$function\$/, () => "AS $function$\n-- unreviewed drift"));
    expect(() => run(migration)).toThrow(/unexpected pickup executor/);
    expect(rows()).toBe(before);
    run(legacy);
    run("alter function public.p4_pickup_execute(text,jsonb) rename to test_missing_pickup");
    expect(() => run(migration)).toThrow(/unexpected pickup executor/);
    run("alter function public.test_missing_pickup(text,jsonb) rename to p4_pickup_execute");
    run(migration.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
    expect(digest()).toBe("7c86603159699872946cc1625f510289");
    expect(rows()).toBe(before);
    // Canonical 011 is also supported, including repeat application.
    run(migration);
    expect(rows()).toBe(before);
    expect(rpc("tracking", valid)).toMatchObject({ data: { order: { id: order, status: "ready", ticketNo: 1 }, delivery: null } });
    expect(run("select count(*) from public.pickup_credentials")).toBe("0");
    expect(rpc("missing", {}).data).toContain(order);
    expect(rpc("issue_context", { orderId: order }).data).toEqual({ id: order, storeId: store });
    for (const bad of [{ ...valid, browserHash: "c".repeat(64) }, { ...valid, grantProof: "WRONG" }, { ...valid, orderId: intent }, { ...valid, orderId: randomUUID() }, { orderId: order }])
      expect(rpc("tracking", bad)).toEqual({ error: "ORDER_NOT_FOUND" });
    const issue = { orderId: order, storeId: store, codeHash: "d".repeat(64), ciphertext: { iv: "a".repeat(16), tag: "a".repeat(22) + "==", ciphertext: "a".repeat(8) }, encryptionKeyId: "test", hmacKeyId: "test" };
    expect(rpc("issue", issue)).toEqual({ data: { issued: true } });
    const stored = run("select row_to_json(c) from public.pickup_credentials c");
    for (let n = 0; n < 3; n++) {
      expect(rpc("issue", issue)).toEqual({ data: { issued: false } });
      expect(rpc("tracking", valid).data.delivery).toMatchObject({ ciphertext: issue.ciphertext, encryptionKeyId: "test" });
    }
    expect(run("select row_to_json(c) from public.pickup_credentials c")).toBe(stored);
    expect(run(`select count(*) from public.order_events where order_id='${order}' and event_type='pickup.issued'`)).toBe("1");
    expect(run(`select status,ticket_no,version from public.orders where id='${order}'`)).toBe("ready|1|3");
    expect(run("select count(*) from public.payments")).toBe("1");
    expect(rpc("missing", {}).data).not.toContain(order);
    expect(rpc("issue_context", { orderId: order }).data).toBeNull();
    expect(run("select has_function_privilege('anon','public.p4_pickup_execute(text,jsonb)','execute'),has_function_privilege('authenticated','public.p4_pickup_execute(text,jsonb)','execute'),has_function_privilege('service_role','public.p4_pickup_execute(text,jsonb)','execute')")).toBe("f|f|t");
    expect(run("select prosecdef,proconfig from pg_proc where oid='public.p4_pickup_execute(text,jsonb)'::regprocedure")).toContain("f|{search_path=pg_catalog,lock_timeout=3s}");
    expect(run("select bool_and(relrowsecurity) from pg_class where oid in('public.pickup_credentials'::regclass,'public.pickup_attempt_log'::regclass)")).toBe("t");

    // The deployed legacy table independently lacks the timestamp used by C04
    // jobs/inspect, which would prevent a scheduled pickup recovery batch.
    const workerMigration = readFileSync("supabase/migrations/20261024001400_payment_worker_legacy_column.sql", "utf8");
    const worker = run("select pg_get_functiondef('public.p4_payment_execute(text,jsonb)'::regprocedure)");
    const workerInput = JSON.stringify({ configuredStoreId: store, channelHash: "a".repeat(64) });
    const jobs = () => run(`set role service_role;select public.p4_payment_execute('jobs','${workerInput}')`);
    const beforeWorker = rows();
    run("alter table public.payment_intents drop column last_checked_at");
    expect(jobs).toThrow(/last_checked_at/);
    run(workerMigration.replace(/commit;\s*$/, "rollback;"));
    expect(jobs).toThrow(/last_checked_at/);
    run(worker.replace(/AS \$function\$/, () => "AS $function$\n-- unreviewed worker drift"));
    expect(() => run(workerMigration)).toThrow(/unexpected payment executor/);
    run(worker);
    run("alter table public.payment_intents add column last_checked_at text");
    expect(() => run(workerMigration)).toThrow(/unexpected last_checked_at column type/);
    run("alter table public.payment_intents drop column last_checked_at");
    run(workerMigration);
    run(workerMigration);
    expect(rows()).toBe(beforeWorker);
    expect(JSON.parse(jobs())).toMatchObject({ data: { events: [], intents: [] } });
    run(`set role service_role;select public.p4_payment_execute('inspect','${JSON.stringify({ intentId: intent, channelHash: "a".repeat(64) })}')`);
    expect(run(`select last_checked_at is not null from public.payment_intents where id='${intent}'`)).toBe("t");
  } finally {
    sql("postgres", `drop database ${db} with(force)`);
  }
});
