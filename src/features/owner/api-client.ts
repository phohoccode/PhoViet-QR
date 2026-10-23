import type { OwnerMenuView, OwnerMenuItem, OwnerMenuCategory, CreateMenuItemInput, PatchMenuItemInput, CreateMenuCategoryInput, PatchMenuCategoryInput } from "@contracts";
import { menuRequest } from "@/features/customer/api-client";
export { MenuApiError } from "@/features/customer/api-client";
export const fetchOwnerMenu = (includeInactive = true): Promise<OwnerMenuView> => menuRequest(`/api/owner/menu?includeInactive=${includeInactive}`);
export const createMenuItem = (input: CreateMenuItemInput): Promise<OwnerMenuItem> => menuRequest("/api/owner/menu", "POST", input);
export const updateMenuItem = (id: string, input: PatchMenuItemInput): Promise<OwnerMenuItem> => menuRequest(`/api/owner/menu/${encodeURIComponent(id)}`, "PATCH", input);
export const fetchCategories = (): Promise<OwnerMenuCategory[]> => menuRequest("/api/owner/menu/categories");
export const createCategory = (input: CreateMenuCategoryInput): Promise<OwnerMenuCategory> => menuRequest("/api/owner/menu/categories", "POST", input);
export const updateCategory = (id: string, input: PatchMenuCategoryInput): Promise<OwnerMenuCategory> => menuRequest(`/api/owner/menu/categories/${encodeURIComponent(id)}`, "PATCH", input);
