import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { sourceHash } from '../scripts/artifact.mjs';
import { angleDelta } from '../assets/scripts/KartConfig.ts';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
assert.equal(
  (await fetch(new URL('build-info.json', url)).then((r) => r.json())).sourceHash,
  await sourceHash(),
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  for (const touch of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      hasTouch: touch,
      userAgent: touch
        ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
        : undefined,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.__kart?.snapshot().modelsLoaded && !__kart.snapshot().loading);
    if (touch) await page.touchscreen.tap(480, 395);
    else {
      await page.keyboard.press('Enter');
      await page.keyboard.down('ArrowUp');
    }
    await page.waitForFunction(() => __kart.snapshot().time > 2);
    const snapshot = () => page.evaluate(() => __kart.snapshot());
    const before = await snapshot();
    const cdp = touch ? await page.context().newCDPSession(page) : null;
    if (touch)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 674, y: 440, id: 1 }],
      });
    else await page.keyboard.down('ArrowDown');
    let previous = before,
      stopped = false,
      reversed = false;
    while (previous.time < before.time + 3) {
      await page.waitForTimeout(40);
      const state = await snapshot(),
        elapsed = state.time - previous.time;
      stopped ||= state.player.speed < 2;
      reversed ||=
        state.player.speed > 3 &&
        Math.cos(state.player.velocityHeading - state.player.heading) < -0.9;
      assert.equal(state.resets, 0);
      assert.ok(
        Math.hypot(state.player.x - previous.player.x, state.player.z - previous.player.z) <
          35 * elapsed + 0.1,
      );
      assert.ok(
        Math.abs(angleDelta(state.camera.heading, before.camera.heading)) < 0.05,
        'reverse must not flip the camera',
      );
      previous = state;
    }
    assert.ok(stopped && reversed, 'holding brake must stop then reverse');
    await page.screenshot({
      path: fileURLToPath(
        new URL(`../reports/reverse-${touch ? 'touch' : 'keyboard'}.png`, import.meta.url),
      ),
    });
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.keyboard.up('ArrowDown');
    await page.waitForFunction(() => {
      const k = __kart.snapshot().player;
      return k.speed > 5 && Math.cos(k.velocityHeading - k.heading) > 0.9;
    });
    assert.equal((await snapshot()).resets, 0);
    assert.deepEqual(errors, []);
    console.log(
      `${touch ? 'touch' : 'keyboard'}: brake, reverse, forward; no teleport or camera flip`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
