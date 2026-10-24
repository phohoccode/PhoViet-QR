import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("012 preflight/rollback/CRLF preserves rows, constraints, server-only ACL and strict FIFO lock order", () => {
  const db = `review_migration_${randomUUID().replaceAll("-", "")}`;
  const sql = (database: string, input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  sql("postgres", `create database ${db}`);
  try {
    sql(db, "create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql") && f < "20261024001200").sort()) {
      sql(db, readFileSync(`supabase/migrations/${file}`, "utf8"));
      if (file.includes("foundation")) sql(db, "revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;");
    }
    const fixture = randomUUID(), table = randomUUID(), qr = randomUUID(), session = randomUUID();
    sql(db, `insert into public.stores(id,name) values('${fixture}','Preserved');
      insert into public.dining_tables(id,store_id,label) values('${table}','${fixture}','Preserved');
      insert into public.qr_codes(id,store_id,type,table_id) values('${qr}','${fixture}','table','${table}');
      insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${session}','${fixture}','${table}','${"a".repeat(64)}',clock_timestamp()+interval '24 hours');`);
    const rows = () => sql(db, `select row_to_json(t) from (select s.*,d.*,q.*,x.* from public.stores s join public.dining_tables d on d.store_id=s.id join public.qr_codes q on q.table_id=d.id join public.table_sessions x on x.table_id=d.id where s.id='${fixture}') t`);
    const beforeRows = rows();
    const catalog = () => sql(db, "select md5(string_agg(p.oid::regprocedure::text||':'||p.prosrc||':'||coalesce(p.proacl::text,''),',' order by p.proname)) from pg_proc p where pronamespace='public'::regnamespace");
    const before = catalog(), migration = readFileSync("supabase/migrations/20261024001200_payment_review_queue.sql", "utf8");
    sql(db, migration.replace(/commit;\s*$/, "rollback;"));
    expect(catalog()).toBe(before); expect(rows()).toBe(beforeRows);
    expect(sql(db, "select to_regprocedure('public.p4_order_payment_held(public.orders)') is null")).toBe("t");
    for (const signature of ["p3_owner_orders_execute(text,jsonb)", "p4_process(uuid)", "p4_payment_execute(text,jsonb)", "p4_payment_view(public.payment_intents)", "p3_order_summary(public.orders)", "p4_emit(public.orders,text)"]) {
      const original = sql(db, `select pg_get_functiondef('public.${signature}'::regprocedure)`);
      // Harmless whitespace drift must still require review; not silently overwrite.
      sql(db, original.replace(/AS \$function\$/, "AS $function$\n-- TEST ONLY unexpected drift"));
      expect(() => sql(db, migration)).toThrow();
      expect(sql(db, "select to_regprocedure('public.p4_order_payment_held(public.orders)') is null")).toBe("t");
      sql(db, original.replaceAll("\n", "\r\n"));
    }
    const processDefinition = sql(db, "select pg_get_functiondef('public.p4_process(uuid)'::regprocedure)").replaceAll("\r", "");
    sql(db, "alter function public.p4_process(uuid) rename to test_missing_process");
    expect(() => sql(db, migration)).toThrow(/unexpected function body for public.p4_process/);
    expect(sql(db, "select to_regprocedure('public.p4_order_payment_held(public.orders)') is null")).toBe("t");
    sql(db, "alter function public.test_missing_process(uuid) rename to p4_process");
    sql(db, "alter function public.p4_payment_execute(text,jsonb) rename to test_missing_payment_execute");
    expect(() => sql(db, migration)).toThrow(/unexpected function body for public.p4_payment_execute/);
    sql(db, "alter function public.test_missing_payment_execute(text,jsonb) rename to p4_payment_execute");

    // Reconstruct the complete operator-supplied legacy body without depending
    // on a developer's attachment path. Verify its exact audited digest first.
    const legacy = processDefinition
      .replace("acceptance timestamptz; outcome text;", "acceptance timestamptz; event_id uuid; outcome text;")
      .replace("    if o.ticket_no is null then\n     update public.orders set status='payment_exception' where id=o.id returning * into o;\n     perform public.p4_emit(o,'payment.exception');\n    end if;",
        "    if o.ticket_no is null then update public.orders set status='payment_exception' where id=o.id returning * into o; end if;");
    sql(db, legacy.replaceAll("\n", "\r\n"));
    expect(sql(db, "select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.p4_process(uuid)'::regprocedure")).toBe("67364a173189c8d1f482723223b61c68");
    const legacyCatalog = catalog();
    sql(db, migration.replace(/commit;\s*$/, "rollback;"));
    expect(catalog()).toBe(legacyCatalog); expect(rows()).toBe(beforeRows);
    sql(db, legacy.replace(/AS \$function\$/, () => "AS $function$\n-- Unreviewed legacy drift"));
    expect(() => sql(db, migration)).toThrow(/unexpected function body for public.p4_process/);
    expect(sql(db, "select to_regprocedure('public.p4_order_payment_held(public.orders)') is null")).toBe("t");
    sql(db, legacy);

    // Reconstruct the second operator export from the exact 010 baseline.
    // Its digest checks the entire body, including unaffected branches.
    const paymentDefinition = sql(db, "select pg_get_functiondef('public.p4_payment_execute(text,jsonb)'::regprocedure)").replaceAll("\r", "");
    const legacyPayment = paymentDefinition
      .replace("where status='pending'\n    and store_id=(input->>'configuredStoreId')::uuid and channel_hash=input->>'channelHash'\n    order by last_checked_at nulls first,created_at,id limit 10", "where status='pending' order by expires_at,id limit 100")
      .replace(/ if action='inspect' then[\s\S]*? elsif action='expire' then/, " if action='expire' then")
      .replace("set status=case when needs_reconciliation then 'exception' else 'expired' end,updated_at", "set status='expired',updated_at")
      .replace("   update public.orders set status=case when i.needs_reconciliation then 'payment_exception' else 'cancelled' end where id=i.order_id and status='pending_payment' returning * into o;\n   if found then perform public.p4_emit(o,case when i.needs_reconciliation then 'payment.exception' else 'payment.expired' end); end if;", "   update public.orders set status='cancelled' where id=i.order_id and status='pending_payment';")
      .replace("   update public.orders set status=status where id=i.order_id returning * into o;\n   perform public.p4_emit(o,'payment.instructions');", "   update public.orders set status=status where id=i.order_id;")
      .replace("input->>'status' in('PAID','UNDERPAID')", "input->>'status'='PAID'");
    sql(db, legacyPayment.replaceAll("\n", "\r\n"));
    expect(sql(db, "select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.p4_payment_execute(text,jsonb)'::regprocedure")).toBe("e415f94cbf8ab1f5ac7d34242239a1ca");
    const combinedLegacyCatalog = catalog();
    sql(db, migration.replace(/commit;\s*$/, "rollback;"));
    expect(catalog()).toBe(combinedLegacyCatalog);
    sql(db, legacyPayment.replace(/AS \$function\$/, () => "AS $function$\n-- Unreviewed payment executor drift"));
    expect(() => sql(db, migration)).toThrow(/unexpected function body for public.p4_payment_execute/);
    sql(db, legacyPayment);
    // The supplied function export omitted this helper. Its absence is an
    // explicitly supported legacy state, whereas a drifted emitter is rejected.
    sql(db, "drop function public.p4_emit(public.orders,text)");
    const missingEmitterCatalog = catalog();
    sql(db, migration.replace(/commit;\s*$/, "rollback;"));
    expect(catalog()).toBe(missingEmitterCatalog);
    expect(sql(db, "select to_regprocedure('public.p4_emit(public.orders,text)') is null")).toBe("t");

    // TEST ONLY: reproduce legacy outbox variable shadowing in this disposable
    // database. No provider calls or Production payment evidence is involved.
    const paymentStore = randomUUID(), category = randomUUID(), item = randomUUID(), order = randomUUID(), intent = randomUUID(), inbox = randomUUID();
    sql(db, `begin;
      insert into public.stores(id,name) values('${paymentStore}','Payment test');
      insert into public.menu_categories(id,store_id,name) values('${category}','${paymentStore}','Test');
      insert into public.menu_items(id,store_id,category_id,name,price_vnd) values('${item}','${paymentStore}','${category}','Test',35000);
      insert into public.orders(id,store_id,type,status,client_request_id,total_vnd,item_count)
        values('${order}','${paymentStore}','takeaway','pending_payment','${randomUUID()}',35000,1);
      insert into public.order_items(store_id,order_id,ordinal,item_id,name_snapshot,base_unit_price_vnd,options_snapshot,unit_price_vnd,qty,line_total_vnd)
        values('${paymentStore}','${order}',1,'${item}','Test',35000,'[]',35000,1,35000);
      insert into public.payment_intents(id,store_id,order_id,channel_hash,account_number,amount_vnd)
        values('${intent}','${paymentStore}','${order}','${"a".repeat(64)}','12345678',35000);
      insert into public.payment_webhook_inbox(id,provider,event_id,transaction_id,channel_hash,event,evidence)
        select '${inbox}','payos','test-event','test-transaction',channel_hash,
        jsonb_build_object('reference',provider_reference,'amountVnd',35000,'currency','VND','accountNumber',account_number,
          'paymentLinkId','test-link','paid',true,'occurredAt',clock_timestamp()),'{}'
        from public.payment_intents where id='${intent}'; commit;`);
    expect(sql(db, `set role service_role;select public.p4_process('${inbox}')`)).toBe('{"error": "INTERNAL_ERROR"}');
    expect(sql(db, `select state,reason from public.payment_webhook_inbox where id='${inbox}'`)).toBe("failed|PROCESSING_FAILED");
    expect(sql(db, `select status,ticket_no is null from public.orders where id='${order}'`)).toBe("pending_payment|t");
    expect(sql(db, "select count(*) from public.payments")).toBe("0");
    const evidence = () => sql(db, `select jsonb_build_object(${["payment_intents", "payments", "payment_webhook_inbox", "orders", "order_events", "outbox_events", "operation_requests"]
      .map(name => `'${name}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${name} t)`).join(",")})`);
    const beforeEvidence = evidence(), beforeUpgradeCatalog = catalog();
    sql(db, migration.replace(/commit;\s*$/, "rollback;"));
    expect(catalog()).toBe(beforeUpgradeCatalog);
    expect(rows()).toBe(beforeRows); expect(evidence()).toBe(beforeEvidence);
    sql(db, migration.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
    expect(rows()).toBe(beforeRows);
    expect(evidence()).toBe(beforeEvidence);
    expect(sql(db, "select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated")).toBe("0");
    for (const name of ["p4_emit(public.orders,text)", "p4_order_payment_held(public.orders)", "p3_owner_orders_execute(text,jsonb)", "p4_process(uuid)", "p4_payment_execute(text,jsonb)", "p4_payment_view(public.payment_intents)", "p3_order_summary(public.orders)"]) {
      expect(sql(db, `select has_function_privilege('anon','public.${name}','execute'),has_function_privilege('authenticated','public.${name}','execute'),has_function_privilege('service_role','public.${name}','execute')`)).toBe("f|f|t");
    }
    expect(sql(db, "set role service_role;select public.p3_owner_orders_execute('claim','{}')")).toBe('{"error": "FORBIDDEN"}');
    const owner = sql(db, "select prosrc from pg_proc where oid='public.p3_owner_orders_execute(text,jsonb)'::regprocedure");
    expect(owner.toLowerCase().replace(/--[^\n]*/g, "")).not.toContain("skip locked");
    expect(owner).toContain("for no key update");
    expect(owner.indexOf("for no key update")).toBeLessThan(owner.indexOf("for share"));
    expect(owner.indexOf("for share")).toBeLessThan(owner.indexOf("for update"));
    expect(sql(db, `set role service_role;select jsonb_array_length(public.p4_payment_execute('jobs',
      '{"configuredStoreId":"${paymentStore}","channelHash":"${"a".repeat(64)}"}')->'data'->'intents')`)).toBe("1");
    expect(sql(db, `set role service_role;select jsonb_array_length(public.p4_payment_execute('jobs',
      '{"configuredStoreId":"${fixture}","channelHash":"${"a".repeat(64)}"}')->'data'->'intents')`)).toBe("0");
    expect(sql(db, `set role service_role;select public.p4_payment_execute('inspect',
      '{"intentId":"${intent}","channelHash":"${"a".repeat(64)}"}')->'data'->>'pending'`)).toBe("true");
    // The same durable failed receipt can now complete, once, without resetting
    // its evidence or assigning a second ticket on retry.
    expect(sql(db, `set role service_role;select public.p4_process('${inbox}')->'data'->>'outcome'`)).toBe("accepted");
    expect(sql(db, `set role service_role;select public.p4_process('${inbox}')->'data'->>'outcome'`)).toBe("duplicate");
    expect(sql(db, "select count(*) from public.payments")).toBe("1");
    expect(sql(db, `select status,ticket_no from public.orders where id='${order}'`)).toBe("accepted|1");
    expect(sql(db, "select count(*),bool_and(id=(payload->>'eventId')::uuid) from public.outbox_events")).toBe("2|t");
    // An observation arriving after the webhook must not re-hold a paid order.
    sql(db, `set role service_role;select public.p4_payment_execute('observe',
      '{"intentId":"${intent}","channelHash":"${"a".repeat(64)}","status":"PAID"}')`);
    expect(sql(db, `select needs_reconciliation from public.payment_intents where id='${intent}'`)).toBe("f");
    // The restored emitter must work under service_role for a real SQL hold
    // transition, preserving the existing ledger and original ticket.
    const extraInbox = randomUUID();
    sql(db, `insert into public.payment_webhook_inbox(id,provider,event_id,transaction_id,channel_hash,event,evidence)
      select '${extraInbox}',provider,'extra-event','extra-transaction',channel_hash,event||'{"amountVnd":1}'::jsonb,'{}'
      from public.payment_webhook_inbox where id='${inbox}'`);
    expect(sql(db, `set role service_role;select public.p4_process('${extraInbox}')->'data'->>'outcome'`)).toBe("recorded_exception");
    expect(sql(db, `select status,ticket_no,public.p4_order_payment_held(o) from public.orders o where id='${order}'`)).toBe("accepted|1|t");
    expect(sql(db, "select count(*) from public.payments")).toBe("1");
    expect(sql(db, `select count(*) from public.outbox_events where topic='payment.review_required' and aggregate_id='${order}'`)).toBe("1");
  } finally { sql("postgres", `drop database ${db} with (force)`); }
});
