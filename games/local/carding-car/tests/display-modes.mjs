import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
const build = await fetch(new URL('build-info.json', url)).then((r) => r.json());
assert.equal(build.sourceHash, await sourceHash());
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const evidence = { build, environment: 'Desktop Chrome, Android UA/touch emulation; not an Android device', errors: [] };
try {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  page.on('pageerror', (e) => evidence.errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading);
  const state = () => page.evaluate(() => __kart.snapshot());
  const position = async (x, y) => {
    const bounds = await page.locator('#GameCanvas').boundingBox();
    const scale = Math.min(bounds.width / 960, bounds.height / 540);
    return { x: bounds.x + (bounds.width - 960 * scale) / 2 + x * scale,
      y: bounds.y + (bounds.height - 540 * scale) / 2 + y * scale };
  };
  const tap = async (x, y) => {
    const p = await position(x, y);
    await page.touchscreen.tap(p.x, p.y);
  };
  const fullscreen = page.locator('[data-game-fullscreen]');
  await tap(480, 395);
  await page.waitForFunction(() => __kart.snapshot().time > 2);
  const before = await state();
  await fullscreen.click();
  await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
  assert.equal(await fullscreen.getAttribute('aria-pressed'), 'true');
  await tap(70, 240);
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
  const paused = await state();
  await page.waitForTimeout(250);
  assert.equal((await state()).time, paused.time);
  assert.equal(paused.seed, before.seed);
  await tap(480, 395);
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await fullscreen.click();
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await fullscreen.getAttribute('aria-pressed'), 'false');
  assert.equal((await state()).seed, before.seed);
  assert.ok((await state()).time >= before.time);
  await tap(70, 240);
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
  const resizeBefore = await state();
  for (const width of [305, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(350);
    const button = await fullscreen.boundingBox();
    assert.ok(button && button.height >= 44 && button.x >= 0 && button.x + button.width <= width);
    assert.equal((await state()).time, resizeBefore.time);
    assert.equal((await state()).seed, before.seed);
    assert.equal(await page.locator('#kart-rotate').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(350);
  await fullscreen.click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await tap(743, 395);
  await page.waitForFunction(() => __kart.snapshot().phase === 'countdown');
  assert.equal((await state()).time, 0);
  await page.waitForFunction(() => __kart.snapshot().time > 1);
  await tap(70, 240);
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
  // Browser/system exit, without clicking the game's control.
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => document.querySelector('[data-game-fullscreen]').textContent === '全屏');
  await tap(480, 395);
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...await position(200, 440), id: 1 }],
  });
  await page.waitForFunction(() => __kart.snapshot().input.steer > 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => __kart.snapshot().input.steer === 0);
  evidence.after = await state();
  await page.screenshot({ path: fileURLToPath(new URL('../reports/display-modes.png', import.meta.url)) });
  // Capability branches are synthetic checks; physical Safari/Android remain unverified.
  for (const mode of ['unsupported', 'denied']) {
    await page.evaluate((mode) => {
      document.documentElement.requestFullscreen = mode === 'unsupported' ? undefined : () => Promise.reject(new Error('Denied'));
      document.documentElement.webkitRequestFullscreen = undefined;
    }, mode);
    const current = await state();
    await fullscreen.click();
    await page.waitForFunction(() => !document.getElementById('game-display-notice').hidden);
    assert.match(await page.locator('#game-display-notice').textContent(), /仍可在当前页面正常游玩/);
    assert.equal((await state()).seed, current.seed);
    assert.equal(await fullscreen.getAttribute('aria-pressed'), 'false');
    assert.equal(await fullscreen.isEnabled(), true);
    evidence[mode] = await page.locator('#game-display-notice').textContent();
  }
  assert.deepEqual(evidence.errors, []);
  await writeFile(new URL('../reports/display-modes.json', import.meta.url), JSON.stringify(evidence, null, 2));
  console.log('PASS: document fullscreen, racing/pause/retry/resume, external exit, 305/360/390 rotation, touch after resize, unsupported/denied feedback');
} finally {
  await browser.close();
}
