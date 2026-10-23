import { tableQrFailure } from "@/server/qr/database";
import type { NextRequest } from "next/server";
import {
  ApiFault,
  apiSuccess,
  validate,
  checkOrigin,
  noQuery,
  readJson,
} from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { tablesQuery } from "@/lib/validations/table-sessions";
import { listManagedTables, createTable } from "@/server/tables/service";
import { createTableInput } from "@/lib/validations/table-qr";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const owner = await requireApiOwner();
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].length !== new Set(query.keys()).size)
      throw new ApiFault("VALIDATION_ERROR");
    const { tableId } = validate(tablesQuery, Object.fromEntries(query));
    return apiSuccess(await listManagedTables(owner, tableId));
  } catch (error) {
    return tableQrFailure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const owner = await requireApiOwner();
    checkOrigin(request); noQuery(request);
    return apiSuccess(await createTable(owner, await readJson(request, createTableInput)), 201);
  } catch (error) { return tableQrFailure(error); }
}
