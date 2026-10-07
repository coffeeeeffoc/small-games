import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  nineGames,
  fivePlatforms,
  scopeCommit,
  appIdVariable,
  targetOptions,
} from './nine-games-targets.mjs';
import { inventory, verifyArtifact, runBuild, workspaceSourceFile } from './nine-games-build.mjs';
import { withCompetitionAvailability } from '../src/competition-availability.mjs';

test('Vite module paths retain actual workspace provenance on Windows and POSIX', () => {
  const root = path.resolve('source-root');
  for (const file of [
    path.join(root, 'games/native.js'),
    path.join(root, 'games/native.js').replaceAll('\\', '/'),
  ])
    assert.equal(Boolean(workspaceSourceFile(file, root)), true);
  for (const file of [
    path.join(root, 'node_modules/pkg/index.js'),
    path.join(root, '.scratch/entry.mjs'),
    path.resolve('source-root-other/native.js'),
    '\0virtual',
  ])
    assert.equal(Boolean(workspaceSourceFile(file, root)), false);
});

test('unconfigured competition ignores old credentials and never performs real login or transport', () => {
  let calls = 0;
  const raw = {
    getStorageSync: (key) => (key.startsWith('competition-') ? 'old-token' : 'old-save'),
    login() {
      calls++;
    },
    request() {
      calls++;
    },
  };
  for (const platform of fivePlatforms) {
    const sdk = withCompetitionAvailability(raw, { platform, competitionConfigured: false });
    assert.equal(sdk.getStorageSync('competition-session-v1:any'), undefined);
    assert.equal(sdk.getStorageSync('ciyu-progress'), 'old-save');
    sdk.login({ fail: (error) => assert.equal(error.code, 'PLATFORM_LOGIN_UNAVAILABLE') });
    sdk.request({ fail: (error) => assert.equal(error.code, 'PLATFORM_LOGIN_UNAVAILABLE') });
  }
  assert.equal(calls, 0);
  assert.notEqual(
    withCompetitionAvailability(raw, { platform: 'alipay', competitionConfigured: true }),
    raw,
  );
  assert.equal(
    withCompetitionAvailability(raw, { platform: 'wechat', competitionConfigured: true }),
    raw,
  );
});

test('batch is the catalog first nine at the frozen dev commit, across five distinct SDKs', async () => {
  const catalog = execFileSync(
    'git',
    ['show', `${scopeCommit}:apps/shell-web/src/GameCatalog.tsx`],
    {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      encoding: 'utf8',
    },
  );
  for (const [index, game] of nineGames.entries())
    assert.match(catalog, new RegExp(`'${game.id}': ${index}`));
  assert.equal(new Set(nineGames.map((game) => game.id)).size, 9);
  assert.equal(
    nineGames.flatMap((game) => fivePlatforms.map((platform) => appIdVariable(game.id, platform)))
      .length,
    45,
  );
});
test('all release targets preflight before writing any package; preview has no fake AppID', async () => {
  assert.equal(targetOptions('letters-words2', 'wechat', { preview: true, env: {} }).appId, '');
  for (const game of nineGames)
    for (const platform of fivePlatforms)
      assert.throws(
        () => targetOptions(game.id, platform, { env: {} }),
        new RegExp(appIdVariable(game.id, platform)),
      );
  const destination = await mkdtemp(path.join(tmpdir(), 'nine-preflight-'));
  try {
    await assert.rejects(
      runBuild({ all: true, outputRoot: destination, env: {} }),
      /Release requires/,
    );
    assert.deepEqual(await inventory(destination), []);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
test('only public fields are serialized; secret env is never copied into client config', () => {
  const config = targetOptions('letters-words2', 'alipay', {
    preview: true,
    env: {
      ALIPAY_APP_SECRET: 'server-only',
      MINIGAME_LETTERS_WORDS2_ALIPAY_APP_ID: '2026000000000000',
    },
  });
  assert.equal(config.appId, '2026000000000000');
  assert.equal(config.competitionConfigured, false);
  assert.doesNotMatch(JSON.stringify(config), /server-only|SECRET/);
  assert.throws(
    () =>
      targetOptions('letters-words2', 'wechat', {
        preview: true,
        env: { MINIGAME_COMPETITION_API_URL: 'https://user:secret@example.com' },
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      targetOptions('letters-words2', 'wechat', {
        preview: true,
        env: { MINIGAME_LETTERS_WORDS2_WECHAT_APP_ID: 'touristappid' },
      }),
    /Invalid/,
  );
});
test('Bund assets use only explicit public HTTPS directories and require release configuration', () => {
  const key = appIdVariable('travel-bund', 'wechat');
  const appId = 'wx0123456789abcdef';
  assert.throws(
    () => targetOptions('travel-bund', 'wechat', { env: { [key]: appId } }),
    /MINIGAME_TRAVEL_BUND_ASSET_BASE/,
  );
  for (const assetBase of [
    'http://example.com/',
    'https://user:secret@example.com/',
    'https://example.com/?token=secret',
    'https://example.com/#secret',
  ]) {
    assert.throws(
      () =>
        targetOptions('travel-bund', 'wechat', {
          env: { [key]: appId, MINIGAME_TRAVEL_BUND_ASSET_BASE: assetBase },
        }),
      /HTTPS/,
    );
  }
  const config = targetOptions('travel-bund', 'wechat', {
    env: {
      [key]: appId,
      MINIGAME_TRAVEL_BUND_ASSET_BASE: 'https://assets.example.com/fixed-version',
      MINIGAME_COMPETITION_API_URL: 'https://api.example.com/',
    },
  });
  assert.equal(config.assetBase, 'https://assets.example.com/fixed-version/');
  assert.equal(config.competitionConfigured, false);
});
test('release rejects the official Kuaishou preview identifier', () => {
  assert.throws(
    () =>
      targetOptions('wulong-city', 'kuaishou', {
        env: { MINIGAME_WULONG_CITY_KUAISHOU_APP_ID: 'kwai_game_test_appid' },
      }),
    /Release requires/,
  );
});
test('integrity detects altered, missing and additional files instead of checking names alone', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nine-integrity-'));
  try {
    await writeFile(path.join(directory, 'game.js'), 'module.exports = {};');
    await writeFile(path.join(directory, 'game.json'), '{}');
    await writeFile(
      path.join(directory, 'artifact-manifest.json'),
      JSON.stringify({ files: await inventory(directory) }),
    );
    await verifyArtifact(directory);
    await writeFile(path.join(directory, 'unexpected.txt'), 'bad');
    await assert.rejects(verifyArtifact(directory), /integrity/);
    await rm(path.join(directory, 'unexpected.txt'));
    await writeFile(path.join(directory, 'game.js'), 'changed');
    await assert.rejects(verifyArtifact(directory), /integrity/);
    await rm(path.join(directory, 'game.js'));
    await assert.rejects(verifyArtifact(directory), /integrity/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('public competition URL cannot serialize credentials or query tokens into the client', () => {
  for (const apiUrl of [
    'http://example.com/',
    'https://user:secret@example.com/',
    'https://example.com/?key=server-secret',
    'https://example.com/#secret',
  ]) {
    assert.throws(
      () =>
        targetOptions('letters-words2', 'wechat', {
          preview: true,
          env: { MINIGAME_COMPETITION_API_URL: apiUrl },
        }),
      /HTTPS/,
    );
  }
});
