import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { games, root, configuration, creatorConfiguration } from '../scripts/config.mjs';
import { prepareGame } from '../scripts/prepare.mjs';
import { runCheckedConversion } from '../scripts/build.mjs';

test('partial official Babel failures cannot be reported as a successful TapTap package', async () => {
  const logger = console.log;
  await assert.rejects(
    runCheckedConversion(async () => {
      console.log('[Babel] 转换失败: game.js - parse error');
      console.log('[Tap小游戏] Babel转换完成: 成功 8, 跳过 0, 失败 1');
    }, {}),
    /partial Babel/,
  );
  assert.equal(console.log, logger);
  await runCheckedConversion(
    async () => console.log('[Tap小游戏] Babel转换完成: 成功 8, 跳过 0, 失败 0'),
    {},
  );
  assert.equal(console.log, logger);
});

test('platform identities, release credentials, unsupported targets and orientation are explicit', () => {
  for (const game of Object.keys(games))
    for (const platform of [
      'wechat',
      'taptap',
      'bilibili',
      'douyin',
      'kuaishou',
      'alipay',
      'web-preview',
    ]) {
      const config = configuration(game, platform, { env: {} });
      assert.equal(config.appId, '');
      assert.equal(config.preview, true);
      assert.equal(config.competitionConfigured, false);
      assert.equal(config.orientation, game === 'cops-robbers-realtime' ? 'landscape' : 'portrait');
      assert.equal(creatorConfiguration(config).startScene, games[game].scene);
      if (platform !== 'web-preview')
        assert.throws(() => configuration(game, platform, { release: true, env: {} }), /requires/);
    }
  assert.throws(() => configuration('cops-robbers', 'baidu', { env: {} }), /removed Baidu/);
  assert.throws(() => configuration('fourth-game', 'taptap'), /Unknown game/);
  assert.throws(
    () => configuration('cops-robbers', 'taptap', { env: { TAPTAP_APP_ID: 'touristappid' } }),
    /real channel/,
  );
  assert.throws(
    () =>
      configuration('cops-robbers', 'taptap', {
        release: true,
        env: { TAPTAP_APP_ID: 'tap_actual_id' },
      }),
    /API/,
  );
  assert.throws(
    () =>
      configuration('cops-robbers', 'taptap', {
        env: { TAPTAP_API_URL: 'https://user:secret@example.com' },
      }),
    /HTTPS/,
  );
  const release = configuration('cops-robbers', 'taptap', {
    release: true,
    env: { TAPTAP_APP_ID: 'tap_actual_id', TAPTAP_API_URL: 'https://example.com/api' },
  });
  assert.equal(release.debug, false);
  assert.equal(release.competitionEnabled, false);
  assert.equal(creatorConfiguration(release).packages.wechatgame.appid, 'touristappid');
});

test('all three entries bundle real rules and stable scene identities without writing H5 outputs', async () => {
  for (const game of Object.keys(games)) {
    const result = await prepareGame(configuration(game, 'web-preview', { env: {} }));
    assert(result.files.some((f) => f.path === games[game].entry));
    assert(
      result.files.some((f) =>
        f.path.startsWith(
          game === 'xiangqi-five' ? 'games/submodules/xiangqi-five/' : `games/local/${game}/src/`,
        ),
      ),
    );
    assert(!result.files.some((f) => /\/reports\/|\/build\//.test(f.path)));
    const scene = JSON.parse(await readFile(path.join(root, game, 'assets/scenes/main.scene')));
    assert.equal(scene[1]._id, games[game].scene);
    assert.equal(scene[3].__type__.length, 23);
    const script = JSON.parse(
      await readFile(path.join(root, game, 'assets/scripts/CocosMiniGame.ts.meta')),
    );
    assert.equal(script.uuid, games[game].script);
    const code = await readFile(path.join(root, game, 'assets/scripts/game-entry.js'), 'utf8');
    assert(code.includes('prepareSdk'));
    assert(code.includes('startNativeCompetition'));
    const again = await prepareGame(configuration(game, 'web-preview', { env: {} }));
    assert.equal(result.sourceHash, again.sourceHash);
    const tap = await prepareGame(configuration(game, 'taptap', { env: {} }));
    assert.notEqual(
      tap.sourceHash,
      result.sourceHash,
      'Platform configuration participates in provenance',
    );
  }
});
