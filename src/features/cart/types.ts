import type { CartLine, CreateOrderV1Input, MenuV1View, QRResolution } from "@contracts";

export type CartContext = {
  storeId: string; qrCode: string; orderType: "dine_in"; tableId: string;
} | { storeId: string; qrCode: string; orderType: "takeaway"; tableId: null };
export type CartIssueCode = "ITEM_NOT_FOUND" | "ITEM_UNAVAILABLE" | "INVALID_OPTION" | "QUANTITY_INVALID" |
  "NOTE_TOO_LONG" | "INVALID_INPUT" | "CART_LIMIT_EXCEEDED" | "CART_TOTAL_OVERFLOW" | "MENU_CHANGED" |
  "PRICE_CHANGED" | "MENU_REFRESH_NEEDED" | "MENU_INVALID" | "CART_CONTEXT_CHANGED" | "STORAGE_UNAVAILABLE" |
  "STORAGE_CORRUPT" | "STORAGE_SCOPE_MISMATCH" | "NOTE_REVIEW_REQUIRED" | "SESSION_NOT_VERIFIED" |
  "SESSION_CHECKOUT_PENDING" | "STORE_NOT_ACCEPTING_ORDERS" | "OFFLINE" | "EMPTY_CART" | "RATE_LIMITED";
export interface CartIssue { code: CartIssueCode; message: string; lineKey?: string }
export interface PriceSnapshot { basePriceVnd: number; options: { id: string; priceDeltaVnd: number }[] }
export interface DraftCartLine extends CartLine {
  lineKey: string;
  /** No HTML. Resolved from menu in memory only. */
  snapshot: PriceSnapshot;
  noteNeedsReview: boolean;
}
export interface CartLineView extends DraftCartLine {
  name: string | null;
  optionNames: string[];
  estimatedLineTotalVnd: number | null;
  proposedUnitPriceVnd: number | null;
  issues: CartIssue[];
}
export interface CartView {
  context: CartContext | null; lines: CartLineView[]; itemCount: number;
  estimatedSubtotalVnd: number | null; currency: "VND"; isEmpty: boolean;
  requiresReview: boolean; issues: CartIssue[]; hydrated: boolean;
}
export type CheckoutStatus = "empty" | "menu_refresh_needed" | "verify_table_session" | "cart_invalid" | "ready_to_review";
export interface CheckoutReadiness { status: CheckoutStatus; issues: CartIssue[] }
export interface CartLoadError {
  stage: "resolution" | "menu";
  status: number | null;
  code: string;
  message: string;
  retryAt: number | null;
}
export interface CartState {
  context: CartContext | null; lines: DraftCartLine[]; reviewedRevision: string | null;
  boundSessionId: string | null; contextNeedsReview: boolean;
  menu: MenuV1View | null; resolution: QRResolution | null;
  menuFresh: boolean; resolutionFresh: boolean; online: boolean; hydrated: boolean;
  notices: CartIssue[]; lastIssue: CartIssue | null;
  refreshing: boolean; loadError: CartLoadError | null;
}
export interface AddCartLineInput { menuItemId: string; quantity: number; optionIds: string[]; note?: string | null }
export type OrderDraft = Omit<CreateOrderV1Input, "clientRequestId">;
export type CartResult<T = undefined> = { ok: true; value: T } | { ok: false; issue: CartIssue };
export type CartAction =
  | { type: "add"; input: unknown }
  | { type: "quantity"; lineKey: string; quantity: unknown }
  | { type: "options"; lineKey: string; optionIds: unknown }
  | { type: "note"; lineKey: string; note: unknown }
  | { type: "remove"; lineKey: string }
  | { type: "clear" }
  | { type: "menu"; menu: unknown }
  | { type: "resolution"; qrCode: string; resolution: unknown }
  | { type: "confirm_review" }
  | { type: "confirm_context" }
  | { type: "stale"; issue?: CartIssue }
  | { type: "online"; online: boolean };
