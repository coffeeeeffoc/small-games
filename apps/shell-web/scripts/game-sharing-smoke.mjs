// Exercises the real Shell and same-origin frame boundary with a small navigation fixture.
// Game challenge rules are verified by each Game's tests.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  base: '/small-games/',
  mode: 'pages',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/small-games/`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  });
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 500 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('denied');
          },
        },
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => {
          throw new DOMException('cancelled', 'AbortError');
        },
      });
    });
    await page.route('**/games/letters-words2/index.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta charset="UTF-8"><p>同题导航测试</p><script>history.replaceState(null,"","?daily=2026-10-01&v=1&token=private#secret")</script>',
      }),
    );
    await page.goto(`${base}?playerToken=private#/games/letters-words2`);
    await expect(page.frameLocator('iframe').getByText('同题导航测试')).toBeVisible();
    await page.getByRole('button', { name: '分享游戏', exact: true }).click();
    const panel = page.getByRole('region', { name: '分享游戏链接' });
    await expect(panel).toBeVisible();
    const input = panel.getByRole('textbox', { name: '游戏链接' });
    const link = `${base}games/letters-words2/index.html?daily=2026-10-01&v=1`;
    await expect(input).toHaveValue(link);
    await panel.getByRole('button', { name: '复制链接' }).click();
    await expect(panel.getByRole('status')).toContainText('手动复制');
    assert.equal(
      await input.evaluate((field) => field.selectionEnd - field.selectionStart),
      link.length,
    );
    await panel.getByRole('button', { name: '发给朋友' }).click();
    await expect(panel.getByRole('status')).toContainText('已取消分享');
    const rect = await panel.boundingBox();
    assert(rect.x >= 0 && rect.x + rect.width <= width, 'share panel stays within the viewport');
    await page.evaluate(() => {
      navigator.clipboard.writeText = async (text) => {
        globalThis.__copiedLink = text;
      };
    });
    await panel.getByRole('button', { name: '复制链接' }).click();
    await expect(panel.getByRole('status')).toContainText('链接已复制');
    assert.equal(await page.evaluate(() => globalThis.__copiedLink), link);
    await panel.getByRole('button', { name: '关闭' }).click();
    await expect(panel).toHaveCount(0);
    await page.getByRole('button', { name: '返回目录', exact: true }).click();
    await expect(page.locator('iframe')).toHaveCount(0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'PASS Shell sharing: 320/390/1280px, Pages path, public challenge, copy fallback and cancellation',
  );
} finally {
  await browser?.close();
  await server.close();
}
