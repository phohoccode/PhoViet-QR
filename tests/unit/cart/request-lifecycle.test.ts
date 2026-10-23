import { afterEach, describe, expect, it, vi } from "vitest";
import { createCartStore } from "../../../src/features/cart/store";
import { menuRequest, MenuApiError } from "../../../src/features/customer/api-client";
import { menu, qrCode, resolution, selection } from "./fixtures";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("QR/menu request lifecycle", () => {
  it("coalesces mount, retry and visibility calls into one sequential QR/menu request", async () => {
    let release!: (value: ReturnType<typeof resolution>) => void;
    const loadResolution = vi.fn(() => new Promise<ReturnType<typeof resolution>>(resolve => { release = resolve; }));
    const loadMenu = vi.fn(async () => menu());
    const store = createCartStore({ qrCode, storage: null, loadResolution, loadMenu });
    const first = store.initialize();
    expect(store.refresh()).toBe(first); expect(store.refreshIfNeeded()).toBe(first);
    await Promise.resolve();
    expect(loadResolution).toHaveBeenCalledTimes(1); expect(loadMenu).not.toHaveBeenCalled();
    expect(store.getState().refreshing).toBe(true);
    release(resolution()); await first;
    expect(loadMenu).toHaveBeenCalledTimes(1); expect(store.getState().refreshing).toBe(false);
    expect(store.getState().loadError).toBeNull();
    store.addLine(selection());
    for (let index = 0; index < 10; index++) await store.refreshIfNeeded();
    expect(loadResolution).toHaveBeenCalledTimes(1); expect(loadMenu).toHaveBeenCalledTimes(1);
    loadResolution.mockResolvedValueOnce(resolution());
    await store.refresh(); // Explicit review must still get a new snapshot.
    expect(loadResolution).toHaveBeenCalledTimes(2);
  });

  it("does not retry a QR 429 before its server deadline or load menu after the failed QR", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T13:00:00Z"));
    const loadResolution = vi.fn().mockRejectedValueOnce(new MenuApiError(429, { code: "RATE_LIMITED", message: "wait" }, 45)).mockResolvedValue(resolution());
    const loadMenu = vi.fn(async () => menu());
    const store = createCartStore({ qrCode, storage: null, loadResolution, loadMenu });
    await store.initialize();
    expect(store.getState()).toMatchObject({ refreshing: false, hydrated: true, loadError: { stage: "resolution", status: 429, retryAt: Date.now() + 45000 } });
    for (let index = 0; index < 10; index++) expect((await store.refresh()).ok).toBe(false);
    vi.advanceTimersByTime(44999); await store.refreshIfNeeded();
    expect(loadResolution).toHaveBeenCalledTimes(1); expect(loadMenu).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); await store.refresh();
    expect(loadResolution).toHaveBeenCalledTimes(2); expect(loadMenu).toHaveBeenCalledTimes(1);
    expect(store.getState().loadError).toBeNull();
  });

  it("preserves menu 429 stage and cart, blocks reconnect/visibility and resumes after cooldown", async () => {
    vi.useFakeTimers();
    const loadResolution = vi.fn(async () => resolution());
    const loadMenu = vi.fn().mockResolvedValueOnce(menu()).mockRejectedValueOnce(new MenuApiError(429, { code: "RATE_LIMITED", message: "wait" }, 60)).mockResolvedValue(menu());
    const store = createCartStore({ qrCode, storage: null, loadResolution, loadMenu });
    await store.initialize(); store.addLine(selection()); await store.refresh();
    expect(store.getState().loadError).toMatchObject({ stage: "menu", status: 429 });
    expect(store.getView().itemCount).toBe(1); expect(store.getState().menuFresh).toBe(false);
    store.setOnline(false); store.setOnline(true);
    await store.refreshIfNeeded(); await store.refresh();
    expect(loadResolution).toHaveBeenCalledTimes(2); expect(loadMenu).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60000); await store.refreshIfNeeded();
    expect(loadMenu).toHaveBeenCalledTimes(3); expect(store.getView().itemCount).toBe(1);
  });

  it("stops after 500/network failure, throttles passive events and allows an explicit retry", async () => {
    const loadResolution = vi.fn().mockRejectedValueOnce(new MenuApiError(500, { code: "INTERNAL_ERROR", message: "server" })).mockResolvedValue(resolution());
    const loadMenu = vi.fn(async () => menu());
    const store = createCartStore({ qrCode, storage: null, loadResolution, loadMenu });
    await store.initialize();
    expect(store.getState().loadError).toMatchObject({ stage: "resolution", status: 500 });
    for (let index = 0; index < 10; index++) await store.refreshIfNeeded();
    expect(loadResolution).toHaveBeenCalledTimes(1);
    await store.refresh(); expect(loadMenu).toHaveBeenCalledTimes(1);
  });

  it("an unchanged online event cannot invalidate an in-flight response", async () => {
    const loadResolution = vi.fn(async () => resolution());
    const loadMenu = vi.fn(async () => menu());
    const store = createCartStore({ qrCode, storage: null, loadResolution, loadMenu });
    const pending = store.initialize(); store.setOnline(true); await pending;
    expect(store.getState().menuFresh).toBe(true); expect(loadResolution).toHaveBeenCalledTimes(1);
  });

  it("ignores an older unverified QR response after R02 verifies a table", async () => {
    let release!: (value: ReturnType<typeof resolution>) => void;
    const store = createCartStore({ qrCode, storage: null, loadResolution: () => new Promise(resolve => { release = resolve; }), loadMenu: async () => menu() });
    const pending = store.initialize(); await Promise.resolve();
    const verified = resolution("dine_in", true);
    store.applyResolution(verified); release(resolution("dine_in", false)); await pending;
    expect(store.getState().resolution).toEqual(verified); expect(store.getState().refreshing).toBe(false);
  });
});

describe("Retry-After adapter", () => {
  it.each([
    ["45", 10, 45],
    ["5", 60, 60],
    ["Fri, 23 Oct 2026 13:01:00 GMT", undefined, 60],
    ["invalid", undefined, 60],
    [null, undefined, 60],
  ])("honors header %s and body %s", async (header, seconds, expected) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T13:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: null, error: { code: "RATE_LIMITED", message: "wait", details: { retryAfterSeconds: seconds } } }), {
      status: 429, headers: header ? { "Retry-After": header } : {},
    })));
    await expect(menuRequest("/api/public/qr/demo")).rejects.toMatchObject({ status: 429, retryAfterSeconds: expected });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves non-JSON 429 cooldown without starting its own retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Too many requests", { status: 429, headers: { "Retry-After": "32" } })));
    await expect(menuRequest("/api/public/qr/demo")).rejects.toMatchObject({ status: 429, retryAfterSeconds: 32 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
