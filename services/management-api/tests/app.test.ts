import { expect, it } from 'vitest';
import { createManagementService } from '@coffeeeeffoc/management-api';

it('rejects missing configuration rather than falling back to an owner credential', () => {
  expect(() => createManagementService({}, false)).toThrow();
});
it('starts independently and exposes live/degraded readiness on dependency failure', async () => {
  const app = createManagementService(
    {
      STUDIO_ORIGIN: 'http://127.0.0.1:5174',
      MANAGEMENT_DATABASE_URL: 'postgres://test:test@127.0.0.1:1/unavailable',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      S3_BUCKET: 'test',
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
    },
    false,
  );
  try {
    expect((await app.inject('/health/live')).json()).toEqual({
      service: 'management',
      status: 'ok',
    });
    expect((await app.inject('/health')).statusCode).toBe(503);
  } finally {
    await app.close();
  }
});
