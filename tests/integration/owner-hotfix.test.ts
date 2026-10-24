import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';

// All destructive fixtures and races are confined to a disposable local DB.
const db = `hf01_${randomUUID().replaceAll('-', '')}`;
const args = (name = db) => ['exec', '-i', 'supabase_db_qr-ordering-p1c02-local', 'psql', '-U', 'postgres', '-d', name, '-Atq', '-v', 'ON_ERROR_STOP=1'];
const sql = (q: string, name = db) => execFileSync('docker', args(name), { input: q, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const parallel = async (q: string) => (await promisify(execFile)('docker', [...args(), '-c', q])).stdout.trim();
const j = (v: unknown) => JSON.stringify(v).replaceAll("'", "''");
const query = (fn: string, action: string, input: object) => `set role service_role;select public.${fn}('${action}','${j(input)}')`;
const rpc = (fn: string, action: string, input: object) => JSON.parse(sql(query(fn, action, input)));
const sid = randomUUID(), actor = randomUUID(), other = randomUUID(), stranger = randomUUID();
const scope = { storeId: sid, ownerId: actor };
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const browser = hash('HF01 buyer'), proof = hash('HF01 proof');
const archive = (kind: string, id: string, overrides = {}) => rpc('hf01_owner_execute', `archive_${kind}`, { ...scope, id, ...overrides });
function table() {
  const id = randomUUID(), code = randomUUID();
  sql(`insert into public.dining_tables(id,store_id,label) values('${id}','${sid}','${id}');insert into public.qr_codes(store_id,type,table_id,public_code) values('${sid}','table','${id}','${code}')`);
  return { id, code };
}
function category() {
  const id = randomUUID(); sql(`insert into public.menu_categories(id,store_id,name) values('${id}','${sid}','${id}')`); return id;
}
function item(cat = category()) {
  const id = randomUUID(); sql(`insert into public.menu_items(id,store_id,category_id,name,price_vnd,image_url) values('${id}','${sid}','${cat}','Snapshot soup',10000,'https://images.unsplash.com/old')`); return id;
}
function open(t: string) {
  const id = randomUUID();
  sql(`insert into public.table_sessions(id,store_id,table_id,code_hash,code_expires_at) values('${id}','${sid}','${t}','${hash(id)}',clock_timestamp()+interval '24 hours');
    insert into public.guest_access(store_id,scope_id,token_hash,browser_context_hash,expires_at) values('${sid}','${id}','${hash(`${proof}:${id}`)}','${browser}',clock_timestamp()+interval '6 hours')`);
  return id;
}
function createOrder(code: string, id: string, optionIds: string[] = []) {
  const command = { qrCode: code, clientRequestId: randomUUID(), menuRevision: sql(`select menu_revision from public.stores where id='${sid}'`), items: [{ menuItemId: id, quantity: 1, optionIds, note: null }], note: null };
  return rpc('p3_order_execute', 'create', { browserHash: browser, grantProof: proof, command });
}
function openInput(tableId: string) {
  return { ...scope,tableId,requestId:randomUUID(),sessionId:randomUUID(),verifier:hash(tableId),pepperId:'test',keyId:'test',artifact:{iv:'A'.repeat(16),tag:'A'.repeat(22)+'==',ciphertext:'A'.repeat(8)} };
}
async function waitSleeping(name: string) {
  for(let n=0;n<60;n++) {
    if(sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event='PgSleep')`)==='t') return;
    await new Promise(r=>setTimeout(r,20));
  }
  throw Error('Race fixture did not reach lock barrier');
}
function settle(session: string) {
  let bill = rpc('p5_session_execute', 'owner_bill', { ...scope, sessionId: session }).data;
  const prepared = rpc('p5_session_execute', 'begin_checkout', { ...scope, sessionId: session, requestId: randomUUID(), expectedVersion: bill.session.version, expectedBillVersion: bill.billVersion });
  expect(prepared.error).toBeUndefined(); bill = prepared.data.bill;
  return rpc('p5_session_execute', 'confirm_received', { ...scope, sessionId: session, requestId: randomUUID(), expectedVersion: bill.session.version, expectedBillVersion: bill.billVersion, paymentMethod: 'cash', receivedConfirmed: true });
}

beforeAll(() => {
  sql(`create database ${db}`, 'postgres');
  sql('create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && f < '20261024001800').sort()) {
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file.includes('foundation')) sql('revoke all on public.stores,public.owner_members,public.dining_tables,public.qr_codes from service_role;');
  }
  const migration = readFileSync('supabase/migrations/20261024001800_owner_hotfix_01.sql', 'utf8');
  sql(migration.replace(/commit;\s*$/, 'rollback;'));
  expect(sql("select to_regclass('public.menu_image_assets') is null")).toBe('t');
  sql(migration);
  sql(`insert into auth.users values('${actor}'),('${stranger}');insert into public.stores(id,name) values('${sid}','HF01 test'),('${other}','Other tenant');
   insert into public.owner_members(store_id,auth_user_id) values('${sid}','${actor}'),('${other}','${stranger}');
   insert into public.guest_browser_contexts(token_hash) values('${browser}');`);
}, 60000);
afterAll(() => sql(`drop database ${db} with(force)`, 'postgres'));
beforeEach(() => sql('delete from public.security_rate_buckets'));

it('invoker-only RPC and tenant isolation, including nonexistent owner', () => {
  for (const fn of ['hf01_owner_execute(text,jsonb)', 'hf01_image_cleanup(text,jsonb)']) {
    expect(sql(`select prosecdef,has_function_privilege('anon','public.${fn}','execute'),has_function_privilege('authenticated','public.${fn}','execute'),has_function_privilege('service_role','public.${fn}','execute') from pg_proc where oid='public.${fn}'::regprocedure`)).toBe('f|f|f|t');
  }
  expect(sql("select has_table_privilege('anon','public.menu_image_assets','select'),has_table_privilege('authenticated','public.menu_image_assets','insert')")).toBe('f|f');
  expect(archive('table', table().id, { ownerId: stranger }).error).toBe('FORBIDDEN');
  expect(archive('table', table().id, { ownerId: randomUUID() }).error).toBe('FORBIDDEN');
  expect(archive('item', item(), { storeId: other, ownerId: stranger }).error).toBe('RESOURCE_NOT_FOUND');
  expect(archive('table', table().id, { storeId: other, ownerId: stranger }).error).toBe('RESOURCE_NOT_FOUND');
  expect(archive('category', category(), { storeId: other, ownerId: stranger }).error).toBe('RESOURCE_NOT_FOUND');
});

it('archives empty table once, retires QR, hides table and refuses old QR/open', () => {
  const t = table(); const first = archive('table', t.id).data;
  expect(first.success).toBe(true); expect(archive('table', t.id).data).toEqual(first);
  expect(sql(`select active,retired_at is not null from public.qr_codes where table_id='${t.id}'`)).toBe('f|t');
  expect(rpc('p2_table_qr_execute', 'tables', scope).data.tables.some((x: { id: string }) => x.id === t.id)).toBe(false);
  expect(rpc('p2_execute', 'resolve', { qrCode: t.code, browserHash: browser, grantProof: proof }).error).toBe('INVALID_QR');
  expect(sql(`select count(*) from public.table_qr_audit_log where entity_id='${t.id}' and operation='archive_table'`)).toBe('1');
  expect(() => sql(`update public.dining_tables set active=true where id='${t.id}'`)).toThrow();
});

it('blocks live sessions with zero items and checkout_pending; permits a genuinely empty closed session', () => {
  const t = table(), s = open(t.id);
  expect(archive('table', t.id).error).toBe('TABLE_IN_USE');
  sql(`update public.table_sessions set status='checkout_pending' where id='${s}'`);
  expect(archive('table', t.id).error).toBe('TABLE_IN_USE');
  sql(`update public.table_sessions set status='closed' where id='${s}'`);
  expect(archive('table', t.id).data.success).toBe(true);
});

it('archive preserves accepted orders, immutable line snapshots and settled receipt access', () => {
  const t = table(), s = open(t.id), food = item();
  const option = randomUUID();
  sql(`insert into public.menu_item_options(id,store_id,item_id,name,price_delta_vnd) values('${option}','${sid}','${food}','Extra soup',2000)`);
  const order = createOrder(t.code, food, [option]).data; expect(order.id).toBeTruthy();
  const before = sql(`select to_jsonb(i) from public.order_items i where order_id='${order.id}'`);
  expect(archive('item', food).data.success).toBe(true);
  expect(archive('item', food).data.success).toBe(true);
  expect(createOrder(t.code, food).error).toBe('ITEM_UNAVAILABLE');
  expect(sql(`select status from public.orders where id='${order.id}'`)).toBe('accepted');
  expect(sql(`select to_jsonb(i) from public.order_items i where order_id='${order.id}'`)).toBe(before);
  expect(sql(`select active from public.menu_item_options where id='${option}'`)).toBe('f');
  expect(order.lines[0].options[0].name).toBe('Extra soup');
  expect(archive('table', t.id).error).toBe('TABLE_IN_USE');
  sql(`update public.orders set status='completed' where id='${order.id}'`);
  expect(settle(s).data.settlement.status).toBe('succeeded');
  const receipt = rpc('p5_session_execute', 'guest_receipt', { sessionId: s, browserHash: browser, grantProof: proof }).data;
  expect(archive('table', t.id).data.success).toBe(true);
  expect(rpc('p5_session_execute', 'guest_receipt', { sessionId: s, browserHash: browser, grantProof: proof }).data).toEqual(receipt);
  expect(receipt.orders[0].lines[0].name).toBe('Snapshot soup');
  expect(createOrder(t.code, food).error).toBe('INVALID_QR');
});

it('closed but unpaid history cannot be archived', () => {
  const t = table(), s = open(t.id), food = item();
  const order = createOrder(t.code, food).data;
  sql(`update public.orders set status='completed' where id='${order.id}';update public.table_sessions set status='closed' where id='${s}'`);
  expect(archive('table', t.id).error).toBe('TABLE_IN_USE');
});

it('category counts every related item, never cascades, archived category cannot be reused', () => {
  const cat = category(), food = item(cat);
  sql(`update public.menu_items set active=false where id='${food}'`);
  expect(archive('category', cat)).toMatchObject({ error: 'CATEGORY_NOT_EMPTY', details: { count: 1 } });
  expect(archive('item', food).data.success).toBe(true);
  expect(archive('category', cat).error).toBe('CATEGORY_NOT_EMPTY');
  const empty = category(); expect(archive('category', empty).data.success).toBe(true);
  expect(archive('category', empty).data.success).toBe(true);
  expect(() => item(empty)).toThrow();
  expect(sql(`select exists(select 1 from jsonb_array_elements(public.menu_snapshot('${sid}',false,false)->'categories') c where c->>'id'='${empty}')`)).toBe('f');
});

it('concurrent open vs archive serializes on store/table in both directions', async () => {
  const t = table();
  const opening = parallel(`set application_name='hf01_open';begin;${query('p2_pin_execute','open',openInput(t.id))};select pg_sleep(1);commit;`);
  await waitSleeping('hf01_open');
  const deleting = parallel(query('hf01_owner_execute', 'archive_table', { ...scope, id: t.id }));
  await opening; expect(JSON.parse((await deleting).split('\n').at(-1)!).error).toBe('TABLE_IN_USE');
  const second = table();
  const archived = parallel(`set application_name='hf01_archive';begin;${query('hf01_owner_execute','archive_table',{ ...scope,id:second.id })};select pg_sleep(1);commit;`);
  await waitSleeping('hf01_archive');
  const openAfter = parallel(query('p2_pin_execute','open',openInput(second.id)));
  await archived; expect(JSON.parse(await openAfter).error).toBe('INVALID_STATE_TRANSITION');
  const state = sql(`select active::text||':'||(select count(*) from public.table_sessions where table_id='${second.id}' and status in('open','checkout_pending')) from public.dining_tables where id='${second.id}'`);
  expect(state).toBe('false:0');
});

it('checkout vs item archive admits only a valid snapshot or rejects with ITEM_UNAVAILABLE', async () => {
  const t = table(); open(t.id); const food = item();
  const archiving = parallel(`set application_name='hf01_archive_item';begin;${query('hf01_owner_execute','archive_item',{ ...scope,id:food })};select pg_sleep(1);commit;`);
  await waitSleeping('hf01_archive_item');
  const command = { qrCode: t.code, clientRequestId: randomUUID(), menuRevision: sql(`select menu_revision from public.stores where id='${sid}'`), items: [{ menuItemId: food, quantity: 1, optionIds: [], note: null }], note: null };
  const creating = parallel(query('p3_order_execute','create',{ browserHash:browser, grantProof:proof, command }));
  await archiving; expect(JSON.parse((await creating).split('\n').at(-1)!).error).toBe('ITEM_UNAVAILABLE');
});

it('category archive vs create cannot create an item in a retired category',async()=>{
  const cat=category();
  const archiving=parallel(`set application_name='hf01_category';begin;${query('hf01_owner_execute','archive_category',{...scope,id:cat})};select pg_sleep(1);commit;`);
  await waitSleeping('hf01_category');
  const creating=parallel(query('p2_menu_execute','create_item',{...scope,categoryId:cat,requestId:randomUUID(),name:'Race item',description:null,priceVnd:1,imageUrl:null,active:true,available:true,options:[]}));
  await archiving;expect(JSON.parse(await creating).error).toBe('VALIDATION_ERROR');
  expect(sql(`select count(*) from public.menu_items where category_id='${cat}'`)).toBe('0');
});

it('registered uploads attach only when ready and owned; replacement cleanup fences reattachment', () => {
  // Isolated fixture grants no access to a live Storage API: these verify DB invariants only.
  sql('delete from public.security_rate_buckets');
  const food = item();
  const asset = () => {
    const path = `stores/${sid}/uploads/${randomUUID()}.png`, url = `https://example.supabase.co/storage/v1/object/public/menu-images/${path}`;
    expect(rpc('hf01_owner_execute', 'reserve_image', { ...scope,path,url }).data.expiresAt).toBeTruthy(); return { path,url };
  };
  const first = asset();
  const edit = (url: string | null) => rpc('p2_menu_execute','patch_item',{ ...scope,id:food,requestId:randomUUID(),expectedUpdatedAt:sql(`select updated_at from public.menu_items where id='${food}'`),imageUrl:url });
  expect(edit(first.url).error).toBe('VALIDATION_ERROR');
  expect(rpc('hf01_owner_execute','ready_image',{ ...scope,path:first.path }).data).toBe(true);
  expect(edit(first.url).data.imagePath).toBe(first.path);
  sql(`update public.menu_image_assets set expires_at=clock_timestamp()-interval '1 minute' where path='${first.path}'`);
  expect(rpc('hf01_image_cleanup','claim',{}).data).not.toContain(first.path);
  expect(edit(first.url).data.imagePath).toBe(first.path); // unchanged URL remains editable after TTL
  const second = asset(); rpc('hf01_owner_execute','ready_image',{ ...scope,path:second.path });
  expect(edit(second.url).data.imagePath).toBe(second.path);
  expect(rpc('hf01_image_cleanup','claim',{}).data).toContain(first.path);
  expect(edit(first.url).error).toBe('VALIDATION_ERROR');
  expect(edit(null).data.imagePath).toBeNull();
  const paths = rpc('hf01_image_cleanup','claim',{}).data; expect(paths).toContain(second.path);
  expect(rpc('hf01_image_cleanup','done',{path:second.path}).data).toBe(true);
  expect(sql(`select state from public.menu_image_assets where path='${second.path}'`)).toBe('deleted');
  expect(() => rpc('hf01_owner_execute','reserve_image',{ ...scope,path:`stores/${other}/uploads/${randomUUID()}.png`,url:'https://example.supabase.co/storage/v1/object/public/menu-images/stores/bad' })).toThrow();
});
