import { z } from "zod";
export const publicQrCode = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const resourceId = z.uuid();
export const verifySessionInput = z.strictObject({ qrCode: publicQrCode, sessionCode: z.string().length(6).regex(/^[0-9]{6}$/) });
export const openSessionInput = z.strictObject({ requestId: z.uuid() });
export const revealPinInput = z.strictObject({});
export const rotatePinInput = openSessionInput.extend({ expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), confirm: z.literal(true) });
export const tablesQuery = z.strictObject({ tableId: resourceId.optional() });
