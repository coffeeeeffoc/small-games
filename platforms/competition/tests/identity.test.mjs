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
const credential = (extra = {}) => ({
  userId: id,
  playerId: id,
  identityKind: 'guest',
  token: 'a'.repeat(64),
  expiresAt: Date.now() + 3600000,
  ...extra,
});
function fixture({ config = {}, sdk, storage = new Map(), handler } = {}) {
  const calls = [];
  const localStorage = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  };
  const context = {
    URL,
    setTimeout,
    clearTimeout,
    location: new URL('https://api.game.test/play'),
    crypto: { randomUUID: () => id },
  };
  runInNewContext(source, context);
  const options = {
    config: { apiUrl: 'https://api.game.test/v1', ...config },
    sdk,
    storage: localStorage,
    request: async (path, body, owner) => {
      calls.push({ path, body, owner });
      return handler ? handler(path, body, owner) : credential({ refreshToken: 'c'.repeat(64) });
    },
  };
  const auth = context.__createCompetitionIdentity(options);
  return {
    auth,
    calls,
    context,
    options,
    storage,
    save: (value) => storage.set(auth.storageKey, JSON.stringify(value)),
  };
}

test('unknown native providers fail closed; web-preview retains guest transport', async () => {
  for (const platform of ['alipay', 'unknown']) {
    const f = fixture({ config: { platform } });
    await assert.rejects(f.auth.current(), { code: 'PLATFORM_LOGIN_UNAVAILABLE' });
    assert.equal(f.calls.length, 0);
  }
  const f = fixture({ config: { platform: 'web-preview' } });
  await f.auth.current();
  assert.equal(f.calls[0].path, '/sessions/guest');
  assert.deepEqual(Object.keys(f.calls[0].body).sort(), ['identityVersion', 'installationId']);
  assert.equal(f.calls[0].body.identityVersion, 2);
});

test('reload and refresh retain the server UUID; installation ID alone cannot restore it', async () => {
  const storage = new Map();
  const first = fixture({ storage });
  const a = await first.auth.current();
  const reload = fixture({ storage });
  assert.equal((await reload.auth.current()).userId, a.userId);
  assert.equal(reload.calls.length, 0);
  reload.save({ ...a, expiresAt: 0 });
  assert.equal((await reload.auth.current()).userId, a.userId);
  assert.equal(reload.calls[0].path, '/sessions/refresh');
  assert.equal(reload.calls[0].owner, null);
  storage.delete(reload.auth.storageKey);
  const fresh = fixture({ storage, handler: () => credential({ userId: 'new-server-user' }) });
  assert.equal((await fresh.auth.current()).userId, 'new-server-user');
  assert.equal(fresh.calls[0].path, '/sessions/guest');
  assert.equal(fresh.calls[0].body.installationId, id);
});

test('guest protocol stays explicitly v2 when crypto and storage are unavailable', async () => {
  const f = fixture();
  delete f.context.crypto;
  const auth = f.context.__createCompetitionIdentity({
    ...f.options,
    storage: {
      getItem() {
        throw new Error('disabled');
      },
      setItem() {
        throw new Error('disabled');
      },
    },
  });
  await auth.current();
  assert.equal(f.calls[0].body.identityVersion, 2);
  assert.equal(f.calls[0].body.installationId, undefined);
});

test('expired credentials without recovery fail explicitly instead of silently replacing the user', async () => {
  const f = fixture();
  f.save(credential({ expiresAt: 0 }));
  await assert.rejects(f.auth.current(), { code: 'SESSION_EXPIRED' });
  assert.equal(f.calls.length, 0);
});

test('authority scope isolates endpoints and platform AppIDs and survives duplicate script loading', async () => {
  const f = fixture();
  const same = f.context.__createCompetitionIdentity(f.options);
  runInNewContext(source, f.context);
  assert.equal(f.context.__createCompetitionIdentity(f.options), same);
  const values = await Promise.all([same.current(), f.auth.current()]);
  assert.equal(values[0], values[1]);
  assert.equal(f.calls.length, 1);
  const other = f.context.__createCompetitionIdentity({
    ...f.options,
    config: { apiUrl: 'https://other.game.test/v1' },
  });
  assert.notEqual(other.storageKey, same.storageKey);
  assert.equal(other.saved(), null);
  const a = f.context.__createCompetitionIdentity({
    ...f.options,
    config: { platform: 'taptap', appId: 'a' },
  });
  const b = f.context.__createCompetitionIdentity({
    ...f.options,
    config: { platform: 'taptap', appId: 'b' },
  });
  assert.notEqual(a.storageKey, b.storageKey);
});

test('legacy migration needs known API authority and never probes a new API with an old bearer', async () => {
  for (const proven of [false, true]) {
    const f = fixture({
      config: { apiUrl: 'https://foreign.game.test/v1' },
      handler: (path) =>
        path === '/me' ? { userId: id } : credential({ refreshToken: 'c'.repeat(64) }),
    });
    f.storage.set(
      'competition-session-v1:h5',
      JSON.stringify(credential(proven ? { apiAuthority: f.auth.authority } : {})),
    );
    if (!proven) {
      await assert.rejects(f.auth.current(), { code: 'IDENTITY_MIGRATION_REQUIRED' });
      assert.equal(f.calls.length, 0);
    } else {
      assert.equal((await f.auth.current()).userId, id);
      assert.deepEqual(
        f.calls.map((call) => call.path),
        ['/me', '/sessions/refresh'],
      );
      assert.equal(f.calls[0].owner.token, 'a'.repeat(64));
    }
  }
});

test('upgrade retains the owner UUID and replaces only credentials for that same user', async () => {
  const f = fixture({
    handler: (path) =>
      credential(
        path === '/sessions/upgrade' ? { identityKind: 'platform', token: 'b'.repeat(64) } : {},
      ),
  });
  const old = credential();
  f.save(old);
  const upgraded = await f.auth.upgrade({ platform: 'taptap', appId: 'app', code: 'one-use' });
  assert.equal(upgraded.userId, id);
  assert.equal((await f.auth.forOwner(old)).token, upgraded.token);
  const someoneElse = credential({ userId: 'another', token: 'd'.repeat(64) });
  f.save(someoneElse);
  assert.equal((await f.auth.forOwner(old)).token, old.token);
});

test('account switching before upgrade or profile continuation sends no stale mutation', async () => {
  const f = fixture();
  f.save(credential());
  const upgrade = f.auth.upgrade({ platform: 'taptap', appId: 'app', code: 'one-use' });
  f.save(credential({ userId: 'other', token: 'b'.repeat(64) }));
  await assert.rejects(upgrade, { code: 'SESSION_CHANGED' });
  assert.equal(f.calls.length, 0);
  const sdk = {
    login() {},
    request() {},
    getStorageSync: (key) => f.storage.get(key),
    setStorageSync: (key, value) => f.storage.set(key, value),
    getSetting({ success }) {
      success({ authSetting: { 'scope.userInfo': true } });
    },
    getUserInfo({ success }) {
      success({ userInfo: { nickName: '玩家甲' } });
    },
  };
  const platform = fixture({
    config: { platform: 'taptap', appId: 'app' },
    sdk,
    storage: f.storage,
  });
  platform.save(credential({ identityKind: 'platform' }));
  const sync = platform.auth.syncProfile();
  platform.save(credential({ identityKind: 'platform', userId: 'other', token: 'b'.repeat(64) }));
  await assert.rejects(sync, { code: 'SESSION_CHANGED' });
  assert.equal(platform.calls.length, 0);
});

test('profile sync requires actual prior authorization and keeps unknown avatars/regions empty', async () => {
  let authorized = false;
  const storage = new Map();
  const sdk = {
    login() {},
    request() {},
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    getSetting({ success }) {
      success({ authSetting: { 'scope.userInfo': authorized } });
    },
    getUserInfo({ success }) {
      success({
        userInfo: { nickName: '玩家甲', avatarUrl: 'https://unknown.example/a', city: '不保留' },
      });
    },
  };
  const f = fixture({
    config: { platform: 'taptap', appId: 'app' },
    sdk,
    storage,
    handler: (_path, body) => ({ ...credential({ identityKind: 'platform' }), ...body }),
  });
  f.save(credential({ identityKind: 'platform' }));
  await assert.rejects(f.auth.syncProfile(), { code: 'PLATFORM_PROFILE_NOT_AUTHORIZED' });
  assert.equal(f.calls.length, 0);
  authorized = true;
  await f.auth.syncProfile();
  assert.equal(f.calls[0].body.avatarUrl, '');
  assert.equal(f.calls[0].body.region, null);
  assert.equal(f.calls[0].body.source, 'user-authorized');
});

const policy = { origins: ['https://img.tapimg.net'], maxBytes: 8 };
test('an old profile form cannot send its input to a newly selected user', async () => {
  const f = fixture();
  let requests = 0;
  Object.assign(f.context, {
    localStorage: f.options.storage,
    AbortSignal,
    fetch: async () => {
      requests++;
      throw Error('must not send');
    },
  });
  f.context.__installCompetition(f.options.config);
  f.save(credential({ userId: 'new-user', playerId: 'new-user' }));
  await assert.rejects(
    f.context.__competition.request('/me', { body: JSON.stringify({ name: '旧表单' }) }, id),
    { code: 'SESSION_CHANGED' },
  );
  assert.equal(requests, 0);
});

test('a profile request paused at session resolution cannot write after an account or token switch', async () => {
  for (const changed of [
    credential({ userId: 'new-user', playerId: 'new-user' }),
    credential({ token: 'b'.repeat(64) }),
  ]) {
    const f = fixture();
    let requests = 0;
    Object.assign(f.context, {
      localStorage: f.options.storage,
      AbortSignal,
      fetch: async () => {
        requests++;
        throw Error('must not send');
      },
    });
    f.context.__installCompetition(f.options.config);
    f.save(credential());
    const pending = f.context.__competition.request(
      '/me',
      { body: JSON.stringify({ name: '旧表单' }) },
      id,
    );
    f.save(changed);
    await assert.rejects(pending, { code: 'SESSION_CHANGED' });
    assert.equal(requests, 0);
  }
});

test('an unscoped native legacy account reauthenticates with official code without leaking its old bearer', async () => {
  const storage = new Map([['competition-session-v1:taptap:app', JSON.stringify(credential())]]);
  const sdk = {
    login({ success }) {
      success({ code: 'official-code' });
    },
    request() {},
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
  };
  const f = fixture({
    config: { platform: 'taptap', appId: 'app' },
    sdk,
    storage,
    handler: () => credential({ identityKind: 'platform' }),
  });
  assert.equal((await f.auth.current()).userId, id);
  assert.equal(f.calls[0].path, '/sessions/platform');
  assert.equal(f.calls[0].owner, null);
  assert.equal(f.calls[0].body.code, 'official-code');
});

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
