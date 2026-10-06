import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nineGames, fivePlatforms, appIdVariable, targetOptions } from './nine-games-targets.mjs';
import { inventory, verifyArtifact, runBuild } from './nine-games-build.mjs';
import { withCompetitionAvailability } from '../src/competition-availability.mjs';

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
  const catalog = await readFile(
    new URL('../../../apps/shell-web/src/GameCatalog.tsx', import.meta.url),
    'utf8',
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
