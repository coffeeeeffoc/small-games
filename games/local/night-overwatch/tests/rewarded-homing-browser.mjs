import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press, navigateMap, aimAt, waitForImpact, assertLayout } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = new URL('../reports/rewarded-homing/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], results = [];
try {
  for (const [width, height, touch] of [[1366, 768, false], [844, 390, true], [568, 320, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    page.on('pageerror', e => errors.push(e.message));
    const capture = async name => page.screenshot({ path: fileURLToPath(new URL(`${width}-${name}.png`, dir)) });
    await page.goto(base);
    await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
    assert.equal((await snapshot(page)).modal, 'home');
    await press(page, 'training', touch); await press(page, 'start', touch);
    assertLayout(await snapshot(page), width, height);
    await press(page, 'homing', touch);
    let s = await snapshot(page);
    assert(s.advert.mock && s.pauses.includes('advert'));
    assert.equal(s.homingAmmo, 0); assert.equal(s.buttons.length, 1);
    assertLayout(s, width, height);
    const frozen = s.time; await page.waitForTimeout(200);
    assert.equal((await snapshot(page)).time, frozen);
    await capture('mock-homing'); await press(page, 'adClose', touch);
    assert.equal((await snapshot(page)).homingAmmo, 1);
    assert.deepEqual((await snapshot(page)).held, []);
    await press(page, 'zoomControls', touch);
    for (const limit of [10, 20, 40, 80, 160]) {
      assertLayout(await snapshot(page), width, height);
      await press(page, 'zoomUpgrade', touch);
      assert.equal((await snapshot(page)).zoomLimit, limit / 2);
      if (limit === 10) await capture('mock-zoom-10');
      await press(page, 'adClose', touch);
      assert.equal((await snapshot(page)).zoomLimit, limit);
    }
    await press(page, 'zoomUpgrade', touch);
    assert(!(await snapshot(page)).advert, 'maximum tier never offers another ad');
    await press(page, 'zoomControls', touch);
    const staticTarget = (await snapshot(page)).units.find(u => !u.friendly && u.kind === 'turret');
    await navigateMap(page, staticTarget, touch);
    // Real keyboard scaling uses the same cap as touch and wheel. No game-state injection.
    for (let i = 0; i < 35; i++) await page.keyboard.press('Equal');
    s = await snapshot(page); assert.equal(s.zoom, 160); assert(s.camera.fov < 1);
    await capture('160x');
    for (let i = 0; i < 35; i++) await page.keyboard.press('Minus');
    for (let i = 0; i < 2; i++) await page.keyboard.press('Equal');
    if (touch) {
      const cdp = await page.context().newCDPSession(page), x = width / 2, y = height * .56;
      const points = gap => [{ x: x - gap, y, id: 1 }, { x: x + gap, y, id: 2 }];
      const before = (await snapshot(page)).zoom;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(25) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(48) });
      await page.waitForTimeout(80);
      assert((await snapshot(page)).zoom > before * 1.5);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.deepEqual((await snapshot(page)).held, []);
      await cdp.detach();
    }
    s = await snapshot(page);
    const target = s.units.find(u => !u.friendly && u.kind === 'light');
    await navigateMap(page, target, touch);
    await aimAt(page, (await snapshot(page)).units.find(u => u.id === target.id), touch);
    await press(page, 'fire', touch);
    s = await snapshot(page);
    const shot = s.shots.find(a => a.guidance);
    assert(shot && shot.guidance.target === target.id); assert.equal(s.homingAmmo, 0);
    await page.waitForFunction(id => __night.snapshot().locks.some(lock => lock.id === id), target.id);
    await page.waitForFunction(id => __night.snapshot().effects.projectiles.some(p => p.id === id), shot.id, { timeout: 10000 });
    await capture('tracking-lock');
    await press(page, 'pause', touch);
    const position = (await snapshot(page)).shotPositions.find(p => p.id === shot.id);
    await page.waitForTimeout(200);
    assert.deepEqual((await snapshot(page)).shotPositions.find(p => p.id === shot.id), position);
    await press(page, 'resume', touch);
    const impact = await waitForImpact(page, shot);
    assert.equal(impact.outcome, 'destroyed');
    assert.equal((await snapshot(page)).units.find(u => u.id === target.id).hp, 0);
    assert.equal((await snapshot(page)).locks.length, 0);
    await capture('hit');
    // Earn and spend two more rounds through the same real touch/mouse flow to reach settlement.
    for (let i = 0; i < 2; i++) {
      await press(page, 'homing', touch); await press(page, 'adClose', touch);
      const enemy = (await snapshot(page)).units.find(u => !u.friendly && u.hp > 0);
      await navigateMap(page, enemy, touch); await aimAt(page, enemy, touch);
      await press(page, 'fire', touch);
      const missile = (await snapshot(page)).shots.find(a => a.guidance);
      assert(missile); await waitForImpact(page, missile);
    }
    await page.waitForFunction(() => __night.snapshot().phase === 'success');
    await capture('settlement'); await press(page, 'retry', touch);
    assert.equal((await snapshot(page)).homingAmmo, 0); assert.equal((await snapshot(page)).zoomLimit, 160);
    await press(page, 'pause', touch); await press(page, 'home', touch);
    assert.equal((await snapshot(page)).modal, 'home');
    await page.reload(); await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
    assert.equal((await snapshot(page)).zoomLimit, 160); assert.equal((await snapshot(page)).homingAmmo, 0);
    results.push({ width, height, touch, trackingHit: target.id, zoomLimit: 160, persistence: true, settlement: true });
    await page.close();
  }
  assert.deepEqual(errors, []); await acceptanceBuild(base);
  await writeFile(new URL('verification.json', dir), JSON.stringify({ build, results, errors, physicalDevice: false, realAdSdk: false }, null, 2));
  console.log(JSON.stringify({ results, errors }));
} finally { await browser.close(); }
