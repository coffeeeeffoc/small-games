import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { validateConfig, requiredRelease } from '../scripts/android-config.mjs';

test('release rejects missing inputs, invalid versions and absent keystores without revealing values', () => {
  assert.throws(() => validateConfig({}, { release: true }), /Missing release settings/);
  const config = Object.fromEntries(requiredRelease.map(key => [key, 'local-test-secret']));
  Object.assign(config, { WULONG_APPLICATION_ID: 'cn.test.wulong', WULONG_VERSION_CODE: '1', WULONG_VERSION_NAME: '2.0.0', TAPAD_MEDIA_ID: '123', TAPAD_HINT_SPACE_ID: '456', WULONG_PRIVACY_URL: 'https://privacy.test.cn/wulong', ANDROID_KEYSTORE_PATH: 'sign.jks' });
  const options = { release: true, root: process.cwd(), exists: () => true };
  assert.equal(validateConfig({ ...config }, options).WULONG_VERSION_CODE, '1');
  assert.equal(validateConfig({ ...config, TAPAD_HINT_SPACE_ID: '9007199254740993' }, options).TAPAD_HINT_SPACE_ID, '9007199254740993');
  assert.throws(() => validateConfig({ ...config, TAPAD_HINT_SPACE_ID: '9223372036854775808' }, options), /Invalid TAPAD_HINT_SPACE_ID/);
  assert.throws(() => validateConfig({ ...config, WULONG_VERSION_CODE: '1oops' }, options), /Invalid WULONG_VERSION_CODE/);
  assert.throws(() => validateConfig({ ...config, WULONG_PRIVACY_URL: 'http://privacy.test.cn' }, options), /HTTPS/);
  assert.throws(() => validateConfig({ ...config }, { ...options, exists: () => false }), /does not exist/);
  assert.throws(() => validateConfig({ TAPAD_MEDIA_KEY: 'do-not-print-me' }, options), error => !error.message.includes('do-not-print-me'));
  assert.deepEqual(validateConfig({}, { root: process.cwd() }), {});
});

const bridge = await readFile(new URL('../android-bridge.js', import.meta.url), 'utf8');
test('Android bridge correlates requests, validates outcomes and drops stale/duplicate callbacks', async () => {
  const calls = [];
  const context = vm.createContext({ addEventListener() {}, WulongAndroidHost: {
    capabilities: () => '{"rewarded":true}', showRewarded: (...args) => calls.push(args), cancelRewarded() {},
  } });
  vm.runInContext(bridge, context);
  const native = context.WulongNative, request = { opportunityId: 'wulong-city:hint-highlight', kind: 'rewarded' };
  assert.equal((await native.provider.show({ ...request, kind: 'interstitial' })).status, 'unavailable');
  const first = native.provider.show(request);
  assert.equal((await native.provider.show(request)).status, 'unavailable');
  native.deliver('wrong', 'completed');
  native.deliver(calls[0][0], 'completed');
  assert.equal((await first).status, 'completed');
  const second = native.provider.show(request);
  native.deliver(calls[0][0], 'completed');
  native.provider.cancel();
  assert.equal((await second).status, 'dismissed');
  const third = native.provider.show(request);
  native.deliver(calls[2][0], 'video-closed');
  assert.equal((await third).status, 'failed');
});
test('ordinary browser and unconfigured APK never gain a mock native provider', () => {
  for (const host of [undefined, { capabilities: () => '{"rewarded":false}' }]) {
    const context = vm.createContext({ WulongAndroidHost: host, addEventListener() {} });
    vm.runInContext(bridge, context);
    assert.equal(context.WulongNative?.provider, undefined);
  }
});
