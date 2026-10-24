import type { OwnerMenuView, OwnerMenuItem, OwnerMenuCategory, CreateMenuItemInput, PatchMenuItemInput, CreateMenuCategoryInput, PatchMenuCategoryInput, OpenTableSessionInput, OwnerSessionOpenedView, OrderingSettingsView, PatchOrderingSettingsInput, ApiResponse } from "@contracts";
import { menuRequest, MenuApiError } from "@/features/customer/api-client";
import { prepareMenuImage } from "./menu-image";
import type { OwnerTablePinView, RotateTablePinInput } from "@contracts";
import type { TableBillView, SettleSessionInput, SessionSettlementResult } from "@contracts";
import type { OwnerOrdersQuery, OwnerOrdersView, RequestCommand, OrderDetail, OrderTransitionInput, CompleteOrderInput } from "@contracts";
import type { OwnerTableList, OwnerTable, OwnerQrCode, CreateTableInput, UpdateTableInput, WriteQrInput, RotateQrInput } from "@/types/contracts/table-qr";
export { MenuApiError };
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
export const fetchOwnerSessionBill = (id: string): Promise<TableBillView> => menuRequest(`/api/owner/table-sessions/${encodeURIComponent(id)}/bill`);
export const settleOwnerSession = (id: string, input: SettleSessionInput): Promise<SessionSettlementResult> => menuRequest(`/api/owner/table-sessions/${encodeURIComponent(id)}/settle`, "POST", input);
export const fetchOrderingSettings = (): Promise<OrderingSettingsView> => menuRequest("/api/owner/settings/ordering");
export const patchOrderingSettings = (input: PatchOrderingSettingsInput): Promise<OrderingSettingsView> => menuRequest("/api/owner/settings/ordering", "PATCH", input);

// Owner Hotfix 01: Xóa bàn trống, xóa danh mục, xóa món ăn, upload ảnh món
export const deleteOwnerTable = (id: string): Promise<{ success: boolean } | void> =>
  menuRequest(`/api/owner/tables/${encodeURIComponent(id)}`, "DELETE");
export const deleteCategory = (id: string): Promise<{ success: boolean } | void> =>
  menuRequest(`/api/owner/menu/categories/${encodeURIComponent(id)}`, "DELETE");
export const deleteMenuItem = (id: string): Promise<{ success: boolean } | void> =>
  menuRequest(`/api/owner/menu/${encodeURIComponent(id)}`, "DELETE");
export const uploadMenuItemImage = async (file: File): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append("file", await prepareMenuImage(file));
  const res = await fetch("/api/owner/menu/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
    cache: "no-store",
  });
  const payload: ApiResponse<{ url: string }> | null = await res.json().catch(() => null);
  if (!res.ok || !payload || payload.error !== null || !payload.data?.url) {
    throw new MenuApiError(res.status, payload?.error ?? { code: "UPLOAD_FAILED", message: "Không thể tải ảnh lên máy chủ. Kiểm tra dịch vụ lưu trữ." });
  }
  return payload.data;
};

