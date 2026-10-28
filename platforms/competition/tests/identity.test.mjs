import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  allowedAvatar,
  avatarBlob,
  profileDetails,
  regionText,
  renderAvatar,
} from '../profile-dom.js';
const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const id = '00000000-0000-4000-8000-000000000001';
const family = '10000000-0000-4000-8000-000000000001';
const credential = (extra = {}) => ({
  userId: id,
  playerId: id,
  sessionId: family,
  game: 'cops-robbers',
  identityKind: 'guest',
  token: 'a'.repeat(64),
  refreshToken: 'c'.repeat(64),
  expiresAt: Date.now() + 900000,
  refreshExpiresAt: Date.now() + 86400000,
  ...extra,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function fixture({ config = {}, sdk, storage = new Map(), handler, blocked = false } = {}) {
  const calls = [];
  const localStorage = {
    getItem(key) {
      if (blocked) throw Error('blocked');
      return storage.get(key);
    },
    setItem(key, value) {
      if (blocked) throw Error('blocked');
      storage.set(key, value);
    },
  };
  const context = {
    URL,
    setTimeout,
    clearTimeout,
    AbortSignal,
    location: new URL('https://game.test/play'),
  };
  runInNewContext(source, context);
  const options = {
    config: { apiUrl: 'https://api.game.test/v1', game: 'cops-robbers', ...config },
    sdk,
    storage: localStorage,
    request: async (path, body, owner) => {
      calls.push({ path, body, owner });
      return handler ? handler(path, body, owner) : credential();
    },
  };
  const auth = context.__createCompetitionIdentity(options);
  return {
    auth,
    calls,
    context,
    options,
    storage,
    save: (value) =>
      storage.set(
        auth.storageKey,
        JSON.stringify(value && { ...value, apiAuthority: auth.authority }),
      ),
  };
}
test('first network use creates one scoped anonymous identity and reload reuses it', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.auth.current(), f.auth.current()]);
  assert.equal(a.userId, b.userId);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].path, '/sessions/guest');
  assert.equal(JSON.stringify(f.calls[0].body), JSON.stringify({ game: 'cops-robbers' }));
  assert.equal(f.calls[0].owner, null);
  const reload = fixture({ storage: f.storage });
  assert.equal((await reload.auth.current()).userId, id);
  assert.equal(reload.calls.length, 0);
  const other = fixture({
    config: { game: 'xiangqi-five' },
    storage: f.storage,
    handler: () => credential({ game: 'xiangqi-five', userId: 'other' }),
  });
  assert.equal((await other.auth.current()).userId, 'other');
  assert.equal(other.calls.length, 1);
});
test('legacy unscoped or malformed credentials cannot authenticate a new session', async () => {
  for (const value of [
    null,
    credential({ sessionId: undefined }),
    credential({ token: 'bad' }),
    credential({ game: 'xiangqi-five' }),
  ]) {
    const f = fixture();
    f.save(value);
    await f.auth.current();
    assert.equal(f.calls[0].path, '/sessions/guest');
    assert.equal(f.calls[0].owner, null);
  }
});

test('owner-bound refresh cannot create a guest when another tab clears storage between reads', async () => {
  const f = fixture(),
    owner = await f.auth.current();
  f.calls.length = 0;
  const get = f.options.storage.getItem;
  let reads = 0;
  f.options.storage.getItem = (key) => {
    if (++reads === 2) f.storage.clear();
    return get(key);
  };
  await assert.rejects(f.auth.forOwner(owner), { code: 'SESSION_CHANGED' });
  assert.deepEqual(f.calls, []);
});
test('blocked storage retains the anonymous credential in memory', async () => {
  const f = fixture({ blocked: true });
  await f.auth.current();
  await f.auth.current();
  assert.equal(f.calls.length, 1);
});
test('network failures retain refresh credentials and never create another player', async () => {
  const f = fixture({
    handler: () => {
      throw Object.assign(Error(), { code: 'SERVICE_UNAVAILABLE' });
    },
  });
  f.save(credential({ expiresAt: Date.now() + 1000 }));
  for (let i = 0; i < 2; i++)
    await assert.rejects(f.auth.current(), { code: 'SERVICE_UNAVAILABLE' });
  assert.equal(f.auth.saved().userId, id);
  assert(f.calls.every((c) => c.path === '/sessions/refresh'));
});
test('profile updates and rotating refresh cannot overwrite each other in either arrival order', async () => {
  for (const first of ['profile', 'refresh']) {
    const d = deferred(),
      f = fixture({ handler: () => d.promise });
    const old = credential({ expiresAt: Date.now() + 1000, profileUpdatedAt: 1 });
    f.save(old);
    const refreshing = f.auth.current();
    const profile = {
      userId: id,
      game: old.game,
      name: '新昵称',
      profileUpdatedAt: 10,
      token: 'forged',
    };
    if (first === 'profile') f.auth.acceptProfile(profile, old);
    d.resolve(
      credential({ token: 'b'.repeat(64), refreshToken: 'd'.repeat(64), profileUpdatedAt: 1 }),
    );
    await refreshing;
    if (first === 'refresh') f.auth.acceptProfile(profile, old);
    f.auth.acceptProfile({ ...profile, name: '迟到的旧昵称', profileUpdatedAt: 2 }, old);
    assert.equal(f.auth.saved().token, 'b'.repeat(64));
    assert.equal(f.auth.saved().name, '新昵称');
  }
});
test('logout immediately invalidates pending login or refresh and uses its original family proof', async () => {
  for (const operation of ['login', 'refresh']) {
    const d = deferred(),
      f = fixture({ handler: (path) => (path === '/sessions/logout' ? { ok: true } : d.promise) });
    if (operation === 'refresh') f.save(credential({ expiresAt: Date.now() + 1000 }));
    const pending = operation === 'refresh' ? f.auth.current() : f.auth.current();
    const rejected = assert.rejects(pending, { code: 'SESSION_CHANGED' });
    await f.auth.logout();
    d.resolve(credential({ token: 'b'.repeat(64) }));
    await rejected;
    assert.equal(f.auth.saved(), null);
    if (operation === 'refresh')
      assert.equal(f.calls.find((c) => c.path === '/sessions/logout').owner.token, 'a'.repeat(64));
  }
});
test('late logout completion cannot clear a newer login', async () => {
  const d = deferred(),
    f = fixture({
      handler: (path) =>
        path === '/sessions/logout'
          ? d.promise
          : credential({ sessionId: '20000000-0000-4000-8000-000000000001' }),
    });
  f.save(credential());
  const exiting = f.auth.logout();
  await f.auth.current();
  d.resolve({ ok: true });
  await exiting;
  assert.equal(f.auth.saved().sessionId[0], '2');
});
test('a losing tab refresh adopts the winning same-family rotation without clearing it', async () => {
  const d = deferred(),
    f = fixture({ handler: () => d.promise });
  f.save(credential({ expiresAt: Date.now() + 1000 }));
  const refreshing = f.auth.current();
  f.save(credential({ token: 'b'.repeat(64), refreshToken: 'd'.repeat(64) }));
  d.reject(Object.assign(Error(), { code: 'REFRESH_EXPIRED' }));
  assert.equal((await refreshing).token, 'b'.repeat(64));
});
test('expired refresh clears this account; old business denials cannot clear a rotated token', async () => {
  const f = fixture({
    handler: () => {
      throw Object.assign(Error(), { code: 'REFRESH_EXPIRED' });
    },
  });
  f.save(credential({ expiresAt: Date.now() + 1000 }));
  await assert.rejects(f.auth.current(), { code: 'REFRESH_EXPIRED' });
  assert.equal(f.auth.saved(), null);
  const old = credential();
  f.save(credential({ token: 'b'.repeat(64) }));
  f.auth.invalidate(old, { code: 'SESSION_EXPIRED' });
  assert(f.auth.saved());
  f.auth.invalidate(f.auth.saved(), { code: 'SESSION_EXPIRED' });
  assert.equal(f.auth.saved().expiresAt, 0);
  assert.equal(f.auth.saved().refreshToken, old.refreshToken);
});
test('business responses arriving after account change cannot be accepted or cached', async () => {
  const f = fixture(),
    d = deferred();
  f.save(credential());
  Object.assign(f.context, {
    localStorage: f.options.storage,
    fetch: async () => ({ status: 200, json: () => d.promise }),
  });
  f.context.__installCompetition(f.options.config);
  const pending = f.context.__competition.request('/me');
  await Promise.resolve();
  f.save(credential({ userId: 'other', sessionId: '20000000-0000-4000-8000-000000000001' }));
  d.resolve({ userId: id, game: 'cops-robbers', name: '旧玩家' });
  await assert.rejects(pending, { code: 'SESSION_CHANGED' });
});
test('native entrances create anonymous identities without platform login or AppID', async () => {
  const bad = fixture({ config: { platform: 'unknown' } });
  await assert.rejects(bad.auth.current(), { code: 'PLATFORM_LOGIN_UNAVAILABLE' });
  const storage = new Map(),
    sdk = {
      request() {},
      login() {
        assert.fail('no platform login');
      },
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
    };
  const f = fixture({ config: { platform: 'taptap' }, sdk, storage });
  await f.auth.current();
  assert.equal(f.calls[0].path, '/sessions/guest');
  assert.equal(Object.keys(f.calls[0].body).join(), 'game');
});
test('profile sync requires prior platform authorization and filters unknown avatar and region', async () => {
  let authorized = false;
  const storage = new Map();
  const sdk = {
    login() {},
    request() {},
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    getSetting: ({ success }) => success({ authSetting: { 'scope.userInfo': authorized } }),
    getUserInfo: ({ success }) =>
      success({
        userInfo: { nickName: '玩家甲', avatarUrl: 'https://unknown.example/a', city: '不保留' },
      }),
  };
  const f = fixture({
    config: { platform: 'taptap', appId: 'app' },
    sdk,
    storage,
    handler: (_path, body) => ({ userId: id, game: 'cops-robbers', ...body }),
  });
  f.save(credential({ identityKind: 'platform' }));
  await assert.rejects(f.auth.syncProfile(), { code: 'PLATFORM_PROFILE_NOT_AUTHORIZED' });
  assert.equal(f.calls.length, 0);
  authorized = true;
  await f.auth.syncProfile();
  assert.equal(f.calls[0].body.avatarUrl, '');
  assert.equal(f.calls[0].body.region, null);
});
const policy = { origins: ['https://img.tapimg.net'], maxBytes: 8 };
test('one hundred delayed avatars retain their own URL until decoding finishes', async (t) => {
  const live = new Set();
  let next = 0;
  t.mock.method(URL, 'createObjectURL', () => {
    const url = `blob:fixture-${++next}`;
    live.add(url);
    return url;
  });
  t.mock.method(URL, 'revokeObjectURL', (url) => live.delete(url));
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }),
  );
  const oldDocument = globalThis.document;
  t.after(() => {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  });
  globalThis.document = {
    createTextNode: (text) => ({ text }),
    createElement: () => ({
      kind: 'image',
      set src(url) {
        queueMicrotask(() => (live.has(url) ? this.onload() : this.onerror()));
      },
    }),
  };
  const elements = Array.from({ length: 100 }, (_unused, index) => {
    const element = {
      dataset: {},
      isConnected: true,
      removeAttribute() {},
      style: { removeProperty() {} },
      replaceChildren(...nodes) {
        this.children = nodes;
      },
    };
    return renderAvatar(
      element,
      { name: '玩家', avatarUrl: `https://img.tapimg.net/cache-fixture-${index}` },
      policy,
    );
  });
  for (
    let attempt = 0;
    attempt < 100 && elements.some((element) => element.children[0].kind !== 'image');
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert(elements.every((element) => element.children[0].kind === 'image'));
  assert.equal(live.size, 0);
});

test('avatars refuse redirects, arbitrary origins, SVG, secrets and oversized streamed bodies', async () => {
  for (const value of [
    'https://127.0.0.1/a',
    'https://img.tapimg.net.attacker/a',
    'https://img.tapimg.net/a?token=x',
    'data:image/png;base64,x',
    'https://img.tapimg.net/a#x',
  ])
    assert.equal(allowedAvatar(value, policy), false);
  assert.equal(allowedAvatar('https://img.tapimg.net/a', policy), true);
  let options;
  const image = await avatarBlob('https://img.tapimg.net/a', policy, async (_url, init) => {
    options = init;
    return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } });
  });
  assert.equal(image.size, 2);
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  assert.equal(options.referrerPolicy, 'no-referrer');
  for (const [type, bytes] of [
    ['image/svg+xml', 2],
    ['image/png', 9],
  ])
    assert.equal(
      await avatarBlob(
        'https://img.tapimg.net/a',
        policy,
        async () => new Response(new Uint8Array(bytes), { headers: { 'content-type': type } }),
      ),
      null,
    );
  assert.equal(regionText({ region: null }), '');
  assert.equal(profileDetails({}), '地区未知 · 默认资料');
});

test('rejected avatar headers cancel the body before releasing its download slot', async () => {
  for (const headers of [
    { 'content-type': 'image/svg+xml' },
    { 'content-type': 'image/png', 'content-length': '9' },
  ]) {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    assert.equal(
      await avatarBlob(
        'https://img.tapimg.net/invalid',
        policy,
        async () => new Response(body, { headers }),
      ),
      null,
    );
    assert.equal(cancelled, true);
  }
});
