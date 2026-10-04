import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { installDisplay } from '../scripts/display.mjs';
import { installLoading } from '../scripts/loading.mjs';

// Exercise the generated Web shell independently of the Windows-only Creator
// build. Game input/engine rotation is covered by display-modes.mjs.
const directory = await mkdtemp(path.join(os.tmpdir(), 'kart-display-'));
let browser, server;
try {
  await writeFile(path.join(directory, 'index.html'), `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1,minimal-ui=true">
    </head><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" tabindex="0"></canvas></div></div>
    <script src="./fixture.js"></script><script>System.import('./index.js')</script></body></html>`);
  await writeFile(path.join(directory, 'index.js'), `System.import('./application.js');`);
  await writeFile(path.join(directory, 'fullscreen.js'), await readFile(new URL('../scripts/fullscreen.js', import.meta.url)));
  await writeFile(path.join(directory, 'competition-session.js'), '');
  await writeFile(path.join(directory, 'fixture.js'), `
    window.overrides = {};
    const events = new Map(), delegates = [];
    const engine = {
      game: { onPostBaseInitDelegate: { add: fn => delegates.push(fn) },
        once: (name, fn) => events.set(name, fn), off: () => {}, pause: () => {} },
      director: { once: (name, fn) => events.set(name, fn), off: () => {} },
      Director: { EVENT_AFTER_DRAW: 'draw' },
      settings: { overrideSettings: (category, key, value) => { overrides[category + '.' + key] = value; } }
    };
    window.finishLoading = () => { events.get('kart:loaded')(); events.get('draw')(); };
    window.failLoading = () => events.get('kart:load-error')();
    window.System = { import: async name => name === 'cc' ? engine : { Application: class {
      async init() { delegates.forEach(fn => fn()); }
      async start() {}
    } } };
  `);
  await installLoading(directory);
  await installDisplay(directory);
  server = createServer(async (request, response) => {
    const name = new URL(request.url, 'http://local').pathname.slice(1) || 'index.html';
    try {
      response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.jpg') ? 'image/jpeg' : 'text/html; charset=utf-8');
      response.end(await readFile(path.join(directory, name)));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.orientationRequests = [];
    screen.orientation.lock = async mode => { orientationRequests.push(mode); throw new Error('unsupported'); };
  });
  await page.goto(origin);
  await page.waitForFunction(() => overrides['screen.orientation'] === 'landscape');
  assert.equal(await page.evaluate(() => overrides['screen.exactFitScreen']), true);
  await expect(page.locator('#kart-fullscreen')).toBeHidden();
  await expect(page.locator('#kart-rotate')).toHaveCount(0);
  const loading = page.locator('#kart-loading');
  for (const viewport of [{ width: 390, height: 844 }, { width: 305, height: 667 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const box = await loading.boundingBox();
    assert.ok(Math.abs(box.width - viewport.width) < 1 && Math.abs(box.height - viewport.height) < 1);
    const shape = await loading.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
    assert.ok(shape.width > shape.height, 'the loading illustration always uses a landscape canvas');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => failLoading());
  await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible();
  await page.getByRole('button', { name: '重新加载' }).tap();
  await page.waitForFunction(() => overrides['screen.orientation'] === 'landscape');
  await expect(page.getByRole('button', { name: '重新加载' })).toBeHidden();
  await page.evaluate(() => finishLoading());
  await expect(loading).toHaveCount(0);
  await page.evaluate(() => {
    window.invoked = [];
    KartDisplay.setControls({ pause: () => invoked.push('pause'), settings: () => invoked.push('settings') });
    document.getElementById('kart-accessible-pause').focus();
  });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => invoked), ['pause', 'settings']);
  // A real user click invokes the same bridge used by the canvas settings menu.
  await page.evaluate(() => {
    const trigger = document.createElement('button');
    trigger.id = 'test-fullscreen'; trigger.textContent = 'Test fullscreen';
    trigger.addEventListener('click', () => KartDisplay.toggleFullscreen());
    document.body.append(trigger);
  });
  await page.locator('#test-fullscreen').click();
  await expect.poll(() => page.evaluate(() => KartDisplay.getFullscreen())).toBe(true);
  assert.equal(await page.evaluate(() => document.fullscreenElement?.tagName), 'HTML');
  assert.ok((await page.evaluate(() => orientationRequests)).length >= 2);
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => KartDisplay.getFullscreen())).toBe(false);
  await page.evaluate(() => {
    document.documentElement.requestFullscreen = () => Promise.reject(new Error('denied'));
  });
  await page.locator('#test-fullscreen').click();
  await expect(page.locator('#game-display-notice')).toContainText('未允许全屏');
  assert.equal(await page.evaluate(() => KartDisplay.getFullscreen()), false);
  assert.deepEqual(errors, []);
  console.log('PASS: rotated loading at 305/390px, landscape lifecycle configuration, touch retry, accessible controls, HUD fullscreen bridge, external exit and denied orientation/fullscreen fallback');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
