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
    const response = apiSuccess(
      await openTableSession(owner, (await params).id, input),
      201,
    );
    response.headers.set("Vary", "Cookie, Origin");
    return response;
  } catch (error) {
    const response = apiFailure(error);
    response.headers.set("Vary", "Cookie, Origin");
    return response;
  }
}
