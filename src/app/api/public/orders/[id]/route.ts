import { withApiTrace } from "@/server/security/trace";
import type { NextRequest } from "next/server";
import { orderTrackingQuery } from "@/lib/validations/orders";
import { apiSuccess, ApiFault, validate } from "@/server/security/api";
import { guestRequestContext } from "@/server/security/request-context";
import { getGuestOrder } from "@/server/orders/service";
import { getTakeawayOrder } from "@/server/payments/service";
import { orderFailure } from "@/server/orders/database";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApiTrace(request, async () => {
    try {
      const entries = [...request.nextUrl.searchParams];
      if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new ApiFault("VALIDATION_ERROR");
      const { includePickup } = validate(orderTrackingQuery, Object.fromEntries(entries));
      const context = guestRequestContext(request, false);
      const id = (await params).id;
      return apiSuccess(await getTakeawayOrder(id, context, includePickup) ?? await getGuestOrder(id, context, includePickup));
    } catch (error) { return orderFailure(error); }
  });
}
