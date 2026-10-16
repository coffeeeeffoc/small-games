import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  platformLoginSchema,
  verifiedPlatformSubject,
  type platformConfigSchema,
} from './platform-login.js';
import { profilePatchSchema } from './profile.js';
import { EPHEMERAL_GAMES, type PlayerAuth } from './auth.js';
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
    async (request) => {
      const input = z
        .union([
          z
            .object({
              installationId: z.uuid().optional(),
              identityVersion: z.literal(2).optional(),
            })
            .strict(),
          z
            .object({
              identityVersion: z.literal(2),
              identityMode: z.literal('ephemeral'),
              game: z.enum(EPHEMERAL_GAMES),
            })
            .strict(),
        ])
        .parse(request.body ?? {});
      return 'identityMode' in input
        ? store.guestSession(undefined, 2, input.game)
        : store.guestSession(input.installationId, input.identityVersion);
    },
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
      return store.session(
        input.platform,
        input.appId,
        await verifiedPlatformSubject(platforms, input),
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
        .object({ refreshToken: tokenSchema.optional() })
        .strict()
        .parse(request.body ?? {});
      if (refreshToken) return store.refreshSession(refreshToken);
      await player(request.headers.authorization);
      return store.renewGuestSession(request.headers.authorization!.slice(7));
    },
  );
  routes.post(
    '/sessions/upgrade',
    {
      bodyLimit: 4096,
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: (request) => request.ip },
      },
    },
    async (request) => {
      const input = platformLoginSchema.parse(request.body);
      await player(request.headers.authorization);
      const subject = await verifiedPlatformSubject(platforms, input);
      return store.upgrade(
        request.headers.authorization!.slice(7),
        input.platform,
        input.appId,
        subject,
      );
    },
  );
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
