import type { NextRequest } from "next/server";
import { apiSuccess, ApiFault, checkOrigin, noQuery, readJson, validate } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { createMenuItemInput, ownerMenuQuery } from "@/lib/validations/menu";
import { createMenuItem, fetchOwnerMenu } from "@/server/menu/service";
import { menuFailure } from "@/server/menu/database";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const owner = await requireApiOwner();
    const entries = [...request.nextUrl.searchParams];
    if (entries.length > 1) throw new ApiFault("VALIDATION_ERROR");
    const { includeInactive } = validate(ownerMenuQuery, Object.fromEntries(entries));
    return apiSuccess(await fetchOwnerMenu(owner, includeInactive));
  } catch (error) { return menuFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); noQuery(request);
    const owner = await requireApiOwner();
    return apiSuccess(await createMenuItem(owner, await readJson(request, createMenuItemInput)), 201);
  } catch (error) { return menuFailure(error); }
}
