import { z } from "zod";
import { orderId } from "./orders";

const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const claimNextInput = z.strictObject({ requestId: orderId });
export const readyOrderInput = claimNextInput.extend({ expectedVersion: version });
export const completeOrderInput = z.discriminatedUnion("type", [
  readyOrderInput.extend({ type: z.literal("dine_in") }),
  readyOrderInput.extend({ type: z.literal("takeaway"), pickupCode: z.string().min(1).max(64) }),
]);
export const ownerOrdersQuery = z.strictObject({
  view: z.enum(["queue", "exceptions", "history"]).default("queue"),
  type: z.enum(["dine_in", "takeaway"]).optional(),
  status: z.enum(["pending_payment", "accepted", "preparing", "ready", "completed", "cancelled", "payment_exception"]).optional(),
  orderId: orderId.optional(), cursor: z.string().min(1).max(2048).optional(),
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).optional().default(50),
}).superRefine((query, ctx) => {
  const allowed = { queue: ["accepted", "preparing", "ready"], exceptions: ["pending_payment", "payment_exception"], history: ["completed", "cancelled"] };
  if (query.status && !allowed[query.view].includes(query.status)) ctx.addIssue({ code: "custom", message: "Status does not belong to view" });
});

export const ownerOrdersCursor = z.strictObject({
  v: z.literal(1), storeId: orderId, view: z.enum(["queue", "exceptions", "history"]),
  type: z.enum(["dine_in", "takeaway"]).nullable(), status: z.string().nullable(),
  after: z.union([
    z.strictObject({ day: z.iso.date(), ticket: version, id: orderId }),
    z.strictObject({ createdAt: z.iso.datetime({ offset: true }), id: orderId }),
  ]),
});
