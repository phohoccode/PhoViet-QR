import { z } from "zod";
import { publicQrCode, resourceId } from "./table-sessions";
export const CART_LIMITS = { maxLines: 100, maxQuantity: 99, maxTotalQuantity: 9900, maxNoteLength: 500, maxOptions: 50, maxStorageBytes: 65536 } as const;
export const cartNote = z.string().transform(value => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim()).pipe(z.string().max(CART_LIMITS.maxNoteLength)).nullable().optional().transform(value => value || null);
export const cartQuantity = z.number().int().min(1).max(CART_LIMITS.maxQuantity);
export const cartOptionIds = z.array(resourceId).max(CART_LIMITS.maxOptions).refine(ids => new Set(ids).size === ids.length).transform(ids => [...ids].sort());
export const addCartLineSchema = z.strictObject({ menuItemId: resourceId, quantity: cartQuantity, optionIds: cartOptionIds, note: cartNote });
export const cartContextSchema = z.discriminatedUnion("orderType", [
  z.strictObject({ storeId: resourceId, qrCode: publicQrCode, orderType: z.literal("dine_in"), tableId: resourceId }),
  z.strictObject({ storeId: resourceId, qrCode: publicQrCode, orderType: z.literal("takeaway"), tableId: z.null() }),
]);
const store = z.strictObject({ id: resourceId, name: z.string().min(1).max(120), timezone: z.string().min(1).max(100), acceptingOrders: z.boolean() });
const table = z.strictObject({ id: resourceId, label: z.string().min(1).max(80) });
export const cartResolutionSchema = z.union([
  z.strictObject({ type: z.literal("table"), mode: z.literal("dine_in"), store, table, requiresSessionCode: z.literal(true), session: z.null() }),
  z.strictObject({ type: z.literal("table"), mode: z.literal("dine_in"), store, table, requiresSessionCode: z.literal(false), session: z.strictObject({ id: resourceId, status: z.enum(["open", "checkout_pending"]) }) }),
  z.strictObject({ type: z.literal("takeaway"), mode: z.literal("takeaway"), store, table: z.null(), requiresSessionCode: z.literal(false), session: z.null() }),
]);
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const priceSnapshotSchema = z.strictObject({ basePriceVnd: money, options: z.array(z.strictObject({ id: resourceId, priceDeltaVnd: money })).max(CART_LIMITS.maxOptions) });
const storedLine = z.strictObject({ menuItemId: resourceId, quantity: cartQuantity, optionIds: cartOptionIds, snapshot: priceSnapshotSchema, noteOmitted: z.boolean() });
export const storedCartSchema = z.strictObject({ version: z.literal(1), context: cartContextSchema,
  boundSessionId: resourceId.nullable(), reviewedRevision: z.string().min(1).max(128).nullable(), contextNeedsReview: z.boolean(),
  lines: z.array(storedLine).max(CART_LIMITS.maxLines),
}).superRefine((cart, ctx) => {
  if (cart.context.orderType === "takeaway" && cart.boundSessionId !== null) ctx.addIssue({ code: "custom", message: "Unexpected table session" });
  if (cart.lines.reduce((sum, line) => sum + line.quantity, 0) > CART_LIMITS.maxTotalQuantity) ctx.addIssue({ code: "custom", message: "Quantity limit" });
  const lineKeys = new Set<string>();
  for (const line of cart.lines) {
    const ids = line.snapshot.options.map(option => option.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(line.optionIds)) ctx.addIssue({ code: "custom", message: "Snapshot option mismatch" });
    // Notes omitted for privacy intentionally restore as separate review lines.
    // Every other line must have one unique canonical key, just like the reducer.
    if (!line.noteOmitted) {
      const key = JSON.stringify([line.menuItemId, line.optionIds]);
      if (lineKeys.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate cart line" });
      lineKeys.add(key);
    }
  }
});
