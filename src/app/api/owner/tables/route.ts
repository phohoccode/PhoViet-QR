import type { NextRequest } from "next/server";
import {
  ApiFault,
  apiFailure,
  apiSuccess,
  validate,
} from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { tablesQuery } from "@/lib/validations/table-sessions";
import { listOwnerTables } from "@/server/table-sessions/service";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const owner = await requireApiOwner();
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].length !== new Set(query.keys()).size)
      throw new ApiFault("VALIDATION_ERROR");
    const { tableId } = validate(tablesQuery, Object.fromEntries(query));
    return apiSuccess(await listOwnerTables(owner, tableId));
  } catch (error) {
    return apiFailure(error);
  }
}
