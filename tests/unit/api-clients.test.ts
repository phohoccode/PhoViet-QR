import { afterEach, expect, it, vi } from "vitest";
import { fetchQrResolution, verifyPublicTableSession, fetchPublicMenu, menuRequest, MenuApiError } from "../../src/features/customer/api-client";
import { openOwnerTableSession, updateOwnerTable, rotateOwnerQrCode } from "../../src/features/owner/api-client";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("uses credentialed no-store requests without retrying or changing command keys/timestamps", async () => {
  const transport = vi.fn(async () => Response.json({ data: { sentinel: true }, error: null }));
  vi.stubGlobal("fetch", transport);
  const requestId = "c0500000-0000-4000-8000-000000000001";
  const timestamp = "2026-10-23T14:00:00.123456+00:00";
  await fetchQrResolution("CODE A"); await fetchPublicMenu("CODE A");
  await verifyPublicTableSession({ qrCode: "CODE", sessionCode: "TRANSIENT_TEST_CODE" });
  await openOwnerTableSession("table/path", { requestId });
  for (let retry = 0; retry < 2; retry++) await rotateOwnerQrCode("qr/path", { requestId, expectedUpdatedAt: timestamp, confirm: true });
  await updateOwnerTable("table/path", { requestId, expectedUpdatedAt: timestamp, label: "New name" });
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls.map(([url]) => url)).toEqual([
    "/api/public/qr/CODE%20A", "/api/public/menu?qrCode=CODE%20A", "/api/public/table-sessions/verify",
    "/api/owner/tables/table%2Fpath/sessions", "/api/owner/qr-codes/qr%2Fpath/rotate", "/api/owner/qr-codes/qr%2Fpath/rotate", "/api/owner/tables/table%2Fpath",
  ]);
  for (const [, init] of calls) { expect(init?.credentials).toBe("include"); expect(init?.cache).toBe("no-store"); }
  expect(calls[4][1]?.body).toBe(calls[5][1]?.body);
  expect(JSON.parse(String(calls[4][1]?.body))).toEqual({ requestId, expectedUpdatedAt: timestamp, confirm: true });
  expect(JSON.parse(String(calls[2][1]?.body))).toEqual({ qrCode: "CODE", sessionCode: "TRANSIENT_TEST_CODE" });
});

it.each([{}, { error: null }, { data: {} }, "HTML instead of envelope"])("rejects malformed success envelopes: %j", async payload => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
  await expect(fetchPublicMenu("CODE")).rejects.toBeInstanceOf(MenuApiError);
});

it("preserves a valid nullable success for callers whose contract allows it", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: null, error: null })));
  await expect(menuRequest<null>("/nullable-contract")).resolves.toBeNull();
});

it("propagates network failures and preserves API status/code/field without mock success", async () => {
  const networkError = new TypeError("offline");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(networkError).mockResolvedValueOnce(Response.json({ data: null, error: { code: "INVALID_STATE_TRANSITION", message: "Refresh required", details: { field: "expectedUpdatedAt" } } }, { status: 409 })));
  await expect(fetchPublicMenu("CODE")).rejects.toBe(networkError);
  await expect(fetchPublicMenu("CODE")).rejects.toMatchObject({ status: 409, error: { code: "INVALID_STATE_TRANSITION", details: { field: "expectedUpdatedAt" } } });
  expect(fetch).toHaveBeenCalledTimes(2);
});
