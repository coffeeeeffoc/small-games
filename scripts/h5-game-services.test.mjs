import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareGameServices, h5BasicServiceGames } from './h5-game-services.mjs';
import preset from '../infra/builds/five-taptap-h5.mjs';
import { parseGameBuildConfig, gameBuildPlan } from './build-games.mjs';

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
