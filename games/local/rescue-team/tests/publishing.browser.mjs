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
  await page.goto(`${base}?rescueLevel=1&dev=0`);
  await shot('ready-390');
  const clock = () => page.locator('#app').getAttribute('data-time').then(Number);
  await cancelTouch('#fleet-1'); assert.equal(await clock(), 0);
  await tap('#event-fire-1'); assert.match(await page.locator('#dispatch-cars button:visible small').first().innerText(), /完成余量|预计超时/);
  await shot('dispatch-390'); await tap('#close-dispatch');
  await tap('#go'); await page.waitForTimeout(500); await tap('#go');
  const frozen = await clock(), risk = await page.locator('#risk-clock').innerText();
  await page.waitForTimeout(400); assert.equal(await clock(), frozen); assert.equal(await page.locator('#risk-clock').innerText(), risk);
  await shot('pause-390'); await tap('#go');
  await page.waitForTimeout(200); assert.ok(await clock() > frozen);
  await tap('#restart'); await page.setViewportSize({ width: 844, height: 390 });
  const send = async (car, event) => { await tap(`#event-${event}`); await tap(`[data-dispatch-car="${car}"]`); };
  await send(1, 'fire-1'); await send(3, 'pet-1');
  await page.waitForFunction(() => Number(document.querySelector('#app').dataset.time) >= 12);
  await send(3, 'pet-2');
  await page.waitForFunction(() => Number(document.querySelector('#app').dataset.time) >= 18);
  await send(2, 'fire-2');
  await page.locator('#result[open]').waitFor({ timeout: 45000 });
  assert.equal(await page.locator('#result-title').innerText(), '全城平安');
  await shot('result-844'); await tap('#share-result');
  const shared = new URL(await page.evaluate(() => window.__sharedUrl));
  assert.equal(shared.searchParams.get('rescueLevel'), '1'); assert.equal(shared.searchParams.has('dev'), false);
  await tap('#return-result'); assert.equal(await clock(), 0);
  await page.goto(`${base}?rescueLevel=3`); assert.match(await page.locator('#chapter').innerText(), /03/);
  await shot('ready-844');
  checks.push('touch cancel, dispatch completion margin, countdown pause/resume, real first-level zero-delay clear, same-event challenge sharing, return to ready, valid level-3 invitation, portrait/landscape');

  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-report.json', output), JSON.stringify({ browser: await browser.version(), environment: 'Chromium mobile viewport / browser touch simulation; not physical-device certification', checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} catch (error) { await shot('failure'); throw error; }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
