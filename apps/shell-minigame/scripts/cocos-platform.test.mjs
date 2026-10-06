import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  descriptor,
  channels,
  buildPlatform,
  alipayConfig,
  verifyManifest,
  prepareNativeInputs,
} from './cocos-platform.mjs';

test('all five channels reject missing release IDs before tools or adapters', async () => {
  for (const channel of Object.keys(channels)) {
    assert.equal(descriptor(channel, { env: {} }).appId, '');
    assert.throws(() => descriptor(channel, { mode: 'release', env: {} }), /Release requires/);
    await assert.rejects(
      buildPlatform('/does-not-exist', channel, { mode: 'release', env: {} }),
      /Release requires/,
    );
  }
  assert.throws(
    () =>
      descriptor('kuaishou', { mode: 'release', env: { KUAISHOU_APP_ID: 'kwai_game_test_appid' } }),
    /Release requires/,
  );
  assert.throws(() => descriptor('wechat', { env: { WECHAT_APP_ID: 'touristappid' } }), /public/);
  assert.throws(() => descriptor('bilibili', { env: { BILIBILI_APP_ID: 'wxWrong' } }), /public/);
  assert.throws(() => descriptor('alipay', { env: { ALIPAY_APP_ID: 'wxWrong' } }), /public/);
  await assert.rejects(
    buildPlatform('/does-not-exist', 'kuaishou', { env: {} }),
    /Kuaishou requires/,
  );
});
test('Alipay uses its own documented target and deviceOrientation field', () => {
  const config = alipayConfig('carding-car');
  assert.equal(config.platform, 'alipay-mini-game');
  assert.equal(config.packages['alipay-mini-game'].deviceOrientation, 'landscape');
  assert.equal('wechatgame' in config.packages, false);
  assert.equal('appid' in config.packages['alipay-mini-game'], false);
});
test('native manifest detects tampered or added package files', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cocos-manifest-'));
  try {
    const bytes = Buffer.from('entry');
    await writeFile(path.join(temp, 'game.js'), bytes);
    await writeFile(
      path.join(temp, 'platform-manifest.json'),
      JSON.stringify({
        files: [
          {
            path: 'game.js',
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      }),
    );
    await verifyManifest(temp);
    await writeFile(path.join(temp, 'game.js'), 'changed');
    await assert.rejects(verifyManifest(temp), /integrity mismatch/);
    await writeFile(path.join(temp, 'game.js'), bytes);
    await mkdir(path.join(temp, 'assets'));
    await writeFile(path.join(temp, 'assets', 'extra'), 'extra');
    await assert.rejects(verifyManifest(temp), /integrity mismatch/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('Alipay prepares real pinned kart art without changing engine source provenance', async () => {
  const gameRoot = new URL('../../../games/local/carding-car/', import.meta.url);
  const { sourceHash } = await import(new URL('scripts/artifact.mjs', gameRoot));
  const { artLocation } = await import(new URL('assets/scripts/ArtLocation.ts', gameRoot));
  const before = await sourceHash();
  await prepareNativeInputs(fileURLToPath(gameRoot), 'alipay');
  const { readFile } = await import('node:fs/promises');
  for (const [name, source] of [
    ['seaside/kart.glb', 'runtime/kart.glb'],
    ['expansion/manifest.json', 'runtime-expansion/manifest.json'],
    ['glacier-sample/road.jpg', 'glacier-sample/road.jpg'],
  ]) {
    const ext = name.slice(name.lastIndexOf('.'));
    const location = artLocation(name.slice(0, -ext.length));
    const actual = await readFile(
      new URL(`assets/art/${location.bundle}/${location.path}${ext}`, gameRoot),
    );
    const expected = await readFile(new URL(`../../../assets/carding-car/${source}`, gameRoot));
    assert.deepEqual(actual, expected);
  }
  assert.equal(await sourceHash(), before);
});

test('Kuaishou config-only generates actual Creator source configuration without a fabricated converted artifact', async () => {
  const gameRoot = fileURLToPath(new URL('../../../games/local/night-overwatch/', import.meta.url));
  const report = await buildPlatform(gameRoot, 'kuaishou', { configOnly: true, env: {} });
  assert.equal(report.status, 'source-configuration-only');
  assert.equal(report.officialConversionVerified, false);
  assert.equal(report.deviceVerified, false);
  const { readFile } = await import('node:fs/promises');
  const config = JSON.parse(await readFile(report.configuration, 'utf8'));
  assert.equal(config.platform, 'wechatgame');
  assert.equal(report.destinationPlatform, 'kuaishou');
  assert.equal('directory' in report, false);
});

test('Night native configurations compile adapted project inputs while canonical H5 stays identical', async () => {
  const gameRoot = fileURLToPath(new URL('../../../games/local/night-overwatch/', import.meta.url));
  const { readFile } = await import('node:fs/promises');
  const { sourceHash } = await import(
    new URL('../../../games/local/night-overwatch/scripts/artifact.mjs', import.meta.url)
  );
  const before = await sourceHash();
  for (const channel of ['wechat', 'bilibili', 'douyin', 'alipay', 'kuaishou']) {
    const result = await buildPlatform(gameRoot, channel, { configOnly: true, env: {} });
    assert.equal(result.canonicalSourceHash, before);
    assert.notEqual(result.sourceHash, before);
    assert.match(result.adaptationRecipeSha256, /^[a-f0-9]{64}$/);
    const projectRoot = path.dirname(path.dirname(result.configuration));
    assert.notEqual(projectRoot, gameRoot);
    assert.equal(await sourceHash(projectRoot), result.sourceHash);
    assert.match(
      await readFile(path.join(projectRoot, 'assets/scripts/HUD.ts'), 'utf8'),
      /if \(sys\.isBrowser\) this\.button\('fullscreen'/,
    );
    assert.equal(await sourceHash(), before);
    assert.equal('directory' in result, false);
  }
});
