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
function durableFixture() {
  const values = new Map(),
    runs = new Map(),
    requests = [],
    calls = [];
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  let owner = 'pilot-a',
    offline = false,
    loseAppend = false,
    loseFinish = false,
    ahead = false;
  const unavailable = () => {
    throw Object.assign(Error(), { code: 'SERVICE_UNAVAILABLE' });
  };
  const services = {
    config: { game: 'night-overwatch', apiUrl: '/api', platform: 'h5' },
    ruleVersion: 'v8',
    session: async () => ({ playerId: owner }),
    async startRun(input) {
      requests.push(input.requestId);
      if (offline) unavailable();
      let run = runs.get(input.requestId);
      if (!run) {
        run = {
          id: input.requestId,
          board: input.mode,
          levelId: input.levelId,
          version: 'v8',
          playerId: input.playerId,
          seq: 0,
          status: 'active',
          expiresAt: Date.now() + 86400000,
          batches: [],
        };
        runs.set(input.requestId, run);
      }
      return { ...run };
    },
    async getRun({ runId, playerId }) {
      calls.push('get');
      if (offline) unavailable();
      if (owner !== playerId) throw Object.assign(Error(), { code: 'IDENTITY_CHANGED' });
      return structuredClone(runs.get(runId));
    },
    async resumeRun({ runId }) {
      calls.push('resume');
      const run = runs.get(runId);
      run.expiresAt = Date.now() + 86400000;
      return { ...run };
    },
    async appendFrames({ runId, seq, frames }) {
      calls.push('append');
      if (offline) unavailable();
      if (ahead) throw Object.assign(Error(), { code: 'RUN_AHEAD_OF_TIME' });
      const run = runs.get(runId),
        existing = run.batches[seq - 1];
      if (existing) assert.deepEqual(frames, existing);
      else {
        assert.equal(seq, run.seq + 1);
        run.batches.push(structuredClone(frames));
        run.seq = seq;
      }
      if (loseAppend) {
        loseAppend = false;
        unavailable();
      }
    },
    async finishRun({ runId, seq }) {
      calls.push('finish');
      if (offline) unavailable();
      const run = runs.get(runId);
      assert.equal(seq, run.seq);
      run.status = 'finished';
      run.settlement ||= { accepted: true, fastestEligible: true };
      if (loseFinish) {
        loseFinish = false;
        unavailable();
      }
      return run.settlement;
    },
  };
  return {
    storage,
    values,
    runs,
    requests,
    calls,
    services,
    recorder: () => createRunRecorder(services, { durable: { storage } }),
    offline: (v) => (offline = v),
    loseAppend: () => (loseAppend = true),
    loseFinish: () => (loseFinish = true),
    ahead: (v) => (ahead = v),
    owner: (v) => (owner = v),
  };
}
test('Night durable completion survives lost append response and reload, querying before replay', async () => {
  const f = durableFixture(),
    first = f.recorder();
  await first.start({ mode: 'campaign', levelId: 'first' });
  first.record({}, 120);
  f.loseAppend();
  await first.finish();
  assert.equal(first.status, 'pending-sync');
  assert.equal([...f.runs.values()][0].seq, 1);
  f.calls.length = 0;
  const restored = f.recorder();
  await restored.recover();
  assert.deepEqual(f.calls, ['get', 'append', 'finish']);
  assert.equal(restored.status, 'finished');
  assert.equal(restored.pending, 0);
  assert.ok([...f.values.keys()].some((k) => k.endsWith(':synced')));
});
test('Night lost finish response, expired session and duplicate recovery preserve one settlement', async () => {
  const f = durableFixture(),
    first = f.recorder();
  await first.start({ mode: 'campaign', levelId: 'first' });
  first.record({}, 120);
  f.loseFinish();
  await first.finish();
  f.calls.length = 0;
  await Promise.all([f.recorder().recover(), f.recorder().recover()]);
  assert.ok(!f.calls.includes('finish'));
  assert.equal(f.runs.size, 1);
  const second = f.recorder();
  await second.start({ mode: 'campaign', levelId: 'second' });
  second.record({}, 120);
  f.offline(true);
  await second.finish();
  f.offline(false);
  [...f.runs.values()][1].expiresAt = 0;
  f.calls.length = 0;
  await f.recorder().recover();
  assert.deepEqual(f.calls, ['get', 'resume', 'append', 'finish']);
});
test('Night unavailable start is persisted before transport and retries the same request without bypassing time', async () => {
  const f = durableFixture();
  f.offline(true);
  const first = f.recorder();
  await first.start({ mode: 'campaign', levelId: 'first' });
  first.record({}, 120);
  await first.finish();
  assert.equal(first.status, 'pending-sync');
  assert.equal(f.values.size, 1);
  f.offline(false);
  f.ahead(true);
  await f.recorder().recover();
  assert.equal(new Set(f.requests).size, 1);
  assert.equal([...f.runs.values()][0].seq, 0);
  f.ahead(false);
  await f.recorder().recover();
  assert.equal([...f.runs.values()][0].settlement.accepted, true);
});
test('Night pending data stays with its owner and survives quota failure or malformed cache', async () => {
  const f = durableFixture(),
    first = f.recorder();
  await first.start({ mode: 'campaign', levelId: 'first' });
  first.record({}, 120);
  f.offline(true);
  await first.finish();
  f.offline(false);
  f.owner('pilot-b');
  const restored = f.recorder();
  await restored.recover();
  assert.equal(restored.status, 'needs-attention');
  assert.equal(f.values.size, 1);
  assert.equal([...f.runs.values()][0].seq, 0);
  f.owner('pilot-a');
  f.storage.setItem = () => {
    throw Error('quota');
  };
  const broken = f.recorder();
  await broken.recover();
  assert.equal(broken.status, 'storage-unavailable');
  assert.equal([...f.runs.values()][0].seq, 0);
});
test('Night unfinished mission is never submitted as a completion on reload', async () => {
  const f = durableFixture(),
    recorder = f.recorder();
  await recorder.start({ mode: 'campaign', levelId: 'first' });
  recorder.record({}, 120);
  recorder.persist();
  await f.recorder().recover();
  assert.ok(!f.calls.includes('finish'));
});
test('Night rejects the Cocos no-op storage fallback instead of claiming progress is cached', async () => {
  const f = durableFixture();
  const storage = { length: 0, key() {}, getItem() {}, setItem() {}, removeItem() {} };
  const recorder = createRunRecorder(f.services, { durable: { storage } });
  assert.equal(await recorder.start({ mode: 'campaign', levelId: 'first' }), null);
  assert.equal(recorder.status, 'storage-unavailable');
  assert.equal(f.requests.length, 0);
});
test('Night retries do not retain abandoned journals or drop completed pending missions', async () => {
  const f = durableFixture(),
    recorder = f.recorder();
  for (let i = 0; i < 12; i++) {
    await recorder.start({ mode: 'campaign', levelId: 'first' });
    recorder.record({}, 120);
  }
  assert.equal(f.values.size, 1);
  f.offline(true);
  await recorder.finish();
  await recorder.start({ mode: 'campaign', levelId: 'second' });
  recorder.invalidate();
  assert.equal(f.values.size, 1);
  assert.equal(JSON.parse([...f.values.values()][0]).finishing, true);
});
test('Night expired cached identity remains recoverable when refresh is temporarily offline', async (t) => {
  const f = authFixture(t, {
    initial: JSON.stringify(credential('a', Date.now() - 1000, 'night-overwatch')),
  });
  f.respond = async () => {
    throw Error('offline');
  };
  const services = createGameServices({ gameId: 'night-overwatch', ruleVersion: 'v8' });
  const storage = durableFixture().storage;
  const recorder = createRunRecorder(services, { durable: { storage } });
  await recorder.start({ mode: 'campaign', levelId: 'first' });
  recorder.record({}, 120);
  await recorder.finish();
  assert.equal(recorder.status, 'pending-sync');
  const saved = JSON.parse(storage.getItem(storage.key(0)));
  assert.equal(saved.playerId, 'a');
  assert.equal(saved.finishing, true);
  assert.equal('token' in saved, false);
  assert.equal('refreshToken' in saved, false);
});
test('profile reads and updates reuse the same game-scoped owner', async (t) => {
  const f = authFixture(t, { initial: null });
  const api = createGameServices({ gameId: 'tower-brake' });
  await api.profile();
  await api.profile({ nickname: '旅人' });
  assert.equal(f.calls.filter((call) => call.url.endsWith('/sessions/guest')).length, 1);
  assert.equal(f.calls.at(-2).url, '/api/competition/v1/me');
  assert.equal(f.calls.at(-1).token, f.calls.at(-2).token);
  assert.deepEqual(f.calls.at(-1).body, { nickname: '旅人' });
});
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
      if (url.includes('/rooms') || url.endsWith('/match')) return { code: 'ABCDEF123456' };
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

test('match retries retain the queue owner and a matched room can be cancelled', async (t) => {
  const f = authFixture(t),
    api = createGameServices({ gameId: 'tower-brake' });
  const room = await api.match();
  await api.match();
  assert(
    f.calls
      .filter((call) => call.url.endsWith('/match'))
      .every((call) => call.token === 'Bearer ' + 'a'.repeat(64)),
  );
  f.setStorage(JSON.stringify(credential('b')));
  const count = f.calls.length;
  await assert.rejects(api.match(), { code: 'SESSION_CHANGED' });
  assert.equal(f.calls.length, count);
  f.setStorage(JSON.stringify(credential('a')));
  await api.roomAction({ code: room.code, operation: 'leave' });
  assert(f.calls.at(-1).url.endsWith('/rooms/ABCDEF123456/leave'));
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

test('lobby SDK preserves passwords in POST bodies, renews leases, rotates connections and reads history', async (t) => {
  const f = authFixture(t),
    api = createGameServices({ gameId: 'tower-brake' });
  const base = f.respond;
  f.respond = async (url, init) => {
    const result = await base(url, init);
    if (url.endsWith('/rooms') && init.body) return { code: '123456', leaseId: 'lease-1' };
    if (url.endsWith('/connect')) return { code: '123456', leaseId: 'lease-2' };
    return result;
  };
  await api.listRooms();
  assert.equal(f.calls.at(-1).body, undefined);
  await api.createRoom({ mode: 'friend', visibility: 'private', password: 'four' });
  assert.deepEqual(f.calls.at(-1).body, {
    mode: 'friend',
    visibility: 'private',
    password: 'four',
  });
  await api.getRoom({ code: '123456' });
  assert(f.calls.at(-1).url.endsWith('/rooms/123456?leaseId=lease-1'));
  await api.connectRoom({ code: '123456' });
  assert.deepEqual(f.calls.at(-1).body, {});
  await api.roomAction({
    code: '123456',
    operation: 'actions',
    body: { seq: 1, action: { commands: [] } },
  });
  assert.equal(f.calls.at(-1).body.leaseId, 'lease-2');
  await api.joinRoom({ code: '654321', password: 'secret' });
  assert.deepEqual(f.calls.at(-1).body, { code: '654321', password: 'secret' });
  await api.spectateRoom({ code: '654321', password: 'secret' });
  assert(f.calls.at(-1).url.endsWith('/rooms/654321/spectate'));
  assert.deepEqual(f.calls.at(-1).body, { password: 'secret' });
  await api.history({ cursor: 'opaque+/' });
  assert(f.calls.at(-1).url.endsWith('/history?cursor=opaque%2B%2F'));
  assert(f.calls.every((call) => !call.url.includes('secret')));
});
test('updateProfile returns /me and updates the scoped identity cache', async (t) => {
  const f = authFixture(t),
    api = createGameServices({ gameId: 'tower-brake' }),
    base = f.respond;
  f.respond = async (url, init) => {
    const result = await base(url, init);
    return url.endsWith('/me')
      ? { ...credential(), nickname: '夜航玩家', name: '夜航玩家', profileUpdatedAt: 100 }
      : result;
  };
  assert.equal((await api.updateProfile({ nickname: '夜航玩家' })).nickname, '夜航玩家');
  assert.equal((await api.session()).nickname, '夜航玩家');
});
