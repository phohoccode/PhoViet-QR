import { randomBytes } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { decryptPickup, encryptPickup, newPickupCode, pickupCommandFingerprint, pickupKeys, pickupVerifier } from "../../src/server/pickup/crypto";
import { completeOrderInput } from "../../src/lib/validations/owner-orders";
import { pinVerifier } from "../../src/server/table-sessions/pin-crypto";
vi.mock("node:crypto", async importOriginal => ({ ...await importOriginal<typeof import("node:crypto")>(), randomInt: () => 42 }));
const store = "00000000-0000-4000-8000-000000000001", order = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.stubEnv("PICKUP_ENCRYPTION_KEYS", JSON.stringify({ v1: randomBytes(32).toString("base64") }));
  vi.stubEnv("PICKUP_HMAC_KEYS", JSON.stringify({ v1: randomBytes(32).toString("base64") }));
  vi.stubEnv("PICKUP_ACTIVE_ENCRYPTION_KEY_ID", "v1"); vi.stubEnv("PICKUP_ACTIVE_HMAC_KEY_ID", "v1");
});
afterEach(() => vi.unstubAllEnvs());
it("CSPRNG integer is padded into exactly six ASCII digits; strict wire validation retains zeros", () => {
  expect(newPickupCode()).toBe("000042");
  const cmd = { requestId: order, expectedVersion: 1, type: "takeaway", pickupCode: "000042" };
  expect(completeOrderInput.parse(cmd)).toEqual(cmd);
  for (const pickupCode of [42, "12345", "1234567", "１２３４５６", "١٢٣٤٥٦", " 123456", "123456\n", null, undefined])
    expect(completeOrderInput.safeParse({ ...cmd, pickupCode }).success).toBe(false);
});
it("HMAC verifier binds order/store; command fingerprint binds actor, key, version and code", () => {
  const proof = pickupVerifier("000042", store, order, "v1");
  expect(proof).toMatch(/^[a-f0-9]{64}$/);
  expect(pickupVerifier("000042", store, order, "v1")).toBe(proof);
  expect(pickupVerifier("000042", order, store, "v1")).not.toBe(proof);
  const fp = (code = "000042", owner = store, request = order, version = 1) => pickupCommandFingerprint(code, store, owner, order, request, version, "v1");
  expect(fp()).not.toBe(proof);
  for (const value of [fp("000043"), fp("000042", order), fp("000042", store, store), fp("000042", store, order, 2)]) expect(value).not.toBe(fp());
});
it("a table PIN proof cannot authorize pickup, even with identical numeric text, key bytes and IDs", () => {
  // Deliberately reuse TEST ONLY bytes to verify cryptographic domain separation.
  vi.stubEnv("TABLE_PIN_HMAC_KEYS", process.env.PICKUP_HMAC_KEYS!);
  expect(pinVerifier("000042", store, order, 1, "v1")).not.toBe(pickupVerifier("000042", store, order, "v1"));
});
it("AEAD recovery is stable plaintext with fresh nonces; tamper, context swap, missing keys fail closed", () => {
  const first = encryptPickup("000042", store, order, "v1"), second = encryptPickup("000042", store, order, "v1");
  expect(first).not.toEqual(second);
  expect(decryptPickup(first, store, order, "v1")).toBe("000042");
  for (const value of [{ ...first, tag: randomBytes(16).toString("base64") }, { ...first, ciphertext: "broken" }, { ...first, code: "000042" }])
    expect(() => decryptPickup(value, store, order, "v1")).toThrow();
  expect(() => decryptPickup(first, order, store, "v1")).toThrow();
  vi.stubEnv("PICKUP_ENCRYPTION_KEYS", "{}");
  expect(() => decryptPickup(first, store, order, "v1")).toThrow();
});
it("missing, malformed, noncanonical or shared active key bytes are rejected", () => {
  expect(pickupKeys()).toEqual({ encryptionKeyId: "v1", hmacKeyId: "v1" });
  vi.stubEnv("PICKUP_HMAC_KEYS", process.env.PICKUP_ENCRYPTION_KEYS!);
  expect(() => pickupKeys()).toThrow();
  for (const value of ["", "not json", '{}', '{"v1":"short"}']) {
    vi.stubEnv("PICKUP_HMAC_KEYS", value); expect(() => pickupKeys()).toThrow();
  }
});
