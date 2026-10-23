import type { NextRequest } from "next/server";
import {
  apiFailure,
  apiSuccess,
  checkOrigin,
  noQuery,
  readJson,
} from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { openSessionInput } from "@/lib/validations/table-sessions";
import { openTableSession } from "@/server/table-sessions/service";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    noQuery(request);
    const owner = await requireApiOwner();
    const input = await readJson(request, openSessionInput);
    return apiSuccess(
      await openTableSession(owner, (await params).id, input),
      201,
    );
  } catch (error) {
    return apiFailure(error);
  }
}
