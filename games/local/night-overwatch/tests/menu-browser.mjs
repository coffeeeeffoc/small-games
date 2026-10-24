import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press, navigateMap, aimAt } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = fileURLToPath(new URL('../reports/2026-10-25-settings/menu/', import.meta.url));
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], context = await browser.newContext({ viewport: { width: 844, height: 390 },
  hasTouch: true, isMobile: true, deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  recordVideo: { dir, size: { width: 844, height: 390 } } });
try {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const click = async id => { await press(page, id, true, false); await page.waitForTimeout(900); };
  await page.goto(base);
  await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && !document.getElementById('night-startup'));
  await page.waitForTimeout(1500);
  assert(!(await snapshot(page)).ui.worldVisible);
  // Keyboard and touch both enter selection before deployment.
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  assert.equal((await snapshot(page)).modal, 'missions'); assert.equal((await snapshot(page)).phase, 'briefing');
  await click('mission:ambush-02');
  let s = await snapshot(page); assert.equal(s.mission.map, 'highland'); assert(s.ui.worldVisible);
  await page.screenshot({ path: `${dir}/selected-highland-844.png` });
  await click('homeMenu'); assert(!(await snapshot(page)).ui.worldVisible);
  await page.screenshot({ path: `${dir}/home-after-selection-844.png` });
  await click('missions'); assert.equal((await snapshot(page)).mission.id, 'ambush-02');
  await click('mission:corridor-01'); await click('start');
  s = await snapshot(page); assert.equal(s.phase, 'playing');
  const target = s.units.find(u => !u.friendly && u.kind === 'turret'); assert(target);
  await navigateMap(page, target, true); await aimAt(page, target, true);
  const fired = (await snapshot(page)).fired;
  await click('fire'); await page.waitForTimeout(3000);
  assert((await snapshot(page)).fired > fired);
  await page.screenshot({ path: `${dir}/battle-844.png` });
  await click('settings'); const stopped = (await snapshot(page)).time;
  await click('flightControls'); await click('altitudeUp'); await click('radiusOut'); await click('rotateRight');
  assert.equal((await snapshot(page)).time, stopped);
  await click('close'); await click('zoomControls'); await click('lensIn'); await click('sensor'); await click('sensor');
  await click('close'); await click('help'); await page.waitForTimeout(1200);
  await click('tab:advanced'); await click('tab:rules'); await click('close'); await click('close');
  await page.waitForTimeout(1800); assert((await snapshot(page)).time > stopped);
  await acceptanceBuild(base); assert.deepEqual(errors, []);
  const video = page.video(); await context.close();
  await writeFile(`${dir}/results.json`, JSON.stringify({ build, errors, video: await video.path(),
    independentHome: true, keyboardSelectsFirst: true, selectedScenePreview: true, rememberedSelection: true,
    actualFire: true, pausedConfiguration: true }, null, 2));
} finally { await browser.close(); }
