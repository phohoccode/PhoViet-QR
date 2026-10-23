import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
import { executeOrder, orderFailure } from "../../../src/server/orders/database";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); rpc.mockReset(); });
it.each(["network", "database", "empty"])("sanitizes %s faults without credential, stack or SQL leak", async mode => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:15421");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture-public-key"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-secret");
  if (mode === "network") rpc.mockRejectedValue(Error("SQL stack secret"));
  else rpc.mockResolvedValue({ data: null, error: mode === "database" ? { message: "SQL stack secret" } : null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  let caught: unknown;
  try { await executeOrder("create", {}); } catch (error) { caught = error; }
  const response = orderFailure(caught); expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toMatch(/SQL|stack|fixture-service-secret/);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
