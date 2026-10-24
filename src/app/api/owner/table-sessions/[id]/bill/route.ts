import { apiFailure, apiSuccess, noQuery } from "@/server/security/api";
import { requireApiOwner } from "@/server/security/owner";
import { getOwnerSessionBill } from "@/server/table-sessions/billing";
import { withApiTrace } from "@/server/security/trace";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApiTrace(request, async () => {
    try {
      const owner = await requireApiOwner(); noQuery(request);
      const response = apiSuccess(await getOwnerSessionBill(owner, (await context.params).id));
      response.headers.set("Vary", "Cookie, Origin"); return response;
    } catch (error) { const response = apiFailure(error); response.headers.set("Vary", "Cookie, Origin"); return response; }
  });
}
