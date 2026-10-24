import type { OwnerMenuView, OwnerMenuItem, OwnerMenuCategory, CreateMenuItemInput, PatchMenuItemInput, CreateMenuCategoryInput, PatchMenuCategoryInput, OpenTableSessionInput, OwnerSessionOpenedView } from "@contracts";
import { menuRequest } from "@/features/customer/api-client";
import type { OwnerTablePinView, RotateTablePinInput } from "@contracts";
import type { OwnerOrdersQuery, OwnerOrdersView, RequestCommand, OrderDetail, OrderTransitionInput, CompleteOrderInput } from "@contracts";
import type { OwnerTableList, OwnerTable, OwnerQrCode, CreateTableInput, UpdateTableInput, WriteQrInput, RotateQrInput } from "@/types/contracts/table-qr";
export { MenuApiError } from "@/features/customer/api-client";
export const fetchOwnerMenu = (includeInactive = true): Promise<OwnerMenuView> => menuRequest(`/api/owner/menu?includeInactive=${includeInactive}`);
export const createMenuItem = (input: CreateMenuItemInput): Promise<OwnerMenuItem> => menuRequest("/api/owner/menu", "POST", input);
export const updateMenuItem = (id: string, input: PatchMenuItemInput): Promise<OwnerMenuItem> => menuRequest(`/api/owner/menu/${encodeURIComponent(id)}`, "PATCH", input);
export const fetchCategories = (): Promise<OwnerMenuCategory[]> => menuRequest("/api/owner/menu/categories");
export const createCategory = (input: CreateMenuCategoryInput): Promise<OwnerMenuCategory> => menuRequest("/api/owner/menu/categories", "POST", input);
export const updateCategory = (id: string, input: PatchMenuCategoryInput): Promise<OwnerMenuCategory> => menuRequest(`/api/owner/menu/categories/${encodeURIComponent(id)}`, "PATCH", input);
export const fetchOwnerTables = (tableId?: string): Promise<OwnerTableList> => menuRequest(`/api/owner/tables${tableId ? `?tableId=${encodeURIComponent(tableId)}` : ""}`);
export const createOwnerTable = (input: CreateTableInput): Promise<OwnerTable> => menuRequest("/api/owner/tables", "POST", input);
export const updateOwnerTable = (id: string, input: UpdateTableInput): Promise<OwnerTable> => menuRequest(`/api/owner/tables/${encodeURIComponent(id)}`, "PATCH", input);
export const fetchOwnerQrCodes = (): Promise<OwnerQrCode[]> => menuRequest("/api/owner/qr-codes");
export const writeOwnerQrCode = (input: WriteQrInput): Promise<OwnerQrCode> => menuRequest("/api/owner/qr-codes", "POST", input);
export const rotateOwnerQrCode = (id: string, input: RotateQrInput): Promise<OwnerQrCode> => menuRequest(`/api/owner/qr-codes/${encodeURIComponent(id)}/rotate`, "POST", input);
export const openOwnerTableSession = (tableId: string, input: OpenTableSessionInput): Promise<OwnerSessionOpenedView> => menuRequest(`/api/owner/tables/${encodeURIComponent(tableId)}/sessions`, "POST", input);
export const revealOwnerTablePin = (sessionId: string): Promise<OwnerTablePinView> => menuRequest(`/api/owner/table-sessions/${encodeURIComponent(sessionId)}/pin/reveal`, "POST", {});
export const rotateOwnerTablePin = (sessionId: string, input: RotateTablePinInput): Promise<OwnerTablePinView> => menuRequest(`/api/owner/table-sessions/${encodeURIComponent(sessionId)}/pin/rotate`, "POST", input);
export function getOwnerOrders(query: OwnerOrdersQuery = {}): Promise<OwnerOrdersView> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  return menuRequest(`/api/owner/orders${params.size ? `?${params}` : ""}`);
}
export const claimNextOrder = (input: RequestCommand): Promise<OrderDetail | null> => menuRequest("/api/owner/queue/claim-next", "POST", input);
export const markOrderReady = (id: string, input: OrderTransitionInput): Promise<OrderDetail> => menuRequest(`/api/owner/orders/${encodeURIComponent(id)}/ready`, "POST", input);
export const completeOrder = (id: string, input: CompleteOrderInput): Promise<OrderDetail> => menuRequest(`/api/owner/orders/${encodeURIComponent(id)}/complete`, "POST", input);
