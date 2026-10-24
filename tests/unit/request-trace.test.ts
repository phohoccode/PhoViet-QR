import { afterEach, expect, it, vi } from "vitest";
import { traceEvent, withApiTrace } from "../../src/server/security/trace";

afterEach(() => vi.restoreAllMocks());
it("isolates simultaneous request IDs and logs no caller headers, body, URL, PIN or provider payload", async () => {
  const logs: string[] = [];
  vi.spyOn(console, "warn").mockImplementation(s => logs.push(s));
  vi.spyOn(console, "error").mockImplementation(s => logs.push(s));
  vi.spyOn(console, "info").mockImplementation(s => logs.push(s));
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => withApiTrace(
    new Request("https://test.invalid/private/SECRET?pickup=SECRET", { method: "POST", headers: { "X-Request-Id": "SECRET" }, body: "SECRET" }),
    async () => { await new Promise(resolve => setTimeout(resolve, i % 3)); traceEvent("api.internal_failure"); return new Response(null, { status: 500 }); },
  )));
  const ids = responses.map(r => r.headers.get("X-Request-Id"));
  expect(new Set(ids).size).toBe(20);
  for (const id of ids) {
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    const entries = logs.map(l => JSON.parse(l)).filter(l => l.correlationId === id);
    expect(entries.map(l => l.event).sort()).toEqual(["api.internal_failure", "api.request"]);
  }
  expect(logs.join()).not.toContain("SECRET");
});
