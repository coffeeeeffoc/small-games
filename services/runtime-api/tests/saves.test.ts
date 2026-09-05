import { expect, it, vi } from 'vitest';

import { createService } from '@coffeeeeffoc/service-kit';
import { registerSaves, SaveConflict, type createSaveStore } from '@coffeeeeffoc/runtime-api';

it('scopes conditional cloud saves to the server-issued Game Session', async () => {
  const read = vi.fn<ReturnType<typeof createSaveStore>['read']>().mockResolvedValue({
    value: { cultivationChapter: 2 },
    version: '4',
  });
  const write = vi
    .fn<ReturnType<typeof createSaveStore>['write']>()
    .mockResolvedValueOnce({ value: { cultivationChapter: 3 }, version: '5' })
    .mockRejectedValueOnce(new SaveConflict('5'));
  const app = createService('runtime', {}, false);
  const origin = 'http://localhost:5173';
  await registerSaves(app, { read, write }, origin);
  const headers = { origin, 'x-game-session-id': crypto.randomUUID() };

  try {
    const loaded = await app.inject({
      method: 'GET',
      url: '/api/runtime/saves/bili-pocket-arcade%3Av1',
      headers,
    });
    expect(loaded.json()).toEqual({ value: { cultivationChapter: 2 }, version: '4' });
    expect(read).toHaveBeenCalledWith(headers['x-game-session-id'], 'bili-pocket-arcade:v1');

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/runtime/saves/bili-pocket-arcade%3Av1',
      headers,
      payload: { value: { cultivationChapter: 3 }, expectedVersion: '4' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ value: { cultivationChapter: 3 }, version: '5' });
    expect(write).toHaveBeenCalledWith(
      headers['x-game-session-id'],
      'bili-pocket-arcade:v1',
      { cultivationChapter: 3 },
      '4',
    );

    const unconditional = await app.inject({
      method: 'PUT',
      url: '/api/runtime/saves/bili-pocket-arcade%3Av1',
      headers,
      payload: { value: { cultivationChapter: 99 } },
    });
    expect(unconditional.statusCode).toBe(422);
    expect(write).toHaveBeenCalledTimes(1);

    const conflict = await app.inject({
      method: 'PUT',
      url: '/api/runtime/saves/bili-pocket-arcade%3Av1',
      headers,
      payload: { value: { cultivationChapter: 1 }, expectedVersion: '4' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: 'SAVE_CONFLICT', actualVersion: '5' });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/runtime/saves/save',
          headers: { 'x-game-session-id': headers['x-game-session-id'] },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});
