import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const siteRoot = process.env.STREET_SITE_ROOT || path.join(gameRoot, 'dist');
const output = path.join(gameRoot, 'docs/design/top-inset-2026-10-16/actual');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://local');
    if (url.pathname === '/frame') return response.writeHead(200, { 'content-type': 'text/html' }).end('<meta name="viewport" content="width=device-width,initial-scale=1"><iframe title="game" src="/" allow="fullscreen" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>');
    const name = url.pathname === '/' ? '/index.html' : url.pathname;
    let file = path.resolve(siteRoot, '.' + name);
    assert(file.startsWith(path.resolve(siteRoot) + path.sep));
    if (name === '/publishing.js') file = path.resolve(gameRoot, '../../../platforms/h5/publishing.js');
    let body = await readFile(file);
    if (name === '/index.html') body = Buffer.from(body.toString().replace(/<script data-competition-service>[\s\S]*?<\/script>/g, ''));
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH });
const checks = [], errors = [];
const snapshot = (scope) => scope.evaluate(async () => (await import('./src/main.js')).getSnapshot());
async function settled(scope) {
  await scope.evaluate(async () => Promise.all(document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
}
async function fullBleed(scope) {
  await settled(scope);
  const result = await scope.evaluate(() => {
    const box = document.querySelector('.app-shell').getBoundingClientRect();
    const topElement = document.elementFromPoint(4, 4);
    return { x: box.x, y: box.y, width: box.width, height: box.height, viewport: [innerWidth, innerHeight], paintedByGame: !!topElement?.closest('.app-shell'), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.equal(result.x, 0); assert.equal(result.y, 0);
  assert.equal(result.width, result.viewport[0]); assert.equal(result.height, result.viewport[1]);
  assert(result.paintedByGame, 'game background reaches the top edge instead of exposing body');
  assert.equal(result.overflow, false);
}
async function protectedControl(scope, selector, { top = true } = {}) {
  const item = scope.locator(selector).first();
  await expect(item).toBeVisible(); await settled(scope);
  const box = await item.boundingBox();
  const safe = await scope.evaluate(() => ({ width: innerWidth, height: innerHeight, left: parseFloat(document.documentElement.style.getPropertyValue('--game-host-left')) || 0, right: parseFloat(document.documentElement.style.getPropertyValue('--game-host-right')) || 0, bottom: parseFloat(document.documentElement.style.getPropertyValue('--game-host-bottom')) || 0, top: (parseFloat(document.documentElement.style.getPropertyValue('--game-host-top')) || 0) + 8 }));
  assert(box.x >= safe.left - 1 && box.x + box.width <= safe.width - safe.right + 1, `${selector} horizontal safe area ${JSON.stringify(box)}`);
  if (top) assert(box.y >= safe.top - 1, `${selector} overlaps host top ${JSON.stringify(box)}`);
  assert(box.y + box.height <= safe.height - safe.bottom + 1, `${selector} below safe bottom ${JSON.stringify(box)}`);
}
async function capture(page, name) { await page.screenshot({ path: path.join(output, name + '.png') }); }
try {
  for (const [width, height, host, framed, dpr] of [[320,568,'ua',false,1],[390,853,'sdk',false,2.4],[844,390,'sdk',false,1],[568,320,'sdk',false,1],[390,844,'browser',false,1],[390,844,'sdk',true,1]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, reducedMotion: 'reduce', userAgent: host === 'ua' ? 'TapTap H5 MiniProgram' : undefined });
    await context.addInitScript((host) => {
      globalThis.SmallGamesPublishingConfig = { platform: host === 'browser' ? 'h5' : 'taptap-h5', adsEnabled: false, adMode: 'off' };
      globalThis.__COMPETITION_CONFIG__ = { competitionEnabled: false, apiUrl: '' };
      if (host === 'sdk') globalThis.tap = {
        getWindowInfo() { return { windowWidth: innerWidth, windowHeight: innerHeight, safeArea: { top: innerWidth > innerHeight ? 0 : 59, left: innerWidth > innerHeight ? 59 : 0, right: innerWidth - (innerWidth > innerHeight ? 34 : 0), bottom: innerHeight - 20 } }; },
        getMenuButtonBoundingClientRect() { return { top: innerWidth > innerHeight ? 12 : 52, bottom: innerWidth > innerHeight ? 44 : 85 }; },
      };
    }, host);
    const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/${framed ? 'frame' : ''}`);
      const scope = framed ? page.frames().find((frame) => frame !== page.mainFrame()) : page;
      await expect(scope.locator('#levels-button')).toBeVisible(); await fullBleed(scope);
      await protectedControl(scope, '#settings-button');
      await capture(page, `home-${width}-${host}${framed ? '-iframe' : ''}`);
      await scope.locator('#settings-button').tap();
      await protectedControl(scope, '#settings-page [data-close]');
      await scope.locator('#settings-page [data-close]').first().tap();
      await scope.locator('#levels-button').tap();
      await protectedControl(scope, '#level-screen .page-head .icon-button');
      await scope.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
      await scope.locator('#start-button').tap();
      await expect.poll(async () => (await snapshot(scope)).phase).toBe('playing');
      await fullBleed(scope); await protectedControl(scope, '#pause-button');
      await protectedControl(scope, '#sprint-button', { top: false });
      const map = await scope.locator('#game-canvas').boundingBox(); assert.equal(map.y, 0);
      const initial = await snapshot(scope);
      const origin = await scope.evaluate(async (p) => (await import('./src/main.js')).worldToScreen(p), initial.cops[0]);
      await page.touchscreen.tap(origin.x, origin.y);
      assert.equal((await snapshot(scope)).selected, 0, 'touch maps to the actual officer after local safe-area layout');
      const destination = initial.nodes.find((p) => Math.hypot(p.x - initial.cops[0].x, p.y - initial.cops[0].y) > 50);
      const point = await scope.evaluate(async (p) => (await import('./src/main.js')).worldToScreen(p), destination);
      await page.touchscreen.tap(point.x, point.y);
      assert((await snapshot(scope)).cops[0].destination, 'touch issues a real movement order');
      await scope.locator('#pause-button').tap();
      const paused = await snapshot(scope); await page.waitForTimeout(120);
      assert.equal((await snapshot(scope)).time, paused.time);
      await protectedControl(scope, '#resume-button');
      await capture(page, `pause-${width}-${host}${framed ? '-iframe' : ''}`);
      await scope.locator('#resume-button').tap();
      await expect.poll(async () => (await snapshot(scope)).phase).toBe('playing');
      await capture(page, `play-${width}-${host}${framed ? '-iframe' : ''}`);
      if (width === 390 && height === 853) {
        await scope.locator('#pause-button').tap(); await scope.locator('#pause-restart').tap();
        await expect(scope.locator('#lose-dialog')).toBeVisible({ timeout: 60000 });
        const failed = await snapshot(scope);
        for (const viewport of [{ width:390,height:853 },{ width:844,height:390 },{ width:568,height:320 }]) {
          await page.setViewportSize(viewport); await fullBleed(scope);
          await protectedControl(scope, '#lose-title'); await protectedControl(scope, '#lose-retry');
          assert.equal((await snapshot(scope)).ticks, failed.ticks, 'orientation keeps the completed round');
          await capture(page, `failure-${viewport.width}`);
        }
        await scope.locator('#lose-retry').tap();
        await expect.poll(async () => (await snapshot(scope)).phase).toBe('playing');
        await scope.locator('#pause-button').tap(); await scope.locator('#pause-dialog [data-home]').tap();
        await expect(scope.locator('#home-screen')).toBeVisible();
      }
      checks.push({ width, height, host, framed, passed: true });
      console.log(`PASS street full bleed ${width}x${height} ${host}${framed ? ' iframe' : ''}`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output,'verification.json'),JSON.stringify({ browser:browser.version(),realDeviceVerified:false,siteRoot,checks },null,2)+'\n');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
