import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { selectPagesGames } from '../apps/shell-web/scripts/pages-validation.mjs';

export const SHARD_BUDGET_MS = 300000;
export const UNKNOWN_GAME_ESTIMATE_MS = 30000;
const MAX_MATRIX_JOBS = 256;

// Keep each game's assertions/phases together. Add queued shards when the
// catalog outgrows four parallel workers; never lower estimates to fit a budget.
export function planShards(ids, timings = {}, count) {
  assert(
    count === undefined || (Number.isInteger(count) && count >= 1 && count <= MAX_MATRIX_JOBS),
    'Invalid shard count',
  );
  assert(Array.isArray(ids) && ids.every((id) => typeof id === 'string'), 'Invalid game IDs');
  assert.equal(new Set(ids).size, ids.length, 'Duplicate selected game');
  assert(ids.length <= MAX_MATRIX_JOBS, 'Catalog exceeds the GitHub matrix capacity');
  const weight = (id) => {
    const value = timings[id] ?? UNKNOWN_GAME_ESTIMATE_MS;
    assert(Number.isFinite(value) && value > 0, 'Invalid game duration');
    assert(
      value < SHARD_BUDGET_MS,
      `Game ${id} exceeds the indivisible shard budget; verify its measurement and runtime`,
    );
    return value;
  };
  const ordered = [...ids].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b, 'en'));
  const total = ids.reduce((sum, id) => sum + weight(id), 0);
  const distribute = (size) => {
    const shards = Array.from({ length: Math.min(size, Math.max(1, ids.length)) }, (_, index) => ({
      shard: index + 1,
      ids: [],
      estimated_ms: 0,
    }));
    for (const id of ordered) {
      const next = [...shards].sort(
        (a, b) => a.estimated_ms - b.estimated_ms || a.shard - b.shard,
      )[0];
      next.ids.push(id);
      next.estimated_ms += weight(id);
    }
    return shards;
  };
  const first = count ?? Math.max(1, Math.ceil(total / SHARD_BUDGET_MS));
  for (let size = first; size <= (count ?? Math.max(1, ids.length)); size++) {
    const shards = distribute(size);
    if (shards.some((shard) => shard.estimated_ms >= SHARD_BUDGET_MS)) continue;
    return {
      include: shards.map(({ ids: selected, ...shard }) => ({
        ...shard,
        game_ids: JSON.stringify(selected),
      })),
    };
  }
  throw new Error(
    'Selected shard count cannot satisfy the estimated budget; increase queued shards without dropping games',
  );
}

export async function main(env = process.env) {
  assert(['true', 'false'].includes(env.PAGES_FULL_REGRESSION), 'Invalid full regression flag');
  const games = JSON.parse(
    await readFile(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url), 'utf8'),
  );
  const selected = selectPagesGames(
    games,
    env.PAGES_FULL_REGRESSION === 'true' ? undefined : env.PAGES_GAME_IDS,
  );
  const timings = JSON.parse(
    await readFile(new URL('./pages-regression-timings.json', import.meta.url), 'utf8'),
  );
  const matrix = planShards(
    selected.map((game) => game.id),
    timings.milliseconds,
  );
  console.error(
    JSON.stringify({
      timing_source_sha: timings.sourceSha,
      budget_ms: SHARD_BUDGET_MS,
      unknown_game_estimate_ms: UNKNOWN_GAME_ESTIMATE_MS,
      unmeasured_games: selected
        .filter((game) => timings.milliseconds[game.id] === undefined)
        .map((game) => game.id),
      queued_shards: matrix.include.length,
    }),
  );
  console.log(JSON.stringify(matrix, null, 2));
  if (env.GITHUB_OUTPUT)
    await appendFile(env.GITHUB_OUTPUT, 'matrix=' + JSON.stringify(matrix) + '\n');
  return matrix;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
