import { expect, it, vi } from 'vitest';
import { createRuntimeService } from '@coffeeeeffoc/runtime-api';

it('rejects missing configuration rather than falling back to an owner credential', () => {
  expect(() => createRuntimeService({}, false)).toThrow();
});
it('starts independently and exposes live/degraded readiness on dependency failure', async () => {
  const app = createRuntimeService(
    { RUNTIME_DATABASE_URL: 'postgres://test:test@127.0.0.1:1/unavailable' },
    false,
  );
  try {
    expect((await app.inject('/health/live')).json()).toEqual({ service: 'runtime', status: 'ok' });
    expect((await app.inject('/health')).statusCode).toBe(503);
  } finally {
    await app.close();
  }
});

vi.mock('@coffeeeeffoc/service-kit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@coffeeeeffoc/service-kit')>();
  return { ...original, openDatabase: vi.fn(original.openDatabase) };
});
it.each(['player_game_access', 'game,family_id,family_expires_at', 'game,session_hash', null])(
  'readiness probes 014 schema permissions and fails closed when %s is unavailable',
  async (missing) => {
    const { openDatabase } = await import('@coffeeeeffoc/service-kit');
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const queries: string[] = [];
    vi.mocked(openDatabase).mockReturnValueOnce({
      db: {
        async execute(query: never) {
          const text = new PgDialect().sqlToQuery(query).sql;
          queries.push(text);
          if (missing && text.includes(missing)) throw new Error('missing migration or grant');
          return [];
        },
      },
      check: async () => {},
      close: async () => {},
    } as unknown as ReturnType<typeof openDatabase>);
    const app = createRuntimeService(
      {
        RUNTIME_DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:1/competition_test',
        COMPETITION_ENABLED: 'true',
      },
      false,
    );
    try {
      expect((await app.inject('/health')).statusCode).toBe(missing ? 503 : 200);
      if (!missing)
        for (const part of ['player_game_access', 'family_id', 'family_expires_at', 'session_hash'])
          expect(queries.some((query) => query.includes(part))).toBe(true);
    } finally {
      await app.close();
    }
  },
);
