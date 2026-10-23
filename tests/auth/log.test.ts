import { afterEach, describe, expect, it, vi } from "vitest";
import { logAuthEvent, type AuthLogEvent } from "../../src/server/auth/log";

afterEach(() => vi.restoreAllMocks());
describe("auth logging boundary", () => {
  it("emits only fixed severity/event, with no identity, body, exception or credential", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthEvent("auth.login_rejected");
    logAuthEvent("auth.provider_unavailable");
    expect(warn).toHaveBeenCalledExactlyOnceWith('{"level":"warn","event":"auth.login_rejected"}');
    expect(error).toHaveBeenCalledExactlyOnceWith('{"level":"error","event":"auth.provider_unavailable"}');
  });
  it("does not echo a runtime value even if a caller bypasses TypeScript", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthEvent("sensitive@example.invalid Bearer secret" as AuthLogEvent);
    expect(error).toHaveBeenCalledExactlyOnceWith('{"level":"error","event":"auth.unexpected_failure"}');
  });
});
