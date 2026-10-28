import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext, createContext } from 'node:vm';
import { createTapTapRequire } from './taptap-smoke.mjs';
import '../../../platforms/competition/client.js';
import * as nativeLogin from '@coffeeeeffoc/platform-taptap/login';
import {
  installTapTapLogin,
  verifyTapTapLogin,
  tapTapLoginPrefix,
  publicTapTapLoginConfig,
} from './taptap-login.mjs';

test('TapTap login is installed in source before packing, preserving the original entry exactly', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-login-project-'));
  const config = { platform: 'taptap', game: 'carding-car', preview: true, appId: '', apiUrl: '' };
  const source = "require('./cocos-runtime.js');\n";
  try {
    await writeFile(path.join(directory, 'game.js'), source);
    assert.equal((await installTapTapLogin(directory, config)).configured, false);
    assert.doesNotMatch(
      await readFile(path.join(directory, 'tap-login.js'), 'utf8'),
      /\r\n/,
      'Windows and Linux must pack the same canonical helper bytes',
    );
    assert.equal(
      await readFile(path.join(directory, 'game.js'), 'utf8'),
      tapTapLoginPrefix(config) + source,
    );
    const release = {
      ...config,
      preview: false,
      appId: 'mini-app',
      apiUrl: 'https://api.example.com/competition/v1',
    };
    assert.equal((await installTapTapLogin(directory, release)).configured, true);
    assert.equal(
      await readFile(path.join(directory, 'game.js'), 'utf8'),
      tapTapLoginPrefix(release) + source,
    );
    await assert.rejects(verifyTapTapLogin(directory, config), /differs/);
    await writeFile(path.join(directory, 'tap-login.js'), 'module.exports=()=>null;');
    await assert.rejects(verifyTapTapLogin(directory, release), /differs/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a release login bootstrap cannot be made for missing public configuration or another platform', () => {
  assert.throws(() => tapTapLoginPrefix({ platform: 'wechat', preview: true }), /TapTap platform/);
  assert.throws(
    () =>
      tapTapLoginPrefix({ platform: 'taptap', game: 'carding-car', appId: 'mini-app', apiUrl: '' }),
    /server login API/,
  );
});

test('the installed entry calls the actual native helper and overrides Creator private WeChat identity', async () => {
  const config = {
    platform: 'taptap',
    game: 'carding-car',
    appId: 'tap-mini-app',
    apiUrl: 'https://api.example.com/v1',
    preview: false,
  };
  let request;
  const tap = {
    login() {
      assert.equal(this, tap);
      assert.fail('Anonymous bootstrap must not call platform login');
    },
    request(options) {
      assert.equal(this, tap);
      request = options;
      options.success({
        statusCode: 200,
        data: {
          playerId: 'server-player',
          game: 'carding-car',
          identityKind: 'guest',
          sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          token: 'a'.repeat(64),
          refreshToken: 'b'.repeat(64),
          expiresAt: Date.now() + 900000,
          refreshExpiresAt: Date.now() + 180 * 86400000,
        },
      });
    },
  };
  const context = {
    tap,
    __COMPETITION_CONFIG__: { platform: 'wechat', appId: 'wx-old' },
    require(name) {
      assert.equal(name, './tap-login.js');
      return nativeLogin;
    },
  };
  runInNewContext(
    tapTapLoginPrefix(config) +
      "globalThis.__COMPETITION_CONFIG__=Object.assign({platform:'wechat',appId:'wx-old'},globalThis.__COMPETITION_CONFIG__||{});globalThis.engineBooted=true;",
    context,
  );
  await context.__tapTapLogin.ready;
  assert.equal(context.engineBooted, true);
  assert.equal(context.__tapTapLogin.status, 'authenticated');
  assert.equal(context.__COMPETITION_CONFIG__.platform, 'taptap');
  assert.equal(context.__COMPETITION_CONFIG__.appId, 'tap-mini-app');
  assert.deepEqual(request.data, { game: 'carding-car' });
  assert(request.url.endsWith('/sessions/guest'));
  assert.equal(context.document, undefined);
  assert.equal(context.fetch, undefined);
});

test('Homebound release skips only its unused backend; configured public identity stays required', () => {
  const config = {
    platform: 'taptap',
    game: 'homebound-station',
    appId: 'homebound-app',
    apiUrl: '',
    preview: false,
  };
  assert.equal(publicTapTapLoginConfig(config).apiUrl, '');
  assert.throws(() => publicTapTapLoginConfig({ ...config, appId: '' }), /MiniApp ID/);
  assert.throws(
    () => publicTapTapLoginConfig({ ...config, apiUrl: 'https://unused.example.com/v1' }),
    /no server login consumer/,
  );
  assert.throws(
    () => publicTapTapLoginConfig({ ...config, game: 'carding-car' }),
    /server login API/,
  );
  assert.throws(
    () => publicTapTapLoginConfig({ ...config, game: 'wulong-city' }),
    /server login API/,
  );
});

test('the installed Homebound bridge consumes this target ad slot and runs with only tap in a native VM', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-homebound-ads-'));
  const config = {
    platform: 'taptap',
    game: 'homebound-station',
    appId: 'homebound-app',
    apiUrl: '',
    preview: false,
    adsEnabled: true,
    adUnitId: 'homebound-reward',
  };
  let onClose,
    plays = 0,
    requestedSlot;
  const tap = {
    createRewardedVideoAd(options) {
      assert.equal(this, tap);
      requestedSlot = options.adUnitId;
      return {
        onClose(callback) {
          onClose = callback;
        },
        offClose() {},
        onError() {},
        offError() {},
        load() {
          return Promise.resolve();
        },
        show() {
          plays++;
          return Promise.resolve();
        },
        destroy() {},
      };
    },
    login() {
      assert.fail('Offline Homebound must not request backend login');
    },
    request() {
      assert.fail('Offline Homebound must not call an unused backend');
    },
    createCanvas() {
      assert.fail('Rewarded bridge must not create a Canvas');
    },
  };
  try {
    await writeFile(path.join(directory, 'game.js'), 'globalThis.engineBooted=true;');
    await installTapTapLogin(directory, config);
    await installTapTapLogin(directory, config);
    const entry = await readFile(path.join(directory, 'game.js'), 'utf8');
    assert.equal(
      entry.split('installCreatorAdBridge').length,
      2,
      'Restaging cannot duplicate the bridge',
    );
    const context = createContext({ tap, setTimeout, clearTimeout, console });
    context.require = createTapTapRequire(directory, context);
    runInNewContext(entry, context);
    assert.equal(context.engineBooted, true);
    assert.equal(context.document, undefined);
    assert.equal(context.wx, undefined);
    const bridge = context.SmallGamesRewardAds;
    assert.equal(bridge.available, true);
    const result = bridge.offer({ id: 'homebound:speed:2', reward: { speed: 2 } });
    for (let i = 0; i < 12 && !plays; i++) await Promise.resolve();
    assert.equal(plays, 1);
    assert.equal(requestedSlot, 'homebound-reward');
    onClose({ isEnded: true });
    assert.equal((await result).status, 'completed');
    bridge.dispose();
    await writeFile(path.join(directory, 'tap-rewarded-ads.js'), '// tampered bridge');
    await assert.rejects(verifyTapTapLogin(directory, config), /rewarded bridge differs/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('packaged Night native entry uses official Tap login and shares the recovered identity', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'night-native-login-'));
  const config = {
    platform: 'taptap',
    game: 'night-overwatch',
    appId: 'tap-night-test',
    apiUrl: 'https://api.example.test/v1',
    preview: false,
  };
  try {
    await writeFile(path.join(directory, 'game.js'), 'globalThis.engineReady=true;\n');
    await installTapTapLogin(directory, config);
    const saved = new Map(),
      requests = [];
    const context = {
      URL,
      Date,
      setTimeout,
      clearTimeout,
      console,
      module: { exports: {} },
      tap: {
        getStorageSync: (key) => saved.get(key),
        setStorageSync: (key, value) => saved.set(key, value),
        login({ success }) {
          success({ code: 'night-code' });
        },
        request(options) {
          requests.push(options);
          if (options.url.endsWith('/games/night-overwatch')) {
            assert.equal(options.header.authorization, 'Bearer ' + 'a'.repeat(64));
            options.success({
              statusCode: 200,
              data: { identity: { playerId: 'same-night-player' } },
            });
            return;
          }
          options.success({
            statusCode: 200,
            data: {
              playerId: 'same-night-player',
              userId: 'same-night-player',
              identityKind: 'platform',
              game: 'night-overwatch',
              sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              token: 'a'.repeat(64),
              refreshToken: 'b'.repeat(64),
              expiresAt: Date.now() + 900000,
              refreshExpiresAt: Date.now() + 86400000,
            },
          });
        },
      },
    };
    createContext(context);
    context.require = createTapTapRequire(directory, context);
    runInNewContext(await readFile(path.join(directory, 'game.js'), 'utf8'), context);
    const cfg = publicTapTapLoginConfig(config);
    const state = context.__tapTapLogin;
    assert.equal((await state.ready).playerId, 'same-night-player');
    assert.equal(context.window, undefined);
    assert.equal(context.document, undefined);
    assert.equal(context.engineReady, true);
    await context.SmallGamesServices.ready;
    assert.equal(context.SmallGamesServices.status, 'ready');
    assert.equal(
      (await context.SmallGamesServices.services.identity()).playerId,
      'same-night-player',
    );
    assert(requests[0].url.endsWith('/sessions/platform'));
    assert.equal(requests[0].data.code, 'night-code');
    const auth = context.__createCompetitionIdentity({
      config: cfg,
      sdk: context.tap,
      storage: context.tap,
      request() {
        assert.fail('identity should be shared');
      },
    });
    assert.equal((await auth.current()).playerId, 'same-night-player');
    assert.equal(requests.filter((r) => r.url.endsWith('/sessions/platform')).length, 1);
    assert(!requests.some((r) => r.url.endsWith('/sessions/guest')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
