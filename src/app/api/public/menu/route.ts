import { NextResponse, type NextRequest } from "next/server";
import { ApiFault, apiSuccess, validate } from "@/server/security/api";
import { guestRequestContext, setGuestCookie } from "@/server/security/request-context";
import { publicMenuQuery } from "@/lib/validations/menu";
import { fetchConditionalPublicMenu } from "@/server/menu/service";
import { withApiTrace } from "@/server/security/trace";
import { menuFailure } from "@/server/menu/database";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return withApiTrace(request, async () => {
  try {
    const entries = [...request.nextUrl.searchParams];
    if (entries.length !== 1) throw new ApiFault("VALIDATION_ERROR");
    const { qrCode } = validate(publicMenuQuery, Object.fromEntries(entries));
    let context = guestRequestContext(request);
    let menu;
    const tag = request.headers.get('if-none-match')?.slice(0, 256);
    try { menu = await fetchConditionalPublicMenu(qrCode, context, tag); } catch (error) {
      if (!(error instanceof ApiFault) || error.code !== "UNAUTHORIZED" || context.isNew) throw error;
      context = guestRequestContext(request, true, true);
      menu = await fetchConditionalPublicMenu(qrCode, context, tag);
    }
    const { etag, ...body } = menu;
    const response = 'notModified' in body ? new NextResponse(null, { status: 304 }) : apiSuccess(body);
    response.headers.set('ETag', etag);
    response.headers.set('Cache-Control', 'private, no-cache, must-revalidate');
    response.headers.set('Vary', 'Cookie');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    if (context.isNew) setGuestCookie(response, context);
    return response;
  } catch (error) { return menuFailure(error); }
  }, 'public.menu');
}
