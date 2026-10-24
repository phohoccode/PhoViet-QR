import React, { type ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OrderDetail } from "../../docs/contracts/types";

// TEST ONLY hook host: exercise the real component's requests, timer callbacks,
// cleanup and child props without adding a browser/DOM runtime dependency.
const host = vi.hoisted(() => ({
  slots: [] as { value?: unknown; deps?: unknown[]; cleanup?: () => void }[],
  index: 0,
  effects: [] as (() => void)[],
  privateGet: vi.fn(), publicGet: vi.fn(),
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const slot = () => host.slots[host.index++] ?? (host.slots[host.index - 1] = {});
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  return { ...actual,
    useState: (initial: unknown) => {
      const s = slot();
      if (!("value" in s)) s.value = typeof initial === "function" ? initial() : initial;
      return [s.value, (value: unknown) => { s.value = typeof value === "function" ? value(s.value) : value; }];
    },
    useRef: (initial: unknown) => { const s = slot(); s.value ??= { current: initial }; return s.value; },
    useCallback: (fn: unknown, deps: unknown[]) => { const s = slot(); if (changed(s.deps, deps)) { s.value = fn; s.deps = deps; } return s.value; },
    useEffect: (effect: () => (() => void) | void, deps?: unknown[]) => {
      const s = slot();
      if (changed(s.deps, deps)) {
        s.deps = deps;
        host.effects.push(() => { s.cleanup?.(); s.cleanup = effect() || undefined; });
      }
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../src/features/orders/api-client", async original => ({
  ...await original<typeof import("../../src/features/orders/api-client")>(),
  getPrivateOrderTracking: host.privateGet, getCustomerOrderTracking: host.publicGet,
}));
vi.mock("../../src/components/customer/order/active-order-storage", () => ({ saveActiveOrderSummary: vi.fn() }));
import { OrderTrackingView } from "../../src/components/customer/order/OrderTrackingView";
import { TakeawayPickupCard } from "../../src/components/customer/order/TakeawayPickupCard";
import { OrderApiError } from "../../src/features/orders/api-client";

const order = {
  id: "00000000-0000-4000-8000-000000000006", type: "takeaway", status: "ready", ticketNo: 6,
  paymentStatus: "paid", paymentReviewRequired: false, payment: { kind: "takeaway", status: "paid" },
  totalVnd: 3000, itemCount: 1, lines: [], updatedAt: "2026-10-24T00:00:00Z",
} as unknown as OrderDetail;
function render() {
  host.index = 0;
  const tree = OrderTrackingView({ orderId: order.id, initialOrder: order }) as ReactElement;
  host.effects.splice(0).forEach(effect => effect());
  return tree;
}
function find(tree: unknown, predicate: (el: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = find(child, predicate); if (found) return found; }
  } else if (React.isValidElement<Record<string, unknown>>(tree)) {
    if (predicate(tree)) return tree;
    return find(tree.props.children, predicate);
  }
}
const card = () => find(render(), el => el.type === TakeawayPickupCard)!.props;
const refresh = async () => {
  const button = find(render(), el => el.props["aria-label"] === "Làm mới trạng thái đơn" ||
    (el.type === "button" && Boolean(find(el.props.children, child => child.props.children === "Thử lại"))))!;
  (button.props.onClick as () => void)();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
};
beforeEach(() => {
  host.slots = []; host.effects = []; host.index = 0;
  host.privateGet.mockReset(); host.publicGet.mockReset();
  vi.useFakeTimers();
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => {
  host.slots.forEach(s => s.cleanup?.());
  vi.useRealTimers(); vi.unstubAllGlobals();
});
it("does not hide private ORDER_NOT_FOUND behind a successful order as endless loading; caps private retries and allows manual recovery", async () => {
  host.privateGet.mockRejectedValue(new OrderApiError(404, { code: "ORDER_NOT_FOUND", message: "Not found" }));
  host.publicGet.mockResolvedValue(order);
  render(); await vi.advanceTimersByTimeAsync(0);
  expect(card()).toMatchObject({ isLoadingPickup: false, pickupCode: null, pickupMessage: expect.stringContaining("Bấm Làm mới") });
  await vi.advanceTimersByTimeAsync(60000);
  expect(host.privateGet).toHaveBeenCalledTimes(5);
  expect(host.publicGet.mock.calls.length).toBeGreaterThan(5); // Order progress still polls.
  host.privateGet.mockResolvedValue({ order, pickup: { code: "000042", expiresAt: "2026-10-25T00:00:00Z" } });
  await refresh();
  expect(card()).toMatchObject({ isLoadingPickup: false, pickupCode: "000042", pickupMessage: null });
});
it("missing credential is explicit pending and later recovery displays a stable code; an auth failure clears it", async () => {
  host.privateGet.mockResolvedValue({ order, pickup: null });
  render(); await vi.advanceTimersByTimeAsync(0);
  expect(card().pickupMessage).toContain("chưa sẵn sàng");
  host.privateGet.mockResolvedValue({ order, pickup: { code: "012345" } });
  await vi.advanceTimersByTimeAsync(6000);
  expect(card().pickupCode).toBe("012345");
  await vi.advanceTimersByTimeAsync(6000);
  expect(card().pickupCode).toBe("012345");
  host.privateGet.mockRejectedValue(new Error("TEST ONLY private outage")); host.publicGet.mockResolvedValue(order);
  await vi.advanceTimersByTimeAsync(6000);
  expect(card().pickupCode).toBeNull();
  expect(card().pickupMessage).toContain("Bấm Làm mới");
});
it("network/5xx failures exit loading, stop after three attempts and retry manually", async () => {
  host.privateGet.mockRejectedValue(new Error("TEST ONLY offline")); host.publicGet.mockRejectedValue(new Error("TEST ONLY offline"));
  render(); await vi.advanceTimersByTimeAsync(0);
  expect(find(render(), el => typeof el.props.children === "string" && el.props.children.includes("Mất kết nối mạng"))).toBeDefined();
  await vi.advanceTimersByTimeAsync(120000);
  expect(host.privateGet).toHaveBeenCalledTimes(3);
  expect(host.publicGet).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
  host.privateGet.mockResolvedValue({ order, pickup: { code: "000042" } });
  await refresh();
  expect(card().pickupCode).toBe("000042");
});
it("deduplicates concurrent loads and ignores results after unmount", async () => {
  let resolve!: (value: unknown) => void;
  host.privateGet.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(); await vi.advanceTimersByTimeAsync(0);
  await refresh(); await refresh();
  expect(host.privateGet).toHaveBeenCalledTimes(1);
  const cleanup = host.slots.filter(s => s.cleanup).map(s => s.cleanup!);
  cleanup.forEach(fn => fn());
  resolve({ order, pickup: { code: "000042" } });
  await Promise.resolve(); await Promise.resolve();
  expect(card().pickupCode).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
it("denied scope stops automatic requests, but the explicit retry button can recheck restored access", async () => {
  const denied = new OrderApiError(404, { code: "ORDER_NOT_FOUND", message: "Not found" });
  host.privateGet.mockRejectedValue(denied); host.publicGet.mockRejectedValue(denied);
  render(); await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(60000);
  expect(host.privateGet).toHaveBeenCalledTimes(1);
  host.privateGet.mockResolvedValue({ order, pickup: { code: "000042" } });
  await refresh();
  expect(card().pickupCode).toBe("000042");
});
it("reconnect resets exhausted pickup retries while keeping the existing order scope", async () => {
  host.privateGet.mockResolvedValue({ order, pickup: null });
  render(); await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(30000);
  expect(host.privateGet).toHaveBeenCalledTimes(5);
  host.privateGet.mockResolvedValue({ order, pickup: { code: "000042" } });
  const reconnect = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === "online")![1] as () => void;
  reconnect();
  await Promise.resolve(); await Promise.resolve();
  expect(card().pickupCode).toBe("000042");
  expect(host.privateGet.mock.calls.every(([id]) => id === order.id)).toBe(true);
});
it.each([429, 503])("HTTP %s retries are bounded and leave loading with a working retry action", async status => {
  const error = new OrderApiError(status, { code: status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR", message: "TEST ONLY retry required" }, 10);
  host.privateGet.mockRejectedValue(error); host.publicGet.mockRejectedValue(error);
  render(); await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(120000);
  expect(host.privateGet).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
  host.privateGet.mockResolvedValue({ order, pickup: { code: "000042" } });
  await refresh();
  expect(card()).toMatchObject({ isLoadingPickup: false, pickupCode: "000042" });
});
