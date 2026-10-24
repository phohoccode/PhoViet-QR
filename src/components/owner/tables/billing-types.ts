import type {
  OwnerTablePinView,
  TableSummary,
  QRCodeView,
} from '../../../../docs/contracts/types';
import type { TableBillView, TablePaymentMethod } from '../../customer/bill/types';

export interface OwnerTableBillSettlementProps {
  table: TableSummary;
  bill?: TableBillView | null;
  qrCode?: QRCodeView | null;
  isOpen: boolean;
  onClose: () => void;
  isLoadingBill?: boolean;
  billErrorMessage?: string | null;
  onRefreshBill?: () => Promise<void> | void;
  // Phase 5 Checkout & Settlement actions
  onBeginCheckout?: (
    sessionId: string,
    expectedVersion: string | number,
    expectedBillVersion?: string,
    requestId?: string
  ) => Promise<TableBillView | void>;
  onCancelCheckout?: (
    sessionId: string,
    expectedVersion: string | number,
    requestId?: string
  ) => Promise<TableBillView | void>;
  onConfirmSettlement?: (
    sessionId: string,
    expectedVersion: string | number,
    paymentMethod: TablePaymentMethod,
    expectedBillVersion?: string,
    requestId?: string
  ) => Promise<TableBillView | void>;
  onNavigateToOrders?: () => void;
  // Phase 2 PIN Lifecycle preserved props
  onRevealPin?: (tableId: string) => Promise<{ pin: string; isLegacy?: boolean }>;
  onRotatePin?: (tableId: string) => Promise<{ pin: string }>;
  onMigrateLegacyPin?: (tableId: string) => Promise<{ pin: string }>;
  onSessionUpdated?: (tableId: string, pinView: OwnerTablePinView) => void;
  onTableSessionClosed?: (tableId: string) => void;
}
