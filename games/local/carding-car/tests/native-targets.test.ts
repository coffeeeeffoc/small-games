import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nativeTarget, nativePackages, verifyNativeOutput } from '../scripts/native-targets.mjs';

test('native channels use the official Creator extension and cannot reuse another platform AppID', () => {
  const douyin = nativeTarget('douyin', { douyinAppId: 'ttLocalTestApp' }, {});
  assert.equal(douyin.platform, 'bytedance-mini-game');
  assert.equal(douyin.channel, 'douyin');
  assert.equal(douyin.outputName, 'bytedance-mini-game');
  assert.equal(nativePackages('douyin', { douyinAppId: 'ttLocalTestApp' }, {})['bytedance-mini-game'].appid, 'ttLocalTestApp');
  assert.throws(() => nativeTarget('douyin', { douyinAppId: 'wxOtherChannel' }, {}), /Douyin tt/);
  assert.throws(() => nativeTarget('wechatgame', { wechatAppId: 'ttOtherChannel' }, {}), /WeChat wx/);
  assert.throws(() => nativeTarget('bilibili', { bilibiliAppId: 'wxOtherChannel' }, {}), /Bilibili/);
  assert.equal(nativeTarget('douyin', {}, {}).configured, false);
  assert.equal(nativeTarget('wechatgame', {}, {}).outputAppId, 'touristappid');
  assert.equal(nativeTarget('wechatgame', { wechatAppId: 'touristappid' }, {}).configured, false);
  assert.equal(nativeTarget('bilibili', {}, {}).outputAppId, 'preview-only');
  assert.throws(() => nativeTarget('kuaishou', {}, {}), /no verified Kuaishou/);
  assert.equal(nativeTarget('douyin', { douyinAppId: 'ttLocal' }, { DOUYIN_APP_ID: 'ttEnvironment' }).appId, 'ttEnvironment');
});

test('native output validation rejects wrong identity, portrait layouts and oversized main packages', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kart-native-target-'));
  try {
    const descriptor = nativeTarget('douyin', { douyinAppId: 'ttLocalTestApp' }, {});
    const writeGame = (orientation: string) => writeFile(path.join(directory, 'game.json'), JSON.stringify({
      deviceOrientation: orientation, subpackages: [{ name: 'resources', root: 'subpackages/resources' }],
    }));
    await writeGame('landscape');
    await writeFile(path.join(directory, 'game.js'), '// Creator engine entry');
    await writeFile(path.join(directory, 'project.config.json'), JSON.stringify({ appid: 'wxOtherChannel' }));
    await assert.rejects(verifyNativeOutput(directory, descriptor), /AppID/);
    await writeFile(path.join(directory, 'project.config.json'), JSON.stringify({ appid: descriptor.outputAppId }));
    await writeGame('portrait');
    await assert.rejects(verifyNativeOutput(directory, descriptor), /landscape/);
    await writeGame('landscape');
    await mkdir(path.join(directory, 'subpackages/resources'), { recursive: true });
    await writeFile(path.join(directory, 'build-info.json'), JSON.stringify({ creator: '3.8.8', sourceHash: 'old-source' }));
    await assert.rejects(verifyNativeOutput(directory, descriptor, 'current-source'), /does not match current sources/);
    await verifyNativeOutput(directory, descriptor, 'old-source');
    const large = Buffer.alloc(4 * 1024 * 1024 + 1);
    await writeFile(path.join(directory, 'subpackages/resources/art.bin'), large);
    assert((await verifyNativeOutput(directory, descriptor)).mainBytes < 1000, 'Subpackage art is excluded from the main budget');
    await writeFile(path.join(directory, 'main.bin'), large);
    await assert.rejects(verifyNativeOutput(directory, descriptor), /budget exceeded/);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('kart-native-target-'));
    await rm(directory, { recursive: true, force: true });
  }
});
