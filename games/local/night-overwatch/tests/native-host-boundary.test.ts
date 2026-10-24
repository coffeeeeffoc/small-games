import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPlatform } from '../platforms/build.mjs';

test('native HUD creates no browser fullscreen action and platform guards calls', async () => {
  const configuration = await buildPlatform('wechat', { configOnly: true, env: {} });
  const projectRoot = path.dirname(path.dirname(configuration.configuration));
  const hud = await readFile(path.join(projectRoot, 'assets/scripts/HUD.ts'), 'utf8');
  const platform = await readFile(path.join(projectRoot, 'assets/scripts/Platform.ts'), 'utf8');
  assert.doesNotMatch(hud, /fullscreen/i);
  assert.doesNotMatch(platform, /fullscreen/i);
  await assert.rejects(buildPlatform('alipay', { mode: 'release', env: { ALIPAY_APP_ID: '' } }), /ALIPAY_APP_ID/);
});
