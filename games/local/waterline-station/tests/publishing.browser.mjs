import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root = new URL('../dist/', import.meta.url);
const output = new URL(process.env.CAPTURE_GAME_EVIDENCE === '1' ? '../docs/design/expansion-2026-10-11/' : '../test-results/publishing/', import.meta.url);
await mkdir(output, { recursive: true });
const server = http.createServer(async (req, res) => {
  try { const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = new URL(`.${pathname === '/' ? '/index.html' : pathname}`, root);
    if (!file.href.startsWith(root.href)) return res.writeHead(403).end();
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': file.pathname.endsWith('.html') ? 'text/html' : /\.(m?js)$/.test(file.pathname) ? 'text/javascript' : file.pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
await context.addInitScript(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__sharedUrl = text; } } }); });
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const tap = selector => page.locator(selector).tap();
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
const cancelTouch = async selector => { const target = page.locator(selector).first(); await target.scrollIntoViewIfNeeded(); const b = await target.boundingBox(), cdp = await context.newCDPSession(page); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await cdp.detach(); };
try {
  const { LEVELS } = await import('../levels.mjs');
  const { STORAGE_KEY } = await import('../progress.mjs');
  await page.goto(`${base}?station=${LEVELS[0].id}&target=1&dev=0`);
  const snap = () => page.evaluate(() => window.__waterlineSnapshot());
  const saved = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await shot('play-390');
  await cancelTouch('[data-gate]'); assert.equal((await snap()).state.moves, 0);
  await tap('#hint'); assert.equal((await snap()).assisted, true);
  await tap('#restart'); assert.equal((await snap()).assisted, false);
  assert.match(await page.locator('#move-budget').innerText(), /三星/);
  for (const gate of LEVELS[0].solution) { await tap(`[data-gate="${gate}"]`); await page.waitForFunction(() => !window.__waterlineSnapshot().animating); }
  assert.equal((await snap()).state.won, true); await shot('result-390');
  await tap('#share-result');
  let shared = new URL(await page.evaluate(() => window.__sharedUrl));
  assert.equal(shared.searchParams.get('station'), LEVELS[0].id); assert.equal(shared.searchParams.get('target'), String((await snap()).state.moves)); assert.equal(shared.searchParams.has('dev'), false);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), saved);
  await tap('#result-retry'); await tap('#hint');
  for (const gate of LEVELS[0].solution) { await tap(`[data-gate="${gate}"]`); await page.waitForFunction(() => !window.__waterlineSnapshot().animating); }
  await tap('#share-result'); shared = new URL(await page.evaluate(() => window.__sharedUrl)); assert.equal(shared.searchParams.has('target'), false);
  await tap('#result-retry');
  await page.setViewportSize({ width: 844, height: 390 }); await shot('play-844');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  checks.push('touch cancel spends zero moves, operation budget, real first-level clear, unassisted score invitation, assisted invitation omits score, challenge save isolation, replay and both orientations; turn-based game has no running clock or pause screen');

  await tap('#exit-challenge');
  assert.equal((await snap()).challenge, false);
  assert.equal((await snap()).levelIndex, 0);
  assert.equal(new URL(page.url()).searchParams.has('station'), false);
  assert.equal(new URL(page.url()).searchParams.has('target'), false);
  for (const gate of LEVELS[0].solution) { await tap(`[data-gate="${gate}"]`); await page.waitForFunction(() => !window.__waterlineSnapshot().animating); }
  const normal = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(normal.best[LEVELS[0].id], LEVELS[0].solution.length);
  await page.goto(`${base}?station=${LEVELS[0].id}&target=1&dev=0`);
  await tap('[data-level-index="1"]');
  assert.equal((await snap()).challenge, false);
  assert.equal((await snap()).levelIndex, 1);
  assert.doesNotMatch(await page.locator('#move-budget').innerText(), /好友/);
  for (const gate of LEVELS[1].solution) { await tap(`[data-gate="${gate}"]`); await page.waitForFunction(() => !window.__waterlineSnapshot().animating); }
  assert.equal((await snap()).state.won, true);
  assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)).best[LEVELS[1].id], LEVELS[1].solution.length);
  await page.goto(`${base}?station=${LEVELS[0].id}&target=1&dev=0`);
  for (const gate of LEVELS[0].solution) { await tap(`[data-gate="${gate}"]`); await page.waitForFunction(() => !window.__waterlineSnapshot().animating); }
  await tap('#next-level');
  assert.equal((await snap()).challenge, false);
  assert.equal((await snap()).levelIndex, 1);
  assert.equal(new URL(page.url()).searchParams.has('station'), false);
  await page.goto(`${base}?station=${LEVELS[0].id}&target=1&dev=0`);
  for (const gate of LEVELS[0].solution) { await tap(`[data-gate="${gate}"]`); await page.waitForFunction(() => !window.__waterlineSnapshot().animating); }
  await tap('#result-exit-challenge');
  assert.equal((await snap()).challenge, false);
  assert.equal((await snap()).levelIndex, 1, 'exit restores the previous normal selected level');
  assert.equal((await snap()).progress.best[LEVELS[1].id], LEVELS[1].solution.length);
  checks.push('explicit challenge exit restores normal save; choosing another level and next-level exit challenge; old target never leaks across levels; normal results persist after exit');
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-report.json', output), JSON.stringify({ browser: await browser.version(), environment: 'Chromium mobile viewport / browser touch simulation; not physical-device certification', checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} catch (error) { await shot('failure'); throw error; }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
