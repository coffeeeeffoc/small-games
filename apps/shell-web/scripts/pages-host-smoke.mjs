import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, devices, expect } from '@playwright/test';
import { preview } from 'vite';
import { monitorPagesPage } from './pages-browser-monitor.mjs';
import { verifyPagesArtifacts } from './pages-validation.mjs';

const games = JSON.parse(await readFile(new URL('../src/standalone-games.json', import.meta.url)));
const basePath = process.env.PAGES_BASE_PATH ?? '/small-games/';
const artifacts = await verifyPagesArtifacts({
  dist: fileURLToPath(new URL('../dist/', import.meta.url)),
  games,
  basePath,
});
console.log(
  `Pages artifacts: ${artifacts.games} standalone entries, ${artifacts.files} local files verified.`,
);
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  base: basePath,
  preview: { host: '127.0.0.1', port: 0 },
});
const output = new URL('../../../.scratch/pages-host/', import.meta.url);
const failures = [];
let browser;
let page;
let status = 'running';
const started = performance.now();
await mkdir(output, { recursive: true });
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const url = process.env.PAGES_URL ?? `${origin}${basePath}`;
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
    headless: true,
  });
  page = await browser.newPage();
  page.setDefaultTimeout(15000);
  monitorPagesPage(page, url, failures);
  async function lobby() {
    await expect(page.getByRole('heading', { name: '摸鱼游戏社' })).toBeVisible();
    await expect(page.getByText('云存档账号', { exact: true })).toHaveCount(0);
    await expect(page.locator('.catalog-grid article')).toHaveCount(5 + games.length);
  }
  async function ready(target, id, title) {
    await expect(target.locator('nav strong')).toHaveText(title);
    if (id === 'cultivation')
      await expect(target.getByRole('button', { name: '点香 · 开始修行' })).toBeVisible();
    else {
      await expect(target.frameLocator('iframe').locator('#start-defense')).toBeVisible();
      const standaloneUrl = new URL(`games/${id}/index.html`, url).href;
      assert.equal(
        await target.locator('iframe').evaluate((element) => element.src),
        standaloneUrl,
      );
      assert.equal(
        await target.getByRole('link', { name: '独立打开' }).evaluate((element) => element.href),
        standaloneUrl,
      );
    }
  }
  async function sharing(id, title) {
    const sharedUrl = `${url}#/games/${id}`;
    await expect(page).toHaveURL(sharedUrl);
    await ready(page, id, title);
    await page.goBack();
    await lobby();
    await page.goForward();
    await ready(page, id, title);
    await page.reload();
    await ready(page, id, title);
    const shared = await browser.newPage();
    shared.setDefaultTimeout(15000);
    monitorPagesPage(shared, url, failures, `share/${id}`);
    try {
      assert.equal((await shared.goto(sharedUrl)).status(), 200);
      await ready(shared, id, title);
    } finally {
      await shared.close();
    }
  }
  assert.equal((await page.goto(url)).status(), 200);
  await lobby();
  for (const game of [
    { id: 'cultivation', title: '三分钟修仙' },
    games.find((game) => game.id === 'merge-front'),
  ]) {
    assert(game, 'Missing representative standalone game merge-front');
    console.log(`Pages host: route and startup / ${game.id}`);
    await page.locator('article').filter({ hasText: game.title }).locator('.game-launch').click();
    await sharing(game.id, game.title);
    await page
      .getByRole('button', {
        name: game.id === 'cultivation' ? '← 返回目录' : '返回目录',
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(url);
    await lobby();
    await expect(page.locator('.game-slot, iframe')).toHaveCount(0);
  }
  await page.goto(`${url}#/games/not-a-game`);
  await lobby();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
    ),
    'Lobby mobile overflow',
  );

  const mobile = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
  });
  try {
    const direct = await mobile.newPage();
    direct.setDefaultTimeout(15000);
    monitorPagesPage(direct, url, failures, 'merge-front/mobile');
    assert.equal(
      (await direct.goto(new URL('games/merge-front/index.html', url).href)).status(),
      200,
    );
    await expect(direct.locator('#start-defense')).toBeVisible();
    await expect(direct.locator('canvas').first()).toBeVisible();
    assert(
      await direct.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
      'Standalone mobile overflow',
    );
  } finally {
    await mobile.close();
  }
  assert.deepEqual(failures, []);
  status = 'passed';
  console.log(
    `Pages host: artifact integrity, shared routes, iframe/mobile startup and Runtime isolation passed (${Math.round(performance.now() - started)} ms).`,
  );
} catch (error) {
  status = 'failed';
  failures.push(error.stack ?? String(error));
  if (page)
    await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)) }).catch(() => {});
  throw error;
} finally {
  await writeFile(
    new URL('report.json', output),
    JSON.stringify(
      { status, artifacts, failures, durationMs: Math.round(performance.now() - started) },
      null,
      2,
    ),
  );
  await browser?.close();
  await server.close();
}
