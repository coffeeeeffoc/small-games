import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { acceptanceBuild, assertLayout, snapshot, press, navigateMap, aimAt, waitForImpact } from './flight-browser.mjs';

const base = process.env.NIGHT_URL;
const build = await acceptanceBuild(base);
const dir = new URL('../reports/interaction-overhaul/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], results = [];
try {
  const startup = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await startup.route('**/application.*.js', route => route.abort('failed'));
  await startup.goto(base);
  await startup.locator('#night-retry').waitFor({ state: 'visible' });
  assert.equal(await startup.locator('#night-startup').getAttribute('data-state'), 'error');
  await startup.screenshot({ path: new URL('startup-failure.png', dir).pathname.replace(/^\/([A-Z]:)/, '$1') });
  await startup.unroute('**/application.*.js');
  await startup.locator('#night-retry').click();
  await startup.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
  const splash = await startup.evaluate(async () => {
    const cc = await System.import('cc');
    return { totalTime: cc.settings.querySettings('splashScreen', 'totalTime'), logo: cc.settings.querySettings('splashScreen', 'logo').type };
  });
  assert.deepEqual(splash, { totalTime: 0, logo: 'none' }, 'Actual runtime disables the default engine splash');
  await startup.close();
  for (const [width, height, touch] of [[1366, 768, false], [844, 390, true], [568, 320, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      deviceScaleFactor: touch ? 2 : 1 });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready');
    await page.waitForFunction(() => !document.getElementById('night-startup') || document.getElementById('night-startup').hidden);
    await press(page, 'start', touch);
    await press(page, 'settings', touch);
    let state = await snapshot(page);
    assert.equal(state.modal, 'settings');
    assertLayout(state, width, height);
    const stopped = state.time;
    await page.waitForTimeout(300);
    assert.equal((await snapshot(page)).time, stopped, 'Settings suspend simulation');
    const mute = state.ui.muted;
    await press(page, 'sound', touch);
    assert.equal((await snapshot(page)).ui.muted, !mute);
    await press(page, 'effects', touch);
    await press(page, 'effects', touch);
    await press(page, 'help', touch);
    assert((await snapshot(page)).modal.startsWith('help'));
    await press(page, 'close', touch);
    assert.equal((await snapshot(page)).modal, 'settings', 'Help returns to settings');
    await press(page, 'close', touch);
    await press(page, 'pause', touch);
    state = await snapshot(page);
    assert.equal(state.modal, 'pause');
    assert(!state.buttons.some(b => ['sound', 'effects', 'help'].includes(b.id)), 'Pause has no settings row');
    assert(state.buttons.some(b => b.id === 'fullscreen'));
    assertLayout(state, width, height);
    await press(page, 'fullscreen', touch);
    await page.waitForFunction(() => !!document.fullscreenElement);
    await press(page, 'fullscreen', touch);
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal((await snapshot(page)).modal, 'pause', 'Fullscreen preserves pause');
    await page.screenshot({ path: new URL(`pause-${width}.png`, dir).pathname.replace(/^\/([A-Z]:)/, '$1') });
    await press(page, 'resume', touch);
    state = await snapshot(page);
    const initialZoom = state.zoom, fired = state.fired, selected = state.selected;
    if (!touch) {
      await page.mouse.move(width / 2, height / 2);
      await page.mouse.wheel(0, -150);
      await page.waitForTimeout(120);
      assert((await snapshot(page)).zoom > initialZoom, 'Wheel up zooms in');
      await page.mouse.wheel(0, 150);
      await page.waitForTimeout(120);
      assert(Math.abs((await snapshot(page)).zoom - initialZoom) < 0.02, 'Wheel down zooms out');
      await page.keyboard.press('Equal');
      assert((await snapshot(page)).zoom > initialZoom, 'Keyboard + zooms');
      await page.keyboard.press('Minus');
    } else {
      const cdp = await page.context().newCDPSession(page);
      const x = width * 0.48, y = height * 0.56;
      const points = (gap) => [{ x: x - gap, y, id: 1 }, { x: x + gap, y, id: 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(55) });
      await page.waitForTimeout(120);
      assert((await snapshot(page)).zoom > initialZoom * 1.5, 'Spreading two fingers zooms in');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(22) });
      await page.waitForTimeout(120);
      assert((await snapshot(page)).zoom < initialZoom, 'Pinching zooms out');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await cdp.detach();
    }
    state = await snapshot(page);
    assert.equal(state.selected, selected, 'Zoom does not change weapons');
    assert.equal(state.fired, fired, 'Zoom and cancel never fire');
    assert.deepEqual(state.held, []);
    await press(page, 'settings', touch);
    await page.screenshot({ path: new URL(`settings-${width}.png`, dir).pathname.replace(/^\/([A-Z]:)/, '$1') });
    await press(page, 'close', touch);
    await page.screenshot({ path: new URL(`play-${width}.png`, dir).pathname.replace(/^\/([A-Z]:)/, '$1') });
    if (!touch) {
      const target = (await snapshot(page)).units.find(u => !u.friendly && u.kind === 'turret');
      await press(page, 'weapon2');
      await navigateMap(page, target);
      await aimAt(page, target);
      await page.keyboard.press('Space');
      const shot = (await snapshot(page)).shots.at(-1);
      assert(shot, 'Fire produces an actual projectile');
      const impact = await waitForImpact(page, shot);
      await page.waitForFunction((time) => __night.snapshot().time >= time + 6, impact.time, { timeout: 20000 });
      const after = await snapshot(page);
      assert(after.effects.impacts.some(e => e.id === impact.id && e.age >= 6), 'Impact smoke remains after six seconds');
      assert(after.wrecks.some(v => v.id === target.id && v.wreck), 'Destroyed vehicle has a wreck mesh');
      assert(after.effects.smoke.some(e => e.id === target.id && e.kind === 'wreck'), 'Wreck continues smoking');
      await page.screenshot({ path: new URL('wreck-smoke.png', dir).pathname.replace(/^\/([A-Z]:)/, '$1') });
      results.push({ width, height, smokeAge: after.effects.impacts.find(e => e.id === impact.id)?.age });
    } else results.push({ width, height, pinchZoom: state.zoom });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await acceptanceBuild(base);
  await writeFile(new URL('interaction-results.json', dir), JSON.stringify({ build, results, errors }, null, 2));
  console.log(JSON.stringify({ build, results, errors }));
} finally { await browser.close(); }
