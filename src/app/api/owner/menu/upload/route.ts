import type { NextRequest } from "next/server";
import { apiSuccess, ApiFault, checkOrigin, noQuery } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { uploadMenuImage } from "@/server/menu/storage";
import { menuFailure } from "@/server/menu/database";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); noQuery(request);
    const owner = await requireApiOwner();
    // Enforce a streaming cap before multipart parsing, including chunked bodies.
    const maximum = 5 * 1024 * 1024 + 64 * 1024;
    if (!/^multipart\/form-data;/i.test(request.headers.get("content-type") ?? "")) throw new ApiFault("VALIDATION_ERROR");
    const reader = request.body?.getReader();
    if (!reader) throw new ApiFault("VALIDATION_ERROR");
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maximum) { await reader.cancel(); throw new ApiFault("FILE_TOO_LARGE"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: Buffer.concat(chunks) }).formData()
      .catch(() => { throw new ApiFault("VALIDATION_ERROR"); });
    if ([...form.keys()].length !== 1) throw new ApiFault("VALIDATION_ERROR");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiFault("VALIDATION_ERROR");
    return apiSuccess(await uploadMenuImage(owner, file), 201);
  } catch (error) { return menuFailure(error); }
}
