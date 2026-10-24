import type { NextRequest } from "next/server";
import { apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { patchMenuItemInput } from "@/lib/validations/menu";
import { updateMenuItem } from "@/server/menu/service";
import { menuFailure } from "@/server/menu/database";
import { archiveResource } from "@/server/menu/hotfix";
export const runtime = "nodejs";
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); noQuery(request);
    const owner = await requireApiOwner();
    return apiSuccess(await archiveResource(owner, "item", (await params).id));
  } catch (error) { return menuFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); noQuery(request);
    const owner = await requireApiOwner();
    return apiSuccess(await updateMenuItem(owner, (await params).id, await readJson(request, patchMenuItemInput)));
  } catch (error) { return menuFailure(error); }
}
