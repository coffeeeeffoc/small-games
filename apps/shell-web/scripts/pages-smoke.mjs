import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { markers, exerciseStandalone } from './standalone-game-checks.mjs';

const games = JSON.parse(await readFile(new URL('../src/standalone-games.json', import.meta.url)));
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  base: '/small-games/',
  preview: { host: '127.0.0.1', port: 0 },
});
let browser;
const results = [];
const output = new URL('../../../.scratch/game-integration/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const url = process.env.PAGES_URL ?? `${origin}/small-games/`;
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
    headless: true,
  });
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => {
    if (/127\.0\.0\.1:43002|localhost:43002/.test(request.url()))
      failures.push(`Pages requested a local Runtime: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(url) && response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(url) && !request.failure()?.errorText.includes('ERR_ABORTED'))
      failures.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: '摸鱼游戏社' })).toBeVisible();
  await expect(page.getByText('云存档账号', { exact: true })).toHaveCount(0);
  await expect(page.locator('.catalog-grid article')).toHaveCount(4 + games.length);
  for (const title of ['三分钟修仙', '秋声斗蟋', '打工人摸鱼记', '电子斗蛐蛐']) {
    await page.locator('article').filter({ hasText: title }).getByRole('button').click();
    if (title === '三分钟修仙') {
      await page.getByRole('button', { name: '点香 · 开始修行' }).click();
      await expect(page.getByRole('button', { name: '御剑', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '暂停', exact: true }).click();
      await page.getByRole('button', { name: '继续修行' }).click();
    } else if (title === '秋声斗蟋') {
      await page.getByRole('button', { name: '揭盖 · 开斗 →' }).click();
      await page.getByRole('button', { name: '暂停对局' }).click();
      await page.getByRole('button', { name: '继续斗蟋' }).click();
    } else if (title === '打工人摸鱼记') {
      await page.getByRole('button', { name: '悄悄进入办公室' }).click();
      await page.getByRole('button', { name: '蹲下', exact: false }).click();
      await expect(page.getByRole('button', { name: '站起来', exact: false })).toBeVisible();
      await page.getByRole('button', { name: '暂停', exact: true }).click();
      await page.getByRole('button', { name: '继续潜入' }).click();
    } else {
      await page.locator('.arena-picks button').first().click();
      await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'mutate');
      while (await page.locator('.arena-traits button').count())
        await page.locator('.arena-traits button').first().click();
      await page.getByRole('button', { name: '开盆，迎战！', exact: false }).click();
      await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'battle');
      await page.getByRole('button', { name: '闪身避锋', exact: false }).click();
      await expect(page.getByRole('progressbar', { name: '体力' })).not.toHaveAttribute(
        'value',
        '100',
      );
      await page.getByRole('button', { name: '暂停游戏' }).click();
      await page.getByRole('button', { name: '准备好了，继续' }).click();
    }
    await page.getByRole('button', { name: '← 返回目录', exact: true }).click();
    await expect(page.locator('.catalog-grid article')).toHaveCount(4 + games.length);
  }
  for (const game of games) {
    await page.locator('article').filter({ hasText: game.title }).getByRole('button').click();
    const frame = page.frameLocator('iframe');
    const marker = markers[game.id];
    assert(marker, `Missing ready marker for ${game.id}`);
    await expect(frame.locator(marker).first()).toBeVisible();
    await exerciseStandalone(frame, game.id);
    const standaloneUrl = new URL(`games/${game.id}/index.html`, url).href;
    assert.equal(await page.locator('iframe').evaluate((element) => element.src), standaloneUrl);
    assert.equal(
      await page.getByRole('link', { name: '独立打开' }).evaluate((a) => a.href),
      standaloneUrl,
    );
    const landscape = ['fishing', 'vibeJam-myself-delivery', 'vibeJam-myself-nullrange'].includes(
      game.id,
    );
    const viewport = landscape ? { width: 844, height: 390 } : { width: 390, height: 844 };
    const direct = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
    direct.on('pageerror', (error) => failures.push(`${game.id}: ${error.message}`));
    direct.on('response', (response) => {
      if (response.url().startsWith(url) && response.status() >= 400)
        failures.push(`${response.status()} ${response.url()}`);
    });
    try {
      const response = await direct.goto(standaloneUrl);
      assert.equal(response.status(), 200);
      await expect(direct.locator(marker).first()).toBeVisible();
      await exerciseStandalone(direct, game.id, true);
      assert(
        await direct.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
        ),
        `${game.id}: mobile overflow`,
      );
      await direct.screenshot({ path: fileURLToPath(new URL(`${game.id}-phone.png`, output)) });
      results.push({ id: game.id, embedded: 'passed', directMobile: 'passed', viewport });
      console.log(`Passed: ${game.id} (embedded and ${viewport.width}x${viewport.height} touch)`);
    } finally {
      await direct.close();
    }
    await page.getByRole('button', { name: '返回目录', exact: true }).click();
    await expect(page.locator('iframe')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  );
  assert.deepEqual(failures, []);
  await writeFile(
    new URL('report.json', output),
    JSON.stringify({ builtIn: 4, standalone: results, failures }, null, 2),
  );
  console.log(
    `Pages: ${4 + games.length} catalog entries, ${games.length} embedded/direct games, return navigation, mobile width and Runtime isolation passed.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
