import { z } from "zod";
import type { MenuV1View, OwnerMenuView, OwnerMenuItem, OwnerMenuCategory } from "@contracts";
import { publicQrCode, resourceId } from "./table-sessions";

export const MAX_MENU_OPTIONS = 50;
export const MENU_IMAGE_HOSTS = ["images.unsplash.com"] as const;
export const menuImageUrl = z.string().max(2048).url().refine(value => {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !value.includes("#") &&
      ((url.protocol === "https:" && !url.port && MENU_IMAGE_HOSTS.some(host => url.hostname === host)) || (() => {
        const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!configured) return false;
        const base = new URL(configured);
        const safeProtocol = base.protocol === "https:" || (base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
        return safeProtocol && url.origin === base.origin && !url.search &&
          /^\/storage\/v1\/object\/public\/menu-images\/stores\/[a-f0-9-]{36}\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(url.pathname);
      })());
  } catch { return false; }
}, "Ảnh phải là HTTPS trên host ảnh được hỗ trợ.").transform(value => new URL(value).toString()).nullable();
export const menuName = z.string().trim().min(1).max(120);
export const moneyVnd = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
export const menuOptionWrite = z.strictObject({ id: resourceId.optional(), name: menuName, priceDeltaVnd: moneyVnd, available: z.boolean() });
const fields = {
  categoryId: resourceId, name: menuName, description: z.string().max(1000).nullable(),
  priceVnd: moneyVnd, imageUrl: menuImageUrl, available: z.boolean(), active: z.boolean(),
  options: z.array(menuOptionWrite).max(MAX_MENU_OPTIONS),
};
export const createMenuItemInput = z.strictObject({ requestId: resourceId, ...fields });
export const patchMenuItemInput = z.strictObject({ requestId: resourceId, expectedUpdatedAt: timestamp,
  ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.optional()])) as { [K in keyof typeof fields]: z.ZodOptional<(typeof fields)[K]> },
}).refine(input => Object.keys(fields).some(key => key in input), "Cần ít nhất một trường thay đổi.");
export const publicMenuQuery = z.strictObject({ qrCode: publicQrCode });
export const ownerMenuQuery = z.strictObject({ includeInactive: z.enum(["true", "false"]).optional().transform(value => value !== "false") });
const categoryFields = { name: menuName, sortOrder: z.number().int().min(-2147483648).max(2147483647), active: z.boolean() };
export const createCategoryInput = z.strictObject({ requestId: resourceId, ...categoryFields });
export const patchCategoryInput = z.strictObject({ requestId: resourceId, expectedUpdatedAt: timestamp,
  name: categoryFields.name.optional(), sortOrder: categoryFields.sortOrder.optional(), active: categoryFields.active.optional(),
}).refine(input => ["name", "sortOrder", "active"].some(key => key in input), "Cần ít nhất một trường thay đổi.");

const optionView = z.strictObject({ id: resourceId, name: menuName, priceDeltaVnd: moneyVnd, available: z.boolean() });
const categoryView = z.strictObject({ id: resourceId, name: menuName, sortOrder: categoryFields.sortOrder });
const itemView = z.strictObject({ id: resourceId, categoryId: resourceId, name: menuName, description: fields.description,
  priceVnd: moneyVnd, imageUrl: menuImageUrl, available: z.boolean(), options: z.array(optionView), updatedAt: timestamp });
export const publicMenuResponse = z.strictObject({ categories: z.array(categoryView), items: z.array(itemView), menuRevision: z.string().min(1).max(128), serverTime: timestamp,
  orderingAvailability: z.strictObject({ orderType: z.enum(['dine_in', 'takeaway']), acceptingOrders: z.boolean(), reason: z.literal('manual_pause').optional() }).optional(),
}) satisfies z.ZodType<MenuV1View>;
export const ownerMenuItemResponse = itemView.extend({ active: z.boolean(), imagePath: z.string().nullable().optional(), archivedAt: timestamp.nullable().optional() }) satisfies z.ZodType<OwnerMenuItem>;
export const ownerCategoryResponse = categoryView.extend({ active: z.boolean(), updatedAt: timestamp, archivedAt: timestamp.nullable().optional() }) satisfies z.ZodType<OwnerMenuCategory>;
export const ownerMenuResponse = publicMenuResponse.extend({ categories: z.array(categoryView.extend({ active: z.boolean() })), items: z.array(ownerMenuItemResponse) }) satisfies z.ZodType<OwnerMenuView>;
