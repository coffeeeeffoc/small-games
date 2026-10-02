import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press } from './flight-browser.mjs';

const base = process.env.NIGHT_URL;
await acceptanceBuild(base);
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 1151, height: 798 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
  await press(page, 'start');
  await page.mouse.move(320, 680);
  const before = (await snapshot(page)).aim;
  await page.mouse.move(320, 780);
  await page.waitForFunction(old => {
    const p = __night.snapshot().aim;
    return Math.hypot(p.x - old.x, p.z - old.z) > 1;
  }, before);
  const after = (await snapshot(page)).aim;
  const screen = await page.evaluate(p => __night.screenPoint(p), after);
  assert(Math.abs(screen.y - 780) < 8, 'reticle follows mouse below the old footer boundary');
  const button = (await snapshot(page)).buttons.find(b => b.id === 'weapon1');
  await page.waitForTimeout(150);
  const heldAim = (await snapshot(page)).aim;
  await page.mouse.move(button.x + button.w / 2, button.y + button.h / 2);
  await page.waitForFunction(x => Math.abs(__night.snapshot().mousePointer.x - x) < 1, button.x + button.w / 2);
  const blockedAim = (await snapshot(page)).aim;
  assert(Math.hypot(blockedAim.x - heldAim.x, blockedAim.z - heldAim.z) < 1,
    'weapon buttons intercept aiming, allowing one queued frame of aircraft motion');
  for (const weapon of [0, 1, 2]) {
    await press(page, `weapon${weapon}`);
    await page.mouse.move(420, 580);
    await page.waitForTimeout(100);
    const fired = (await snapshot(page)).fired;
    await page.mouse.down();
    await page.waitForTimeout(100);
    try {
      assert((await snapshot(page)).fired > fired, `mouse press fires weapon ${weapon}`);
      await page.waitForFunction(w => __night.snapshot().effects.projectiles.some(p => p.weapon === w), weapon, { timeout: 3000 });
      const fx = (await snapshot(page)).effects.projectiles.find(p => p.weapon === weapon);
      assert(fx.width >= 1.5 + weapon * 0.65 && fx.width <= 5);
      assert(fx.length >= 4 + weapon * 1.5 && fx.length <= 12);
      console.log(JSON.stringify({ weapon, width: fx.width, length: fx.length }));
      if (weapon === 2) await page.screenshot({ path: fileURLToPath(new URL('../reports/aim-visibility.png', import.meta.url)) });
    } finally { await page.mouse.up(); }
    await page.waitForTimeout(100);
    assert.deepEqual((await snapshot(page)).held, [], 'mouse release stops firing');
    await page.waitForFunction(() => __night.snapshot().reason === 'ready');
    assert(!(await snapshot(page)).buttons.some(b => b.id === 'fire'), 'mouse mode has no fire button');
  }
  await press(page, 'weapon0');
  await page.mouse.move(420, 580);
  await page.mouse.down();
  const heldStart = (await snapshot(page)).fired;
  await page.waitForFunction(count => __night.snapshot().fired >= count + 2, heldStart);
  await page.mouse.up();
  await page.waitForTimeout(100);
  assert.deepEqual((await snapshot(page)).held, [], 'sustained mouse fire releases');
  await page.close();

  const touchPage = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  touchPage.on('pageerror', e => errors.push(e.message));
  await touchPage.goto(base);
  await touchPage.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
  await press(touchPage, 'start', true);
  const touchFire = (await snapshot(touchPage)).buttons.find(b => b.id === 'fire');
  const cdp = await touchPage.context().newCDPSession(touchPage);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchFire.x + touchFire.w / 2, y: touchFire.y + touchFire.h / 2 }] });
  await touchPage.waitForFunction(() => __night.snapshot().fired > 0 && __night.snapshot().effects.projectiles.length > 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 400, y: 200 }] });
  await touchPage.waitForFunction(() => __night.snapshot().held.length === 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchFired = (await snapshot(touchPage)).fired;
  await touchPage.mouse.move(400, 200);
  await touchPage.waitForFunction(() => __night.snapshot().reason === 'ready');
  await touchPage.mouse.click(400, 200);
  await touchPage.waitForFunction(fired => __night.snapshot().fired > fired, touchFired);
  assert(!(await snapshot(touchPage)).buttons.some(b => b.id === 'fire'), 'switching back to mouse hides FIRE');
  assert.deepEqual((await snapshot(touchPage)).held, []);
  assert.deepEqual(errors, []);
  console.log('PASS: bottom aim, three mouse weapons, hidden desktop fire, sustained fire, touch release and touch-to-mouse switch');
} finally { await browser.close(); }
