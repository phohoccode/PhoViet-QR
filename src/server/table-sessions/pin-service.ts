import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { OwnerSessionOpenedView, OwnerTablePinView, QRResolution, RotateTablePinInput } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import type { GuestRequestContext } from "@/server/security/request-context";
import { validate, ApiFault } from "@/server/security/api";
import { activeEncryptionKeyId } from "@/server/security/crypto";
import { openSessionInput, resourceId, rotatePinInput, verifySessionInput } from "@/lib/validations/table-sessions";
import { activePinPepperId, decryptPin, encryptPin, newTablePin, pinVerifier } from "./pin-crypto";
import { executePin, type PinResult } from "./pin-database";

const ownerScope = (owner: OwnerContext) => ({ storeId: owner.storeId, ownerId: owner.authUserId });
const metadata = z.object({ storeId: resourceId, sessionId: resourceId, tableId: resourceId, generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sessionVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), issuedAt: z.iso.datetime({ offset: true }).nullable(), expiresAt: z.iso.datetime({ offset: true }),
  table: z.object({ id: resourceId, label: z.string() }), session: z.object({ id: resourceId, version: z.number().int().positive(), status: z.literal("open"),
    openedAt: z.iso.datetime({ offset: true }), closedAt: z.null(), orderCount: z.number().int().nonnegative(), totalVnd: z.number().int().nonnegative(), paymentStatus: z.enum(["unpaid", "paid"]), pinState: z.enum(["legacy", "active", "expired"]).optional() }),
});
type Metadata = z.infer<typeof metadata>;
function checked(result: PinResult<unknown>, owner: OwnerContext): Metadata {
  const parsed = metadata.safeParse(result.data);
  if (!parsed.success || parsed.data.storeId !== owner.storeId || parsed.data.session.id !== parsed.data.sessionId || parsed.data.tableId !== parsed.data.table.id) throw new ApiFault("INTERNAL_ERROR");
  return parsed.data;
}
function secret(result: PinResult<unknown>, owner: OwnerContext): OwnerTablePinView {
  const value = checked(result, owner);
  if (value.generation < 1 || !value.issuedAt || !result.keyId) throw new ApiFault("INTERNAL_ERROR");
  return { sessionId: value.sessionId, sessionVersion: value.sessionVersion, generation: value.generation, issuedAt: value.issuedAt, expiresAt: value.expiresAt,
    pinFormat: "numeric_6", pin: decryptPin(result.delivery, result.keyId, owner.storeId, value.tableId, value.sessionId, value.generation) };
}
function encryptedCommand(pin: string, owner: OwnerContext, table: string, session: string, generation: number) {
  const keyId = activeEncryptionKeyId(), pepperId = activePinPepperId();
  return { keyId, pepperId, generation, verifier: pinVerifier(pin, owner.storeId, session, generation, pepperId), artifact: encryptPin(pin, keyId, owner.storeId, table, session, generation) };
}
export async function openPinTableSession(owner: OwnerContext, tableId: string, input: { requestId: string }): Promise<OwnerSessionOpenedView> {
  tableId = validate(resourceId, tableId).toLowerCase();
  const command = validate(openSessionInput, input), sessionId = randomUUID();
  const result = await executePin<unknown>("open", { ...ownerScope(owner), ...command, tableId, sessionId, ...encryptedCommand(newTablePin(), owner, tableId, sessionId, 1) });
  const value = checked(result, owner), pin = secret(result, owner);
  return { table: value.table, session: value.session, sessionCredential: {
    sessionCode: pin.pin, expiresAt: pin.expiresAt, pinFormat: pin.pinFormat, generation: pin.generation, issuedAt: pin.issuedAt,
  } };
}
export async function revealTablePin(owner: OwnerContext, id: string): Promise<OwnerTablePinView> {
  return secret(await executePin("reveal", { ...ownerScope(owner), sessionId: validate(resourceId, id) }), owner);
}
export async function rotateTablePin(owner: OwnerContext, id: string, input: RotateTablePinInput): Promise<OwnerTablePinView> {
  const sessionId = validate(resourceId, id).toLowerCase(), command = validate(rotatePinInput, input);
  const current = await executePin<unknown>("inspect", { ...ownerScope(owner), sessionId });
  const info = checked(current, owner);
  const oldPin = info.generation > 0 ? secret(current, owner).pin : null;
  let pin: string; do { pin = newTablePin(); } while (pin === oldPin);
  const result = await executePin("rotate", { ...ownerScope(owner), sessionId, ...command, ...encryptedCommand(pin, owner, info.tableId, sessionId, info.generation + 1) });
  return secret(result, owner);
}
export async function verifyTablePin(qrCode: string, sessionCode: string, context: GuestRequestContext): Promise<QRResolution> {
  const input = validate(verifySessionInput, { qrCode, sessionCode });
  const located = await executePin<unknown>("locate", { qrCode: input.qrCode });
  const schema = z.object({ storeId: resourceId, sessionId: resourceId, generation: z.number().int().nonnegative(), pepperId: z.string().nullable() }).nullable();
  const parsed = schema.safeParse(located.data);
  if (!parsed.success) throw new ApiFault("INTERNAL_ERROR");
  const scope = parsed.data;
  const verifier = scope && scope.generation > 0 && scope.pepperId
    ? pinVerifier(input.sessionCode, scope.storeId, scope.sessionId, scope.generation, scope.pepperId) : "0".repeat(64);
  return (await executePin<QRResolution>("verify", {
    qrCode: input.qrCode, sessionId: scope?.sessionId, generation: scope?.generation, verifier,
    browserHash: context.browserHash, grantProof: context.grantProof, newBrowser: context.isNew, ipHash: context.ipHash,
  })).data;
}
