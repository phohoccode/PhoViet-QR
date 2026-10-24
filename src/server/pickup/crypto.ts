import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { ApiFault } from "@/server/security/api";

export const pickupCodeSchema = z.string().regex(/^[0-9]{6}$/);
const artifactSchema = z.strictObject({ iv: z.string(), tag: z.string(), ciphertext: z.string() });
export type PickupCiphertext = z.infer<typeof artifactSchema>;
function key(ringName: string, id: string): Buffer {
  try {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw Error();
    const value = JSON.parse(process.env[ringName] ?? "{}")[id];
    if (typeof value !== "string") throw Error();
    const bytes = Buffer.from(value, "base64");
    if (bytes.length !== 32 || bytes.toString("base64") !== value) throw Error();
    return bytes;
  } catch { throw new ApiFault("PICKUP_CREDENTIAL_UNAVAILABLE"); }
}
export function pickupKeys() {
  const encryptionKeyId = process.env.PICKUP_ACTIVE_ENCRYPTION_KEY_ID ?? "v1";
  const hmacKeyId = process.env.PICKUP_ACTIVE_HMAC_KEY_ID ?? "v1";
  if (key("PICKUP_ENCRYPTION_KEYS", encryptionKeyId).equals(key("PICKUP_HMAC_KEYS", hmacKeyId))) throw new ApiFault("PICKUP_CREDENTIAL_UNAVAILABLE");
  return { encryptionKeyId, hmacKeyId };
}
export const newPickupCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
export function pickupVerifier(code: string, storeId: string, orderId: string, keyId: string): string {
  if (!pickupCodeSchema.safeParse(code).success) throw new ApiFault("VALIDATION_ERROR");
  return createHmac("sha256", key("PICKUP_HMAC_KEYS", keyId)).update(JSON.stringify(["pickup-verifier", 1, storeId, orderId, code])).digest("hex");
}
export function pickupCommandFingerprint(code: string, storeId: string, ownerId: string, orderId: string, requestId: string, expectedVersion: number, keyId: string): string {
  if (!pickupCodeSchema.safeParse(code).success) throw new ApiFault("VALIDATION_ERROR");
  return createHmac("sha256", key("PICKUP_HMAC_KEYS", keyId)).update(JSON.stringify(["pickup-command", 1, storeId, ownerId, orderId, requestId, expectedVersion, "takeaway", code])).digest("hex");
}
const aad = (store: string, order: string) => JSON.stringify(["pickup-code", 1, store, order]);
export function encryptPickup(code: string, store: string, order: string, keyId: string): PickupCiphertext {
  if (!pickupCodeSchema.safeParse(code).success) throw new ApiFault("VALIDATION_ERROR");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key("PICKUP_ENCRYPTION_KEYS", keyId), iv);
  cipher.setAAD(Buffer.from(aad(store, order)));
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
export function decryptPickup(value: unknown, store: string, order: string, keyId: string): string {
  try {
    const artifact = artifactSchema.parse(value);
    const iv = Buffer.from(artifact.iv, "base64"), tag = Buffer.from(artifact.tag, "base64"), ciphertext = Buffer.from(artifact.ciphertext, "base64");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length !== 6 || iv.toString("base64") !== artifact.iv || tag.toString("base64") !== artifact.tag || ciphertext.toString("base64") !== artifact.ciphertext) throw Error();
    const decipher = createDecipheriv("aes-256-gcm", key("PICKUP_ENCRYPTION_KEYS", keyId), iv);
    decipher.setAAD(Buffer.from(aad(store, order))); decipher.setAuthTag(tag);
    return pickupCodeSchema.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  } catch { throw new ApiFault("PICKUP_CREDENTIAL_UNAVAILABLE"); }
}
