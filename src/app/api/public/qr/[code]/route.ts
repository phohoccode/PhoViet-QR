import type { NextRequest } from "next/server";
import { ApiFault, apiFailure, apiSuccess, noQuery } from "@/server/security/api";
import {
  guestRequestContext,
  setGuestCookie,
} from "@/server/security/request-context";
import { resolvePublicQr } from "@/server/qr/service";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    noQuery(request);
    let context = guestRequestContext(request);
    const code = (await params).code;
    let data;
    try { data = await resolvePublicQr(code, context); } catch (error) {
      if (!(error instanceof ApiFault) || error.code !== "UNAUTHORIZED" || context.isNew) throw error;
      context = guestRequestContext(request, true, true);
      data = await resolvePublicQr(code, context);
    }
    const response = apiSuccess(data);
    if (context.isNew) setGuestCookie(response, context);
    return response;
  } catch (error) {
    return apiFailure(error);
  }
}
