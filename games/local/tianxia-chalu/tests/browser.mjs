import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../docs/design/', import.meta.url);
const screenshots = new URL('screenshots/', output);
await stat(new URL('../dist/index.html', import.meta.url));
await mkdir(screenshots, { recursive: true });
const port = Number(process.env.TIANXIA_BROWSER_PORT ?? 5199);
let server;
if (!process.env.TIANXIA_BROWSER_URL) {
  server = spawn(process.execPath, ['server.mjs', '--dist', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`Preview exited with ${code}`)));
    server.stderr.on('data', chunk => process.stderr.write(chunk));
  });
}
const origin = process.env.TIANXIA_BROWSER_URL ?? `http://127.0.0.1:${port}`;
const report = {
  environment: 'Desktop Chromium with mobile viewport and touch emulation; not physical-device verification',
  source: 'Production dist served by game server',
  checks: [], errors: [], passed: false,
  concept: { reference: 'concept.png', review: 'Ink landscape, parchment battlefield, red primary actions and gold routing controls follow the concept. Runtime cities use legible vector symbols and the level map uses three progression cards. Portrait is primary; landscape keeps the vertical board and moves status to its sides.' },
};
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
report.browser = browser.version();
const contexts = [];
const snapshot = page => page.evaluate(() => window.SmallGamesDev.inspect().game);
const shot = (page, name) => page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
async function session({ viewport = { width: 390, height: 844 }, init, debug = true, seed = 1 } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  // Fix only randomness. All gameplay changes are still real touch actions and animation frames.
  await page.addInitScript(value => { Object.defineProperty(Crypto.prototype, 'getRandomValues', { value(array) { array.fill(value); return array; } }); }, seed);
  if (init) await page.addInitScript(init);
  await page.goto(`${origin}/${debug ? '?dev=1' : ''}`);
  await expect(page.locator('#start')).toBeVisible();
  if (debug) await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
  return page;
}
async function check(name, run) {
  const started = Date.now();
  try { const details = await run(); report.checks.push({ name, passed: true, durationMs: Date.now() - started, ...details }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function tapRoute(page, selector = '.junction[data-owner="0"]') {
  const control = page.locator(selector).first();
  const old = await control.getAttribute('data-route');
  const box = await control.boundingBox();
  assert(box.width >= 44 && box.height >= 44, 'Owned junction retains a 44 CSS px hit area');
  // Coordinates exercise the actual browser hit map, including after resizing.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(control).not.toHaveAttribute('data-route', old);
  return { before: old, after: await control.getAttribute('data-route'), size: { width: box.width, height: box.height } };
}
try {
  await check('Default player entry, locked campaign and primary mobile screens', async () => {
    const page = await session({ debug: false });
    assert.equal(await page.locator('[data-game-dev-tools]').count(), 0);
    await shot(page, 'home-390x844.png');
    await page.locator('#levels').tap();
    await expect(page.locator('[data-level="crossroads"]')).toBeEnabled();
    await expect(page.locator('[data-level="riverfork"]')).toBeDisabled();
    await expect(page.locator('[data-level="four-kingdoms"]')).toBeDisabled();
    await shot(page, 'levels-390x844.png');
    await page.locator('#back').tap();
    await page.locator('#quick').tap();
    await expect(page.locator('.faction')).toHaveCount(4);
    await expect(page.locator('.city')).toHaveCount(9);
    await page.clock.runFor(2300);
    const route = await tapRoute(page);
    await expect(page.locator('.battle-message')).toContainText('军令已改');
    await expect(page.locator('.junction[data-owner="1"]').first()).toBeDisabled();
    await shot(page, 'battle-390x844.png');
    await page.locator('#pause').tap();
    await shot(page, 'pause-390x844.png');
    await page.locator('#resume').tap();
    await expect(page.locator('#pause')).toBeVisible();
    return { route, screenshots: ['home-390x844.png', 'levels-390x844.png', 'battle-390x844.png', 'pause-390x844.png'] };
  });

  await check('Pause freezes time; canceled touch and resize preserve the match and coordinate mapping', async () => {
    const page = await session();
    await page.locator('#quick').tap();
    await page.clock.runFor(3200);
    const cdp = await page.context().newCDPSession(page);
    const control = page.locator('.junction[data-owner="0"]').first();
    const routeBefore = await control.getAttribute('data-route');
    const bounds = await control.boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 22, y: bounds.y + 22 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(control).toHaveAttribute('data-route', routeBefore);
    await tapRoute(page);
    await page.locator('#pause').tap();
    const paused = await snapshot(page);
    await page.clock.runFor(15000);
    assert.equal((await snapshot(page)).time, paused.time);
    await page.locator('#resume').tap();
    await page.clock.runFor(1200);
    assert((await snapshot(page)).time > paused.time);
    const sizes = [];
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      const before = await snapshot(page);
      await page.setViewportSize(viewport);
      await page.clock.runFor(300);
      const after = await snapshot(page);
      assert.equal(after.levelId, before.levelId);
      assert(after.time >= before.time && after.time - before.time < 0.6, 'Resize must neither reset nor skip time');
      const result = await tapRoute(page);
      const layout = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, board: (() => { const r = document.querySelector('#board').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() }));
      assert(layout.documentWidth <= layout.width, 'No horizontal document overflow');
      assert(layout.board.y >= 0 && layout.board.y + layout.board.height <= viewport.height, 'Battleboard stays inside viewport');
      const labelOverlaps = await page.evaluate(() => {
        const labels = [...document.querySelectorAll('.city-label')];
        return [...document.querySelectorAll('.junction[data-owner="0"]')].flatMap(button => {
          const a = button.getBoundingClientRect();
          return labels.filter(label => { const b = label.getBoundingClientRect(); return Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top); }).map(label => ({ junction: button.dataset.junction, label: label.textContent }));
        });
      });
      assert.deepEqual(labelOverlaps, [], 'Owned junction hit targets must not cover city troop labels');
      await shot(page, `battle-${viewport.width}x${viewport.height}.png`);
      sizes.push({ viewport, time: after.time, route: result, layout });
    }
    return { pausedSeconds: paused.time, virtualPauseSeconds: 15, sizes, canceledTouch: 'No route changed; subsequent touch succeeds' };
  });

  await check('Normal campaign victory through eight real route taps unlocks and persists the next level', async () => {
    const page = await session();
    await page.locator('#start').tap();
    await page.clock.runFor(200);
    // Seed 1, normal difficulty; derived from a standalone rules simulation.
    // No debug actions or state mutation are used in this progression check.
    const actions = [[9, 'redgate-switch'], [9.3, 'westford-switch'], [9.6, 'westford-switch'], [15.9, 'redgate-switch'], [16.2, 'westford-switch'], [16.5, 'westford-switch'], [16.8, 'eastford-switch'], [17.1, 'eastford-switch']];
    for (const [at, junction] of actions) {
      const before = await snapshot(page);
      await page.clock.runFor(Math.round((at - before.time) * 1000));
      assert.equal((await snapshot(page)).time, at);
      await tapRoute(page, `[data-junction="${junction}"]`);
    }
    await page.clock.runFor(22000);
    const result = await snapshot(page);
    assert.equal(result.screen, 'result');
    assert.equal(result.practice, false);
    assert.equal(result.result.outcome, 'victory');
    assert.equal(result.result.reason, 'elimination');
    await shot(page, 'result-victory-390x844.png');
    await expect(page.locator('#next')).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')));
    assert.deepEqual(saved.completed, ['crossroads']);
    await page.locator('#next').tap();
    assert.equal((await snapshot(page)).levelId, 'riverfork');
    await page.locator('#pause').tap();
    await page.locator('#leave').tap();
    await page.reload();
    await page.locator('#levels').tap();
    await expect(page.locator('[data-level="riverfork"]')).toBeEnabled();
    await expect(page.locator('[data-level="four-kingdoms"]')).toBeDisabled();
    return { seed: 1, difficulty: 'normal', actions, result: result.result, savedCompleted: saved.completed };
  });

  await check('Registered developer victory and fast finish cannot award campaign progress', async () => {
    const page = await session();
    await page.locator('#start').tap();
    const original = await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1') ?? '{}'));
    await page.evaluate(() => window.SmallGamesDev.setPanelHidden(false));
    await page.locator('[data-toggle]').tap();
    await page.locator('[data-dev-action="win"]').tap();
    await page.locator('[data-close]').tap();
    assert.equal((await snapshot(page)).practice, true);
    await expect(page.locator('#again')).toBeVisible();
    await page.locator('#again').tap();
    await page.locator('[data-toggle]').tap();
    await page.locator('[data-dev-action="finish"]').tap();
    await page.locator('[data-close]').tap();
    await expect(page.locator('.result')).toBeVisible();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1') ?? '{}'));
    assert.deepEqual(after.completed ?? [], original.completed ?? []);
    assert.deepEqual(after.stars ?? {}, original.stars ?? {});
    await page.locator('#result-home').tap();
    await page.locator('#levels').tap();
    await expect(page.locator('[data-level="riverfork"]')).toBeDisabled();
    return { progressBefore: original.completed ?? [], progressAfter: after.completed ?? [] };
  });

  await check('Unassisted four-faction match reaches an ordinary 180-second result and retries', async () => {
    // This recorded seed keeps multiple factions alive until the normal time limit.
    const page = await session({ seed: 8 });
    await page.locator('#quick').tap();
    await page.clock.runFor(181000);
    const result = await snapshot(page);
    assert.equal(result.screen, 'result');
    assert.equal(result.result.reason, 'timeout');
    assert.equal(result.result.elapsed, 180);
    await shot(page, 'result-timeout-390x844.png');
    await page.locator('#again').tap();
    assert.equal((await snapshot(page)).screen, 'battle');
    assert.equal((await snapshot(page)).time, 0);
    await page.locator('#pause').tap();
    await page.locator('#leave').tap();
    await expect(page.locator('#start')).toBeVisible();
    return { seed: 8, result: result.result, virtualElapsedSeconds: 181 };
  });

  await check('Fullscreen entry/exit preserves paused game; refusal and unsupported API keep touch gameplay available', async () => {
    const page = await session();
    await page.locator('#start').tap();
    await page.clock.runFor(2200);
    await page.locator('#pause').tap();
    const before = await snapshot(page);
    await page.locator('[data-game-fullscreen]').tap();
    await expect(page.locator('[data-game-fullscreen]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-game-fullscreen]').tap();
    await expect(page.locator('[data-game-fullscreen]')).toHaveAttribute('aria-pressed', 'false');
    assert.deepEqual(await snapshot(page), before);
    const outcomes = [];
    for (const mode of ['rejected', 'unsupported']) {
      const fallback = await session({ init: mode === 'rejected' ? () => { Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Test refusal', 'NotAllowedError')); } : () => { Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined }); Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { value: undefined }); } });
      await fallback.locator('#settings').tap();
      await fallback.locator('[data-game-fullscreen]').tap();
      await expect(fallback.locator('#game-display-notice')).toBeVisible();
      outcomes.push({ mode, notice: await fallback.locator('#game-display-notice').textContent() });
      await fallback.locator('#back').tap();
      await fallback.locator('#start').tap();
      await tapRoute(fallback);
    }
    return { nativeBrowserFullscreen: 'entered and exited', fallbacks: outcomes };
  });

  await check('Blocked localStorage getter retains playable local fallback and save warning', async () => {
    const page = await session({ debug: false, init: () => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage is disabled', 'SecurityError'); } }); } });
    await page.locator('#start').tap();
    await tapRoute(page);
    await expect(page.locator('#notice')).toContainText('存档暂时不可用');
    await page.locator('#pause').tap();
    await page.locator('#resume').tap();
    await expect(page.locator('#board')).toBeVisible();
    return { storageFailure: 'SecurityError getter', result: 'Home, battle, route, pause and resume all usable' };
  });

  await check('320×568 home and levels retain visible touch targets and no horizontal overflow', async () => {
    const page = await session({ debug: false, viewport: { width: 320, height: 568 } });
    await shot(page, 'home-320x568.png');
    await page.locator('#levels').tap();
    await shot(page, 'levels-320x568.png');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('[data-level="crossroads"]').tap();
    await tapRoute(page);
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  });
  report.passed = report.checks.every(item => item.passed) && report.errors.length === 0;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  server?.kill();
  await writeFile(new URL('browser-report.json', output), JSON.stringify(report, null, 2) + '\n');
}
if (!report.passed) process.exitCode = 1;
