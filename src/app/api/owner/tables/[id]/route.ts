import { tableQrFailure } from "@/server/qr/database";
import type { NextRequest } from "next/server";
import { apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { updateTableInput } from "@/lib/validations/table-qr";
import { updateTable } from "@/server/tables/service";
import { archiveResource } from "@/server/menu/hotfix";
export const runtime = "nodejs";
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); noQuery(request);
    const owner = await requireApiOwner();
    return apiSuccess(await archiveResource(owner, "table", (await params).id));
  } catch (error) { return tableQrFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireApiOwner();
    checkOrigin(request); noQuery(request);
    return apiSuccess(await updateTable(owner, (await params).id, await readJson(request, updateTableInput)));
  } catch (error) { return tableQrFailure(error); }
}
