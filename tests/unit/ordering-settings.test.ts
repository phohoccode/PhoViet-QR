import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { ApiFault } from '../../src/server/security/api';
import { patchOrderingSettingsInput } from '../../src/lib/validations/ordering-settings';

const mocks = vi.hoisted(() => ({ owner: vi.fn(), get: vi.fn(), patch: vi.fn() }));
vi.mock('@/server/security/owner', () => ({ requireApiOwner: mocks.owner }));
vi.mock('@/server/settings/ordering', () => ({ getOrderingSettings: mocks.get, patchOrderingSettings: mocks.patch }));
import { GET, PATCH } from '../../src/app/api/owner/settings/ordering/route';
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const origin = 'https://local.test';
const input = () => ({ requestId: randomUUID(), expectedVersion: 1, acceptTakeaway: false });

it('requires owner context and origin, rejects tenant injection, and does not call a mutation on invalid input', async () => {
  vi.stubEnv('APP_ORIGIN', origin);
  mocks.owner.mockResolvedValue({ authUserId: randomUUID(), storeId: randomUUID() });
  const request = (body: object, from = origin) => new NextRequest(`${origin}/api/owner/settings/ordering`, { method: 'PATCH', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect((await PATCH(request(input(), 'https://untrusted.test'))).status).toBe(403);
  expect((await PATCH(request({ ...input(), storeId: randomUUID() }))).status).toBe(400);
  expect(mocks.patch).not.toHaveBeenCalled();
  const command = input(); mocks.patch.mockResolvedValue({ acceptTakeaway: false });
  expect((await PATCH(request(command))).status).toBe(200);
  expect(mocks.patch).toHaveBeenCalledWith(await mocks.owner.mock.results[0].value, command);
});
it('settings errors are private and 429 carries the real bounded retry interval', async () => {
  mocks.owner.mockRejectedValue(new ApiFault('UNAUTHORIZED'));
  expect((await GET(new NextRequest(`${origin}/api/owner/settings/ordering`))).status).toBe(401);
  mocks.owner.mockResolvedValue({ authUserId: randomUUID(), storeId: randomUUID() });
  mocks.get.mockRejectedValue(new ApiFault('RATE_LIMITED', { retryAfterSeconds: 7 }));
  const response = await GET(new NextRequest(`${origin}/api/owner/settings/ordering`));
  expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('7');
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED', details: { retryAfterSeconds: 7 } } });
});
it('ordering commands require version, request identity and at least one boolean change', () => {
  expect(patchOrderingSettingsInput.safeParse(input()).success).toBe(true);
  for (const value of [{ requestId: randomUUID(), expectedVersion: 1 }, { ...input(), expectedVersion: 0 }, { ...input(), acceptTakeaway: 'false' }, { ...input(), acceptTakeaway: null }, { ...input(), expectedVersion: undefined }, { ...input(), requestId: undefined }]) {
    expect(patchOrderingSettingsInput.safeParse(value).success).toBe(false);
  }
});
