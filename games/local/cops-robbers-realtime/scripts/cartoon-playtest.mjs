import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from 'playwright/test';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const base = process.env.GAME_URL || 'http://127.0.0.1:43690';
const output = 'docs/design/cartoon-refresh-2026-10-05/implemented';
await mkdir(output, { recursive: true });
const checks = [],
  errors = [];
try {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1680, height: 893 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: viewport.width < 1000,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const snapshot = () => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
    const point = (p) =>
      page.evaluate(async (p) => (await import('./src/main.js')).worldToScreen(p), p);
    const shot = (name) => page.screenshot({ path: `${output}/${name}-${viewport.width}.png` });
    const bounds = async (locator) => {
      const r = await locator.boundingBox();
      assert.ok(
        r &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= viewport.width + 1 &&
          r.y + r.height <= viewport.height + 1,
        JSON.stringify(r),
      );
      assert.ok(r.width >= 44 && r.height >= 44, 'touch target at least 44px');
    };
    await page.goto(base);
    await expect(page.locator('#home-screen')).toBeVisible();
    await expect(page.locator('#fullscreen-button')).toBeHidden();
    await bounds(page.locator('#settings-button'));
    await bounds(page.locator('#levels-button'));
    await shot('home');
    await page.locator('#settings-button').tap();
    await expect(page.locator('#settings-page')).toBeVisible();
    await expect(page.locator('#fullscreen-button')).toBeVisible();
    await bounds(page.locator('#sound-button'));
    await bounds(page.locator('#fullscreen-button'));
    await page.locator('#sound-button').tap();
    await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
    await shot('settings');
    // Native fullscreen is invoked in the tap activation and returns to settings.
    await page.locator('#fullscreen-button').tap();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.locator('#fullscreen-button').tap();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.goBack();
    await expect(page.locator('#home-screen')).toBeVisible();
    await page.reload();
    await page.locator('#settings-button').tap();
    await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#settings-page [data-close]').first().tap();
    await page.locator('#levels-button').tap();
    await shot('setup-challenge');
    await page.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
    await expect(page.locator('#start-button')).toBeInViewport();
    await bounds(page.locator('#start-button'));
    await shot('setup');
    await page.locator('#start-button').tap();
    await page.waitForTimeout(350);
    const state = await snapshot();
    // Map occupies the width symmetrically; bottom road stays above the team dock.
    const left = await point({ x: 0, y: 0 }),
      right = await point({ x: 1000, y: 600 });
    const minX = Math.min(left.x, right.x),
      maxX = Math.max(left.x, right.x);
    const dock = await page.locator('.squad-dock').boundingBox();
    const sideDock = viewport.width > viewport.height && viewport.height <= 560;
    const center = sideDock ? (viewport.width - dock.width - 20) / 2 : viewport.width / 2;
    assert.ok(Math.abs((minX + maxX) / 2 - center) < 2, 'map centered in available play area');
    if (sideDock) assert.ok(maxX < dock.x, 'map ends before side squad dock');
    else assert.ok(Math.max(left.y, right.y) < dock.y, 'map ends above squad dock');
    await bounds(page.locator('#pause-button'));
    for (let i = 0; i < state.cops.length; i++) await bounds(page.locator('.squad-avatar').nth(i));
    const origin = await point(state.cops[0]);
    const target = await point({ x: 500, y: 300 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...origin, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...target, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal((await snapshot()).cops[0].destination, null, 'cancelled gesture issues no order');
    await page.touchscreen.tap(origin.x, origin.y);
    await page.touchscreen.tap(target.x, target.y);
    assert.ok((await snapshot()).cops[0].moving, 'actual touch orders selected character');
    await shot('game');
    await page.locator('#pause-button').tap();
    await expect(page.locator('#pause-dialog')).toBeVisible();
    assert.equal((await snapshot()).phase, 'paused');
    await page.locator('#resume-button').tap();
    assert.equal((await snapshot()).phase, 'playing');
    await page.locator('#game-screen [data-home]').tap();
    await expect(page.locator('#home-screen')).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    checks.push(
      `${viewport.width}×${viewport.height}: settings navigation/history, persisted audio, fullscreen enter/exit, centered unobstructed map, 44px controls, touch movement/cancellation, pause/resume/home`,
    );
    await context.close();
  }
  for (const mode of [
    { query: '', stored: null, enabled: false },
    { query: '?dev=1', stored: null, enabled: true },
    { query: '', stored: 'true', enabled: true },
    { query: '?dev=0', stored: 'true', enabled: false },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    });
    await context.addInitScript((value) => {
      if (value === null) localStorage.removeItem('dev');
      else localStorage.setItem('dev', value);
    }, mode.stored);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/' + mode.query);
    assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), mode.enabled);
    await page.route('**/__visual-frame', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><iframe style="width:100%;height:100vh;border:0" src="${base}/${mode.query}"></iframe>`,
      }),
    );
    await page.goto(base + '/__visual-frame');
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await expect.poll(() => frame.evaluate(() => !!globalThis.SmallGamesDev)).toBe(true);
    assert.equal(await frame.evaluate(() => SmallGamesDev.isEnabled()), mode.enabled);
    if (!mode.query && mode.stored === null) {
      await frame.locator('#levels-button').tap();
      await frame.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
      await frame.locator('#start-button').tap();
      await page.waitForTimeout(350);
      const frameBounds = await (await frame.frameElement()).boundingBox();
      const positions = await frame.evaluate(async () => {
        const app = await import('./src/main.js');
        return {
          origin: app.worldToScreen(app.getSnapshot().cops[0]),
          target: app.worldToScreen({ x: 500, y: 300 }),
        };
      });
      const absolute = (p) => ({ x: p.x + frameBounds.x, y: p.y + frameBounds.y });
      const origin = absolute(positions.origin),
        target = absolute(positions.target);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...origin, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...target, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.equal(
        await frame.evaluate(
          async () => (await import('./src/main.js')).getSnapshot().cops[0].destination,
        ),
        null,
      );
      await page.touchscreen.tap(origin.x, origin.y);
      await page.touchscreen.tap(target.x, target.y);
      assert.equal(
        await frame.evaluate(
          async () => (await import('./src/main.js')).getSnapshot().cops[0].moving,
        ),
        true,
      );
    }
    await context.close();
  }
  checks.push(
    'Mobile independent and iframe: developer mode default/URL/storage/explicit-off; iframe touch movement and gesture cancellation',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      { base, checks, errors, device: 'Chromium touch emulation; physical devices not tested' },
      null,
      2,
    ),
  );
  console.log(checks.join('\n'));
} finally {
  await browser.close();
}
