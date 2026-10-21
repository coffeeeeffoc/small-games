// Production bundles, actual mobile touch and fullscreen (not a WeChat runtime).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
process.env.PORT = '0';
const { server } = await import('../server.js');
if (!server.listening) await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const output = fileURLToPath(new URL('../../../../.scratch/echo-lab-platforms/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const errors = [];
try {
  for (const target of ['web', 'h5']) {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        hasTouch: width < 1000,
        isMobile: width < 1000,
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      const base = `${origin}/${target === 'web' ? 'dist' : 'dist-h5'}/index.html`;
      await page.goto(base + '?dev=0');
      await page.waitForSelector('#scene [data-object="reflector-1"]');
      assert.equal(await page.locator('html').getAttribute('data-platform'), target);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `${target} ${width} overflow`,
      );
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), false);
      const fullscreen = page.locator('[data-game-fullscreen]');
      assert.equal(await fullscreen.count(), 1);
      const bounds = await fullscreen.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      if (width < 1000) await fullscreen.tap();
      else await fullscreen.click();
      await page.waitForTimeout(100);
      if (await page.evaluate(() => Boolean(document.fullscreenElement))) {
        await fullscreen.click();
        await page.waitForFunction(() => !document.fullscreenElement);
      }
      await page.locator('#addAbsorber').scrollIntoViewIfNeeded();
      if (width < 1000) await page.locator('#addAbsorber').tap();
      else await page.locator('#addAbsorber').click();
      assert.equal(await page.locator('#panelCount').textContent(), '2 / 8');
      await page.waitForTimeout(350);
      await page.reload();
      await page.waitForSelector('#scene');
      assert.equal(await page.locator('#panelCount').textContent(), '2 / 8');
      await page.screenshot({ path: `${output}/${target}-${width}.png`, fullPage: true });
      await page.goto(base + '?dev=1');
      await page.waitForSelector('small-games-devtools');
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), true);
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS: Web/H5 production packages at 320, 390 and 1280 px; touch, persistence, fullscreen, explicit dev switches. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
