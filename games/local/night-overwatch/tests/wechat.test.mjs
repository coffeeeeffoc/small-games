import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { wechatConfiguration, wechatCreatorOptions, wechatBootstrapSource, finishWechatBuild, verifyWechatBuild } from '../scripts/wechat-build.mjs';

test('WeChat preview/release use separate resources and reject invalid public configuration', () => {
  const preview = wechatConfiguration({}, {});
  assert.equal(preview.resourceUrl, 'http://127.0.0.1:4320/');
  assert.equal(preview.apiUrl, '');
  assert.equal(preview.adUnitId, '');
  assert.equal(wechatCreatorOptions(preview).server, preview.resourceUrl);
  assert.throws(() => wechatConfiguration({}, {}, true), /APP_ID/);
  assert.throws(() => wechatConfiguration({}, { WECHAT_APP_ID: 'wx0123456789abcdef' }, true), /resource/);
  for (const url of ['http://example.com/', 'https://user:password@example.com/', 'https://example.com/?secret=bad'])
    assert.throws(() => wechatConfiguration({ wechatResourceUrl: url }, {}), /URL/);
  assert.throws(() => wechatConfiguration({ wechatAdUnitId: '1054323' }, {}), /adunit/);
  const release = wechatConfiguration({}, { WECHAT_APP_ID: 'wx0123456789abcdef',
    NIGHT_WECHAT_RESOURCE_URL: 'https://cdn.example.com/night/1.1.5',
    NIGHT_WECHAT_API_URL: 'https://api.example.com/v1/', NIGHT_WECHAT_AD_UNIT_ID: 'adunit-1234abcd' }, true);
  assert.equal(release.resourceUrl, 'https://cdn.example.com/night/1.1.5/');
  assert.equal(release.apiUrl, 'https://api.example.com/v1');
});

test('real bundled bootstrap works without DOM, URL, fetch or IndexedDB; preserves native sessions and chat queries', async () => {
  const storage = new Map(), requests = [];
  const game = 'night-overwatch', playerId = 'native-player';
  const sdk = {
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    getStorageSync: (key) => storage.get(key) ?? '',
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    request(input) {
      requests.push(input);
      const data = input.url.endsWith('/sessions/guest') ? {
        identityKind: 'guest', game, playerId, token: 'a'.repeat(64), refreshToken: 'b'.repeat(64),
        sessionId: '00000000-0000-4000-8000-000000000001',
        expiresAt: Date.now() + 900000, refreshExpiresAt: Date.now() + 86400000,
      } : input.url.includes('/chat?') ? { messages: [], cursor: '', serverNow: Date.now() } :
        { game, capabilities: { identity: true, leaderboards: false }, boards: [] };
      input.success({ statusCode: 200, data });
    },
  };
  const config = {
    service: { game, platform: 'wechat', appId: 'wx0123456789abcdef',
      apiUrl: 'https://api.example.com/v1', competitionEnabled: true },
    ads: { platform: 'wechat', adsEnabled: false, adUnitId: '' },
  };
  const source = await wechatBootstrapSource(config);
  const context = vm.createContext({ wx: sdk, setTimeout, clearTimeout, console });
  vm.runInContext('Object.hasOwn = undefined; Array.prototype.at = undefined; Array.prototype.flatMap = undefined;', context);
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('typeof structuredClone', context), 'function');
  const bridge = context.SmallGamesServices;
  await bridge.ready;
  assert.equal(bridge.status, 'ready');
  assert.equal(context.SmallGamesRewardAds.available, false);
  assert.equal(requests[0].url, 'https://api.example.com/v1/sessions/guest');
  assert.equal(context.__nightStorage.length, 1);
  context.__nightStorage.setItem('night-fixture', 'saved');
  assert.equal(context.__nightStorage.getItem('night-fixture'), 'saved');
  assert.equal(context.__nightStorage.key(1), 'night-fixture');
  context.__nightStorage.removeItem('night-fixture');
  assert.equal(context.__nightStorage.getItem('night-fixture'), null);
  await bridge.services.nightChat({ cursor: 'a+b & c', waitMs: 500, direct: true, peer: 'p&x', before: 'b?1' }, playerId);
  const query = new URL(requests.at(-1).url).searchParams;
  assert.equal(query.get('cursor'), 'a+b & c');
  assert.equal(query.get('peer'), 'p&x');
  assert.equal(query.get('before'), 'b?1');
  assert.equal(query.get('direct'), '1');
  assert.equal(query.get('waitMs'), '500');
  const reopened = vm.createContext({ wx: sdk, setTimeout, clearTimeout, console });
  vm.runInContext(source, reopened);
  await reopened.SmallGamesServices.ready;
  assert.equal(requests.filter((request) => request.url.endsWith('/sessions/guest')).length, 1);
  sdk.setStorageSync = () => { throw Error('quota'); };
  assert.throws(() => reopened.__nightStorage.setItem('journal', 'record'), /quota/);
});

test('offline WeChat bootstrap never calls the network or manufactures rewards', async () => {
  const source = await wechatBootstrapSource({ service: { game: 'night-overwatch', platform: 'wechat',
    appId: 'touristappid', apiUrl: '', competitionEnabled: false },
  ads: { platform: 'wechat', adsEnabled: false, adUnitId: '' } });
  const context = vm.createContext({ wx: {}, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  assert.equal(context.SmallGamesServices, undefined);
  assert.equal((await context.SmallGamesRewardAds.offer({ id: 'supply' })).status, 'unavailable');
});

test('WeChat delivery binds source, public configuration, remote bytes and the complete main budget', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'night-wechat-delivery-'));
  const directory = path.join(temp, 'wechatgame');
  const config = wechatConfiguration({}, {});
  try {
    await mkdir(path.join(directory, 'remote/resources'), { recursive: true });
    await mkdir(path.join(directory, 'src'), { recursive: true });
    await writeFile(path.join(directory, 'remote/resources/config.json'), '{}');
    await writeFile(path.join(directory, 'src/settings.json'), JSON.stringify({ assets: {
      server: config.resourceUrl, remoteBundles: ['resources'], subpackages: [],
    } }));
    await writeFile(path.join(directory, 'project.config.json'), JSON.stringify({ appid: config.appId }));
    await writeFile(path.join(directory, 'game.json'), JSON.stringify({ deviceOrientation: 'landscape' }));
    await writeFile(path.join(directory, 'game.js'), '// Creator fixture');
    await finishWechatBuild(directory, config, { version: '1.2.3', backendVersion: '1.1.0' }, 'source-fixture');
    assert.match(await readFile(path.join(directory, 'game.js'), 'utf8'), /^require\('\.\/night-wechat.js'\)/);
    const entry = async (name) => {
      const data = await readFile(path.join(directory, name));
      return { path: name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    };
    const manifest = JSON.parse(await readFile(path.join(directory, 'wechat-manifest.json'), 'utf8'));
    const outerFiles = [...manifest.files, await entry('wechat-manifest.json')].sort((a, b) => a.path.localeCompare(b.path));
    await writeFile(path.join(directory, 'platform-manifest.json'), JSON.stringify({ files: outerFiles }));
    await verifyWechatBuild(directory, config, 'source-fixture');
    await assert.rejects(verifyWechatBuild(directory, config, 'stale'), /source changed/);
    await assert.rejects(verifyWechatBuild(directory, { ...config, apiUrl: 'https://other.example.com' }, 'source-fixture'));
    await writeFile(path.join(directory + '-remote', 'remote/resources/config.json'), 'changed');
    await assert.rejects(verifyWechatBuild(directory, config, 'source-fixture'), /Remote resource integrity/);
    await writeFile(path.join(directory + '-remote', 'remote/resources/config.json'), '{}');
    const allFiles = [...outerFiles, await entry('platform-manifest.json')].sort((a, b) => a.path.localeCompare(b.path));
    await writeFile(path.join(directory, 'artifact-manifest.json'), JSON.stringify({ files: allFiles, padding: 'x'.repeat(4 * 1024 * 1024) }));
    await assert.rejects(verifyWechatBuild(directory, config, 'source-fixture'), /main package exceeds/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
