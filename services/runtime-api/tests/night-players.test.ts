import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import type { createCompetitionStore } from '../src/competition/store.js';

it('authenticates finite reads with the existing key without weakening the old loopback-only routes', async () => {
  const app = Fastify({ trustProxy: true });
  const key = 'test-only-night-player-internal-key';
  const list = vi.fn(async () => ({ items: [] })),
    detail = vi.fn(async () => ({}));
  await registerCompetition(
    app,
    { nightPlayers: { list, detail } } as unknown as ReturnType<typeof createCompetitionStore>,
    { COMPETITION_INTERNAL_KEY: key },
  );
  const url = '/api/competition/v1/internal/night-players/list';
  try {
    for (const options of [
      { remoteAddress: '172.20.0.6', headers: {} },
      { remoteAddress: '203.0.113.1', headers: { 'x-forwarded-for': '127.0.0.1' } },
      {
        remoteAddress: '172.20.0.6',
        headers: { 'x-competition-internal-key': 'x'.repeat(key.length) },
      },
    ])
      expect(
        (await app.inject({ method: 'POST', url, payload: { nickname: '测试' }, ...options }))
          .statusCode,
      ).toBe(403);
    expect(list).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          remoteAddress: '172.20.0.6',
          headers: { 'x-competition-internal-key': key },
          payload: { nickname: '测试' },
        })
      ).statusCode,
    ).toBe(200);
    expect(list).toHaveBeenCalledWith({ nickname: '测试' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/competition/v1/internal/control',
          remoteAddress: '172.20.0.6',
          headers: { 'x-competition-internal-key': key },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: url.replace('/list', '/detail'),
          headers: { 'x-competition-internal-key': key },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await app.close();
  }
});
