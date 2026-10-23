import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
import { resolvePublicQr } from "../../src/server/qr/service";
import { fetchPublicMenu } from "../../src/server/menu/service";
import { createTable } from "../../src/server/tables/service";
import { apiFailure } from "../../src/server/security/api";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rpc.mockReset(); });

// Fault injection verifies sanitized transport handling only, not concurrency.
it.each(["db-error", "network-error", "malformed-rpc"])("sanitizes %s consistently across QR, menu and owner table services", async failure => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:15421");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  vi.stubEnv("APP_BASE_URL", "https://qr.example.invalid");
  const sensitive = "private-code SQL server stack test-service-key";
  if (failure === "network-error") rpc.mockRejectedValue(new Error(sensitive));
  else rpc.mockResolvedValue(failure === "db-error" ? { data: null, error: { message: sensitive } } : { data: null, error: null });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const context = { token: "test-token", browserHash: "a".repeat(64), grantProof: "b".repeat(64), isNew: true };
  const owner = { authUserId: "c0500000-0000-4000-8000-000000000001", storeId: "c0500000-0000-4000-8000-000000000002" };
  for (const operation of [
    () => resolvePublicQr("PUBLIC_CODE", context), () => fetchPublicMenu("PUBLIC_CODE", context),
    () => createTable(owner, { requestId: "c0500000-0000-4000-8000-000000000003", label: "Test table" }),
  ]) {
    let caught: unknown;
    try { await operation(); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: "INTERNAL_ERROR" });
    const response = apiFailure(caught), payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload).toMatchObject({ data: null, error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(payload)).not.toMatch(/private-code|SQL server|stack|test-service-key/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(log.mock.calls.flat().join()).not.toContain(sensitive);
});
