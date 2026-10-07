import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createThreeChooseTwoStore } from './store.js';

type Store = ReturnType<typeof createThreeChooseTwoStore>;
const sessionId = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;

export function registerThreeChooseTwoRoutes(
  routes: FastifyInstance,
  store: Store,
  player: (authorization: string | undefined) => Promise<string>,
) {
  routes.post('/three-choose-two/session', { bodyLimit: 1024 }, async (request) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    return store.create(await player(request.headers.authorization));
  });
  routes.get('/three-choose-two/session/:id', async (request) =>
    store.get(await player(request.headers.authorization), sessionId(request.params)),
  );
  routes.post('/three-choose-two/session/:id/actions', { bodyLimit: 1024 }, async (request) => {
    const input = z
      .object({
        seq: z.number().int().positive().max(1_000_000),
        group: z.number().int().positive().max(500_001),
        slot: z.number().int().min(0).max(2),
        x: z.number().int().min(0).max(7),
        y: z.number().int().min(0).max(7),
      })
      .strict()
      .parse(request.body);
    return store.action(
      await player(request.headers.authorization),
      sessionId(request.params),
      input,
    );
  });
  routes.post('/three-choose-two/session/:id/finish', { bodyLimit: 1024 }, async (request) => {
    z.object({})
      .strict()
      .parse(request.body ?? {});
    return store.finish(await player(request.headers.authorization), sessionId(request.params));
  });
  routes.get('/three-choose-two/board', async (request) => {
    const { version } = z
      .object({
        version: z
          .string()
          .regex(/^[a-z0-9-]{1,80}$/)
          .optional(),
      })
      .strict()
      .parse(request.query);
    return store.board(await player(request.headers.authorization), version);
  });
}

export function registerThreeChooseTwoInternalRoutes(
  routes: FastifyInstance,
  store: Store,
  internal: (request: { ip: string; headers: Record<string, unknown> }) => void,
) {
  routes.get('/internal/three-choose-two/sessions/:id', async (request) => {
    internal(request);
    return store.audit(sessionId(request.params));
  });
  routes.post(
    '/internal/three-choose-two/sessions/:id/review',
    { bodyLimit: 2048 },
    async (request) => {
      internal(request);
      const { decision, reason } = z
        .object({ decision: z.enum(['approve', 'reject']), reason: z.string().min(1).max(200) })
        .strict()
        .parse(request.body);
      return store.review(sessionId(request.params), decision, reason);
    },
  );
}
