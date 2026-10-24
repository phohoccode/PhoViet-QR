/**
 * P0-C01 v0.1 + P0-C02 v1-draft — contracts only; no implementation.
 * camelCase on the wire; see DOMAIN_MODEL.md for physical DB mapping.
 * Server MUST validate all numbers, IDs, ISO strings and state combinations.
 * IDs and tickets identify resources; neither grants access.
 * General DTOs contain no credentials. Explicitly private credential delivery
 * types and transient verification inputs are isolated below; never use in lists.
 */
export type Id = string;
export type IsoTimestamp = string; // ISO 8601 UTC, e.g. 2026-10-23T03:00:00Z
export type ServiceDate = string; // YYYY-MM-DD in the store's business timezone
export type MoneyVnd = number; // Number.isSafeInteger(value) && value >= 0; DB integer/bigint, never float
export type OrderType = 'dine_in' | 'takeaway';
export type QRType = 'table' | 'takeaway';
export type OrderStatus =
  | 'pending_payment' | 'accepted' | 'preparing' | 'ready'
  | 'completed' | 'cancelled' | 'payment_exception';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'expired' | 'exception';
export type PaymentIntentStatus = 'pending' | 'succeeded' | 'failed' | 'expired' | 'exception';
export type TableSessionStatus = 'open' | 'checkout_pending' | 'closed';
export type FulfillmentStatus =
  | 'awaiting_preparation' | 'preparing' | 'ready' | 'served' | 'collected' | 'cancelled';
export type SettlementStatus = 'pending' | 'succeeded' | 'failed';
export type PaymentMethod = 'cash' | 'bank_transfer';

/** Canonical Vietnamese labels; code is authoritative, labels are presentation. */
export const ORDER_STATUS_LABELS = {
  pending_payment: 'Chờ thanh toán', accepted: 'Chờ làm', preparing: 'Đang làm',
  ready: 'Sẵn sàng', completed: 'Đã giao', cancelled: 'Đã hủy',
  payment_exception: 'Cần đối soát thanh toán',
} as const satisfies Record<OrderStatus, string>;
export const PAYMENT_STATUS_LABELS = {
  unpaid: 'Chưa thanh toán', pending: 'Đang xác nhận thanh toán', paid: 'Đã thanh toán',
  failed: 'Thanh toán thất bại', expired: 'Thanh toán hết hạn', exception: 'Cần đối soát',
} as const satisfies Record<PaymentStatus, string>;

export interface StoreView {
  id: Id;
  name: string;
  timezone: string; // IANA, default Asia/Ho_Chi_Minh
  acceptingOrders: boolean;
}
export interface TableRef { id: Id; label: string }
export interface MenuCategory { id: Id; name: string; sortOrder: number }
/** Simple additive, optional selections; no option groups or inventory in v0.1. */
export interface MenuOption {
  id: Id;
  name: string;
  priceDeltaVnd: MoneyVnd; // nonnegative in v0.1
  available: boolean; // physical menu_item_options.active
}
export interface MenuItem {
  id: Id;
  categoryId: Id;
  name: string;
  description: string | null;
  priceVnd: MoneyVnd;
  imageUrl: string | null;
  available: boolean;
  options: MenuOption[];
  updatedAt: IsoTimestamp;
}
export interface MenuView { categories: MenuCategory[]; items: MenuItem[] }
/** Local cart/request intent only. Display totals must not be trusted by the server. */
export interface CartLine {
  menuItemId: Id;
  quantity: number; // positive safe integer, bounded server-side
  optionIds: Id[]; // unique, each belongs to this item
  note: string | null;
}
export interface CreateOrderInput {
  qrCode: string; // public QR locator, not session proof
  clientRequestId: Id; // UUID; retry same payload with same ID
  items: CartLine[];
  note: string | null;
}
export interface OrderOptionSnapshot {
  menuOptionId: Id;
  name: string;
  priceDeltaVnd: MoneyVnd;
}
export interface OrderLine {
  id: Id;
  menuItemId: Id;
  name: string; // snapshot, never joined from today's menu for old orders
  baseUnitPriceVnd: MoneyVnd;
  options: OrderOptionSnapshot[];
  unitPriceVnd: MoneyVnd; // baseUnitPriceVnd + sum(options.priceDeltaVnd)
  quantity: number;
  lineTotalVnd: MoneyVnd; // unitPriceVnd * quantity
  note: string | null;
}

export type OrderTicket =
  | { ticketNo: number; serviceDate: ServiceDate; acceptedAt: IsoTimestamp }
  | { ticketNo: null; serviceDate: null; acceptedAt: null };
type IssuedTicket = Extract<OrderTicket, { ticketNo: number }>;
type NoTicket = Extract<OrderTicket, { ticketNo: null }>;
type OrderBase = {
  id: Id;
  storeId: Id;
  totalVnd: MoneyVnd;
  itemCount: number; // sum(quantity), not number of lines
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  version: number; // positive, monotonic per aggregate for re-fetch/re-sync
};
type State<S extends OrderStatus, F extends FulfillmentStatus> = {
  status: S;
  statusLabel: (typeof ORDER_STATUS_LABELS)[S];
  fulfillmentStatus: F;
};
type DineInContext = { type: 'dine_in'; tableSessionId: Id; table: TableRef; paymentStatus: 'unpaid' | 'paid' };
/** A paid review hold retains its historical ticket; it is ineligible for preparation/pickup. */
type TakeawayContext = { type: 'takeaway'; tableSessionId: null; table: null; paymentReviewRequired?: boolean };
type ActiveState =
  | State<'accepted', 'awaiting_preparation'>
  | State<'preparing', 'preparing'>
  | State<'ready', 'ready'>;
export type DineInOrderSummary = OrderBase & DineInContext & (
  | (IssuedTicket & ActiveState)
  | (IssuedTicket & State<'completed', 'served'>)
  | (IssuedTicket & State<'cancelled', 'cancelled'>)
);
export type TakeawayOrderSummary = OrderBase & TakeawayContext & (
  | (NoTicket & State<'pending_payment', 'awaiting_preparation'> & { paymentStatus: 'pending' | 'failed' | 'expired' })
  | (NoTicket & State<'payment_exception', 'awaiting_preparation'> & { paymentStatus: 'exception' })
  | (IssuedTicket & ActiveState & { paymentStatus: 'paid' })
  | (IssuedTicket & State<'completed', 'collected'> & { paymentStatus: 'paid' })
  | (NoTicket & State<'cancelled', 'cancelled'> & { paymentStatus: 'pending' | 'failed' | 'expired' | 'exception' })
  | (IssuedTicket & State<'cancelled', 'cancelled'> & { paymentStatus: 'paid' })
);
export type OrderSummary = DineInOrderSummary | TakeawayOrderSummary;

/** In OrderDetail amountVnd is this order's share; session bill total is TableSessionView.totalVnd. */
type PaymentBase = { amountVnd: MoneyVnd; currency: 'VND'; updatedAt: IsoTimestamp };
type PaymentLabel<S extends PaymentStatus> = { status: S; statusLabel: (typeof PAYMENT_STATUS_LABELS)[S] };
export type DineInPaymentViewState = PaymentBase & {
  kind: 'table_session'; tableSessionId: Id; intentId: null; intentStatus: null;
  reconciliationRequired: false;
} & (PaymentLabel<'unpaid'> | PaymentLabel<'paid'>);
type IntentViewBase = PaymentBase & { kind: 'takeaway'; intentId: Id; expiresAt: IsoTimestamp };
/** Authenticated order scope only. checkoutUrl/qrPayload are payment instructions, never proof. */
export type TakeawayPaymentViewState = IntentViewBase & (
  | (PaymentLabel<'pending'> & {
      intentStatus: 'pending'; reconciliationRequired: false;
      checkoutUrl: string | null; qrPayload: string | null; // both null while adapter is being retried
    })
  | (PaymentLabel<'paid'> & { intentStatus: 'succeeded'; reconciliationRequired: boolean })
  | (PaymentLabel<'failed'> & { intentStatus: 'failed'; reconciliationRequired: false })
  | (PaymentLabel<'expired'> & { intentStatus: 'expired'; reconciliationRequired: false })
  | (PaymentLabel<'exception'> & { intentStatus: 'exception'; reconciliationRequired: true })
);
export type PaymentViewState = DineInPaymentViewState | TakeawayPaymentViewState;
type DetailFields = { lines: OrderLine[]; note: string | null };
/** payment must agree with paymentStatus; server validates equality at serialization. */
export type OrderDetail =
  | (DineInOrderSummary & DetailFields & { payment: DineInPaymentViewState })
  | (TakeawayOrderSummary & DetailFields & { payment: TakeawayPaymentViewState });

export interface TableSessionView {
  id: Id;
  status: TableSessionStatus;
  openedAt: IsoTimestamp;
  closedAt: IsoTimestamp | null;
  orderCount: number; // all session orders, including cancelled
  totalVnd: MoneyVnd; // payable total, excluding cancelled orders
  paymentStatus: 'unpaid' | 'paid';
  version: number;
  /** Owner presentation metadata only; contains no credential. */
  pinState?: 'legacy' | 'active' | 'expired';
}
/** Owner-only; guest session UI uses TableSessionDetail after scope checks. */
export interface TableSummary {
  id: Id;
  label: string;
  active: boolean;
  session: (TableSessionView & { status: 'open' | 'checkout_pending'; closedAt: null }) | null;
}
export interface TableSessionDetail {
  table: TableRef;
  session: TableSessionView;
  orders: DineInOrderSummary[]; // all belong to session.id
}
/** Public QR resolve cannot reveal session IDs or bypass session verification. */
export type QRResolution =
  | { type: 'table'; mode: 'dine_in'; store: StoreView; table: TableRef;
      requiresSessionCode: true; session: null }
  | { type: 'table'; mode: 'dine_in'; store: StoreView; table: TableRef;
      requiresSessionCode: false; session: { id: Id; status: 'open' | 'checkout_pending' } }
  | { type: 'takeaway'; mode: 'takeaway'; store: StoreView; table: null;
      requiresSessionCode: false; session: null };
/** Authenticated owner/store only. No pending_payment/payment_exception orders. */
export interface OwnerQueueView {
  storeId: Id;
  orders: (OrderSummary & { status: 'accepted' | 'preparing' | 'ready' })[];
  nextCursor: string | null;
  updatedAt: IsoTimestamp;
}

export type ApiErrorCode =
  | 'INVALID_QR' | 'SESSION_REQUIRED' | 'SESSION_EXPIRED' | 'SESSION_CHECKOUT_PENDING' | 'INVALID_SESSION_CODE'
  | 'OUT_OF_STOCK' | 'PRICE_CHANGED' | 'ORDER_NOT_FOUND'
  | 'PAYMENT_PENDING' | 'PAYMENT_MISMATCH' | 'PAYMENT_EXPIRED'
  | 'PAYMENT_PROVIDER_UNAVAILABLE' | 'PAYMENT_REVIEW_REQUIRED'
  | 'INVALID_PICKUP_CODE' | 'PICKUP_CREDENTIAL_UNAVAILABLE' | 'PICKUP_NOT_ALLOWED' | 'ORDER_ALREADY_COMPLETED'
  | 'INVALID_STATE_TRANSITION' | 'DUPLICATE_REQUEST_CONFLICT'
  | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR'
  | 'STORE_NOT_ACCEPTING_ORDERS' | 'RESOURCE_NOT_FOUND' | 'INTERNAL_ERROR';
export interface ApiErrorDetails {
  menuItemIds?: Id[];
  currentPrices?: { menuItemId: Id; priceVnd: MoneyVnd }[];
  retryAfterSeconds?: number;
  field?: string;
}
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetails; // allowlist only; no arbitrary SQL/provider payloads
}
export interface ApiSuccess<T> { data: T; error: null }
export interface ApiFailure { data: null; error: ApiError }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// P0-C02 additions; BEFORE/AFTER and draft assumptions: P0_C02_REVIEW.md.
export type ContractVersion = 'v1-draft';
export interface MenuV1View extends MenuView {
  menuRevision: string; // store-scoped revision, changed atomically on menu edits
  serverTime: IsoTimestamp;
}
/** v1 requires a revision; the original v0.1 example/input remains available. */
export interface CreateOrderV1Input extends CreateOrderInput { menuRevision: string }
/** P2-HF01: sessionCode is the compatibility field, exactly six ASCII digits. Never log/persist. */
export interface TableSessionVerifyInput { qrCode: string; sessionCode: string }
export interface RequestCommand { requestId: Id }
export interface OrderTransitionInput extends RequestCommand { expectedVersion: number }
export type CompleteOrderInput = OrderTransitionInput & (
  | { type: 'dine_in' }
  | { type: 'takeaway'; pickupCode: string } // exactly six ASCII digits; transient, redact logs/results
);
export interface OwnerOrdersQuery {
  view?: 'queue' | 'exceptions' | 'history';
  type?: OrderType;
  status?: OrderStatus;
  orderId?: Id; // selects detail, independent of current page/filter
  cursor?: string;
  limit?: number;
}
export interface OwnerOrdersView {
  storeId: Id;
  orders: OrderSummary[];
  detail: OrderDetail | null;
  counts: { accepted: number; preparing: number; ready: number; paymentException: number };
  nextCursor: string | null;
  updatedAt: IsoTimestamp;
}
export interface OwnerTablesView { tables: TableSummary[]; detail: TableSessionDetail | null }
export interface OpenTableSessionInput extends RequestCommand { }
/** PRIVATE owner command result, no-store, no analytics/audit plaintext. Not TableSummary. */
export interface OwnerSessionOpenedView {
  table: TableRef;
  session: TableSessionView & { status: 'open'; closedAt: null };
  sessionCredential: { sessionCode: string; expiresAt: IsoTimestamp; pinFormat?: 'numeric_6'; generation?: number; issuedAt?: IsoTimestamp };
}
/** P2-HF01 private owner-only response, never part of table lists or SSR. */
export interface OwnerTablePinView {
  sessionId: Id;
  sessionVersion: number;
  pin: string;
  pinFormat: 'numeric_6';
  generation: number;
  issuedAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
}
export interface RotateTablePinInput extends RequestCommand { expectedVersion: number; confirm: true }
/** PRIVATE buyer-only projection, explicitly requested; never an owner/list DTO. */
export interface PrivateOrderTrackingView {
  order: OrderDetail;
  pickup: { code: string; expiresAt: IsoTimestamp } | null; // six ASCII digits, only buyer scope
}
export type SettleSessionInput = RequestCommand & (
  | { action: 'begin_checkout'; expectedVersion: number }
  | { action: 'cancel_checkout'; expectedVersion: number }
  | { action: 'confirm_received'; expectedVersion: number; paymentMethod: PaymentMethod }
);
export interface SettlementView {
  id: Id;
  tableSessionId: Id;
  totalVnd: MoneyVnd;
  paymentMethod: PaymentMethod;
  status: 'succeeded';
  settledAt: IsoTimestamp;
}
export interface SettleSessionView { detail: TableSessionDetail; settlement: SettlementView | null }
export interface OwnerMenuItem extends MenuItem { active: boolean }
export interface OwnerMenuView {
  categories: (MenuCategory & { active: boolean })[];
  items: OwnerMenuItem[];
  menuRevision: string;
  serverTime: IsoTimestamp;
}
export interface MenuOptionWrite {
  id?: Id; // absent => new option; existing ID must belong to this item
  name: string;
  priceDeltaVnd: MoneyVnd;
  available: boolean;
}
export interface MenuItemFields {
  categoryId: Id;
  name: string;
  description: string | null;
  priceVnd: MoneyVnd;
  imageUrl: string | null;
  available: boolean;
  active: boolean;
  options: MenuOptionWrite[];
}
export interface CreateMenuItemInput extends RequestCommand, MenuItemFields { }
export type PatchMenuItemInput = RequestCommand & Partial<MenuItemFields> & {
  expectedUpdatedAt: IsoTimestamp; // equality check under lock; at least one changed field required
};
export type QRCodeView = {
  id: Id; publicCode: string; path: string; active: boolean;
} & ({ type: 'table'; table: TableRef } | { type: 'takeaway'; table: null });
export type QRCodeWriteInput = RequestCommand & (
  | { action: 'create'; type: 'table'; tableId: Id }
  | { action: 'create'; type: 'takeaway'; tableId: null }
  | { action: 'set_active'; id: Id; active: boolean }
);
export interface PaymentProviderMetadata {
  provider: 'payos' | 'sepay' | null;
  connectionStatus: 'not_configured' | 'unverified' | 'verified';
  lastVerifiedWebhookAt: IsoTimestamp | null; // observed valid event, not a live health guarantee
}
export interface StoreSettingsView {
  store: StoreView;
  paymentProvider: PaymentProviderMetadata;
  updatedAt: IsoTimestamp;
}
export interface PatchStoreSettingsInput extends RequestCommand {
  expectedUpdatedAt: IsoTimestamp;
  name?: string;
  acceptingOrders?: boolean;
}
/** Generic application ACK. Actual provider wire ACK remains an adapter decision. */
export interface WebhookReceipt {
  received: true;
  outcome: 'accepted' | 'duplicate' | 'recorded_exception' | 'ignored';
}

// P2-C02 additive category CRUD contract; existing R03/R14/R15/R16 DTOs unchanged.
export interface OwnerMenuCategory extends MenuCategory { active: boolean; updatedAt: IsoTimestamp }
export interface CreateMenuCategoryInput extends RequestCommand { name: string; sortOrder: number; active: boolean }
export type PatchMenuCategoryInput = RequestCommand & Partial<Pick<CreateMenuCategoryInput, 'name' | 'sortOrder' | 'active'>> & { expectedUpdatedAt: IsoTimestamp };
export type PublicMenuResponse = MenuV1View;
export type OwnerMenuResponse = OwnerMenuView;
