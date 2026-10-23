/** Local-only production HTTP smoke: real Next forms/actions and Supabase Auth. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const workdir = process.env.P1C02_LOCAL_WORKDIR;
assert(workdir, "P1C02_LOCAL_WORKDIR must identify the isolated local project");
const config = readFileSync(resolve(workdir, "supabase/config.toml"), "utf8");
assert.match(config, /^project_id\s*=\s*"qr-ordering-p1c02-local"/m);
const status = JSON.parse(execFileSync(process.execPath, [
  "node_modules/supabase/dist/supabase.js", "--workdir", resolve(workdir), "status", "-o", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assert.equal(status.API_URL, "http://127.0.0.1:15421", "Refusing remote/non-isolated Auth");
const apiKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: apiKey };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const container = "supabase_db_qr-ordering-p1c02-local";
const sql = input => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
  { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const base = "http://localhost:13002";
const users = [], storeId = randomUUID();
const password = `${randomUUID()}aA!9`;
const ownerEmail = `http-${randomUUID()}@example.invalid`, nonmemberEmail = `http-${randomUUID()}@example.invalid`;
let server;
const runNext = args => new Promise((accept, reject) => {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  child.on("error", reject);
  child.on("exit", code => code === 0 ? accept(output) : reject(new Error(`Next ${args[0]} failed (output withheld; may contain request data)`)));
});
const jar = new Map();
const request = async (path, options = {}) => {
  const headers = new Headers(options.headers);
  if (jar.size) headers.set("Cookie", [...jar].map(([key, value]) => `${key}=${value}`).join("; "));
  const response = await fetch(new URL(path, base), { ...options, headers, redirect: "manual" });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";"), index = pair.indexOf("=");
    const name = pair.slice(0, index), value = pair.slice(index + 1);
    if (!value || /max-age=0(?:;|$)/i.test(cookie)) jar.delete(name); else jar.set(name, value);
  }
  return response;
};
const decode = value => value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const formData = (html, formIndex = 0) => {
  const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)];
  assert(forms[formIndex], "Expected a rendered server-action form");
  const data = new FormData();
  for (const input of forms[formIndex][1].matchAll(/<input\b[^>]*>/g)) {
    const attrs = Object.fromEntries([...input[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
    if (attrs.type === "hidden" && attrs.name) data.append(attrs.name, attrs.value || "");
  }
  assert([...data.keys()].some(key => key.startsWith("$ACTION_")), "No Next server action reference in form");
  return data;
};
const login = async (email, suppliedPassword = password) => {
  const page = await request("/login");
  assert.equal(page.status, 200);
  const data = formData(await page.text());
  data.set("email", email); data.set("password", suppliedPassword);
  return request("/login", { method: "POST", headers: { Origin: base }, body: data });
};
const pathOf = response => new URL(response.headers.get("location"), base).pathname;
const report = name => console.log(`PASS ${name}`);

try {
  // Refuse to reuse somebody else's server or build while a test server is active.
  let occupied = false;
  try { await fetch(base, { signal: AbortSignal.timeout(800) }); occupied = true; } catch { /* unused port */ }
  assert(!occupied, "Port 13002 is already occupied; no existing server will be stopped");
  await runNext(["build"]);
  report("production build with local public env; .env.local unchanged");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname=127.0.0.1", "--port=13002"], { env, stdio: "ignore", windowsHide: true });
  for (let attempt = 0; ; attempt++) {
    try { await fetch(base, { signal: AbortSignal.timeout(1000) }); break; } catch {
      assert(attempt < 60 && server.exitCode === null, "Production server did not become ready");
      await new Promise(accept => setTimeout(accept, 250));
    }
  }
  for (const email of [ownerEmail, nonmemberEmail]) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert(!error && data.user, "Local admin user bootstrap failed"); users.push(data.user.id);
  }
  sql(`begin; insert into public.stores(id,name) values ('${storeId}','HTTP smoke');
    insert into public.owner_members(store_id,auth_user_id) values ('${storeId}','${users[0]}'); commit;`);

  const guest = await request("/dashboard");
  assert.equal(guest.status, 307); assert.equal(pathOf(guest), "/login");
  report("guest dashboard -> login; public home/login remain accessible");
  assert.equal((await request("/")).status, 200);
  const wrong = await login(ownerEmail, `${randomUUID()}wrong`);
  assert.equal(wrong.status, 200);
  const wrongHtml = await wrong.text();
  assert(wrongHtml.includes("Không thể đăng nhập."));
  assert.equal(jar.size, 0); report("wrong password -> safe form error, no session");
  const deniedLogin = await login(nonmemberEmail);
  assert.equal(deniedLogin.status, 200);
  assert((await deniedLogin.text()).includes("Không thể đăng nhập."));
  assert.equal((await request("/dashboard")).status, 307);
  report("authenticated nonmember login rejected without retaining usable session");

  const success = await login(ownerEmail);
  assert.equal(success.status, 303); assert.equal(pathOf(success), "/dashboard");
  const cookies = success.headers.getSetCookie().filter(cookie => cookie.includes("auth-token"));
  assert(cookies.length > 0);
  for (const cookie of cookies) { assert.match(cookie, /httponly/i); assert.match(cookie, /samesite=lax/i); assert.match(cookie, /secure/i); }
  const dashboard = await request("/dashboard");
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  for (const label of ["Đơn hàng", "Bàn", "Menu", "Cài đặt"]) assert(dashboardHtml.includes(label));
  assert.match(dashboard.headers.get("cache-control"), /no-store/);
  report("owner form login -> 303 dashboard -> 200; HttpOnly/Secure/Lax session, four-tab UI");

  const authCookieName = [...jar.keys()].find(name => name.endsWith("-auth-token"));
  assert(authCookieName, "Expected an unchunked local session cookie");
  const session = JSON.parse(Buffer.from(jar.get(authCookieName).slice("base64-".length), "base64url").toString());
  session.expires_at = 1; // Real tokens; expired SDK metadata forces provider refresh.
  jar.set(authCookieName, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`);
  const refreshRedirect = await request("/dashboard");
  assert.equal(refreshRedirect.status, 307); assert.equal(pathOf(refreshRedirect), "/api/owner/auth/refresh");
  const refreshed = await request("/api/owner/auth/refresh");
  assert.equal(refreshed.status, 303); assert.equal(pathOf(refreshed), "/dashboard");
  assert(refreshed.headers.getSetCookie().some(cookie => /auth-token.*httponly/i.test(cookie)));
  assert.match(refreshed.headers.get("cache-control"), /no-store/);
  assert.equal((await request("/dashboard")).status, 200);
  report("RSC expired session -> writable refresh route -> new cookie -> dashboard 200");

  const logout = await request("/dashboard", { method: "POST", headers: { Origin: base }, body: formData(dashboardHtml) });
  assert.equal(logout.status, 303); assert.equal(pathOf(logout), "/login");
  const reloaded = await request("/dashboard");
  assert.equal(reloaded.status, 307); assert.equal(pathOf(reloaded), "/login");
  report("logout form -> login; dashboard reload denied");

  const outsider = createClient(status.API_URL, apiKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await outsider.auth.signInWithPassword({ email: nonmemberEmail, password });
  assert(!authError && authData.session, "Nonmember provider session creation failed");
  const key = `sb-${new URL(status.API_URL).hostname.split(".")[0]}-auth-token`;
  jar.clear(); jar.set(key, `base64-${Buffer.from(JSON.stringify(authData.session)).toString("base64url")}`);
  const denied = await request("/dashboard");
  assert.equal(denied.status, 307);
  assert.equal(new URL(denied.headers.get("location"), base).searchParams.get("reason"), "access_denied");
  const deniedPage = await request("/login?reason=access_denied");
  assert((await deniedPage.text()).includes("Tài khoản không có quyền quản lý quán."));
  report("valid nonmember cookie denied by actual dashboard layout; safe login reason");

  jar.clear(); jar.set(key, "base64-invalid");
  const tampered = await request("/dashboard");
  assert.equal(tampered.status, 307); assert.equal(pathOf(tampered), "/login");
  report("invalid session cookie fails closed");
  jar.clear();
  const refresh = await request("/api/owner/auth/refresh");
  assert.equal(refresh.status, 303); assert.equal(pathOf(refresh), "/login");
  assert.match(refresh.headers.get("cache-control"), /no-store/);
  report("anonymous refresh utility -> login, no-store");
  // Each HTTP response above has an explicit expected status. The deliberately
  // malformed cookie may produce an SDK parse diagnostic even when safely denied.
} finally {
  if (server && server.exitCode === null) {
    await new Promise(accept => { server.once("exit", accept); server.kill(); });
  }
  sql(`begin; delete from public.owner_members where store_id='${storeId}'; delete from public.stores where id='${storeId}'; commit;`);
  for (const id of users) assert(!(await admin.auth.admin.deleteUser(id)).error, "Test user cleanup failed");
  jar.clear();
  console.log("CLEANUP test users/store removed; test server stopped");
}
