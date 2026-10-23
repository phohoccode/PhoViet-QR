import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTableInput, updateTableInput, rotateQrInput, writeQrInput, tableLabel } from "../../src/lib/validations/table-qr";
import { qrBaseUrl, qrPublicUrl } from "../../src/server/qr/public-url";
import { tableQrFailure } from "../../src/server/qr/database";
import { ApiFault } from "../../src/server/security/api";

afterEach(() => vi.unstubAllEnvs());
const requestId = randomUUID(), expectedUpdatedAt = "2026-10-23T13:01:02.123456+00:00";
describe("table and QR commands", () => {
  it("preserves frozen R18 inactive-table 422 and no-store while keeping conflicts at 409", async () => {
    const inactive = tableQrFailure(new ApiFault("INVALID_STATE_TRANSITION", { field: "tableActive" }));
    expect(inactive.status).toBe(422); expect(inactive.headers.get("cache-control")).toContain("no-store");
    expect((await inactive.json()).error.details.field).toBe("tableActive");
    expect(tableQrFailure(new ApiFault("INVALID_STATE_TRANSITION", { field: "activeSession" })).status).toBe(409);
  });
  it("normalizes all supported Unicode whitespace before validating and fingerprinting", () => {
    expect(createTableInput.parse({ requestId, label: " \tBàn\u0085\u00a0 01\n" }).label).toBe("Bàn 01");
    expect(tableLabel.parse(" \u2000Bàn\u202f\ufeff 01\u3000")).toBe("Bàn 01");
  });
  it.each(["", "\n\t", "a".repeat(81), "Table\u0000", "Table\u0001", "Table\u0090"])("rejects invalid label %j", label => {
    expect(tableLabel.safeParse(label).success).toBe(false);
  });
  it("requires UUID commands, at least one patch and a full CAS token without truncating precision", () => {
    expect(updateTableInput.parse({ requestId, expectedUpdatedAt, active: false }).expectedUpdatedAt).toBe(expectedUpdatedAt);
    for (const input of [{ requestId, expectedUpdatedAt }, { requestId, label: "A" }, { requestId: "x", expectedUpdatedAt, active: true }])
      expect(updateTableInput.safeParse(input).success).toBe(false);
    expect(rotateQrInput.safeParse({ requestId, expectedUpdatedAt, confirm: false }).success).toBe(false);
    expect(rotateQrInput.parse({ requestId, expectedUpdatedAt, confirm: true }).confirm).toBe(true);
  });
  it("rejects tenant, code, session, and unknown input fields", () => {
    for (const extra of [{ storeId: randomUUID() }, { publicCode: "forged" }, { activeSessionId: randomUUID() }, { active: false }])
      expect(createTableInput.safeParse({ requestId, label: "A", ...extra }).success).toBe(false);
    expect(writeQrInput.parse({ requestId, action: "create", type: "takeaway", tableId: null })).toMatchObject({ type: "takeaway" });
    expect(writeQrInput.safeParse({ requestId, action: "create", type: "takeaway", tableId: randomUUID() }).success).toBe(false);
    expect(writeQrInput.safeParse({ requestId, action: "set_active", id: randomUUID(), active: false, storeId: randomUUID() }).success).toBe(false);
  });
});
describe("trusted printed QR URL", () => {
  it("uses only canonical config and keeps URLs stable and public", () => {
    vi.stubEnv("APP_BASE_URL", "https://qr.example.invalid/");
    expect(qrPublicUrl("abc_123-DEF")).toBe("https://qr.example.invalid/q/abc_123-DEF");
    expect(qrBaseUrl().origin).toBe("https://qr.example.invalid");
    expect(qrPublicUrl("abc_123-DEF")).toBe(qrPublicUrl("abc_123-DEF"));
    expect(() => qrPublicUrl("../private?token=secret")).toThrow();
  });
  it.each(["", "garbage", "https://user:pass@example.com", "https://example.com/base", "https://example.com?host=evil", "https://example.com#fragment", " https://example.com", "http://example.com", "ftp://example.com"])("fails closed for config %j", base => {
    vi.stubEnv("APP_BASE_URL", base);
    expect(() => qrBaseUrl()).toThrow(expect.objectContaining({ code: "INTERNAL_ERROR", details: { field: "APP_BASE_URL" } }));
  });
  it("permits loopback HTTP in development only", () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    expect(qrPublicUrl("abc")).toBe("http://localhost:3000/q/abc");
    vi.stubEnv("NODE_ENV", "production"); expect(() => qrBaseUrl()).toThrow();
    vi.stubEnv("APP_BASE_URL", "https://qr.example.invalid"); expect(qrBaseUrl().protocol).toBe("https:");
  });
});
