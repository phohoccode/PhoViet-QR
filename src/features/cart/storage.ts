import { storedCartSchema, CART_LIMITS } from "@/lib/validations/cart";
import { cartIssue, cartScopeKey, lineKeyFor } from "./domain";
import type { CartContext, CartIssue, CartState, DraftCartLine } from "./types";

export interface CartStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface RestoredCart { lines: DraftCartLine[]; boundSessionId: string | null; contextNeedsReview: boolean }
export function browserCartStorage(): CartStorage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}
export function serializeCart(state: CartState): string | null {
  if (!state.context) return null;
  // Notes may contain PII, even accidentally. Persist only intent IDs/quantities,
  // numeric preview and an omission marker. Labels, note text and auth never go
  // into browser storage; all fields are explicitly projected (no object spread).
  return JSON.stringify({ version: 1, context: {
    storeId: state.context.storeId, qrCode: state.context.qrCode, orderType: state.context.orderType, tableId: state.context.tableId,
  }, boundSessionId: state.boundSessionId, reviewedRevision: state.reviewedRevision, contextNeedsReview: state.contextNeedsReview,
  lines: state.lines.map(line => ({ menuItemId: line.menuItemId, quantity: line.quantity, optionIds: [...line.optionIds],
    snapshot: { basePriceVnd: line.snapshot.basePriceVnd, options: line.snapshot.options.map(option => ({ id: option.id, priceDeltaVnd: option.priceDeltaVnd })) },
    noteOmitted: !!line.note || line.noteNeedsReview,
  })) });
}
export function readCart(storage: CartStorage | null, context: CartContext): { cart: RestoredCart | null; issue: CartIssue | null } {
  if (!storage) return { cart: null, issue: cartIssue("STORAGE_UNAVAILABLE") };
  try {
    const raw = storage.getItem(cartScopeKey(context));
    if (raw === null) return { cart: null, issue: null };
    if (new TextEncoder().encode(raw).length > CART_LIMITS.maxStorageBytes) return { cart: null, issue: cartIssue("STORAGE_CORRUPT") };
    const parsed = storedCartSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { cart: null, issue: cartIssue("STORAGE_CORRUPT") };
    if (cartScopeKey(parsed.data.context) !== cartScopeKey(context)) return { cart: null, issue: cartIssue("STORAGE_SCOPE_MISMATCH") };
    const lines = parsed.data.lines.map((line, index) => {
      const intent = { menuItemId: line.menuItemId, quantity: line.quantity, optionIds: line.optionIds, note: null };
      return { ...intent, snapshot: line.snapshot, noteNeedsReview: line.noteOmitted,
        lineKey: line.noteOmitted ? `restored:${index}:${lineKeyFor(intent)}` : lineKeyFor(intent) };
    });
    // Never restore a readiness/verification flag or accept saved preview prices.
    // Each restored line needs fresh menu comparison and explicit user review.
    return { cart: { lines, boundSessionId: parsed.data.boundSessionId, contextNeedsReview: parsed.data.contextNeedsReview }, issue: null };
  } catch (error) {
    return { cart: null, issue: cartIssue(error instanceof SyntaxError ? "STORAGE_CORRUPT" : "STORAGE_UNAVAILABLE") };
  }
}
export function writeCart(storage: CartStorage | null, state: CartState): CartIssue | null {
  if (!storage) return cartIssue("STORAGE_UNAVAILABLE");
  try {
    const serialized = serializeCart(state);
    if (!serialized || !state.context) return null;
    if (new TextEncoder().encode(serialized).length > CART_LIMITS.maxStorageBytes) return cartIssue("STORAGE_UNAVAILABLE");
    if (!state.lines.length) storage.removeItem(cartScopeKey(state.context));
    else storage.setItem(cartScopeKey(state.context), serialized);
    return null;
  } catch { return cartIssue("STORAGE_UNAVAILABLE"); }
}
