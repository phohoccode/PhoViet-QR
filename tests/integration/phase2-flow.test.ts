import { execFile, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createCartStore, type CartStorage } from "../../src/features/cart";
import { createCategory, createMenuItem, updateMenuItem, fetchPublicMenu } from "../../src/server/menu/service";
import { createTable } from "../../src/server/tables/service";
import { resolvePublicQr, writeOwnerQr } from "../../src/server/qr/service";
import { openTableSession, verifyTableSession, requireGuestTableSession } from "../../src/server/table-sessions/service";
import { hashSecret } from "../../src/server/security/crypto";
import { publicMenuResponse } from "../../src/lib/validations/menu";

const status = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:15421") throw Error("Refusing non-local Phase2 integration");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = (input: string) => execFileSync("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const concurrentSql = (input: string) => new Promise<void>((resolve, reject) => {
  const child = execFile("docker", ["exec", "-i", "supabase_db_qr-ordering-p1c02-local", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { windowsHide: true }, error => error ? reject(Error("Local concurrent fixture SQL failed")) : resolve());
  child.stdin!.end(input);
});
const storeId = randomUUID(), users: string[] = [], browsers: string[] = [];
const owner = () => ({ storeId, authUserId: users[0] });
const command = () => ({ requestId: randomUUID() });
const browser = () => {
  const token = randomBytes(32).toString("base64url"), browserHash = hashSecret(token);
  browsers.push(browserHash);
  return { token, browserHash, grantProof: hashSecret(`qr-guest-grant-v1:${token}`), isNew: true };
};
const device = browser();
let table: Awaited<ReturnType<typeof createTable>>, counter: Awaited<ReturnType<typeof writeOwnerQr>>;
let item: Awaited<ReturnType<typeof createMenuItem>>, opened: Awaited<ReturnType<typeof openTableSession>>;
const storageValues = new Map<string, string>();
const storage: CartStorage = { getItem: key => storageValues.get(key) ?? null, setItem: (key, value) => { storageValues.set(key, value); }, removeItem: key => { storageValues.delete(key); } };
const cart = (qrCode: string) => createCartStore({ qrCode, storage,
  loadResolution: code => resolvePublicQr(code, device), loadMenu: code => fetchPublicMenu(code, device) });

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY || status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  process.env.APP_BASE_URL = "https://qr.example.invalid";
  process.env.TABLE_SESSION_ENCRYPTION_KEYS = JSON.stringify({ v1: randomBytes(32).toString("base64") });
  process.env.TABLE_SESSION_ACTIVE_KEY_ID = "v1";
  const r = await admin.auth.admin.createUser({ email: `p2-flow-${randomUUID()}@example.invalid`, password: `${randomUUID()}aA!9`, email_confirm: true });
  if (r.error || !r.data.user) throw Error("Local fixture Auth failed");
  users.push(r.data.user.id);
  sql(`insert into public.stores(id,name) values('${storeId}','Phase2 flow');insert into public.owner_members(store_id,auth_user_id) values('${storeId}','${users[0]}')`);
  table = await createTable(owner(), { ...command(), label: "Flow table" });
  counter = await writeOwnerQr(owner(), { ...command(), action: "create", type: "takeaway", tableId: null });
  const category = await createCategory(owner(), { ...command(), name: "Flow menu", sortOrder: 0, active: true });
  item = await createMenuItem(owner(), { ...command(), categoryId: category.id, name: "Coffee <script>test</script>", description: null, priceVnd: 29000, imageUrl: null, active: true, available: true, options: [{ name: "Milk", priceDeltaVnd: 3000, available: true }] });
});

afterAll(async () => {
  // Only random fixtures on the asserted local Supabase; never real resources.
  sql(`begin;set local session_replication_role=replica;
    delete from public.security_rate_buckets where key_hash in(
      select encode(extensions.digest(k,'sha256'),'hex') from (
        select unnest(array[${users.flatMap(id => [`'owner:${id}:read'`, `'owner:${id}:write'`]).join(",")}]::text[]) k
        union all select 'read:'||h||':'||q.id from public.qr_codes q cross join unnest(array['${browsers.join("','")}']::text[]) h where q.store_id='${storeId}'
        union all select 'verify:'||h||':'||q.id from public.qr_codes q cross join unnest(array['${browsers.join("','")}']::text[]) h where q.store_id='${storeId}'
        union all select 'verify-qr:'||id from public.qr_codes where store_id='${storeId}') buckets);
    delete from public.guest_access where store_id='${storeId}';
    delete from public.session_code_deliveries where session_id in(select id from public.table_sessions where store_id='${storeId}');
    delete from public.operation_requests where store_id='${storeId}';
    delete from public.outbox_events where aggregate_id='${storeId}' or aggregate_id in(select id from public.table_sessions where store_id='${storeId}');
    delete from public.table_sessions where store_id='${storeId}';
    delete from public.table_qr_audit_log where store_id='${storeId}';delete from public.menu_audit_log where store_id='${storeId}';
    delete from public.menu_item_options where store_id='${storeId}';delete from public.menu_items where store_id='${storeId}';delete from public.menu_categories where store_id='${storeId}';
    delete from public.qr_codes where store_id='${storeId}';delete from public.dining_tables where store_id='${storeId}';
    delete from public.owner_members where store_id='${storeId}';delete from public.stores where id='${storeId}';
    delete from public.guest_browser_contexts where token_hash in('${browsers.join("','")}');commit;`);
  for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});

it("owner-created QR modes share real menu; cart only reaches review after table verification", async () => {
  const a = publicMenuResponse.parse(await fetchPublicMenu(table.qr!.publicCode, device));
  const b = publicMenuResponse.parse(await fetchPublicMenu(counter.publicCode, device));
  expect(a.items).toEqual(b.items); expect(a.menuRevision).toBe(b.menuRevision);
  expect(a.items[0].name).toBe("Coffee <script>test</script>"); // JSON text, never HTML rendering authority.
  expect(JSON.stringify(a)).not.toMatch(/ownerId|storeId|codeHash|guestAccess|sessionCode/);
  const dineIn = cart(table.qr!.publicCode), takeaway = cart(counter.publicCode);
  await dineIn.initialize(); await takeaway.initialize();
  const selection = { menuItemId: item.id, quantity: 2, optionIds: [item.options[0].id], note: "private note" };
  expect(dineIn.addLine(selection).ok).toBe(true); expect(takeaway.addLine(selection).ok).toBe(true);
  expect(dineIn.getView().estimatedSubtotalVnd).toBe(64000);
  expect(dineIn.getCheckoutReadiness().status).toBe("verify_table_session");
  expect(takeaway.getCheckoutReadiness().status).toBe("ready_to_review");
  opened = await openTableSession(owner(), table.id, command());
  await verifyTableSession(table.qr!.publicCode, opened.sessionCredential.sessionCode, device);
  await dineIn.refresh(); expect(dineIn.getCheckoutReadiness().status).toBe("ready_to_review");
  expect((await requireGuestTableSession(table.qr!.publicCode, device)).sessionId).toBe(opened.session.id);
  const draft = dineIn.prepareOrderDraft(); expect(draft.ok).toBe(true);
  if (draft.ok) expect(Object.keys(draft.value).sort()).toEqual(["items", "menuRevision", "note", "qrCode"]);
  expect([...storageValues.values()].join()).not.toContain("private note");
  expect([...storageValues.values()].join()).not.toContain(opened.sessionCredential.sessionCode);
});

it("owner price/availability/option changes reconcile a real public-menu cart and block stale preview", async () => {
  const guest = cart(counter.publicCode); await guest.initialize();
  // Reloaded note omission must be acknowledged before accepting changed prices.
  const restored = guest.getState().lines[0]; expect(restored.noteNeedsReview).toBe(true);
  expect(guest.updateNote(restored.lineKey, null).ok).toBe(true);
  expect(guest.confirmReview().ok).toBe(true);
  const oldRevision = guest.getState().menu!.menuRevision;
  item = await updateMenuItem(owner(), item.id, { ...command(), expectedUpdatedAt: item.updatedAt, priceVnd: 31000 });
  await guest.refresh();
  expect(guest.getState().menu!.menuRevision).not.toBe(oldRevision);
  expect(guest.getView().estimatedSubtotalVnd).toBe(64000);
  expect(guest.getView().lines[0].proposedUnitPriceVnd).toBe(34000);
  expect(guest.prepareOrderDraft().ok).toBe(false);
  expect(guest.confirmReview().ok).toBe(true); expect(guest.getView().estimatedSubtotalVnd).toBe(68000);
  item = await updateMenuItem(owner(), item.id, { ...command(), expectedUpdatedAt: item.updatedAt, available: false });
  await guest.refresh(); expect(guest.getView().issues.some(i => i.code === "ITEM_UNAVAILABLE")).toBe(true);
  expect(guest.confirmReview().ok).toBe(false);
  item = await updateMenuItem(owner(), item.id, { ...command(), expectedUpdatedAt: item.updatedAt, available: true, options: [] });
  await guest.refresh(); expect(guest.getView().issues.some(i => i.code === "INVALID_OPTION")).toBe(true);
  expect(guest.confirmReview().ok).toBe(false);
  expect(guest.updateOptions(guest.getState().lines[0].lineKey, []).ok).toBe(true);
  expect(guest.confirmReview().ok).toBe(true); expect(guest.getView().estimatedSubtotalVnd).toBe(62000);
});

it("closed fixture session revokes old devices; a new session needs explicit cart context review", async () => {
  const guest = cart(table.qr!.publicCode); await guest.initialize();
  guest.clear(); guest.addLine({ menuItemId: item.id, quantity: 1, optionIds: [] });
  const otherDevice = browser(); await verifyTableSession(table.qr!.publicCode, opened.sessionCredential.sessionCode, otherDevice);
  const oldId = opened.session.id;
  // Trusted local fixture transition only: no close/settlement API exists yet.
  sql(`update public.table_sessions set status='checkout_pending' where id='${oldId}'`);
  await guest.refresh(); expect(guest.getCheckoutReadiness().issues.some(i => i.code === "SESSION_CHECKOUT_PENDING")).toBe(true);
  sql(`update public.table_sessions set status='closed' where id='${oldId}'`);
  await guest.refresh(); expect(guest.getCheckoutReadiness().status).toBe("verify_table_session");
  await expect(requireGuestTableSession(table.qr!.publicCode, otherDevice)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  expect(sql(`select count(*) from public.guest_access where scope_id='${oldId}' and revoked_at is null`)).toBe("0");
  opened = await openTableSession(owner(), table.id, command());
  expect(opened.session.id).not.toBe(oldId);
  await expect(requireGuestTableSession(table.qr!.publicCode, otherDevice)).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
  await verifyTableSession(table.qr!.publicCode, opened.sessionCredential.sessionCode, device);
  await guest.refresh(); expect(guest.getState().contextNeedsReview).toBe(true);
  expect(guest.prepareOrderDraft().ok).toBe(false);
  expect(guest.confirmContextChange().ok).toBe(true); expect(guest.confirmReview().ok).toBe(true);
  expect(guest.getCheckoutReadiness().status).toBe("ready_to_review");
});

it("concurrent verify/resolve versus fixture close leaves no surviving grant or credential", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const target = await createTable(owner(), { ...command(), label: `Close race ${attempt}` });
    const session = await openTableSession(owner(), target.id, command());
    const guest = browser();
    const results = await Promise.allSettled([
      verifyTableSession(target.qr!.publicCode, session.sessionCredential.sessionCode, guest),
      resolvePublicQr(target.qr!.publicCode, guest),
      concurrentSql(`begin;update public.table_sessions set status='checkout_pending' where id='${session.session.id}';update public.table_sessions set status='closed' where id='${session.session.id}';commit;`),
    ]);
    expect(results[2].status).toBe("fulfilled");
    for (const result of results.slice(0, 2)) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "SESSION_EXPIRED" });
    expect(sql(`select count(*) from public.guest_access where scope_id='${session.session.id}' and revoked_at is null`)).toBe("0");
    expect(sql(`select count(*) from public.session_code_deliveries where session_id='${session.session.id}'`)).toBe("0");
    expect(await resolvePublicQr(target.qr!.publicCode, guest)).toMatchObject({ requiresSessionCode: true, session: null });
    await expect(requireGuestTableSession(target.qr!.publicCode, guest)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  }
});
