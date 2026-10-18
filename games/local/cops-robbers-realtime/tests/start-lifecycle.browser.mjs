import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from 'playwright/test';

// Focused production-H5 regressions; the full publishing suite remains separate.
const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(gameRoot, 'dist');
const output = resolve(gameRoot, 'outputs/browser/start-lifecycle');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    const suffix = relative(dist, file);
    assert(!suffix.startsWith('..' + sep) && suffix !== '..' && !suffix.startsWith(sep));
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, headless: true });
const base = 'http://127.0.0.1:' + server.address().port;
const state = page => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
const report = { passed: false, environment: 'Linux Chromium production H5, real touch with explicit visibility and SDK fixtures; not a physical device', checks: [], errors: [] };
async function createPage() {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    window.SmallGamesPublishingConfig = { adMode: 'host', rewardedAdUnitId: 'fixture-only' };
    localStorage.setItem('neighborhood-patrol-v1', JSON.stringify({ startedRuns: 5 }));
    window.__visibilityEvents = 0;
    window.addEventListener('visibilitychange', () => window.__visibilityEvents++);
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/?dev=0');
  await page.locator('#levels-button').tap();
  return { context, page };
}
async function hidden(page, value) {
  const before = await page.evaluate(() => window.__visibilityEvents);
  await page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  }, value);
  assert.equal(await page.evaluate(() => window.__visibilityEvents), before + 1, 'visibility reaches Window listeners too');
}
async function releaseLock(page) {
  await page.evaluate(async () => {
    window.__releaseStartLock(); await window.__heldStartLock;
    await navigator.locks.request('neighborhood-patrol-v1', () => {});
  });
}
try {
  for (const order of ['hide-show-release', 'hide-release-show']) {
    const { context, page } = await createPage();
    await page.evaluate(() => new Promise(resolve => {
      window.__heldStartLock = navigator.locks.request('neighborhood-patrol-v1', () => new Promise(release => {
        window.__releaseStartLock = release; resolve();
      }));
    }));
    const before = await state(page);
    await page.locator('#start-button').tap();
    assert.equal((await state(page)).phase, 'ready');
    await hidden(page, true);
    assert.equal(await page.evaluate(() => history.state?.patrolScreen), 'levels');
    if (order === 'hide-show-release') await hidden(page, false);
    await releaseLock(page);
    if (order === 'hide-release-show') await hidden(page, false);
    const after = await state(page);
    assert.equal(after.screen, 'levels'); assert.equal(after.phase, 'ready');
    assert.equal(after.startedRuns, before.startedRuns); assert.equal(after.ticks, before.ticks);
    await page.locator('#start-button').tap();
    await expect.poll(async () => (await state(page)).phase).toBe('playing');
    assert.equal((await state(page)).startedRuns, before.startedRuns + 1);
    report.checks.push(order + ': queued start cancelled, setup remains actionable, next explicit start consumes once');
    await context.close();
  }
  for (const order of ['close-before-show', 'show-before-close']) {
    const { context, page } = await createPage();
    await page.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
    await page.locator('#start-button').tap();
    await expect.poll(async () => (await state(page)).phase).toBe('playing');
    await page.locator('#sprint-button').tap();
    await expect.poll(async () => (await state(page)).support.busy).toBe(false);
    assert.equal((await state(page)).support.sprint, 0, 'missing SDK never awards');
    await page.evaluate(() => {
      window.__ad = {};
      window.tap = { createRewardedVideoAd() {
        if (this !== window.tap) throw Error('lost SDK receiver');
        return { show: async () => {}, load: async () => {},
          onClose: fn => window.__ad.close = fn, offClose: () => {},
          onError: fn => window.__ad.error = fn, offError: () => {} };
      } };
    });
    await page.locator('#sprint-button').tap();
    await expect.poll(async () => (await state(page)).support.busy).toBe(true);
    const frozen = (await state(page)).time;
    await hidden(page, true);
    if (order === 'show-before-close') await hidden(page, false);
    await page.evaluate(() => window.__ad.close({ isEnded: true }));
    await expect.poll(async () => (await state(page)).support.busy).toBe(false);
    if (order === 'close-before-show') {
      assert.equal((await state(page)).phase, 'paused'); assert.equal((await state(page)).time, frozen);
      await hidden(page, false);
    }
    assert.equal((await state(page)).support.sprint, 1);
    assert.equal((await state(page)).support.remaining, 0);
    assert.equal((await state(page)).phase, 'playing');
    await page.locator('#sprint-button').tap();
    assert.equal((await state(page)).support.sprint, 0);
    assert((await state(page)).support.remaining > 3);
    report.checks.push(order + ': late SDK injection works, background reward retained and consumed only by a new touch');
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
