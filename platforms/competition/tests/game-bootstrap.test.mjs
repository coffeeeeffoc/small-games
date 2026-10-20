import test from 'node:test';
import assert from 'node:assert/strict';
import { connectGameServices } from '../game-bootstrap.js';

test('normal startup creates game-scoped anonymous identity, reads metadata and never submits scores', async (t) => {
  const previous = globalThis.__COMPETITION_CONFIG__;
  t.after(() => {
    globalThis.__COMPETITION_CONFIG__ = previous;
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push([url, init.body && JSON.parse(init.body)]);
    const game = globalThis.__COMPETITION_CONFIG__.game;
    return {
      status: 200,
      json: async () =>
        url.endsWith('/sessions/guest')
          ? {
              game,
              playerId: game,
              identityKind: 'guest',
              token: 'a'.repeat(64),
              sessionId: '00000000-0000-4000-8000-000000000001',
              refreshToken: 'b'.repeat(64),
              expiresAt: Date.now() + 900000,
              refreshExpiresAt: Date.now() + 86400000,
            }
          : { game, capabilities: { identity: true, leaderboards: false }, boards: [] },
    };
  });
  for (const game of [
    'carding-car',
    'vibeJam-myself-history-guess',
    'wulong-city',
    'night-overwatch',
    'letters-words2',
  ]) {
    globalThis.__COMPETITION_CONFIG__ = {
      game,
      platform: 'h5',
      apiUrl: 'https://api.example.test/v1',
      competitionEnabled: true,
    };
    const bridge = connectGameServices();
    assert.equal(bridge.status, 'connecting');
    assert.equal((await bridge.ready).game, game);
    assert.equal(bridge.status, 'ready');
    assert.deepEqual(calls.at(-2)[1], { game });
  }
  assert(calls.every(([url]) => url.includes('/sessions/guest') || url.includes('/games/')));
  t.mock.method(globalThis, 'fetch', async () => {
    throw Error('offline');
  });
  const offline = connectGameServices();
  assert.equal(await offline.ready, undefined);
  assert.equal(offline.status, 'offline');
  globalThis.__COMPETITION_CONFIG__ = { competitionEnabled: false, apiUrl: '' };
  assert.equal(connectGameServices(), undefined);
});
