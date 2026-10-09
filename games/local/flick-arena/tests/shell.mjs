import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { layouts } from '../src/layouts.mjs';
import { W, H, arena } from '../src/render.mjs';

const out = new URL('../docs/design/multi-round-2026-10-09/', import.meta.url);
await mkdir(out, { recursive: true });
const started = performance.now();
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const shellUrl = process.env.SHELL_URL || 'http://127.0.0.1:4173/';
  await page.goto(shellUrl + '#/games/flick-arena?dev=0');
  const frame = page.frameLocator('iframe');
  const navigation = page.locator('.standalone-page nav[aria-label="游戏导航"]');
  await frame.locator('#start').waitFor();
  await navigation.waitFor({ state: 'visible' });
  await frame.locator('#layouts').tap();
  await frame.locator('#layout-0').tap();
  await frame.locator('body[data-phase="playing"]').waitFor();
  await navigation.waitFor({ state: 'hidden' });
  const box = await frame.locator('#game').boundingBox();
  const scale = Math.min(box.width / W, box.height / H);
  const ox = box.x + (box.width - W * scale) / 2;
  const oy = box.y + (box.height - H * scale) / 2;
  const [x, y] = layouts[0].points[0];
  const [tx, ty] = layouts[0].points[1];
  const length = Math.hypot(tx - x, ty - y);
  const from = [ox + (arena.x + x * arena.scale) * scale, oy + (arena.y + y * arena.scale) * scale];
  const to = [
    from[0] - ((tx - x) / length) * 115 * scale,
    from[1] - ((ty - y) / length) * 115 * scale,
  ];
  const session = await context.newCDPSession(page);
  const touch = (type, points) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([px, py], id) => ({ x: px, y: py, id })),
    });
  await touch('touchStart', [from]);
  await touch('touchMove', [to]);
  await touch('touchCancel', []);
  assert.equal(await frame.locator('#game').getAttribute('data-shots'), '0');
  await touch('touchStart', [from]);
  await touch('touchMove', [to]);
  await touch('touchEnd', []);
  assert.equal(await frame.locator('#game').getAttribute('data-shots'), '1');
  await page.waitForTimeout(1200);
  assert(
    await frame.locator('body[data-phase="playing"]').count(),
    'embedded opening remains playable',
  );
  await page.screenshot({ path: new URL('actual-shell.png', out).pathname });
  await frame.locator('#pause').tap();
  await frame.locator('body[data-phase="paused"]').waitFor();
  assert.equal(
    await navigation.isVisible(),
    false,
    'pause keeps the surrounding navigation hidden',
  );
  const before = await frame.locator('#game').getAttribute('data-shots');
  await page.waitForTimeout(3000);
  assert.equal(await frame.locator('#game').getAttribute('data-shots'), before);
  await frame.locator('#resume').tap();
  await page.waitForTimeout(4500);
  assert(Number(await frame.locator('#game').getAttribute('data-shots')) >= 3);
  await frame.locator('#pause').tap();
  await frame.locator('#home').tap();
  await navigation.waitFor({ state: 'visible' });
  // The game's complete stage is the fullscreen target. Rejection preserves ordinary play.
  await frame.locator('#fullscreen').tap();
  await page.waitForTimeout(250);
  assert(await frame.locator('#start').isVisible());
  const child = page.frames().find((candidate) => candidate.url().includes('/games/flick-arena/'));
  assert.equal(await child.evaluate(() => typeof window.__flickArena), 'undefined');
  const fullscreenEntered = await child.evaluate(() => Boolean(document.fullscreenElement));
  if (fullscreenEntered) {
    assert.equal(await child.evaluate(() => document.fullscreenElement.id), 'stage');
    await frame.locator('#fullscreen').tap();
    await page.waitForFunction(() => !document.fullscreenElement);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(100);
  assert(await frame.locator('#start').isVisible());
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(100);
  assert(await frame.locator('#start').isVisible());
  await navigation.getByRole('button', { name: '返回目录', exact: true }).tap();
  await page.locator('.shell-catalog').waitFor();
  assert.equal(
    await page.locator('iframe').count(),
    0,
    'return to catalog disposes the embedded game',
  );
  assert.deepEqual(errors, []);
  const records = {
    environment: 'Chromium desktop emulation, Shell iframe, 390×844 touch',
    shellUrl,
    realDevice: false,
    checks: [
      'real embedded full-power touch flick',
      'touch cancellation',
      'opening remains playable',
      'pause/resume across AI turns',
      'home return',
      'Shell navigation hidden during play and pause, restored at home',
      'touch return to catalog',
      'complete-stage fullscreen control with ordinary-play fallback',
      'landscape and small-screen resize',
    ],
    fullscreenEntered,
    pageErrors: errors,
    wallSeconds: Math.round((performance.now() - started) / 100) / 10,
  };
  await writeFile(new URL('shell-validation.json', out), JSON.stringify(records, null, 2) + '\n');
  console.log('PASS: ' + JSON.stringify(records));
} finally {
  await browser.close();
}
