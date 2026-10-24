import { z } from 'zod';
import { resourceId } from './table-sessions';

export const patchOrderingSettingsInput = z.strictObject({
  requestId: resourceId,
  expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  acceptingOrders: z.boolean().optional(),
  acceptDineIn: z.boolean().optional(),
  acceptTakeaway: z.boolean().optional(),
}).refine(input => ['acceptingOrders', 'acceptDineIn', 'acceptTakeaway'].some(key => key in input));
