import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
const root = new URL('../', import.meta.url),
  out = new URL('../docs/design/', import.meta.url);
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4427'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error('server exited ' + code)));
});
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4427/');
  await page.screenshot({ path: new URL('home.png', out).pathname });
  assert.equal(await page.evaluate(() => typeof window.__flickArena), 'undefined');
  await page.locator('#help').tap();
  await page.locator('#home').tap();
  await page.locator('#layouts').tap();
  assert.equal(await page.locator('#controls button').count(), 6);
  await page.screenshot({ path: new URL('layouts.png', out).pathname });
  await page.locator('#layout-0').tap();
  await page.waitForSelector('body[data-phase="playing"]');
  await page.screenshot({ path: new URL('play.png', out).pathname });
  await page.locator('#pause').tap();
  await page.screenshot({ path: new URL('paused.png', out).pathname });
  await page.locator('#sound').tap();
  await page.locator('#resume').tap();
  // First genuine touch flick without developer mode: direct aim at the red rival.
  const session = await context.newCDPSession(page);
  async function touch(type, points) {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
  }
  async function drag(from, to, cancel = false) {
    await touch('touchStart', [from]);
    await touch('touchMove', [to]);
    await page.waitForTimeout(80);
    await touch(cancel ? 'touchCancel' : 'touchEnd', []);
  }
  const map = async ([x, y]) =>
    page.locator('#game').evaluate(
      (c, [x, y]) => {
        const b = c.getBoundingClientRect(),
          s = Math.min(b.width / 390, b.height / 780);
        return [b.x + (b.width - 390 * s) / 2 + x * s, b.y + (b.height - 780 * s) / 2 + y * s];
      },
      [x, y],
    );
  const from = await map([195, 382 + 90 * 1.04]);
  await drag(from, [from[0] - 17, from[1] + 98], true);
  assert.equal(await page.locator('#game').getAttribute('data-shots'), '0');
  await drag(from, [from[0] - 17, from[1] + 98]);
  await page.waitForFunction(() => Number(document.querySelector('#game').dataset.shots) >= 1);
  await page.waitForTimeout(8500);
  // If still alive, finish using actual gestures against the visible positions.
  await page.goto('http://127.0.0.1:4427/?dev=1');
  await page.locator('#layouts').tap();
  await page.locator('#layout-0').tap();
  await page.waitForSelector('body[data-phase="playing"]');
  for (let n = 0; n < 14; n++) {
    await page.waitForFunction(
      () => {
        const a = window.__flickArena.app;
        return (
          a.screen === 'result' ||
          (a.screen === 'playing' && a.state.phase === 'aim' && a.state.active === 0)
        );
      },
      {},
      { timeout: 20000 },
    );
    if ((await page.locator('body').getAttribute('data-phase')) === 'result') break;
    const aim = await page.evaluate(async () => {
      const { chooseBot, seeded } = await import('./src/core.mjs');
      const s = window.__flickArena.app.state,
        d = s.discs[0],
        b = chooseBot(s, seeded(s.shots + 8));
      return {
        from: [195 + d.x * 1.04, 382 + d.y * 1.04],
        dx: -b.x * b.power * 115,
        dy: -b.y * b.power * 115,
      };
    });
    const p = await map(aim.from),
      q = await map([aim.from[0] + aim.dx, aim.from[1] + aim.dy]);
    await touch('touchStart', [p]);
    await touch('touchMove', [q]);
    await page.screenshot({ path: new URL('aim.png', out).pathname });
    await touch('touchEnd', []);
    await page.waitForTimeout(100);
  }
  await page.waitForSelector('body[data-phase="result"]', { timeout: 20000 });
  await page.screenshot({ path: new URL('result.png', out).pathname });
  const played = await page.evaluate(() => window.__flickArena.app.save.played);
  await page.locator('#replay').tap();
  await page.waitForSelector('body[data-phase="replay"]');
  await page.locator('#result').tap();
  assert.equal(await page.evaluate(() => window.__flickArena.app.save.played), played);
  await page.locator('#again').tap();
  await page.waitForSelector('body[data-phase="playing"]');
  const before = await page.evaluate(() => window.__flickArena.debug().state);
  await page.locator('#pause').tap();
  await page.waitForTimeout(1700);
  assert.deepEqual(await page.evaluate(() => window.__flickArena.debug().state), before);
  await page.locator('#resume').tap();
  // Multi-touch cannot steal or release the original drag.
  const p = await map([195, 382 + 90 * 1.04]);
  await touch('touchStart', [p]);
  await touch('touchStart', [p, [40, 100]]);
  await touch('touchMove', [
    [p[0] + 30, p[1] + 50],
    [50, 110],
  ]);
  await touch('touchCancel', []);
  assert.equal(await page.evaluate(() => window.__flickArena.app.drag), null);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'paused');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.locator('#resume').tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#game').getAttribute('data-shots'), '0');
  await page.locator('#pause').tap();
  await page.locator('#home').tap();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('#start').tap();
  await page.waitForSelector('body[data-phase="playing"]');
  await page.locator('#pause').tap();
  await page.locator('#home').tap();
  // Storage unavailable is an accepted local-only mode.
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('disabled');
    };
    Storage.prototype.setItem = () => {
      throw new Error('disabled');
    };
  });
  await page.goto('http://127.0.0.1:4427/?dev=0');
  await page.locator('#start').tap();
  await page.waitForSelector('body[data-phase="playing"]');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: touch home/setup/help/play/cancel/multitouch/pause/settlement/replay/retry, resize, storage fallback; zero page errors.',
  );
} finally {
  await browser.close();
  server.kill();
}
