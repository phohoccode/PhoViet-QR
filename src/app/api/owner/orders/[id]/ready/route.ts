import { apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { readyOrderInput } from "@/lib/validations/owner-orders";
import { markOwnerOrderReady } from "@/server/orders/owner-service";
import { orderFailure } from "@/server/orders/database";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireApiOwner();
    checkOrigin(request); noQuery(request);
    return apiSuccess(await markOwnerOrderReady(owner, (await context.params).id, await readJson(request, readyOrderInput)));
  } catch (error) { return orderFailure(error); }
}
