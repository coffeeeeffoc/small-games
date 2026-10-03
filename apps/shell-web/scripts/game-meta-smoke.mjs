import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const meta = JSON.parse(await readFile(new URL('../src/game-meta.json', import.meta.url), 'utf8'));
const evidence = fileURLToPath(new URL('../../../test-results/game-meta/', import.meta.url));
const server = await preview({
  root,
  base: '/small-games/',
  preview: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const base = `http://127.0.0.1:${server.httpServer.address().port}/small-games/`;
  await mkdir(evidence, { recursive: true });
  for (const [width, height, touch] of [
    [320, 568, true],
    [390, 844, true],
    [844, 390, true],
    [1280, 800, false],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const press = (locator) => (touch ? locator.tap() : locator.click());
    await page.goto(base);
    await expect(page.locator('.catalog-grid article')).toHaveCount(Object.keys(meta.games).length);
    await expect(page.locator('.game-history')).toHaveCount(0);
    await press(page.getByRole('button', { name: '详情卡片', exact: true }));
    await expect(page.locator('.game-history')).toHaveCount(Object.keys(meta.games).length);
    for (const [id, entry] of Object.entries(meta.games)) {
      const card = page.locator(`article[data-game-id="${id}"]`);
      await expect(card.locator('.game-history dt')).toHaveText(['创建', '最后更新']);
      for (const [index, kind] of ['created', 'updated'].entries()) {
        await expect(card.locator('.game-history time').nth(index)).toHaveAttribute(
          'datetime',
          entry[kind].time,
        );
        await expect(card.locator('.game-history code').nth(index)).toHaveAttribute(
          'title',
          entry[kind].commit,
        );
        await expect(card.locator('.game-history code').nth(index)).toHaveText(
          entry[kind].commit.slice(0, 8),
        );
      }
    }
    assert(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
      `${width}: no horizontal overflow`,
    );
    const first = page.locator('.catalog-grid article').first();
    await first.scrollIntoViewIfNeeded();
    const bounds = await first.boundingBox();
    assert(
      bounds.x >= 0 && bounds.x + bounds.width <= width,
      `${width}: card remains within the viewport`,
    );
    await first.screenshot({ path: `${evidence}/card-${width}.png` });
    await page.getByRole('searchbox').fill('三分钟修仙');
    await expect(page.locator('.game-history')).toHaveCount(1);
    await press(page.getByRole('button', { name: '进入游戏', exact: true }));
    await expect(page.locator('.game-slot > *').first()).toBeVisible();
    await press(page.getByRole('button', { name: '点香 · 开始修行', exact: true }));
    await press(page.getByRole('button', { name: '← 返回目录', exact: true }));
    await expect(page.locator('.game-history')).toHaveCount(1);
    await press(page.getByRole('button', { name: '简洁一览', exact: true }));
    await expect(page.locator('.game-history')).toHaveCount(0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    `游戏 meta 浏览器回归通过：${Object.keys(meta.games).length} 个游戏，320/390/844/1280px，卡片/列表切换、搜索、触屏进入与返回。`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
