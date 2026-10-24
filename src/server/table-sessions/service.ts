import "server-only";
import type { OwnerTablesView } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import { resourceId, verifySessionInput } from "@/lib/validations/table-sessions";
import { validate } from "@/server/security/api";
import { executePhase2 } from "@/server/security/database";
import type { GuestRequestContext } from "@/server/security/request-context";

export { openPinTableSession as openTableSession, verifyTablePin as verifyTableSession, revealTablePin, rotateTablePin } from "./pin-service";
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
