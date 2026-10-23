import type { NextRequest } from "next/server";
import { ApiFault, apiFailure, apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { guestRequestContext, setGuestCookie } from "@/server/security/request-context";
import { verifySessionInput } from "@/lib/validations/table-sessions";
import { verifyTableSession } from "@/server/table-sessions/service";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); noQuery(request);
    const input = await readJson(request, verifySessionInput);
    let context = guestRequestContext(request);
    try {
      let data;
      try { data = await verifyTableSession(input.qrCode, input.sessionCode, context); } catch (error) {
        if (!(error instanceof ApiFault) || error.code !== "UNAUTHORIZED" || context.isNew) throw error;
        context = guestRequestContext(request, true, true);
        data = await verifyTableSession(input.qrCode, input.sessionCode, context);
      }
      const response = apiSuccess(data);
      setGuestCookie(response, context);
      return response;
    } catch (error) {
      const response = apiFailure(error);
      // Persist even a failed attempt's random context; it grants no session.
      if (context.isNew) setGuestCookie(response, context);
      return response;
    }
  } catch (error) { return apiFailure(error); }
}
