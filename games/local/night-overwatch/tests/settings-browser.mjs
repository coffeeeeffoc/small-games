import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, assertLayout, snapshot, press, navigateMap, aimAt, waitForImpact } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = fileURLToPath(new URL('../reports/2026-10-25-settings/', import.meta.url));
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], results = [];
const combat = s => ({ time: s.time, remaining: s.remaining, units: s.units, shots: s.shots,
  shotPositions: s.shotPositions, guns: s.guns, progress: s.progress, fired: s.fired, buff: s.buff });
try {
  for (const [width, height] of [[844, 390], [568, 320], [1366, 768], [390, 844]]) {
    const touch = width < 1000, context = await browser.newContext({ viewport: { width, height },
      hasTouch: touch, isMobile: touch, deviceScaleFactor: 1,
      ...(touch ? { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' } : {}),
      ...(width === 844 ? { recordVideo: { dir, size: { width, height } } } : {}) });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const click = id => press(page, id, touch, false);
    const capture = async name => {
      const s = await snapshot(page); assertLayout(s, s.ui.width, s.ui.height);
      await page.screenshot({ path: `${dir}/${name}-${width}.png` });
    };
    await page.goto(base);
    await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && !document.getElementById('night-startup'));
    await page.waitForFunction(() => __night.snapshot().ui.homeArtworkReady);
    assert(!(await snapshot(page)).ui.worldVisible);
    assert(!(await snapshot(page)).buttons.some(b => b.id === 'start'));
    await capture('home');
    await click('help'); await capture('guide-basic');
    if (width !== 390) {
      await page.mouse.move(width / 2, height / 2); await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(150); assert((await snapshot(page)).scroll > 0);
      await capture('guide-scroll');
    }
    await click('tab:advanced'); await capture('guide-flight');
    await click('tab:rules'); await click('language'); await capture('guide-en');
    await click('language'); await click('close'); await click('missions'); await capture('missions');
    assert((await snapshot(page)).ui.worldVisible);
    await click('homeMenu'); assert(!(await snapshot(page)).ui.worldVisible);
    await click('missions'); await click('start');
    // Create a real projectile first, so the pause check cannot pass on an empty scene.
    if (!touch) await page.keyboard.press('Space');
    else { await click('fire'); }
    await click('settings'); await capture('settings');
    const stopped = combat(await snapshot(page));
    await click('flightControls'); await capture('flight-before');
    const projections = () => page.evaluate(() => [{ x: -40, z: -25 }, { x: 0, z: 0 }, { x: 40, z: 25 }].map(p => __night.screenPoint(p)));
    for (const id of ['altitudeUp', 'altitudeDown', 'radiusOut', 'radiusIn', 'rotateRight', 'rotateLeft', 'orbitLeft', 'orbitRight']) {
      const before = await snapshot(page), points = await projections();
      await click(id); const after = await snapshot(page), next = await projections();
      assert.equal(after.modal, 'settings:flight'); assert.deepEqual(combat(after), stopped, id);
      assert(next.some((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y) > .25), `${id}: real projection changes before resume`);
      if (id.startsWith('altitude')) assert.equal(after.aircraft.altitude - before.aircraft.altitude, id === 'altitudeUp' ? 20 : -20);
      if (id.startsWith('radius')) assert.equal(after.aircraft.radius - before.aircraft.radius, id === 'radiusOut' ? 20 : -20);
      if (id.startsWith('orbit')) assert.equal(after.aircraft.direction, id === 'orbitLeft' ? -1 : 1);
      await capture(id);
    }
    await click('locate'); await click('close'); await click('zoomControls');
    const zoom = await snapshot(page);
    await click('lensIn'); const magnified = await snapshot(page);
    assert(magnified.zoom > zoom.zoom && magnified.camera.fov < zoom.camera.fov);
    assert.deepEqual(combat(magnified), stopped); await capture('zoom');
    await click('lensOut'); assert(Math.abs((await snapshot(page)).zoom - zoom.zoom) < .0001);
    await click('sensor'); assert((await snapshot(page)).thermal !== zoom.thermal); await capture('thermal');
    await click('sensor'); await click('effects'); assert((await snapshot(page)).ui.reducedEffects); await capture('effects-reduced');
    await click('effects'); await page.waitForTimeout(300);
    assert.deepEqual(combat(await snapshot(page)), stopped);
    if (width === 1366) {
      await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(120);
      const frozen = await snapshot(page);
      await page.keyboard.press('PageUp'); await page.keyboard.press('Equal');
      const blocked = await snapshot(page);
      assert.deepEqual(blocked.aircraft, frozen.aircraft); assert.equal(blocked.zoom, frozen.zoom);
      await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(120);
    }
    await click('close'); await click('sound'); assert((await snapshot(page)).ui.muted); await capture('muted');
    await click('language'); await capture('settings-en'); await click('language');
    await click('help'); await capture('guide-battle'); await click('close');
    await click('home'); await capture('exit'); await click('exitCancel');
    await page.waitForTimeout(250); assert((await snapshot(page)).time > stopped.time);
    await capture('battle');
    // Freeze an actual explosion and compare scene pixels, excluding the settings panel.
    if (!touch) {
      const target = (await snapshot(page)).units.find(u => !u.friendly && u.kind === 'turret');
      await press(page, 'weapon2'); await navigateMap(page, target); await aimAt(page, target);
      await page.keyboard.press('Space'); const shot = (await snapshot(page)).shots.at(-1);
      assert(shot); await waitForImpact(page, shot);
      await click('settings'); await click('zoomControls');
      const fullState = await snapshot(page), clip = { x: 0, y: 58, width: 750, height: height - 58 };
      assert(fullState.effects.impacts.length > 0);
      const full = await page.screenshot({ path: `${dir}/smoke-full.png`, clip });
      await click('effects'); const low = await page.screenshot({ path: `${dir}/smoke-reduced.png`, clip });
      assert.deepEqual(combat(await snapshot(page)), combat(fullState));
      assert(!full.equals(low), 'effect setting changes actual frozen scene pixels');
      await click('effects'); await click('resume');
    }
    await click('settings'); await click('zoomControls'); await click('effects'); await click('close');
    await page.reload();
    await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && !document.getElementById('night-startup'));
    const saved = await snapshot(page); assert(saved.ui.muted && saved.ui.reducedEffects, 'preferences persist');
    const video = page.video(); await context.close();
    results.push({ width, height, pausedProjection: true, frozenBattle: true, persisted: true, video: video && await video.path() });
  }
  assert.deepEqual(errors, []); await acceptanceBuild(base);
  await writeFile(`${dir}/results.json`, JSON.stringify({ build, results, errors }, null, 2));
  console.log(JSON.stringify({ build, results, errors }));
} finally { await browser.close(); }
