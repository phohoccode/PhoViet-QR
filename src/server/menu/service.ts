import "server-only";
import type { CreateMenuItemInput, PatchMenuItemInput, MenuV1View, OwnerMenuView, OwnerMenuItem, CreateMenuCategoryInput, PatchMenuCategoryInput, OwnerMenuCategory } from "@contracts";
import type { OwnerContext } from "@/server/auth/verify-owner";
import type { GuestRequestContext } from "@/server/security/request-context";
import { validate } from "@/server/security/api";
import { resourceId } from "@/lib/validations/table-sessions";
import { createMenuItemInput, patchMenuItemInput, publicMenuQuery, createCategoryInput, patchCategoryInput } from "@/lib/validations/menu";
import { executeMenu } from "./database";

const scope = (owner: OwnerContext) => ({ ownerId: owner.authUserId, storeId: owner.storeId });
export async function fetchPublicMenu(qrCode: string, context: GuestRequestContext): Promise<MenuV1View> {
  validate(publicMenuQuery, { qrCode });
  const result = await fetchConditionalPublicMenu(qrCode, context);
  if ('notModified' in result) throw new Error('Unexpected conditional result');
  const menu: MenuV1View = { categories: result.categories, items: result.items, menuRevision: result.menuRevision, serverTime: result.serverTime };
  if (result.orderingAvailability) menu.orderingAvailability = result.orderingAvailability;
  return menu;
}
type ConditionalMenu = (MenuV1View | { notModified: true }) & { etag: string };
/** Auth/QR/rate checks always run in PostgreSQL, including a 304. */
export async function fetchConditionalPublicMenu(qrCode: string, context: GuestRequestContext, ifNoneMatch?: string): Promise<ConditionalMenu> {
  validate(publicMenuQuery, { qrCode });
  return executeMenu('public', { qrCode, browserHash: context.browserHash, grantProof: context.grantProof, newBrowser: context.isNew,
    ...(ifNoneMatch ? { ifNoneMatch } : {}) });
}
export const fetchOwnerMenu = (owner: OwnerContext, includeInactive = true): Promise<OwnerMenuView> => executeMenu("owner", { ...scope(owner), includeInactive });
export const createMenuItem = (owner: OwnerContext, input: CreateMenuItemInput): Promise<OwnerMenuItem> => executeMenu("create_item", { ...scope(owner), ...validate(createMenuItemInput, input) });
export const updateMenuItem = (owner: OwnerContext, id: string, input: PatchMenuItemInput): Promise<OwnerMenuItem> => executeMenu("patch_item", { ...scope(owner), id: validate(resourceId, id), ...validate(patchMenuItemInput, input) });
export const fetchCategories = (owner: OwnerContext): Promise<OwnerMenuCategory[]> => executeMenu("category_list", scope(owner));
export const createCategory = (owner: OwnerContext, input: CreateMenuCategoryInput): Promise<OwnerMenuCategory> => executeMenu("create_category", { ...scope(owner), ...validate(createCategoryInput, input) });
export const updateCategory = (owner: OwnerContext, id: string, input: PatchMenuCategoryInput): Promise<OwnerMenuCategory> => executeMenu("patch_category", { ...scope(owner), id: validate(resourceId, id), ...validate(patchCategoryInput, input) });
