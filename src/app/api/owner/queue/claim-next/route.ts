import { apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { claimNextInput } from "@/lib/validations/owner-orders";
import { claimNextOrder } from "@/server/orders/owner-service";
import { orderFailure } from "@/server/orders/database";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const owner = await requireApiOwner();
    checkOrigin(request); noQuery(request);
    return apiSuccess(await claimNextOrder(owner, await readJson(request, claimNextInput)));
  } catch (error) { return orderFailure(error); }
}
