import { tableQrFailure } from "@/server/qr/database";
import type { NextRequest } from "next/server";
import { apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { rotateQrInput } from "@/lib/validations/table-qr";
import { rotateOwnerQr } from "@/server/qr/service";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireApiOwner();
    checkOrigin(request); noQuery(request);
    return apiSuccess(await rotateOwnerQr(owner, (await params).id, await readJson(request, rotateQrInput)), 201);
  } catch (error) { return tableQrFailure(error); }
}
