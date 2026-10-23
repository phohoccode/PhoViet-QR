import "server-only";
import { randomUUID } from "node:crypto";
import type { OwnerSessionOpenedView, OwnerTablesView, QRResolution } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import { openSessionInput, resourceId, verifySessionInput } from "@/lib/validations/table-sessions";
import { validate } from "@/server/security/api";
import { executePhase2 } from "@/server/security/database";
import { activeEncryptionKeyId, decryptCode, encryptCode, hashSecret, newSessionCode, sessionAad } from "@/server/security/crypto";
import type { GuestRequestContext } from "@/server/security/request-context";

export async function openTableSession(owner: OwnerContext, tableId: string, input: { requestId: string }): Promise<OwnerSessionOpenedView> {
  tableId = validate(resourceId, tableId);
  const { requestId } = validate(openSessionInput, input);
  const sessionId = randomUUID(), code = newSessionCode(), keyId = activeEncryptionKeyId();
  const aad = sessionAad(owner.storeId, tableId, sessionId, owner.authUserId, requestId);
  const result = await executePhase2<Omit<OwnerSessionOpenedView, "sessionCredential">>("open", {
    ownerId: owner.authUserId, storeId: owner.storeId, tableId, requestId, sessionId, keyId,
    codeHash: hashSecret(code), artifact: encryptCode(code, keyId, aad),
    fingerprint: hashSecret(JSON.stringify(["open_table_session", tableId])),
  });
  const actualAad = sessionAad(owner.storeId, tableId, result.data.session.id, owner.authUserId, requestId);
  return { ...result.data, sessionCredential: {
    sessionCode: decryptCode(result.delivery, result.keyId!, actualAad), expiresAt: result.expiresAt!,
  } };
}
export async function verifyTableSession(qrCode: string, sessionCode: string, context: GuestRequestContext): Promise<QRResolution> {
  const input = validate(verifySessionInput, { qrCode, sessionCode });
  return (await executePhase2<QRResolution>("verify", {
    qrCode: input.qrCode, codeHash: hashSecret(input.sessionCode), browserHash: context.browserHash, grantProof: context.grantProof, newBrowser: context.isNew, ipHash: context.ipHash,
  })).data;
}
export async function listOwnerTables(owner: OwnerContext, tableId?: string): Promise<OwnerTablesView> {
  if (tableId) validate(resourceId, tableId);
  return (await executePhase2<OwnerTablesView>("owner_tables", { ownerId: owner.authUserId, storeId: owner.storeId, tableId })).data;
}
export type GuestTableSession = {
  storeId: string; tableId: string; sessionId: string; guestAccessId: string; browserContextHash: string; expiresAt: string;
};
/** Server-only Phase3 prerequisite. Future order transaction must recheck under lock. */
export async function requireGuestTableSession(qrCode: string, context: GuestRequestContext, options: { forWrite?: boolean; expectedSessionId?: string } = {}): Promise<GuestTableSession> {
  validate(verifySessionInput.shape.qrCode, qrCode);
  if (options.expectedSessionId) validate(resourceId, options.expectedSessionId);
  return (await executePhase2<GuestTableSession>("guest", {
    qrCode, browserHash: context.browserHash, grantProof: context.grantProof, forWrite: options.forWrite ?? true, expectedSessionId: options.expectedSessionId,
  })).data;
}
