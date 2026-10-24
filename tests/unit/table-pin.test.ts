import { randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { activePinPepperId, decryptPin, encryptPin, newTablePin, pinVerifier, validatePinConfiguration } from "../../src/server/table-sessions/pin-crypto";
import { verifySessionInput, rotatePinInput } from "../../src/lib/validations/table-sessions";
import { hashSecret } from "../../src/server/security/crypto";
afterEach(() => vi.unstubAllEnvs());
function keys() {
  vi.stubEnv("TABLE_SESSION_ENCRYPTION_KEYS", JSON.stringify({ v1: randomBytes(32).toString("base64"), v2: randomBytes(32).toString("base64") }));
  vi.stubEnv("TABLE_SESSION_ACTIVE_KEY_ID", "v1");
  vi.stubEnv("TABLE_PIN_HMAC_KEYS", JSON.stringify({ v1: randomBytes(32).toString("base64"), v2: randomBytes(32).toString("base64") }));
  vi.stubEnv("TABLE_PIN_ACTIVE_HMAC_KEY_ID", "v1");
}
it("validates exactly six ASCII digits and preserves leading zeros; rejects all aliases/extra fields", () => {
  expect(verifySessionInput.parse({ qrCode: "table", sessionCode: "000042" }).sessionCode).toBe("000042");
  for (const sessionCode of ["12345", "1234567", "abcdef", "１２３４５６", "123 45", " 000042", 42, null, "abcdefABCDEF0123456789_", "12345\n", "123456\n"])
    expect(verifySessionInput.safeParse({ qrCode: "table", sessionCode }).success).toBe(false);
  expect(verifySessionInput.safeParse({ qrCode: "table", pin: "000042" }).success).toBe(false);
  expect(rotatePinInput.safeParse({ requestId: "not-uuid", expectedVersion: 1, confirm: true }).success).toBe(false);
});
it("CSPRNG returns six characters including zero prefixes without sequence or table inputs", () => {
  const pins = Array.from({ length: 1000 }, newTablePin);
  expect(pins.every(pin => /^[0-9]{6}$/.test(pin))).toBe(true);
  expect(new Set(pins).size).toBeGreaterThan(980);
  expect(pins.some(pin => pin.startsWith("0"))).toBe(true);
});
it("HMAC is pepper/context/generation bound, not an offline-enumerable plain SHA PIN", () => {
  keys(); const h = pinVerifier("000042", "store", "session", 1, activePinPepperId());
  expect(h).toMatch(/^[a-f0-9]{64}$/); expect(h).not.toBe(hashSecret("000042"));
  for (const value of [pinVerifier("000042", "other", "session", 1, "v1"), pinVerifier("000042", "store", "other", 1, "v1"), pinVerifier("000042", "store", "session", 2, "v1"), pinVerifier("000042", "store", "session", 1, "v2"), pinVerifier("000043", "store", "session", 1, "v1")]) expect(value).not.toBe(h);
});
it("AES-GCM authenticates context, generation, IV/tag/ciphertext; old keyring supports rolling key rotation", () => {
  keys(); const artifact = encryptPin("000042", "v1", "s", "t", "session", 1);
  expect(Buffer.from(artifact.iv, "base64")).toHaveLength(12); expect(Buffer.from(artifact.tag, "base64")).toHaveLength(16);
  expect(Buffer.from(artifact.ciphertext, "base64")).toHaveLength(6);
  expect(decryptPin(artifact, "v1", "s", "t", "session", 1)).toBe("000042");
  expect(() => decryptPin(artifact, "v1", "s", "t", "session", 2)).toThrow();
  expect(() => decryptPin({ ...artifact, tag: randomBytes(16).toString("base64") }, "v1", "s", "t", "session", 1)).toThrow();
  expect(() => decryptPin({ ...artifact, iv: "AA==" }, "v1", "s", "t", "session", 1)).toThrow();
  vi.stubEnv("TABLE_SESSION_ACTIVE_KEY_ID", "v2"); vi.stubEnv("TABLE_PIN_ACTIVE_HMAC_KEY_ID", "v2");
  expect(decryptPin(artifact, "v1", "s", "t", "session", 1)).toBe("000042");
});
it("startup rejects missing/invalid encryption or HMAC keys without creating ephemeral material", () => {
  keys(); expect(() => validatePinConfiguration()).not.toThrow();
  for (const ring of ["", "{}", "not-json", JSON.stringify({ v1: "short" }), JSON.stringify({ v1: randomBytes(31).toString("base64") })]) {
    vi.stubEnv("TABLE_PIN_HMAC_KEYS", ring); expect(() => validatePinConfiguration()).toThrow();
  }
  keys(); vi.stubEnv("TABLE_SESSION_ENCRYPTION_KEYS", "{}"); expect(() => validatePinConfiguration()).toThrow();
});
