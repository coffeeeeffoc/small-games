import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { main, parseGameBuildConfig, gameBuildPlan } from './build-games.mjs';
import { buildH5Packages } from './h5-taptap-build.mjs';
import { prepareBuildType } from './h5-build-type.mjs';

const config = {
  version: 2,
  games: ['night-overwatch', 'wulong-city'],
  ads: [false],
  backend: [true],
  targets: [{ platform: 'taptap', type: 'h5' }],
  buildType: 'development',
  apiUrls: {
    test: 'https://test.example/api/competition/v1',
    production: 'https://production.example/small-games/v1',
  },
  gameOverrides: { 'wulong-city': { buildType: 'production' } },
};

test('profile resolution honors per-game type/URL overrides and target backend overrides', () => {
  const jobs = gameBuildPlan(
    parseGameBuildConfig({
      ...config,
      gameOverrides: {
        ...config.gameOverrides,
        'night-overwatch': { apiUrls: { test: 'https://night.example/api/competition/v1' } },
      },
    }),
  );
  assert.deepEqual(
    jobs.map(({ buildType, devMode, apiUrl }) => ({ buildType, devMode, apiUrl })),
    [
      {
        buildType: 'development',
        devMode: true,
        apiUrl: 'https://night.example/api/competition/v1',
      },
      { buildType: 'production', devMode: false, apiUrl: config.apiUrls.production },
    ],
  );
  assert(
    gameBuildPlan(
      parseGameBuildConfig({
        ...config,
        targets: [{ platform: 'taptap', type: 'h5', backend: [false] }],
      }),
    ).every((job) => job.apiUrl === ''),
  );
});

test('profile configuration fails closed on typos, ambiguous legacy URL and missing endpoints', () => {
  for (const invalid of [
    { buildType: 'dev' },
    { buildType: null },
    { apiUrl: config.apiUrls.test },
    { apiUrls: { staging: config.apiUrls.test } },
    { apiUrls: { test: '' } },
    { gameOverrides: { unknown: {} } },
    { gameOverrides: { 'night-overwatch': { buildTyp: 'test' } } },
    { gameOverrides: { 'night-overwatch': { buildType: 'dev' } } },
    { apiUrls: { production: 'http://127.0.0.1:43003/v1' }, localBackend: true },
    { apiUrls: { production: 'https://localhost/v1' } },
    { buildType: undefined },
  ])
    assert.throws(() => parseGameBuildConfig({ ...config, ...invalid }));
  assert.throws(
    () =>
      gameBuildPlan(
        parseGameBuildConfig({ ...config, apiUrls: { production: config.apiUrls.production } }),
      ),
    /BUILD_API_URL_REQUIRED/,
  );
  assert.throws(
    () =>
      gameBuildPlan(
        parseGameBuildConfig({
          ...config,
          apiUrls: { test: config.apiUrls.production + '/', production: config.apiUrls.production },
        }),
      ),
    /BUILD_TEST_PRODUCTION_API_CONFLICT/,
  );
});

test('CLI changes the default, preserves explicit game override, and delivers mixed actual packages', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'h5-profiles-'));
  try {
    for (const game of config.games)
      await mkdir(path.join(folder, 'games/local', game), { recursive: true });
    const actualEnvs = [];
    const result = await main(['--config', 'profiles.json', '--build-type', 'test'], {
      workspace: folder,
      env: {},
      read: async () => JSON.stringify({ ...config, localBackend: true }),
      build: (values, options) =>
        buildH5Packages(values, {
          ...options,
          compile: async ({ game, buildOutput, env }) => {
            actualEnvs.push([game, env.COMPETITION_PUBLIC_API_URL, env.COMPETITION_LOCAL_BACKEND]);
            await writeFile(
              path.join(buildOutput, 'index.html'),
              '<html><head><script src="./entry.js"></script></head><body></body></html>',
            );
            await writeFile(path.join(buildOutput, 'entry.js'), '// fixture');
          },
        }),
    });
    assert.deepEqual(actualEnvs, [
      ['night-overwatch', config.apiUrls.test, '1'],
      ['wulong-city', config.apiUrls.production, '0'],
    ]);
    const variants = result.targets[0].variants;
    assert.deepEqual(
      variants.map((variant) => variant.buildType),
      ['test', 'production'],
    );
    for (const variant of variants) {
      assert.equal(variant.devMode, false);
      assert(variant.zip.includes(`-${variant.buildType}-`));
      const dist = path.join(result.output, 'taptap-h5', variant.name, 'dist');
      const html = await readFile(path.join(dist, 'index.html'), 'utf8');
      assert.equal(html.indexOf('<script'), html.indexOf('<script src="./build-type.js"'));
      const sandbox = {};
      vm.runInNewContext(await readFile(path.join(dist, 'build-type.js'), 'utf8'), sandbox);
      assert.equal(sandbox.__SMALL_GAMES_BUILD__.type, variant.buildType);
      assert(Object.isFrozen(sandbox.__SMALL_GAMES_BUILD__));
      assert.equal(
        Object.getOwnPropertyDescriptor(sandbox, '__SMALL_GAMES_BUILD__').writable,
        false,
      );
      const services = {};
      vm.runInNewContext(
        await readFile(path.join(dist, 'game-service-config.js'), 'utf8'),
        services,
      );
      assert.equal(services.__COMPETITION_CONFIG__.apiUrl, variant.apiUrl);
      assert(variant.files.some((file) => file.path === 'build-type.js'));
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('build metadata replaces a prior profile once and precedes the entry script', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'h5-profile-entry-'));
  try {
    await writeFile(
      path.join(folder, 'index.html'),
      '<html><head><script src="./build-type.js"></script><script src="./entry.js"></script></head></html>',
    );
    await prepareBuildType(folder, 'development');
    await prepareBuildType(folder, 'production');
    assert.equal(
      (await readFile(path.join(folder, 'index.html'), 'utf8')).match(/build-type\.js/g).length,
      1,
    );
    assert.match(await readFile(path.join(folder, 'build-type.js'), 'utf8'), /production/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
