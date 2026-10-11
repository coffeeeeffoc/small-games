import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { LEVELS } from '../levels.mjs';

const gameDir = new URL('../', import.meta.url);
const artifacts = new URL('../docs/verification/mobile-challenge-2026-10-11/', import.meta.url);
await mkdir(artifacts, { recursive: true });
execFileSync(process.execPath, ['build.mjs'], { cwd: gameDir });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '15486', '--host', '127.0.0.1'], { cwd: gameDir, stdio: ['ignore', 'pipe', 'inherit'] });
const origin = 'http://127.0.0.1:15486/';
const saveKey = 'tiny-signals:host:tiny-signals.progress.v1';
const report = { build: 'production dist', viewports: ['390x844 touch', '320x568 touch', '1280x900 desktop'], checks: [], errors: [] };
let browser;
let activePage;
const ready = (page) => expect(page.locator('#game-root')).toHaveAttribute('data-busy', 'false');
const moves = (page, count) => expect(page.locator('#moves')).toHaveText(String(count).padStart(2, '0'));
async function win(page, index = 0) {
  for (const direction of LEVELS[index].solution) {
    await ready(page);
    await page.keyboard.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[direction]);
  }
  await expect(page.locator('#game-root')).toHaveAttribute('data-status', 'won');
  await ready(page);
}
async function screenshot(page, name) {
  await page.screenshot({ path: new URL(name, artifacts).pathname, fullPage: true, animations: 'disabled' });
}
try {
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('preview server failed'); })]);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = activePage = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.addInitScript(() => {
    window.__sharedUrls = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (url) => window.__sharedUrls.push(url) } });
  });
  await page.goto(origin);
  await ready(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  async function swipe(cancel = false) {
    await touch('touchStart', [{ x: 110, y: 290, id: 1 }]);
    await touch('touchMove', [{ x: 200, y: 290, id: 1 }]);
    await touch(cancel ? 'touchCancel' : 'touchEnd', []);
    await ready(page);
  }
  await swipe(true);
  await moves(page, 0);
  await swipe();
  await moves(page, 1);
  await page.locator('#pause').tap();
  await expect(page.locator('#pause-dialog')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await swipe();
  await moves(page, 1);
  await page.locator('#resume').tap();
  await page.locator('#undo').tap();
  await moves(page, 0);
  await page.locator('#preview-toggle').tap();
  await swipe();
  await moves(page, 0);
  await page.locator('#commit-preview').tap();
  await ready(page);
  await moves(page, 1);
  await page.locator('#preview-toggle').tap();
  await page.locator('#home').tap();
  await expect(page.locator('#home-page')).toBeVisible();
  await swipe();
  await moves(page, 1);
  await screenshot(page, 'home-390.png');
  await page.locator('#choose-levels').tap();
  await expect(page.locator('#level-nav button')).toHaveCount(6);
  await screenshot(page, 'levels-390.png');
  await page.locator('#levels-back').tap();
  await page.locator('#continue').tap();
  await moves(page, 1);
  await page.locator('#restart').tap();
  await moves(page, 0);
  for (const selector of ['#home', '#pause', '#sound', '#help', '#preview-toggle', '#undo', '#restart']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44, `touch target ${selector}: ${JSON.stringify(box)}`);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await screenshot(page, 'play-390.png');
  await page.screenshot({ path: new URL('viewport-390.png', artifacts).pathname, animations: 'disabled' });
  report.checks.push('real touch swipe/cancel, preview/confirm, undo/restart, manual pause/resume, home/levels/continue, 44px controls, no overflow');

  let arrivals = 0;
  for (const direction of LEVELS[0].solution) {
    await ready(page);
    const vertical = direction === 'up' || direction === 'down';
    const sign = direction === 'up' || direction === 'left' ? -1 : 1;
    await touch('touchStart', [{ x: 180, y: 270, id: 1 }]);
    await touch('touchMove', [{ x: 180 + (vertical ? 0 : 70 * sign), y: 270 + (vertical ? 70 * sign : 0), id: 1 }]);
    await touch('touchEnd', []);
    if (await page.locator('.just-arrived').count()) {
      arrivals += await page.locator('.just-arrived').count();
      await expect(page.locator('#direction-caption')).toContainText(/到家|回到了家/);
    }
  }
  await expect(page.locator('#game-root')).toHaveAttribute('data-status', 'won');
  assert.equal(arrivals, 4);
  await expect(page.locator('#personal-best')).toHaveText('8 步');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').value?.levels?.garden?.best === 8, saveKey);
  const saved = await page.evaluate((key) => localStorage.getItem(key), saveKey);
  await screenshot(page, 'victory-390.png');
  await expect(page.locator('#share-challenge')).toHaveText('分享最优路线挑战');
  await page.locator('#share-challenge').tap();
  await expect(page.locator('#share-status')).toHaveText('挑战链接已复制');
  const shared = await page.evaluate(() => window.__sharedUrls.at(-1));
  assert.equal(new URL(shared).search, '?challenge=1&level=garden&targetMoves=8');
  report.checks.push('eight actual touchscreen moves win; all four arrivals announce; normal best saves; shared URL carries only same-level challenge parameters');

  await page.goto(origin + '?challenge=1&level=compass&targetMoves=12&token=private&dev=0');
  await expect(page.locator('#game-root')).toHaveAttribute('data-challenge', 'true');
  await expect(page.locator('#game-root')).toHaveAttribute('data-level', '1');
  await win(page, 1);
  await expect(page.locator('#result-copy')).toContainText('少 2 步');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), saveKey), saved);
  await page.locator('#share-challenge').tap();
  const sharedChallenge = new URL(await page.evaluate(() => window.__sharedUrls.at(-1)));
  assert.equal(sharedChallenge.search, '?challenge=1&level=compass&targetMoves=10');
  await page.locator('#result-action').tap();
  await moves(page, 0);
  await expect(page.locator('#game-root')).toHaveAttribute('data-challenge', 'true');
  await page.locator('#hint').tap();
  await win(page, 1);
  await expect(page.locator('#share-challenge')).toBeHidden();
  await expect(page.locator('#result-copy')).toContainText('不参与少步比较');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), saveKey), saved);
  await page.locator('#result-home').tap();
  await page.locator('#normal-game').tap();
  await expect(page.locator('#game-root')).toHaveAttribute('data-challenge', 'false');
  await expect(page.locator('#game-root')).toHaveAttribute('data-level', '0');
  report.checks.push('invited level, fewer-move comparison, challenge restart, no progress writes, assisted challenge excluded, normal progress return');

  await page.goto(origin + '?challenge=1&level=garden&targetMoves=8');
  await win(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('cancelled', 'AbortError'); } }));
  await page.locator('#share-challenge').tap();
  await expect(page.locator('#share-status')).toContainText('已取消');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
  });
  await page.locator('#share-challenge').tap();
  await expect(page.locator('#share-fallback')).toBeVisible();
  await expect(page.locator('#share-status')).toContainText('复制失败');
  await page.locator('#result-home').tap();
  await expect(page.locator('#home-page')).toBeVisible();
  report.checks.push('system share cancellation and denied clipboard fallback remain playable');

  await page.goto(origin + '?challenge=1&level=garden&targetMoves=NaN');
  await expect(page.locator('#game-root')).toHaveAttribute('data-challenge', 'false');
  await page.goto(origin + '?dev=1&challenge=1&level=garden&targetMoves=8');
  await expect(page.locator('#game-root')).toHaveAttribute('data-practice', 'true');
  const beforePractice = await page.evaluate((key) => localStorage.getItem(key), saveKey);
  await win(page);
  await expect(page.locator('#share-challenge')).toBeHidden();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), saveKey), beforePractice);
  report.checks.push('malformed invitation falls back; developer win cannot save or share');

  await page.goto(origin + '?dev=0');
  await page.setViewportSize({ width: 320, height: 568 });
  await ready(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#pause').tap();
  await screenshot(page, 'pause-320.png');
  await page.locator('#resume').tap();
  const boardBounds = await page.locator('#boards').boundingBox();
  const controlsBounds = await page.locator('.control-section').boundingBox();
  assert.ok(boardBounds.y + boardBounds.height <= controlsBounds.y, 'all four boards must clear fixed controls on a short phone');
  await screenshot(page, 'play-320.png');
  await page.screenshot({ path: new URL('viewport-320.png', artifacts).pathname, animations: 'disabled' });
  await swipe();
  await moves(page, 1);
  await page.goto(origin + '?dev=0&challenge=1&level=garden&targetMoves=8');
  await ready(page);
  const invitedBoards = await page.locator('#boards').boundingBox();
  const invitedControls = await page.locator('.control-section').boundingBox();
  assert.ok(invitedBoards.y + invitedBoards.height <= invitedControls.y, 'challenge goal must not push boards under controls');
  await screenshot(page, 'challenge-320.png');
  report.checks.push('320x568 portrait: no horizontal overflow, all four boards clear controls in normal and challenge rounds, pause visible, touch still moves');
  await context.close();

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  desktop.on('pageerror', (error) => report.errors.push(error.message));
  await desktop.goto(origin);
  for (let index = 0; index < LEVELS.length; index++) {
    await desktop.locator(`#level-nav [data-level="${index}"]`).click();
    await win(desktop, index);
  }
  await screenshot(desktop, 'desktop.png');
  report.checks.push('all six production-build levels finish via desktop keyboard');
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await writeFile(new URL('report.json', artifacts), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Browser check failed', activePage?.url(), report.errors);
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: new URL('failure.png', artifacts).pathname });
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
