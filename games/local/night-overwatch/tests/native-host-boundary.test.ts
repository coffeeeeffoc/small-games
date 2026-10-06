import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPlatform } from '../platforms/build.mjs';

test('native HUD creates no browser fullscreen action and platform guards calls', async () => {
  const hud = await readFile(new URL('../assets/scripts/HUD.ts', import.meta.url), 'utf8');
  const platform = await readFile(new URL('../assets/scripts/Platform.ts', import.meta.url), 'utf8');
  assert.match(hud, /if \(sys\.isBrowser\) this\.button\('fullscreen'/);
  assert.match(platform, /async fullscreen\(\) \{\s*if \(!sys\.isBrowser\) return false;/);
  assert.match(platform, /return sys\.isBrowser && screen\.fullScreen\(\);/);
  await assert.rejects(buildPlatform('alipay', { mode: 'release', env: { ALIPAY_APP_ID: '' } }), /ALIPAY_APP_ID/);
});
