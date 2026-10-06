import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createGame, fire, update, brickCenter, FIELD } from '../core.mjs';
import { STORAGE_KEY } from '../storage.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const evidence = fileURLToPath(new URL('../docs/design/', import.meta.url));
await mkdir(evidence, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/iframe') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{border:0;width:100vw;height:100dvh}</style><iframe allow="fullscreen; autoplay" src="/index.html?dev=0"></iframe>'); return; }
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    const relative = path.relative(root, file);
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium' });
const report = { browser: browser.version(), environment: 'Linux Chromium mobile touch emulation', checks: [], errors: [], passed: false };
function monitor(page) { page.on('pageerror', (error) => report.errors.push(error.message)); page.on('response', (response) => { if (response.url().startsWith(origin) && response.status() >= 400) report.errors.push(`${response.status()}: ${response.url()}`); }); }
const snapshot = (page) => page.locator('#arena').evaluate((canvas) => canvas.getOrbitSnapshot());
const shot = async (page, touch, dx, dy, cancel = false) => {
  const state = await snapshot(page), bounds = await page.locator('#arena').boundingBox();
  const map = (x, y) => ({ x: bounds.x + x * bounds.width / 390, y: bounds.y + y * bounds.height / 620 });
  const start = map(state.launchX, FIELD.floor - FIELD.radius - 1);
  const amount = Math.min(1, 450 / Math.abs(dy || 1));
  const target = map(Math.max(12, Math.min(378, state.launchX + dx * amount)), Math.max(45, FIELD.floor - FIELD.radius - 1 + dy * amount));
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [target] });
  if (cancel) await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  else await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
function planShot(state) {
  const game = createGame(state.levelId);
  for (const key of ['turn', 'score', 'count', 'damage', 'seed', 'nextId', 'waveIndex', 'launchX', 'upgrades', 'bricks']) game[key] = structuredClone(state[key]);
  let best;
  // Real touch aim stays inside the board; simulate only those actual coordinates.
  const targets = game.bricks.filter((b) => b.kind !== 'pickup').map(brickCenter);
  const candidates = [...targets, ...Array.from({ length: 17 }, (_, i) => ({ x: 27 + i * 21, y: 75 + (i % 3) * 80 }))];
  for (const point of candidates) {
    const direction = { x: point.x - game.launchX, y: point.y - FIELD.floor + FIELD.radius + 1 };
    const trial = structuredClone(game); fire(trial, direction.x, direction.y);
    for (let i = 0; trial.phase === 'flight' && i < 16 * 30; i++) update(trial, 1 / 30);
    const danger = trial.bricks.filter((b) => b.hp > 0 && b.kind !== 'pickup').reduce((sum, b) => sum + b.hp * (1 + b.r * b.r), 0);
    const value = trial.phase === 'won' ? 1e9 : trial.phase === 'lost' ? -1e9 : trial.score * 100 - danger + trial.count * 25;
    if (!best || value > best.value) best = { value, direction };
  }
  return best.direction;
}
async function capture(page, name) { await page.screenshot({ path: path.join(evidence, `${name}.png`) }); }
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); monitor(page); const touch = await context.newCDPSession(page);
  await page.goto(origin); await expect(page.locator('#start')).toBeVisible();
  assert.equal(await page.evaluate(() => window.__orbit), undefined); await capture(page, 'mobile-home');
  await page.locator('#levels-button').tap(); await expect(page.locator('.level-card:enabled')).toHaveCount(1); await expect(page.locator('.level-card:disabled')).toHaveCount(5); await capture(page, 'mobile-levels');
  await page.locator('[data-level="stardust"]').tap();
  const before = await snapshot(page); await shot(page, touch, -50, -430, true);
  assert.equal((await snapshot(page)).shots, before.shots); assert.equal((await snapshot(page)).aiming, false);
  report.checks.push('phone home / unlock-gated level selection / cancelled touch');
  const bounds = await page.locator('#arena').boundingBox();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * .5, y: bounds.y + bounds.height * .93 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + bounds.width * .28, y: bounds.y + bounds.height * .3 }] });
  await capture(page, 'mobile-aim'); await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await shot(page, touch, -60, -420); await page.waitForTimeout(330); await capture(page, 'mobile-impact');
  await page.locator('#pause').tap(); await expect(page.locator('#paused')).toBeVisible(); const paused = await snapshot(page); await page.waitForTimeout(150);
  assert.deepEqual((await snapshot(page)).balls, paused.balls); await capture(page, 'mobile-paused');
  await page.locator('#pause-help').tap(); await expect(page.locator('#help')).toBeVisible(); await page.locator('#help-back').tap(); await expect(page.locator('#paused')).toBeVisible();
  await page.locator('#back-home').tap(); await page.reload(); await page.locator('#start').tap();
  assert.equal((await snapshot(page)).turn, 0); assert.equal((await snapshot(page)).phase, 'aim');
  report.checks.push('in-flight pause freezes positions / help return / reload restores pre-shot checkpoint');
  let upgradeSeen = false;
  for (let round = 0; round < 20; round++) {
    if (await page.locator('#result').isVisible()) break;
    if (await page.locator('#upgrade').isVisible()) {
      upgradeSeen = true; await capture(page, 'mobile-upgrade');
      const state = await snapshot(page);
      const preferred = ['power', 'extra', 'pierce', 'chain', 'blast', 'critical'].find((id) => state.cards.includes(id));
      await page.locator(`[data-upgrade="${preferred}"]`).tap();
    }
    const state = await snapshot(page), direction = planShot(state);
    await shot(page, touch, direction.x, direction.y);
    await expect.poll(async () => (await snapshot(page)).phase, { timeout: 18000 }).not.toBe('flight');
  }
  await expect(page.locator('#result-title')).toHaveText('星域已点亮'); await capture(page, 'mobile-victory');
  assert.equal(upgradeSeen, true); await page.locator('#next').tap(); assert.equal((await snapshot(page)).levelId, 'prism');
  await page.locator('#pause').tap(); await page.locator('#back-home').tap(); await page.locator('#levels-button').tap();
  await expect(page.locator('.level-card:enabled')).toHaveCount(2); await page.locator('[data-action="home"]').filter({ visible: true }).tap();
  report.checks.push('natural first-level victory / genuine three-card upgrade / next level unlock and saved progression');
  await page.locator('[data-game-fullscreen]').filter({ visible: true }).tap();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.locator('[data-game-fullscreen]').filter({ visible: true }).tap(); await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.locator('#start').tap(); const resizeBefore = await snapshot(page);
  await page.setViewportSize({ width: 844, height: 390 }); await capture(page, 'mobile-landscape'); assert.equal((await snapshot(page)).turn, resizeBefore.turn);
  await shot(page, touch, 30, -400); assert.equal((await snapshot(page)).shots, resizeBefore.shots + 1);
  await page.locator('#pause').tap(); await page.setViewportSize({ width: 320, height: 568 }); await page.locator('#resume').tap(); await capture(page, 'mobile-small');
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await expect(page.locator('#paused')).toBeVisible();
  report.checks.push('enter / exit full screen / resize without reset / landscape touch mapping / 320x568 / blur pause');
  await page.locator('#back-home').tap(); await page.locator('#endless-button').tap();
  for (let i = 0; i < 14; i++) {
    if (await page.locator('#result').isVisible()) break;
    if (await page.locator('#upgrade').isVisible()) await page.locator('.upgrade-card').first().tap();
    await shot(page, touch, 0, -400); await page.locator('#recall').tap();
  }
  await expect(page.locator('#result-title')).toHaveText('航行结束'); await capture(page, 'mobile-failure');
  await page.locator('#retry').tap(); assert.equal((await snapshot(page)).turn, 0); assert.equal((await snapshot(page)).levelId, 'endless');
  report.checks.push('normal endless descent loss / retry');
  await touch.detach(); await context.close();

  const embedded = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const host = await embedded.newPage(); monitor(host); await host.goto(`${origin}/iframe`);
  const frame = await host.locator('iframe').contentFrame();
  await frame.locator('#start').tap();
  await expect(frame.locator('body')).toHaveAttribute('data-screen', 'playing');
  const embeddedTouch = await embedded.newCDPSession(host);
  await shot(frame, embeddedTouch, -60, -430);
  await expect.poll(async () => (await snapshot(frame)).shots).toBe(1);
  await frame.locator('#pause').tap(); await expect(frame.locator('#paused')).toBeVisible();
  await frame.locator('#back-home').tap(); await expect(frame.locator('#start')).toBeVisible();
  await capture(host, 'iframe-home'); await embeddedTouch.detach();
  report.checks.push('production same-origin iframe actual-touch play / pause / home'); await embedded.close();

  for (const mode of [
    { query: '', stored: null, enabled: false },
    { query: '?dev=1', stored: null, enabled: true },
    { query: '', stored: '1', enabled: true },
    { query: '?dev=0', stored: '1', enabled: false },
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await context.addInitScript((value) => { if (value) localStorage.setItem('dev', value); }, mode.stored);
    const page = await context.newPage(); monitor(page); await page.goto(origin + mode.query);
    assert.equal(await page.evaluate(() => window.SmallGamesDev.isEnabled()), mode.enabled);
    assert.equal(await page.evaluate(() => !!window.__orbit), mode.enabled);
    if (mode.enabled) {
      const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
      await page.evaluate(() => window.__orbit.startPractice('orbit'));
      assert.equal((await snapshot(page)).practice, true);
      await page.locator('#pause').tap(); await page.locator('#back-home').tap();
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), saved);
    }
    await context.close();
  }
  report.checks.push('production URL / storage / explicit-off / default-off developer mode and practice isolation');
  const blocked = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  const noStorage = await blocked.newPage(); monitor(noStorage); await noStorage.goto(`${origin}?dev=0`); await noStorage.locator('#start').tap();
  assert.equal((await snapshot(noStorage)).phase, 'aim'); await blocked.close(); report.checks.push('blocked storage still starts normally');
  assert.deepEqual(report.errors, []); report.passed = true;
} finally {
  await writeFile(path.join(evidence, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify(report, null, 2));
