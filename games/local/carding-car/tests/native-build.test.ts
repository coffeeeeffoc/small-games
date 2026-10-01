import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('Kart Douyin configuration selects its own Creator adapter and local art subpackage without requiring the engine', async () => {
  const configPath = new URL('../reports/build-douyin.json', import.meta.url);
  const previous = await readFile(configPath).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  try {
    const result = spawnSync(process.execPath, ['scripts/build.mjs', 'douyin', '--config-only'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8',
      env: { ...process.env, COCOS_CREATOR: '/tmp/nonexistent-test-Creator', DOUYIN_APP_ID: 'ttKartTest' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No Creator build was run/);
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    assert.equal(config.platform, 'bytedance-mini-game');
    assert.equal(config.outputName, 'bytedance-mini-game');
    assert.equal(config.packages['bytedance-mini-game'].appid, 'ttKartTest');
    assert.equal(config.packages['biligame-builder'].isBiliGame, false);
    const bundle = JSON.parse(await readFile(new URL('../assets/resources.meta', import.meta.url), 'utf8'));
    const settings = JSON.parse(await readFile(new URL('../settings/v2/packages/builder.json', import.meta.url), 'utf8'));
    assert.equal(settings.bundleConfig.custom[bundle.userData.bundleConfigID].configs.miniGame
      .overwriteSettings[config.platform].compressionType, 'subpackage');
  } finally {
    if (previous) await writeFile(configPath, previous);
    else await rm(configPath, { force: true });
  }
});
