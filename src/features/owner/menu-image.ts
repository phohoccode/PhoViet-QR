import { MenuApiError } from "@/features/customer/api-client";

/** Keep the advertised 5 MiB input limit while fitting Vercel's smaller request
 * body ceiling. Smaller files still undergo full server validation/normalizing. */
export async function prepareMenuImage(file: File): Promise<File> {
  if (file.size > 5 * 1024 * 1024) throw new MenuApiError(413, { code: "FILE_TOO_LARGE", message: "Ảnh phải có kích thước tối đa 5 MiB." });
  if (file.size <= 4 * 1024 * 1024) return file;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...header.slice(start, end));
  const valid = file.type === "image/jpeg" && header[0] === 255 && header[1] === 216 && header[2] === 255 && /\.jpe?g$/i.test(file.name)
    || file.type === "image/png" && [137,80,78,71,13,10,26,10].every((b,i) => header[i] === b) && /\.png$/i.test(file.name)
    || file.type === "image/webp" && ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP" && /\.webp$/i.test(file.name);
  if (!valid || /[\\/\x00-\x1f]/.test(file.name)) throw new MenuApiError(415, { code: "UNSUPPORTED_MEDIA_TYPE", message: "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP hợp lệ." });
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error("oversized dimensions");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image processing unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= 4 * 1024 * 1024) {
        // Browsers without a WebP encoder may fall back to PNG.
        if (blob.type !== "image/webp" && blob.type !== "image/png") throw new Error("unsupported encoder");
        return new File([blob], blob.type === "image/png" ? "menu-image.png" : "menu-image.webp", { type: blob.type });
      }
    }
    throw new Error("image output too large");
  } catch {
    throw new MenuApiError(415, { code: "UNSUPPORTED_MEDIA_TYPE", message: "Chưa thể xử lý ảnh này. Vui lòng chọn ảnh JPEG, PNG hoặc WebP khác." });
  } finally { bitmap?.close(); }
}
