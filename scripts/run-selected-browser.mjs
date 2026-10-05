import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { preview } from 'vite';
import { exerciseStandalone } from '../apps/shell-web/scripts/standalone-game-checks.mjs';
import { selectPagesGames } from '../apps/shell-web/scripts/pages-validation.mjs';
import { workspacePackages } from './validation-plan.mjs';
import { run } from './validate-push.mjs';
const plan = JSON.parse(process.argv[2]);
assert(plan.browser === true && plan.full === false, 'Expected an explicit selective browser plan');
const root = process.cwd();
const games = JSON.parse(await readFile('apps/shell-web/src/standalone-games.json', 'utf8'));
for (const game of selectPagesGames(games, JSON.stringify(plan.browser_ids))) {
  const dist = path.join(root, game.source, game.output);
  assert(
    (await stat(path.join(dist, 'index.html'))).isFile(),
    `Missing built browser target: ${game.id}`,
  );
  const server = await preview({
    root: path.join(root, game.source),
    build: { outDir: game.output },
    preview: { host: '127.0.0.1', port: 0 },
  });
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chromium',
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
      headless: true,
    });
    for (const mobile of [false, true]) {
      const context = await browser.newContext(mobile ? devices['Pixel 7'] : {});
      try {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
        await exerciseStandalone(page, game.id, mobile);
        console.log(`Selected CI browser: ${game.id}, ${mobile ? 'touch' : 'desktop'} passed`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}
const selectedBuiltins = plan.game_sources.filter(
  (source) => !games.some((game) => game.source === source),
);
const packages = await workspacePackages(root);
for (const source of selectedBuiltins) {
  const pkg = packages.find((item) => item.dir === source);
  assert(pkg?.scripts?.smoke, `Missing actual browser smoke task for built-in ${source}`);
  run('pnpm', ['--filter', pkg.name, 'smoke'], root, process.env);
}
