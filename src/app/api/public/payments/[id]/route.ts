import { withApiTrace } from "@/server/security/trace";
import type { NextRequest } from "next/server";
import { apiSuccess, noQuery } from "@/server/security/api";
import { guestRequestContext } from "@/server/security/request-context";
import { orderFailure } from "@/server/orders/database";
import { getCustomerPayment } from "@/server/payments/service";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApiTrace(request, async () => {
    try {
      noQuery(request);
      return apiSuccess(await getCustomerPayment((await params).id, guestRequestContext(request, false)));
    } catch (error) { return orderFailure(error); }
  });
}
