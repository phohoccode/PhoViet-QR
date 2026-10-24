import { withApiTrace } from "@/server/security/trace";
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { createOrderInput } from "@/lib/validations/orders";
import { apiSuccess, ApiFault, checkOrigin, noQuery, validate } from "@/server/security/api";
import { guestRequestContext } from "@/server/security/request-context";
import { createCustomerOrder, provisionPayment } from "@/server/payments/service";
import { orderFailure } from "@/server/orders/database";
export const runtime = "nodejs";

// R04 allows 64KiB. Phase2's generic reader is intentionally limited to 4KiB.
async function readOrder(request: NextRequest) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new ApiFault("VALIDATION_ERROR");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiFault("VALIDATION_ERROR");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 65536) { await reader.cancel(); throw new ApiFault("VALIDATION_ERROR"); }
      chunks.push(value);
    }
    return validate(createOrderInput, JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault("VALIDATION_ERROR");
  } finally { reader.releaseLock(); }
}
export async function POST(request: NextRequest) {
  return withApiTrace(request, async () => {
    try {
      checkOrigin(request); noQuery(request);
      const context = guestRequestContext(request, false);
      const input = await readOrder(request);
      const order = await createCustomerOrder(input, context);
      if (order.payment.kind === "takeaway") {
        const intentId = order.payment.intentId;
        after(() => provisionPayment(intentId));
      }
      return apiSuccess(order, 201);
    } catch (error) { return orderFailure(error); }
  });
}
