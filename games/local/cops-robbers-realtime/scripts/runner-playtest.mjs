import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fixtures = JSON.parse(
  await readFile(new URL('../tests/fixtures/runner-witnesses.json', import.meta.url), 'utf8'),
);
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium',
  headless: true,
});
const base = process.env.GAME_URL || 'http://127.0.0.1:43690';
const errors = [];
try {
  for (const [width, height, mode] of [
    [390, 844, 'classic'],
    [844, 390, 'escape'],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (mode) =>
        localStorage.setItem(
          'neighborhood-patrol-v1',
          JSON.stringify({ modeBest: { [`${mode}-robber-1:cop`]: 0.5 } }),
        ),
      mode,
    );
    await page.goto(`${base}/?mode=${mode}&role=robber&level=1&first=cop`);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const snap = () => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
    await page.locator('#start-button').tap({ force: true });
    await page.clock.runFor(400);
    await page.locator('#pause-button').tap({ force: true });
    assert.equal((await snap()).phase, 'paused');
    await page.clock.runFor(400);
    await page.locator('#resume-button').tap({ force: true });
    assert.equal((await snap()).phase, 'playing');
    await page.clock.runFor(400);
    await page.screenshot({ path: `/tmp/runner-playing-${mode}.png` });
    const orders = fixtures[mode][1].cop;
    let canceled = false;
    for (const [tick, actor, ...target] of orders) {
      const state = await snap();
      if (state.phase !== 'playing') break;
      const millis = Math.max(0, tick * 100 - state.time * 1000);
      if (millis > 0) await page.clock.runFor(millis);
      await page.locator('.squad-avatar').nth(actor).tap({ force: true });
      const point =
        target.length === 1 ? (await snap()).nodes[target[0]] : { x: target[0], y: target[1] };
      const screen = await page.evaluate(
        async (point) => (await import('./src/main.js')).worldToScreen(point),
        point,
      );
      await page.touchscreen.tap(screen.x, screen.y);
      if (!canceled) {
        const before = await snap(),
          origin = await page.evaluate(
            async (p) => (await import('./src/main.js')).worldToScreen(p),
            before.robbers[actor],
          );
        const cdp = await page.context().newCDPSession(page);
        for (const [type, p] of [
          ['touchStart', origin],
          ['touchMove', { x: origin.x + 30, y: origin.y }],
          ['touchMove', origin],
          ['touchEnd', null],
        ])
          await cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: p ? [{ ...p, id: 1 }] : [],
          });
        assert.deepEqual(
          (await snap()).robbers[actor].destination,
          before.robbers[actor].destination,
        );
        await cdp.detach();
        canceled = true;
      }
    }
    await page.clock.runFor(125000);
    assert.equal((await snap()).phase, 'lost');
    assert.equal(await page.locator('#win-dialog').isVisible(), true);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('neighborhood-patrol-v1')),
    );
    assert.ok(
      saved.modeBest[`${mode}-robber-1:cop:street-solo-v2`] > 1,
      'new layout must not inherit the old half-second record',
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: `/tmp/runner-win-${mode}.png`, fullPage: true });
    console.log('PASS touch runner win', mode, width, height);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
