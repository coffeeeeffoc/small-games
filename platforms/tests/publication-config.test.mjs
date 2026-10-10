import assert from 'node:assert/strict';
import { test } from 'node:test';
import { domesticChannels, publicReleaseConfiguration } from '../publication-config.mjs';

test('public configuration preserves existing build contract without exposing server secrets', () => {
  const config = publicReleaseConfiguration('three-choose-two', 'wechat', {
    release: true,
    env: {
      MINIGAME_THREE_CHOOSE_TWO_WECHAT_APP_ID: 'wx0123456789abcdef',
      MINIGAME_THREE_CHOOSE_TWO_WECHAT_AD_UNIT_ID: 'adunit-public',
      WECHAT_APP_SECRET: 'must-not-ship',
      COMPETITION_PLATFORM_CONFIG: 'must-not-ship',
    },
  });
  assert.deepEqual(config, {
    'three-choose-two': { wechat: { appId: 'wx0123456789abcdef', adUnitId: 'adunit-public' } },
  });
  assert.equal(JSON.stringify(config).includes('must-not-ship'), false);
});

test('release is fail closed, preview may omit an AppID, unsupported advertising stays unavailable', () => {
  assert.throws(
    () => publicReleaseConfiguration('test', 'wechat', { release: true, env: {} }),
    /APP_ID/,
  );
  assert.deepEqual(publicReleaseConfiguration('test', 'wechat', { env: {} }), {
    test: { wechat: { appId: '', adUnitId: '' } },
  });
  assert.throws(
    () =>
      publicReleaseConfiguration('test', 'alipay', {
        env: { MINIGAME_TEST_ALIPAY_AD_UNIT_ID: 'adunit-test' },
      }),
    /not implemented/,
  );
  assert.throws(
    () =>
      publicReleaseConfiguration('test', 'wechat', {
        env: { MINIGAME_TEST_WECHAT_APP_ID: 'not-wx' },
      }),
    /Invalid/,
  );
});

test('six configured hosts and six reserved channels never imply every game has a native entry', () => {
  assert.equal(Object.values(domesticChannels).filter((channel) => channel.nativeHost).length, 6);
  for (const platform of ['qq', 'baidu', 'oppo', 'vivo', 'huawei', 'xiaomi']) {
    assert.equal(domesticChannels[platform].nativeHost, false);
    assert.throws(
      () => publicReleaseConfiguration('test', platform, { env: {} }),
      /unsupported native host/,
    );
  }
});
