import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';

const output = new URL('../docs/design/validation/', import.meta.url);
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4429'], {
  cwd: new URL('../', import.meta.url),
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Server exited: ${code}`)));
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const errors = [],
  checks = [];
const origin = 'http://127.0.0.1:4429/';
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-10T03:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-10T03:00:01Z'));
  const advance = (ms) => page.clock.runFor(ms);
  const screenshot = async (name) => {
    await advance(300);
    return page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
  };
  const tap = async (selector) => {
    await page.locator(selector).tap();
    await advance(64);
  };
  const state = () => page.evaluate(() => window.__carrom.snapshot());
  const cdp = await context.newCDPSession(page);
  const touch = (type, points = []) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ ...p, id: i + 1 })),
    });
  const boardPoint = async (x, y) => {
    const b = await page.locator('#board').boundingBox();
    return { x: b.x + (x / 1000) * b.width, y: b.y + (y / 1000) * b.width };
  };
  async function dragShot(shot, cancel = false, aimImage = false) {
    const box = await page.locator('#position').boundingBox();
    const current = Number(await page.locator('#position').inputValue());
    const rangePoint = (value) => ({
      x: box.x + 19 + ((value - 235) / 530) * (box.width - 38),
      y: box.y + box.height / 2,
    });
    await touch('touchStart', [rangePoint(current)]);
    await touch('touchMove', [rangePoint(shot.x)]);
    await touch('touchEnd');
    await advance(64);
    const { game } = await state();
    const pull = 12 + Math.pow(shot.power, 1 / 1.35) * 195;
    const length = Math.hypot(shot.dx, shot.dy);
    const start = await boardPoint(game.striker.x, game.striker.y);
    const end = await boardPoint(
      game.striker.x - (shot.dx / length) * pull,
      game.striker.y - (shot.dy / length) * pull,
    );
    await touch('touchStart', [start]);
    await advance(32);
    await touch('touchMove', [end]);
    await advance(32);
    if (aimImage) await screenshot('actual-aim-390');
    await touch(cancel ? 'touchCancel' : 'touchEnd');
    await advance(64);
  }
  await page.goto(origin);
  await advance(250);
  await expect(page.locator('#home')).toBeVisible();
  assert.equal(await page.evaluate(() => Boolean(window.__carrom)), false);
  await screenshot('actual-home-390');
  await tap('#levels-open');
  await screenshot('actual-levels-390');
  assert.equal(await page.locator('.level-card:disabled').count(), 5);
  await page.goto(origin + '?dev=1');
  await advance(250);
  await tap('#levels-open');
  await tap('[data-level="first-touch"]');
  await screenshot('actual-practice-390');
  const shot = await page.evaluate(() => window.__carrom.previewShot());
  await dragShot(shot, true, true);
  assert.equal((await state()).game.shots, 0);
  checks.push('native touch positioning, aiming, pointercancel without firing');
  await dragShot(shot);
  assert.equal((await state()).game.phase, 'moving');
  await tap('#pause');
  const paused = (await state()).game.coins;
  await advance(6000);
  assert.deepEqual((await state()).game.coins, paused);
  await screenshot('actual-paused-390');
  await tap('#resume');
  await advance(6000);
  await expect(page.locator('#result')).toBeVisible();
  assert.equal((await state()).game.winner, 0);
  await screenshot('actual-win-390');
  checks.push('real touch shot pockets target; pause freezes physical state; resume reaches win');
  await tap('#result [data-home]');
  await tap('#levels-open');
  assert.equal(await page.locator('.level-card:disabled').count(), 4);
  await page.reload();
  await advance(100);
  await tap('#levels-open');
  assert.equal(await page.locator('.level-card:disabled').count(), 4);
  checks.push('win stars unlock exactly the next level and survive reload');
  await tap('[data-level="first-touch"]');
  for (let i = 0; i < 5; i++) {
    await dragShot({ x: 500, dx: 0, dy: 1, power: 0.045 });
    await advance(2200);
  }
  await expect(page.locator('#result')).toBeVisible();
  assert.equal((await state()).game.winner, 1);
  await screenshot('actual-loss-390');
  checks.push('five genuine missed shots exhaust practice budget');
  await tap('#result [data-home]');
  await tap('#start');
  await screenshot('actual-match-390');
  await dragShot({ x: 500, dx: 0, dy: -1, power: 0.8 });
  await advance(10000);
  assert((await state()).game.shots >= 2);
  checks.push('human break triggers AI physical turn');
  await tap('#pause');
  await tap('#pause-home');
  const savedShots = await page.evaluate(
    () => JSON.parse(localStorage.getItem('carrom-club:v1')).match.shots,
  );
  await page.reload();
  await advance(100);
  await tap('#start');
  assert.equal((await state()).game.shots, savedShots);
  checks.push('resume returns to the last settled turn');
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await advance(100);
    await expect(page.locator('#board')).toBeInViewport();
    await expect(page.locator('#position')).toBeInViewport();
    const controls = await page.locator('#pause').boundingBox();
    assert(controls.width >= 44 && controls.height >= 44);
    await screenshot(`actual-match-${viewport.width}`);
    await tap('#pause');
    await tap('#resume');
  }
  checks.push('320×640 and 844×390 retain complete board, thumb slider and pause targets');
  await page.setViewportSize({ width: 390, height: 844 });
  await advance(100);
  await tap('#pause');
  await page.locator('#pause-screen [data-game-fullscreen]').tap();
  await advance(300);
  const full = await page.evaluate(() => Boolean(document.fullscreenElement));
  if (full) {
    await page.locator('#pause-screen [data-game-fullscreen]').tap();
    await advance(300);
    assert(!(await page.evaluate(() => Boolean(document.fullscreenElement))));
  }
  await tap('#resume');
  checks.push(
    `fullscreen gesture ${full ? 'enter and exit verified' : 'unavailable; game still usable'}`,
  );
  await tap('#pause');
  await tap('#pause-home');
  await tap('#settings-open');
  await tap('#sound');
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  await page.reload();
  await advance(100);
  await tap('#settings-open');
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  checks.push('audio setting persists');
  const denied = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await denied.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('denied'));
  });
  const deniedPage = await denied.newPage();
  deniedPage.on('pageerror', (error) => errors.push(error.message));
  await deniedPage.goto(origin + '?dev=0');
  await deniedPage.locator('#start').tap();
  await expect(deniedPage.locator('#board')).toBeVisible();
  await deniedPage.locator('#pause').tap();
  await deniedPage.locator('#pause-screen [data-game-fullscreen]').tap();
  await expect(deniedPage.locator('#game-display-notice')).toBeVisible();
  await deniedPage.locator('#resume').tap();
  await expect(deniedPage.locator('#board')).toBeVisible();
  checks.push('disabled storage and rejected fullscreen keep play usable');
  await denied.close();
  assert.deepEqual(errors, []);
  const report = {
    environment:
      'Chromium desktop mobile emulation, native CDP touch, 390×844 / 320×640 / 844×390, DPR 2',
    realDevice: false,
    browser: browser.version(),
    checks,
    pageErrors: errors,
    passed: true,
  };
  await writeFile(new URL('browser-report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.kill();
}
