import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../docs/qa/', import.meta.url);
await mkdir(evidence, { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4189'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Server exited ${code}`)));
  server.stdout.once('data', resolve);
});
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const report = {
  environment:
    'Chromium desktop with mobile viewport + CDP touch simulation; not physical device QA',
  checks: [],
  errors: [],
};
const origin = 'http://127.0.0.1:4189';
const snapshot = (page) => page.evaluate(() => window.tetracubeSnapshot());
const phase = (page, name) => page.waitForFunction((p) => document.body.dataset.phase === p, name);
const idle = (page) => page.waitForFunction(() => !window.tetracubeSnapshot().animating);
const ready = (page) => page.locator('#app[data-ready="true"]').waitFor();

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(origin);
  await ready(page);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-home.png', evidence)) });
  await page.locator('#help-home').tap();
  await phase(page, 'help');
  await page.locator('#help-back').tap();
  await phase(page, 'home');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('tetracube.save.v1')),
    null,
    'Opening help must not manufacture a saved run',
  );
  await page.locator('#start-game').tap();
  await phase(page, 'playing');
  await page.locator('#skip-tutorial').tap();
  await page.locator('[data-move="left"]').tap();
  for (const plane of ['XY', 'XZ', 'YZ']) await page.locator(`[data-rotate="${plane}"]`).tap();
  await page.locator('#hard-drop').tap();
  await idle(page);
  assert.equal((await snapshot(page)).game.placed, 1);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-play.png', evidence)) });
  report.checks.push('Touch home/help/start, three rotation buttons, movement and hard drop');

  const cdp = await context.newCDPSession(page);
  const button = await page.locator('[data-move="right"]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: button.x + 20, y: button.y + 20, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForFunction(() => window.tetracubeSnapshot().input.held === 0);
  const beforeCamera = (await snapshot(page)).camera;
  const canvas = await page.locator('#game-canvas').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: canvas.x + 100, y: canvas.y + 160, id: 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: canvas.x + 170, y: canvas.y + 180, id: 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForFunction(() => !window.tetracubeSnapshot().input.dragging);
  assert.notDeepEqual((await snapshot(page)).camera, beforeCamera);
  for (const view of ['top', 'front', 'side', 'iso'])
    await page.locator(`[data-view="${view}"]`).tap();
  report.checks.push('CDP touch camera drag, camera presets and pointer-cancel cleanup');

  for (const direction of ['0,-1', '0,1', '1,-1', '1,1', '2,1', '2,-1']) {
    await page.locator('#gravity-open').tap();
    await phase(page, 'gravity');
    await page.locator(`[data-gravity="${direction}"]`).tap();
    await idle(page);
    const [axis, sign] = direction.split(',').map(Number);
    assert.deepEqual((await snapshot(page)).game.gravity, { axis, sign });
    assert.equal((await snapshot(page)).game.status, 'playing');
  }
  report.checks.push('Six gravity directions remain playable and retain active tetracube');
  await page.locator('#pause-game').tap();
  await phase(page, 'paused');
  const paused = (await snapshot(page)).game;
  await page.waitForTimeout(1800);
  assert.deepEqual((await snapshot(page)).game, paused);
  await page.locator('#resume-game').tap();
  await page.locator('#pause-game').tap();
  await page.locator('#home-game').tap();
  const stored = await page.evaluate(() => localStorage.getItem('tetracube.save.v1'));
  await page.reload();
  await ready(page);
  await page.locator('#help-home').tap();
  await page.locator('#help-back').tap();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('tetracube.save.v1')),
    stored,
    'Home help preserves prior game',
  );
  await page.locator('#continue-game').tap();
  assert.equal((await snapshot(page)).game.placed, 1);
  report.checks.push('Pause stops simulation; return/reload/help/continue preserves saved game');

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const bounds = await page.locator('#hard-drop').boundingBox();
    assert(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width + 1 &&
        bounds.y + bounds.height <= viewport.height + 1,
      'Primary touch controls fit viewport',
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    await page.screenshot({
      path: fileURLToPath(new URL(`play-${viewport.width}x${viewport.height}.png`, evidence)),
    });
  }
  report.checks.push(
    '320×640, 390×844, 844×390 and 1440×1000 responsive layouts; resize preserves game',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/?dev=1`);
  await ready(page);
  const beforeDebugSave = await page.evaluate(() => localStorage.getItem('tetracube.save.v1'));
  await page.getByRole('button', { name: '开发者调试', exact: true }).tap();
  await page.locator('[data-dev-action="cascade"]').tap();
  await page.locator('[data-close]').tap();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('tetracube.save.v1')),
    beforeDebugSave,
    'Developer fixture never overwrites normal save',
  );
  await page.locator('#gravity-open').tap();
  await page.locator('[data-gravity="2,-1"]').tap();
  await idle(page);
  let result = await snapshot(page);
  assert.equal(result.game.lines, 2);
  assert.equal(result.game.bestCombo, 2);
  assert.equal(result.game.board.length, 0);
  await page.screenshot({ path: fileURLToPath(new URL('mobile-combo.png', evidence)) });
  report.checks.push(
    'Real gravity control resolves fixture into two sequential clears and Combo ×2',
  );

  await page.getByRole('button', { name: '开发者调试', exact: true }).tap();
  await page.locator('[data-dev-action="danger"]').tap();
  await page.locator('[data-close]').tap();
  await phase(page, 'danger');
  await page.locator('#rescue-game').tap();
  await page.locator('[data-gravity="2,1"]').tap();
  await idle(page);
  await phase(page, 'playing');
  assert.equal((await snapshot(page)).rescueUsed, true);
  await page.getByRole('button', { name: '开发者调试', exact: true }).tap();
  await page.locator('[data-dev-action="danger"]').tap();
  await page.locator('[data-close]').tap();
  await page.locator('#end-game').tap();
  await phase(page, 'over');
  await page.screenshot({ path: fileURLToPath(new URL('mobile-result.png', evidence)) });
  await page.locator('#retry-game').tap();
  await phase(page, 'playing');
  report.checks.push('Danger → gravity rescue → playing and danger → result → retry');
  await context.close();

  const blocked = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('disabled');
      },
    });
  });
  const deniedPage = await blocked.newPage();
  deniedPage.on('pageerror', (error) => report.errors.push(error.message));
  await deniedPage.goto(origin);
  await ready(deniedPage);
  await deniedPage.locator('#start-game').tap();
  await deniedPage.locator('#hard-drop').tap();
  await idle(deniedPage);
  assert.equal((await snapshot(deniedPage)).game.placed, 1);
  report.checks.push('Storage unavailable: start and play continue normally');
  await blocked.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await browser.close();
  server.kill();
  await writeFile(new URL('browser-report.json', evidence), JSON.stringify(report, null, 2) + '\n');
}
console.log(`Tetracube browser: ${report.checks.length} flows passed; no page errors.`);
