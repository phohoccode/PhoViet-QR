/**
 * CUSTOMER ORDER API CLIENT & DEV FIXTURES — Phase 3 (P3-G01 / P3-C01)
 *
 * Tích hợp chuẩn xác với backend adapter @/features/orders/api-client:
 * - R04: submitCustomerOrder (POST /api/public/orders)
 * - R05: getCustomerOrderTracking (GET /api/public/orders/:id)
 * - R05 (Buyer-private): getPrivateOrderTracking (GET /api/public/orders/:id?includePickup=true)
 *
 * Tuyệt đối tuân thủ API_CONTRACT_V1 và docs/contracts/types.ts.
 * Sử dụng trực tiếp client adapter chuẩn, không duy trì transport trùng lặp.
 */

import type {
  CreateOrderV1Input,
  OrderDetail,
  PrivateOrderTrackingView,
} from '../../../../docs/contracts/types';
import {
  submitCustomerOrder,
  getCustomerOrderTracking,
  getPrivateOrderTracking,
  OrderApiError,
} from '@/features/orders/api-client';

export {
  submitCustomerOrder,
  getCustomerOrderTracking,
  getPrivateOrderTracking,
  OrderApiError,
};

/**
 * Adapter tương thích cho các component gọi submitDineInOrder
 */
export const submitDineInOrder = (
  input: CreateOrderV1Input
): Promise<OrderDetail> => submitCustomerOrder(input);

/**
 * Adapter tương thích cho các component gọi fetchCustomerOrder
 */
export const fetchCustomerOrder = (
  orderId: string,
  includePickup = false
): Promise<OrderDetail | PrivateOrderTrackingView> =>
  includePickup ? getPrivateOrderTracking(orderId) : getCustomerOrderTracking(orderId);

// ============================================================================
// DEV FIXTURES (Chỉ sử dụng trong Dev / Preview / Vitest Tests)
// Tuyệt đối không import vào code xử lý production.
// ============================================================================

export type DineInOrderDetail = Extract<OrderDetail, { type: 'dine_in' }>;

export const DEV_MOCK_ORDER_DETAIL_ACCEPTED: DineInOrderDetail = {
  id: 'c0300000-0000-4000-8000-000000000028',
  storeId: 'c0200000-0000-4000-8000-000000000001',
  type: 'dine_in',
  tableSessionId: 'c0210000-0000-4000-8000-000000000005',
  table: { id: 'c0200000-0000-4000-8000-000000000005', label: 'Bàn 05' },
  status: 'accepted',
  statusLabel: 'Chờ làm',
  ticketNo: 28,
  serviceDate: '2026-10-23',
  acceptedAt: '2026-10-23T08:30:00Z',
  paymentStatus: 'unpaid',
  fulfillmentStatus: 'awaiting_preparation',
  totalVnd: 78000,
  itemCount: 2,
  createdAt: '2026-10-23T08:30:00Z',
  updatedAt: '2026-10-23T08:30:00Z',
  version: 1,
  lines: [
    {
      id: 'line-01',
      menuItemId: 'item-01',
      name: 'Cà phê muối xứ Huế',
      baseUnitPriceVnd: 35000,
      options: [
        { menuOptionId: 'opt-02', name: 'Thêm kem muối', priceDeltaVnd: 8000 },
      ],
      unitPriceVnd: 43000,
      quantity: 1,
      lineTotalVnd: 43000,
      note: 'Ít đá giúp mình',
    },
    {
      id: 'line-02',
      menuItemId: 'item-02',
      name: 'Bạc xỉu ba tầng',
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
    tableSessionId: 'c0210000-0000-4000-8000-000000000005',
    intentId: null,
    intentStatus: null,
    status: 'unpaid',
    statusLabel: 'Chưa thanh toán',
    amountVnd: 78000,
    currency: 'VND',
    updatedAt: '2026-10-23T08:30:00Z',
    reconciliationRequired: false,
  },
};

export const DEV_MOCK_ORDER_DETAIL_PREPARING: DineInOrderDetail = {
  ...DEV_MOCK_ORDER_DETAIL_ACCEPTED,
  status: 'preparing',
  statusLabel: 'Đang làm',
  fulfillmentStatus: 'preparing',
  updatedAt: '2026-10-23T08:34:00Z',
  version: 2,
};

export const DEV_MOCK_ORDER_DETAIL_READY: DineInOrderDetail = {
  ...DEV_MOCK_ORDER_DETAIL_ACCEPTED,
  status: 'ready',
  statusLabel: 'Sẵn sàng',
  fulfillmentStatus: 'ready',
  updatedAt: '2026-10-23T08:42:00Z',
  version: 3,
};

export const DEV_MOCK_ORDER_DETAIL_COMPLETED: DineInOrderDetail = {
  ...DEV_MOCK_ORDER_DETAIL_ACCEPTED,
  status: 'completed',
  statusLabel: 'Đã giao',
  fulfillmentStatus: 'served',
  updatedAt: '2026-10-23T08:48:00Z',
  version: 4,
};

export const DEV_MOCK_ORDER_DETAIL_CANCELLED: DineInOrderDetail = {
  ...DEV_MOCK_ORDER_DETAIL_ACCEPTED,
  status: 'cancelled',
  statusLabel: 'Đã hủy',
  fulfillmentStatus: 'cancelled',
  updatedAt: '2026-10-23T08:32:00Z',
  version: 5,
};
