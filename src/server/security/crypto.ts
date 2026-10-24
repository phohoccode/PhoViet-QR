import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiFault } from "./api";

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const newBrowserToken = () => randomBytes(32).toString("base64url");
export const newSessionCode = () => randomBytes(16).toString("base64url");
const artifactSchema = z.strictObject({ iv: z.string(), tag: z.string(), ciphertext: z.string() });
export type EncryptedCode = z.infer<typeof artifactSchema>;
function encryptionKey(id: string): Buffer {
  try {
    const ring = JSON.parse(process.env.TABLE_SESSION_ENCRYPTION_KEYS ?? "{}");
    const value = ring[id];
    if (typeof value !== "string") throw new Error();
    const key = Buffer.from(value, "base64");
    if (key.length !== 32 || key.toString("base64") !== value) throw new Error();
    return key;
  } catch { throw new ApiFault("INTERNAL_ERROR"); }
}
export function activeEncryptionKeyId(): string {
  const id = process.env.TABLE_SESSION_ACTIVE_KEY_ID ?? "v1";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new ApiFault("INTERNAL_ERROR");
  encryptionKey(id);
  return id;
}
export function encryptCode(code: string, keyId: string, aad: string): EncryptedCode {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyId), iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
export function decryptCode(value: unknown, keyId: string, aad: string): string {
  try {
    const artifact = artifactSchema.parse(value);
    const iv = Buffer.from(artifact.iv, "base64"), tag = Buffer.from(artifact.tag, "base64"), ciphertext = Buffer.from(artifact.ciphertext, "base64");
    if (iv.length !== 12 || tag.length !== 16 || iv.toString("base64") !== artifact.iv || tag.toString("base64") !== artifact.tag || ciphertext.toString("base64") !== artifact.ciphertext) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyId), iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch { throw new ApiFault("INTERNAL_ERROR"); }
}
export const sessionAad = (store: string, table: string, session: string, actor: string, request: string) =>
  JSON.stringify(["table-session-code", 1, store, table, session, actor, request]);
