import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import type { createCompetitionStore } from '../src/competition/store.js';

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
