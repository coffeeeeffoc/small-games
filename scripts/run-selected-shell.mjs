import assert from 'node:assert/strict';
import { readFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildCompetition, competitionGames } from './competition-build.mjs';
import { run } from './validate-push.mjs';
const plan = JSON.parse(process.argv[2]);
assert(plan.full === false && plan.browser_ids.length, 'Expected bounded entry checks');
const root = process.cwd();
const games = JSON.parse(await readFile('apps/shell-web/src/standalone-games.json', 'utf8'));
const shell = path.join(root, 'apps/shell-web');
await rm(path.join(shell, 'public/games'), { recursive: true, force: true });
for (const id of plan.browser_ids) {
  const game = games.find((item) => item.id === id);
  assert(game, `Unregistered incremental browser target ${id}`);
  if (competitionGames[id]) await buildCompetition({ only: id });
  await cp(path.join(root, game.source, game.output), path.join(shell, 'public/games', id), {
    recursive: true,
  });
}
// Deliberately avoid build:pages, whose prepare step builds every registered game.
run('pnpm', ['exec', 'vite', 'build', '--mode', 'pages'], shell, process.env);
run(process.execPath, ['scripts/pages-smoke.mjs'], shell, {
  ...process.env,
  PAGES_GAME_IDS: JSON.stringify(plan.browser_ids),
  PAGES_SKIP_BUILTINS: '1',
  PAGES_SCREENSHOTS: '0',
});
