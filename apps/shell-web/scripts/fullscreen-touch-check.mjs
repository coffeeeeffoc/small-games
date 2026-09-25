// Run after build:pages. SHELL_TEST_URL can point at an immutable older build.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, webkit } from '@playwright/test';
import { preview } from 'vite';
import { exerciseStandalone } from './standalone-game-checks.mjs';

const output = new URL('../../../.scratch/six-games-95/fullscreen-touch/', import.meta.url);
await mkdir(output, { recursive: true });
const server = process.env.SHELL_TEST_URL
  ? undefined
  : await preview({
      root: fileURLToPath(new URL('../', import.meta.url)),
      base: '/small-games/',
      preview: { host: '127.0.0.1', port: 0 },
    });
const url =
  process.env.SHELL_TEST_URL ??
  `http://127.0.0.1:${server.httpServer.address().port}/small-games/#/games/letters-words2`;
let browser;
const report = {
  url,
  environment: 'Windows WebKit desktop touch emulation, not a physical phone',
  results: [],
};
try {
  browser = await webkit.launch({ headless: false });
  report.browser = browser.version();
  for (let attempt = 0; attempt < 3; attempt++) {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });
    // Fix only the random board layout; actions and game state use the real UI.
    await context.addInitScript(() => {
      if (!globalThis.location.pathname.includes('/games/letters-words2/')) return;
      let seed = 12345;
      globalThis.Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    });
    const page = await context.newPage();
    const result = { attempt, errors: [] };
    report.results.push(result);
    page.on('pageerror', (error) => result.errors.push(error.message));
    try {
      assert.equal((await page.goto(url)).status(), 200);
      await expect(page.locator('iframe')).toBeVisible();
      const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
      await expect(frame.locator('#board button').first()).toBeVisible();
      const body = await frame.locator('body').elementHandle();
      const toggle = page.locator('nav [data-game-fullscreen]');
      await toggle.tap();
      await expect
        .poll(() => page.evaluate(() => globalThis.document.fullscreenElement?.tagName))
        .toBe('MAIN');
      await exerciseStandalone(frame, 'letters-words2', true);
      const storage = await frame.evaluate(() =>
        JSON.stringify(Object.fromEntries(Object.entries(globalThis.localStorage))),
      );
      await toggle.tap();
      await expect(toggle).toHaveText('全屏');
      await expect
        .poll(() => page.evaluate(() => !!globalThis.document.fullscreenElement))
        .toBe(false);
      assert.equal(await body.evaluate((element) => element.isConnected), true);
      assert.equal(
        await frame.evaluate(() =>
          JSON.stringify(Object.fromEntries(Object.entries(globalThis.localStorage))),
        ),
        storage,
      );
      await frame.locator('#board button:enabled:not([aria-disabled="true"])').first().tap();
      await expect(frame.locator('#answer-slots .filled')).toHaveCount(1);
      await toggle.tap();
      await expect(toggle).toHaveText('退出全屏');
      await page.getByRole('button', { name: '返回目录', exact: true }).tap();
      await expect(page.locator('iframe')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => !!globalThis.document.fullscreenElement))
        .toBe(false);
      assert.deepEqual(result.errors, []);
      result.status = 'passed';
      console.log(`PASS fullscreen touch ${attempt + 1}: undo, exit, continue and return`);
    } catch (error) {
      result.status = 'failed';
      result.error = error.stack || error.message;
      await page.screenshot({ path: fileURLToPath(new URL(`failure-${attempt}.png`, output)) });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await browser?.close();
  await server?.close();
}
