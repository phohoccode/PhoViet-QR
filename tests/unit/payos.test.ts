import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PayOS } from "@payos/node";
import { PayosGateway, paymentConfig } from "../../src/server/payments/payos";
const checksumKey = "TEST_ONLY_CHECKSUM_KEY_NEVER_USE_IN_RUNTIME";
const sdk = new PayOS({ clientId: "TEST_ONLY_CLIENT", apiKey: "TEST_ONLY_API", checksumKey, logLevel: "off" });
const data = { orderCode: 1000000000000, amount: 35000, description: "QR ORDER", accountNumber: "12345678", reference: "TEST_ONLY_TX",
  transactionDateTime: "2026-10-24 10:20:30", currency: "VND", paymentLinkId: "0123456789abcdef0123456789abcdef", code: "00", desc: "success",
  counterAccountName: "", counterAccountNumber: "", virtualAccountNumber: null };
async function signed(value = data) { return { data: value, code: "00", success: true, signature: await sdk.crypto.createSignatureFromObj(value, checksumKey) }; }
beforeEach(() => {
  vi.stubEnv("PAYOS_CLIENT_ID", "TEST_ONLY_CLIENT"); vi.stubEnv("PAYOS_API_KEY", "TEST_ONLY_API"); vi.stubEnv("PAYOS_CHECKSUM_KEY", checksumKey);
  vi.stubEnv("PAYOS_ACCOUNT_NUMBER", "12345678"); vi.stubEnv("PAYOS_STORE_ID", "c0200000-0000-4000-8000-000000000001"); vi.stubEnv("PAYMENT_RETURN_ORIGIN", "https://test.invalid");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("TEST ONLY: verifies official SDK canonical HMAC including optional/null keys and normalizes signed fields", async () => {
  const gateway = new PayosGateway(); const body = await signed();
  const event = gateway.parseEvent(await gateway.verifyWebhook(body));
  expect(event).toMatchObject({ reference: "1000000000000", transactionId: "TEST_ONLY_TX", amountVnd: 35000, currency: "VND", paid: true, occurredAt: "2026-10-24T03:20:30.000Z" });
  expect(event.eventId).toMatch(/^[a-f0-9]{64}$/);
});
it("rejects tampering amount, optional signed field, missing or malformed signature", async () => {
  const gateway = new PayosGateway(); const body = await signed();
  for (const candidate of [{ ...body, data: { ...data, amount: 1 } }, { ...body, data: { ...data, counterAccountName: "changed" } }, { ...body, signature: "a".repeat(64) }]) {
    await expect(gateway.verifyWebhook(candidate)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  }
  await expect(gateway.verifyWebhook({ ...body, signature: "x" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
it("unsigned top-level success cannot turn signed failure into paid or downgrade signed success", async () => {
  const gateway = new PayosGateway();
  expect(gateway.parseEvent(await gateway.verifyWebhook({ ...await signed(), code: "99", success: false })).paid).toBe(true);
  expect(gateway.parseEvent(await gateway.verifyWebhook(await signed({ ...data, code: "99" }))).paid).toBe(false);
});
it("reordered JSON yields same event identity and rejects unsafe amounts/date schemas", async () => {
  const gateway = new PayosGateway(); const original = await signed();
  const reordered = Object.fromEntries(Object.entries(data).reverse());
  expect(gateway.parseEvent(await gateway.verifyWebhook({ ...original, data: reordered })).eventId).toBe(gateway.parseEvent(data).eventId);
  await expect(gateway.verifyWebhook(await signed({ ...data, amount: 1.2 }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
it("fails closed without configuration and rejects unsafe return origins", () => {
  vi.stubEnv("PAYOS_API_KEY", ""); expect(paymentConfig).toThrow();
  vi.stubEnv("PAYOS_API_KEY", "TEST_ONLY_API"); vi.stubEnv("PAYMENT_RETURN_ORIGIN", "https://test.invalid/path"); expect(paymentConfig).toThrow();
});
const intent = { id: "TEST_ONLY_INTENT", orderId: "TEST_ONLY_ORDER", reference: "1000000000000", amountVnd: 35000, expiresAt: "2026-10-24T04:00:00Z" };
const createdData = { bin: "970422", accountName: "TEST ONLY", accountNumber: "12345678", amount: 35000, description: "QR ORDER", orderCode: 1000000000000,
  currency: "VND", paymentLinkId: data.paymentLinkId, status: "PENDING", checkoutUrl: `https://pay.payos.vn/web/${data.paymentLinkId}`, qrCode: "TEST_ONLY_NOT_A_REAL_QR" };
async function stubResponse(value: Record<string, unknown>, signature?: string) {
  const body = { code: "00", desc: "success", data: value, signature: signature ?? await sdk.crypto.createSignatureFromObj(value, checksumKey) };
  const network = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", network); return network;
}
it("TEST ONLY signed create response yields real-shaped instructions; outgoing signed reference/amount/TTL stay immutable", async () => {
  const network = await stubResponse(createdData);
  expect(await new PayosGateway().createPayment(intent)).toMatchObject({ checkoutUrl: createdData.checkoutUrl, qrPayload: createdData.qrCode, accountNumber: "12345678" });
  expect(network).toHaveBeenCalledTimes(1);
  const request = network.mock.calls[0] as unknown as [unknown, RequestInit];
  const posted = JSON.parse(String(request[1].body));
  expect(posted).toMatchObject({ orderCode: 1000000000000, amount: 35000, description: "QR ORDER", expiredAt: Date.parse(intent.expiresAt) / 1000,
    returnUrl: "https://test.invalid/order/TEST_ONLY_ORDER", cancelUrl: "https://test.invalid/order/TEST_ONLY_ORDER" });
  expect(posted.signature).toBe(await sdk.crypto.createSignatureOfPaymentRequest(posted, checksumKey));
});
it("SDK rejects an invalid response signature; adapter rejects signed wrong account/amount/currency/unsafe hosted URL", async () => {
  await stubResponse(createdData, "a".repeat(64));
  await expect(new PayosGateway().createPayment(intent)).rejects.toThrow();
  for (const extra of [{ accountNumber: "99999999" }, { amount: 1 }, { currency: "USD" }, { checkoutUrl: "https://attacker.invalid/pay" }]) {
    await stubResponse({ ...createdData, ...extra });
    await expect(new PayosGateway().createPayment(intent)).rejects.toThrow();
  }
});
it("TEST ONLY signed status query is parsed but never provides a paid mutation", async () => {
  await stubResponse({ id: data.paymentLinkId, orderCode: 1000000000000, amount: 35000, status: "PAID" });
  expect(await new PayosGateway().getPaymentStatus("1000000000000")).toEqual({ reference: "1000000000000", amountVnd: 35000, paymentLinkId: data.paymentLinkId, status: "PAID" });
});
