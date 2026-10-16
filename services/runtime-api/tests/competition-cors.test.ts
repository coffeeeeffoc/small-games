import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import type { createCompetitionStore } from '../src/competition/store.js';
import type { CompetitionControl } from '../src/competition/control.js';

it('applies the registered live policy to preflight and rate-limits before its database resolver', async () => {
  const app = Fastify();
  let origin = 'https://one.example',
    failed = false;
  const publicCors = vi.fn(async () => {
    if (failed) throw new Error('CONTROL_UNAVAILABLE');
    return {
      origins: [origin],
      methods: ['GET', 'POST', 'OPTIONS'],
      headers: ['authorization', 'content-type'],
      credentials: false,
      maxAge: 600,
    };
  });
  await registerCompetition(
    app,
    { guestSession: async () => ({}) } as unknown as ReturnType<typeof createCompetitionStore>,
    {},
    undefined,
    undefined,
    undefined,
    { publicCors } as unknown as CompetitionControl,
  );
  try {
    const preflight = () =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/competition/v1/me',
        headers: {
          origin: 'https://one.example',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
    expect((await preflight()).statusCode).toBe(204);
    expect(publicCors).toHaveBeenCalledTimes(1);
    origin = 'https://two.example';
    expect((await preflight()).statusCode).toBe(403);
    failed = true;
    expect((await preflight()).statusCode).toBe(503);
    failed = false;
    const before = publicCors.mock.calls.length;
    for (let i = 0; i < 20; i++)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/competition/v1/sessions/guest',
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
    expect(publicCors.mock.calls.length - before).toBe(20);
    expect(
      (await app.inject({ method: 'POST', url: '/api/competition/v1/sessions/guest', payload: {} }))
        .statusCode,
    ).toBe(429);
    expect(publicCors.mock.calls.length - before).toBe(20);
  } finally {
    await app.close();
  }
});

it('uses explicit public CORS origins before legacy fallback and never imports the management policy', async () => {
  for (const [env, allowed, denied] of [
    [
      {
        COMPETITION_CORS_ORIGINS: 'https://public.example',
        COMPETITION_ORIGINS: 'http://localhost:8080',
        ADMIN_CORS_ORIGINS: 'https://admin.nenggongzhiren.cn',
      },
      'https://public.example',
      'http://localhost:8080',
    ],
    [
      {
        COMPETITION_ORIGINS: 'http://localhost:8080',
        ADMIN_CORS_ORIGINS: 'https://admin.nenggongzhiren.cn',
      },
      'http://localhost:8080',
      'https://admin.nenggongzhiren.cn',
    ],
  ] as const) {
    const app = Fastify();
    await registerCompetition(app, {} as ReturnType<typeof createCompetitionStore>, env);
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/competition/v1/me',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
    try {
      expect((await preflight(allowed)).statusCode).toBe(204);
      expect(
        (await preflight(allowed)).headers['access-control-allow-credentials'],
      ).toBeUndefined();
      expect((await preflight(denied)).statusCode).toBe(403);
      expect((await preflight('https://admin.nenggongzhiren.cn')).statusCode).toBe(403);
    } finally {
      await app.close();
    }
  }
});
