import type { NextRequest } from "next/server";
import { apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { patchCategoryInput } from "@/lib/validations/menu";
import { updateCategory } from "@/server/menu/service";
import { menuFailure } from "@/server/menu/database";
export const runtime = "nodejs";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); noQuery(request);
    const owner = await requireApiOwner();
    return apiSuccess(await updateCategory(owner, (await params).id, await readJson(request, patchCategoryInput)));
  } catch (error) { return menuFailure(error); }
}
