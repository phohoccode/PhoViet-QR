import { apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { completeOrderInput } from "@/lib/validations/owner-orders";
import { completeOwnerOrder } from "@/server/orders/owner-service";
import { orderFailure } from "@/server/orders/database";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireApiOwner();
    checkOrigin(request); noQuery(request);
    return apiSuccess(await completeOwnerOrder(owner, (await context.params).id, await readJson(request, completeOrderInput)));
  } catch (error) { return orderFailure(error); }
}
