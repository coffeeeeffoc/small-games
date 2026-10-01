import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('Night native build entry generates distinct official channel configurations without requiring Creator', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const [target, platform, appId] of [
    ['wechatgame', 'wechatgame', 'wxNightTest'],
    ['bilibili', 'wechatgame', 'biligameNightTest'],
    ['douyin', 'bytedance-mini-game', 'ttNightTest'],
  ]) {
    const configPath = new URL(`../reports/build-${target}.json`, import.meta.url);
    const previous = await readFile(configPath).catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    try {
      const result = spawnSync(process.execPath, ['scripts/build.mjs', target, '--config-only'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, COCOS_CREATOR: '/tmp/nonexistent-test-Creator',
          WECHAT_APP_ID: target === 'wechatgame' ? appId : '',
          BILIBILI_APP_ID: target === 'bilibili' ? appId : '',
          DOUYIN_APP_ID: target === 'douyin' ? appId : '' },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /No Creator build was run/);
      const config = JSON.parse(await readFile(configPath, 'utf8'));
      assert.equal(config.platform, platform);
      assert.equal(config.packages[platform].appid, appId);
      assert.equal(config.packages[platform].orientation, 'landscape');
      if (target === 'bilibili') assert.equal(config.packages['biligame-builder'].biliGameAppId, appId);
      else assert.equal(config.outputName, platform);
    } finally {
      if (previous) await writeFile(configPath, previous);
      else await rm(configPath, { force: true });
    }
  }
  const rejected = spawnSync(process.execPath, ['scripts/build.mjs', 'kuaishou', '--config-only'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Kuaishou requires a separately validated Creator adapter/);
});
