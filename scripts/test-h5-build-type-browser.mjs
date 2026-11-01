import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const runtime = await readFile(new URL('../platforms/h5/dev-mode.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const type of ['development', 'test', 'production']) {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.setContent(
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="scene">游戏</button></body></html>',
    );
    await page.evaluate((type) => {
      Object.defineProperty(globalThis, '__SMALL_GAMES_BUILD__', {
        value: Object.freeze({ type }),
      });
      globalThis.calls = [];
      globalThis.sceneClicks = 0;
      document.addEventListener('pointerdown', () => globalThis.sceneClicks++);
    }, type);
    await page.addScriptTag({ content: runtime });
    await page.evaluate(() => {
      SmallGamesDev.setPanelHidden(true);
      SmallGamesDev.registerActions([
        {
          id: 'coins',
          label: '调整金币',
          input: { label: '金币变化', min: -100, max: 100, step: 1, value: 10 },
          run(value) {
            globalThis.calls.push(value);
          },
        },
      ]);
    });
    const toggle = page.getByRole('button', { name: '开发者调试', exact: true });
    if (type !== 'development') {
      await expect(toggle).toHaveCount(0);
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), false);
    } else {
      await expect(toggle).toBeVisible();
      await toggle.tap();
      await expect(page.getByRole('button', { name: '退出开发模式' })).toBeHidden();
      await expect(page.getByLabel('记住开发模式（当前站点）')).toBeHidden();
      const input = page.getByRole('spinbutton', { name: '金币变化' });
      await input.fill('-35');
      await page.getByRole('button', { name: '调整金币' }).tap();
      assert.deepEqual(await page.evaluate(() => globalThis.calls), [-35]);
      await input.fill('101');
      await page.getByRole('button', { name: '调整金币' }).tap();
      await input.fill('1.5');
      await page.getByRole('button', { name: '调整金币' }).tap();
      assert.deepEqual(await page.evaluate(() => globalThis.calls), [-35]);
      assert.equal(await page.evaluate(() => globalThis.sceneClicks), 0);
      await page.getByRole('button', { name: '关闭', exact: true }).tap();
      await expect(toggle).toBeVisible();
      const bounds = await toggle.boundingBox();
      await page.mouse.move(bounds.x + 20, bounds.y + 20);
      await page.mouse.down();
      await page.mouse.move(820, 360, { steps: 5 });
      await page.mouse.up();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(async () => {
          const resized = await toggle.boundingBox();
          return (
            resized.x >= 0 &&
            resized.x + resized.width <= 390 &&
            resized.y >= 0 &&
            resized.y + resized.height <= 844
          );
        })
        .toBe(true);
      await toggle.tap();
      await expect(input).toBeVisible();
    }
    await context.close();
  }
  console.log(
    'H5 build types: development controls/input/touch/resize and test/production lock passed.',
  );
} finally {
  await browser.close();
}
