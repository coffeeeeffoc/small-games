import { describe, expect, it, vi } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import { Writable } from 'node:stream';

describe('service health', () => {
  it('exports request spans through the OpenTelemetry seam', async () => {
    const exportSpan = vi.fn();
    const app = createService('runtime', {}, false, { exportSpan });
    await app.inject({ url: '/health/live', headers: { 'x-game-session-id': 'session-1' } });
    await app.close();
    expect(exportSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        gameSessionId: 'session-1',
        method: 'GET',
        route: '/health/live',
        statusCode: 200,
      }),
    );
  });
  it('correlates Pino request logs with Game Sessions', async () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, done) {
        output += chunk.toString();
        done();
      },
    });
    const app = createService('runtime', {}, { stream });
    await app.inject({ url: '/health/live', headers: { 'x-game-session-id': 'session-1' } });
    await app.close();
    const records = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reqId: expect.any(String), gameSessionId: 'session-1' }),
      ]),
    );
  });
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
