import { z } from "zod";
import type { SettleSessionInput, TableBillView } from "@contracts";
import { resourceId, publicQrCode } from "./table-sessions";
import { dineInOrderResponse } from "./orders";

const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const billVersion = z.string().regex(/^[a-f0-9]{32}$/);
const command = { requestId: resourceId.transform(v => v.toLowerCase()), expectedVersion: version };
export const settleSessionInput = z.discriminatedUnion("action", [
  z.strictObject({ ...command, action: z.literal("begin_checkout"), expectedBillVersion: billVersion }),
  z.strictObject({ ...command, action: z.literal("cancel_checkout") }),
  z.strictObject({ ...command, action: z.literal("confirm_received"), expectedBillVersion: billVersion,
    paymentMethod: z.enum(["cash", "bank_transfer"]), receivedConfirmed: z.literal(true) }),
]) satisfies z.ZodType<SettleSessionInput>;
export const guestBillQuery = z.strictObject({ qrCode: publicQrCode, sessionId: resourceId.optional() });
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
export const tableBillResponse = z.strictObject({
  kind: z.literal('paid_receipt').optional(), receiptId: resourceId.optional(),
  receiptVersion: version.optional(), currency: z.literal('VND').optional(),
  table: z.strictObject({ id: resourceId, label: z.string().min(1).max(80) }),
  session: z.strictObject({ id: resourceId, status: z.enum(["open", "checkout_pending", "closed"]),
    openedAt: timestamp, closedAt: timestamp.nullable(), orderCount: z.number().int().nonnegative(),
    totalVnd: money, paymentStatus: z.enum(["unpaid", "paid"]), version,
    pinState: z.enum(["legacy", "active", "expired"]).optional() }),
  orders: z.array(dineInOrderResponse), totalVnd: money, billVersion,
  outstandingOrders: z.number().int().nonnegative(), canAcceptMoreOrders: z.boolean(), canSettle: z.boolean(),
  settledAt: timestamp.nullable(), paymentMethod: z.enum(["cash", "bank_transfer"]).nullable(),
}).superRefine((bill, ctx) => {
  const total = bill.orders.filter(o => o.status !== "cancelled").reduce((n, o) => n + BigInt(o.totalVnd), BigInt(0));
  if (total !== BigInt(bill.totalVnd) || bill.session.totalVnd !== bill.totalVnd || bill.session.orderCount !== bill.orders.length ||
    bill.outstandingOrders !== bill.orders.filter(o => o.status !== "completed" && o.status !== "cancelled").length ||
    bill.orders.some(o => o.tableSessionId !== bill.session.id || o.table.id !== bill.table.id || o.paymentStatus !== bill.session.paymentStatus) ||
    (bill.session.status === "closed") !== (bill.session.closedAt !== null) ||
    (bill.session.paymentStatus === "paid") !== (bill.settledAt !== null && bill.paymentMethod !== null) ||
    (bill.canSettle && (bill.session.status !== "checkout_pending" || bill.outstandingOrders !== 0 || bill.session.paymentStatus === "paid")) ||
    (bill.canAcceptMoreOrders && bill.session.status !== "open") ||
    ([bill.kind, bill.receiptId, bill.receiptVersion, bill.currency].some(v => v !== undefined) &&
      (bill.kind !== 'paid_receipt' || !bill.receiptId || !bill.receiptVersion || bill.currency !== 'VND' ||
       bill.session.status !== 'closed' || bill.session.paymentStatus !== 'paid' || bill.canAcceptMoreOrders || bill.canSettle))) {
    ctx.addIssue({ code: "custom", message: "Inconsistent session bill" });
  }
}).transform(bill => bill as TableBillView);
