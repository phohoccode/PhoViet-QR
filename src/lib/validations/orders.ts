import { z } from "zod";
import type { CreateOrderV1Input, OrderDetail } from "@contracts";
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
// Dine-in remains unpaid until the Phase5 settlement implementation extends projection.
const dineInSummaryFields = z.object({
  id, storeId: id, type: z.literal("dine_in"), tableSessionId: id, table: z.strictObject({ id, label: z.string().min(1).max(80) }),
  ticketNo: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), serviceDate: z.iso.date(), acceptedAt: timestamp,
  paymentStatus: z.literal("unpaid"), totalVnd: money, itemCount: z.number().int().min(1).max(9900),
  createdAt: timestamp, updatedAt: timestamp, version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
export const dineInOrderSummaryResponse = dineInSummaryFields.and(states);
export const dineInOrderResponse = dineInSummaryFields.extend({
  lines: z.array(lineView).min(1).max(100), note: viewNote,
  payment: z.strictObject({ kind: z.literal("table_session"), tableSessionId: id, intentId: z.null(), intentStatus: z.null(),
    status: z.literal("unpaid"), statusLabel: z.literal("Chưa thanh toán"), amountVnd: money, currency: z.literal("VND"), updatedAt: timestamp, reconciliationRequired: z.literal(false) }),
}).and(states).superRefine((order, ctx) => {
  if (order.payment.tableSessionId !== order.tableSessionId || order.payment.amountVnd !== order.totalVnd ||
      order.itemCount !== order.lines.reduce((sum, line) => sum + line.quantity, 0) ||
      BigInt(order.totalVnd) !== order.lines.reduce((sum, line) => sum + BigInt(line.lineTotalVnd), BigInt(0)) ||
      order.lines.some(line => BigInt(line.unitPriceVnd) !== BigInt(line.baseUnitPriceVnd) + line.options.reduce((sum, option) => sum + BigInt(option.priceDeltaVnd), BigInt(0)) || BigInt(line.lineTotalVnd) !== BigInt(line.unitPriceVnd) * BigInt(line.quantity)))
    ctx.addIssue({ code: "custom", message: "Inconsistent order snapshot" });
}) satisfies z.ZodType<OrderDetail>;
