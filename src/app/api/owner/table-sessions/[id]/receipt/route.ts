import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, noQuery } from '@/server/security/api';
import { requireApiOwner } from '@/server/security/owner';
import { getOwnerSessionReceipt } from '@/server/table-sessions/billing';
import { withApiTrace } from '@/server/security/trace';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApiTrace(request, async () => { try {
    noQuery(request);
    return apiSuccess(await getOwnerSessionReceipt(await requireApiOwner(), (await params).id));
  } catch (error) { return apiFailure(error); } });
}
