import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press } from './flight-browser.mjs';

const base = process.env.NIGHT_URL;
const build = await acceptanceBuild(base);
const dir = new URL('../reports/home-environment/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], result = [];
try {
  for (const [width, height, touch] of [[1366, 768, false], [1920, 1080, false], [844, 390, true], [568, 320, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    page.on('pageerror', e => errors.push(e.message));
    if (width === 1920) await page.route('**/application.*.js', route => route.abort('failed'));
    await page.goto(base);
    if (width === 1920) {
      await page.locator('#night-retry').waitFor({ state: 'visible' });
      await page.screenshot({ path: fileURLToPath(new URL('loading-retry.png', dir)) });
      await page.unroute('**/application.*.js');
      await page.locator('#night-retry').click();
    }
    await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
    await press(page, 'settings', touch);
    assert.equal((await snapshot(page)).modal, 'settings');
    await press(page, 'help', touch);
    assert((await snapshot(page)).modal.startsWith('help'));
    await press(page, 'fullscreen', touch);
    await page.waitForFunction(() => !!document.fullscreenElement);
    await press(page, 'fullscreen', touch);
    await page.waitForFunction(() => !document.fullscreenElement);
    await press(page, 'close', touch);
    assert.equal((await snapshot(page)).modal, 'settings');
    await press(page, 'close', touch);
    let s = await snapshot(page);
    assert.equal(s.modal, 'home'); assert.equal(s.time, 0); assert.equal(s.fired, 0);
    await press(page, 'missions', touch);
    s = await snapshot(page);
    assert.equal(s.modal, 'missions');
    for (const id of ['mission:corridor-01', 'mission:ambush-02', 'mission:patrol-03', 'training', 'start']) {
      const b = s.buttons.find(b => b.id === id);
      assert(b && b.w >= 44 && b.h >= 44 && b.x >= 0 && b.y >= 58 && b.x + b.w <= width && b.y + b.h <= height, `${width}: ${id} reachable`);
    }
    await page.waitForTimeout(300); assert.equal((await snapshot(page)).time, 0);
    await page.screenshot({ path: fileURLToPath(new URL(`home-${width}.png`, dir)) });
    for (const id of ['ambush-02', 'corridor-01']) {
      await press(page, `mission:${id}`, touch);
      await page.waitForFunction(() => __night.snapshot().modelImport !== 'loading');
      assert.equal((await snapshot(page)).phase, 'briefing');
      await press(page, 'start', touch);
      s = await snapshot(page);
      const highland = id === 'ambush-02';
      assert.equal(s.mission.map, highland ? 'highland' : 'valley');
      assert.equal(s.assets.includes('terrain.water'), !highland);
      assert(s.assets.includes('terrain.clouds') && s.assets.includes('terrain.moon'));
      assert.equal(s.buttons.some(b => b.id === 'fire'), touch);
      if (!touch) for (const id of ['pause', 'settings', 'fullscreen', 'weapon0', 'weapon1', 'weapon2']) {
        const b = s.buttons.find(b => b.id === id);
        assert(b.w <= 104 && b.h <= 44, `${width}: ${id} compact`);
      }
      await page.screenshot({ path: fileURLToPath(new URL(`${id}-${width}.png`, dir)) });
      if (width === 1366 && !highland) {
        for (const weapon of [0, 1, 2]) {
          await press(page, `weapon${weapon}`);
          await page.mouse.move(600, 500);
          await page.mouse.down();
          await page.waitForFunction(w => __night.snapshot().lastSound === ['rapid', 'blast', 'heavy'][w] && Math.abs(__night.snapshot().recoil.y) > .01, weapon, { timeout: 3000 });
          result.push({ weapon, recoil: (await snapshot(page)).recoil, sound: (await snapshot(page)).lastSound });
          await page.mouse.up();
        }
        await page.waitForFunction(() => __night.snapshot().effects.fires?.some(f => f.life >= 5 && f.age > 1.2), null, { timeout: 12000 });
        await page.screenshot({ path: fileURLToPath(new URL('heavy-fire.png', dir)) });
        await page.waitForFunction(() => __night.snapshot().effects.lights.length > 0);
      }
      await press(page, 'pause', touch);
      await page.waitForTimeout(100);
      s = await snapshot(page); assert.deepEqual(s.recoil, { x: 0, y: 0 });
      assert(s.buttons.some(b => b.id === 'home'));
      await press(page, 'home', touch);
      s = await snapshot(page);
      assert.equal(s.modal, 'home'); assert.equal(s.time, 0); assert.equal(s.shots.length, 0);
      assert.deepEqual(s.held, []); assert.deepEqual(s.pauses, []);
    }
    result.push({ width, height, touch, homeAndBothMaps: true, settingsHelpFullscreen: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('verification.json', dir), JSON.stringify({ sourceHash: build.sourceHash, result, errors }, null, 2));
  console.log(JSON.stringify({ result, errors }));
} finally { await browser.close(); }
