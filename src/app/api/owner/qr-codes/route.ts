import type { NextRequest } from "next/server";
import { apiFailure, apiSuccess, noQuery } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { listOwnerQrCodes } from "@/server/qr/service";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const owner = await requireApiOwner();
    noQuery(request);
    return apiSuccess(await listOwnerQrCodes(owner));
  } catch (error) { return apiFailure(error); }
}
