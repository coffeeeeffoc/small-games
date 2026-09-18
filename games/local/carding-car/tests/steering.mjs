import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [];
try {
  for (const touch of [false, true]) {
    for (const side of [-1, 1]) {
      const page = await browser.newPage({
        viewport: { width: 960, height: 540 },
        hasTouch: touch,
        isMobile: touch,
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(process.env.KART_URL || 'http://127.0.0.1:4198');
      await page.waitForFunction(() => globalThis.__kart?.snapshot().modelsLoaded);
      if (touch) await page.touchscreen.tap(480, 347);
      else await page.keyboard.press('Enter');
      await page.waitForFunction(() => __kart.snapshot().time > 1.8);
      const start = await page.evaluate(() => __kart.snapshot());
      const before = start.player;
      if (touch) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: 960 * (0.16 + side * 0.095), y: 440, id: 1 },
            { x: 844, y: 440, id: 2 },
          ],
        });
      } else await page.keyboard.down(side < 0 ? 'ArrowLeft' : 'ArrowRight');
      await page.waitForFunction((side) => __kart.snapshot().input.steer * side > 0.9, side);
      await page.waitForFunction((time) => __kart.snapshot().time >= time + 1, start.time);
      const state = await page.evaluate(() => __kart.snapshot());
      const after = state.player;
      assert.equal(state.phase, 'racing');
      const rightTravel =
        -(after.x - before.x) * Math.cos(before.heading) +
        (after.z - before.z) * Math.sin(before.heading);
      assert.ok(
        rightTravel * side > 0.2,
        `${touch ? 'touch drift' : 'keyboard'} ${side}: moved ${rightTravel}`,
      );
      assert.ok(
        (after.heading - before.heading) * side < 0,
        'vehicle nose must turn toward the requested side',
      );
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `../reports/steering-${touch ? 'touch' : 'keyboard'}-${side < 0 ? 'left' : 'right'}.png`,
            import.meta.url,
          ),
        ),
      });
      console.log(
        `${touch ? 'touch drift' : 'keyboard'} ${side < 0 ? 'left' : 'right'}: correct (${rightTravel.toFixed(2)}m)`,
      );
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
