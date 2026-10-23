import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { activeEncryptionKeyId, encryptCode, decryptCode, newSessionCode, sessionAad } from "../../src/server/security/crypto";
import { guestRequestContext, setGuestCookie } from "../../src/server/security/request-context";
import { apiSuccess, apiFailure, checkOrigin, readJson, validate } from "../../src/server/security/api";
import { openSessionInput, publicQrCode, verifySessionInput } from "../../src/lib/validations/table-sessions";
afterEach(() => vi.unstubAllEnvs());
describe("QR/session boundaries", () => {
  it("requires opaque URL-safe QR and strict request fields", () => {
    for (const value of ["", "a".repeat(129), "../secret", "a b"]) expect(() => validate(publicQrCode, value)).toThrow();
    expect(validate(publicQrCode, "x_Valid-123")).toBe("x_Valid-123");
    expect(() => validate(openSessionInput, { requestId: "fake", storeId: "forged" })).toThrow();
    expect(() => validate(verifySessionInput, { qrCode: "valid", sessionCode: "" })).toThrow();
    expect(() => validate(verifySessionInput, { qrCode: "valid", sessionCode: "ok", isOwner: true })).toThrow();
  });
  it("rejects mutations with absent, null or foreign Origin", () => {
    vi.stubEnv("APP_ORIGIN", "https://shop.example.invalid");
    for (const origin of [undefined, "null", "https://evil.example.invalid"]) {
      expect(() => checkOrigin(new Request("https://shop.example.invalid/api", { headers: origin ? { origin } : {} }))).toThrow();
    }
    expect(() => checkOrigin(new Request("https://shop.example.invalid/api", { headers: { origin: "https://shop.example.invalid" } }))).not.toThrow();
  });
  it("caps JSON bytes and rejects non-JSON without echoing sensitive input", async () => {
    const malformed = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: '{"secret"' });
    await expect(readJson(malformed, verifySessionInput)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const big = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionCode: "S".repeat(5000) }) });
    await expect(readJson(big, verifySessionInput)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("encrypts with scope/actor/request AAD and supports key rotation", () => {
    vi.stubEnv("TABLE_SESSION_ENCRYPTION_KEYS", JSON.stringify({ v1: randomBytes(32).toString("base64"), v2: randomBytes(32).toString("base64") }));
    vi.stubEnv("TABLE_SESSION_ACTIVE_KEY_ID", "v1");
    const aad = sessionAad("s", "t", "session", "owner", "request"), code = newSessionCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const encrypted = encryptCode(code, activeEncryptionKeyId(), aad);
    expect(JSON.stringify(encrypted)).not.toContain(code);
    expect(decryptCode(encrypted, "v1", aad)).toBe(code);
    expect(() => decryptCode(encrypted, "v1", `${aad}wrong`)).toThrow();
    expect(() => decryptCode({ ...encrypted, tag: randomBytes(16).toString("base64") }, "v1", aad)).toThrow();
    vi.stubEnv("TABLE_SESSION_ACTIVE_KEY_ID", "v2");
    expect(decryptCode(encrypted, "v1", aad)).toBe(code);
  });
  it("does not silently generate an ephemeral encryption key", () => {
    vi.stubEnv("TABLE_SESSION_ENCRYPTION_KEYS", "");
    expect(() => activeEncryptionKeyId()).toThrow();
  });
  it("uses an opaque secure cookie, stores no plaintext in the request proof", () => {
    vi.stubEnv("NODE_ENV", "production");
    const context = guestRequestContext(new NextRequest("https://shop.example.invalid/api"));
    expect(context.token).toHaveLength(43);
    expect(context.browserHash).not.toBe(context.token);
    expect(context.grantProof).not.toBe(context.browserHash);
    const response = apiSuccess({ ok: true }); setGuestCookie(response, context);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/Secure/i); expect(cookie).toMatch(/SameSite=lax/i); expect(cookie).toMatch(/Path=\//i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(() => guestRequestContext(new NextRequest("https://shop.example.invalid"), false)).toThrow();
  });
  it("does not trust forwarded IP by default or overwrite an existing cookie", () => {
    vi.stubEnv("VERCEL", ""); vi.stubEnv("TRUST_PROXY_IP", "false");
    const request = new NextRequest("https://shop.example.invalid", { headers: { cookie: `qr_guest=${"a".repeat(43)}`, "x-forwarded-for": "8.8.8.8" } });
    const context = guestRequestContext(request);
    expect(context.isNew).toBe(false); expect(context.token).toBe("a".repeat(43)); expect(context.ipHash).toBeUndefined();
  });
  it("does not leak provider errors or credential details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = apiFailure(new Error("session code=private; SQL details"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private");
    expect(spy).toHaveBeenCalledWith('{"event":"api.internal_failure"}');
    spy.mockRestore();
  });
});
