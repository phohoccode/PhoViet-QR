import { z } from "zod";
export const publicQrCode = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const resourceId = z.uuid();
export const verifySessionInput = z.strictObject({ qrCode: publicQrCode, sessionCode: z.string().min(1).max(64) });
export const openSessionInput = z.strictObject({ requestId: z.uuid() });
export const tablesQuery = z.strictObject({ tableId: resourceId.optional() });
