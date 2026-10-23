import { z } from "zod";
import { resourceId } from "./table-sessions";

export const tableLabel = z.string().transform(value => value.replace(/[\s\u0085]+/g, " ").trim()).pipe(
  z.string().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f-\u009f]/.test(value)),
);
const command = { requestId: resourceId };
const timestamp = z.iso.datetime({ offset: true });
export const createTableInput = z.strictObject({ ...command, label: tableLabel });
export const updateTableInput = z.strictObject({ ...command, expectedUpdatedAt: timestamp, label: tableLabel.optional(), active: z.boolean().optional() })
  .refine(input => input.label !== undefined || input.active !== undefined);
export const rotateQrInput = z.strictObject({ ...command, expectedUpdatedAt: timestamp, confirm: z.literal(true) });
export const writeQrInput = z.union([
  z.strictObject({ ...command, action: z.literal("create"), type: z.literal("table"), tableId: resourceId }),
  z.strictObject({ ...command, action: z.literal("create"), type: z.literal("takeaway"), tableId: z.null() }),
  z.strictObject({ ...command, action: z.literal("set_active"), id: resourceId, active: z.boolean() }),
]);
