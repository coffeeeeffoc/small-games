import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source =
  fs.readFileSync(new URL('../../competition/client.js', import.meta.url), 'utf8') +
  '\n' +
  fs.readFileSync(new URL('../login.cjs', import.meta.url), 'utf8');
const config = {
  platform: 'taptap',
  game: 'xiangqi-five',
  appId: '',
  apiUrl: 'https://api.example.com/v1/',
};
const family = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function fixture(options = {}) {
  let now = Date.now(),
    generation = 0,
    game = config.game;
  const calls = [],
    values = new Map(),
    warnings = [];
  class ClockDate extends Date {
    static now() {
      return now;
    }
  }
  const context = vm.createContext({
    module: { exports: {} },
    Date: ClockDate,
    setTimeout,
    clearTimeout,
    console: { warn: (value) => warnings.push(value) },
  });
  vm.runInContext(source, context);
  const credential = () => ({
    playerId: game + '-player',
    userId: game + '-player',
    game,
    identityKind: 'guest',
    sessionId: family,
    token: String(generation).repeat(64),
    refreshToken: 'b'.repeat(64),
    expiresAt: now + 900000,
    refreshExpiresAt: now + 180 * 86400000,
  });
  const sdk = {
    login() {
      assert.fail('No platform login is needed');
    },
    getStorageSync(key) {
      return values.get(key);
    },
    setStorageSync(key, value) {
      values.set(key, value);
    },
    removeStorageSync(key) {
      values.delete(key);
    },
    request(input) {
      assert.equal(this, sdk);
      calls.push(input);
      generation++;
      if (input.data.game) game = input.data.game;
      const data = credential();
      Object.defineProperty(data, 'session_key', {
        get() {
          assert.fail('Do not copy platform secrets');
        },
      });
      Object.defineProperty(data, 'secret', {
        get() {
          assert.fail('Do not copy secrets');
        },
      });
      input.success({ statusCode: 200, data });
    },
    ...options,
  };
  return {
    sdk,
    calls,
    values,
    warnings,
    context,
    boot: context.module.exports.startTapTapLogin,
    advance: (ms) => {
      now += ms;
    },
  };
}

test('no API means local preview; AppID and platform login are unnecessary for anonymous service', async () => {
  const f = fixture();
  assert.equal(await f.boot(null, { ...config, apiUrl: '' }).ready, null);
  const state = f.boot(f.sdk, config),
    value = await state.ready;
  assert.equal(state.status, 'authenticated');
  assert.equal(value.game, config.game);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://api.example.com/v1/sessions/guest');
  assert.equal(JSON.stringify(f.calls[0].data), JSON.stringify({ game: config.game }));
  assert.equal(f.calls[0].timeout, 8000);
  assert.equal(f.context.document, undefined);
  assert.equal(f.context.fetch, undefined);
  assert.equal(f.context.URL, undefined);
  assert.doesNotMatch(JSON.stringify(value), /session_key|secret/);
});

test('concurrent boot and repeated use reuse the shared game/API identity; expiry refreshes the same owner', async () => {
  const f = fixture(),
    first = f.boot(f.sdk, config),
    second = f.boot(f.sdk, config);
  assert.equal(first, second);
  const [a, b] = await Promise.all([first.ready, second.ready]);
  assert.equal(a.token, b.token);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.boot(f.sdk, config).ready).token, a.token);
  f.advance(900000);
  const renewed = await f.boot(f.sdk, config).ready;
  assert.equal(renewed.playerId, a.playerId);
  assert.equal(renewed.sessionId, family);
  assert.notEqual(renewed.token, a.token);
  assert.equal(f.calls.at(-1).url, 'https://api.example.com/v1/sessions/refresh');
  assert.equal(
    JSON.stringify(f.calls.at(-1).data),
    JSON.stringify({ refreshToken: a.refreshToken }),
  );
  const key =
    'competition-session-v3:' +
    encodeURIComponent('https://api.example.com/v1|taptap||xiangqi-five');
  assert.equal(JSON.parse(f.values.get(key)).token, renewed.token);
  await f.boot(f.sdk, { ...config, game: 'cops-robbers' }).ready;
  await f.boot(f.sdk, { ...config, apiUrl: 'https://other.example.com/v1' }).ready;
  assert.equal(f.values.size, 3);
});

test('network failure preserves credentials and retry refreshes instead of changing identity', async () => {
  const f = fixture();
  const first = await f.boot(f.sdk, config).ready;
  const saved = [...f.values.values()][0],
    request = f.sdk.request;
  f.advance(900000);
  f.sdk.request = (input) => input.fail({ errMsg: 'private-token' });
  await assert.rejects(f.boot(f.sdk, config).ready, { code: 'SERVICE_UNAVAILABLE' });
  assert.equal([...f.values.values()][0], saved);
  f.sdk.request = request;
  assert.equal((await f.boot(f.sdk, config).ready).playerId, first.playerId);
  assert.doesNotMatch(f.warnings.join(), /private-token/);
});

test('denied or corrupt storage still allows an in-memory anonymous session', async () => {
  for (const options of [
    {},
    {
      getStorageSync() {
        throw Error('denied');
      },
      setStorageSync() {
        throw Error('denied');
      },
    },
  ]) {
    const f = fixture(options);
    f.values.set(
      'competition-session-v3:' +
        encodeURIComponent('https://api.example.com/v1|taptap||xiangqi-five'),
      'broken',
    );
    const first = await f.boot(f.sdk, config).ready;
    assert.equal((await f.boot(f.sdk, config).ready).playerId, first.playerId);
    assert.equal(f.calls.length, 1);
  }
});

test('invalid configuration fails before requests and service failures expose only fixed codes', async () => {
  for (const invalid of [
    { ...config, platform: 'wechat' },
    { ...config, game: '' },
    { ...config, appId: 'contains spaces' },
    { ...config, appId: 'a'.repeat(101) },
    ...[
      'http://api.example.com',
      'https://user:password@api.example.com',
      'https://api.example.com?token=private',
      'https://api.example.com/#private',
      'https://api.example.com:99999',
      'https://api.example.com\\@attacker.example',
    ].map((apiUrl) => ({ ...config, apiUrl })),
  ]) {
    const f = fixture();
    await assert.rejects(f.boot(f.sdk, invalid).ready, { code: 'INVALID_INPUT' });
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  await assert.rejects(f.boot({}, config).ready, { code: 'PLATFORM_LOGIN_UNAVAILABLE' });
  for (const [response, code] of [
    [{ statusCode: 503, data: { error: 'RATE_LIMITED' } }, 'RATE_LIMITED'],
    [{ statusCode: 401, data: { error: 'private-secret' } }, 'SERVICE_UNAVAILABLE'],
    [{ statusCode: '200', data: {} }, 'SERVICE_UNAVAILABLE'],
    [{ statusCode: 200, data: { token: 'invalid' } }, 'SESSION_EXPIRED'],
  ]) {
    const f = fixture({ request: (input) => input.success(response) });
    await assert.rejects(f.boot(f.sdk, config).ready, { code });
    assert.equal(f.values.size, 0);
    assert.doesNotMatch(f.warnings.join(), /private-secret/);
  }
});

test('bootstrap and the actual bridge share one identity and authenticated logout even with denied storage', async () => {
  for (const denied of [false, true])
    for (const first of ['bootstrap', 'bridge']) {
      const f = fixture(
        denied
          ? {
              getStorageSync() {
                throw Error('denied');
              },
              setStorageSync() {
                throw Error('denied');
              },
            }
          : {},
      );
      let boot;
      if (first === 'bootstrap') boot = f.boot(f.sdk, config);
      f.context.__installCompetition(config, f.sdk);
      const api = f.context.__competition,
        pending = api.session();
      boot ??= f.boot(f.sdk, config);
      const [a, b] = await Promise.all([boot.ready, pending]);
      assert.equal(a.token, b.token);
      assert.equal(f.calls.length, 1);
      assert.equal((await api.session()).token, a.token);
      await api.logout();
      const logout = f.calls.at(-1);
      assert.equal(logout.url, 'https://api.example.com/v1/sessions/logout');
      assert.equal(logout.header.Authorization || logout.header.authorization, 'Bearer ' + a.token);
    }
});
