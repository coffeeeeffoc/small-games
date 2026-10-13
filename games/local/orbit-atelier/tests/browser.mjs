import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import {
  coverageSummary,
  errorEvidence,
  readCoverage,
  sanitize,
  assertMatchingBuild,
} from './evidence.mjs';
import { sourceIdentity, buildIdentity } from './build-evidence.mjs';

// Run the production build. Gameplay is driven only through native browser
// gestures and visible player controls; the developer snapshot is read-only.
const root = fileURLToPath(new URL('../', import.meta.url));
let evidence = process.env.ORBIT_EVIDENCE_DIR
  ? path.resolve(process.env.ORBIT_EVIDENCE_DIR)
  : path.resolve(root, '../../../.scratch/orbit-atelier');
const runFile = promisify(execFile);
const checks = [];
const failures = [];
const screenshots = [];
const receipts = [];
const actions = [];
const spec = await readCoverage();
const driverSource = await readFile(fileURLToPath(import.meta.url), 'utf8');
const probe = process.env.ORBIT_DIAGNOSTIC_PROBE;
const variant = process.env.ORBIT_DIAGNOSTIC_VARIANT;
let build = null;
let coverage;
let browserVersion;
let server;
let browser;
let status = 'running';
const fullscreenResult = { supported: false, entered: false, exited: false, denialFallback: false };
let baseUrl = process.env.ORBIT_URL;
let core;
let storageKey;

const app = (page) => page.locator('#orbit-app');
const action = (page, name) => {
  const locator =
    name === 'pause'
      ? page.getByRole('button', { name: '暂停', exact: true })
      : page.locator(`[data-action="${name}"]:visible`).first();
  return new Proxy(locator, {
    get(target, property) {
      if (property === 'tap' || property === 'click')
        return async (...args) => {
          record(page, `${String(property)}:${name}`);
          return target[property](...args);
        };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};
const screen = (page, value) => {
  record(page, `expect-screen:${value}`);
  return expect(app(page)).toHaveAttribute('data-screen', value);
};
const inspect = (page) => page.evaluate(() => window.SmallGamesDev.inspect().game);
const stateOf = (game) => game.state ?? game.run?.state ?? game.run ?? game;
const liveRings = (state) => state.rings.filter((ring) => !ring.removed);
const normalUrl = () => new URL(baseUrl).href;
function developerUrl() {
  const url = new URL(baseUrl);
  url.searchParams.set('dev', '1');
  return url.href;
}
function observation(target) {
  const owner = typeof target.context === 'function' ? target : target.page();
  return {
    viewport: owner.viewportSize(),
    container:
      typeof target.parentFrame === 'function' && target.parentFrame()
        ? 'sandbox-iframe'
        : 'standalone',
  };
}
function record(target, action, detail = {}) {
  actions.push({ action, ...observation(target), ...detail });
  if (actions.length > 40) actions.shift();
}
function fail(entry) {
  if (failures.length < 20) failures.push({ ...entry, actions: structuredClone(actions) });
}
async function verify(id, target, assertion) {
  await assertion();
  const entry = spec.cases.find((item) => item.id === id);
  assert(entry, `Unknown case: ${id}`);
  const observed = observation(target);
  const orientation = observed.viewport.width > observed.viewport.height ? 'landscape' : 'portrait';
  assert.equal(orientation, entry.orientation, `${id} orientation`);
  assert.equal(observed.container, entry.container, `${id} container`);
  if (entry.input === 'touch')
    assert(await target.evaluate(() => navigator.maxTouchPoints > 0), `${id} touch context`);
  const anchor = id.startsWith('storage-')
    ? /verify\(\s*`storage-\$\{storage\}`/
    : new RegExp(`verify\\(\\s*'${id}'`);
  const offset = driverSource.search(anchor);
  receipts.push({
    id,
    status: 'passed',
    orientation,
    input: entry.input,
    ...observed,
    assertion: entry.assertion,
    source: `tests/browser.mjs:${driverSource.slice(0, offset).split('\n').length}`,
  });
}
function monitor(page, name, container = 'standalone') {
  page.on('pageerror', (error) =>
    fail({
      context: name,
      kind: 'pageerror',
      ...observation(page),
      container,
      ...errorEvidence(error),
    }),
  );
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      fail({
        context: name,
        kind: 'resource',
        resource: sanitize(response.url()),
        status: response.status(),
        ...observation(response.frame()),
      });
    }
  });
}
async function screenshot(page, name) {
  record(page, `screenshot:${name}`);
  const filename = `${name}.png`;
  await page.screenshot({
    path: path.join(evidence, filename),
    style: 'small-games-devtools { visibility: hidden !important; }',
  });
  screenshots.push(filename);
}
async function ready(page, url = developerUrl()) {
  record(page, 'navigate', { url: sanitize(url) });
  await page.goto(url);
  await expect(app(page)).toHaveAttribute('data-ready', 'true');
}
async function start(page) {
  await action(page, 'start').tap();
  await screen(page, 'playing');
}
async function touchPath(page, points, { cancel = false, mouse = false, onHeld, onReleased } = {}) {
  record(page, mouse ? 'mouse-path' : 'touch-path', {
    points: points.length,
    from: points[0],
    to: points.at(-1),
    cancel,
  });
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
    if (onHeld) await onHeld();
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
    if (onReleased) await onReleased();
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
async function touchControl(page, name, { cancel = false, moveAway = false } = {}) {
  record(page, `touch-control:${name}`, { cancel, moveAway });
  const bounds = await action(page, name).boundingBox();
  assert(bounds, `${name} control is visible`);
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point],
    });
    if (moveAway)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x - bounds.width, y: point.y + bounds.height }],
      });
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
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
  await dragRing(page, ring, hint.angle, {
    ...options,
    ...(options.capture
      ? {
          onHeld: async () => {
            assert.equal(
              stateOf(await inspect(page)).releasedCount,
              before.releasedCount,
              'alignment waits for release',
            );
            await expect(page.locator('[data-release-ready="true"]')).toHaveCount(1);
            await expect(page.locator('.contact.blocked')).toHaveCount(0);
            await screenshot(page, 'mobile-aligned');
          },
          onReleased: async () => {
            await expect(page.locator('g.escaping')).toBeVisible();
            const vector = await page
              .locator('g.escaping')
              .evaluate((g) => [
                parseFloat(g.style.getPropertyValue('--escape-x')),
                parseFloat(g.style.getPropertyValue('--escape-y')),
              ]);
            const releasedAngle = stateOf(await inspect(page)).rings.find(
              (r) => r.id === ring.id,
            ).angle;
            assert.ok(Math.abs(vector[0] + Math.cos(releasedAngle) * 75) < 0.001);
            assert.ok(Math.abs(vector[1] + Math.sin(releasedAngle) * 75) < 0.001);
            await screenshot(page, 'mobile-extracting');
          },
        }
      : {}),
  });
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
async function interruptHeldDrag(target, lifecycle) {
  const before = await inspect(target);
  const ring = liveRings(stateOf(before))[0];
  await dragRing(target, ring, ring.angle + 0.45, {
    onHeld: async () => {
      const held = await inspect(target);
      assert.equal(held.drag?.ringId, ring.id, 'Interruption starts with an active drag');
      assert(
        Math.abs(
          core.angleDistance(
            stateOf(held).rings.find((item) => item.id === ring.id).angle,
            ring.angle,
          ),
        ) > 0.1,
        'Held gesture changed the angle',
      );
      record(target, `synthetic-lifecycle:${lifecycle}`);
      await target.evaluate((mode) => {
        if (mode === 'blur') window.dispatchEvent(new Event('blur'));
        else {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }, lifecycle);
      await screen(target, 'paused');
      const paused = await inspect(target);
      assert.deepEqual(stateOf(paused), stateOf(before), 'Interruption rolls back full state');
      assert.equal(paused.moves, before.moves);
      assert.equal(paused.hints, before.hints);
      assert.equal(paused.drag, null);
    },
    onReleased: async () => {
      await screen(target, 'paused');
      assert.deepEqual(
        stateOf(await inspect(target)),
        stateOf(before),
        'Stale touchEnd cannot commit',
      );
    },
  });
  if (lifecycle === 'hidden')
    await target.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
  await action(target, 'resume').tap();
  await screen(target, 'playing');
  assert.deepEqual(stateOf(await inspect(target)), stateOf(before));
  await releaseOne(target);
  assert.equal(
    liveRings(stateOf(await inspect(target))).length,
    liveRings(stateOf(before)).length - 1,
    'Fresh input releases one ring after interruption',
  );
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
      let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (variant && pathname.startsWith('/orbit-diagnostic-b/'))
        pathname = pathname.slice('/orbit-diagnostic-b'.length);
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
  assert(!probe || ['pageerror', 'iframe-pageerror'].includes(probe), 'Unknown diagnostic probe');
  assert(!variant || (probe && variant === 'B'), 'Variant B is a controlled diagnostic build only');
  if (!baseUrl) {
    const manager = process.env.npm_execpath || 'pnpm';
    const script = /\.[cm]?js$/.test(manager);
    const source = await sourceIdentity(root);
    const runManager = (args) => {
      const windowsShim = process.platform === 'win32' && manager === 'pnpm';
      return runFile(
        windowsShim ? 'cmd.exe' : script ? process.execPath : manager,
        windowsShim ? ['/d', '/s', '/c', 'pnpm', ...args] : script ? [manager, ...args] : args,
        { cwd: root, timeout: 120_000 },
      );
    };
    await runManager(['run', 'build']);
    if (variant) await runManager(['exec', 'vite', 'build', '--base=/orbit-diagnostic-b/']);
    assert.deepEqual(await sourceIdentity(root), source, 'Source changed during production build');
    build = await buildIdentity(root, source);
    build.variant = variant || 'A';
    if (process.env.ORBIT_EXPECTED_BUILD)
      assertMatchingBuild(JSON.parse(process.env.ORBIT_EXPECTED_BUILD), build);
    baseUrl = await startStaticServer();
    if (variant) baseUrl = new URL('/orbit-diagnostic-b/', baseUrl).href;
  }
  if (!process.env.ORBIT_EVIDENCE_DIR)
    evidence = path.join(
      evidence,
      build?.id.slice(0, 12) || 'external-unattested',
      new Date().toISOString().replace(/[:.]/g, '-'),
    );
  await mkdir(evidence, { recursive: true });
  core = await import(new URL('../src/core.ts', import.meta.url));
  storageKey = (await import(new URL('../src/storage.ts', import.meta.url))).SAVE_KEY;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH,
    args: ['--no-sandbox'],
  });
  browserVersion = browser.version();
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: 'zh-CN',
  });
  const page = await phone.newPage();
  monitor(
    page,
    probe === 'iframe-pageerror' ? 'iframe-probe' : 'mobile',
    probe === 'iframe-pageerror' ? 'sandbox-iframe' : 'standalone',
  );
  await ready(page, normalUrl());
  if (probe) {
    let target = page;
    if (probe === 'iframe-pageerror') {
      await page.goto(new URL('/__qa_frame.html', baseUrl).href);
      target = page.frames().find((frame) => frame.parentFrame());
      assert(target, 'Diagnostic iframe mounted');
      await expect(app(target)).toHaveAttribute('data-ready', 'true');
    }
    record(target, `diagnostic-probe:${probe}`);
    await target.addScriptTag({
      content:
        "setTimeout(function orbitDiagnosticProbe() { throw new Error('Orbit controlled diagnostic failure'); }, 0);\n//# sourceURL=/__orbit_diagnostic_probe.js",
    });
    await expect.poll(() => failures.some((entry) => entry.kind === 'pageerror')).toBe(true);
    assert.deepEqual(failures, [], 'Controlled pageerror probe must fail the browser suite');
  }
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
  assert.equal(
    await buttons.count(),
    74,
    'All original and new levels are in the player catalogue',
  );
  await expect(buttons.first()).toBeEnabled();
  await verify('catalog', page, () => expect(buttons.nth(1)).toBeDisabled());
  await screenshot(page, 'mobile-levels');
  await buttons.last().scrollIntoViewIfNeeded();
  const catalogBack = await action(page, 'home').boundingBox();
  assert(
    catalogBack && catalogBack.y >= 0 && catalogBack.y + catalogBack.height <= 844,
    'late chapter keeps the return button on screen',
  );
  await screenshot(page, 'mobile-levels-late');
  await action(page, 'home').tap();
  await screen(page, 'home');
  checks.push('ordinary home, default dev mode off and locked level catalogue');

  await ready(page);
  await start(page);
  await expect(page.locator('#ring-board')).toBeVisible();
  await assertVisibleControls(page);
  await screenshot(page, 'mobile-playing');
  const initial = stateOf(await inspect(page));
  await expect(page.locator('.crossing')).toHaveCount(2);
  assert.deepEqual(
    await page
      .locator('.crossing')
      .evaluateAll((nodes) => nodes.map((n) => [n.dataset.over, n.dataset.under])),
    [
      ['ring-1', 'ring-2'],
      ['ring-2', 'ring-1'],
    ],
    'two contacts visibly alternate over/under',
  );
  const firstHint = core.findHint(initial);
  const firstRing = initial.rings.find((ring) => ring.id === firstHint.ringId);
  const capContactAngle =
    core.getBlockers(initial, firstRing.id)[0].angles[0] + firstRing.gap / 2 - 0.05;
  await dragRing(page, firstRing, capContactAngle, {
    cancel: true,
    onHeld: async () => {
      await expect(page.locator('.crossing')).toHaveCount(2);
      await expect(page.locator('.contact.blocked')).not.toHaveCount(0);
      await screenshot(page, 'mobile-cap-contact');
    },
  });
  await dragRing(page, firstRing, firstRing.angle + 0.45, { cancel: true });
  assert.equal(
    liveRings(stateOf(await inspect(page))).length,
    liveRings(initial).length,
    'Cancelled gesture never releases',
  );
  await releaseOne(page, { capture: true });
  await action(page, 'undo').tap();
  await expect
    .poll(async () => liveRings(stateOf(await inspect(page))).length)
    .toBe(liveRings(initial).length);
  const undone = stateOf(await inspect(page));
  assertSavedRings(undone.rings, initial.rings);
  // Some browsers omit the compatibility click after SVG pointer capture.
  // Keep native touch input and model that omission deterministically.
  await page.evaluate(() => {
    window.suppressCompatibilityClick = (event) => {
      if (event instanceof PointerEvent && event.pointerType === 'touch')
        event.stopImmediatePropagation();
    };
    document.addEventListener('click', window.suppressCompatibilityClick, true);
  });
  try {
    await touchControl(page, 'pause', { cancel: true });
    await screen(page, 'playing');
    await touchControl(page, 'pause', { moveAway: true });
    await screen(page, 'playing');
    await touchControl(page, 'pause');
    await screen(page, 'paused');
  } finally {
    await page.evaluate(() => {
      document.removeEventListener('click', window.suppressCompatibilityClick, true);
      delete window.suppressCompatibilityClick;
    });
  }
  await screen(page, 'paused');
  await screenshot(page, 'mobile-paused');
  const paused = stateOf(await inspect(page));
  await page.waitForTimeout(150);
  await verify('pause', page, async () =>
    assert.deepEqual(stateOf(await inspect(page)), paused, 'Paused rules stay unchanged'),
  );
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
  await verify('reload', page, async () =>
    assertSavedRings(stateOf(await inspect(page)).rings, undone.rings),
  );
  await verify('held-blur', page, () => interruptHeldDrag(page, 'blur'));
  await action(page, 'undo').tap();
  checks.push(
    'native touch cancel, real release, undo, pause, blur/visibility pause and saved game reload',
  );
  await clearLevel(page);
  await screen(page, 'result');
  const completed = await inspect(page);
  assert.equal(completed.practice, false, 'Player gesture completion is a normal rewarded run');
  await verify('settlement', page, () =>
    assert(completed.progress.medals[initial.levelId] > 0, 'Normal completion records a medal'),
  );
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
  await verify('landscape', page, () => releaseOne(page));
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
  await verify('trial', page, () =>
    assert.deepEqual(
      restoredAttempt.progress.medals,
      normalAttempt.progress.medals,
      'Exiting trial preserves earned medals',
    ),
  );
  checks.push(
    'native touch final-stage clear, visible lock countdown, mixed ring sizes, rounded-cap final tap and trial rewards isolated; exit restores normal attempt',
  );
  await verify('chapters', page, async () => {
    for (const number of [25, 34, 35, 44, 45, 54, 55, 64, 65]) {
      await ready(page, `${developerUrl()}&challenge=orbit-${number}`);
      await screen(page, 'playing');
      assert.equal((await inspect(page)).challenge, true);
      if (number === 35) await screenshot(page, 'mobile-wide-mouth');
      if (number === 65) await screenshot(page, 'mobile-woven');
      await clearLevel(page);
      await screen(page, 'result');
    }
  });
  checks.push(
    'all five new chapters: first and last samples cleared by native touch (74 covered by final trial)',
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await ready(page, `${developerUrl()}&challenge=orbit-01`);
  await releaseOne(page);
  const lone = liveRings(stateOf(await inspect(page)))[0];
  const thumbPoint = await page.locator('[data-scene]').evaluate((scene, ring) => {
    const m = scene.getScreenCTM(),
      scale = Math.hypot(m.a, m.b);
    const angle = ring.angle + Math.PI;
    const p = new DOMPoint(
      ring.x + (ring.r + 18 / scale) * Math.cos(angle),
      ring.y + (ring.r + 18 / scale) * Math.sin(angle),
    ).matrixTransform(m);
    return { x: p.x, y: p.y };
  }, lone);
  await touchPath(page, [thumbPoint, thumbPoint]);
  await verify('thumb', page, () => screen(page, 'result'));
  checks.push(
    'landscape letterboxed SVG keeps a 44px thumb target: tap 18 CSS px outside isolated band',
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
  await verify('fullscreen', desk, async () =>
    assertSavedRings(stateOf(await inspect(desk)).rings, beforeFullscreen.rings),
  );
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
    await verify(`storage-${storage}`, storagePage, async () =>
      assert.equal(
        liveRings(stateOf(await inspect(storagePage))).length,
        liveRings(beforeHint).length - 1,
      ),
    );
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
  monitor(host, 'iframe', 'sandbox-iframe');
  await host.goto(new URL('/__qa_frame.html', baseUrl).href);
  const frame = host.frames().find((entry) => entry.parentFrame());
  assert(frame, 'Game iframe mounted');
  await expect(app(frame)).toHaveAttribute('data-ready', 'true');
  await screen(frame, 'home');
  await screenshot(host, 'iframe-home');
  await action(frame, 'start').tap();
  await screen(frame, 'playing');
  const iframeBefore = stateOf(await inspect(frame));
  await releaseOne(frame);
  await action(frame, 'pause').tap();
  await screen(frame, 'paused');
  await action(frame, 'resume').tap();
  await screen(frame, 'playing');
  await verify('iframe', frame, async () =>
    assert.equal(
      liveRings(stateOf(await inspect(frame))).length,
      liveRings(iframeBefore).length - 1,
    ),
  );
  await action(frame, 'pause').tap();
  await action(frame, 'retry').tap();
  await host.setViewportSize({ width: 844, height: 390 });
  await verify('iframe-held-hidden', frame, () => interruptHeldDrag(frame, 'hidden'));
  checks.push('sandboxed iframe home, native touch ring release and pause/resume');
  await iframeContext.close();
  assert.deepEqual(
    failures,
    [],
    'Production browser routes must have no script or resource failures',
  );
  coverage = coverageSummary(spec, receipts, driverSource);
  assert.equal(
    coverage.missing.length,
    0,
    'Every declared combination needs a passed executable assertion',
  );
  status = 'passed';
  console.log(`星扣工坊：${checks.length} browser checks passed`);
} catch (error) {
  status = 'failed';
  fail({ kind: 'runner', ...errorEvidence(error) });
  process.exitCode = 1;
} finally {
  await mkdir(evidence, { recursive: true });
  const report = {
    status,
    date: new Date().toISOString(),
    build,
    reproduction: {
      revision: build?.revision || null,
      command: 'node tests/reproduce-failure.mjs <absolute-browser-report.json>',
      normalCommand: 'pnpm --filter @coffeeeeffoc/orbit-atelier test:browser',
      probe: probe || null,
      variant: variant || 'A',
      externalUrl: build ? null : sanitize(baseUrl),
    },
    coverage: coverage || coverageSummary(spec, receipts, driverSource),
    actions,
    environment: {
      node: process.version,
      os: process.platform,
      arch: process.arch,
      packageManager: 'pnpm@12.6.0 (repository lock)',
      browser: browserVersion,
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
  };
  await writeFile(
    path.join(evidence, 'browser-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  if (status === 'failed') console.error('ORBIT_FAILURE_REPORT ' + JSON.stringify(report));
  console.log(`Orbit evidence: ${path.join(evidence, 'browser-report.json')}`);
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
