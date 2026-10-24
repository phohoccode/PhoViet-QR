import "server-only";
import sharp, { type Metadata } from "sharp";
import { randomUUID } from "node:crypto";
import { ApiFault } from "@/server/security/api";
import type { OwnerContext } from "@/server/auth/verify-owner";
import { hotfixRpc, menuStorageClient, ownerScope } from "./hotfix";

const MAX_BYTES = 5 * 1024 * 1024;
const bucket = "menu-images";
type Format = "jpeg" | "png" | "webp";
function publicUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new ApiFault("UPLOAD_FAILED");
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`;
}
async function inspect(file: File): Promise<{ bytes: Buffer; format: Format }> {
  if (/[\\/\x00-\x1f]/.test(file.name)) throw new ApiFault("UNSUPPORTED_MEDIA_TYPE");
  if (file.size > MAX_BYTES) throw new ApiFault("FILE_TOO_LARGE");
  if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type.toLowerCase())) throw new ApiFault("UNSUPPORTED_MEDIA_TYPE");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new ApiFault("FILE_TOO_LARGE");
  let metadata: Metadata;
  try { metadata = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).metadata(); }
  catch { throw new ApiFault("UNSUPPORTED_MEDIA_TYPE"); }
  const format = metadata.format as Format | undefined;
  if (!format || !["jpeg", "png", "webp"].includes(format) || metadata.pages && metadata.pages > 1) throw new ApiFault("UNSUPPORTED_MEDIA_TYPE");
  if ((file.type === "image/jpeg" && format !== "jpeg") || (file.type === "image/png" && format !== "png") || (file.type === "image/webp" && format !== "webp")) throw new ApiFault("UNSUPPORTED_MEDIA_TYPE");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !(format === "jpeg" ? ["jpg", "jpeg"] : [format]).includes(extension)) throw new ApiFault("UNSUPPORTED_MEDIA_TYPE");
  try {
    // Full decode, remove metadata and bound image size for mobile/CDN delivery.
    const normalized = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    if (normalized.length > MAX_BYTES) throw new Error("oversized output");
    return { bytes: normalized, format: "webp" };
  } catch { throw new ApiFault("UNSUPPORTED_MEDIA_TYPE"); }
}
export async function uploadMenuImage(owner: OwnerContext, file: File) {
  const { bytes, format } = await inspect(file);
  const path = `stores/${owner.storeId}/uploads/${randomUUID()}.${format === "jpeg" ? "jpg" : format}`;
  const url = publicUrl(path);
  const reserved = await hotfixRpc<{ expiresAt: string }>("hf01_owner_execute", "reserve_image", { ...ownerScope(owner), path, url });
  const client = menuStorageClient();
  const uploaded = await client.storage.from(bucket).upload(path, bytes, { contentType: `image/${format}`, upsert: false, cacheControl: "31536000" }).catch(() => ({ error: true }));
  if (uploaded.error) {
    await client.storage.from(bucket).remove([path]).catch(() => undefined);
    await hotfixRpc("hf01_owner_execute", "abort_image", { ...ownerScope(owner), path }).catch(() => undefined);
    throw new ApiFault("UPLOAD_FAILED");
  }
  try {
    await hotfixRpc("hf01_owner_execute", "ready_image", { ...ownerScope(owner), path });
  } catch (error) {
    await client.storage.from(bucket).remove([path]).catch(() => undefined);
    await hotfixRpc("hf01_owner_execute", "abort_image", { ...ownerScope(owner), path }).catch(() => undefined);
    if (error instanceof ApiFault && error.code === "FORBIDDEN") throw error;
    throw new ApiFault("UPLOAD_FAILED");
  }
  return { url, imageUrl: url, storagePath: path, expiresAt: reserved.expiresAt };
}

/** Scheduled daily and after owner menu reads. Failure leaves a
 * leased deleting record for retry; it never rolls back the replacement image. */
export async function cleanupMenuImages(storeId?: string) {
  const paths = await hotfixRpc<string[]>("hf01_image_cleanup", "claim", storeId ? { storeId } : {});
  const client = menuStorageClient();
  let removed = 0;
  await Promise.all(paths.map(async path => {
    if (!/^stores\/[a-f0-9-]{36}\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(path)) return;
    const result = await client.storage.from(bucket).remove([path]).catch(() => ({ error: true }));
    if (result.error) return;
    await hotfixRpc("hf01_image_cleanup", "done", { path });
    removed++;
  }));
  return { removed, pending: paths.length - removed };
}
