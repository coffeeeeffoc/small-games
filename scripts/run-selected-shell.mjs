import { writeLegacyGameRedirects } from '../apps/shell-web/scripts/legacy-game-redirects.mjs';
import assert from 'node:assert/strict';
import { readFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCompetition, competitionGames } from './competition-build.mjs';
import { run } from './validate-push.mjs';
export function selectedShellEnvironment(plan, env = process.env) {
  return {
    ...env,
    PAGES_GAME_IDS: JSON.stringify(plan.browser_ids),
    PAGES_SKIP_BUILTINS: plan.vite_patch ? '0' : '1',
    PAGES_SCREENSHOTS: '0',
  };
}

async function runSelectedShell(plan) {
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
  await writeLegacyGameRedirects(path.join(shell, 'public/games'), plan.browser_ids);
  // Deliberately avoid build:pages, whose prepare step builds every registered game.
  run('pnpm', ['exec', 'vite', 'build', '--mode', 'pages'], shell, process.env);
  run(process.execPath, ['scripts/pages-smoke.mjs'], shell, selectedShellEnvironment(plan));
  if (plan.browser_ids.includes('out-of-frame'))
    run(
      process.execPath,
      ['games/local/out-of-frame/tests/rotation-shell.browser.mjs'],
      root,
      process.env,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runSelectedShell(JSON.parse(process.argv[2]));
