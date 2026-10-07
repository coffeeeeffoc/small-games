import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { URL } from 'node:url';
import { startTapTapLogin } from '../login.cjs';

const config = {
  platform: 'taptap',
  appId: 'opaque_miniapp',
  apiUrl: 'https://api.example.com/v1/',
};
const token = 'a'.repeat(64);
const credential = () => ({ playerId: 'server-player', token, expiresAt: Date.now() + 3600000 });

function fixture(options = {}) {
  const calls = [];
  const values = new Map();
  const sdk = {
    login(input) {
      assert.equal(this, sdk);
      calls.push(['login']);
      input.success({ code: 'native-single-use-code' });
    },
    request(input) {
      assert.equal(this, sdk);
      calls.push(['request', input]);
      input.success({ statusCode: 200, data: credential() });
    },
    getStorageSync(key) {
      assert.equal(this, sdk);
      calls.push(['getStorageSync', key]);
      return values.get(key);
    },
    setStorageSync(key, value) {
      assert.equal(this, sdk);
      calls.push(['setStorageSync', key, value]);
      values.set(key, value);
    },
    ...options,
  };
  return { sdk, calls, values };
}

test('unconfigured previews and partial configuration need no SDK or browser APIs', async () => {
  for (const input of [
    { platform: 'taptap' },
    { platform: 'taptap', appId: config.appId },
    { platform: 'taptap', apiUrl: config.apiUrl },
  ]) {
    const state = startTapTapLogin(null, input);
    assert.equal(state.status, 'unconfigured');
    assert.equal(state.errorCode, null);
    assert.equal(await state.ready, null);
  }
});

test('native login exchanges only a public AppID and login code and stores the server credential', async () => {
  const { sdk, calls, values } = fixture();
  Object.defineProperty(config, 'secret', {
    get() {
      return assert.fail('client must not read a platform secret');
    },
    configurable: true,
  });
  const state = startTapTapLogin(sdk, config);
  assert.equal(state.status, 'authenticating');
  const result = await state.ready;
  assert.equal(state.status, 'authenticated');
  assert.equal(state.errorCode, null);
  assert.equal(result.token, token);
  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'playerId', 'token']);
  const request = calls.find(([method]) => method === 'request')[1];
  assert.equal(request.url, 'https://api.example.com/v1/sessions/platform');
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.header, { 'content-type': 'application/json' });
  assert.deepEqual(request.data, {
    platform: 'taptap',
    appId: config.appId,
    code: 'native-single-use-code',
  });
  assert.equal(request.timeout, 8000);
  assert.deepEqual(JSON.parse(values.get('competition-session-v1:taptap:opaque_miniapp')), result);
  delete config.secret;
});

test('valid shared-competition credentials bypass login and only the three public session fields are reused', async () => {
  const { sdk, calls, values } = fixture();
  const cached = {
    ...credential(),
    session_key: 'never-return-platform-key',
    secret: 'never-return-secret',
  };
  values.set('competition-session-v1:taptap:opaque_miniapp', JSON.stringify(cached));
  const state = startTapTapLogin(sdk, config);
  assert.deepEqual(await state.ready, {
    playerId: cached.playerId,
    token: cached.token,
    expiresAt: cached.expiresAt,
  });
  assert.deepEqual(
    calls.map(([method]) => method),
    ['getStorageSync'],
  );
});

test('concurrent boots for one SDK and public identity share exactly one native login', async () => {
  let complete;
  const { sdk, calls } = fixture({
    login(input) {
      assert.equal(this, sdk);
      calls.push(['login']);
      complete = input.success;
    },
  });
  const first = startTapTapLogin(sdk, config);
  const second = startTapTapLogin(sdk, { ...config, apiUrl: config.apiUrl.replace(/\/$/, '') });
  assert.equal(first, second);
  await Promise.resolve();
  complete({ code: 'one-code' });
  await Promise.all([first.ready, second.ready]);
  assert.equal(calls.filter(([method]) => method === 'login').length, 1);
  assert.equal(calls.filter(([method]) => method === 'request').length, 1);
});

test('expired, malformed, and denied storage require real login and never create a guest identity', async () => {
  for (const stored of [
    'not JSON',
    JSON.stringify({ ...credential(), expiresAt: Date.now() + 1000 }),
    JSON.stringify({ ...credential(), token: 'guest' }),
  ]) {
    const { sdk, calls, values } = fixture();
    values.set('competition-session-v1:taptap:opaque_miniapp', stored);
    await startTapTapLogin(sdk, config).ready;
    assert.equal(calls.filter(([method]) => method === 'login').length, 1);
    assert.equal(
      calls.find(([method]) => method === 'request')[1].url.endsWith('/sessions/platform'),
      true,
    );
  }
  const { sdk } = fixture({
    getStorageSync() {
      throw new Error('denied');
    },
    setStorageSync() {
      throw new Error('denied');
    },
  });
  assert.equal((await startTapTapLogin(sdk, config).ready).token, token);
});

test('invalid public configuration and configured missing native methods fail without a request', async () => {
  for (const invalid of [
    { ...config, platform: 'wechat' },
    { ...config, appId: 'contains spaces' },
    { ...config, appId: 'a'.repeat(101) },
    { ...config, apiUrl: 'http://api.example.com' },
    { ...config, apiUrl: 'https://user:password@api.example.com' },
    { ...config, apiUrl: 'https://api.example.com?token=private' },
    { ...config, apiUrl: 'https://api.example.com/#private' },
    { ...config, apiUrl: 'https://api.example.com\\@attacker.example' },
    { ...config, apiUrl: 'https://api.example.com:99999' },
  ]) {
    const { sdk, calls } = fixture();
    const state = startTapTapLogin(sdk, invalid);
    await assert.rejects(state.ready, (error) => error.code === 'INVALID_INPUT');
    assert.equal(state.status, 'failed');
    assert.equal(state.errorCode, 'INVALID_INPUT');
    assert.deepEqual(calls, []);
  }
  const state = startTapTapLogin({}, config);
  await assert.rejects(state.ready, (error) => error.code === 'PLATFORM_LOGIN_UNAVAILABLE');
  assert.equal(state.status, 'failed');
});

test('native failures, failed exchange and invalid credentials reject safely without persistent identity', async () => {
  const scenarios = [
    {
      login(input) {
        input.fail({ errMsg: 'secret-native-code' });
      },
      code: 'PLATFORM_LOGIN_FAILED',
    },
    {
      login(input) {
        input.success({});
      },
      code: 'PLATFORM_LOGIN_FAILED',
    },
    {
      login(input) {
        input.success({ code: '   ' });
      },
      code: 'PLATFORM_LOGIN_FAILED',
    },
    {
      request(input) {
        input.fail({ errMsg: 'secret-access-token' });
      },
      code: 'SERVICE_UNAVAILABLE',
    },
    {
      request(input) {
        input.success({
          statusCode: 503,
          data: { error: 'PLATFORM_NOT_CONFIGURED', secret: 'not-public' },
        });
      },
      code: 'PLATFORM_NOT_CONFIGURED',
    },
    {
      request(input) {
        input.success({ statusCode: 401, data: { error: 'arbitrary-secret-error' } });
      },
      code: 'PLATFORM_LOGIN_FAILED',
    },
    {
      request(input) {
        input.success({ statusCode: '200', data: credential() });
      },
      code: 'PLATFORM_LOGIN_FAILED',
    },
    {
      request(input) {
        input.success({
          statusCode: 200,
          data: { token: 'invalid', expiresAt: Date.now() + 3600000, playerId: 'a' },
        });
      },
      code: 'PLATFORM_LOGIN_FAILED',
    },
    {
      request(input) {
        input.success({ statusCode: 200, data: { ...credential(), playerId: '' } });
      },
      code: 'PLATFORM_LOGIN_FAILED',
    },
    {
      request(input) {
        input.success({ statusCode: 200, data: { ...credential(), expiresAt: Date.now() } });
      },
      code: 'PLATFORM_LOGIN_FAILED',
    },
  ];
  for (const { code, ...methods } of scenarios) {
    const { sdk, calls, values } = fixture(methods);
    const state = startTapTapLogin(sdk, config);
    await assert.rejects(state.ready, (error) => {
      assert.equal(error.code, code);
      assert.equal(error.message.includes('secret'), false);
      return true;
    });
    assert.equal(state.status, 'failed');
    assert.equal(state.errorCode, code);
    assert.equal(values.size, 0);
    assert.equal(
      calls.some(([method]) => method === 'setStorageSync'),
      false,
    );
  }
});

test('the isolated no-DOM native runtime logs only stable error codes and drops private response fields', async () => {
  const warnings = [];
  const context = {
    module: { exports: {} },
    console: {
      warn(value) {
        warnings.push(value);
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../login.cjs', import.meta.url), 'utf8'), context);
  assert.equal(context.fetch, undefined);
  assert.equal(context.document, undefined);
  assert.equal(context.URL, undefined);
  const { sdk } = fixture({
    request(input) {
      const data = credential();
      Object.defineProperty(data, 'session_key', {
        get() {
          return assert.fail('do not read session_key');
        },
      });
      Object.defineProperty(data, 'secret', {
        get() {
          return assert.fail('do not read secret');
        },
      });
      input.success({ statusCode: 200, data });
    },
  });
  const result = await context.module.exports.startTapTapLogin(sdk, config).ready;
  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'playerId', 'token']);
  const failed = context.module.exports.startTapTapLogin(
    {
      login() {
        throw new Error('private code');
      },
      request() {},
    },
    config,
  );
  await assert.rejects(failed.ready, (error) => error.code === 'PLATFORM_LOGIN_FAILED');
  assert.deepEqual(warnings, ['TapTap login failed (PLATFORM_LOGIN_FAILED).']);
});
