/** P2-C04 additive projections. Frozen v1 fields/routes remain compatible.
 * Contract change request: docs/integration/P2_C04_CONTRACT_CHANGE_REQUEST.md. */
import type { QRCodeView, TableSummary, OwnerTablesView, RequestCommand, QRCodeWriteInput } from "@contracts";

export type OwnerQrCode = QRCodeView & { publicUrl: string; updatedAt: string; retiredAt: string | null };
export type OwnerTable = TableSummary & { updatedAt: string; qr: OwnerQrCode | null };
export type OwnerTableList = Omit<OwnerTablesView, "tables"> & { tables: OwnerTable[] };
export interface CreateTableInput extends RequestCommand { label: string }
export interface UpdateTableInput extends RequestCommand { expectedUpdatedAt: string; label?: string; active?: boolean }
export interface RotateQrInput extends RequestCommand { expectedUpdatedAt: string; confirm: true }
export type WriteQrInput = QRCodeWriteInput;
