import { expect, it } from 'vitest';
import { sessionRequestSchema } from '@coffeeeeffoc/release-contract';

it('accepts fixed version requests but rejects client-selected advertising authority and duplicate capabilities', () => {
  const request = {
    gameId: 'cultivation',
    playerId: crypto.randomUUID(),
    channel: 'canary',
    locale: 'zh-CN',
    capabilities: ['content', 'storage'],
    versionId: 'a'.repeat(64),
  };
  expect(sessionRequestSchema.parse(request)).toEqual(request);
  expect(sessionRequestSchema.safeParse({ ...request, adAuthority: 'host' }).success).toBe(false);
  expect(
    sessionRequestSchema.safeParse({ ...request, capabilities: ['storage', 'storage'] }).success,
  ).toBe(false);
});
