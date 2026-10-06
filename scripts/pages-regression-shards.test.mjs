import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import yaml from 'js-yaml';
import { planShards, SHARD_BUDGET_MS } from './pages-regression-shards.mjs';
test('measured full catalog is covered exactly once in balanced shards', async () => {
  const games = JSON.parse(
    await readFile(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const timings = JSON.parse(
    await readFile(new URL('./pages-regression-timings.json', import.meta.url)),
  );
  const ids = games.map((game) => game.id);
  const matrix = planShards(ids, timings.milliseconds);
  const total = ids.reduce((sum, id) => sum + (timings.milliseconds[id] ?? 30000), 0);
  assert(matrix.include.length >= Math.ceil(total / SHARD_BUDGET_MS));
  const actual = matrix.include.flatMap((shard) => JSON.parse(shard.game_ids));
  assert.deepEqual([...actual].sort(), [...ids].sort());
  assert.equal(new Set(actual).size, ids.length);
  assert(Math.max(...matrix.include.map((shard) => shard.estimated_ms)) < SHARD_BUDGET_MS);
  assert.deepEqual(planShards([...ids].reverse(), timings.milliseconds), matrix);
});
test('small and empty selections retain exactly the requested games', () => {
  assert.deepEqual(planShards([]), { include: [{ shard: 1, estimated_ms: 0, game_ids: '[]' }] });
  assert.equal(planShards(['new-game']).include[0].game_ids, '["new-game"]');
  assert.equal(planShards(['a', 'b']).include.length, 1);
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

test('catalog growth queues a fifth shard while preserving the four-worker concurrency budget', () => {
  const ids = Array.from({ length: 54 }, (_, index) => `game-${index}`);
  const timings = Object.fromEntries(ids.map((id) => [id, 23000]));
  const result = planShards(ids, timings);
  assert.equal(result.include.length, 5);
  assert(result.include.every((shard) => shard.estimated_ms < SHARD_BUDGET_MS));
  assert.deepEqual(
    result.include.flatMap((shard) => JSON.parse(shard.game_ids)).sort(),
    [...ids].sort(),
  );
  assert.throws(() => planShards(ids, timings, 4), /cannot satisfy/);
});
test('large indivisible games, invalid durations and matrix overflow block instead of splitting or omitting assertions', () => {
  assert.throws(() => planShards(['slow'], { slow: SHARD_BUDGET_MS }), /indivisible/);
  assert.throws(() => planShards(['zero'], { zero: 0 }), /Invalid game duration/);
  assert.throws(
    () => planShards(Array.from({ length: 257 }, (_, index) => String(index))),
    /matrix capacity/,
  );
});
