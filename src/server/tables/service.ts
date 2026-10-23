import "server-only";
import type { OwnerContext } from "@/server/auth/verify-owner";
import type { CreateTableInput, UpdateTableInput, OwnerTable, OwnerTableList } from "@/types/contracts/table-qr";
import { createTableInput, updateTableInput } from "@/lib/validations/table-qr";
import { resourceId } from "@/lib/validations/table-sessions";
import { validate } from "@/server/security/api";
import { executeTableQr } from "@/server/qr/database";
import { qrBaseUrl, qrPublicUrl } from "@/server/qr/public-url";

const scope = (owner: OwnerContext) => ({ ownerId: owner.authUserId, storeId: owner.storeId });
function project(table: OwnerTable, base: URL): OwnerTable {
  return { ...table, qr: table.qr ? { ...table.qr, publicUrl: qrPublicUrl(table.qr.publicCode, base) } : null };
}
export async function listManagedTables(owner: OwnerContext, tableId?: string): Promise<OwnerTableList> {
  const base = qrBaseUrl();
  const data = await executeTableQr<OwnerTableList>("tables", { ...scope(owner), ...(tableId ? { tableId: validate(resourceId, tableId) } : {}) });
  return { ...data, tables: data.tables.map(table => project(table, base)) };
}
export async function createTable(owner: OwnerContext, input: CreateTableInput): Promise<OwnerTable> {
  const base = qrBaseUrl(); // Fail before any committed mutation if config is missing.
  const data = await executeTableQr<OwnerTable>("create_table", { ...scope(owner), ...validate(createTableInput, input) });
  return project(data, base);
}
export async function updateTable(owner: OwnerContext, id: string, input: UpdateTableInput): Promise<OwnerTable> {
  const base = qrBaseUrl();
  const data = await executeTableQr<OwnerTable>("update_table", { ...scope(owner), id: validate(resourceId, id), ...validate(updateTableInput, input) });
  return project(data, base);
}
