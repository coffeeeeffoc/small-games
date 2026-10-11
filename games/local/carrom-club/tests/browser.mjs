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
  const touch = async (type, points = []) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ ...p, id: i + 1 })),
    });
    // CDP acknowledges before Chromium's real compositor has always delivered
    // a coalesced touchmove. Let it drain before advancing the mocked game clock.
    await new Promise((resolve) => setTimeout(resolve, 24));
  };
  const boardPoint = async (x, y) => {
    const b = await page.locator('#board').boundingBox();
    return { x: b.x + (x / 1000) * b.width, y: b.y + (y / 1000) * b.width };
  };
  async function dragShot(
    shot,
    cancel = false,
    aimImage = false,
    liftJitter = false,
    inspectAim = null,
  ) {
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
    if (inspectAim) await inspectAim({ start, end });
    if (liftJitter) {
      await advance(120);
      const preview = (await state()).aim;
      await touch('touchMove', [{ x: end.x + 4, y: end.y - 2 }]);
      await advance(16);
      assert.deepEqual((await state()).aim, preview);
      await touch('touchEnd');
      const fired = (await state()).game.striker;
      assert(
        Math.abs(Math.atan2(fired.vy, fired.vx) - Math.atan2(preview.dy, preview.dx)) < 0.00001,
      );
      checks.push('native fingertip lift jitter preserves preview and actual firing angle');
      await advance(64);
      return;
    }
    await touch(cancel ? 'touchCancel' : 'touchEnd');
    await advance(64);
  }
  await page.goto(origin);
  await advance(250);
  await expect(page.locator('#home')).toBeVisible();
  assert.equal(await page.evaluate(() => Boolean(window.__carrom)), false);
  await screenshot('actual-home-390');
  await tap('#help-open');
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('#help')).toContainText('左右慢慢微调');
  await expect(page.locator('#help')).toContainText('3 分');
  await expect(page.locator('#help')).toContainText('积分高者获胜');
  await tap('#help [data-home]');
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
  await dragShot(shot, true, false, false, async ({ end }) => {
    const initial = (await state()).aim;
    const hit = await page.evaluate(async () => {
      const { aimPreview } = await import('../src/core.mjs');
      const { game, aim } = window.__carrom.snapshot();
      return aimPreview(game, aim.dx, aim.dy).hit?.id;
    });
    assert(hit, 'the slow-adjustment gesture must actually hit a coin');
    await advance(120);
    await touch('touchMove', [{ x: end.x + 4, y: end.y }]);
    await advance(16);
    await advance(100);
    const adjusted = (await state()).aim;
    const delta = Math.atan2(
      adjusted.dy * initial.dx - adjusted.dx * initial.dy,
      adjusted.dx * initial.dx + adjusted.dy * initial.dy,
    );
    assert(
      Math.abs(delta) > 0.001 && Math.abs(delta) < (1.2 * Math.PI) / 180,
      JSON.stringify({ initial, adjusted, deltaDegrees: (delta * 180) / Math.PI }),
    );
    checks.push('a real target collision enables sub-1.2° held 4px touch adjustment');
  });
  assert.equal((await state()).game.shots, 0);
  {
    const { game } = await state();
    const start = await boardPoint(game.striker.x, game.striker.y);
    const end = { x: start.x, y: start.y + 12 };
    await touch('touchStart', [start]);
    await touch('touchMove', [end]);
    await advance(120);
    const initial = (await state()).aim;
    const secondary = { x: start.x - 50, y: start.y - 50 };
    await touch('touchStart', [end, secondary]);
    await touch('touchMove', [end, { x: secondary.x - 20, y: secondary.y - 20 }]);
    await touch('touchMove', [end]);
    await advance(16);
    assert.deepEqual((await state()).aim, initial);
    assert.equal((await state()).game.shots, 0);
    for (const offset of [0.5, -1, 1.5]) {
      await touch('touchMove', [{ x: end.x + offset, y: end.y }]);
      await advance(16);
      assert.deepEqual((await state()).aim, initial);
    }
    await touch('touchMove', [{ x: end.x + 4, y: end.y }]);
    await advance(16);
    assert.deepEqual((await state()).aim, initial);
    await advance(100);
    const adjusted = (await state()).aim;
    const angle = (Math.atan2(adjusted.dx, -adjusted.dy) * 180) / Math.PI;
    assert(Math.abs(angle) > 4 && Math.abs(angle) < 8);
    await advance(500);
    assert.deepEqual((await state()).aim, adjusted);
    // Another pointer's cancellation must not discard the owned primary gesture.
    await page.locator('#board').dispatchEvent('pointercancel', { pointerId: 999 });
    assert.deepEqual((await state()).aim, adjusted);
    await touch('touchMove', [{ x: start.x + 1, y: start.y + 1 }]);
    await touch('touchEnd');
    await advance(64);
    assert.equal((await state()).game.shots, 0);
    assert.equal((await state()).aim, null);
    checks.push(
      'free short-pull aim follows held 4px movement by 4–8°; 1.5px jitter filtered; no idle drift; native second touch movement/removal and secondary cancellation preserve primary aim; returning to origin cancels',
    );
  }
  await dragShot(shot, false, false, true);
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
  await expect(page.locator('#player-score')).toContainText('1 分');
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
  await expect(page.locator('#player-score')).toContainText('0 分');
  await expect(page.locator('#opponent-score')).toContainText('0 分');
  checks.push(
    'help explains queen cover +3 points and score-based winners; score HUD shows 0/1 points',
  );
  {
    // Count expensive work after the board and its coin sprites have warmed up.
    // Synthetic range events let us check the exact input/change call stack;
    // the surrounding dragShot cases also exercise native touch range dragging.
    const immediate = await page.evaluate(() => {
      const board = document.getElementById('board');
      const slider = document.getElementById('position');
      const metrics = { gradients: 0, layouts: 0, writes: 0, eventWrites: 0, dispatching: false };
      const gradient = CanvasRenderingContext2D.prototype.createRadialGradient;
      const measure = board.getBoundingClientRect;
      const setItem = Storage.prototype.setItem;
      CanvasRenderingContext2D.prototype.createRadialGradient = function (...args) {
        metrics.gradients++;
        return gradient.apply(this, args);
      };
      board.getBoundingClientRect = function () {
        metrics.layouts++;
        return measure.call(this);
      };
      Storage.prototype.setItem = function (...args) {
        if (args[0] === 'carrom-club:v1') {
          metrics.writes++;
          if (metrics.dispatching) metrics.eventWrites++;
        }
        return setItem.apply(this, args);
      };
      window.__carromPerf = {
        metrics,
        restore() {
          CanvasRenderingContext2D.prototype.createRadialGradient = gradient;
          board.getBoundingClientRect = measure;
          Storage.prototype.setItem = setItem;
        },
      };
      const original = slider.value;
      metrics.dispatching = true;
      try {
        for (let i = 0; i < 30; i++) {
          slider.value = String(300 + i * 10);
          slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        slider.value = original;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      } finally {
        metrics.dispatching = false;
      }
      return { ...metrics };
    });
    assert.equal(immediate.eventWrites, 0, 'range release must not synchronously persist');
    assert.equal(immediate.writes, 0, 'saving waits until after the input event stack');
    await advance(500);
    const metrics = await page.evaluate(() => {
      const result = { ...window.__carromPerf.metrics };
      window.__carromPerf.restore();
      delete window.__carromPerf;
      return result;
    });
    assert.equal(metrics.gradients, 0, 'warm frames reuse coin gradients');
    assert.equal(metrics.layouts, 0, 'warm frames never remeasure the board');
    assert.equal(metrics.writes, 1, 'the final placement is persisted once after release');
    assert.equal(metrics.eventWrites, 0);
    checks.push(
      '30 placement inputs and release: no synchronous save, one deferred save, zero warm-frame gradient rebuilds or board layout reads',
    );
  }
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
    const player = await state();
    if (player.game.turn === 0 && player.game.phase === 'ready') {
      const start = await boardPoint(player.game.striker.x, player.game.striker.y);
      await touch('touchStart', [start]);
      await touch('touchMove', [{ x: start.x, y: start.y + 20 }]);
      await advance(120);
      await expect(page.locator('#cancel-aim')).toBeInViewport();
      const cancelBox = await page.locator('#cancel-aim').boundingBox();
      assert(cancelBox.width >= 44 && cancelBox.height >= 44);
      await touch('touchCancel');
      await advance(64);
    }
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
