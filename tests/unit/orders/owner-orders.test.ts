import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { claimNextInput, completeOrderInput, ownerOrdersQuery, readyOrderInput } from "../../../src/lib/validations/owner-orders";

it("strictly validates claim without an order target or tenant", () => {
  const cmd = { requestId: randomUUID() };
  expect(claimNextInput.safeParse(cmd).success).toBe(true);
  for (const extra of [{ orderId: randomUUID() }, { storeId: randomUUID() }, { ticketNo: 1 }, { type: "dine_in" }])
    expect(claimNextInput.safeParse({ ...cmd, ...extra }).success).toBe(false);
  for (const requestId of ["bad", "", null]) expect(claimNextInput.safeParse({ requestId }).success).toBe(false);
});
it("requires safe positive versions and discriminate complete body without dine-in pickup proof", () => {
  for (const version of [undefined, 0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, "2"])
    expect(readyOrderInput.safeParse({ requestId: randomUUID(), expectedVersion: version }).success).toBe(false);
  const cmd = { requestId: randomUUID(), expectedVersion: 2 };
  expect(completeOrderInput.safeParse({ ...cmd, type: "dine_in" }).success).toBe(true);
  expect(completeOrderInput.safeParse({ ...cmd, type: "dine_in", pickupCode: "secret" }).success).toBe(false);
  expect(completeOrderInput.safeParse({ ...cmd, type: "takeaway" }).success).toBe(false);
  expect(completeOrderInput.safeParse({ ...cmd, type: "takeaway", pickupCode: "valid-shape-only" }).success).toBe(true);
});
it("enforces bounded filters, view/status pairings and rejects literal all", () => {
  expect(ownerOrdersQuery.parse({})).toEqual({ view: "queue", limit: 50 });
  for (const value of [{ type: "all" }, { status: "all" }, { status: "completed" }, { view: "history", status: "accepted" }, { view: "exceptions", status: "ready" }, { limit: "101" }, { limit: "0" }, { limit: "1.5" }, { limit: "01" }, { storeId: randomUUID() }, { orderId: "bad" }, { cursor: "a".repeat(2049) }])
    expect(ownerOrdersQuery.safeParse(value).success).toBe(false);
  expect(ownerOrdersQuery.safeParse({ view: "history", status: "completed", type: "takeaway", limit: "100" }).success).toBe(true);
});
