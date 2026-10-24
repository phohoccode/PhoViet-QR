import type { NextRequest } from "next/server";
import { apiFailure, apiSuccess, ApiFault, validate } from "@/server/security/api";
import { guestRequestContext } from "@/server/security/request-context";
import { getGuestSessionBill } from "@/server/table-sessions/billing";
import { guestBillQuery } from "@/lib/validations/session-billing";
import { withApiTrace } from "@/server/security/trace";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return withApiTrace(request, async () => {
    try {
      const context = guestRequestContext(request, false);
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].length !== 1) throw new ApiFault("VALIDATION_ERROR");
      const { qrCode } = validate(guestBillQuery, Object.fromEntries(params));
      const response = apiSuccess(await getGuestSessionBill(qrCode, context));
      response.headers.set("Vary", "Cookie, Origin"); return response;
    } catch (error) { const response = apiFailure(error); response.headers.set("Vary", "Cookie, Origin"); return response; }
  });
}
