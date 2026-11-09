import { nightStorageFiles } from '../platforms/competition/night-storage/manifest.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  prepareGameServices,
  reconfigureGameServices,
  h5BasicServiceGames,
} from './h5-game-services.mjs';
import preset from '../infra/builds/five-taptap-h5.mjs';
import { parseGameBuildConfig, gameBuildPlan } from './build-games.mjs';

test('basic reconfiguration rejects executable and unknown external configuration', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'service-boundary-'));
  const file = path.join(dir, 'index.html');
  try {
    await writeFile(file, '<html><head></head></html>');
    assert.equal(await reconfigureGameServices(file, {}), false);
    await prepareGameServices('night-overwatch', dir, { env: {} });
    for (const source of [
      'globalThis.__COMPETITION_CONFIG__ = execute();',
      'globalThis.__COMPETITION_CONFIG__ = Object.freeze({"game":"unknown","platform":"h5"});',
      'globalThis.__COMPETITION_CONFIG__ = Object.freeze({"game":"night-overwatch","platform":"native"});',
    ]) {
      await writeFile(path.join(dir, 'game-service-config.js'), source);
      await assert.rejects(reconfigureGameServices(file, {}), /Invalid|Unsupported/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('five-game delivery enables verified slots and a separate no-UI service bootstrap', async () => {
  const jobs = gameBuildPlan(parseGameBuildConfig(preset));
  assert.equal(jobs.length, 5);
  assert(jobs.every((job) => job.backend && job.effectiveAdsEnabled));
  const dir = await mkdtemp(path.join(tmpdir(), 'five-service-'));
  try {
    for (const game of h5BasicServiceGames) {
      await writeFile(
        path.join(dir, 'index.html'),
        '<html><head><script src="./entry.js"></script></head></html>',
      );
      const config = await prepareGameServices(game, dir, {
        env: {
          COMPETITION_SERVICE_ENABLED: '1',
          COMPETITION_PUBLIC_API_URL: 'https://api.example.test/v1',
        },
      });
      assert.equal(config.game, game);
      assert.equal(config.platform, 'h5');
      assert(config.competitionEnabled);
      const html = await readFile(path.join(dir, 'index.html'), 'utf8');
      assert(html.indexOf('game-service-config') < html.indexOf('entry.js'));
      assert(!html.includes('competition-renderer'));
      assert.equal(html.includes('night-storage.js'), game === 'night-overwatch');
      await prepareGameServices(game, dir, { env: {} });
      assert.match(await readFile(path.join(dir, 'game-service-config.js'), 'utf8'), /"apiUrl":""/);
    }
    await assert.rejects(
      prepareGameServices('wulong-city', dir, {
        env: {
          COMPETITION_SERVICE_ENABLED: '1',
          COMPETITION_PUBLIC_API_URL: 'http://private.example/v1',
        },
      }),
      /HTTPS/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Night storage and deferred developer initialization remain unique and precede game entry after repack', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'night-idb-bootstrap-'));
  try {
    const index = path.join(dir, 'index.html');
    await writeFile(
      index,
      '<html><head><script src="./dev-mode.js"></script><script src="./entry.js"></script></head></html>',
    );
    await prepareGameServices('night-overwatch', dir, { env: {} });
    await prepareGameServices('night-overwatch', dir, { env: {} });
    await reconfigureGameServices(index, {});
    const html = await readFile(index, 'utf8');
    assert.equal(html.match(/src="\.\/game-services\/night-storage\.js"/g)?.length, 1);
    assert.equal(html.match(/__nightDevModeReady =/g)?.length, 1);
    assert(html.indexOf('night-storage.js') < html.indexOf('game-service-config.js'));
    assert(html.indexOf('__nightDevModeReady') < html.indexOf('entry.js'));
    assert.doesNotMatch(html, /<script src="\.\/dev-mode\.js"/);
    assert.equal(html.match(/legacy-polyfills\.js/g)?.length, 1);
    assert(html.indexOf('legacy-polyfills.js') < html.indexOf('night-storage.js'));
    for (const file of nightStorageFiles)
      await readFile(path.join(dir, 'game-services', file), 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TapTap Night identity survives repack and ordinary browser builds remain guest scoped', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'night-tap-identity-'));
  const env = {
    COMPETITION_SERVICE_ENABLED: '1',
    COMPETITION_PUBLIC_API_URL: 'https://api.example.test/v1',
  };
  try {
    await writeFile(path.join(dir, 'index.html'), '<html><head></head></html>');
    const cfg = await prepareGameServices('night-overwatch', dir, {
      env,
      tapAppId: 'tap-night-test',
    });
    assert.equal(cfg.identityProvider, 'taptap');
    assert.match(
      await readFile(path.join(dir, 'game-services/game-bootstrap.js'), 'utf8'),
      /installTapCompetitionIdentity\(\)/,
    );
    await reconfigureGameServices(path.join(dir, 'index.html'), env);
    assert.match(
      await readFile(path.join(dir, 'game-service-config.js'), 'utf8'),
      /tap-night-test/,
    );
    await prepareGameServices('night-overwatch', dir, { env });
    assert.doesNotMatch(
      await readFile(path.join(dir, 'game-service-config.js'), 'utf8'),
      /identityProvider/,
    );
    assert.doesNotMatch(
      await readFile(path.join(dir, 'game-services/game-bootstrap.js'), 'utf8'),
      /installTapCompetitionIdentity/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('shipped service scripts are lowered for older WebViews and runtime gaps are polyfilled first', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'night-legacy-'));
  try {
    await writeFile(path.join(dir, 'index.html'), '<html><head></head></html>');
    await prepareGameServices('night-overwatch', dir, { env: {}, tapAppId: 'tap-night-test' });
    const root = path.join(dir, 'game-services');
    const files = (await readdir(root, { recursive: true })).filter((name) => /\.m?js$/.test(name));
    assert(files.length >= 10);
    for (const name of files) {
      const code = await readFile(path.join(root, name), 'utf8');
      // Optional chaining, nullish operators and optional catch bindings need Chrome 80/85/66.
      assert.doesNotMatch(code, /\?\.(?!\d)|\?\?|catch\s*\{/, name);
      assert.doesNotMatch(code, /@oxc-project/, name);
    }
    const legacy = {
      Object: {
        ...Object,
        hasOwn: undefined,
        getPrototypeOf: Object.getPrototypeOf,
        defineProperty: Object.defineProperty,
        prototype: Object.prototype,
      },
      Array: function () {},
      String: function () {},
      Math,
      Promise,
      JSON,
      setTimeout,
      AbortController,
      AbortSignal: function () {},
    };
    legacy.Array.prototype = { concat: Array.prototype.concat };
    legacy.String.prototype = {};
    legacy.window = legacy;
    vm.runInNewContext(await readFile(path.join(root, 'legacy-polyfills.js'), 'utf8'), legacy);
    assert.equal(legacy.Object.hasOwn({ a: 1 }, 'a'), true);
    assert.equal(legacy.Array.prototype.at.call([1, 2, 3], -1), 3);
    assert.deepEqual(
      legacy.Array.prototype.flatMap.call([1, 2], (n) => [n, [n]]),
      [1, [1], 2, [2]],
    );
    assert.deepEqual(legacy.structuredClone({ a: [1] }), { a: [1] });
    assert.equal(typeof legacy.queueMicrotask, 'function');
    assert.equal(legacy.AbortSignal.timeout(10).aborted, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
