import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { settleSessionInput, guestBillQuery } from "../../src/lib/validations/session-billing";
import { apiFailure, ApiFault } from "../../src/server/security/api";

it("requires explicit received-money confirmation, financial and session versions, and canonical manual payment methods", () => {
  const input = { requestId: randomUUID(), action: "confirm_received", expectedVersion: 2, expectedBillVersion: "a".repeat(32), paymentMethod: "bank_transfer", receivedConfirmed: true };
  expect(settleSessionInput.safeParse(input).success).toBe(true);
  for (const change of [{ receivedConfirmed: undefined }, { receivedConfirmed: false }, { receivedConfirmed: "true" }, { paymentMethod: "payos" }, { paymentMethod: "bank_transfer_manual" }, { expectedBillVersion: undefined }, { expectedBillVersion: "a" }, { expectedVersion: 0 }, { expectedVersion: 1.1 }, { expectedVersion: Number.MAX_SAFE_INTEGER + 1 }, { totalVnd: 1000 }, { discount: 1 }, { storeId: randomUUID() }, { ownerId: randomUUID() }]) {
    expect(settleSessionInput.safeParse({ ...input, ...change }).success).toBe(false);
  }
  expect(settleSessionInput.safeParse({ requestId: randomUUID(), action: "begin_checkout", expectedVersion: 1, expectedBillVersion: "a".repeat(32) }).success).toBe(true);
  expect(settleSessionInput.safeParse({ requestId: randomUUID(), action: "cancel_checkout", expectedVersion: 2 }).success).toBe(true);
});
it("guest bill locates only by public QR; session, store and owner substitutions are disallowed", () => {
  expect(guestBillQuery.safeParse({ qrCode: "TABLE_01" }).success).toBe(true);
  for (const value of [{}, { qrCode: "a", sessionId: randomUUID() }, { qrCode: "a", storeId: randomUUID() }, { qrCode: "a", token: "secret" }, { qrCode: "../other" }]) expect(guestBillQuery.safeParse(value).success).toBe(false);
});
it("billing blockers are explicit 409 no-store errors with actionable messages", async () => {
  for (const code of ["BILL_CHANGED", "SESSION_ORDERS_OUTSTANDING"] as const) {
    const response = apiFailure(new ApiFault(code));
    expect(response.status).toBe(409); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ data: null, error: { code, message: expect.any(String) } });
  }
});
