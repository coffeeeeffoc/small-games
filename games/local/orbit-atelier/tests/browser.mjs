import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

// Run the production build. Gameplay is driven only through native browser
// gestures and visible player controls; the developer snapshot is read-only.
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.join(root, 'docs/design');
const runFile = promisify(execFile);
const checks = [];
const failures = [];
const screenshots = [];
let server;
let browser;
let status = 'running';
const fullscreenResult = { supported: false, entered: false, exited: false, denialFallback: false };
let baseUrl = process.env.ORBIT_URL;
let core;
let storageKey;

const app = (page) => page.locator('#orbit-app');
const action = (page, name) =>
  name === 'pause'
    ? page.getByRole('button', { name: '暂停', exact: true })
    : page.locator(`[data-action="${name}"]:visible`).first();
const screen = (page, value) => expect(app(page)).toHaveAttribute('data-screen', value);
const inspect = (page) => page.evaluate(() => window.SmallGamesDev.inspect().game);
const stateOf = (game) => game.state ?? game.run?.state ?? game.run ?? game;
const liveRings = (state) => state.rings.filter((ring) => !ring.removed);
const normalUrl = () => new URL(baseUrl).href;
function developerUrl() {
  const url = new URL(baseUrl);
  url.searchParams.set('dev', '1');
  return url.href;
}
function monitor(page, name) {
  page.on('pageerror', (error) => failures.push({ name, error: error.message }));
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failures.push({ name, resource: response.url(), status: response.status() });
    }
  });
}
async function screenshot(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({
    path: path.join(evidence, filename),
    style: 'small-games-devtools { visibility: hidden !important; }',
  });
  screenshots.push(filename);
}
async function ready(page, url = developerUrl()) {
  await page.goto(url);
  await expect(app(page)).toHaveAttribute('data-ready', 'true');
}
async function start(page) {
  await action(page, 'start').tap();
  await screen(page, 'playing');
}
async function touchPath(page, points, { cancel = false, mouse = false } = {}) {
  const owner = typeof page.context === 'function' ? page : page.page();
  if (mouse) {
    await owner.mouse.move(points[0].x, points[0].y);
    await owner.mouse.down();
    for (const point of points.slice(1)) {
      await owner.mouse.move(point.x, point.y);
      await owner.waitForTimeout(12);
    }
    await owner.mouse.up();
    return;
  }
  const session = await owner.context().newCDPSession(owner);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...points[0], id: 1, radiusX: 4, radiusY: 4, force: 1 }],
    });
    for (const point of points.slice(1)) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...point, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      });
      await owner.waitForTimeout(12);
    }
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
    await owner.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
  } finally {
    await session.detach();
  }
}
async function dragRing(page, ring, targetAngle, options = {}) {
  // Inspect SVG geometry and native hit targets, including its responsive CTM,
  // instead of hard-coding CSS positions or injecting rule state.
  const gesture = await page.locator(`g[data-ring="${ring.id}"]`).evaluate(
    (group, { ring, cap }) => {
      const matrix = group.parentNode.getScreenCTM();
      if (!matrix) throw new Error('Ring has no screen transformation');
      if (cap) {
        const angle = ring.angle + ring.gap / 2 - 0.1;
        const point = new DOMPoint(
          ring.x + ring.r * Math.cos(angle),
          ring.y + ring.r * Math.sin(angle),
        ).matrixTransform(matrix);
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-ring]');
        if (hit?.getAttribute('data-ring') !== ring.id)
          throw new Error('Visible rounded cap must belong to the isolated ring');
        return { angle, matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f] };
      }
      for (let i = 0; i < 72; i += 1) {
        const angle = (i * Math.PI * 2) / 72;
        // Rounded stroke caps can paint inside the opening. Pick the middle of
        // the solid arc, with enough distance from both tips for a finger.
        const openingDistance = Math.abs(
          Math.atan2(Math.sin(angle - ring.angle), Math.cos(angle - ring.angle)),
        );
        if (openingDistance <= ring.gap / 2 + 0.2) continue;
        const point = new DOMPoint(
          ring.x + ring.r * Math.cos(angle),
          ring.y + ring.r * Math.sin(angle),
        ).matrixTransform(matrix);
        const hit = document.elementFromPoint(point.x, point.y)?.closest('[data-ring]');
        if (hit?.getAttribute('data-ring') === ring.id) {
          return { angle, matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f] };
        }
      }
      throw new Error(`No exposed touchable arc found for ${ring.id}`);
    },
    { ring, cap: Boolean(options.cap) },
  );
  const delta = Math.atan2(Math.sin(targetAngle - ring.angle), Math.cos(targetAngle - ring.angle));
  const steps = Math.max(2, Math.ceil(Math.abs(delta) / 0.08));
  const [a, b, c, d, e, f] = gesture.matrix;
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = gesture.angle + (delta * index) / steps;
    const x = ring.x + ring.r * Math.cos(angle);
    const y = ring.y + ring.r * Math.sin(angle);
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  });
  await touchPath(page, points, options);
}
async function releaseOne(page, options = {}) {
  const before = stateOf(await inspect(page));
  const hint = core.findHint(before);
  assert(hint, 'Each published stage must offer a reachable release');
  const ring = before.rings.find((entry) => entry.id === hint.ringId);
  assert(ring && !ring.removed, 'Hint must name an active ring');
  await dragRing(page, ring, hint.angle, options);
  await expect
    .poll(async () => liveRings(stateOf(await inspect(page))).length)
    .toBe(liveRings(before).length - 1);
  if (options.blurAfter) await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('g.escaping')).toHaveCount(0);
}
async function clearLevel(page, { capLast = false } = {}) {
  const limit = stateOf(await inspect(page)).rings.length + 1;
  for (let count = 0; count < limit; count += 1) {
    if ((await app(page).getAttribute('data-screen')) === 'result') return;
    if (!liveRings(stateOf(await inspect(page))).length) {
      await screen(page, 'result');
      return;
    }
    const last = liveRings(stateOf(await inspect(page))).length === 1;
    await releaseOne(page, { blurAfter: last, cap: capLast && last });
  }
  await screen(page, 'result');
}
async function assertVisibleControls(page) {
  const info = await page.locator('button:visible').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.getAttribute('aria-label') || button.textContent.trim(),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
  const viewport = page.viewportSize();
  for (const button of info) {
    assert(button.text, 'Every player button needs an accessible name');
    assert(
      button.left >= -1 && button.right <= viewport.width + 1,
      `${button.text} outside viewport`,
    );
    assert(
      button.top >= -1 && button.bottom <= viewport.height + 1,
      `${button.text} vertically clipped`,
    );
    assert(button.width >= 43 && button.height >= 43, `${button.text} touch target below 44 px`);
  }
}
function assertSavedRings(actual, expected) {
  assert.equal(actual.length, expected.length, 'Saved ring count');
  for (let index = 0; index < actual.length; index += 1) {
    assert(
      Math.abs(core.angleDistance(actual[index].angle, expected[index].angle)) < 1e-7,
      'Saved rotation',
    );
    assert.deepEqual(
      { ...actual[index], angle: 0 },
      { ...expected[index], angle: 0 },
      'Saved ring geometry and removal',
    );
  }
}
async function startStaticServer() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/__qa_frame.html') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style><iframe title="星扣工坊" src="/?dev=1" sandbox="allow-scripts allow-same-origin" allow="fullscreen"></iframe>',
        );
        return;
      }
      const target = path.resolve(root, 'dist', `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(path.join(root, 'dist') + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const content = await readFile(target);
      response.writeHead(200, {
        'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}/`;
}

try {
  await mkdir(evidence, { recursive: true });
  if (!baseUrl) {
    await runFile('pnpm', ['run', 'build'], { cwd: root, timeout: 120_000 });
    baseUrl = await startStaticServer();
  }
  core = await import(new URL('../src/core.ts', import.meta.url));
  storageKey = (await import(new URL('../src/storage.ts', import.meta.url))).SAVE_KEY;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: 'zh-CN',
  });
  const page = await phone.newPage();
  monitor(page, 'mobile');
  await ready(page, normalUrl());
  await screen(page, 'home');
  assert.equal(
    await page.locator('small-games-devtools').count(),
    0,
    'Player default disables dev tools',
  );
  await assertVisibleControls(page);
  await screenshot(page, 'mobile-home');
  await action(page, 'levels').tap();
  await screen(page, 'levels');
  const buttons = page.locator('button[data-level]');
  assert((await buttons.count()) >= 2, 'Level catalogue is visible');
  await expect(buttons.first()).toBeEnabled();
  await expect(buttons.nth(1)).toBeDisabled();
  await screenshot(page, 'mobile-levels');
  checks.push('ordinary home, default dev mode off and locked level catalogue');

  await ready(page);
  await start(page);
  await expect(page.locator('#ring-board')).toBeVisible();
  await assertVisibleControls(page);
  await screenshot(page, 'mobile-playing');
  const initial = stateOf(await inspect(page));
  const firstHint = core.findHint(initial);
  const firstRing = initial.rings.find((ring) => ring.id === firstHint.ringId);
  await dragRing(page, firstRing, firstRing.angle + 0.45, { cancel: true });
  assert.equal(
    liveRings(stateOf(await inspect(page))).length,
    liveRings(initial).length,
    'Cancelled gesture never releases',
  );
  await releaseOne(page);
  await action(page, 'undo').tap();
  await expect
    .poll(async () => liveRings(stateOf(await inspect(page))).length)
    .toBe(liveRings(initial).length);
  const undone = stateOf(await inspect(page));
  assertSavedRings(undone.rings, initial.rings);
  await action(page, 'pause').tap();
  await screen(page, 'paused');
  await screenshot(page, 'mobile-paused');
  const paused = stateOf(await inspect(page));
  await page.waitForTimeout(150);
  assert.deepEqual(stateOf(await inspect(page)), paused, 'Paused rules stay unchanged');
  await action(page, 'resume').tap();
  await screen(page, 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await screen(page, 'paused');
  await action(page, 'resume').tap();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await screen(page, 'paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });
  await action(page, 'home').tap();
  await screen(page, 'home');
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-ready', 'true');
  await start(page);
  assertSavedRings(stateOf(await inspect(page)).rings, undone.rings);
  checks.push(
    'native touch cancel, real release, undo, pause, blur/visibility pause and saved game reload',
  );
  await clearLevel(page);
  await screen(page, 'result');
  const completed = await inspect(page);
  assert.equal(completed.practice, false, 'Player gesture completion is a normal rewarded run');
  assert(completed.progress.medals[initial.levelId] > 0, 'Normal completion records a medal');
  await screenshot(page, 'mobile-result');
  await action(page, 'next').tap();
  await screen(page, 'playing');
  const nextState = stateOf(await inspect(page));
  assert.notEqual(nextState.levelId, initial.levelId, 'Next opens the newly unlocked stage');
  await page.setViewportSize({ width: 320, height: 640 });
  assert.deepEqual(
    stateOf(await inspect(page)).rings,
    nextState.rings,
    'Resize preserves the active level',
  );
  await assertVisibleControls(page);
  await screenshot(page, 'mobile-small');
  await page.setViewportSize({ width: 844, height: 390 });
  await assertVisibleControls(page);
  await screenshot(page, 'mobile-landscape');
  await releaseOne(page);
  await action(page, 'pause').tap();
  await action(page, 'home').tap();
  await action(page, 'levels').tap();
  await expect(page.locator('button[data-level]').nth(1)).toBeEnabled();
  await page.reload();
  await action(page, 'levels').tap();
  await expect(page.locator('button[data-level]').nth(1)).toBeEnabled();
  checks.push(
    'native touch first-stage clear, immediate final-release blur keeps settlement, result, next, persisted unlock and small/landscape interaction',
  );
  await action(page, 'home').tap();
  const normalAttempt = await inspect(page);
  const devtools = page.locator('small-games-devtools');
  await devtools.getByRole('button', { name: '开发者调试', exact: true }).tap();
  await devtools.getByRole('button', { name: '试玩最终星盘（不存进度）', exact: true }).tap();
  await devtools.getByRole('button', { name: '关闭', exact: true }).tap();
  await screen(page, 'playing');
  const trial = await inspect(page);
  assert.equal(trial.practice, true, 'Developer stage selection marks a trial');
  assert.deepEqual(
    trial.progress.medals,
    normalAttempt.progress.medals,
    'Trial never changes player medals',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, 'mobile-final-playing');
  const lockedRing = stateOf(trial).rings.find(
    (ring) => core.isLocked(stateOf(trial), ring.id) && ring.unlockAfter >= 2,
  );
  assert(lockedRing, 'Final stage contains a visible count lock');
  await expect(page.locator(`[data-ring="${lockedRing.id}"] .star-lock text`)).toHaveText(
    String(lockedRing.unlockAfter),
  );
  await releaseOne(page);
  const releasedBeforeFinal = stateOf(await inspect(page)).releasedCount;
  await expect(page.locator(`[data-ring="${lockedRing.id}"] .star-lock text`)).toHaveText(
    String(lockedRing.unlockAfter - releasedBeforeFinal),
  );
  await screenshot(page, 'mobile-star-locks');
  await clearLevel(page, { capLast: true });
  await screen(page, 'result');
  const trialClear = await inspect(page);
  assert.equal(trialClear.practice, true, 'Clearing the final trial remains isolated');
  assert.deepEqual(
    trialClear.progress.medals,
    normalAttempt.progress.medals,
    'Touch clearing the trial awards no player medals',
  );
  await action(page, 'home').tap();
  const restoredAttempt = await inspect(page);
  assert.equal(restoredAttempt.practice, false, 'Exiting a trial restores player mode');
  assertSavedRings(stateOf(restoredAttempt).rings, stateOf(normalAttempt).rings);
  assert.deepEqual(
    restoredAttempt.progress.medals,
    normalAttempt.progress.medals,
    'Exiting trial preserves earned medals',
  );
  checks.push(
    'native touch final-stage clear, visible lock countdown, mixed ring sizes, rounded-cap final tap and trial rewards isolated; exit restores normal attempt',
  );
  await phone.close();

  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
  });
  const desk = await desktop.newPage();
  monitor(desk, 'desktop');
  await ready(desk);
  await assertVisibleControls(desk);
  await action(desk, 'start').click();
  await action(desk, 'pause').click();
  await action(desk, 'home').click();
  await action(desk, 'settings').click();
  await screen(desk, 'settings');
  const beforeFullscreen = stateOf(await inspect(desk));
  const fullscreen = desk.locator('[data-game-fullscreen]:visible').first();
  await expect(fullscreen).toBeVisible();
  fullscreenResult.supported = await desk.evaluate(() =>
    Boolean(document.fullscreenEnabled && Element.prototype.requestFullscreen),
  );
  if (fullscreenResult.supported) {
    await fullscreen.click();
    await expect.poll(() => desk.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    fullscreenResult.entered = true;
    assertSavedRings(stateOf(await inspect(desk)).rings, beforeFullscreen.rings);
    await fullscreen.click();
    await expect.poll(() => desk.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    fullscreenResult.exited = true;
    assertSavedRings(stateOf(await inspect(desk)).rings, beforeFullscreen.rings);
  }
  await desk.evaluate(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new DOMException('Fullscreen denied', 'NotAllowedError'));
  });
  await fullscreen.click();
  await screen(desk, 'settings');
  await expect(app(desk)).toHaveAttribute('data-ready', 'true');
  assertSavedRings(stateOf(await inspect(desk)).rings, beforeFullscreen.rings);
  fullscreenResult.denialFallback = true;
  await action(desk, 'help').click();
  await screen(desk, 'help');
  await action(desk, 'back').click();
  await screen(desk, 'settings');
  await action(desk, 'home').click();
  await screen(desk, 'home');
  await action(desk, 'start').click();
  await screen(desk, 'playing');
  await releaseOne(desk, { mouse: true });
  await action(desk, 'pause').click();
  await screen(desk, 'paused');
  await action(desk, 'retry').click();
  await screen(desk, 'playing');
  assert.equal(stateOf(await inspect(desk)).releasedCount, 0, 'Retry restarts the current level');
  checks.push(
    `desktop mouse, home/help/settings, ${fullscreenResult.entered ? 'real fullscreen entry/exit' : 'fullscreen API unavailable'}, rejected fullscreen fallback and retry`,
  );
  await desktop.close();

  for (const storage of ['corrupt', 'blocked']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(
      ({ mode, key }) => {
        if (mode === 'blocked') {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
              throw new DOMException('Storage unavailable', 'SecurityError');
            },
          });
        } else {
          localStorage.setItem(key, '{broken');
        }
      },
      { mode: storage, key: storageKey },
    );
    const storagePage = await context.newPage();
    monitor(storagePage, storage);
    await ready(storagePage);
    await start(storagePage);
    const beforeHint = stateOf(await inspect(storagePage));
    await action(storagePage, 'hint').tap();
    assert.equal(
      liveRings(stateOf(await inspect(storagePage))).length,
      liveRings(beforeHint).length,
      'Hint guides without releasing a ring',
    );
    await releaseOne(storagePage);
    await action(storagePage, 'pause').tap();
    await screen(storagePage, 'paused');
    checks.push(`${storage} local storage remains playable`);
    await context.close();
  }

  const iframeContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const host = await iframeContext.newPage();
  monitor(host, 'iframe');
  await host.goto(new URL('/__qa_frame.html', baseUrl).href);
  const frame = host.frames().find((entry) => entry.parentFrame());
  assert(frame, 'Game iframe mounted');
  await expect(app(frame)).toHaveAttribute('data-ready', 'true');
  await screen(frame, 'home');
  await screenshot(host, 'iframe-home');
  await action(frame, 'start').tap();
  await screen(frame, 'playing');
  await releaseOne(frame);
  await action(frame, 'pause').tap();
  await screen(frame, 'paused');
  await action(frame, 'resume').tap();
  await screen(frame, 'playing');
  checks.push('sandboxed iframe home, native touch ring release and pause/resume');
  await iframeContext.close();
  assert.deepEqual(
    failures,
    [],
    'Production browser routes must have no script or resource failures',
  );
  status = 'passed';
  console.log(`星扣工坊：${checks.length} browser checks passed`);
} catch (error) {
  status = 'failed';
  failures.push({ error: String(error), stack: error.stack });
  throw error;
} finally {
  await mkdir(evidence, { recursive: true });
  await writeFile(
    path.join(evidence, 'browser-report.json'),
    JSON.stringify(
      {
        status,
        date: new Date().toISOString(),
        environment: {
          browser: browser?.version(),
          engine: 'Chromium',
          rendering: 'production build',
          input: 'CDP native touch + mouse',
          viewports: ['390×844', '320×640', '844×390', '1280×900'],
          realDevice: false,
          fullscreen: fullscreenResult,
        },
        checks,
        screenshots,
        failures,
      },
      null,
      2,
    ) + '\n',
  );
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
