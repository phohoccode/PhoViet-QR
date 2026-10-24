import { z } from "zod";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type CreateOrderV1Input, type OrderDetail, type OrderSummary, type TakeawayPaymentViewState } from "@contracts";
import { publicQrCode, resourceId } from "./table-sessions";

// Same text normalization as the cart; field presence is required on the wire.
const note = z.string().max(500).transform(value => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim() || null).nullable();
const id = resourceId.transform(value => value.toLowerCase());
export const createOrderInput = z.strictObject({
  qrCode: publicQrCode,
  clientRequestId: id,
  menuRevision: z.string().min(1).max(128),
  items: z.array(z.strictObject({
    menuItemId: id,
    quantity: z.number().int().min(1).max(99),
    optionIds: z.array(id).max(50).refine(ids => new Set(ids).size === ids.length).transform(ids => [...ids].sort()),
    note,
  })).min(1).max(100),
  note,
}) satisfies z.ZodType<CreateOrderV1Input>;
export const orderId = id;
export const orderTrackingQuery = z.strictObject({ includePickup: z.enum(["true", "false"]).optional().transform(value => value === "true") });

const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
const viewNote = z.string().max(500).nullable();
const states = z.discriminatedUnion("status", [
  z.object({ status: z.literal("accepted"), statusLabel: z.literal("Chờ làm"), fulfillmentStatus: z.literal("awaiting_preparation") }),
  z.object({ status: z.literal("preparing"), statusLabel: z.literal("Đang làm"), fulfillmentStatus: z.literal("preparing") }),
  z.object({ status: z.literal("ready"), statusLabel: z.literal("Sẵn sàng"), fulfillmentStatus: z.literal("ready") }),
  z.object({ status: z.literal("completed"), statusLabel: z.literal("Đã giao"), fulfillmentStatus: z.literal("served") }),
  z.object({ status: z.literal("cancelled"), statusLabel: z.literal("Đã hủy"), fulfillmentStatus: z.literal("cancelled") }),
]);
const lineView = z.strictObject({ id, menuItemId: id, name: z.string().min(1).max(120), baseUnitPriceVnd: money,
  options: z.array(z.strictObject({ menuOptionId: id, name: z.string().min(1).max(120), priceDeltaVnd: money })).max(50),
  unitPriceVnd: money, quantity: z.number().int().min(1).max(99), lineTotalVnd: money, note: viewNote });
// Dine-in payment derives from the unique successful session settlement.
const dineInSummaryFields = z.object({
  id, storeId: id, type: z.literal("dine_in"), tableSessionId: id, table: z.strictObject({ id, label: z.string().min(1).max(80) }),
  ticketNo: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), serviceDate: z.iso.date(), acceptedAt: timestamp,
  paymentStatus: z.enum(["unpaid", "paid"]), totalVnd: money, itemCount: z.number().int().min(1).max(9900),
  createdAt: timestamp, updatedAt: timestamp, version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
export const dineInOrderSummaryResponse = dineInSummaryFields.and(states);
export const dineInOrderResponse = dineInSummaryFields.extend({
  lines: z.array(lineView).min(1).max(100), note: viewNote,
  payment: z.strictObject({ kind: z.literal("table_session"), tableSessionId: id, intentId: z.null(), intentStatus: z.null(),
    status: z.enum(["unpaid", "paid"]), statusLabel: z.enum(["Chưa thanh toán", "Đã thanh toán"]), amountVnd: money, currency: z.literal("VND"), updatedAt: timestamp, reconciliationRequired: z.literal(false) }),
}).and(states).superRefine((order, ctx) => {
  if (order.payment.status !== order.paymentStatus || order.payment.statusLabel !== PAYMENT_STATUS_LABELS[order.paymentStatus] ||
      order.payment.tableSessionId !== order.tableSessionId || order.payment.amountVnd !== order.totalVnd ||
      order.itemCount !== order.lines.reduce((sum, line) => sum + line.quantity, 0) ||
      BigInt(order.totalVnd) !== order.lines.reduce((sum, line) => sum + BigInt(line.lineTotalVnd), BigInt(0)) ||
      order.lines.some(line => BigInt(line.unitPriceVnd) !== BigInt(line.baseUnitPriceVnd) + line.options.reduce((sum, option) => sum + BigInt(option.priceDeltaVnd), BigInt(0)) || BigInt(line.lineTotalVnd) !== BigInt(line.unitPriceVnd) * BigInt(line.quantity)))
    ctx.addIssue({ code: "custom", message: "Inconsistent order snapshot" });
}).transform(order => order as Extract<OrderDetail, { type: "dine_in" }>) satisfies z.ZodType<OrderDetail>;

const takeawaySummary = z.object({
  ...dineInSummaryFields.omit({ type: true, table: true, tableSessionId: true, paymentStatus: true, ticketNo: true, serviceDate: true, acceptedAt: true }).shape,
  type: z.literal("takeaway"), tableSessionId: z.null(), table: z.null(),
  paymentReviewRequired: z.boolean().optional(),
  ticketNo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(), serviceDate: z.iso.date().nullable(), acceptedAt: timestamp.nullable(),
  status: z.enum(["pending_payment", "accepted", "preparing", "ready", "completed", "cancelled", "payment_exception"]),
  statusLabel: z.string(), paymentStatus: z.enum(["pending", "paid", "expired", "exception"]),
  fulfillmentStatus: z.enum(["awaiting_preparation", "preparing", "ready", "collected", "cancelled"]),
}).superRefine((o, ctx) => {
  const issued = ["accepted", "preparing", "ready", "completed"].includes(o.status);
  const expectedPayment = issued ? "paid" : o.status === "payment_exception" ? "exception" : o.status === "cancelled" ? "expired" : "pending";
  const expectedFulfillment = ["pending_payment", "payment_exception", "accepted"].includes(o.status) ? "awaiting_preparation" : o.status === "completed" ? "collected" : o.status;
  if (o.statusLabel !== ORDER_STATUS_LABELS[o.status] || o.paymentStatus !== expectedPayment || o.fulfillmentStatus !== expectedFulfillment ||
    (issued ? o.ticketNo === null || o.acceptedAt === null || o.serviceDate === null : o.ticketNo !== null || o.acceptedAt !== null || o.serviceDate !== null)) {
    ctx.addIssue({ code: "custom", message: "Inconsistent takeaway lifecycle" });
  }
});
const paymentBase = z.object({ kind: z.literal("takeaway"), intentId: id, amountVnd: money, currency: z.literal("VND"),
  updatedAt: timestamp, expiresAt: timestamp, statusLabel: z.string() });
export const takeawayPaymentResponse = z.discriminatedUnion("status", [
  paymentBase.extend({ status: z.literal("pending"), intentStatus: z.literal("pending"), reconciliationRequired: z.literal(false), checkoutUrl: z.url().nullable(), qrPayload: z.string().nullable() }),
  paymentBase.extend({ status: z.literal("paid"), intentStatus: z.literal("succeeded"), reconciliationRequired: z.boolean() }),
  paymentBase.extend({ status: z.literal("expired"), intentStatus: z.literal("expired"), reconciliationRequired: z.literal(false) }),
  paymentBase.extend({ status: z.literal("exception"), intentStatus: z.literal("exception"), reconciliationRequired: z.literal(true) }),
]).superRefine((p, ctx) => { if (p.statusLabel !== PAYMENT_STATUS_LABELS[p.status]) ctx.addIssue({ code: "custom", message: "Incorrect payment label" }); }).transform(p => p as TakeawayPaymentViewState);
const takeawayDetail = takeawaySummary.and(z.object({ lines: z.array(lineView).min(1).max(100), note: viewNote, payment: takeawayPaymentResponse })).superRefine((o, ctx) => {
  if (o.payment.status !== o.paymentStatus || o.payment.amountVnd !== o.totalVnd || o.itemCount !== o.lines.reduce((sum, l) => sum + l.quantity, 0) ||
    BigInt(o.totalVnd) !== o.lines.reduce((sum, l) => sum + BigInt(l.lineTotalVnd), BigInt(0)) ||
    o.lines.some(l => BigInt(l.unitPriceVnd) !== BigInt(l.baseUnitPriceVnd) + l.options.reduce((sum, opt) => sum + BigInt(opt.priceDeltaVnd), BigInt(0)) || BigInt(l.lineTotalVnd) !== BigInt(l.unitPriceVnd) * BigInt(l.quantity))) ctx.addIssue({ code: "custom", message: "Inconsistent takeaway snapshot" });
});
// Cross-field refinements above enforce the canonical discriminated union.
export const orderResponse = z.union([dineInOrderResponse, takeawayDetail]).transform(o => o as OrderDetail);
export const orderSummaryResponse = z.union([dineInOrderSummaryResponse, takeawaySummary]).transform(o => o as OrderSummary);

/**
 * Kiểm tra xem đơn hàng mang đi có đang bị tạm giữ để đối soát thanh toán hay không (P4-C04).
 * Trả về true nếu paymentReviewRequired=true hoặc payment.reconciliationRequired=true.
 */
export function isPaymentReviewRequired(order: OrderSummary | OrderDetail | null | undefined): boolean {
  if (!order || order.type !== 'takeaway') return false;
  if ('paymentReviewRequired' in order && Boolean(order.paymentReviewRequired)) return true;
  if ('payment' in order && order.payment && 'reconciliationRequired' in order.payment && Boolean(order.payment.reconciliationRequired)) return true;
  return false;
}

