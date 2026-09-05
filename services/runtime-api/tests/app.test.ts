import { expect, it } from 'vitest';
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
