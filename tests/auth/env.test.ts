import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientEnv } from "../../src/lib/env/client";

const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
afterEach(() => vi.unstubAllEnvs());
describe("public Supabase configuration", () => {
  it.each(["sb_publishable_test_only", jwt("anon")])("accepts public publishable or legacy anon configuration", (key) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:15421");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
    expect(getClientEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(key);
  });
  it.each(["sb_secret_test_only", jwt("service_role"), "unknown-key", ""])("rejects privileged/invalid keys without echoing their values", (key) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dev.example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
    try { getClientEnv(); throw new Error("Expected configuration rejection"); } catch (error) {
      expect((error as Error).message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      if (key) expect((error as Error).message).not.toContain(key);
    }
  });
  it("rejects non-loopback plaintext HTTP and reports only the variable name", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://remote.example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_only");
    expect(() => getClientEnv()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
});
