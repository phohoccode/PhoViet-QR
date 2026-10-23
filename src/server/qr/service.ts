import "server-only";
import type { QRResolution, QRCodeView } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import { publicQrCode } from "@/lib/validations/table-sessions";
import { executePhase2 } from "@/server/security/database";
import { validate } from "@/server/security/api";
import type { GuestRequestContext } from "@/server/security/request-context";
import type { OwnerQrCode, WriteQrInput, RotateQrInput } from "@/types/contracts/table-qr";
import { writeQrInput, rotateQrInput } from "@/lib/validations/table-qr";
import { resourceId } from "@/lib/validations/table-sessions";
import { executeTableQr } from "./database";
import { qrBaseUrl, qrPublicUrl } from "./public-url";

export async function resolvePublicQr(code: string, context: GuestRequestContext): Promise<QRResolution> {
  return (await executePhase2<QRResolution>("resolve", { qrCode: validate(publicQrCode, code), browserHash: context.browserHash, grantProof: context.grantProof, newBrowser: context.isNew })).data;
}
export async function listOwnerQrCodes(owner: OwnerContext): Promise<QRCodeView[]> {
  return (await executePhase2<QRCodeView[]>("owner_qrs", { ownerId: owner.authUserId, storeId: owner.storeId })).data;
}
const scope = (owner: OwnerContext) => ({ ownerId: owner.authUserId, storeId: owner.storeId });
export async function listManagedQrCodes(owner: OwnerContext): Promise<OwnerQrCode[]> {
  const base = qrBaseUrl();
  const rows = await executeTableQr<OwnerQrCode[]>("qrs", scope(owner));
  return rows.map(row => ({ ...row, publicUrl: qrPublicUrl(row.publicCode, base) }));
}
export async function writeOwnerQr(owner: OwnerContext, input: WriteQrInput): Promise<OwnerQrCode> {
  const base = qrBaseUrl();
  const row = await executeTableQr<OwnerQrCode>("write_qr", { ...scope(owner), ...validate(writeQrInput, input) });
  return { ...row, publicUrl: qrPublicUrl(row.publicCode, base) };
}
export async function rotateOwnerQr(owner: OwnerContext, id: string, input: RotateQrInput): Promise<OwnerQrCode> {
  const base = qrBaseUrl();
  const row = await executeTableQr<OwnerQrCode>("rotate_qr", { ...scope(owner), id: validate(resourceId, id), ...validate(rotateQrInput, input) });
  return { ...row, publicUrl: qrPublicUrl(row.publicCode, base) };
}
