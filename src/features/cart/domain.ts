import type { MenuV1View, QRResolution } from "@contracts";
import { publicMenuResponse } from "@/lib/validations/menu";
import { addCartLineSchema, cartContextSchema, cartNote, cartOptionIds, cartQuantity, cartResolutionSchema, CART_LIMITS } from "@/lib/validations/cart";
import type { CartAction, CartContext, CartIssue, CartIssueCode, CartLineView, CartResult, CartState, CartView, CheckoutReadiness, DraftCartLine, OrderDraft, PriceSnapshot } from "./types";

const messages: Record<CartIssueCode, string> = {
  ITEM_NOT_FOUND: "Món không còn trong thực đơn.", ITEM_UNAVAILABLE: "Món đang hết hàng hoặc đã ẩn.", INVALID_OPTION: "Tùy chọn không còn bán hoặc không thuộc món này.",
  QUANTITY_INVALID: "Số lượng mỗi dòng phải là số nguyên từ 1 đến 99.", NOTE_TOO_LONG: "Ghi chú tối đa 500 ký tự.", INVALID_INPUT: "Dữ liệu giỏ hàng không hợp lệ.",
  CART_LIMIT_EXCEEDED: "Giỏ hàng vượt giới hạn số dòng hoặc số lượng.", CART_TOTAL_OVERFLOW: "Tổng tạm tính vượt giới hạn số nguyên an toàn.",
  MENU_CHANGED: "Thực đơn đã thay đổi. Vui lòng kiểm tra và xác nhận lại giỏ.", PRICE_CHANGED: "Giá món hoặc tùy chọn đã thay đổi. Vui lòng kiểm tra lại.",
  MENU_REFRESH_NEEDED: "Cần tải lại thực đơn và ngữ cảnh QR trước khi xem lại đơn.", MENU_INVALID: "Dữ liệu thực đơn hoặc QR chưa hợp lệ.",
  CART_CONTEXT_CHANGED: "Phiên bàn đã thay đổi. Xác nhận dùng giỏ trong phiên mới hoặc xóa giỏ cũ.",
  STORAGE_UNAVAILABLE: "Không thể lưu giỏ trên thiết bị. Có thể mất giỏ khi tải lại trang.", STORAGE_CORRUPT: "Giỏ lưu trên thiết bị không hợp lệ và đã được bỏ qua.",
  STORAGE_SCOPE_MISMATCH: "Giỏ đã lưu thuộc QR hoặc bàn khác và đã được bỏ qua.", NOTE_REVIEW_REQUIRED: "Ghi chú chỉ lưu trong RAM. Hãy nhập lại hoặc xác nhận bỏ ghi chú sau khi tải lại.",
  SESSION_NOT_VERIFIED: "Vui lòng xác minh phiên bàn bằng máy chủ.", SESSION_CHECKOUT_PENDING: "Bàn đang thanh toán, chưa thể gửi thêm món.",
  STORE_NOT_ACCEPTING_ORDERS: "Quán đang tạm ngừng nhận đơn mới.", OFFLINE: "Đang ngoại tuyến. Giỏ vẫn giữ nguyên, cần kết nối để kiểm tra lại.", EMPTY_CART: "Giỏ hàng đang trống.",
  RATE_LIMITED: "Thao tác quá thường xuyên. Vui lòng chờ trước khi thử lại.",
};
export const cartIssue = (code: CartIssueCode, lineKey?: string): CartIssue => ({ code, message: messages[code], ...(lineKey ? { lineKey } : {}) });
export function initialCartState(): CartState {
  return { context: null, lines: [], menu: null, resolution: null, reviewedRevision: null, boundSessionId: null, contextNeedsReview: false,
    menuFresh: false, resolutionFresh: false, online: true, hydrated: false, notices: [], lastIssue: null, refreshing: false, loadError: null };
}
export function contextFromResolution(qrCode: string, resolution: QRResolution): CartContext {
  return resolution.type === "table" ? { storeId: resolution.store.id, qrCode, orderType: "dine_in", tableId: resolution.table.id } :
    { storeId: resolution.store.id, qrCode, orderType: "takeaway", tableId: null };
}
export const cartScopeKey = (context: CartContext) => `qr-cart:v1:${encodeURIComponent(JSON.stringify([context.storeId, context.qrCode, context.orderType, context.tableId]))}`;
export const lineKeyFor = (line: Pick<DraftCartLine, "menuItemId" | "optionIds" | "note">) => JSON.stringify([line.menuItemId, [...line.optionIds].sort(), line.note]);
const sessionId = (resolution: QRResolution | null) => resolution?.type === "table" ? resolution.session?.id ?? null : null;
const sum = (numbers: number[]): number | null => {
  let total = 0;
  for (const n of numbers) { if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(total + n)) return null; total += n; }
  return total;
};
export const snapshotUnitPrice = (snapshot: PriceSnapshot) => sum([snapshot.basePriceVnd, ...snapshot.options.map(option => option.priceDeltaVnd)]);
function currentSnapshot(line: Pick<DraftCartLine, "menuItemId" | "optionIds">, menu: MenuV1View | null): CartResult<PriceSnapshot> {
  const item = menu?.items.find(row => row.id === line.menuItemId);
  if (!item) return { ok: false, issue: cartIssue("ITEM_NOT_FOUND") };
  if (!item.available || !menu?.categories.some(category => category.id === item.categoryId)) return { ok: false, issue: cartIssue("ITEM_UNAVAILABLE") };
  const options = line.optionIds.map(id => item.options.find(option => option.id === id && option.available));
  if (options.some(option => !option)) return { ok: false, issue: cartIssue("INVALID_OPTION") };
  const snapshot = { basePriceVnd: item.priceVnd, options: options.map(option => ({ id: option!.id, priceDeltaVnd: option!.priceDeltaVnd })) };
  if (snapshotUnitPrice(snapshot) === null) return { ok: false, issue: cartIssue("CART_TOTAL_OVERFLOW") };
  return { ok: true, value: snapshot };
}
function viewLine(line: DraftCartLine, menu: MenuV1View | null): CartLineView {
  const item = menu?.items.find(row => row.id === line.menuItemId), current = currentSnapshot(line, menu), issues: CartIssue[] = [];
  if (menu && !current.ok) issues.push({ ...current.issue, lineKey: line.lineKey });
  if (line.noteNeedsReview) issues.push(cartIssue("NOTE_REVIEW_REQUIRED", line.lineKey));
  if (current.ok && JSON.stringify(current.value) !== JSON.stringify(line.snapshot)) issues.push(cartIssue("PRICE_CHANGED", line.lineKey));
  const unit = snapshotUnitPrice(line.snapshot), total = unit === null ? null : unit * line.quantity;
  const validTotal = total !== null && Number.isSafeInteger(total) ? total : null;
  if (validTotal === null) issues.push(cartIssue("CART_TOTAL_OVERFLOW", line.lineKey));
  return { ...line, name: item?.name ?? null, optionNames: line.optionIds.map(id => item?.options.find(option => option.id === id)?.name ?? "Tùy chọn không còn bán"),
    estimatedLineTotalVnd: validTotal, proposedUnitPriceVnd: current.ok ? snapshotUnitPrice(current.value) : null, issues };
}
export function getCartView(state: CartState): CartView {
  const lines = state.lines.map(line => viewLine(line, state.menu));
  const subtotal = lines.some(line => line.estimatedLineTotalVnd === null) ? null : sum(lines.map(line => line.estimatedLineTotalVnd!));
  const issues = lines.flatMap(line => line.issues);
  if (state.lines.length && state.menu && state.reviewedRevision !== state.menu.menuRevision) issues.push(cartIssue("MENU_CHANGED"));
  if (state.contextNeedsReview) issues.push(cartIssue("CART_CONTEXT_CHANGED"));
  if (subtotal === null && !issues.some(issue => issue.code === "CART_TOTAL_OVERFLOW")) issues.push(cartIssue("CART_TOTAL_OVERFLOW"));
  return { context: state.context, lines, itemCount: lines.reduce((count, line) => count + line.quantity, 0), estimatedSubtotalVnd: subtotal,
    currency: "VND", isEmpty: lines.length === 0, requiresReview: issues.length > 0, issues: [...issues, ...state.notices], hydrated: state.hydrated };
}
export function getCheckoutReadiness(state: CartState): CheckoutReadiness {
  if (!state.lines.length) return { status: "empty", issues: [cartIssue("EMPTY_CART")] };
  if (!state.online || !state.hydrated || !state.context || !state.menuFresh || !state.resolutionFresh) return {
    status: "menu_refresh_needed", issues: [cartIssue(state.online ? "MENU_REFRESH_NEEDED" : "OFFLINE")],
  };
  const view = getCartView(state);
  if (view.requiresReview) return { status: "cart_invalid", issues: view.issues };
  if (!state.resolution?.store.acceptingOrders) return { status: "cart_invalid", issues: [cartIssue("STORE_NOT_ACCEPTING_ORDERS")] };
  if (state.context.orderType === "dine_in") {
    const resolution = state.resolution;
    if (resolution.type !== "table" || resolution.requiresSessionCode) return { status: "verify_table_session", issues: [cartIssue("SESSION_NOT_VERIFIED")] };
    if (resolution.session.status !== "open") return { status: "cart_invalid", issues: [cartIssue("SESSION_CHECKOUT_PENDING")] };
  }
  return { status: "ready_to_review", issues: [] };
}
export function prepareOrderDraft(state: CartState): CartResult<OrderDraft> {
  const readiness = getCheckoutReadiness(state);
  if (readiness.status !== "ready_to_review") return { ok: false, issue: readiness.issues[0] };
  return { ok: true, value: { qrCode: state.context!.qrCode, menuRevision: state.menu!.menuRevision, note: null,
    items: state.lines.map(({ menuItemId, quantity, optionIds, note }) => ({ menuItemId, quantity, optionIds: [...optionIds], note })) } };
}
const failed = (state: CartState, issue: CartIssue): CartState => ({ ...state, lastIssue: issue });
function replaceLine(state: CartState, previousKey: string | null, line: DraftCartLine): CartState {
  const lines = state.lines.filter(row => row.lineKey !== previousKey).map(row => ({ ...row }));
  const existing = !line.noteNeedsReview ? lines.find(row => !row.noteNeedsReview && row.lineKey === line.lineKey) : undefined;
  if (existing) {
    if (existing.quantity + line.quantity > CART_LIMITS.maxQuantity) return failed(state, cartIssue("QUANTITY_INVALID", existing.lineKey));
    existing.quantity += line.quantity;
  } else lines.push(line);
  if (lines.length > CART_LIMITS.maxLines || lines.reduce((count, row) => count + row.quantity, 0) > CART_LIMITS.maxTotalQuantity) return failed(state, cartIssue("CART_LIMIT_EXCEEDED"));
  const candidate = { ...state, lines, lastIssue: null };
  if (getCartView(candidate).estimatedSubtotalVnd === null) return failed(state, cartIssue("CART_TOTAL_OVERFLOW"));
  return candidate;
}
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "resolution": {
      const parsed = cartResolutionSchema.safeParse(action.resolution);
      if (!parsed.success) return { ...failed(state, cartIssue("MENU_INVALID")), resolutionFresh: false };
      const context = contextFromResolution(action.qrCode, parsed.data);
      if (!cartContextSchema.safeParse(context).success) return { ...failed(state, cartIssue("MENU_INVALID")), resolutionFresh: false };
      const changed = state.context && cartScopeKey(state.context) !== cartScopeKey(context);
      const base = changed ? { ...initialCartState(), hydrated: state.hydrated, online: state.online, notices: [cartIssue("CART_CONTEXT_CHANGED")] } : state;
      const currentSession = sessionId(parsed.data);
      const sessionChanged = !!(base.lines.length && base.boundSessionId && currentSession && base.boundSessionId !== currentSession);
      return { ...base, context, resolution: parsed.data, resolutionFresh: true,
        contextNeedsReview: base.contextNeedsReview || sessionChanged,
        boundSessionId: sessionChanged ? base.boundSessionId : currentSession ?? base.boundSessionId, lastIssue: null };
    }
    case "menu": {
      const parsed = publicMenuResponse.safeParse(action.menu);
      if (!parsed.success) return { ...failed(state, cartIssue("MENU_INVALID")), menuFresh: false };
      const menu = parsed.data, ids = menu.items.map(item => item.id), categories = menu.categories.map(category => category.id);
      if (new Set(ids).size !== ids.length || new Set(categories).size !== categories.length || menu.items.some(item => !categories.includes(item.categoryId) || new Set(item.options.map(option => option.id)).size !== item.options.length))
        return { ...failed(state, cartIssue("MENU_INVALID")), menuFresh: false };
      return { ...state, menu, menuFresh: true, reviewedRevision: state.lines.length ? state.reviewedRevision : menu.menuRevision, lastIssue: null };
    }
    case "add": {
      const parsed = addCartLineSchema.safeParse(action.input);
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        return failed(state, cartIssue(field === "quantity" ? "QUANTITY_INVALID" : field === "note" ? "NOTE_TOO_LONG" : field === "optionIds" ? "INVALID_OPTION" : "INVALID_INPUT"));
      }
      if (!state.context || !state.menuFresh) return failed(state, cartIssue("MENU_REFRESH_NEEDED"));
      const snapshot = currentSnapshot(parsed.data, state.menu);
      if (!snapshot.ok) return failed(state, snapshot.issue);
      return replaceLine(state, null, { ...parsed.data, snapshot: snapshot.value, lineKey: lineKeyFor(parsed.data), noteNeedsReview: false });
    }
    case "quantity": case "note": case "options": {
      const line = state.lines.find(row => row.lineKey === action.lineKey);
      if (!line) return failed(state, cartIssue("ITEM_NOT_FOUND"));
      let next = { ...line };
      if (action.type === "quantity") {
        const parsed = cartQuantity.safeParse(action.quantity);
        if (!parsed.success) return failed(state, cartIssue("QUANTITY_INVALID", line.lineKey));
        next.quantity = parsed.data;
      } else if (action.type === "note") {
        const parsed = cartNote.safeParse(action.note);
        if (!parsed.success) return failed(state, cartIssue("NOTE_TOO_LONG", line.lineKey));
        next = { ...next, note: parsed.data, noteNeedsReview: false };
      } else {
        if (!state.menuFresh) return failed(state, cartIssue("MENU_REFRESH_NEEDED"));
        const parsed = cartOptionIds.safeParse(action.optionIds);
        if (!parsed.success) return failed(state, cartIssue("INVALID_OPTION", line.lineKey));
        const snapshot = currentSnapshot({ ...line, optionIds: parsed.data }, state.menu);
        if (!snapshot.ok) return failed(state, snapshot.issue);
        next = { ...next, optionIds: parsed.data, snapshot: snapshot.value };
      }
      next.lineKey = next.noteNeedsReview ? line.lineKey : lineKeyFor(next);
      return replaceLine(state, line.lineKey, next);
    }
    case "remove": return { ...state, lines: state.lines.filter(line => line.lineKey !== action.lineKey), lastIssue: null };
    case "clear": return { ...state, lines: [], reviewedRevision: state.menu?.menuRevision ?? null, boundSessionId: sessionId(state.resolution), contextNeedsReview: false, lastIssue: null };
    case "confirm_context": {
      const current = sessionId(state.resolution);
      if (!state.resolutionFresh || !current) return failed(state, cartIssue("SESSION_NOT_VERIFIED"));
      return { ...state, boundSessionId: current, contextNeedsReview: false, lastIssue: null };
    }
    case "confirm_review": {
      if (!state.menuFresh || !state.resolutionFresh || !state.online) return failed(state, cartIssue("MENU_REFRESH_NEEDED"));
      // Notices describe recoverable storage/scope events. Only current line and
      // context issues block review; a previous scope-reset notice must not lock
      // a new, valid cart forever. Actual contextNeedsReview still blocks here.
      const blocking = getCartView({ ...state, notices: [] }).issues.find(issue => !["PRICE_CHANGED", "MENU_CHANGED"].includes(issue.code));
      if (blocking) return failed(state, blocking);
      const reviewed = { ...state, reviewedRevision: state.menu!.menuRevision, lines: state.lines.map(line => ({ ...line, snapshot: (currentSnapshot(line, state.menu) as { ok: true; value: PriceSnapshot }).value })), lastIssue: null };
      if (getCartView(reviewed).estimatedSubtotalVnd === null) return failed(state, cartIssue("CART_TOTAL_OVERFLOW"));
      return reviewed;
    }
    case "stale": return { ...state, menuFresh: false, resolutionFresh: false, lastIssue: action.issue ?? null };
    case "online": return { ...state, online: action.online, ...(action.online ? {} : { menuFresh: false, resolutionFresh: false }) };
  }
}
export function formatVnd(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Invalid integer VND");
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}
