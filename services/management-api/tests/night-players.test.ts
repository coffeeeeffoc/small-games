import { expect, it, vi } from 'vitest';
import { nightPlayerObservation, NIGHT_PLAYER_RESPONSE_BYTES } from '@coffeeeeffoc/service-kit';
import { readNightPlayers, validateNightPlayerConfig } from '../src/admin/night-players.js';
import { createControlService } from '../src/admin/control-service.js';
import { controlFixture } from './control.fixture.js';
import { adminFixture, origin } from './admin.fixture.js';

const response = {
  items: [],
  page: 1,
  pageSize: 50,
  total: 0,
  nextPage: null,
  observation: nightPlayerObservation,
};
it('bounds private fetches, rejects redirects/invalid responses, and never relays upstream errors or credentials', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json(response));
  const key = 'test-only-night-player-internal-key';
  expect(
    await readNightPlayers('http://runtime:43002', key, 'list', { nickname: 'x' }, request),
  ).toEqual(response);
  expect(request).toHaveBeenCalledWith(
    'http://runtime:43002/api/competition/v1/internal/night-players/list',
    expect.objectContaining({
      method: 'POST',
      redirect: 'error',
      signal: expect.any(AbortSignal),
      headers: { 'content-type': 'application/json', 'x-competition-internal-key': key },
    }),
  );
  await expect(
    readNightPlayers('http://runtime:43002', undefined, 'list', {}, request),
  ).rejects.toMatchObject({ code: 'NIGHT_PLAYERS_NOT_CONFIGURED' });
  for (const body of [
    { ...response, token: 'canary' },
    { ...response, items: [{ id: 'private' }] },
  ]) {
    request.mockResolvedValueOnce(Response.json(body));
    await expect(
      readNightPlayers('http://runtime:43002', key, 'list', {}, request),
    ).rejects.toMatchObject({ code: 'NIGHT_PLAYERS_UNAVAILABLE' });
  }
  request.mockResolvedValueOnce(new Response('canary-private-host-key', { status: 403 }));
  await expect(
    readNightPlayers('http://runtime:43002', key, 'list', {}, request),
  ).rejects.toMatchObject({ message: 'NIGHT_PLAYERS_UNAVAILABLE', status: 503 });
  request.mockResolvedValueOnce(new Response('x'.repeat(NIGHT_PLAYER_RESPONSE_BYTES + 1)));
  await expect(
    readNightPlayers('http://runtime:43002', key, 'list', {}, request),
  ).rejects.toMatchObject({ code: 'NIGHT_PLAYER_DATA_TOO_LARGE' });
  for (const env of [
    { ADMIN_RUNTIME_KEY: 'short' },
    { ADMIN_RUNTIME_ORIGIN: 'http://user:pass@runtime' },
  ])
    expect(() => validateNightPlayerConfig(env)).toThrow('Invalid management configuration');
});
it('requires canonical admin session, Origin/CSRF and control.read, and audits queries before returning data', async () => {
  const memory = await controlFixture();
  const control = createControlService(
    memory.store,
    origin,
    memory.now,
    'http://runtime:43002',
    'test-only-night-player-internal-key',
  );
  const f = await adminFixture(undefined, {}, undefined, control);
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(response));
  vi.stubGlobal('fetch', fetch);
  try {
    const { cookies } = await f.login();
    const session = (
      await f.app.inject({ url: '/api/session', headers: f.headers, cookies })
    ).json();
    const request = {
      method: 'POST' as const,
      url: '/api/control/night-players/query',
      cookies,
      payload: { nickname: '查询' },
    };
    expect((await f.app.inject({ ...request, headers: f.headers })).statusCode).toBe(403);
    const headers = { ...f.headers, origin, 'x-csrf-token': session.csrfToken };
    expect((await f.app.inject({ ...request, headers, payload: {} })).statusCode).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
    expect((await f.app.inject({ ...request, headers })).json()).toEqual(response);
    expect(
      memory
        .state()
        .audits.slice(-2)
        .map((a) => a.action),
    ).toEqual(['night.players.list.requested', 'night.players.list.read']);
    expect(JSON.stringify(memory.state().audits)).not.toContain(
      'test-only-night-player-internal-key',
    );
    const actor = memory.state().members[0]!;
    await memory.store.transaction((tx) => tx.putMember({ ...actor, roleIds: [] }));
    expect((await f.app.inject({ ...request, headers })).statusCode).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
    await f.app.close();
  }
});
