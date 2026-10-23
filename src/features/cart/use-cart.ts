"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { CartStore } from "./store";
import { getCartView, getCheckoutReadiness } from "./domain";

/** Keep store stable with useState(() => createCartStore({qrCode})). Remount the
 * customer boundary with key={qrCode} when QR changes; never reuse another QR store. */
export function useCart(store: CartStore) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getServerSnapshot);
  useEffect(() => {
    let mounted = true;
    const online = () => { store.setOnline(true); void store.refreshIfNeeded(); };
    const offline = () => { store.setOnline(false); };
    const visible = () => { if (document.visibilityState === "visible" && navigator.onLine) void store.refreshIfNeeded(); };
    // StrictMode replays mount effects in development. Only the surviving mount
    // starts I/O; ordinary store-driven re-renders never initialize again.
    queueMicrotask(() => {
      if (!mounted) return;
      store.setOnline(navigator.onLine);
      if (navigator.onLine) void store.initialize();
    });
    window.addEventListener("online", online); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", visible);
    return () => {
      mounted = false;
      window.removeEventListener("online", online); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visible);
      store.markStale();
    };
  }, [store]);
  return { state, view: getCartView(state), checkoutReadiness: getCheckoutReadiness(state),
    addLine: store.addLine, updateQuantity: store.updateQuantity, updateOptions: store.updateOptions, updateNote: store.updateNote,
    removeLine: store.removeLine, clear: store.clear, refresh: store.refresh, reconcileWithMenu: store.reconcileWithMenu,
    applyResolution: store.applyResolution, confirmReview: store.confirmReview, confirmContextChange: store.confirmContextChange,
    prepareOrderDraft: store.prepareOrderDraft };
}
