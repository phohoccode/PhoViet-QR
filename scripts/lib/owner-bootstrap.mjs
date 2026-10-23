import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export class OwnerBootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OwnerBootstrapError";
    this.code = code;
  }
}

const fail = (code, message) => { throw new OwnerBootstrapError(code, message); };
const isAdminKey = (value) => {
  if (value.startsWith("sb_secret_")) return value.length > "sb_secret_".length;
  try {
    const parts = value.split(".");
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], "base64url").toString()).role === "service_role";
  } catch { return false; }
};

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
    } catch { return false; }
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().refine(isAdminKey),
  OWNER_BOOTSTRAP_EMAIL: z.email().trim().toLowerCase(),
  OWNER_BOOTSTRAP_PASSWORD: z.string().min(8).max(72),
  OWNER_BOOTSTRAP_STORE_ID: z.uuid(),
  OWNER_BOOTSTRAP_STORE_NAME: z.string().trim().min(1).max(120),
});

export function readOwnerBootstrapEnv(env) {
  if (!env.OWNER_BOOTSTRAP_ENABLED || env.OWNER_BOOTSTRAP_ENABLED === "false") return null;
  if (env.OWNER_BOOTSTRAP_ENABLED !== "true") {
    fail("config_invalid", "OWNER_BOOTSTRAP_ENABLED phải là true hoặc false.");
  }
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join(".")))];
    fail("config_invalid", `Cấu hình bootstrap thiếu hoặc không hợp lệ: ${fields.join(", ")}. Xem .env.example.`);
  }
  return result.data;
}

async function findUser(admin, email) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error || !data) fail("auth_unavailable", "Không thể đọc Auth users. Kiểm tra service-role key và project Supabase.");
    const user = data.users.find(user => user.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

async function readMembership(client, userId) {
  const result = await client.from("owner_members").select("store_id,role").eq("auth_user_id", userId).maybeSingle();
  if (result.error) fail("database_unavailable", "Không thể đọc owner_members. Kiểm tra migration và quyền service-role.");
  return result.data;
}

function matchesMembership(membership, storeId) {
  if (!membership) return false;
  if (membership.store_id !== storeId || membership.role !== "owner") {
    fail("membership_conflict", "Tài khoản đã có membership khác cấu hình. Bootstrap không tự chuyển quán hoặc thay quyền.");
  }
  return true;
}

/** Trusted Node startup task only. Never imported into the Next app/client bundle. */
export async function bootstrapOwner(env, makeClient = createClient) {
  const config = readOwnerBootstrapEnv(env);
  if (!config) return { status: "disabled" };
  const client = makeClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init = {}) => fetch(input, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    }) },
  });

  // Refuse to create an Auth user before the foundation schema is accessible.
  const preflight = await client.from("owner_members").select("auth_user_id").limit(0);
  const store = await client.from("stores").select("id").eq("id", config.OWNER_BOOTSTRAP_STORE_ID).maybeSingle();
  if (preflight.error || store.error) {
    if (preflight.error?.code === "42501" || store.error?.code === "42501") {
      fail("database_permission_denied", "Service-role chưa có quyền DB. Chạy migration 20261023000200_owner_bootstrap_privileges.sql trên project Supabase rồi thử lại.");
    }
    fail("migration_required", "Chưa đọc được bảng foundation. Chạy migration foundation trên đúng project Supabase trước khi khởi động lại.");
  }

  let user = await findUser(client.auth.admin, config.OWNER_BOOTSTRAP_EMAIL);
  let created = false;
  if (!user) {
    const result = await client.auth.admin.createUser({
      email: config.OWNER_BOOTSTRAP_EMAIL, password: config.OWNER_BOOTSTRAP_PASSWORD, email_confirm: true,
    });
    user = result.data?.user;
    created = !result.error && !!user;
    if (!created) {
      // Another server may have created the same email during startup.
      user = await findUser(client.auth.admin, config.OWNER_BOOTSTRAP_EMAIL);
      if (!user) fail("auth_create_failed", "Không tạo được Auth user. Kiểm tra chính sách mật khẩu của Supabase và quyền admin.");
    }
  }
  if (!user.email_confirmed_at) {
    fail("email_unconfirmed", "User đã tồn tại nhưng email chưa xác nhận. Xác nhận trong Supabase Auth; bootstrap không sửa tài khoản hiện có.");
  }

  const membership = await readMembership(client, user.id);
  if (matchesMembership(membership, config.OWNER_BOOTSTRAP_STORE_ID)) return { status: "existing" };

  if (!store.data) {
    const result = await client.from("stores").upsert({
      id: config.OWNER_BOOTSTRAP_STORE_ID, name: config.OWNER_BOOTSTRAP_STORE_NAME,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (result.error) fail("store_create_failed", "Không tạo được quán bootstrap. Kiểm tra migration và quyền service-role.");
  }
  const result = await client.from("owner_members").insert({
    store_id: config.OWNER_BOOTSTRAP_STORE_ID, auth_user_id: user.id, role: "owner",
  });
  if (result.error) {
    // Accept only an identical concurrent insert, never overwrite a membership.
    const current = await readMembership(client, user.id);
    if (!matchesMembership(current, config.OWNER_BOOTSTRAP_STORE_ID)) {
      fail("membership_create_failed", "Không tạo được owner membership. Có thể chạy lại bootstrap sau khi sửa lỗi DB.");
    }
  }
  return { status: created ? "created" : "linked" };
}
