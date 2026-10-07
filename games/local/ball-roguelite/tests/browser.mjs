import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createGame, fire, update, brickCenter, FIELD } from '../core.mjs';
import { STORAGE_KEY } from '../storage.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const evidence = fileURLToPath(new URL('../docs/design/rhythm/', import.meta.url));
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
async function inspectRendering(context) {
  // Observe the real browser APIs, without adding debug controls to the game.
  await context.addInitScript(() => {
    window.__audioContexts = [];
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) window.AudioContext = class extends Audio { constructor(...args) { super(...args); window.__audioContexts.push(this); } };
    window.__ballDraws = [];
    const prototype = CanvasRenderingContext2D.prototype;
    const drawImage = prototype.drawImage, silhouettes = new WeakMap();
    prototype.drawImage = function (source, ...args) {
      if (this.canvas.id === 'arena' && source.getContext && args.length === 4) {
        let silhouette = silhouettes.get(source);
        if (!silhouette) {
          const { data } = source.getContext('2d').getImageData(0, 0, source.width, source.height);
          let left = source.width, right = -1, top = source.height, bottom = -1, area = 0;
          for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
            if (data[(y * source.width + x) * 4 + 3] < 200) continue;
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); area++;
          }
          silhouette = { width: right - left + 1, height: bottom - top + 1, area };
          silhouettes.set(source, silhouette);
        }
        const m = this.getTransform();
        window.__ballDraws.push({ ...silhouette, scaleX: Math.hypot(m.a, m.b) * args[2] / source.width, scaleY: Math.hypot(m.c, m.d) * args[3] / source.height, skew: m.a * m.c + m.b * m.d });
        if (window.__ballDraws.length > 200) window.__ballDraws.shift();
      }
      return drawImage.call(this, source, ...args);
    };
  });
}
const audioState = (page) => page.evaluate(() => window.__audioContexts.at(-1)?.state || 'unavailable');
async function tapTargets(page, selectors, label, scroll = false) {
  for (const selector of selectors) {
    const target = page.locator(selector);
    if (scroll) await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    const viewport = page.viewportSize();
    assert(box && box.width >= 43.5 && box.height >= 43.5, `${label}: ${selector} has a 44px touch target`);
    assert(box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= viewport.width + 0.5 && box.y + box.height <= viewport.height + 0.5, `${label}: ${selector} stays within the viewport`);
    assert.equal(await target.evaluate((button) => { const b = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); }), true, `${label}: ${selector} is unobstructed`);
  }
}
async function roundBalls(page) {
  const shape = await page.locator('#arena').evaluate((canvas) => {
    const b = canvas.getBoundingClientRect();
    return { cssScaleX: b.width / 390, cssScaleY: b.height / 620, circles: window.__ballDraws };
  });
  assert(Math.abs(shape.cssScaleX / shape.cssScaleY - 1) < 0.005, 'the canvas keeps circular objects round at the displayed size');
  assert(shape.circles.length > 0, 'visible balls are rendered');
  assert(shape.circles.every((circle) => Math.abs(circle.width / circle.height - 1) < 0.05 && circle.area / (circle.width * circle.height) > 0.68 && circle.area / (circle.width * circle.height) < 0.88), 'the actual ball sprite pixels form a round silhouette');
  assert(shape.circles.every((circle) => Math.abs(circle.scaleX / circle.scaleY - 1) < 0.005 && Math.abs(circle.skew) < 0.005), 'ball bodies remain circles during launch and impact effects');
}
const snapshot = (page) => page.locator('#arena').evaluate((canvas) => canvas.getOrbitSnapshot());
const runState = (state) => Object.fromEntries(['phase', 'levelId', 'turn', 'score', 'count', 'damage', 'cards', 'shots', 'waveIndex', 'launchX', 'upgrades', 'bricks'].map((key) => [key, state[key]]));
async function chooseCard(page) {
  const state = await snapshot(page);
  const preferred = ['power', 'extra', 'pierce', 'chain', 'blast', 'critical'].find((id) => state.cards.includes(id));
  await page.locator(`[data-upgrade="${preferred}"]`).tap();
}
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
  await inspectRendering(context);
  const page = await context.newPage(); monitor(page); const touch = await context.newCDPSession(page);
  await page.goto(origin); await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#levels-button')).toContainText('关卡模式'); await expect(page.locator('#endless-button')).toContainText('无尽模式');
  await expect(page.locator('#start')).toContainText('关卡模式');
  await tapTargets(page, ['#start', '#levels-button', '#endless-button'], '390x844 home');
  assert.equal(await page.evaluate(() => window.__orbit), undefined); await capture(page, 'mobile-home');
  await page.locator('#levels-button').tap(); await expect(page.locator('.level-card:enabled')).toHaveCount(1); await expect(page.locator('.level-card:disabled')).toHaveCount(5); await capture(page, 'mobile-levels');
  await page.locator('[data-level="stardust"]').tap();
  await expect(page.locator('#level-name')).toContainText('关卡模式');
  await tapTargets(page, ['#pause', '#recall'], '390x844 playing');
  const pauseBars = await page.locator('#pause rect').evaluateAll((bars) => bars.map((bar) => { const b = bar.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }));
  assert.equal(pauseBars.length, 2); assert.equal(pauseBars[0].width, pauseBars[1].width); assert.equal(pauseBars[0].height, pauseBars[1].height); assert.equal(pauseBars[0].y, pauseBars[1].y); assert(pauseBars[1].x > pauseBars[0].x + pauseBars[0].width);
  const before = await snapshot(page); await shot(page, touch, -50, -430, true);
  assert.equal((await snapshot(page)).shots, before.shots); assert.equal((await snapshot(page)).aiming, false);
  report.checks.push('explicit campaign and endless home entries / 390x844 touch targets / real two-bar pause icon / unlock-gated levels / cancelled touch');
  const bounds = await page.locator('#arena').boundingBox();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + bounds.width * .5, y: bounds.y + bounds.height * .93 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + bounds.width * .28, y: bounds.y + bounds.height * .3 }] });
  await capture(page, 'mobile-aim'); await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await shot(page, touch, -60, -420); await page.waitForTimeout(330); await roundBalls(page); await capture(page, 'mobile-rhythm-volley');
  await expect.poll(async () => (await snapshot(page)).score).toBeGreaterThan(0);
  await roundBalls(page); await capture(page, 'mobile-impact');
  await page.locator('#pause').tap(); await expect(page.locator('#paused')).toBeVisible(); const paused = await snapshot(page); await page.waitForTimeout(150);
  assert.deepEqual((await snapshot(page)).balls, paused.balls); await capture(page, 'mobile-paused');
  await expect.poll(() => audioState(page)).toBe('suspended');
  await page.locator('#paused [data-action="sound"]').tap(); await expect(page.locator('#paused [data-action="sound"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#resume').tap(); await expect.poll(() => audioState(page)).toBe('suspended');
  await page.locator('#pause').tap(); await page.locator('#paused [data-action="sound"]').tap(); await page.locator('#resume').tap();
  await expect.poll(() => audioState(page)).toBe('running'); await page.locator('#pause').tap(); await expect.poll(() => audioState(page)).toBe('suspended');
  await page.locator('#pause-help').tap(); await expect(page.locator('#help')).toBeVisible(); await page.locator('#help-back').tap(); await expect(page.locator('#paused')).toBeVisible();
  await page.locator('#back-home').tap(); await page.reload(); await page.locator('#start').tap();
  assert.equal((await snapshot(page)).turn, 0); assert.equal((await snapshot(page)).phase, 'aim');
  report.checks.push('round ball body under real canvas transforms / in-flight pause freezes positions / sound off remains suspended on resume / sound on resumes / help return / reload restores pre-shot checkpoint');
  let upgradeSeen = false, independentModesChecked = false;
  for (let round = 0; round < 20; round++) {
    if (await page.locator('#result').isVisible()) break;
    if (await page.locator('#upgrade').isVisible()) {
      upgradeSeen = true; await capture(page, 'mobile-upgrade');
      if (!independentModesChecked) {
        const campaignPending = runState(await snapshot(page));
        await page.locator('#upgrade-home').tap(); await page.locator('#endless-button').tap();
        await expect(page.locator('#level-name')).toHaveText('无尽模式');
        for (let turn = 0; turn < 3; turn++) { await shot(page, touch, 0, -400); await page.locator('#recall').tap(); }
        await expect(page.locator('#upgrade')).toBeVisible();
        const endlessPending = runState(await snapshot(page));
        assert.equal(endlessPending.levelId, 'endless'); assert.equal(endlessPending.turn, 3);
        await page.locator('#upgrade-home').tap(); await capture(page, 'mobile-two-saved-modes'); await page.reload();
        await expect(page.locator('#start')).toContainText('继续无尽模式');
        await page.locator('#levels-button').tap(); await page.locator('#campaign-continue').tap();
        assert.deepEqual(runState(await snapshot(page)), campaignPending, 'campaign pending upgrade survives playing and reloading endless');
        await chooseCard(page); const campaignUpgraded = runState(await snapshot(page));
        assert(Object.values(campaignUpgraded.upgrades).some((count) => count > 0));
        await page.locator('#pause').tap(); await page.locator('#back-home').tap(); await page.locator('#endless-button').tap();
        assert.deepEqual(runState(await snapshot(page)), endlessPending, 'endless resumes its own pending upgrade after campaign play');
        await chooseCard(page); const endlessUpgraded = runState(await snapshot(page));
        await page.locator('#pause').tap(); await page.locator('#back-home').tap(); await page.reload();
        await page.locator('#levels-button').tap(); await page.locator('#campaign-continue').tap();
        assert.deepEqual(runState(await snapshot(page)), campaignUpgraded, 'selected campaign upgrade and board survive reload');
        await page.locator('#pause').tap(); await page.locator('#back-home').tap(); await page.locator('#endless-button').tap();
        assert.deepEqual(runState(await snapshot(page)), endlessUpgraded, 'selected endless upgrade and board survive reload');
        await capture(page, 'mobile-endless');
        for (let turn = 0; turn < 14; turn++) {
          if (await page.locator('#result').isVisible()) break;
          if (await page.locator('#upgrade').isVisible()) await chooseCard(page);
          await shot(page, touch, 0, -400); await page.locator('#recall').tap();
        }
        await expect(page.locator('#result-title')).toHaveText('航行结束'); await expect(page.locator('#result-kicker')).toContainText('无尽模式');
        await capture(page, 'mobile-endless-result');
        await page.locator('#retry').tap(); assert.equal((await snapshot(page)).turn, 0); assert.equal((await snapshot(page)).levelId, 'endless');
        await page.locator('#pause').tap(); await page.locator('#back-home').tap(); await page.reload();
        await page.locator('#levels-button').tap(); await page.locator('#campaign-continue').tap();
        assert.deepEqual(runState(await snapshot(page)), campaignUpgraded, 'finishing and retrying endless preserves the complete campaign run');
        independentModesChecked = true;
        report.checks.push('independent campaign / endless boards, pending upgrade choices and selected upgrades survive mode switching and reload / endless loss and retry preserve campaign');
      } else await chooseCard(page);
    }
    const state = await snapshot(page), direction = planShot(state);
    await shot(page, touch, direction.x, direction.y);
    await expect.poll(async () => (await snapshot(page)).phase, { timeout: 18000 }).not.toBe('flight');
  }
  await expect(page.locator('#result-title')).toHaveText('星域已点亮'); await capture(page, 'mobile-victory');
  assert.equal(upgradeSeen, true); assert.equal(independentModesChecked, true); await page.locator('#next').tap(); assert.equal((await snapshot(page)).levelId, 'prism');
  await page.locator('#pause').tap(); await page.locator('#back-home').tap(); await page.locator('#levels-button').tap();
  await expect(page.locator('.level-card:enabled')).toHaveCount(2); await page.locator('[data-action="home"]').filter({ visible: true }).tap();
  report.checks.push('natural first-level victory / genuine three-card upgrade / next level unlock and saved progression');
  await page.locator('[data-game-fullscreen]').filter({ visible: true }).tap();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.locator('[data-game-fullscreen]').filter({ visible: true }).tap(); await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.setViewportSize({ width: 844, height: 390 }); await tapTargets(page, ['#start', '#levels-button', '#endless-button'], '844x390 home'); await capture(page, 'landscape-home');
  await page.setViewportSize({ width: 320, height: 568 }); await tapTargets(page, ['#start', '#levels-button', '#endless-button'], '320x568 home'); await capture(page, 'small-home');
  await page.locator('#start').tap(); const resizeBefore = await snapshot(page);
  await tapTargets(page, ['#pause', '#recall'], '320x568 playing');
  await page.setViewportSize({ width: 844, height: 390 }); await tapTargets(page, ['#pause', '#recall'], '844x390 playing'); await capture(page, 'mobile-landscape'); assert.equal((await snapshot(page)).turn, resizeBefore.turn);
  await shot(page, touch, 30, -400); assert.equal((await snapshot(page)).shots, resizeBefore.shots + 1);
  await page.locator('#pause').tap(); await page.setViewportSize({ width: 320, height: 568 }); await page.locator('#resume').tap(); await capture(page, 'mobile-small');
  await roundBalls(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await expect(page.locator('#paused')).toBeVisible();
  report.checks.push('enter / exit full screen / resize without reset / landscape touch mapping / 320x568 / blur pause');
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

  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await inspectRendering(reduced);
  const calm = await reduced.newPage(); monitor(calm); const calmTouch = await reduced.newCDPSession(calm);
  await calm.goto(origin); await expect(calm.locator('#start')).toBeVisible(); await calm.waitForTimeout(100);
  const stillHero = await calm.locator('#hero').evaluate((canvas) => canvas.toDataURL());
  await calm.waitForTimeout(250);
  assert.equal(await calm.locator('#hero').evaluate((canvas) => canvas.toDataURL()), stillHero, 'reduced-motion home animation stays still');
  await calm.locator('#start').tap(); await shot(calm, calmTouch, -60, -420); await calm.waitForTimeout(400);
  assert.equal((await snapshot(calm)).shots, 1); await roundBalls(calm); await capture(calm, 'mobile-reduced-motion');
  await calm.locator('#pause').tap(); const calmPaused = await snapshot(calm); await calm.waitForTimeout(150);
  assert.deepEqual((await snapshot(calm)).balls, calmPaused.balls);
  await calm.locator('#resume').tap(); await expect.poll(async () => (await snapshot(calm)).balls).not.toEqual(calmPaused.balls);
  await calmTouch.detach(); await reduced.close();
  report.checks.push('reduced-motion home stays pixel-still / touch shot remains playable with circular balls / pause and resume');

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
