/* global URL, console, queueMicrotask */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { installTapCompetitionIdentity } from '../competition-identity.mjs';
import { createTapGameServices } from '../game-services.mjs';
import { tapCall } from '../calls.mjs';
import {
  validateTapProgress as cops,
  mergeTapProgress as mergeCops,
} from '../../../games/local/cops-robbers/src/tap-save.js';
import {
  validateTapProgress as street,
  mergeTapProgress as mergeStreet,
  tapProgressScore,
} from '../../../games/local/cops-robbers-realtime/src/tap-save.js';
import { validateTapProgress as chess } from '../../../games/submodules/xiangqi-five/tap-save.js';
import { newGame } from '../../../games/submodules/xiangqi-five/game.js';
import { encodeGame } from '../../../games/submodules/xiangqi-five/local-game.js';
const client = await readFile(
  new URL('../../../platforms/competition/client.js', import.meta.url),
  'utf8',
);
const memory = () => {
  const map = new Map();
  return { map, getItem: (key) => map.get(key), setItem: (key, value) => map.set(key, value) };
};
const config = {
  game: 'cops-robbers',
  platform: 'h5',
  appId: 'tap-test',
  apiUrl: 'https://api.example.test/v1',
  identityProvider: 'taptap',
  tapServices: { enabled: true, appConsoleId: '123456', leaderboardId: 'board-id' },
};
const credential = (overrides = {}) => ({
  identityKind: 'platform',
  game: 'cops-robbers',
  userId: 'test-user',
  sessionId: '11111111-1111-1111-1111-111111111111',
  token: 'a'.repeat(64),
  refreshToken: 'b'.repeat(64),
  expiresAt: Date.now() + 3600000,
  refreshExpiresAt: Date.now() + 7200000,
  ...overrides,
});
function identity(options = {}) {
  const storage = memory(),
    root = { URL, Date, console, localStorage: storage, ...options };
  vm.runInNewContext(client, root);
  installTapCompetitionIdentity(root);
  const requests = [];
  const auth = root.__createCompetitionIdentity({
    config,
    storage,
    request: async (...args) => {
      requests.push(args);
      return credential();
    },
  });
  return { root, storage, requests, auth };
}
test('optional identity never falls back to guest; delayed SDK injection can retry', async () => {
  const f = identity();
  await assert.rejects(f.auth.current(), { code: 'TAP_UNAVAILABLE' });
  assert.equal(f.requests.length, 0);
  f.root.tap = {
    login({ success }) {
      success({ code: 'short-lived-code' });
    },
  };
  const [a, b] = await Promise.all([f.auth.current(), f.auth.current()]);
  assert.equal(a.sessionId, b.sessionId);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0][0], '/sessions/platform');
  assert.equal(f.requests[0][1].appId, 'tap-test');
  assert.equal(a.identityKind, 'platform');
  assert(!JSON.stringify([...f.storage.map.values()]).includes('short-lived-code'));
  assert.equal(installTapCompetitionIdentity(f.root), f.root.__createCompetitionIdentity);
});
test('logout invalidates late login before platform exchange', async () => {
  let finish;
  const f = identity({
    tap: {
      login({ success }) {
        finish = success;
      },
    },
  });
  const pending = f.auth.current();
  await Promise.resolve();
  f.auth.logout();
  finish({ code: 'late' });
  await assert.rejects(pending, { code: 'SESSION_CHANGED' });
  assert.equal(f.requests.length, 0);
});
test('cache is scoped, guest corruption rejected; another config still uses original guest lifecycle', async () => {
  const f = identity({
    tap: {
      login({ success }) {
        success({ code: 'code' });
      },
    },
  });
  const actual = await f.auth.current();
  const key = f.auth.storageKey;
  f.storage.setItem(key, JSON.stringify({ ...actual, identityKind: 'guest' }));
  assert.throws(() => f.auth.saved(), { code: 'IDENTITY_SCOPE_MISMATCH' });
  await assert.rejects(f.auth.current(), { code: 'IDENTITY_SCOPE_MISMATCH' });
  const paths = [];
  const other = f.root.__createCompetitionIdentity({
    config: { ...config, identityProvider: undefined, game: 'carding-car' },
    storage: f.storage,
    request: async (path) => {
      paths.push(path);
      return credential({ game: 'carding-car', identityKind: 'guest' });
    },
  });
  await other.current();
  assert.deepEqual(paths, ['/sessions/guest']);
});
test('SDK and proxy reuse one H5 auth; refresh response must remain platform', async () => {
  const store = memory(),
    sdk = {
      request() {},
      getStorageSync: store.getItem,
      setStorageSync: store.setItem,
      login({ success }) {
        success({ code: 'x' });
      },
    };
  const root = { Date, URL, tap: sdk, localStorage: store };
  vm.runInNewContext(client, root);
  installTapCompetitionIdentity(root, sdk);
  let count = 0;
  const request = async () => {
      count++;
      return credential();
    },
    cfg = { ...config };
  const first = root.__createCompetitionIdentity({ config: cfg, sdk, storage: store, request });
  const second = root.__createCompetitionIdentity({
    config: cfg,
    sdk: new Proxy(sdk, {}),
    storage: store,
    request,
  });
  assert.equal(first, second);
  await Promise.all([first.current(), second.current()]);
  assert.equal(count, 1);
  const current = first.saved();
  store.setItem(first.storageKey, JSON.stringify({ ...current, expiresAt: 0 }));
  // A new isolated authority exercises rejection before the canonical client persists refresh.
  const badRoot = { Date, URL, tap: sdk, localStorage: store };
  vm.runInNewContext(client, badRoot);
  installTapCompetitionIdentity(badRoot, sdk);
  const bad = badRoot.__createCompetitionIdentity({
    config: cfg,
    sdk,
    storage: store,
    request: async () => credential({ identityKind: 'guest' }),
  });
  await assert.rejects(bad.current(), { code: 'IDENTITY_SCOPE_MISMATCH' });
});
function fixture() {
  const storage = memory(),
    files = new Map(),
    rows = [];
  let data = { version: 1, completed: { 1: { turns: 7, stars: 3 } } },
    clock = 100000,
    active = 0,
    max = 0;
  const cloud = {
    getArchiveList({ success }) {
      active++;
      max = Math.max(max, active);
      queueMicrotask(() => {
        active--;
        success({ saves: rows.slice() });
      });
    },
    createArchive(o) {
      rows.push({ uuid: 'a', fileId: '1', ...o.archiveMetaData, modifiedTime: 1 });
      files.set('archive', files.get(o.archiveFilePath));
      o.success({ uuid: 'a', fileId: '1' });
    },
    updateArchive(o) {
      files.set('archive', files.get(o.archiveFilePath));
      o.success({ uuid: 'a', fileId: '2' });
    },
    getArchiveData(o) {
      o.success({ filePath: 'archive' });
    },
  };
  const submissions = [];
  const board = {
    submitScores(o) {
      submissions.push(o.scores);
      o.callback.onSuccess({});
    },
    openLeaderboard(o) {
      o.callback.onSuccess({});
    },
  };
  const sdk = {
    login(o) {
      o.success({ code: 'discard' });
    },
    env: { USER_DATA_PATH: '/sandbox' },
    getCloudSaveManager() {
      assert.equal(this, sdk);
      return cloud;
    },
    getLeaderboardManager() {
      return board;
    },
    getFileSystemManager() {
      return {
        writeFile(o) {
          files.set(o.filePath, o.data);
          o.success();
        },
        readFile(o) {
          o.success({ data: files.get(o.filePath) });
        },
      };
    },
  };
  const port = {
    export: () => data,
    validate: cops,
    summary: () => '已完成1关',
    score: () => 1,
    canRestore: () => true,
    restore: (value) => {
      data = value;
    },
  };
  const service = createTapGameServices({ sdk, config, savePort: port, storage, now: () => clock });
  return {
    service,
    port,
    sdk,
    storage,
    files,
    rows,
    submissions,
    next: () => (clock += 60001),
    getData: () => data,
    getMax: () => max,
  };
}
test('cloud round trip validates scope, backs up locally, excludes tokens, and enforces shared rate budget', async () => {
  const f = fixture();
  f.port.export = () => ({ ...f.getData(), token: 'secret', room: { id: 'private' } });
  await f.service.upload();
  assert(!f.files.get('archive').includes('secret'));
  assert(!f.files.get('archive').includes('private'));
  await assert.rejects(f.service.upload(), { code: 'TAP_RATE_LIMIT' });
  const [row] = await f.service.list();
  const value = await f.service.download(row);
  f.service.restore(value);
  assert([...f.storage.map.keys()].some((key) => key.startsWith('tap-backup:')));
  assert.equal(f.getMax(), 1);
  f.files.set(
    'archive',
    JSON.stringify({ schema: 1, game: 'cops-robbers', app: 'other-app', data: value }),
  );
  await assert.rejects(f.service.download(row), { code: 'TAP_INVALID_SAVE' });
  f.next();
  await f.service.upload();
  f.service.stop();
  await assert.rejects(f.service.list(), { code: 'TAP_CANCELLED' });
});
test('cloud serialization rejects overlapping calls and backup failure never applies restore', async () => {
  const f = fixture();
  const pending = f.service.list();
  await assert.rejects(f.service.list(), { code: 'TAP_BUSY' });
  await pending;
  let restored = false;
  f.port.restore = () => {
    restored = true;
  };
  f.storage.setItem = () => {
    throw Error('disk');
  };
  assert.throws(() => f.service.restore({}));
  assert.equal(restored, false);
});
test('Tap leaderboard scores are explicit and developer mode is excluded; SDK codes retained', async () => {
  const f = fixture();
  await f.service.connect();
  assert.equal(f.submissions.length, 0);
  await f.service.openLeaderboard();
  assert.equal(f.submissions.length, 0);
  await f.service.submit();
  await f.service.submit();
  assert.equal(f.submissions.length, 1);
  f.port.developer = () => true;
  await assert.rejects(f.service.submit(), { code: 'TAP_PRACTICE' });
  await assert.rejects(f.service.upload(), { code: 'TAP_PRACTICE' });
  assert.equal(f.rows.length, 0);
  await assert.rejects(
    tapCall(
      {
        submitScores(o) {
          o.callback.onFailure(500002, 'untrusted text');
        },
      },
      'submitScores',
      {},
      { leaderboard: true },
    ),
    { code: 500002, message: '排行榜不属于当前应用。' },
  );
});
test('game-owned saves clamp records, merge monotonic progress and rank only verified H5 records', () => {
  assert.equal(
    cops({ completed: { 1: { turns: -1, stars: 3 } }, token: 'secret' }).completed[1],
    undefined,
  );
  assert.equal(
    mergeCops({ completed: { 1: { turns: 7 } } }, { completed: { 1: { turns: 12 } } }).completed[1]
      .turns,
    7,
  );
  const key = 'challenge-cop-1:simultaneous:street-solo-v2';
  const progress = street({ records: { [key]: 3 }, token: 'secret' });
  assert.equal(tapProgressScore(progress), 0);
  const merged = mergeStreet(progress, {
    records: { [key]: 5 },
    verified: { [key]: 3 },
  });
  assert.equal(merged.records[key], 3);
  assert.equal(merged.verified[key], 3);
  assert.equal(tapProgressScore(merged), 1);
  assert(!JSON.stringify(merged).includes('secret'));
  const state = newGame();
  state.freeUndoUsed = true;
  const checked = chess({
    local: encodeGame(state, 'computer', 'standard'),
    progress: {},
    token: 'secret',
  });
  assert.equal(JSON.parse(checked.local).freeUndoUsed, true);
  assert(!JSON.stringify(checked).includes('secret'));
  assert.throws(() => chess({ local: '{"history":[]}' }));
});
test('a new runtime reauthenticates the current Tap account instead of reusing another account cache', async () => {
  const f = identity({
    tap: {
      login(o) {
        o.success({ code: 'account-a' });
      },
    },
  });
  await f.auth.current();
  const root = {
    Date,
    URL,
    localStorage: f.storage,
    tap: {
      login(o) {
        o.success({ code: 'account-b' });
      },
    },
  };
  vm.runInNewContext(client, root);
  installTapCompetitionIdentity(root);
  const paths = [];
  const auth = root.__createCompetitionIdentity({
    config,
    storage: f.storage,
    request: async (path, body) => {
      paths.push(path);
      if (path === '/sessions/logout') return {};
      assert.equal(body.code, 'account-b');
      return credential({ userId: 'account-b', sessionId: '22222222-2222-2222-2222-222222222222' });
    },
  });
  assert.equal(auth.saved(), null);
  assert.equal((await auth.current()).userId, 'account-b');
  assert(paths.includes('/sessions/platform'));
});

test('portal cancels multitouch, drag and hidden gestures, while pending operations remain escapable', async () => {
  const { startTapServiceScreen } = await import('../service-screen.mjs');
  const listeners = new Map();
  const ctx = new Proxy({}, { get: () => () => {} }),
    canvas = { getContext: () => ctx };
  let connects = 0,
    stops = 0,
    exits = 0,
    finish;
  const sdk = {
    getSystemInfoSync: () => ({
      windowWidth: 568,
      windowHeight: 320,
      pixelRatio: 1,
      safeArea: { top: 32, bottom: 308 },
    }),
  };
  for (const name of [
    'TouchStart',
    'TouchMove',
    'TouchEnd',
    'TouchCancel',
    'Hide',
    'Show',
    'WindowResize',
  ]) {
    sdk['on' + name] = (fn) => listeners.set(name, fn);
    sdk['off' + name] = () => listeners.delete(name);
  }
  const services = {
    connected: false,
    connect() {
      connects++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    stop() {
      stops++;
    },
  };
  const screen = startTapServiceScreen({
    sdk,
    canvas,
    services,
    savePort: { summary: () => '', export: () => ({}) },
    config,
    onExit: () => exits++,
  });
  const hit = (id) => screen.getSnapshot().hits.find((item) => item.id === id);
  const p = (id, identifier = 1) => ({
    clientX: hit(id).x + 20,
    clientY: hit(id).y + 52,
    identifier,
  });
  const start = (points) => listeners.get('TouchStart')({ touches: points });
  const end = (point) => listeners.get('TouchEnd')({ touches: [], changedTouches: [point] });
  let point = p('connect');
  start([point]);
  start([point, p('connect', 2)]);
  end(p('connect', 2));
  assert.equal(connects, 0);
  start([point]);
  listeners.get('TouchMove')({ touches: [{ ...point, clientX: point.clientX + 20 }] });
  end(point);
  assert.equal(connects, 0);
  start([point]);
  listeners.get('Hide')();
  end(point);
  assert.equal(connects, 0);
  start([point]);
  end(point);
  assert.equal(connects, 1);
  assert.equal(screen.getSnapshot().pending, true);
  point = p('exit');
  start([point]);
  end(point);
  assert.equal(stops, 1);
  assert.equal(exits, 1);
  assert.equal(listeners.size, 0);
  finish();
  await Promise.resolve();
  screen.stop();
  assert.equal(stops, 1);
});

test('chess two-key write rolls back a partial disk failure', async () => {
  const { writeTapProgress } = await import('../../../games/submodules/xiangqi-five/tap-save.js');
  const storage = memory();
  storage.setItem('xiangqi-five-challenges-v1', 'old-progress');
  storage.setItem('xiangqi-five-local-v1', 'old-game');
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'xiangqi-five-local-v1') throw Error('disk');
    write(key, value);
  };
  assert.throws(() => writeTapProgress(storage, { progress: {}, local: 'new-game' }), /disk/);
  assert.equal(storage.getItem('xiangqi-five-challenges-v1'), 'old-progress');
  assert.equal(storage.getItem('xiangqi-five-local-v1'), 'old-game');
});
