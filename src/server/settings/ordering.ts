import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { OrderingSettingsView, PatchOrderingSettingsInput, ApiErrorCode } from '@contracts';
import type { OwnerContext } from '@/server/auth/verify-owner';
import { getClientEnv } from '@/lib/env/client';
import { getServerEnv } from '@/lib/env/server';
import { ApiFault, validate } from '@/server/security/api';
import { patchOrderingSettingsInput } from '@/lib/validations/ordering-settings';

const known = new Set<ApiErrorCode>(['FORBIDDEN', 'VALIDATION_ERROR', 'INVALID_STATE_TRANSITION', 'DUPLICATE_REQUEST_CONFLICT', 'RATE_LIMITED']);
async function execute(owner: OwnerContext, action: 'get' | 'patch', command = {}): Promise<OrderingSettingsView> {
  try {
    const client = createClient(getClientEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await client.rpc('p6_ordering_execute', { action, input: { ...command, storeId: owner.storeId, ownerId: owner.authUserId } });
    if (error || !data || typeof data !== 'object') throw new ApiFault('INTERNAL_ERROR');
    if (data.error) throw new ApiFault(known.has(data.error) ? data.error : 'INTERNAL_ERROR', data.error === 'RATE_LIMITED'
      ? { retryAfterSeconds: Math.max(1, Math.min(60, Number(data.retryAfterSeconds) || 60)) } : undefined);
    if (!data.data || data.data.storeId !== owner.storeId) throw new ApiFault('INTERNAL_ERROR');
    return data.data;
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault('INTERNAL_ERROR');
  }
}
export const getOrderingSettings = (owner: OwnerContext) => execute(owner, 'get');
export const patchOrderingSettings = (owner: OwnerContext, input: PatchOrderingSettingsInput) => execute(owner, 'patch', validate(patchOrderingSettingsInput, input));
