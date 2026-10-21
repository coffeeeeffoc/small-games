import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tapTapGames, tapTapTarget, tapTapOptions, tapTapToolOptions } from './taptap-targets.mjs';
import { buildTapTap } from './taptap-build.mjs';

test('TapTap keeps the remaining six-game batch, public identifiers and local tool paths separate', () => {
  assert.equal(tapTapGames.length, 6);
  for (const game of tapTapGames) {
    const prefix = `MINIGAME_${game.id}_TAPTAP`.toUpperCase().replaceAll('-', '_');
    const env = {
      [`${prefix}_APP_ID`]: 'public-app-id',
      [`${prefix}_PACKAGE_FILE`]: '/local/game.zip',
      TAPTAP_PACK_TOOL: '/local/official-tool',
      TAPTAP_APP_SECRET: 'server-only',
    };
    const config = tapTapOptions(game.id, { preview: true, env });
    assert.equal(config.platform, 'taptap');
    assert.equal(config.appId, 'public-app-id');
    assert.equal(config.competitionConfigured, false);
    assert.doesNotMatch(JSON.stringify(config), /server-only|local\/|SECRET/);
    assert.equal(tapTapToolOptions(game.id, env).packageFile, '/local/game.zip');
    assert.throws(() => tapTapOptions(game.id, { env: {} }), new RegExp(prefix + '_APP_ID'));
  }
});

test('release preflight rejects missing configuration before creating any source project', async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'taptap-preflight-'));
  try {
    await assert.rejects(buildTapTap({ all: true, outputRoot, env: {} }), /Release requires/);
    assert.deepEqual(await readdir(outputRoot), []);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('TapTap release validates public URLs and has no fallback to another game or platform', () => {
  for (const game of ['unknown', 'cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'])
    assert.throws(() => tapTapOptions(game, { preview: true, env: {} }), /Unknown/);
  for (const appId of ['../wx', 'app id', 'app?id=secret'])
    assert.throws(
      () =>
        tapTapOptions('wulong-city', {
          preview: true,
          env: { MINIGAME_WULONG_CITY_TAPTAP_APP_ID: appId },
        }),
      /Invalid/,
    );
  assert.throws(
    () =>
      tapTapOptions('travel-bund', {
        env: {
          MINIGAME_TRAVEL_BUND_TAPTAP_APP_ID: 'public-app-id',
          MINIGAME_COMPETITION_API_URL: 'https://api.example.com/competition/v1',
        },
      }),
    /ASSET_BASE/,
  );
  for (const url of [
    'http://example.com/',
    'https://u:p@example.com/',
    'https://example.com/?secret=x',
  ])
    assert.throws(
      () =>
        tapTapOptions('letters-words2', {
          preview: true,
          env: { MINIGAME_COMPETITION_API_URL: url },
        }),
      /HTTPS/,
    );
});

test('configured Tap identities enable the existing friend protocol only for supported games', () => {
  for (const game of tapTapGames) {
    const prefix = `MINIGAME_${game.id}_TAPTAP`.toUpperCase().replaceAll('-', '_');
    const env = {
      [`${prefix}_APP_ID`]: 'public-app-id',
      MINIGAME_COMPETITION_API_URL: 'https://api.example.com/competition/v1',
      COMPETITION_SERVICE_ENABLED: '1',
      MINIGAME_TRAVEL_BUND_ASSET_BASE: 'https://assets.example.com/travel/',
    };
    const config = tapTapOptions(game.id, { env });
    assert.equal(config.competitionConfigured, !['travel-bund', 'wulong-city'].includes(game.id));
    assert.throws(
      () => tapTapOptions(game.id, { env: { ...env, MINIGAME_COMPETITION_API_URL: '' } }),
      /login service|set COMPETITION_PUBLIC_API_URL/,
    );
  }
});

test('TapTap preflight and native login accept the same API URL grammar', () => {
  assert.equal(
    tapTapOptions('letters-words2', {
      preview: true,
      env: { MINIGAME_COMPETITION_API_URL: 'https://api.example.com/v1///' },
    }).apiUrl,
    'https://api.example.com/v1',
  );
  for (const apiUrl of ['https://api.example.com\\path', 'https://[::1]/v1']) {
    assert.throws(
      () =>
        tapTapOptions('letters-words2', {
          preview: true,
          env: { MINIGAME_COMPETITION_API_URL: apiUrl },
        }),
      /INVALID_INPUT/,
    );
  }
});

test('output overlap is rejected before the builder can delete original conversion inputs', async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'taptap-input-protection-'));
  const input = path.join(outputRoot, 'taptap', 'carding-car');
  await mkdir(input, { recursive: true });
  await writeFile(path.join(input, 'original.txt'), 'original conversion input');
  try {
    for (const suffix of [
      'SOURCE_DIR',
      'CONVERTED_DIR',
      'PLUGIN_DIR',
      'PLUGIN_ARCHIVE',
      'PACKAGE_FILE',
      'PACKAGE_RECEIPT',
    ]) {
      await assert.rejects(
        buildTapTap({
          game: 'carding-car',
          preview: true,
          outputRoot,
          env: {
            [`MINIGAME_CARDING_CAR_TAPTAP_${suffix}`]: suffix.endsWith('_DIR')
              ? input
              : path.join(input, 'original.txt'),
          },
        }),
        /independent/,
      );
      assert.equal(
        await readFile(path.join(input, 'original.txt'), 'utf8'),
        'original conversion input',
      );
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('Homebound is an explicit portrait Creator target outside the frozen --all batch', () => {
  assert.equal(tapTapGames.length, 6);
  assert.equal(
    tapTapGames.some((game) => game.id === 'homebound-station'),
    false,
  );
  assert.equal(tapTapTarget('homebound-station').orientation, 'portrait');
  assert.equal(tapTapTarget('homebound-station').cocos, true);
  const config = tapTapOptions('homebound-station', {
    env: {
      MINIGAME_HOMEBOUND_STATION_TAPTAP_APP_ID: 'homebound-app',
      MINIGAME_HOMEBOUND_STATION_TAPTAP_AD_UNIT_ID: 'homebound-reward',
      // The standalone game does not inherit an unrelated backend or another channel's ad slot.
      MINIGAME_COMPETITION_API_URL: 'https://other.example.com/v1',
      MINIGAME_HOMEBOUND_STATION_WECHAT_AD_UNIT_ID: 'foreign-wx-slot',
      TAPTAP_APP_SECRET: 'never-client-secret',
    },
  });
  assert.equal(config.apiUrl, '');
  assert.equal(config.competitionConfigured, false);
  assert.equal(config.adsEnabled, true);
  assert.equal(config.adUnitId, 'homebound-reward');
  assert.doesNotMatch(JSON.stringify(config), /never-client-secret|foreign-wx-slot|other.example/);
  assert.equal(tapTapOptions('homebound-station', { preview: true, env: {} }).adsEnabled, false);
  assert.throws(() => tapTapOptions('homebound-station', { env: {} }), /APP_ID/);
  assert.throws(
    () =>
      tapTapOptions('homebound-station', {
        preview: true,
        env: {
          MINIGAME_HOMEBOUND_STATION_TAPTAP_AD_UNIT_ID: '../foreign',
        },
      }),
    /AD_UNIT_ID/,
  );
  assert.throws(
    () =>
      tapTapOptions('carding-car', {
        env: {
          MINIGAME_CARDING_CAR_TAPTAP_APP_ID: 'legacy-app',
        },
      }),
    /login service/,
  );
});
