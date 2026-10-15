import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { games, root, configuration, creatorConfiguration } from '../scripts/config.mjs';
import {
  prepareGame,
  projectSettingsInputs,
  fingerprint,
  normalizeIterableSpreads,
  assetInputs,
  copyRuntimeAssets,
} from '../scripts/prepare.mjs';
import { runCheckedConversion } from '../scripts/build.mjs';

test('Cocos cops packages the original home, garden and character art without changing H5 assets', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'cocos-cops-art-'));
  try {
    const inputs = assetInputs('cops-robbers');
    for (const name of ['home-chase.webp', 'patrol-garden.webp', 'patrol-characters.svg'])
      assert(
        inputs.some(([source]) => source === `games/local/cops-robbers/assets/${name}`),
        `Missing original ${name}`,
      );
    await copyRuntimeAssets({ game: 'cops-robbers' }, output);
    for (const name of ['home-chase.webp', 'patrol-garden.webp'])
      assert.deepEqual(
        await readFile(path.join(output, name)),
        await readFile(new URL(`../../local/cops-robbers/assets/${name}`, import.meta.url)),
      );
    const svg = await readFile(
      new URL('../../local/cops-robbers/assets/patrol-characters.svg', import.meta.url),
      'utf8',
    );
    const embedded = svg.match(/xlink:href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/);
    assert(embedded);
    assert(svg.includes('<view id="cop" viewBox="0 0 768 1024"/>'));
    assert(svg.includes('<view id="robber" viewBox="768 0 768 1024"/>'));
    assert.deepEqual(
      await readFile(path.join(output, 'patrol-characters.webp')),
      Buffer.from(embedded[1], 'base64'),
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('iterable spread normalization preserves sets, maps, Unicode, holes and object/rest semantics', async () => {
  const source = `
    const 标签 = '棋😀';
    const calls = [];
    const listener = (value) => calls.push(value);
    const listeners = new Set([listener]);
    for (const fn of [...listeners]) fn(标签);
    const points = new Map([[1, {x: 2}], [2, {x: 3}]]);
    const collect = (...args) => args;
    const nested = [...new Set([...points.keys(), ...[2, 3]])];
    export default { calls, nested, points: [...points.values()],
      unicode: collect(...标签), holes: [...Array(2)],
      sequence: [...(null, listeners)], object: {...{x: 4}} };
  `;
  const transformed = normalizeIterableSpreads(source);
  const evaluate = async (code) =>
    (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
  const actual = await evaluate(transformed),
    expected = await evaluate(source);
  assert.deepEqual(
    { ...actual, sequence: actual.sequence.map((fn) => typeof fn) },
    { ...expected, sequence: expected.sequence.map((fn) => typeof fn) },
  );
  assert(transformed.includes('...Array.from(('));
  assert(transformed.includes('...args'));
  assert(transformed.includes('...{x: 4}'));
});

test('Creator-generated profiles do not change source identity, but versioned settings edits do', async () => {
  const repository = await mkdtemp(path.join(tmpdir(), 'cocos-settings-'));
  try {
    const project = path.join(repository, 'game');
    const settings = path.join(project, 'settings/v2/packages');
    await mkdir(settings, { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    await writeFile(path.join(settings, 'engine.json'), '{"modules":["2d"]}\n');
    await writeFile(path.join(settings, 'project.json'), '{"version":"1.0.0"}\n');
    execFileSync('git', ['add', 'game/settings'], { cwd: repository });
    const identity = async () =>
      fingerprint(await projectSettingsInputs(project, repository), {}, repository);
    const before = await identity();
    for (const profile of ['builder', 'device', 'information', 'program'])
      await writeFile(path.join(settings, profile + '.json'), '{"generated":true}\n');
    assert.deepEqual(await identity(), before);
    await writeFile(path.join(settings, 'engine.json'), '{"modules":["2d","audio"]}\n');
    assert.notEqual((await identity()).sourceHash, before.sourceHash);
    execFileSync('git', ['add', 'game/settings/v2/packages/builder.json'], { cwd: repository });
    assert((await identity()).files.some((file) => file.path.endsWith('/builder.json')));
    await rm(path.join(settings, 'project.json'));
    await assert.rejects(identity(), /ENOENT/);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

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
