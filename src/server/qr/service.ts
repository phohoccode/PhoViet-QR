import "server-only";
import type { QRResolution, QRCodeView } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import { publicQrCode } from "@/lib/validations/table-sessions";
import { executePhase2 } from "@/server/security/database";
import { validate } from "@/server/security/api";
import type { GuestRequestContext } from "@/server/security/request-context";

export async function resolvePublicQr(code: string, context: GuestRequestContext): Promise<QRResolution> {
  return (await executePhase2<QRResolution>("resolve", { qrCode: validate(publicQrCode, code), browserHash: context.browserHash, grantProof: context.grantProof, newBrowser: context.isNew })).data;
}
export async function listOwnerQrCodes(owner: OwnerContext): Promise<QRCodeView[]> {
  return (await executePhase2<QRCodeView[]>("owner_qrs", { ownerId: owner.authUserId, storeId: owner.storeId })).data;
}
