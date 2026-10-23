import type { NextRequest } from "next/server";
import { apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { createCategoryInput } from "@/lib/validations/menu";
import { createCategory, fetchCategories } from "@/server/menu/service";
import { menuFailure } from "@/server/menu/database";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { noQuery(request); return apiSuccess(await fetchCategories(await requireApiOwner())); }
  catch (error) { return menuFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); noQuery(request);
    const owner = await requireApiOwner();
    return apiSuccess(await createCategory(owner, await readJson(request, createCategoryInput)), 201);
  } catch (error) { return menuFailure(error); }
}
