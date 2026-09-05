import { expect, it, vi } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import {
  canaryBucket,
  registerCatalog,
  CatalogUnavailable,
  type createCatalogStore,
} from '@coffeeeeffoc/runtime-api';

it('uses stable canary cohorts and guards the published-only HTTP boundary', async () => {
  expect(canaryBucket('player', 'cultivation')).toBe(canaryBucket('player', 'cultivation'));
  expect(canaryBucket('player', 'cultivation')).toBeGreaterThanOrEqual(0);
  expect(canaryBucket('player', 'cultivation')).toBeLessThan(100);
  const app = createService('runtime', {}, false);
  const session = vi
    .fn<ReturnType<typeof createCatalogStore>['session']>()
    .mockRejectedValue(new CatalogUnavailable());
  const origin = 'http://localhost:5173';
  await registerCatalog(
    app,
    { catalog: async () => [], session },
    { shellOrigin: origin, deliveryUrl: 'https://assets.example', canaryPercent: 10 },
  );
  try {
    expect((await app.inject('/api/runtime/catalog')).json()).toEqual([]);
    const input = {
      gameId: 'cultivation',
      playerId: crypto.randomUUID(),
      channel: 'stable',
      locale: 'zh-CN',
      capabilities: ['content'],
    };
    const post = (payload: object, source?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/runtime/sessions',
        headers: source ? { origin: source } : {},
        payload,
      });
    expect((await post(input)).statusCode).toBe(403);
    expect((await post({ ...input, adAuthority: 'host' }, origin)).statusCode).toBe(422);
    expect(session).not.toHaveBeenCalled();
    expect((await post(input, origin)).statusCode).toBe(409);
  } finally {
    await app.close();
  }
});
