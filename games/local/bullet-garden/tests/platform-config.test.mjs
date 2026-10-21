import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { platformConfig, PREVIEW } from '../scripts/platform-config.mjs';
test('channel config defaults off and rejects incomplete, unknown and cross-purpose input', async () => {
  assert.deepEqual(await platformConfig(), PREVIEW);
  const reports = fileURLToPath(new URL('../reports/', import.meta.url));
  await mkdir(reports, { recursive: true });
  const root = await mkdtemp(path.join(reports, 'channel-test-')),
    file = path.join(root, 'config.json');
  try {
    for (const platform of ['taptap', 'taptap-h5']) {
      const config = {
        platform,
        appId: 'fixture-game',
        adUnitId: 'fixture-slot',
        adsEnabled: true,
      };
      await writeFile(file, JSON.stringify(config));
      assert.deepEqual(await platformConfig(file), config);
    }
    for (const config of [
      { ...PREVIEW, unknown: 1 },
      { ...PREVIEW, adsEnabled: true },
      { ...PREVIEW, adsEnabled: 'false' },
      { ...PREVIEW, platform: 'wechat' },
      { ...PREVIEW, appId: '../secret' },
      { platform: 'taptap', appId: 'fixture-game', adUnitId: 'YOUR_AD', adsEnabled: true },
    ]) {
      await writeFile(file, JSON.stringify(config));
      await assert.rejects(platformConfig(file));
    }
  } finally {
    assert(root.startsWith(reports));
    await rm(root, { recursive: true, force: true });
  }
});
