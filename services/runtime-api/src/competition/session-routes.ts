import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  platformLoginSchema,
  verifiedPlatformSubject,
  type platformConfigSchema,
} from './platform-login.js';
import { profilePatchSchema } from './profile.js';
import type { PlayerAuth } from './auth.js';
import { CompetitionError } from './types.js';
import { guestSessionSchema } from './identity-store.js';
import type { createCompetitionStore } from './store.js';
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export function registerIdentityRoutes(
  routes: FastifyInstance,
  store: ReturnType<typeof createCompetitionStore>,
  platforms: z.infer<typeof platformConfigSchema>,
  player: (authorization: string | undefined) => Promise<PlayerAuth>,
) {
  routes.post(
    '/sessions/guest',
    {
      bodyLimit: 1024,
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: (request) => request.ip },
      },
    },
    async (request) => store.guestSession(guestSessionSchema.parse(request.body)),
  );
  routes.post(
    '/sessions/platform',
    {
      bodyLimit: 4096,
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: (request) => request.ip },
      },
    },
    async (request) => {
      const input = platformLoginSchema.parse(request.body);
      const previous = request.headers.authorization
        ? await player(request.headers.authorization)
        : undefined;
      return store.session(
        input.platform,
        input.appId,
        await verifiedPlatformSubject(platforms, input),
        input.game,
        previous,
      );
    },
  );
  routes.post(
    '/sessions/refresh',
    {
      bodyLimit: 1024,
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: (request) => request.ip },
      },
    },
    async (request) => {
      const { refreshToken } = z
        .object({ refreshToken: tokenSchema })
        .strict()
        .parse(request.body ?? {});
      return store.refreshSession(refreshToken);
    },
  );
  routes.post('/sessions/logout', { bodyLimit: 1024 }, async (request) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    if (!/^Bearer [a-f0-9]{64}$/.test(request.headers.authorization ?? ''))
      throw new CompetitionError('SESSION_EXPIRED', 401);
    return store.logout(request.headers.authorization!.slice(7));
  });
  routes.get('/me', async (request) => store.profile(await player(request.headers.authorization)));
  routes.post(
    '/me',
    { bodyLimit: 4096, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (request) => {
      const input = profilePatchSchema.parse(request.body);
      return store.profile(await player(request.headers.authorization), input);
    },
  );
}
