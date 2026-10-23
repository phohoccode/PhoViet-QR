/**
 * UI PREVIEW MOCK FIXTURES — QR Ordering Minimal MVP
 *
 * Dữ liệu giả lập (mock data) phục vụ render presentational UI Shells.
 * Tuyệt đối không chứa secret/token thật. Tuân thủ 100% docs/contracts/types.ts.
 * Cung cấp đầy đủ fixtures cho Customer (Dine-in, Takeaway, Loading, Empty, Error, Offline, Invalid Session)
 * và Owner (Orders, Tables, Menu, Settings).
 */

import type {
  StoreView,
  TableRef,
  MenuCategory,
  MenuItem,
  OrderDetail,
  TableSummary,
  QRCodeView,
  OrderType,
  OwnerMenuItem,
  OwnerMenuView,
  OwnerMenuCategory,
} from '../../../docs/contracts/types';

export const MOCK_STORE: StoreView = {
  id: 'c0200000-0000-4000-8000-000000000001',
  name: 'PHỞ VIỆT QR',
  timezone: 'Asia/Ho_Chi_Minh',
  acceptingOrders: true,
};

export const MOCK_TABLE_05: TableRef = {
  id: 'c0200000-0000-4000-8000-000000000005',
  label: 'Bàn 05',
};

export const MOCK_CATEGORIES: MenuCategory[] = [
  { id: 'cat-all', name: 'Tất cả', sortOrder: 0 },
  { id: 'cat-coffee', name: 'Cà phê', sortOrder: 1 },
  { id: 'cat-tea', name: 'Trà trái cây', sortOrder: 2 },
  { id: 'cat-milktea', name: 'Trà sữa', sortOrder: 3 },
  { id: 'cat-bakery', name: 'Bánh ngọt', sortOrder: 4 },
];

export const MOCK_MENU_ITEMS: MenuItem[] = [
  {
    id: 'item-01',
    categoryId: 'cat-coffee',
    name: 'Cà phê muối xứ Huế',
    description: 'Robusta thơm đậm phối cùng lớp kem muối béo ngậy đặc trưng.',
    priceVnd: 35000,
    imageUrl: null,
    available: true,
    options: [
      { id: 'opt-01', name: 'Ít ngọt (50%)', priceDeltaVnd: 0, available: true },
      { id: 'opt-02', name: 'Thêm kem muối', priceDeltaVnd: 8000, available: true },
    ],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-02',
    categoryId: 'cat-coffee',
    name: 'Bạc xỉu ba tầng',
    description: 'Sữa đặc, sữa tươi thanh trùng và cà phê pha phin truyền thống.',
    priceVnd: 32000,
    imageUrl: null,
    available: true,
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-03',
    categoryId: 'cat-coffee',
    name: 'Cà phê cốt dừa đá xay',
    description: 'Cà phê đậm vị hòa quyện cốt dừa Bến Tre xay mịn mát lạnh.',
    priceVnd: 45000,
    imageUrl: null,
    available: false, // Hết hàng minh họa
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-04',
    categoryId: 'cat-tea',
    name: 'Trà đào cam sả',
    description: 'Trà đen ủ lạnh với đào giòn, sả tươi và nước cam nguyên chất.',
    priceVnd: 32000,
    imageUrl: null,
    available: true,
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-05',
    categoryId: 'cat-milktea',
    name: 'Trà sữa trân châu hoàng kim',
    description: 'Hồng trà Ceylon đậm đà kết hợp trân châu mật ong giòn dai.',
    priceVnd: 42000,
    imageUrl: null,
    available: true,
    options: [
      { id: 'opt-03', name: '50% đường, 70% đá', priceDeltaVnd: 0, available: true },
    ],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-06',
    categoryId: 'cat-bakery',
    name: 'Bánh sừng bò phô mai',
    description: 'Bánh ngàn lớp nướng giòn với nhân phô mai tan chảy.',
    priceVnd: 38000,
    imageUrl: null,
    available: true,
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
];

export const MOCK_OWNER_ORDERS: OrderDetail[] = [
  {
    id: 'order-028',
    storeId: 'store-moc-01',
    type: 'takeaway',
    status: 'preparing',
    statusLabel: 'Đang làm',
    fulfillmentStatus: 'preparing',
    paymentStatus: 'paid',
    ticketNo: 28,
    serviceDate: '2026-10-23',
    acceptedAt: '2026-10-23T07:28:00Z',
    tableSessionId: null,
    table: null,
    totalVnd: 122000,
    itemCount: 3,
    createdAt: '2026-10-23T07:25:00Z',
    updatedAt: '2026-10-23T07:28:00Z',
    version: 2,
    lines: [
      {
        id: 'line-01',
        menuItemId: 'item-05',
        name: 'Trà sữa trân châu hoàng kim',
        baseUnitPriceVnd: 42000,
        options: [{ menuOptionId: 'opt-03', name: '50% đường, 70% đá', priceDeltaVnd: 0 }],
        unitPriceVnd: 42000,
        quantity: 2,
        lineTotalVnd: 84000,
        note: null,
      },
      {
        id: 'line-02',
        menuItemId: 'item-06',
        name: 'Bánh sừng bò phô mai',
        baseUnitPriceVnd: 38000,
        options: [],
        unitPriceVnd: 38000,
        quantity: 1,
        lineTotalVnd: 38000,
        note: 'Hâm nóng lại giúp mình',
      },
    ],
    note: 'Giao kèm ống hút giấy',
    payment: {
      kind: 'takeaway',
      intentId: 'intent-028',
      amountVnd: 122000,
      currency: 'VND',
      updatedAt: '2026-10-23T07:27:00Z',
      expiresAt: '2026-10-23T07:40:00Z',
      status: 'paid',
      statusLabel: 'Đã thanh toán',
      intentStatus: 'succeeded',
      reconciliationRequired: false,
    },
  },
  {
    id: 'order-029',
    storeId: 'store-moc-01',
    type: 'dine_in',
    status: 'accepted',
    statusLabel: 'Chờ làm',
    fulfillmentStatus: 'awaiting_preparation',
    paymentStatus: 'unpaid',
    ticketNo: 29,
    serviceDate: '2026-10-23',
    acceptedAt: '2026-10-23T07:30:00Z',
    tableSessionId: 'sess-table-03',
    table: { id: 'table-03', label: 'Bàn 03' },
    totalVnd: 67000,
    itemCount: 2,
    createdAt: '2026-10-23T07:30:00Z',
    updatedAt: '2026-10-23T07:30:00Z',
    version: 1,
    lines: [
      {
        id: 'line-03',
        menuItemId: 'item-01',
        name: 'Cà phê muối xứ Huế',
        baseUnitPriceVnd: 35000,
        options: [],
        unitPriceVnd: 35000,
        quantity: 1,
        lineTotalVnd: 35000,
        note: null,
      },
      {
        id: 'line-04',
        menuItemId: 'item-04',
        name: 'Trà đào cam sả',
        baseUnitPriceVnd: 32000,
        options: [],
        unitPriceVnd: 32000,
        quantity: 1,
        lineTotalVnd: 32000,
        note: null,
      },
    ],
    note: null,
    payment: {
      kind: 'table_session',
      tableSessionId: 'sess-table-03',
      intentId: null,
      intentStatus: null,
      amountVnd: 67000,
      currency: 'VND',
      updatedAt: '2026-10-23T07:30:00Z',
      status: 'unpaid',
      statusLabel: 'Chưa thanh toán',
      reconciliationRequired: false,
    },
  },
  {
    id: 'order-027',
    storeId: 'store-moc-01',
    type: 'dine_in',
    status: 'ready',
    statusLabel: 'Sẵn sàng',
    fulfillmentStatus: 'ready',
    paymentStatus: 'unpaid',
    ticketNo: 27,
    serviceDate: '2026-10-23',
    acceptedAt: '2026-10-23T07:15:00Z',
    tableSessionId: 'sess-table-01',
    table: { id: 'table-01', label: 'Bàn 01' },
    totalVnd: 152000,
    itemCount: 4,
    createdAt: '2026-10-23T07:15:00Z',
    updatedAt: '2026-10-23T07:29:00Z',
    version: 3,
    lines: [
      {
        id: 'line-05',
        menuItemId: 'item-01',
        name: 'Cà phê muối xứ Huế',
        baseUnitPriceVnd: 35000,
        options: [],
        unitPriceVnd: 35000,
        quantity: 2,
        lineTotalVnd: 70000,
        note: null,
      },
      {
        id: 'line-06',
        menuItemId: 'item-04',
        name: 'Trà đào cam sả',
        baseUnitPriceVnd: 32000,
        options: [],
        unitPriceVnd: 32000,
        quantity: 1,
        lineTotalVnd: 32000,
        note: null,
      },
      {
        id: 'line-07',
        menuItemId: 'item-05',
        name: 'Trà sữa trân châu hoàng kim',
        baseUnitPriceVnd: 42000,
        options: [{ menuOptionId: 'opt-02', name: 'Thêm kem muối', priceDeltaVnd: 8000 }],
        unitPriceVnd: 50000,
        quantity: 1,
        lineTotalVnd: 50000,
        note: 'Ít ngọt',
      },
    ],
    note: null,
    payment: {
      kind: 'table_session',
      tableSessionId: 'sess-table-01',
      intentId: null,
      intentStatus: null,
      amountVnd: 152000,
      currency: 'VND',
      updatedAt: '2026-10-23T07:15:00Z',
      status: 'unpaid',
      statusLabel: 'Chưa thanh toán',
      reconciliationRequired: false,
    },
  },
];

export const MOCK_TABLES_LIST: TableSummary[] = [
  {
    id: 'c0200000-0000-4000-8000-000000000002',
    label: 'Bàn 01',
    active: true,
    session: {
      id: 'c0200000-0000-4000-8000-000000000011',
      status: 'open',
      openedAt: '2026-10-23T06:30:00Z',
      closedAt: null,
      orderCount: 2,
      totalVnd: 185000,
      paymentStatus: 'unpaid',
      version: 1,
    },
  },
  {
    id: 'c0200000-0000-4000-8000-000000000003',
    label: 'Bàn 02',
    active: true,
    session: null, // Bàn trống
  },
  {
    id: 'c0200000-0000-4000-8000-000000000004',
    label: 'Bàn 03',
    active: true,
    session: {
      id: 'c0200000-0000-4000-8000-000000000013',
      status: 'checkout_pending',
      openedAt: '2026-10-23T06:45:00Z',
      closedAt: null,
      orderCount: 3,
      totalVnd: 320000,
      paymentStatus: 'unpaid',
      version: 2,
    },
  },
  {
    id: 'c0200000-0000-4000-8000-000000000005',
    label: 'Bàn 04',
    active: true,
    session: null,
  },
  {
    id: 'c0200000-0000-4000-8000-000000000006',
    label: 'Bàn 05',
    active: true,
    session: {
      id: 'c0200000-0000-4000-8000-000000000015',
      status: 'open',
      openedAt: '2026-10-23T07:10:00Z',
      closedAt: null,
      orderCount: 1,
      totalVnd: 67000,
      paymentStatus: 'unpaid',
      version: 1,
    },
  },
  {
    id: 'c0200000-0000-4000-8000-000000000007',
    label: 'Bàn 06',
    active: true,
    session: null,
  },
];

/**
 * Fixture danh sách QR Codes từ R17 phục vụ Dev Preview
 */
export const MOCK_QR_CODES_LIST: QRCodeView[] = [
  {
    id: 'c0200000-0000-4000-8000-000000000021',
    publicCode: 'BAN01_DEMO_CODE',
    path: '/q/BAN01_DEMO_CODE',
    active: true,
    type: 'table',
    table: { id: 'c0200000-0000-4000-8000-000000000002', label: 'Bàn 01' },
  },
  {
    id: 'c0200000-0000-4000-8000-000000000022',
    publicCode: 'BAN02_DEMO_CODE',
    path: '/q/BAN02_DEMO_CODE',
    active: true,
    type: 'table',
    table: { id: 'c0200000-0000-4000-8000-000000000003', label: 'Bàn 02' },
  },
  {
    id: 'c0200000-0000-4000-8000-000000000023',
    publicCode: 'COUNTER_TAKEAWAY_CODE',
    path: '/q/COUNTER_TAKEAWAY_CODE',
    active: true,
    type: 'takeaway',
    table: null,
  },
];

/* =============================================================================
   CÁC FIXTURES TRẠNG THÁI GIAO DIỆN MỞ RỘNG CHO PHASE 2 BÀN GIAO (P1-G03)
   ============================================================================= */

/**
 * Fixture Customer Chế độ Tại bàn (Dine-in)
 */
export const MOCK_CUSTOMER_DINE_IN = {
  store: MOCK_STORE,
  mode: 'dine_in' as OrderType,
  tableLabel: 'Bàn 05',
  categories: MOCK_CATEGORIES,
  items: MOCK_MENU_ITEMS,
  cartItemCount: 2,
  cartTotalVnd: 67000,
};

/**
 * Fixture Customer Chế độ Mang đi (Takeaway)
 */
export const MOCK_CUSTOMER_TAKEAWAY = {
  store: MOCK_STORE,
  mode: 'takeaway' as OrderType,
  tableLabel: null,
  categories: MOCK_CATEGORIES,
  items: MOCK_MENU_ITEMS,
  cartItemCount: 1,
  cartTotalVnd: 42000,
};

/**
 * Fixtures danh sách rỗng (Empty States)
 */
export const MOCK_EMPTY_ITEMS: MenuItem[] = [];
export const MOCK_EMPTY_ORDERS: OrderDetail[] = [];
export const MOCK_EMPTY_TABLES: TableSummary[] = [];

/**
 * Fixture ma trận các trạng thái Customer Shell
 */
export const MOCK_CUSTOMER_STATES = {
  loading: {
    ...MOCK_CUSTOMER_DINE_IN,
    uiState: 'loading' as const,
  },
  empty: {
    ...MOCK_CUSTOMER_DINE_IN,
    items: MOCK_EMPTY_ITEMS,
    uiState: 'empty' as const,
  },
  error: {
    ...MOCK_CUSTOMER_DINE_IN,
    uiState: 'error' as const,
    errorMessage: 'Không thể kết nối đến máy chủ POS của quán. Vui lòng kiểm tra lại mạng.',
  },
  invalid_table_session: {
    ...MOCK_CUSTOMER_DINE_IN,
    uiState: 'invalid_table_session' as const,
  },
  offline: {
    ...MOCK_CUSTOMER_DINE_IN,
    uiState: 'offline' as const,
  },
};

/* =============================================================================
   MOCK FIXTURES CHO QR RESOLUTION (PHASE 2 — P2-G01)
   Tuân thủ 100% định dạng QRResolution trong docs/contracts/types.ts
   ============================================================================= */

/**
 * QR bàn chưa xác minh phiên: requiresSessionCode = true, session = null
 */
export const MOCK_QR_TABLE_UNVERIFIED: import('../../../docs/contracts/types').QRResolution = {
  type: 'table',
  mode: 'dine_in',
  store: MOCK_STORE,
  table: MOCK_TABLE_05,
  requiresSessionCode: true,
  session: null,
};

/**
 * QR bàn đã xác minh phiên thành công: requiresSessionCode = false, session = { id, status: 'open' }
 */
export const MOCK_QR_TABLE_VERIFIED: import('../../../docs/contracts/types').QRResolution = {
  type: 'table',
  mode: 'dine_in',
  store: MOCK_STORE,
  table: MOCK_TABLE_05,
  requiresSessionCode: false,
  session: {
    id: 'sess-table-05',
    status: 'open',
  },
};

/**
 * QR bàn đang chờ tính tiền (checkout pending): requiresSessionCode = false, status = 'checkout_pending'
 */
export const MOCK_QR_TABLE_CHECKOUT_PENDING: import('../../../docs/contracts/types').QRResolution = {
  type: 'table',
  mode: 'dine_in',
  store: MOCK_STORE,
  table: MOCK_TABLE_05,
  requiresSessionCode: false,
  session: {
    id: 'sess-table-05',
    status: 'checkout_pending',
  },
};

/**
 * QR mang đi tại quầy: type = 'takeaway', mode = 'takeaway', table = null, requiresSessionCode = false, session = null
 */
export const MOCK_QR_TAKEAWAY: import('../../../docs/contracts/types').QRResolution = {
  type: 'takeaway',
  mode: 'takeaway',
  store: MOCK_STORE,
  table: null,
  requiresSessionCode: false,
  session: null,
};

/**
 * Mã phiên bàn demo hợp lệ để thử nghiệm giao diện trong môi trường dev
 * (Trong production, mã này được cấp ngẫu nhiên từ server Codex qua POS)
 */
export const DEMO_VALID_SESSION_CODES = ['8821', 'MOC88', 'TABLE05', '1234'];

/* =============================================================================
   MOCK FIXTURES CHO OWNER MENU TAB (PHASE 2 — P2-G02)
   Tuân thủ 100% OwnerMenuView, OwnerMenuItem, OwnerMenuCategory từ docs/contracts/types.ts
   ============================================================================= */

export const MOCK_OWNER_CATEGORIES: OwnerMenuCategory[] = [
  { id: 'cat-coffee', name: 'Cà phê', sortOrder: 1, active: true, updatedAt: '2026-10-23T07:00:00Z' },
  { id: 'cat-tea', name: 'Trà trái cây', sortOrder: 2, active: true, updatedAt: '2026-10-23T07:00:00Z' },
  { id: 'cat-milktea', name: 'Trà sữa', sortOrder: 3, active: true, updatedAt: '2026-10-23T07:00:00Z' },
  { id: 'cat-bakery', name: 'Bánh ngọt', sortOrder: 4, active: true, updatedAt: '2026-10-23T07:00:00Z' },
  { id: 'cat-seasonal', name: 'Món theo mùa', sortOrder: 5, active: false, updatedAt: '2026-10-23T07:00:00Z' },
];

export const MOCK_OWNER_MENU_ITEMS: OwnerMenuItem[] = [
  {
    id: 'item-01',
    categoryId: 'cat-coffee',
    name: 'Cà phê muối xứ Huế',
    description: 'Robusta thơm đậm phối cùng lớp kem muối béo ngậy đặc trưng.',
    priceVnd: 35000,
    imageUrl: null,
    available: true,
    active: true,
    options: [
      { id: 'opt-01', name: 'Ít ngọt (50%)', priceDeltaVnd: 0, available: true },
      { id: 'opt-02', name: 'Thêm kem muối', priceDeltaVnd: 8000, available: true },
    ],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-02',
    categoryId: 'cat-coffee',
    name: 'Bạc xỉu ba tầng',
    description: 'Sữa đặc, sữa tươi thanh trùng và cà phê pha phin truyền thống.',
    priceVnd: 32000,
    imageUrl: null,
    available: true,
    active: true,
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-03',
    categoryId: 'cat-coffee',
    name: 'Cà phê cốt dừa đá xay',
    description: 'Cà phê đậm vị hòa quyện cốt dừa Bến Tre xay mịn mát lạnh.',
    priceVnd: 45000,
    imageUrl: null,
    available: false, // Hết hàng minh họa
    active: true,
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-04',
    categoryId: 'cat-tea',
    name: 'Trà đào cam sả',
    description: 'Trà đen ủ lạnh với đào giòn, sả tươi và nước cam nguyên chất.',
    priceVnd: 32000,
    imageUrl: null,
    available: true,
    active: true,
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-05',
    categoryId: 'cat-milktea',
    name: 'Trà sữa trân châu hoàng kim',
    description: 'Hồng trà Ceylon đậm đà kết hợp trân châu mật ong giòn dai.',
    priceVnd: 42000,
    imageUrl: null,
    available: true,
    active: true,
    options: [
      { id: 'opt-03', name: '50% đường, 70% đá', priceDeltaVnd: 0, available: true },
    ],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-06',
    categoryId: 'cat-bakery',
    name: 'Bánh sừng bò phô mai',
    description: 'Bánh ngàn lớp nướng giòn với nhân phô mai tan chảy.',
    priceVnd: 38000,
    imageUrl: null,
    available: true,
    active: true,
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
  {
    id: 'item-07',
    categoryId: 'cat-coffee',
    name: 'Cà phê ủ lạnh Cold Brew Cam',
    description: 'Ủ lạnh 16 tiếng với hạt Arabica Cầu Đất, điểm xuyết lát cam sấy.',
    priceVnd: 48000,
    imageUrl: null,
    available: true,
    active: false, // Đã ẩn (inactive) minh họa
    options: [],
    updatedAt: '2026-10-23T07:00:00Z',
  },
];

export const MOCK_OWNER_MENU_VIEW: OwnerMenuView = {
  categories: MOCK_OWNER_CATEGORIES,
  items: MOCK_OWNER_MENU_ITEMS,
  menuRevision: 'rev-20261023-001',
  serverTime: '2026-10-23T07:30:00Z',
};


