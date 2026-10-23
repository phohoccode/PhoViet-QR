import type { NextRequest } from "next/server";
import { ApiFault, apiSuccess, validate } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { ownerOrdersQuery } from "@/lib/validations/owner-orders";
import { getOwnerOrders } from "@/server/orders/owner-service";
import { orderFailure } from "@/server/orders/database";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const owner = await requireApiOwner(), params = new URL(request.url).searchParams;
    if ([...params.keys()].length !== new Set(params.keys()).size) throw new ApiFault("VALIDATION_ERROR");
    return apiSuccess(await getOwnerOrders(owner, validate(ownerOrdersQuery, Object.fromEntries(params))));
  } catch (error) { return orderFailure(error); }
}
