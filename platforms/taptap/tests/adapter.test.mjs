import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTapTapSdk } from '../normalize.mjs';
import { taptapPlatform } from '../build.mjs';

test('TapTap source configuration uses the documented AppID fields without preview identities', () => {
  const files = taptapPlatform.files({ game: 'history', appId: '', version: '1.2.3' });
  assert.equal(taptapPlatform.sdk, 'tap');
  assert.equal(taptapPlatform.advertising, false);
  assert.equal(files['game.json'].appId, '');
  assert.equal(files['project.config.json'].appid, '');
  assert.deepEqual(files['project.config.json'].setting, { es6: true });
  const configured = taptapPlatform.files({
    game: 'history',
    appId: 'opaque_miniapp',
    version: '1.2.3',
  });
  assert.equal(configured['game.json'].appId, 'opaque_miniapp');
  assert.equal(configured['project.config.json'].appid, 'opaque_miniapp');
  for (const value of ['id with spaces', 'id/path', 'id?query'])
    assert.equal(taptapPlatform.appId.test(value), false);
});

test('the adapter preserves native receiver, frozen SDK, touch identity and storage shape', () => {
  const calls = [];
  const value = { progress: 7 };
  const listener = () => {};
  const sdk = Object.freeze({
    createCanvas() {
      assert.equal(this, sdk);
      return 'native-canvas';
    },
    getSystemInfoSync() {
      assert.equal(this, sdk);
      return { windowWidth: 800, windowHeight: 450 };
    },
    onTouchCancel(fn) {
      assert.equal(this, sdk);
      calls.push(fn);
    },
    offTouchCancel(fn) {
      assert.equal(this, sdk);
      calls.push(fn);
    },
    getStorageSync(key) {
      assert.equal(this, sdk);
      assert.equal(key, 'save');
      return value;
    },
  });
  const normalized = normalizeTapTapSdk(sdk);
  assert.equal(normalized.createCanvas(), 'native-canvas');
  assert.equal({ ...normalized }.createCanvas(), 'native-canvas');
  assert.equal(normalized.createCanvas, normalized.createCanvas);
  assert.equal(normalized.getStorageSync('save'), value);
  normalized.onTouchCancel(listener);
  normalized.offTouchCancel(listener);
  assert.deepEqual(calls, [listener, listener]);
  assert.deepEqual(normalized.getSystemInfoSync(), { windowWidth: 800, windowHeight: 450 });
  assert.equal(normalized.createRewardedVideoAd, undefined);
});

test('window information uses the documented synchronous API and rejects invalid responses', () => {
  const expected = {
    windowWidth: 800,
    windowHeight: 450,
    safeArea: { left: 10, right: 790, top: 0, bottom: 450 },
  };
  const sdk = {
    createCanvas() {},
    getWindowInfo() {
      assert.equal(this, sdk);
      return expected;
    },
    getSystemInfoSync() {
      throw new Error('deprecated API must not be used');
    },
  };
  assert.equal(normalizeTapTapSdk(sdk).getSystemInfoSync(), expected);
  assert.throws(() => normalizeTapTapSdk({ createCanvas() {} }).getSystemInfoSync(), /unavailable/);
  sdk.getWindowInfo = () => ({});
  assert.throws(() => normalizeTapTapSdk(sdk).getSystemInfoSync(), /invalid window/);
  assert.throws(() => normalizeTapTapSdk(undefined), /tap.createCanvas/);
});

test('unavailable optional exit fails instead of reporting an invented success', () => {
  let failed = 0;
  const normalized = normalizeTapTapSdk({ createCanvas() {} });
  normalized.exitMiniProgram({
    success() {
      assert.fail('no native exit');
    },
    fail() {
      failed++;
    },
  });
  assert.equal(failed, 1);
  const logger = { info() {} };
  const sdk = {
    createCanvas() {},
    getLogManager() {
      assert.equal(this, sdk);
      return logger;
    },
  };
  assert.equal(normalizeTapTapSdk(sdk).getLogManager(), logger);
});
