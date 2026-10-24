import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { activeEncryptionKeyId, decryptCode, encryptCode } from "@/server/security/crypto";
import { ApiFault } from "@/server/security/api";

function pepper(id: string): Buffer {
  try {
    const value = JSON.parse(process.env.TABLE_PIN_HMAC_KEYS ?? "{}")[id];
    if (typeof value !== "string") throw Error();
    const key = Buffer.from(value, "base64");
    if (key.length !== 32 || key.toString("base64") !== value) throw Error();
    return key;
  } catch { throw new ApiFault("INTERNAL_ERROR"); }
}
export function activePinPepperId(): string {
  const id = process.env.TABLE_PIN_ACTIVE_HMAC_KEY_ID ?? "v1";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new ApiFault("INTERNAL_ERROR");
  pepper(id); return id;
}
export function validatePinConfiguration() {
  activeEncryptionKeyId(); activePinPepperId();
}
export function newTablePin(): string { return randomInt(0, 1_000_000).toString().padStart(6, "0"); }
export function pinVerifier(pin: string, store: string, session: string, generation: number, keyId: string): string {
  if (pin.length !== 6 || !/^[0-9]{6}$/.test(pin) || !Number.isSafeInteger(generation) || generation < 1) throw new ApiFault("INTERNAL_ERROR");
  return createHmac("sha256", pepper(keyId)).update(JSON.stringify(["table-pin-verifier", 1, store, session, generation, pin])).digest("hex");
}
const aad = (store: string, table: string, session: string, generation: number) => JSON.stringify(["table-pin", 1, store, table, session, generation]);
export const encryptPin = (pin: string, keyId: string, store: string, table: string, session: string, generation: number) => encryptCode(pin, keyId, aad(store, table, session, generation));
export function decryptPin(value: unknown, keyId: string, store: string, table: string, session: string, generation: number) {
  const pin = decryptCode(value, keyId, aad(store, table, session, generation));
  if (pin.length !== 6 || !/^[0-9]{6}$/.test(pin)) throw new ApiFault("INTERNAL_ERROR");
  return pin;
}
