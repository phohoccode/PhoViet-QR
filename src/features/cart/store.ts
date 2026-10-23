import type { QRResolution, MenuV1View } from "@contracts";
import { publicQrCode } from "@/lib/validations/table-sessions";
import { fetchQrResolution, fetchPublicMenu, MenuApiError } from "@/features/customer/api-client";
import { browserCartStorage, readCart, writeCart, type CartStorage } from "./storage";
import { cartIssue, cartReducer, cartScopeKey, getCartView, getCheckoutReadiness, initialCartState, prepareOrderDraft } from "./domain";
import type { AddCartLineInput, CartAction, CartIssue, CartResult, CartState, CartLoadError } from "./types";

export interface CartStoreOptions {
  qrCode: string;
  /** Test injection / alternate adapter only; production defaults fetch R01/R03. */
  loadResolution?: (qrCode: string) => Promise<QRResolution>;
  loadMenu?: (qrCode: string) => Promise<MenuV1View>;
  storage?: CartStorage | null;
}
export function createCartStore(options: CartStoreOptions) {
  const qrCode = publicQrCode.parse(options.qrCode);
  const loadResolution = options.loadResolution ?? fetchQrResolution;
  const loadMenu = options.loadMenu ?? fetchPublicMenu;
  let state = initialCartState(), requestVersion = 0, storage: CartStorage | null = null, disposed = false, loadedScope: string | null = null;
  let inFlight: { version: number; promise: Promise<CartResult> } | null = null;
  let retryAt = 0, lastAttemptAt: number | null = null;
  const listeners = new Set<() => void>();
  const serverSnapshot = state;
  const notify = () => { for (const listener of listeners) listener(); };
  function commit(next: CartState, persist = true) {
    if (disposed) return;
    state = next;
    if (persist && state.hydrated && state.context) {
      const warning = writeCart(storage, state);
      if (warning && !state.notices.some(issue => issue.code === warning.code)) state = { ...state, notices: [...state.notices, warning] };
    }
    notify();
  }
  function dispatch(action: CartAction): CartResult {
    if (disposed) return { ok: false, issue: cartIssue("INVALID_INPUT") };
    const next = cartReducer(state, action); commit(next);
    return next.lastIssue ? { ok: false, issue: next.lastIssue } : { ok: true, value: undefined };
  }
  /** Fetches R01 and R03. Call on mount/reconnect/visible and before review CTA. */
  async function performRefresh(version: number): Promise<CartResult> {
    if (disposed || version !== requestVersion) return { ok: false, issue: cartIssue("MENU_REFRESH_NEEDED") };
    let stage: CartLoadError["stage"] = "resolution";
    commit({ ...cartReducer(state, { type: "stale" }), refreshing: true, loadError: null }, false);
    try {
      // Sequential bootstrap avoids two first-request guest cookies racing.
      const resolution = await loadResolution(qrCode);
      if (disposed || version !== requestVersion) return { ok: false, issue: cartIssue("MENU_REFRESH_NEEDED") };
      let next = cartReducer(state, { type: "resolution", qrCode, resolution });
      if (next.lastIssue || !next.context) throw new Error("Invalid QR response");
      if (loadedScope !== cartScopeKey(next.context)) {
        storage = options.storage === undefined ? browserCartStorage() : options.storage;
        const restored = readCart(storage, next.context);
        next = { ...next, ...(restored.cart ?? {}), reviewedRevision: null, hydrated: true,
          notices: [...next.notices, ...(restored.issue ? [restored.issue] : [])] };
        next = cartReducer(next, { type: "resolution", qrCode, resolution });
        loadedScope = cartScopeKey(next.context!);
      }
      commit({ ...next, refreshing: true }, false);
      stage = "menu";
      const menu = await loadMenu(qrCode);
      if (disposed || version !== requestVersion) return { ok: false, issue: cartIssue("MENU_REFRESH_NEEDED") };
      next = cartReducer(state, { type: "menu", menu });
      if (next.lastIssue) throw new Error("Invalid menu response");
      commit(next);
      return next.lastIssue ? { ok: false, issue: next.lastIssue } : { ok: true, value: undefined };
    } catch (error) {
      const limited = error instanceof MenuApiError && error.status === 429;
      const issue = cartIssue(limited ? "RATE_LIMITED" : "MENU_REFRESH_NEEDED");
      if (!disposed && version === requestVersion) {
        retryAt = limited ? Date.now() + (error.retryAfterSeconds ?? 60) * 1000 : 0;
        commit({ ...cartReducer(state, { type: "stale", issue }), hydrated: true,
          loadError: { stage, status: error instanceof MenuApiError ? error.status : null,
            code: error instanceof MenuApiError ? error.error.code : "NETWORK_ERROR", message: issue.message, retryAt: retryAt || null } }, false);
      }
      return { ok: false, issue };
    } finally {
      if (!disposed && version === requestVersion) commit({ ...state, refreshing: false }, false);
    }
  }
  function refresh(): Promise<CartResult> {
    if (disposed) return Promise.resolve({ ok: false, issue: cartIssue("INVALID_INPUT") });
    if (!state.online) return Promise.resolve({ ok: false, issue: cartIssue("OFFLINE") });
    if (Date.now() < retryAt) return Promise.resolve({ ok: false, issue: cartIssue("RATE_LIMITED") });
    if (inFlight?.version === requestVersion) return inFlight.promise;
    const version = ++requestVersion;
    lastAttemptAt = Date.now();
    // Register before notifying subscribers, so re-entrant calls join this work.
    const promise = Promise.resolve().then(() => performRefresh(version)).finally(() => {
      if (inFlight?.version === version) inFlight = null;
    });
    inFlight = { version, promise };
    return promise;
  }
  function refreshIfNeeded(): Promise<CartResult> {
    if (disposed || !state.online || Date.now() < retryAt) return refresh();
    if (inFlight?.version === requestVersion) return inFlight.promise;
    // Visibility/reconnect events can arrive together. Automatic refreshes are
    // bounded; explicit retry/review still refetches (except server cooldown).
    if (lastAttemptAt !== null && Date.now() - lastAttemptAt < 30_000)
      return Promise.resolve(state.menuFresh && state.resolutionFresh ? { ok: true, value: undefined }
        : { ok: false, issue: state.lastIssue ?? cartIssue("MENU_REFRESH_NEEDED") });
    return refresh();
  }
  return {
    getState: () => state, getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: refresh, refresh, refreshIfNeeded,
    addLine: (input: AddCartLineInput) => dispatch({ type: "add", input }),
    updateQuantity: (lineKey: string, quantity: number) => dispatch({ type: "quantity", lineKey, quantity }),
    updateOptions: (lineKey: string, optionIds: string[]) => dispatch({ type: "options", lineKey, optionIds }),
    updateNote: (lineKey: string, note: string | null) => dispatch({ type: "note", lineKey, note }),
    removeLine: (lineKey: string) => dispatch({ type: "remove", lineKey }), clear: () => dispatch({ type: "clear" }),
    reconcileWithMenu: (menu: MenuV1View) => dispatch({ type: "menu", menu }),
    // R01/R02 response only; no boolean `verified` setter. Client state never
    // authorizes an order; Phase3 must validate the HttpOnly scope on the server.
    applyResolution(resolution: QRResolution) {
      // A verified R02 response supersedes any older in-flight R01 response.
      ++requestVersion;
      const result = dispatch({ type: "resolution", qrCode, resolution });
      commit({ ...state, refreshing: false, loadError: null }, false);
      return result;
    },
    confirmReview: () => dispatch({ type: "confirm_review" }), confirmContextChange: () => dispatch({ type: "confirm_context" }),
    markStale: (issue?: CartIssue) => { ++requestVersion; const result = dispatch({ type: "stale", issue }); commit({ ...state, refreshing: false }, false); return result; },
    setOnline(online: boolean) {
      if (state.online === online) return { ok: true, value: undefined } as CartResult;
      if (!online) { ++requestVersion; lastAttemptAt = null; }
      const result = dispatch({ type: "online", online });
      if (!online) commit({ ...state, refreshing: false }, false);
      return result;
    },
    getView: () => getCartView(state), getCheckoutReadiness: () => getCheckoutReadiness(state), prepareOrderDraft: () => prepareOrderDraft(state),
    dispose() { disposed = true; ++requestVersion; listeners.clear(); },
  };
}
export type CartStore = ReturnType<typeof createCartStore>;
