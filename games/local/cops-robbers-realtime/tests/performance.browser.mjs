import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from 'playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.PERFORMANCE_OUTPUT || resolve(root, 'outputs/performance'));
const variants = [
  ...(process.env.BASELINE_DIST ? [{ name: 'baseline', directory: resolve(process.env.BASELINE_DIST) }] : []),
  { name: 'release', directory: resolve(root, 'dist') },
];
const viewport = { width: 390, height: 844 };
const network = { offline: false, latency: 80, downloadThroughput: 500000, uploadThroughput: 500000 };
const report = {
  passed: false, environment: `${process.platform}; isolated headless Chromium; emulated phone/touch, not a physical device`,
  viewport, coldNetwork: network, coldRuns: 5, coldCpuThrottle: 4, staticObservationMs: 30000,
  gameplayObservationMs: 10000, longFrameThresholdMs: 50, variants: [], errors: [],
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const servers = [];
let browser;
const state = page => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? null;
const summary = values => ({ count: values.length, medianMs: percentile(values, 0.5), p95Ms: percentile(values, 0.95), maxMs: values.length ? Math.max(...values) : null });

async function serve(directory) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = resolve(directory, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
      const path = relative(directory, file);
      assert(!path.startsWith('..') && !isAbsolute(path));
      const bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

function instrument() {
  const pending = new Map(), originalRaf = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  let active = null, timestamp = null, gameCallback = null;
  const data = { draws: [], maxPending: 0, duplicateTimestamps: 0, lastTimestamp: null };
  window.requestAnimationFrame = callback => {
    const id = originalRaf(time => {
      pending.delete(id);
      active = callback; timestamp = time;
      try { callback(time); } finally { active = null; timestamp = null; }
    });
    pending.set(id, callback);
    if (callback === gameCallback)
      data.maxPending = Math.max(data.maxPending, [...pending.values()].filter(value => value === gameCallback).length);
    return id;
  };
  window.cancelAnimationFrame = id => { pending.delete(id); return cancel(id); };
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.id === 'game-canvas') {
      gameCallback = active || gameCallback;
      if (timestamp !== null && timestamp === data.lastTimestamp) data.duplicateTimestamps++;
      data.lastTimestamp = timestamp;
      data.draws.push({ at: performance.now(), timestamp, screen: document.body.dataset.screen });
    }
    return clear.apply(this, args);
  };
  window.__canvasProbe = data;
}

async function newPage(base, probe = false) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  if (probe) await context.addInitScript(instrument);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/?dev=0');
  await expect(page.locator('#home-screen')).toBeVisible();
  return { context, page };
}

async function cold(base, name) {
  const runs = [];
  for (let i = 0; i < report.coldRuns; i++) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', network);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: report.coldCpuThrottle });
    const failed = [];
    page.on('pageerror', error => failed.push(error.message));
    await page.goto(base + '/?dev=0', { waitUntil: 'load' });
    await expect(page.locator('#levels-button')).toBeVisible();
    const result = await page.evaluate(async () => {
      await Promise.all([...document.images].map(image => image.decode()));
      // SVG sprite loads are included by the page load event; wait for a painted frame.
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      return {
        readyMs: performance.now(), loadMs: nav.loadEventEnd,
        imageBytes: resources.filter(item => /home-city|characters/.test(item.name)).reduce((sum, item) => sum + item.encodedBodySize, 0),
        images: resources.filter(item => /home-city|characters/.test(item.name)).map(item => ({ path: new URL(item.name).pathname, bytes: item.encodedBodySize, durationMs: item.duration })),
      };
    });
    assert.deepEqual(failed, []);
    runs.push(result);
    if (i === 0) await page.screenshot({ path: resolve(output, `${name}-home.png`), animations: 'disabled' });
    await context.close();
  }
  return { runs, ready: summary(runs.map(run => run.readyMs)), load: summary(runs.map(run => run.loadMs)) };
}

async function sample(page, milliseconds) {
  const before = await page.evaluate(() => ({ count: window.__canvasProbe.draws.length, at: performance.now() }));
  await page.waitForTimeout(milliseconds);
  return page.evaluate(before => {
    const frames = window.__canvasProbe.draws.slice(before.count);
    return { elapsedMs: performance.now() - before.at, draws: frames.length, frames };
  }, before);
}

async function start(page) {
  await page.locator('#levels-button').tap();
  await page.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
  await page.locator('#start-button').tap();
  await expect.poll(async () => (await state(page)).phase).toBe('playing');
}

async function tapActor(page, index) {
  const current = await state(page);
  for (const point of [current.cops[index], { x: 500, y: 300 }]) {
    const screen = await page.evaluate(async point => (await import('./src/main.js')).worldToScreen(point), point);
    await page.touchscreen.tap(screen.x, screen.y);
  }
  assert((await state(page)).cops[index].destination, 'real touch issues an order');
}

async function canvasChecks(base, name, result) {
  const { context, page } = await newPage(base, true);
  try {
    result.home = await sample(page, report.staticObservationMs);
    await page.locator('#levels-button').tap();
    result.levels = await sample(page, report.staticObservationMs);
    if (name === 'release') {
      assert.equal(result.home.draws, 0, 'home does not redraw the hidden game Canvas');
      assert.equal(result.levels.draws, 0, 'level selection does not redraw the hidden game Canvas');
    }
    await page.screenshot({ path: resolve(output, `${name}-levels.png`) });
    await page.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
    await page.locator('#start-button').tap();
    await expect.poll(async () => (await state(page)).phase).toBe('playing');
    const sampleResult = await sample(page, report.gameplayObservationMs);
    assert.equal((await state(page)).phase, 'playing', 'the fixed-scene sample stays in active gameplay');
    const intervals = sampleResult.frames.slice(1).map((frame, i) => frame.at - sampleResult.frames[i].at);
    result.fixedScene = { level: 1, mode: 'quick', cpuThrottle: 1, networkThrottle: false, input: 'no orders during 10-second observation',
      elapsedMs: sampleResult.elapsedMs, draws: sampleResult.draws, intervals: summary(intervals),
      longFrames: intervals.filter(interval => interval > report.longFrameThresholdMs).length };
    assert(sampleResult.draws > 0, 'returning from level selection redraws');
    await page.screenshot({ path: resolve(output, `${name}-game.png`) });
    if (name === 'release') {
      // Start a fresh fixed scenario for lifecycle checks, independent of timing samples.
      await page.goto(base + '/?dev=0');
      await start(page);
      for (let i = 0; i < 3; i++) {
        await page.locator('#pause-button').tap();
        const paused = await state(page), quiet = await sample(page, 400);
        assert.equal((await state(page)).time, paused.time);
        assert.equal(quiet.draws, 0);
        if (i === 0) await page.screenshot({ path: resolve(output, 'release-pause.png') });
        await page.setViewportSize(i % 2 ? viewport : { width: 844, height: 390 });
        await page.locator('#resume-button').tap();
        const resumed = await state(page);
        assert(resumed.time - paused.time < 0.15, 'resume does not absorb paused wall-clock time');
        assert((await sample(page, 150)).draws > 0, 'resize and resume redraw');
      }
      await page.setViewportSize(viewport);
      await tapActor(page, 0); await tapActor(page, 1);
      await expect.poll(async () => (await state(page)).phase, { timeout: 12000 }).toBe('won');
      const terminal = await state(page);
      assert.equal(terminal.phase, 'won');
      const animation = await sample(page, 250);
      assert(animation.draws > 0, 'visible final capture animation still draws');
      await page.screenshot({ path: resolve(output, 'release-capture.png') });
      await expect(page.locator('#win-dialog')).toBeVisible();
      assert.equal((await sample(page, 350)).draws, 0, 'settlement page stops game Canvas work');
      await page.screenshot({ path: resolve(output, 'release-win.png') });
      const probe = await page.evaluate(() => ({ maxPending: window.__canvasProbe.maxPending, duplicateTimestamps: window.__canvasProbe.duplicateTimestamps }));
      assert.equal(probe.maxPending, 1, 'exactly one pending game RAF after resume/resize');
      assert.equal(probe.duplicateTimestamps, 0, 'at most one game draw per RAF timestamp');
      result.lifecycle = { terminal: terminal.phase, visibleTerminalDraws: animation.draws, ...probe };
      await page.locator('#win-dialog [data-home]').tap();
      await expect(page.locator('#home-screen')).toBeVisible();
    }
    // Store the measured intervals without thousands of repeated static frame objects.
    for (const key of ['home', 'levels']) delete result[key].frames;
    return result;
  } finally { await context.close(); }
}

await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  report.browser = browser.version();
  for (const variant of variants) {
    const base = await serve(variant.directory), result = { name: variant.name };
    report.variants.push(result);
    result.cold = await cold(base, variant.name);
    result.canvas = {};
    await canvasChecks(base, variant.name, result.canvas);
    console.log(`${variant.name}: ${JSON.stringify(result)}`);
  }
  for (const name of ['home-city', 'characters']) {
    await stat(resolve(root, `src/assets/${name}.png`));
    await assert.rejects(stat(resolve(root, `dist/src/assets/${name}.png`)), { code: 'ENOENT' });
    await stat(resolve(root, `dist/src/assets/${name}.webp`));
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  await Promise.all(servers.map(server => new Promise(done => server.close(done))));
}
