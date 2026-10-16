import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import type { createCompetitionStore } from '../src/competition/store.js';
import type { CompetitionControl } from '../src/competition/control.js';
import { CompetitionError } from '../src/competition/types.js';

it('exposes only Kart policy on the existing private key/peer channel and rejects stale acknowledgements', async () => {
  const app = Fastify(),
    key = 'k'.repeat(32);
  const observeKart = vi.fn(async (input: { version: number }) => {
      if (input.version !== 3) throw new CompetitionError('CONTROL_VERSION_CHANGED');
    }),
    kartLease = vi.fn(async () => ({
      controlEnabled: true,
      gameId: 'carding-car',
      state: 'enabled',
      killEpoch: 2,
      version: 3,
      digest: 'a'.repeat(64),
      validForMs: 2000,
    }));
  const control = {
    publicCors: async () => ({
      origins: [],
      methods: ['GET', 'POST', 'OPTIONS'],
      headers: ['authorization', 'content-type'],
      credentials: false,
      maxAge: 600,
    }),
    kartLease,
    observeKart,
  } as unknown as CompetitionControl;
  await registerCompetition(
    app,
    {} as ReturnType<typeof createCompetitionStore>,
    { COMPETITION_INTERNAL_KEY: key },
    undefined,
    undefined,
    undefined,
    control,
  );
  try {
    const url = '/api/competition/v1/internal/control';
    expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          remoteAddress: '203.0.113.1',
          headers: { 'x-competition-internal-key': key },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(kartLease).not.toHaveBeenCalled();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { 'x-competition-internal-key': key },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().gameId).toBe('carding-car');
    expect(response.body).not.toMatch(/members|roles|permissions|apiOrigins|subject/);
    const acknowledgement = '/api/competition/v1/internal/control-observation';
    const stale = await app.inject({
      method: 'POST',
      url: acknowledgement,
      headers: { 'x-competition-internal-key': key },
      payload: { instanceId: 'kart-primary', version: 2, digest: 'a'.repeat(64) },
    });
    expect(stale.statusCode).toBe(409);
    expect(observeKart).toHaveBeenCalledTimes(1);
    const current = await app.inject({
      method: 'POST',
      url: acknowledgement,
      headers: { 'x-competition-internal-key': key },
      payload: { instanceId: 'kart-primary', version: 3, digest: 'a'.repeat(64) },
    });
    expect(current.statusCode).toBe(200);
    expect(observeKart).toHaveBeenCalledWith({
      instanceId: 'kart-primary',
      version: 3,
      digest: 'a'.repeat(64),
    });
  } finally {
    await app.close();
  }
});
