import { apiFailure, apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { rotatePinInput } from "@/lib/validations/table-sessions";
import { rotateTablePin } from "@/server/table-sessions/service";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireApiOwner(); checkOrigin(request); noQuery(request);
    const response = apiSuccess(await rotateTablePin(owner, (await context.params).id, await readJson(request, rotatePinInput)));
    response.headers.set("Vary", "Cookie, Origin"); return response;
  } catch (error) { const response = apiFailure(error); response.headers.set("Vary", "Cookie, Origin"); return response; }
}
