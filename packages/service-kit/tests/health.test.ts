import { describe, expect, it, vi } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';

describe('service health', () => {
  it('reports readiness and closes every dependency', async () => {
    const close = vi.fn();
    const app = createService('management', { database: { check: async () => {}, close } }, false);
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'management',
      status: 'ok',
      dependencies: { database: 'ok' },
    });
    await app.close();
    expect(close).toHaveBeenCalledOnce();
  });
  it('stays live but fails readiness without leaking dependency errors', async () => {
    const app = createService(
      'runtime',
      {
        database: {
          check: async () => {
            throw new Error('secret-url');
          },
          close() {},
        },
      },
      false,
    );
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret-url');
    expect(response.json().dependencies.database).toBe('unavailable');
    await app.close();
  });
  it('still closes other dependencies if one cleanup throws', async () => {
    const close = vi.fn();
    const app = createService(
      'management',
      {
        database: {
          check: async () => {},
          close() {
            throw new Error('cleanup');
          },
        },
        storage: { check: async () => {}, close },
      },
      false,
    );
    await app.ready();
    await app.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
