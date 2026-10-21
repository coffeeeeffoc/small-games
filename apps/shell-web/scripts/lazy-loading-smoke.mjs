import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

const manifest = JSON.parse(
  await readFile(new URL('../dist/.vite/manifest.json', import.meta.url)),
);
const games = Object.entries(manifest).filter(
  ([source, chunk]) =>
    /games\/local\/game-[^/]+\/src\/definition\.ts$/.test(source) && chunk.isDynamicEntry,
);
assert.equal(games.length, 0, 'Removed built-in games must not ship in the lobby');
const files = (key, seen = new Set()) => {
  if (seen.has(key)) return [];
  seen.add(key);
  const chunk = manifest[key];
  return [
    chunk.file,
    ...(chunk.css ?? []),
    ...(chunk.assets ?? []),
    ...(chunk.imports ?? []).flatMap((dependency) => files(dependency, seen)),
  ];
};
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry);
const initialFiles = new Set(files(entry));
for (const [source, chunk] of games)
  assert(!initialFiles.has(chunk.file), `Lobby eagerly imports ${source}`);

const basePath = process.env.PAGES_BASE_PATH ?? '/small-games/';
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  base: basePath,
  preview: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}${basePath}`;
  // An independent game must not pull in any built-in game or a sibling iframe.
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url().replace(base, '')));
  await page.goto(`${base}#/games/merge-front`);
  await expect(page.frameLocator('iframe').locator('canvas').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  assert(requests.some((url) => url.startsWith('games/merge-front/')));
  assert(
    requests
      .filter((url) => url.startsWith('games/'))
      .every((url) => url.startsWith('games/merge-front/')),
  );
  for (const [, game] of games) assert(!requests.includes(game.file));
  console.log(
    JSON.stringify({ lazyLoading: 'passed', games: [], standalone: 'merge-front' }, null, 2),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
