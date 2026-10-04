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
assert.equal(games.length, 5, 'Each built-in game must have its own lazy entry, outside the lobby');
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
  const summary = [];
  for (const [source, chunk] of games) {
    const id = source.match(/game-([^/]+)\/src/)[1];
    const page = await browser.newPage();
    const requests = [],
      errors = [];
    page.on('request', (request) => requests.push(request.url().replace(base, '')));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(base);
    await expect(page.getByRole('heading', { name: '摸鱼游戏社' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    assert(!requests.some((url) => url.startsWith('games/') || /\.(png|wav|webm)(\?|$)/.test(url)));
    for (const [, game] of games) assert(!requests.includes(game.file));
    const lobbyBytes = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .reduce((total, resource) => total + resource.encodedBodySize, 0),
    );
    const start = requests.length;
    await page
      .locator('article')
      .filter({ has: page.locator('code', { hasText: `games/local/game-${id}` }) })
      .getByRole('button', { name: '进入游戏', exact: true })
      .click();
    await expect(page.locator('.game-slot > *').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    assert(requests.includes(chunk.file), `Selected ${id} did not request its chunk`);
    const allowed = new Set([...initialFiles, ...files(source)]);
    for (const request of requests.slice(start)) {
      if (request.startsWith('assets/'))
        assert(allowed.has(request), `${id} fetched unrelated ${request}`);
      assert(!request.startsWith('games/'), `${id} fetched a standalone game`);
    }
    for (const [other, game] of games)
      if (other !== source) assert(!requests.includes(game.file), `${id} also loaded ${other}`);
    if (id === 'cultivation' || id === 'arena') {
      const audioStart = requests.length;
      if (id === 'cultivation')
        await page.getByRole('button', { name: '点香 · 开始修行', exact: true }).click();
      else await page.locator('.arena-picks button').first().click();
      await expect
        .poll(() => requests.slice(audioStart).filter((url) => url.endsWith('.wav')).length)
        .toBeGreaterThan(0);
      await page.waitForLoadState('networkidle');
      const audio = requests.slice(audioStart).filter((url) => url.endsWith('.wav'));
      assert(audio.length > 0, `${id} should load the current background sound`);
      assert(
        !audio.some((url) => /assets\/(forest|summit|win|lose)-/.test(url)),
        `${id} prefetched unused scene/outcome audio: ${audio.join(', ')}`,
      );
    }
    await page.getByRole('button', { name: '← 返回目录', exact: true }).click();
    await expect(page.locator('.game-slot, iframe')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    const chunkRequests = requests.filter((url) => url === chunk.file).length;
    await page
      .locator('article')
      .filter({ has: page.locator('code', { hasText: `games/local/game-${id}` }) })
      .getByRole('button', { name: '进入游戏', exact: true })
      .click();
    await expect(page.locator('.game-slot > *').first()).toBeVisible();
    assert.equal(
      requests.filter((url) => url === chunk.file).length,
      chunkRequests,
      `${id} downloaded its module again on re-entry`,
    );
    assert.deepEqual(errors, []);
    summary.push({ id, lobbyBytes, selectedRequests: requests.length - start });
    await page.close();
  }
  // Browsers may cache a failed dynamic import: a full reload must recover the same route.
  const retry = await browser.newPage();
  const [retrySource, retryChunk] = games[0];
  const retryId = retrySource.match(/game-([^/]+)\/src/)[1];
  let blocked = true;
  await retry.route(`**/${retryChunk.file}`, (route) => {
    // A failed module preload can be retried by import(); keep the outage active.
    return blocked ? route.abort() : route.continue();
  });
  await retry.goto(`${base}#/games/${retryId}`);
  await expect(retry.getByRole('alert')).toContainText('游戏资源加载失败');
  blocked = false;
  await retry.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(retry.locator('.game-slot > *').first()).toBeVisible();
  await retry.close();

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
    JSON.stringify({ lazyLoading: 'passed', games: summary, standalone: 'merge-front' }, null, 2),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
