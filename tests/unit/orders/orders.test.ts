import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createOrderInput, orderTrackingQuery } from "../../../src/lib/validations/orders";
import { submitCustomerOrder, getCustomerOrderTracking, getPrivateOrderTracking, OrderApiError } from "../../../src/features/orders/api-client";
import { POST } from "../../../src/app/api/public/orders/route";
import { GET } from "../../../src/app/api/public/orders/[id]/route";

const input = () => ({ qrCode: "QR_ABC", clientRequestId: "c3010000-0000-4000-8000-000000000001", menuRevision: "revision",
  items: [{ menuItemId: "c3010000-0000-4000-8000-000000000002", quantity: 2, optionIds: [], note: null }], note: null });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("requires canonical fields, strict bounded quantities/notes/options and rejects client prices/context", () => {
  expect(createOrderInput.safeParse(input()).success).toBe(true);
  for (const extra of [{ totalVnd: 1 }, { storeId: "forged" }, { tableSessionId: "forged" }, { type: "dine_in" }, { ticketNo: 1 }]) expect(createOrderInput.safeParse({ ...input(), ...extra }).success).toBe(false);
  for (const field of ["clientRequestId", "menuRevision", "note"]) {
    const malformed: Record<string, unknown> = input(); delete malformed[field]; expect(createOrderInput.safeParse(malformed).success).toBe(false);
  }
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: 100 }, { note: "x".repeat(501) }, { optionIds: [input().items[0].menuItemId, input().items[0].menuItemId] }, { priceVnd: -1 }, { required: true }]) {
    expect(createOrderInput.safeParse({ ...input(), items: [{ ...input().items[0], ...patch }] }).success).toBe(false);
  }
  expect(createOrderInput.safeParse({ ...input(), items: [] }).success).toBe(false);
  expect(createOrderInput.safeParse({ ...input(), items: Array.from({ length: 101 }, () => input().items[0]) }).success).toBe(false);
});
it("normalizes UUID casing, sorted option IDs and trimmed text while preserving meaningful line order", () => {
  const a = "c3010000-0000-4000-8000-00000000000a", b = "c3010000-0000-4000-8000-00000000000b";
  const parsed = createOrderInput.parse({ ...input(), clientRequestId: input().clientRequestId.toUpperCase(),
    items: [{ ...input().items[0], optionIds: [b.toUpperCase(), a], note: " \u0001Ít đá " }] });
  expect(parsed.items[0]).toMatchObject({ optionIds: [a, b], note: "Ít đá" });
  expect(parsed.clientRequestId).toBe(input().clientRequestId);
  expect(createOrderInput.parse({ ...input(), note: " " }).note).toBeNull();
  expect(orderTrackingQuery.parse({})).toEqual({ includePickup: false });
  for (const query of [{ includePickup: "1" }, { storeId: "forged" }]) expect(orderTrackingQuery.safeParse(query).success).toBe(false);
});
it("typed clients preserve immutable key/payload, cookies, no-store and private projection without auto retry", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: { id: "order" }, error: null }), { status: 201 })));
  vi.stubGlobal("fetch", fetcher);
  const command = input(); await submitCustomerOrder(command); await submitCustomerOrder(command);
  expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
  expect(fetcher.mock.calls[0][0]).toBe("/api/public/orders");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include", cache: "no-store", body: JSON.stringify(command) });
  await getCustomerOrderTracking("order/id"); await getPrivateOrderTracking("order/id");
  expect(fetcher.mock.calls[2][0]).toBe("/api/public/orders/order%2Fid");
  expect(fetcher.mock.calls[3][0]).toBe("/api/public/orders/order%2Fid?includePickup=true");
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ data: null, error: { code: "PRICE_CHANGED", message: "changed" } }), { status: 409 }));
  await expect(submitCustomerOrder(command)).rejects.toBeInstanceOf(OrderApiError);
  expect(fetcher).toHaveBeenCalledTimes(5);
  fetcher.mockRejectedValueOnce(new TypeError("network"));
  await expect(submitCustomerOrder(command)).rejects.toThrow(TypeError); expect(fetcher).toHaveBeenCalledTimes(6);
});
it("HTTP boundary denies missing cookie, cross-site origin, oversized and malformed/extra body without DB work", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("APP_ORIGIN", "https://qr.example.invalid");
  const headers = { origin: "https://qr.example.invalid", "content-type": "application/json", cookie: `qr_guest=${"a".repeat(43)}` };
  for (const [patch, body, expected] of [
    [{ cookie: "" }, JSON.stringify(input()), 401],
    [{ origin: "https://attacker.invalid" }, JSON.stringify(input()), 403],
    [{ "sec-fetch-site": "cross-site" }, JSON.stringify(input()), 403],
    [{}, "x".repeat(65537), 400], [{}, "{", 400], [{}, JSON.stringify({ ...input(), totalVnd: 1 }), 400],
  ] as const) {
    const response = await POST(new NextRequest("https://qr.example.invalid/api/public/orders", { method: "POST", headers: { ...headers, ...patch }, body }));
    expect(response.status).toBe(expected); expect(response.headers.get("cache-control")).toContain("no-store");
  }
  const duplicate = new NextRequest("https://qr.example.invalid/api/public/orders/id?includePickup=true&includePickup=false", { headers });
  expect((await GET(duplicate, { params: Promise.resolve({ id: input().clientRequestId }) })).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
