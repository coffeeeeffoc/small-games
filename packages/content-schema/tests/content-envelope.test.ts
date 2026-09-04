import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  dynamicContentEnvelopeSchema,
  validateContentEnvelope,
} from '@coffeeeeffoc/content-schema';

describe('Dynamic Content envelope', () => {
  it('validates a versioned payload', () => {
    const result = dynamicContentEnvelopeSchema.safeParse({
      gameId: 'cultivation',
      schemaVersion: 2,
      revision: 7,
      payload: { title: '山门初雪' },
    });

    expect(result.success).toBe(true);
  });

  it('returns field-level payload validation errors', () => {
    const result = validateContentEnvelope(z.object({ title: z.string().min(1) }), {
      gameId: 'cultivation',
      schemaVersion: 1,
      revision: 1,
      payload: { title: '' },
    });

    expect(result).toEqual({
      success: false,
      issues: [{ path: ['payload', 'title'], message: expect.any(String) }],
    });
  });
});
