import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { exerciseStandalone } from '../../../../apps/shell-web/scripts/standalone-game-checks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../docs/design/', import.meta.url);
const port = Number(process.env.TOWER_BRAKE_TEST_PORT || 4463);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['server.mjs', '--dist', '--port', String(port), '--host', '127.0.0.1'],
  { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] },
);
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Preview exited ${code}`)));
});
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const errors = [];
const report = {
  browser: await browser.version(),
  viewport: '390 × 844',
  touch: true,
  checks: [],
  errors,
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const snap = () => page.evaluate(() => window.__towerBrake.snapshot());
const cdp = await context.newCDPSession(page);
async function touchDrag(delta, y = 425) {
  const start = delta > 0 ? 45 : 345;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: start, y, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: start + delta, y, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function aimGap() {
  const amount = await page.evaluate(() => {
    const state = window.__towerBrake.getState();
    const gap = state.level.layers[state.nextLayer]?.gap;
    if (!gap) return 0;
    const tau = Math.PI * 2;
    const wrap = (a) => ((a % tau) + tau) % tau;
    const middle = wrap(gap.start + wrap(gap.end - gap.start) / 2);
    return wrap(Math.PI / 2 - middle - state.rotation + Math.PI) - Math.PI;
  });
  if (Math.abs(amount) > 0.005) await touchDrag((-amount / (Math.PI * 1.7)) * 388);
}
try {
  await mkdir(evidence, { recursive: true });
  await page.goto(origin);
  await page.waitForSelector('#home[data-ready="true"]');
  assert.equal(await page.evaluate(() => window.__towerBrake), undefined);
  await page.screenshot({ path: fileURLToPath(new URL('actual-home.png', evidence)) });
  await page.locator('#choose-level').tap();
  assert.equal(await page.locator('[data-level]').count(), 8);
  assert.equal(await page.locator('[data-level]:disabled').count(), 7);
  await page.screenshot({ path: fileURLToPath(new URL('actual-levels.png', evidence)) });
  await page.locator('#levels-home').tap();
  await page.locator('#settings-button').tap();
  await page.locator('[data-skin="amber"]').tap();
  assert.equal(await page.locator('[data-skin="amber"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-skin="mint"]').tap();
  await page.locator('#sound-toggle').tap();
  await page.locator('#settings-home').tap();
  await page.locator('#help-button').tap();
  assert.equal(await page.locator('.help-list li').count(), 3);
  await page.locator('#help-home').tap();
  check('Phone home, eight-route locked selection, help, sound and skins');

  await page.goto(`${origin}/?dev=1`);
  await page.waitForFunction(() => !!window.__towerBrake);
  await page.locator('#start-game').tap();
  await page.waitForTimeout(150);
  const brakeBox = await page.locator('#brake-button').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 320, y: 430, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 320, y: 430, id: 1 },
      { x: brakeBox.x + 35, y: brakeBox.y + 30, id: 2 },
    ],
  });
  const frozen = await snap();
  assert.equal(frozen.charge, 0);
  assert.ok(frozen.brakeLeft > 0);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: 300, y: 430, id: 1 },
      { x: brakeBox.x + 35, y: brakeBox.y + 30, id: 2 },
    ],
  });
  await page.waitForTimeout(130);
  const turned = await snap();
  assert.equal(turned.y, frozen.y);
  assert.equal(turned.v, frozen.v);
  assert.notEqual(turned.rotation, frozen.rotation);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await aimGap();
  check('Two real touch contacts: brake freezes ball while the other thumb rotates');
  await page.waitForFunction(() => window.__towerBrake.getState().nextLayer === 3, {
    timeout: 5000,
  });
  const triple = await snap();
  assert.equal(triple.charge, 1);
  assert.equal(triple.streak, 3);
  await page.locator('#brake-button').tap();
  assert.equal((await snap()).streak, 0);
  await page.screenshot({ path: fileURLToPath(new URL('actual-brake.png', evidence)) });
  await aimGap();
  check('Three uninterrupted passes recharge once; active brake rescues the next dangerous layer');

  await page.locator('#pause-button').tap();
  const paused = await snap();
  await page.waitForTimeout(250);
  const still = await snap();
  assert.equal(still.y, paused.y);
  assert.equal(still.elapsed, paused.elapsed);
  assert.equal(still.brakeLeft, paused.brakeLeft);
  await page.screenshot({ path: fileURLToPath(new URL('actual-pause.png', evidence)) });
  await page.locator('#resume-game').tap();
  const deadline = Date.now() + 18000;
  let aimed = -1;
  while (Date.now() < deadline) {
    const state = await snap();
    if (state.status !== 'playing') break;
    if (state.nextLayer !== aimed) {
      aimed = state.nextLayer;
      await aimGap();
    }
    await page.waitForTimeout(30);
  }
  assert.equal((await snap()).status, 'won');
  await page.waitForSelector('#result-screen:not([hidden])');
  await page.screenshot({ path: fileURLToPath(new URL('actual-win.png', evidence)) });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tower-brake-v1')));
  assert.equal(saved.unlocked, 2);
  assert.ok(Object.keys(saved.best).length === 1);
  check('Pause stops physics and brake timer; real drag inputs reach floor 12 and unlock route 2');

  await page.locator('#result-home').tap();
  assert.equal((await snap()).screen, 'home', 'result return must show home');
  await page.locator('#start-game').tap();
  await aimGap();
  await page.waitForFunction(() => window.__towerBrake.getState().status === 'lost', {
    timeout: 5000,
  });
  assert.equal((await snap()).nextLayer, 3);
  await page.screenshot({ path: fileURLToPath(new URL('actual-failure.png', evidence)) });
  await page.locator('#continue-game').tap();
  assert.equal((await snap()).continued, true);
  assert.equal((await snap()).nextLayer, 0);
  await aimGap();
  await page.waitForFunction(() => window.__towerBrake.getState().status === 'lost', {
    timeout: 5000,
  });
  assert.equal(await page.locator('#continue-game').isVisible(), false);
  check(
    'Danger collision identifies floor 4; continuation returns to the safe checkpoint only once',
  );

  await page.locator('#result-home').tap();
  await page.locator('#start-game').tap();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 280, y: 430, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelled = (await snap()).rotation;
  await page.dispatchEvent('#app', 'pointermove', { pointerId: 1, clientX: 120, clientY: 430 });
  assert.equal((await snap()).rotation, cancelled);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.locator('#pause-screen').isVisible(), true);
  check('Touch cancellation clears drag; losing window focus pauses safely');

  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.locator('#pause-home').tap();
    await page.locator('#start-game').tap();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    const bounds = await page.locator('#brake-button').boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= size.width + 1 &&
        bounds.y + bounds.height <= size.height + 1,
    );
    if (size.width === 844)
      await page.screenshot({ path: fileURLToPath(new URL('actual-landscape.png', evidence)) });
    await page.locator('#pause-button').tap();
  }
  check('Small phone, landscape and desktop preserve play state and reachable controls');

  for (const [query, stored, enabled] of [
    ['', null, false],
    ['?dev=1', null, true],
    ['', '1', true],
    ['?dev=0', '1', false],
  ]) {
    await page.evaluate(
      (value) =>
        value === null ? localStorage.removeItem('dev') : localStorage.setItem('dev', value),
      stored,
    );
    await page.goto(`${origin}/${query}`);
    await page.waitForSelector('#home[data-ready="true"]');
    assert.equal(await page.evaluate(() => window.SmallGamesDev.isEnabled()), enabled);
    assert.equal(await page.evaluate(() => !!window.__towerBrake), enabled);
  }
  await page.goto(`${origin}/?dev=1`);
  await page.waitForFunction(() => !!window.__towerBrake);
  await page.evaluate(() => window.__towerBrake.start(7));
  assert.equal((await snap()).practice, true);
  const persisted = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tower-brake-v1')).unlocked,
  );
  assert.equal(persisted, 2);
  await page.locator('#pause-button').tap();
  await page.locator('#pause-home').tap();
  await page.locator('#start-game').tap();
  assert.equal((await snap()).screen, 'play-screen');
  assert.equal((await snap()).practice, false);
  check('Production dev URL/storage priority and isolated route-8 practice');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${origin}/fixture*`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><main data-game-display-host><iframe title="转塔留一脚刹车" allow="fullscreen" src="${origin}/?dev=0" style="border:0;position:fixed;inset:0;width:100%;height:100%"></iframe></main>`,
    }),
  );
  await page.goto(`${origin}/fixture?dev=1`);
  const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.waitForSelector('#home[data-ready="true"]');
  assert.equal(await frame.evaluate(() => window.SmallGamesDev.isEnabled()), false);
  await exerciseStandalone(frame, 'tower-brake', true);
  check(
    'Production iframe runs the registered Shell touch scenario; child dev=0 overrides parent dev=1',
  );

  await page.goto(`${origin}/?dev=0`);
  await page.locator('#home [data-game-fullscreen]').tap();
  await page.waitForTimeout(150);
  if (await page.evaluate(() => !!document.fullscreenElement)) {
    await page.evaluate(() => document.exitFullscreen());
    check('Complete game enters and exits fullscreen');
  }
  await page.evaluate(() => {
    document.querySelector('[data-game-display-host]').requestFullscreen = () =>
      Promise.reject(new Error('test denied'));
  });
  await page.locator('#home [data-game-fullscreen]').tap();
  await page.waitForSelector('#game-display-notice:not([hidden])');
  await page.locator('#start-game').tap();
  assert.equal(await page.locator('#play-screen').isVisible(), true);
  check('Fullscreen rejection keeps the normal viewport playable');

  const blocked = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  await blocked.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked storage');
      },
    }),
  );
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', (error) => errors.push(error.message));
  await blockedPage.goto(origin);
  await blockedPage.locator('#start-game').tap();
  assert.equal(await blockedPage.locator('#play-screen').isVisible(), true);
  await blocked.close();
  check('Storage denied: home, controls and local play still work');
  assert.deepEqual(errors, []);
  report.passed = true;
} catch (error) {
  console.error(
    'Browser failure state:',
    await page.evaluate(() => window.__towerBrake?.snapshot()?.screen),
  );
  await page.screenshot({ path: '/tmp/tower-browser-failure.png' });
  throw error;
} finally {
  await writeFile(
    new URL('browser-evidence.json', evidence),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
  server.kill();
}
