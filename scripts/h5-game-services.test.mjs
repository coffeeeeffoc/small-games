import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
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
