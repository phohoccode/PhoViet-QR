import { withApiTrace } from "@/server/security/trace";
import type { NextRequest } from "next/server";
import { apiSuccess, noQuery } from "@/server/security/api";
import { orderFailure } from "@/server/orders/database";
import { reconcilePayments, verifyReconcileSecret } from "@/server/payments/service";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return withApiTrace(request, async () => {
    try {
      noQuery(request); verifyReconcileSecret(request);
      return apiSuccess(await reconcilePayments());
    } catch (error) { return orderFailure(error); }
  });
}
