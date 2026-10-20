import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import preset from '../infra/builds/six-taptap-h5.mjs';
import { h5AdConfig, additionalH5Games, prepareH5Ads } from './h5-ad-config.mjs';
import { parseGameBuildConfig, gameBuildPlan } from './build-games.mjs';
import { compilerEnvironment, writeH5Zip, h5ExpandedBudgetBytes } from './h5-taptap-build.mjs';
import { inventory, zipInventory } from '../apps/shell-minigame/scripts/taptap-package.mjs';
test('six H5 games permit optional IDs, isolate slots and reject unsupported travel backend', () => {
  const cfg = parseGameBuildConfig({ ...preset, ads: [false, true] });
  assert.equal(gameBuildPlan(cfg).length, 12);
  for (const game of additionalH5Games) {
    const key = `TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_AD_UNIT_ID`;
    assert.equal(h5AdConfig(game, { env: { H5_ADS_ENABLED: '1' } }).adsEnabled, false);
    assert.equal(
      h5AdConfig(game, {
        env: compilerEnvironment({ H5_ADS_ENABLED: '1', [key]: 'only-this-game' }),
      }).adsEnabled,
      true,
    );
    assert.equal(
      h5AdConfig(game, { env: { H5_ADS_ENABLED: '0', [key]: 'only-this-game' } }).adsEnabled,
      false,
    );
    if (game === 'travel-bund')
      assert.throws(
        () =>
          gameBuildPlan(
            parseGameBuildConfig({
              ...preset,
              games: [game],
              backend: [true],
              apiUrl: 'https://api.example.com',
            }),
          ),
        /UNSUPPORTED/,
      );
  }
});

test('H5 ZIP integrity verification is independent of the conservative native size budget', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'h5-zip-budget-'));
  try {
    await writeFile(path.join(dir, 'asset.bin'), Buffer.alloc(21 * 1024 * 1024, 7));
    const files = await inventory(dir);
    await writeH5Zip(dir, files, path.join(dir, 'build.zip'));
    const zip = await readFile(path.join(dir, 'build.zip'));
    assert.throws(() => zipInventory(zip), /budget exceeded/);
    assert.deepEqual(
      zipInventory(zip, { maxBytes: h5ExpandedBudgetBytes }),
      files.map((f) => ({ ...f, path: 'dist/' + f.path })),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('packaging installs the real provider before game modules and declares offline identity', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'six-h5-'));
  try {
    await writeFile(
      path.join(dir, 'index.html'),
      '<html><head><script type="module" src="./entry.js"></script></head><body></body></html>',
    );
    await prepareH5Ads('wulong-city', dir, { env: {} });
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    assert(html.indexOf('game-rewards.js') < html.indexOf('entry.js'));
    assert.match(await readFile(path.join(dir, 'platform-config.js'), 'utf8'), /"offline":true/);
    assert.match(
      await readFile(path.join(dir, 'game-rewards.js'), 'utf8'),
      /createPlatformAdProvider/,
    );
    assert.match(await readFile(path.join(dir, 'platform-ads.js'), 'utf8'), /isEnded === true/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
