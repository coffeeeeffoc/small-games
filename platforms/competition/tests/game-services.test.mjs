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
const credential = (letter, expiresAt = Date.now() + 3600000) => ({
  token: letter.repeat(64),
  expiresAt,
});
function authFixture(
  t,
  { initial = null, readDenied = false, writeDenied = false, config = {} } = {},
) {
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
  globalThis.__competition = {
    session: () => assert.fail('Legacy cached identity must never be consulted'),
  };
  globalThis.localStorage = {
    getItem() {
      if (readDenied) throw new Error('denied');
      return storage;
    },
    setItem(key, value) {
      if (writeDenied) throw new Error('denied');
      writes.push(value);
      storage = value;
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
      if (url.endsWith('/sessions/guest') || url.endsWith('/sessions/platform'))
        return fixture.login ? fixture.login() : fixture.fresh;
      if (url.endsWith('/runs')) return { id: 'run-' + ++sequence };
      if (url.includes('/rooms')) return { code: 'ABCDEF123456' };
      return {
        identity: { kind: init.headers?.authorization ? 'guest' : 'anonymous' },
        top: [],
        me: init.headers?.authorization ? { rank: 1 } : null,
      };
    },
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => ({
    status: 200,
    json: async () => fixture.respond(url, init),
  }));
  return fixture;
}
test('anonymous reads do not create guests; read or write denial preserves this page identity', async (t) => {
  for (const readDenied of [true, false])
    await t.test(String(readDenied), async (t) => {
      const fixture = authFixture(t, { readDenied, writeDenied: true });
      const api = createGameServices({ gameId: 'tower-brake' });
      assert.equal((await api.identity()).kind, 'anonymous');
      assert.equal(fixture.calls.filter((call) => call.url.includes('/sessions/')).length, 0);
      await api.startRun({ mode: 'endless' });
      assert.equal((await api.identity()).kind, 'guest');
      assert.equal((await api.leaderboard({ boardId: 'endless' })).me.rank, 1);
      assert.equal(fixture.calls.at(-1).token, 'Bearer ' + fixture.fresh.token);
    });
});
test('account changes affect new requests while existing runs and rooms retain their owners', async (t) => {
  const a = credential('a'),
    b = credential('b');
  const fixture = authFixture(t, { initial: JSON.stringify(a) });
  const api = createGameServices({ gameId: 'cage-rescue' });
  const first = await api.startRun({ mode: 'endless' });
  const room = await api.createRoom({ mode: 'duel' });
  fixture.setStorage(JSON.stringify(b));
  await api.identity();
  await api.startRun({ mode: 'endless' });
  assert.equal(fixture.calls.at(-1).token, 'Bearer ' + b.token);
  await api.appendFrames({
    runId: first.id,
    seq: 1,
    frames: [{ ticks: 0, input: { launch: true } }],
  });
  assert.equal(fixture.calls.at(-1).token, 'Bearer ' + a.token);
  await api.roomAction({ code: room.code, operation: 'ready' });
  assert.equal(fixture.calls.at(-1).token, 'Bearer ' + a.token);
  assert.ok(fixture.calls.at(-1).url.endsWith('/games/cage-rescue/rooms/ABCDEF123456/ready'));
  await assert.rejects(api.roomAction({ code: room.code, operation: '../internal' }), {
    code: 'INVALID_OPERATION',
  });
});
test('expired, damaged and cleared stored identities never fall back to a stale legacy account', async (t) => {
  for (const value of [JSON.stringify(credential('b', Date.now() - 1)), '{broken', null])
    await t.test(String(value), async (t) => {
      const fixture = authFixture(t, { initial: JSON.stringify(credential('a')) });
      const api = createGameServices({ gameId: 'tower-brake' });
      await api.identity();
      fixture.setStorage(value);
      await api.startRun({ mode: 'endless' });
      assert.equal(fixture.calls.at(-1).token, 'Bearer ' + fixture.fresh.token);
      assert.equal(fixture.calls.filter((call) => call.url.endsWith('/sessions/guest')).length, 1);
    });
});
test('a deferred login cannot overwrite a newer account or revive an explicit logout', async (t) => {
  for (const replacement of [JSON.stringify(credential('b')), null, '{broken'])
    await t.test(String(replacement), async (t) => {
      const fixture = authFixture(t, { initial: JSON.stringify(credential('a', Date.now() - 1)) });
      const gate = defer();
      fixture.login = () => gate.promise;
      const api = createGameServices({ gameId: 'tower-brake' });
      const pending = api.startRun({ mode: 'endless' });
      await turn();
      fixture.setStorage(replacement);
      gate.resolve(fixture.fresh);
      if (replacement?.startsWith('{"token"')) {
        await pending;
        await api.identity();
        assert.equal(fixture.calls.at(-1).token, 'Bearer ' + credential('b').token);
      } else await assert.rejects(pending, { code: 'SESSION_CHANGED' });
      assert.equal(fixture.storage, replacement);
      assert.equal(fixture.writes.length, 0);
    });
});
test('factories share one pending login and renew near-expiry identities before creating runs', async (t) => {
  const fixture = authFixture(t, { initial: JSON.stringify(credential('a', Date.now() + 30000)) });
  const gate = defer();
  fixture.login = () => gate.promise;
  const a = createGameServices({ gameId: 'cage-rescue' }),
    b = createGameServices({ gameId: 'tower-brake' });
  const pending = Promise.all([a.startRun({ mode: 'endless' }), b.startRun({ mode: 'endless' })]);
  await turn();
  gate.resolve(fixture.fresh);
  const runs = await pending;
  assert.notEqual(runs[0].id, runs[1].id);
  assert.equal(fixture.calls.filter((call) => call.url.endsWith('/sessions/guest')).length, 1);
});
test('a run response arriving after account switching cannot overwrite the current reader identity', async (t) => {
  const a = credential('a'),
    b = credential('b');
  const fixture = authFixture(t, { initial: JSON.stringify(a) });
  const gate = defer(),
    respond = fixture.respond;
  fixture.respond = async (url, init) => {
    const data = await respond(url, init);
    if (url.endsWith('/runs')) await gate.promise;
    return data;
  };
  const api = createGameServices({ gameId: 'tower-brake' });
  const pending = api.startRun({ mode: 'endless' });
  await turn();
  fixture.setStorage(JSON.stringify(b));
  gate.resolve();
  const run = await pending;
  await api.identity();
  assert.equal(fixture.calls.at(-1).token, 'Bearer ' + b.token);
  await api.finishRun({ runId: run.id, seq: 0 });
  assert.equal(fixture.calls.at(-1).token, 'Bearer ' + a.token);
});
test('native login uses SDK transport and never falls back to guest on missing or failed official login', async (t) => {
  const fixture = authFixture(t, {
    config: { platform: 'wechat', appId: 'wx-test', apiUrl: 'https://api.example/v1' },
  });
  await assert.rejects(
    createGameServices({ gameId: 'tower-brake' }).startRun({ mode: 'endless' }),
    { code: 'PLATFORM_LOGIN_UNAVAILABLE' },
  );
  let saved = null,
    validCode = false;
  const requests = [];
  globalThis.wx = {
    getStorageSync: () => saved,
    setStorageSync: (_key, value) => {
      saved = value;
    },
    login: ({ success }) => success({ code: validCode ? 'official-code' : '' }),
    request: ({ url, data, header, success }) => {
      requests.push({ url, data, header });
      success({
        statusCode: 200,
        data: url.endsWith('/sessions/platform') ? fixture.fresh : { id: 'native-run' },
      });
    },
  };
  const api = createGameServices({ gameId: 'tower-brake' });
  await assert.rejects(api.startRun({ mode: 'endless' }), { code: 'PLATFORM_LOGIN_FAILED' });
  validCode = true;
  await api.startRun({ mode: 'endless' });
  assert.deepEqual(requests[0].data, {
    platform: 'wechat',
    appId: 'wx-test',
    code: 'official-code',
  });
  assert.equal(requests[1].header.authorization, 'Bearer ' + fixture.fresh.token);
  assert.equal(fixture.calls.length, 0);
  assert.ok(requests.every(({ url }) => !url.endsWith('/sessions/guest')));
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
    createGameServices({ gameId: 'tower-brake' }).startRun({ mode: 'endless' }),
    { code: 'PLATFORM_LOGIN_UNAVAILABLE' },
  );
  globalThis.__COMPETITION_CONFIG__ = { platform: 'wechat' };
  globalThis.wx = {
    getStorageSync: () => JSON.stringify(credential('a')),
    login: () => assert.fail(),
    request: () => assert.fail(),
  };
  await assert.rejects(
    createGameServices({ gameId: 'tower-brake' }).startRun({ mode: 'endless' }),
    { code: 'PLATFORM_LOGIN_UNAVAILABLE' },
  );
  assert.equal(fixture.calls.length, 0);
});
test('a rematch invitation retains the room owner after account switching', async (t) => {
  const a = credential('a');
  const fixture = authFixture(t, { initial: JSON.stringify(a) });
  const respond = fixture.respond;
  fixture.respond = async (url, init) => ({
    ...(await respond(url, init)),
    ...(url.endsWith('/rematch') ? { rematch: 'FEDCBA654321' } : {}),
  });
  const api = createGameServices({ gameId: 'duel' });
  const first = await api.createRoom();
  fixture.setStorage(JSON.stringify(credential('b')));
  await api.roomAction({ code: first.code, operation: 'rematch' });
  await api.getRoom({ code: 'FEDCBA654321' });
  assert.equal(fixture.calls.at(-1).token, 'Bearer ' + a.token);
  await api.joinRoom({ code: 'FEDCBA654321' });
  assert.equal(fixture.calls.at(-1).token, 'Bearer ' + a.token);
});
