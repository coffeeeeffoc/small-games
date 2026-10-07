import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import * as nativeLogin from '../../../platforms/taptap/login.cjs';
import { installTapTapLogin, verifyTapTapLogin, tapTapLoginPrefix } from './taptap-login.mjs';

test('TapTap login is installed in source before packing, preserving the original entry exactly', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-login-project-'));
  const config = { platform: 'taptap', game: 'carding-car', preview: true, appId: '', apiUrl: '' };
  const source = "require('./cocos-runtime.js');\n";
  try {
    await writeFile(path.join(directory, 'game.js'), source);
    assert.equal((await installTapTapLogin(directory, config)).configured, false);
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
    login(options) {
      assert.equal(this, tap);
      options.success({ code: 'single-use-code' });
    },
    request(options) {
      assert.equal(this, tap);
      request = options;
      options.success({
        statusCode: 200,
        data: { playerId: 'server-player', token: 'a'.repeat(64), expiresAt: Date.now() + 3600000 },
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
  assert.equal(request.data.platform, 'taptap');
  assert.equal(request.data.appId, 'tap-mini-app');
  assert.equal(context.document, undefined);
  assert.equal(context.fetch, undefined);
});
