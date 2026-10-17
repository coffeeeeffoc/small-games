import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServices, createRunRecorder } from '../game-services.js';
const defer = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
function recorderFixture(options = {}) {
  const calls = [],
    statuses = [];
  let count = 0;
  const services = {
    startRun: async () => ({ id: `run-${++count}`, seq: 0, seed: 42 }),
    appendFrames: async (input) => {
      calls.push(['append', structuredClone(input)]);
    },
    finishRun: async (input) => {
      calls.push(['finish', input]);
      return { accepted: true };
    },
    discardRun: (id) => calls.push(['discard', id]),
    ...options,
  };
  const recorder = createRunRecorder(services, {
    onStatus: (status) => statuses.push(status),
    startTimeoutMs: 15,
  });
  return { recorder, services, calls, statuses };
}
const credential = (letter = 'a', expiresAt = Date.now() + 900000, game = 'tower-brake') => ({
  userId: letter,
  playerId: letter,
  identityKind: 'guest',
  game,
  sessionId: `${letter.repeat(8)}-0000-4000-8000-000000000001`,
  token: letter.repeat(64),
  refreshToken: 'f'.repeat(64),
  refreshExpiresAt: Date.now() + 86400000,
  expiresAt,
  apiAuthority: `/api/competition/v1|h5||${game}`,
});
function authFixture(t, { initial = JSON.stringify(credential()), config = {} } = {}) {
  const old = Object.fromEntries(
    ['localStorage', '__competition', '__COMPETITION_CONFIG__', 'wx'].map((key) => [
      key,
      globalThis[key],
    ]),
  );
  t.after(() => Object.assign(globalThis, old));
  let storage = initial,
    sequence = 0;
  const calls = [],
    writes = [];
  globalThis.__COMPETITION_CONFIG__ = config;
  globalThis.localStorage = {
    getItem: () => storage,
    setItem: (_key, value) => {
      storage = value;
      writes.push(value);
    },
  };
  const fixture = {
    calls,
    writes,
    fresh: credential('c'),
    login: null,
    setStorage(value) {
      storage = value;
    },
    get storage() {
      return storage;
    },
    respond: async (url, init) => {
      calls.push({
        url,
        token: init.headers?.authorization,
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      if (url.includes('/sessions/')) return fixture.login ? fixture.login() : fixture.fresh;
      if (url.endsWith('/runs')) return { id: 'run-' + ++sequence, version: 'v1' };
      if (url.endsWith('/finish')) return { accepted: true };
      if (url.includes('/rooms')) return { code: 'ABCDEF123456' };
      return { identity: { kind: 'account' }, top: [], me: { rank: 1 } };
    },
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => ({
    status: 200,
    json: async () => fixture.respond(url, init),
  }));
  return fixture;
}
test('first guest reads and writes automatically share one scoped credential', async (t) => {
  const f = authFixture(t, { initial: null }),
    api = createGameServices({ gameId: 'tower-brake', ruleVersion: 'v1' });
  for (const operation of [
    () => api.metadata(),
    () => api.identity(),
    () => api.listBoards(),
    () => api.leaderboard({ boardId: 'endless' }),
    () => api.startRun({ mode: 'endless' }),
    () => api.createRoom(),
  ])
    await operation();
  assert.equal(f.calls.filter((c) => c.url.includes('/sessions/guest')).length, 1);
  assert(
    f.calls
      .filter((c) => !c.url.includes('/sessions/'))
      .every((c) => c.token === 'Bearer ' + 'c'.repeat(64)),
  );
  const same = createGameServices({ gameId: 'tower-brake', ruleVersion: 'v1' });
  await same.session();
  assert.equal(f.calls.filter((c) => c.url.includes('/sessions/')).length, 1);
  f.fresh = credential('d', Date.now() + 900000, 'cage-rescue');
  const other = createGameServices({ gameId: 'cage-rescue' });
  assert.equal((await other.session()).userId, 'd');
});
test('switching accounts rejects old runs and rooms before sending any mutation', async (t) => {
  const f = authFixture(t),
    api = createGameServices({ gameId: 'tower-brake', ruleVersion: 'v1' });
  const run = await api.startRun({ mode: 'endless' }),
    room = await api.createRoom();
  f.setStorage(JSON.stringify(credential('b')));
  const count = f.calls.length;
  await assert.rejects(api.appendFrames({ runId: run.id, seq: 1, frames: [] }), {
    code: 'SESSION_CHANGED',
  });
  await assert.rejects(api.roomAction({ code: room.code, operation: 'rematch' }), {
    code: 'SESSION_CHANGED',
  });
  assert.equal(f.calls.length, count);
});
test('late room and run responses cannot populate caches after logout', async (t) => {
  const f = authFixture(t),
    gate = defer(),
    api = createGameServices({ gameId: 'tower-brake', ruleVersion: 'v1' });
  const respond = f.respond;
  f.respond = (url, init) => (url.endsWith('/rooms') ? gate.promise : respond(url, init));
  const pending = api.createRoom();
  await turn();
  await api.logout();
  gate.resolve({ code: 'ABCDEF123456' });
  await assert.rejects(pending, { code: 'SESSION_CHANGED' });
  assert.equal(f.storage, '');
});
test('journal preserves zero-tick actions, compresses held input and finishes once', async () => {
  const { recorder, calls } = recorderFixture();
  assert.equal((await recorder.start({ mode: 'campaign', levelId: 'first' })).seed, 42);
  recorder.record({ rotation: 1 }, 0);
  recorder.record({ brake: true }, 0);
  recorder.record({}, 1);
  recorder.record({}, 1);
  const first = recorder.finish(),
    second = recorder.finish();
  assert.equal(first, second);
  assert.deepEqual(await first, { accepted: true });
  assert.deepEqual(calls[0][1].frames, [
    { input: { rotation: 1 }, ticks: 0 },
    { input: { brake: true }, ticks: 0 },
    { input: {}, ticks: 2 },
  ]);
  assert.equal(calls.filter(([kind]) => kind === 'finish').length, 1);
});
test('finishing result survives immediate next run without overwriting its status', async () => {
  const gate = defer();
  const { recorder, calls, statuses } = recorderFixture({
    appendFrames: async (input) => {
      calls.push(['append', input]);
      await gate.promise;
    },
  });
  await recorder.start({ mode: 'endless' });
  recorder.record({}, 1);
  const done = recorder.finish();
  await recorder.start({ mode: 'endless' });
  gate.resolve();
  assert.deepEqual(await done, { accepted: true });
  assert.equal(calls.find(([kind]) => kind === 'finish')[1].runId, 'run-1');
  assert.equal(recorder.status, 'recording');
  assert.equal(statuses.at(-1), 'recording');
});
test('timeout and cancellation discard late runs; practice creates no run', async () => {
  const gate = defer();
  const { recorder, calls } = recorderFixture({ startRun: () => gate.promise });
  assert.equal(await recorder.start({ mode: 'endless' }), null);
  gate.resolve({ id: 'late', seed: 123 });
  await turn();
  assert(calls.some(([kind, id]) => kind === 'discard' && id === 'late'));
  assert.equal(recorder.status, 'unavailable');
  assert.equal(await recorder.start({ mode: 'endless', practice: true }), null);
  assert.equal(recorder.status, 'practice');
});
test('temporary network retry preserves sequence and payload; expired identity is never retried', async () => {
  let attempts = 0;
  const requests = [];
  const { recorder } = recorderFixture({
    appendFrames: async (input) => {
      requests.push(structuredClone(input));
      if (++attempts === 1)
        throw Object.assign(new Error('offline'), { code: 'SERVICE_UNAVAILABLE' });
    },
  });
  await recorder.start({ mode: 'endless' });
  recorder.record({}, 1);
  await recorder.finish();
  assert.deepEqual(requests[0], requests[1]);
  const expired = recorderFixture({
    appendFrames: async () => {
      attempts++;
      throw Object.assign(new Error('expired'), { code: 'SESSION_EXPIRED' });
    },
  });
  await expired.recorder.start({ mode: 'endless' });
  expired.recorder.record({}, 1);
  assert.equal(await expired.recorder.finish(), null);
  assert.equal(attempts, 3);
  assert.equal(expired.recorder.status, 'unavailable');
});
test('a blocked network has a bounded journal and cannot retain an endless history', async () => {
  const gate = defer();
  const { recorder } = recorderFixture({ appendFrames: () => gate.promise });
  await recorder.start({ mode: 'endless' });
  for (let index = 0; index < 2500; index++) recorder.record({ rotation: index }, 0);
  assert.equal(recorder.status, 'unavailable');
  assert.equal(await recorder.finish(), null);
  gate.resolve();
  await turn();
  assert.equal(recorder.status, 'unavailable');
});

test('cached credentials cannot bypass missing native configuration', async (t) => {
  const fixture = authFixture(t, {
    initial: JSON.stringify(credential('a')),
    config: { platform: 'wechat', appId: 'wx-test' },
  });
  await assert.rejects(
    createGameServices({ gameId: 'tower-brake', ruleVersion: 'v1' }).startRun({ mode: 'endless' }),
    { code: 'PLATFORM_LOGIN_UNAVAILABLE' },
  );
  assert.equal(fixture.calls.length, 0);
});
test('ranked start binds the artifact version and rejects incompatible or missing server versions before uploads', async (t) => {
  for (const [client, server] of [
    ['v1', 'v1'],
    ['v1', 'v2'],
    ['v2', 'v1'],
    ['v1', undefined],
    ['v1', ''],
    ['v1', null],
  ])
    await t.test(`${client}/${server}`, async (t) => {
      const fixture = authFixture(t);
      const respond = fixture.respond;
      fixture.respond = async (url, init) => ({
        ...(await respond(url, init)),
        ...(url.endsWith('/runs') ? { version: server, seed: 73 } : {}),
      });
      const services = createGameServices({ gameId: 'tower-brake', ruleVersion: client });
      const statuses = [];
      const recorder = createRunRecorder(services, { onStatus: (status) => statuses.push(status) });
      const run = await recorder.start({ mode: 'campaign', levelId: 'first-brake' });
      assert.deepEqual(fixture.calls.at(-1).body, {
        board: 'campaign',
        levelId: 'first-brake',
        version: client,
      });
      recorder.record({ rotation: 0.2 }, 0);
      if (client === server) {
        assert.equal(run.seed, 73);
        assert.deepEqual(await recorder.finish(), { accepted: true });
        assert.equal(recorder.status, 'finished');
        assert.ok(fixture.calls.some(({ url }) => url.endsWith('/actions')));
        assert.ok(fixture.calls.some(({ url }) => url.endsWith('/finish')));
      } else {
        assert.equal(run, null);
        assert.equal(recorder.status, 'update-required');
        assert.ok(!statuses.includes('recording'));
        assert.equal(await recorder.finish(), null);
        await assert.rejects(services.finishRun({ runId: 'run-1', seq: 0 }), {
          code: 'SESSION_EXPIRED',
        });
        assert.ok(!fixture.calls.some(({ url }) => /\/(actions|finish)$/.test(url)));
      }
    });
});

test('missing artifact versions cannot start ranked runs while authenticated reads and local practice remain available', async (t) => {
  for (const ruleVersion of [undefined, null, '', 1])
    await t.test(String(ruleVersion), async (t) => {
      const fixture = authFixture(t);
      const services = createGameServices({ gameId: 'tower-brake', ruleVersion });
      assert.equal((await services.identity()).kind, 'account');
      const recorder = createRunRecorder(services);
      assert.equal(await recorder.start({ mode: 'endless' }), null);
      assert.equal(recorder.status, 'update-required');
      recorder.record({}, 600);
      assert.equal(await recorder.finish(), null);
      assert.equal(await recorder.start({ mode: 'endless', practice: true }), null);
      assert.equal(recorder.status, 'practice');
      assert.ok(fixture.calls.every(({ body }) => body === undefined));
    });
});

test('new client handles pre-handshake strict servers and explicit version rejection without retry or upload', async (t) => {
  for (const code of ['INVALID_INPUT', 'RULE_VERSION_CHANGED'])
    await t.test(code, async (t) => {
      const fixture = authFixture(t, { initial: JSON.stringify(credential('a')) });
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        await fixture.respond(url, init);
        return {
          status: code === 'INVALID_INPUT' ? 422 : 409,
          json: async () => ({ error: code }),
        };
      });
      const recorder = createRunRecorder(
        createGameServices({ gameId: 'tower-brake', ruleVersion: 'v2' }),
      );
      assert.equal(await recorder.start({ mode: 'endless' }), null);
      assert.equal(recorder.status, 'update-required');
      recorder.record({}, 600);
      assert.equal(await recorder.finish(), null);
      assert.equal(fixture.calls.length, 1);
    });
});

test('late version rejection cannot overwrite a newer recording or a timed out local run', async () => {
  for (const timeout of [false, true]) {
    let reject;
    const late = new Promise((_resolve, fail) => {
      reject = fail;
    });
    let starts = 0;
    const { recorder } = recorderFixture({
      startRun: () => (++starts === 1 ? late : Promise.resolve({ id: 'new', seed: 42 })),
    });
    const first = recorder.start({ mode: 'endless' });
    await turn();
    if (timeout) assert.equal(await first, null);
    else await recorder.start({ mode: 'endless' });
    reject(Object.assign(new Error('old version'), { code: 'RULE_VERSION_CHANGED' }));
    assert.equal(await first, null);
    assert.equal(recorder.status, timeout ? 'unavailable' : 'recording');
  }
});
