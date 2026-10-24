import { apiFailure, apiSuccess, checkOrigin, noQuery, readJson } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { settleSession } from "@/server/table-sessions/billing";
import { settleSessionInput } from "@/lib/validations/session-billing";
import { withApiTrace } from "@/server/security/trace";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApiTrace(request, async () => {
    try {
      const owner = await requireApiOwner(); checkOrigin(request); noQuery(request);
      const response = apiSuccess(await settleSession(owner, (await context.params).id, await readJson(request, settleSessionInput)));
      response.headers.set("Vary", "Cookie, Origin"); return response;
    } catch (error) { const response = apiFailure(error); response.headers.set("Vary", "Cookie, Origin"); return response; }
  });
}
