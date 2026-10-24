import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, noQuery } from '@/server/security/api';
import { guestRequestContext } from '@/server/security/request-context';
import { getGuestSessionReceipt } from '@/server/table-sessions/billing';
import { withApiTrace } from '@/server/security/trace';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApiTrace(request, async () => {
    try {
      noQuery(request);
      const response = apiSuccess(await getGuestSessionReceipt((await params).id, guestRequestContext(request, false)));
      response.headers.set('Vary', 'Cookie, Origin'); return response;
    } catch (error) {
      const response = apiFailure(error); response.headers.set('Vary', 'Cookie, Origin'); return response;
    }
  });
}
