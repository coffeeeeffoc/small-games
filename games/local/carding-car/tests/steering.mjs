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
        userAgent: touch
          ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
          : undefined,
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(process.env.KART_URL || 'http://127.0.0.1:4198');
      await page.waitForFunction(() => globalThis.__kart?.snapshot().modelsLoaded && !__kart.snapshot().loading);
      const cdp = touch ? await page.context().newCDPSession(page) : null;
      if (touch) await page.touchscreen.tap(480, 395);
      else {
        await page.keyboard.press('Enter');
        await page.keyboard.down('ArrowUp');
      }
      await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
      // Let the starting pack pull away through real braking, so kart-to-kart separation
      // cannot be mistaken for an opposite steering force during the first 0.2 seconds.
      if (touch)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: 674, y: 440, id: 3 }],
        });
      else await page.keyboard.down('ArrowDown');
      await page.waitForFunction(() => __kart.snapshot().time > 1.2);
      if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.keyboard.up('ArrowDown');
      await page.waitForFunction(() => __kart.snapshot().time > 3);
      const start = await page.evaluate(() => __kart.snapshot());
      const before = start.player;
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: 960 * (0.16 + side * 0.095), y: 440, id: 1 },
            { x: 844, y: 440, id: 2 },
          ],
        });
      } else await page.keyboard.down(side < 0 ? 'ArrowLeft' : 'ArrowRight');
      await page.waitForFunction((side) => __kart.snapshot().input.steer * side > 0.9, side);
      await page.waitForFunction((time) => __kart.snapshot().time >= time + 0.2, start.time);
      const entry = (await page.evaluate(() => __kart.snapshot())).player;
      const entryTravel =
        -(entry.x - before.x) * Math.cos(before.heading) +
        (entry.z - before.z) * Math.sin(before.heading);
      assert.ok(
        entryTravel * side >= -0.01,
        'entering a drift must not kick toward the opposite side',
      );
      if (touch) await page.waitForFunction(() => __kart.snapshot().player.tier >= 1);
      else await page.waitForFunction((time) => __kart.snapshot().time >= time + 1, start.time);
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
      if (touch) {
        assert.ok(after.tier >= 1, 'the cancellation check must start with a charged drift');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await page.waitForTimeout(100);
        const cancelled = await page.evaluate(() => __kart.snapshot());
        assert.equal(cancelled.input.steer, 0);
        assert.equal(cancelled.input.drift, false);
        assert.equal(cancelled.player.charge, 0);
        assert.equal(
          cancelled.boosts,
          state.boosts,
          'cancelling a charged drift must not release a boost',
        );
      }
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `../reports/steering-${touch ? 'touch' : 'keyboard'}-${side < 0 ? 'left' : 'right'}.png`,
            import.meta.url,
          ),
        ),
      });
      if (touch) {
        await page.touchscreen.tap(70, 240);
        await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
        await page.touchscreen.tap(743, 395);
        await page.waitForFunction(() => __kart.snapshot().phase === 'countdown');
        assert.equal((await page.evaluate(() => __kart.snapshot())).time, 0);
      }
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
