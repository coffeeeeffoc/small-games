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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
await context.addInitScript(() => { localStorage.setItem('homebound-station.progress.v2', JSON.stringify({ stars: [0,0,0], sound: false, lowQuality: true })); Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__sharedUrl = text; } } }); });
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(30000);
const tap = selector => page.locator(selector).tap({ timeout: 30000 });
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: false, timeout: 30000 });
const cancelTouch = async selector => { const target = page.locator(selector).first(); await target.scrollIntoViewIfNeeded(); const b = await target.boundingBox(), cdp = await context.newCDPSession(page); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await cdp.detach(); };
try {
  await page.goto(`${base}?station=1&dev=0`);
  await shot('home-390');
  const saved = await page.evaluate(() => localStorage.getItem('homebound-station.progress.v2'));
  console.log('home ready');
  await tap('[data-action="challenge"]');
  console.log('challenge requested');
  await page.waitForFunction(() => window.homeboundSnapshot().paused === false);
  const snap = () => page.evaluate(() => window.homeboundSnapshot());
  await page.waitForFunction(() => document.querySelector('[data-vehicle]'));
  const before = (await snap()).services.length;
  console.log('scene ready');
  await cancelTouch('[data-vehicle]');
  console.log('gesture cancelled');
  assert.equal((await snap()).services.length, before);
  await tap('#pause');
  const frozen = (await snap()).time; await page.waitForTimeout(300); assert.equal((await snap()).time, frozen);
  await shot('pause-390'); await tap('[data-action="resume"]');
  await tap('#speed'); await tap('#speed');
  assert.equal(await page.locator('#speed').innerText(), '3×');
  const { canDispatch, blocker } = await import('../src/simulation.ts');
  const raw = await snap(), sim = { ...raw, delivered: new Set(raw.delivered) };
  const blocked = sim.vehicles.find(v => blocker(sim, v));
  if (blocked) { await tap(`[data-vehicle="${blocked.id}"]`); assert.ok(await page.locator('[data-blocking="true"]').count()); await shot('blocker-390'); }
  const deadline = Date.now() + 180000;
  let lastDispatched = -1;
  while (!(await snap()).won && Date.now() < deadline) {
    const raw = await snap(), sim = { ...raw, delivered: new Set(raw.delivered) };
    if (raw.services.length !== lastDispatched) { lastDispatched = raw.services.length; console.log(`dispatch ${lastDispatched}/12; sim ${raw.time.toFixed(1)}s; delivered ${raw.delivered.length}`); }
    const car = sim.vehicles.find(v => canDispatch(sim, v.id).ok);
    if (car) await tap(`[data-vehicle="${car.id}"]`);
    await page.waitForTimeout(100);
  }
  assert.equal((await snap()).won, true);
  assert.equal((await snap()).delivered.length, 33);
  assert.equal(await page.evaluate(() => localStorage.getItem('homebound-station.progress.v2')), saved);
  await shot('result-390'); await tap('[data-action="share"]');
  const shared = new URL(await page.evaluate(() => window.__sharedUrl));
  assert.equal(shared.searchParams.get('station'), '1'); assert.equal(shared.searchParams.has('dev'), false);
  await tap('.primary[data-action="menu"]');
  assert.equal(await page.locator('button[data-level="1"]').isDisabled(), true);
  await tap('button[data-level="0"]');
  assert.equal((await page.evaluate(() => window.homeboundChallengeSnapshot())).challenge, false);
  await page.setViewportSize({ width: 844, height: 390 }); await shot('play-844');
  checks.push('touch cancellation, pause/resume, 3x speed, textual blocker, real first-level clear (33 passengers), invitation/share, challenge save isolation, return to normal play, portrait/landscape');

  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-report.json', output), JSON.stringify({ browser: await browser.version(), environment: 'Chromium mobile viewport / browser touch simulation; not physical-device certification', checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} catch (error) { await shot('failure'); throw error; }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
