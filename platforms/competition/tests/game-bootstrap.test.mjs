import test from 'node:test';
import assert from 'node:assert/strict';
import { connectGameServices } from '../game-bootstrap.js';

test('normal startup creates game-scoped anonymous identity, reads metadata and never submits scores', async (t) => {
  const previous = globalThis.__COMPETITION_CONFIG__,
    previousStorage = globalThis.__nightStorage;
  const values = new Map();
  globalThis.__nightStorage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index],
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  t.after(() => {
    globalThis.__COMPETITION_CONFIG__ = previous;
    globalThis.__nightStorage = previousStorage;
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
  const respond = globalThis.fetch;
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
    if (game === 'night-overwatch') {
      const results = [];
      const removeThrowing = bridge.subscribeRequests(() => {
        throw Error('observer');
      });
      const unsubscribe = bridge.subscribeRequests((result) => results.push(result));
      await bridge.refresh();
      assert.deepEqual(results, [], 'metadata checks never notify or recurse');
      await bridge.services.listRooms();
      assert.deepEqual(results, [
        { path: '/games/night-overwatch/rooms', method: 'GET', playerId: game },
      ]);
      t.mock.method(globalThis, 'fetch', async () => ({
        status: 409,
        json: async () => ({ error: 'BUILD_DISABLED' }),
      }));
      await assert.rejects(bridge.services.match(), { code: 'BUILD_DISABLED' });
      assert.equal(results.at(-1).error, 'BUILD_DISABLED');
      assert.equal(results.at(-1).method, 'POST');
      const recorder = bridge.createRecorder('v8', {
        durable: { storage: globalThis.__nightStorage },
      });
      await recorder.start({ mode: 'campaign', levelId: 'first' });
      assert(
        results.some(
          (result) =>
            result.path === '/games/night-overwatch/runs' && result.error === 'BUILD_DISABLED',
        ),
        JSON.stringify({
          results,
          status: recorder.status,
          diagnostic: recorder.storageDiagnostic,
        }),
      );
      const count = results.length;
      unsubscribe();
      removeThrowing();
      await assert.rejects(bridge.services.listRooms());
      assert.equal(results.length, count);
      t.mock.method(globalThis, 'fetch', respond);
    }
  }
  assert(calls.every(([url]) => url.includes('/sessions/guest') || url.includes('/games/')));
  t.mock.method(globalThis, 'fetch', async () => {
    throw Error('offline');
  });
  const offline = connectGameServices();
  assert.equal(await offline.ready, undefined);
  assert.equal(offline.status, 'offline');
  t.mock.method(globalThis, 'fetch', async () => ({
    status: 200,
    json: async () => ({ game: 'letters-words2', capabilities: { identity: true }, boards: [] }),
  }));
  assert.equal((await offline.refresh()).game, 'letters-words2');
  assert.equal(offline.status, 'ready');
  globalThis.__COMPETITION_CONFIG__ = { competitionEnabled: false, apiUrl: '' };
  assert.equal(connectGameServices(), undefined);
});
