import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import { CompetitionError } from '../src/competition/types.js';
import type { createCompetitionStore } from '../src/competition/store.js';
import type { createThreeChooseTwoStore } from '../src/three-choose-two/store.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup() {
  const app = Fastify();
  apps.push(app);
  const identity = vi.fn(async () => 'verified-player');
  const action = vi.fn(async () => ({ seq: 1, state: { score: 0 } }));
  const finish = vi.fn(async () => ({ status: 'finished' }));
  const audit = vi.fn(async () => ({ actions: [] }));
  const store = { identity } as unknown as ReturnType<typeof createCompetitionStore>;
  const ranked = { action, finish, audit } as unknown as ReturnType<
    typeof createThreeChooseTwoStore
  >;
  await registerCompetition(
    app,
    store,
    { COMPETITION_INTERNAL_KEY: 'test-only-internal-key-0000000000000' },
    ranked,
  );
  return { app, identity, action, finish, audit };
}
const id = '33333333-3333-4333-8333-333333333333';
const path = `/api/competition/v1/three-choose-two/session/${id}`;
const headers = { authorization: `Bearer ${'a'.repeat(64)}` };

it('authenticates an ordered placement and passes only server-replay inputs', async () => {
  const { app, identity, action } = await setup();
  const input = { seq: 1, group: 1, slot: 0, x: 2, y: 3 };
  const response = await app.inject({
    method: 'POST',
    url: `${path}/actions`,
    headers,
    payload: input,
  });
  expect(response.statusCode).toBe(200);
  expect(identity).toHaveBeenCalledWith('a'.repeat(64));
  expect(action).toHaveBeenCalledWith('verified-player', id, input);
});
it.each([
  { seq: 1, group: 1, slot: 0, x: 2, y: 3, score: 999999 },
  { seq: 1, group: 1, slot: 0, x: 2, y: 3, shapeId: 'dot' },
  { seq: 1, group: 1, slot: 0, x: 2, y: 3, playerId: id },
  { seq: 1, group: 1, slot: 3, x: 2, y: 3 },
  { seq: 1, group: 1, slot: 0, x: -1, y: 3 },
])('rejects forged scoring, identities, candidates and bounds: %j', async (input) => {
  const { app, action } = await setup();
  const response = await app.inject({
    method: 'POST',
    url: `${path}/actions`,
    headers,
    payload: input,
  });
  expect(response.statusCode).toBe(422);
  expect(action).not.toHaveBeenCalled();
});
it('never accepts a claimed final score or an unauthenticated finish', async () => {
  const { app, finish } = await setup();
  expect(
    (await app.inject({ method: 'POST', url: `${path}/finish`, headers, payload: { score: 5000 } }))
      .statusCode,
  ).toBe(422);
  expect(
    (await app.inject({ method: 'POST', url: `${path}/finish`, payload: {} })).statusCode,
  ).toBe(401);
  expect(finish).not.toHaveBeenCalled();
});
it('reports store sequence conflicts without accepting another placement', async () => {
  const { app, action } = await setup();
  action.mockRejectedValueOnce(new CompetitionError('SEQUENCE_CONFLICT'));
  const response = await app.inject({
    method: 'POST',
    url: `${path}/actions`,
    headers,
    payload: { seq: 2, group: 1, slot: 0, x: 0, y: 0 },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toEqual({ error: 'SEQUENCE_CONFLICT' });
});
it('protects seed and replay audit with the existing loopback internal credential', async () => {
  const { app, audit } = await setup();
  const url = `/api/competition/v1/internal/three-choose-two/sessions/${id}`;
  expect((await app.inject({ url, headers })).statusCode).toBe(403);
  expect(
    (
      await app.inject({
        url,
        headers: { 'x-competition-internal-key': 'test-only-internal-key-0000000000000' },
        remoteAddress: '203.0.113.1',
      })
    ).statusCode,
  ).toBe(403);
  expect(audit).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        url,
        headers: { 'x-competition-internal-key': 'test-only-internal-key-0000000000000' },
      })
    ).statusCode,
  ).toBe(200);
  expect(audit).toHaveBeenCalledWith(id);
});
