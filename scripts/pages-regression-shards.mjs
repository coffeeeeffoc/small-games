import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { selectPagesGames } from '../apps/shell-web/scripts/pages-validation.mjs';

// Longest measured games first; no browser assertions or game phases are split.
export function planShards(ids, timings = {}, count = 4) {
  assert(Number.isInteger(count) && count >= 1 && count <= 4, 'Invalid shard count');
  assert(Array.isArray(ids) && ids.every((id) => typeof id === 'string'), 'Invalid game IDs');
  assert.equal(new Set(ids).size, ids.length, 'Duplicate selected game');
  const weight = (id) => {
    const value = timings[id] ?? 30000;
    assert(Number.isFinite(value) && value > 0, 'Invalid game duration');
    return value;
  };
  const shards = Array.from({ length: Math.min(count, Math.max(1, ids.length)) }, (_, index) => ({
    shard: index + 1,
    ids: [],
    estimated_ms: 0,
  }));
  for (const id of [...ids].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b, 'en'))) {
    const next = [...shards].sort(
      (a, b) => a.estimated_ms - b.estimated_ms || a.shard - b.shard,
    )[0];
    next.ids.push(id);
    next.estimated_ms += weight(id);
  }
  return {
    include: shards.map(({ ids: selected, ...shard }) => ({
      ...shard,
      game_ids: JSON.stringify(selected),
    })),
  };
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
  console.log(JSON.stringify(matrix, null, 2));
  if (env.GITHUB_OUTPUT)
    await appendFile(env.GITHUB_OUTPUT, 'matrix=' + JSON.stringify(matrix) + '\n');
  return matrix;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
