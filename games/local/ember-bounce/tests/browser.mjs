import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../../../../.scratch/ember-bounce/', import.meta.url);
await mkdir(output, { recursive: true });
let server;
let browser;
let url = process.env.EMBER_URL;
const failures = [];
const checks = [];
let status = 'running';
const runFile = promisify(execFile);
const snapshot = (page) => page.locator('#arena').evaluate((canvas) => canvas.getEmberSnapshot());
async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
function monitor(page, name) {
  page.on('pageerror', (error) => failures.push({ name, error: error.message }));
  page.on('response', (response) => {
    if (response.url().startsWith(url) && response.status() >= 400) {
      failures.push({ name, resource: response.url(), status: response.status() });
    }
  });
}
async function shot(
  page,
  { touch = false, cancel = false, x = 130 / 390, y = 492 / 600, capture = false } = {},
) {
  const arena = page.locator('#arena');
  const bounds = await arena.boundingBox();
  assert(bounds, 'Visible arena is required for a native gesture');
  const start = { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * (64 / 600) };
  const aim = { x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y };
  if (touch) {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [aim] });
      await expect.poll(async () => (await snapshot(page)).aiming).toBe(true);
      if (capture) await page.screenshot({ path: fileURLToPath(new URL(capture, output)) });
      await session.send('Input.dispatchTouchEvent', {
        type: cancel ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await session.detach();
    }
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(aim.x, aim.y, { steps: 8 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
}

try {
  if (!url) {
    await runFile(process.execPath, ['build.mjs'], { cwd: root });
    const port = await freePort();
    server = spawn(
      process.execPath,
      ['server.mjs', '--dist', '--host', '127.0.0.1', '--port', String(port)],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 10_000);
      server.stdout.once('data', () => {
        clearTimeout(timeout);
        resolve();
      });
      server.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Preview exited: ${code}`));
      });
    });
    url = `http://127.0.0.1:${port}/`;
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : { channel: 'chromium' }),
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await phone.newPage();
  monitor(page, 'phone');
  await page.goto(url);
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'home');
  assert.equal(await page.evaluate(() => Boolean(window.__emberBounce)), false);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-home.png', output)) });
  await page.locator('#help').tap();
  await expect(page.locator('#help-screen')).toBeVisible();
  await page.locator('#help-back').tap();
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#levels-button').tap();
  await expect(page.locator('#levels')).toBeVisible();
  const levelButtons = page.locator('#levels button[data-level]');
  assert((await levelButtons.count()) > 1);
  await expect(levelButtons.first()).toBeEnabled();
  await expect(levelButtons.nth(1)).toBeDisabled();
  await page.screenshot({ path: fileURLToPath(new URL('mobile-levels.png', output)) });
  await page.locator('#levels-back').tap();
  await page.locator('#start').tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await expect
    .poll(async () => page.locator('#arena').evaluate((canvas) => typeof canvas.getEmberSnapshot))
    .toBe('function');
  const initial = await snapshot(page);
  await shot(page, { touch: true, cancel: true });
  await expect.poll(async () => (await snapshot(page)).aiming).toBe(false);
  assert.equal((await snapshot(page)).shots, initial.shots, 'Cancelled aim must not launch');
  checks.push('portrait touch aim and cancellation');
  await shot(page, { touch: true, capture: 'portrait-aim.png' });
  await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(initial.shots);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-volley.png', output)) });
  await expect
    .poll(async () => (await snapshot(page)).score, { timeout: 10_000 })
    .toBeGreaterThan(initial.score);
  await page.screenshot({ path: fileURLToPath(new URL('portrait-impact.png', output)) });
  await page.locator('#pause').tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  const paused = await snapshot(page);
  await page.waitForTimeout(220);
  const afterPause = await snapshot(page);
  assert.equal(afterPause.score, paused.score, 'Paused play must not settle hits');
  assert.equal(afterPause.turn, paused.turn, 'Paused play must not advance a turn');
  await page.screenshot({ path: fileURLToPath(new URL('mobile-paused.png', output)) });
  await page.locator('#resume').tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  // An actual visibility event follows the same lifecycle path as backgrounding.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('#resume').tap();
  await expect.poll(async () => (await snapshot(page)).corePhase, { timeout: 20_000 }).toBe('aim');
  await shot(page, { touch: true, x: 68 / 390, y: 214 / 600 });
  await expect
    .poll(async () => (await snapshot(page)).corePhase, { timeout: 20_000 })
    .toBe('upgrade');
  await page.screenshot({ path: fileURLToPath(new URL('portrait-upgrade.png', output)) });
  await page.locator('[data-upgrade="power"]').tap();
  await expect.poll(async () => (await snapshot(page)).corePhase).toBe('aim');
  await shot(page, { touch: true, x: 68 / 390, y: 214 / 600 });
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'result', { timeout: 20_000 });
  await expect(page.locator('[data-outcome="won"]')).toBeVisible();
  const completed = await snapshot(page);
  assert.equal(completed.practice, false, 'Player clear must be a normal rewarded run');
  const unlockedCount = Array.isArray(completed.progress.unlocked)
    ? completed.progress.unlocked.length
    : completed.progress.unlocked;
  assert(unlockedCount >= 2, 'Normal completion must unlock the next stage');
  await page.screenshot({ path: fileURLToPath(new URL('mobile-result.png', output)) });
  await page.locator('#next').tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  const beforeResize = await snapshot(page);
  await page.setViewportSize({ width: 375, height: 667 });
  assert.equal(
    (await snapshot(page)).shots,
    beforeResize.shots,
    'Small viewport must keep the active round',
  );
  await page.screenshot({ path: fileURLToPath(new URL('mobile-small.png', output)) });
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal(
    (await snapshot(page)).turn,
    beforeResize.turn,
    'Orientation change must keep the active turn',
  );
  await shot(page, { touch: true, capture: 'landscape-aim-844x390.png' });
  await expect.poll(async () => (await snapshot(page)).shots).toBeGreaterThan(beforeResize.shots);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-landscape.png', output)) });
  await page.locator('#pause').tap();
  await page.locator('#back-home').tap();
  await expect(page.locator('#start')).toBeVisible();
  await page.reload();
  await page.locator('#levels-button').tap();
  await expect(page.locator('#levels button[data-level]').nth(1)).toBeEnabled();
  await page.locator('#levels-back').tap();
  checks.push(
    'pause, resume, lifecycle and return home',
    'normal clear, growth, next stage and saved unlock',
    'small viewport and landscape preserve the round',
  );
  await page.close();
  await phone.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desk = await desktop.newPage();
  monitor(desk, 'desktop');
  await desk.goto(url);
  await desk.locator('#start').click();
  await expect(desk.locator('body')).toHaveAttribute('data-phase', 'playing');
  const before = await snapshot(desk);
  await shot(desk);
  await expect.poll(async () => (await snapshot(desk)).shots).toBeGreaterThan(before.shots);
  await desk.locator('#pause').click();
  await expect(desk.locator('body')).toHaveAttribute('data-phase', 'paused');
  const beforeFullscreen = await snapshot(desk);
  const full = desk.locator('[data-game-fullscreen]:visible').first();
  await expect(full).toBeVisible();
  await full.click();
  await expect(full).toHaveAttribute('aria-pressed', 'true');
  assert.equal(
    (await snapshot(desk)).turn,
    beforeFullscreen.turn,
    'Fullscreen must keep the current turn',
  );
  await full.click();
  await expect(full).toHaveAttribute('aria-pressed', 'false');
  await desk.screenshot({ path: fileURLToPath(new URL('desktop-paused.png', output)) });
  await desk.locator('#back-home').click();
  checks.push('desktop mouse and fullscreen entry/exit');
  // Deliberately abandon every real volley through the player's recall control.
  // This exercises the actual warning boundary, normal loss and retry without
  // a developer result action or state mutation.
  await desk.locator('#start').click();
  for (let volley = 0; volley < 12 && (await snapshot(desk)).phase !== 'result'; volley += 1) {
    if ((await snapshot(desk)).corePhase === 'upgrade') {
      await desk.locator('[data-upgrade="extra"]').click();
    }
    await expect.poll(async () => (await snapshot(desk)).corePhase).toBe('aim');
    const beforeRecall = await snapshot(desk);
    await shot(desk);
    await expect.poll(async () => (await snapshot(desk)).shots).toBeGreaterThan(beforeRecall.shots);
    await desk.locator('#recall').click();
    await expect
      .poll(async () => (await snapshot(desk)).corePhase !== 'flight', { timeout: 20_000 })
      .toBe(true);
  }
  await expect(desk.locator('body')).toHaveAttribute('data-phase', 'result');
  await expect(desk.locator('[data-outcome="lost"]')).toBeVisible();
  await expect(desk.locator('#result-description')).toContainText('顶部警戒线');
  const lost = await snapshot(desk);
  assert.equal(lost.progress.unlocked.length, 1, 'Failed normal play must not unlock a stage');
  assert.deepEqual(lost.progress.completed, {}, 'Failed normal play must not record a clear');
  await desk.screenshot({ path: fileURLToPath(new URL('desktop-loss.png', output)) });
  await desk.locator('#retry').click();
  await expect(desk.locator('body')).toHaveAttribute('data-phase', 'playing');
  const retried = await snapshot(desk);
  assert.equal(retried.turn, 1);
  assert.equal(retried.shots, 0);
  assert.equal(retried.practice, false);
  await desk.locator('#pause').click();
  await desk.locator('#back-home').click();
  checks.push('normal boundary loss, no reward or unlock, and retry');
  await desk.close();
  await desktop.close();

  for (const mode of [
    { name: 'url-on', query: '?dev=1', stored: null, enabled: true },
    { name: 'storage-on', query: '', stored: '1', enabled: true },
    { name: 'explicit-off', query: '?dev=0', stored: '1', enabled: false },
    { name: 'blocked-storage', query: '', blocked: true, enabled: false },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript((mode) => {
      if (mode.blocked) {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('Storage disabled', 'SecurityError');
          },
        });
      } else if (mode.stored) localStorage.setItem('dev', mode.stored);
    }, mode);
    const testPage = await context.newPage();
    monitor(testPage, mode.name);
    const location = new URL(url);
    location.search = mode.query;
    await testPage.goto(location.href);
    await expect(testPage.locator('#start')).toBeVisible();
    await expect(testPage.locator('small-games-devtools')).toHaveCount(mode.enabled ? 1 : 0);
    assert.equal(await testPage.evaluate(() => Boolean(window.__emberBounce)), mode.enabled);
    if (mode.enabled) {
      await testPage
        .locator('small-games-devtools')
        .getByRole('button', { name: '开发者调试', exact: true })
        .tap();
      await expect(
        testPage.locator('small-games-devtools').getByRole('dialog', { name: '开发者调试选项' }),
      ).toBeVisible();
      await testPage
        .locator('small-games-devtools')
        .getByRole('button', { name: '关闭', exact: true })
        .tap();
    }
    await testPage.locator('#start').tap();
    await expect(testPage.locator('body')).toHaveAttribute('data-phase', 'playing');
    checks.push(mode.name);
    await testPage.close();
    await context.close();
  }
  assert.deepEqual(failures, [], 'All checked browser routes must remain error-free');
  status = 'passed';
  console.log(
    `熔光弹珠: ${checks.length} browser checks passed; screenshots in .scratch/ember-bounce/`,
  );
} catch (error) {
  status = 'failed';
  failures.push({ error: String(error) });
  throw error;
} finally {
  await writeFile(
    new URL('browser-report.json', output),
    JSON.stringify({ status, checks, failures }, null, 2),
  );
  await browser?.close();
  server?.kill('SIGTERM');
}
