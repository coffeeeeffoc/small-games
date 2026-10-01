import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.GAME_URL || 'http://127.0.0.1:43690';
const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
  ? { executablePath: process.env.BROWSER_EXECUTABLE }
  : { channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  const errors = [], checks = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const snapshot = () => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
    const screen = point => page.evaluate(async point => (await import('./src/main.js')).worldToScreen(point), point);
    const cdp = await context.newCDPSession(page);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [],
    });
    for (const input of ['mouse', 'touch']) {
      await page.goto(base);
      await page.locator('#practice-button').click();
      await page.locator('.cop-card').nth(0).click();
      const goal = await screen({ x: 500, y: 300 });
      await page.mouse.click(goal.x, goal.y);
      const before = await snapshot();
      assert.equal(before.cops[0].destination.x, 500);
      const origin = await screen(before.cops[0]);
      if (input === 'mouse') {
        await page.mouse.move(origin.x, origin.y);
        await page.mouse.down();
        await page.mouse.move(origin.x + 30, origin.y);
        await page.mouse.move(origin.x + 3, origin.y);
        await page.mouse.up();
      } else {
        await touch('touchStart', origin);
        await touch('touchMove', { x: origin.x + 30, y: origin.y });
        await touch('touchMove', { x: origin.x + 3, y: origin.y });
        await touch('touchEnd');
      }
      assert.deepEqual((await snapshot()).cops[0].destination, before.cops[0].destination,
        'Returning a drag within the press-point slop must preserve the previous order');

      const nextOrigin = await screen((await snapshot()).cops[0]);
      const redirected = await screen({ x: 350, y: 300 });
      if (input === 'mouse') {
        await page.mouse.move(nextOrigin.x, nextOrigin.y);
        await page.mouse.down();
        await page.mouse.move(redirected.x, redirected.y);
        await page.mouse.up();
      } else {
        await touch('touchStart', nextOrigin);
        await touch('touchMove', redirected);
        await touch('touchEnd');
      }
      assert.ok(Math.abs((await snapshot()).cops[0].destination.x - 350) < 0.001,
        'A new drag away from the origin must still redirect the selected actor');
      checks.push(`${viewport.width}x${viewport.height}/${input}: canceled return preserves route; next drag redirects`);
    }

    await page.goto(base);
    await page.locator('#practice-button').click();
    await page.locator('.cop-card').nth(0).click();
    const goal = await screen({ x: 500, y: 300 });
    await page.mouse.click(goal.x, goal.y);
    const before = await snapshot(), origin = await screen(before.cops[0]);
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    const alternative = await screen({ x: 350, y: 300 });
    await page.mouse.move(alternative.x, alternative.y);
    await page.evaluate(() => {
      const canvas = document.querySelector('#game-canvas');
      canvas.releasePointerCapture(1);
    });
    await page.mouse.up();
    await page.keyboard.press('Enter');
    assert.deepEqual((await snapshot()).cops[0].destination, before.cops[0].destination,
      'Lost pointer capture must discard the preview target, including keyboard activation');
    checks.push(`${viewport.width}x${viewport.height}: lost capture clears the canceled keyboard target`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${checks.length} actual mouse/touch cancellation and recovery checks`);
} finally { await browser.close(); }
