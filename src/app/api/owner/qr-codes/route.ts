import { tableQrFailure } from "@/server/qr/database";
import type { NextRequest } from "next/server";
import { apiSuccess, noQuery, checkOrigin, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { listManagedQrCodes, writeOwnerQr } from "@/server/qr/service";
import { writeQrInput } from "@/lib/validations/table-qr";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const owner = await requireApiOwner();
    noQuery(request);
    return apiSuccess(await listManagedQrCodes(owner));
  } catch (error) { return tableQrFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const owner = await requireApiOwner();
    checkOrigin(request); noQuery(request);
    const input = await readJson(request, writeQrInput);
    return apiSuccess(await writeOwnerQr(owner, input), input.action === "create" ? 201 : 200);
  } catch (error) { return tableQrFailure(error); }
}
