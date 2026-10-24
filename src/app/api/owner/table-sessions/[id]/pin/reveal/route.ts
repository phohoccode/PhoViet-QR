import { apiFailure, apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { revealPinInput } from "@/lib/validations/table-sessions";
import { revealTablePin } from "@/server/table-sessions/service";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireApiOwner(); checkOrigin(request); noQuery(request);
    await readJson(request, revealPinInput);
    const response = apiSuccess(await revealTablePin(owner, (await context.params).id));
    response.headers.set("Vary", "Cookie, Origin"); return response;
  } catch (error) { const response = apiFailure(error); response.headers.set("Vary", "Cookie, Origin"); return response; }
}
