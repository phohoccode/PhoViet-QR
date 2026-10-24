import type { NextRequest } from 'next/server';
import { apiFailure, apiSuccess, checkOrigin, noQuery, readJson } from '@/server/security/api';
import { requireApiOwner } from '@/server/security/owner';
import { withApiTrace } from '@/server/security/trace';
import { patchOrderingSettingsInput } from '@/lib/validations/ordering-settings';
import { getOrderingSettings, patchOrderingSettings } from '@/server/settings/ordering';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  return withApiTrace(request, async () => {
    try { noQuery(request); return apiSuccess(await getOrderingSettings(await requireApiOwner())); }
    catch (error) { return apiFailure(error); }
  }, 'owner.ordering');
}
export async function PATCH(request: NextRequest) {
  return withApiTrace(request, async () => {
    try {
      checkOrigin(request); noQuery(request);
      const owner = await requireApiOwner();
      return apiSuccess(await patchOrderingSettings(owner, await readJson(request, patchOrderingSettingsInput)));
    } catch (error) { return apiFailure(error); }
  }, 'owner.ordering');
}
