import type {
  TableBillView,
  PaymentMethod,
  TableSessionView,
  OrderDetail,
  GuestPaidReceipt,
} from '@contracts';

export type { TableBillView, GuestPaidReceipt };
export type TablePaymentMethod = PaymentMethod;
export type TableBillSession = TableSessionView;
export type TableSessionBillingStatus = TableSessionView['status'];
export type TableBillOrder = Extract<OrderDetail, { type: 'dine_in' }>;
export type TableBillOrderLine = TableBillOrder['lines'][number];
export type TableBillOptionSnapshot = TableBillOrderLine['options'][number];
