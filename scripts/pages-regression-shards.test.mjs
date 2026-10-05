import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import yaml from 'js-yaml';
import { planShards } from './pages-regression-shards.mjs';
test('measured full catalog is covered exactly once in balanced shards', async () => {
  const games = JSON.parse(
    await readFile(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const timings = JSON.parse(
    await readFile(new URL('./pages-regression-timings.json', import.meta.url)),
  );
  const ids = games.map((game) => game.id);
  const matrix = planShards(ids, timings.milliseconds);
  assert.equal(matrix.include.length, 4);
  const actual = matrix.include.flatMap((shard) => JSON.parse(shard.game_ids));
  assert.deepEqual([...actual].sort(), [...ids].sort());
  assert.equal(new Set(actual).size, ids.length);
  assert(Math.max(...matrix.include.map((shard) => shard.estimated_ms)) < 300000);
  assert.deepEqual(planShards([...ids].reverse(), timings.milliseconds), matrix);
});
test('small and empty selections retain exactly the requested games', () => {
  assert.deepEqual(planShards([]), { include: [{ shard: 1, estimated_ms: 0, game_ids: '[]' }] });
  assert.equal(planShards(['new-game']).include[0].game_ids, '["new-game"]');
  assert.equal(planShards(['a', 'b']).include.length, 2);
  assert.throws(() => planShards(['a', 'a']));
  assert.throws(() => planShards(['a'], { a: NaN }));
  assert.throws(() => planShards([], {}, 0));
});
test('each browser matrix shard is a required gate using its explicit game selection', async () => {
  const workflow = yaml.load(
    await readFile(new URL('../.github/workflows/pages-validate.yml', import.meta.url), 'utf8'),
  );
  const job = workflow.jobs.regression;
  assert.deepEqual(job.needs, ['build', 'plan']);
  assert.equal(job.strategy['fail-fast'], false);
  assert.equal(job.strategy['max-parallel'], 4);
  assert.equal(job.strategy.matrix, '${{ fromJSON(needs.plan.outputs.matrix) }}');
  assert.equal(job.env.PAGES_GAME_IDS, '${{ matrix.game_ids }}');
  assert.equal(job['continue-on-error'], undefined);
  assert(
    job.steps.some(
      (step) => step.run === 'pnpm test:pages:games' && !step['continue-on-error'] && !step.if,
    ),
  );
  const upload = job.steps.find((step) => step.name === 'Upload browser regression diagnostics');
  assert(upload.with.name.includes('matrix.shard'));
  assert.equal(workflow.jobs.smoke.if, 'inputs.browser');
  assert.equal(workflow.jobs.smoke['continue-on-error'], undefined);
});
