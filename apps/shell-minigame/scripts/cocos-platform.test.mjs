import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  descriptor,
  channels,
  buildPlatform,
  alipayConfig,
  verifyManifest,
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
  assert.throws(() => descriptor('wechat', { env: { WECHAT_APP_ID: 'touristappid' } }), /public/);
  assert.throws(() => descriptor('bilibili', { env: { BILIBILI_APP_ID: 'wxWrong' } }), /public/);
  assert.throws(() => descriptor('alipay', { env: { ALIPAY_APP_ID: 'wxWrong' } }), /public/);
  await assert.rejects(
    buildPlatform('/does-not-exist', 'kuaishou', { env: {} }),
    /No compatible official/,
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
