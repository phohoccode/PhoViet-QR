import type { NextRequest } from "next/server";
import { ApiFault, apiSuccess, validate } from "@/server/security/api";
import { guestRequestContext, setGuestCookie } from "@/server/security/request-context";
import { publicMenuQuery } from "@/lib/validations/menu";
import { fetchPublicMenu } from "@/server/menu/service";
import { menuFailure } from "@/server/menu/database";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const entries = [...request.nextUrl.searchParams];
    if (entries.length !== 1) throw new ApiFault("VALIDATION_ERROR");
    const { qrCode } = validate(publicMenuQuery, Object.fromEntries(entries));
    let context = guestRequestContext(request);
    let menu;
    try { menu = await fetchPublicMenu(qrCode, context); } catch (error) {
      if (!(error instanceof ApiFault) || error.code !== "UNAUTHORIZED" || context.isNew) throw error;
      context = guestRequestContext(request, true, true);
      menu = await fetchPublicMenu(qrCode, context);
    }
    const response = apiSuccess(menu);
    if (context.isNew) setGuestCookie(response, context);
    return response;
  } catch (error) { return menuFailure(error); }
}
