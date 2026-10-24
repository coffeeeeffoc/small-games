import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, assertLayout, aimAt, navigateMap } from './flight-browser.mjs';

const base = process.env.NIGHT_URL;
const build = await acceptanceBuild(base);
const dir = fileURLToPath(new URL('../reports/2026-10-24-flow/', import.meta.url));
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const report = { build, checks: [], errors: [], captures: [], fixtures: 'Local saved unlocks; completed rewarded-provider fixture only for supply UI. No simulation state writes.' };
try {
  for (const [width, height, touch] of [[1366, 768, false], [844, 390, true], [568, 320, true], [390, 844, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1,
      ...(width === 844 ? { recordVideo: { dir, size: { width, height } } } : {}) });
    await context.addInitScript(() => {
      localStorage.setItem('night-overwatch-coach-v2', 'done');
      localStorage.setItem('night-overwatch-progress-v1', JSON.stringify({ version: 1,
        cleared: ['corridor-01', 'ambush-02', 'patrol-03', 'operation-004', 'operation-005'] }));
      globalThis.SmallGamesRewardAds = { available: true, offer: async () => ({ status: 'completed' }) };
    });
    const page = await context.newPage(), recordingStart = Date.now(), cdp = await context.newCDPSession(page);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('requestfailed', request => report.errors.push(request.url() + ': ' + request.failure()?.errorText));
    // Creator rotates its logical landscape canvas inside portrait browser viewports.
    const point = (x, y) => page.evaluate(({ x, y }) => {
      const canvas = document.querySelector('canvas'), r = canvas.getBoundingClientRect(), s = __night.snapshot();
      const rotated = r.height > r.width && s.ui.width > s.ui.height;
      return rotated ? { x: r.right - y / s.ui.height * r.width, y: r.top + x / s.ui.width * r.height }
        : { x: r.left + x / s.ui.width * r.width, y: r.top + y / s.ui.height * r.height };
    }, { x, y });
    const hit = async id => {
      const s = await snapshot(page), b = s.buttons.find(b => b.id === id);
      assert(b, `${width}: missing ${id} in ${s.modal}`);
      const p = await point(b.x + b.w / 2, b.y + b.h / 2);
      if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(140);
    };
    const capture = async name => {
      const s = await snapshot(page); assertLayout(s, s.ui.width, s.ui.height);
      assert(!s.buttons.some(b => /fullscreen/i.test(b.id)));
      report.captures.push({ width, name, seconds: (Date.now() - recordingStart) / 1000 });
      await page.screenshot({ path: `${dir}/${name}-${width}.png` });
    };
    await page.goto(base + '?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && !document.getElementById('night-startup'));
    if (width < height) {
      await capture('orientation');
      assert((await snapshot(page)).pauses.includes('orientation'));
      await page.setViewportSize({ width: height, height: width }); await page.waitForTimeout(400);
      await hit('start'); await hit('pause'); const time = (await snapshot(page)).time;
      await page.setViewportSize({ width, height }); await page.waitForTimeout(400);
      assert.equal((await snapshot(page)).time, time);
      await page.setViewportSize({ width: height, height: width }); await page.waitForTimeout(400);
      assert.equal((await snapshot(page)).modal, 'pause'); await hit('resume');
      assert.deepEqual((await snapshot(page)).held, []);
      report.checks.push({ width, height, orientationPause: true, manualPausePreserved: true });
      await context.close(); continue;
    }
    await capture('home'); await hit('missions'); await capture('missions'); await hit('homeMenu');
    await hit('start');
    let s = await snapshot(page); assert.equal(s.light, 'day'); assert.equal(s.mission.total, 4); assert.equal(s.selected, 1);
    assert(s.radioPlaying, 'local spoken intro plays after the start gesture');
    await capture('day');
    if (touch) {
      const origin = await point(s.ui.width * .42, s.ui.height * .53);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 7, ...origin }] });
      for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 7, x: origin.x + i, y: origin.y + i / 2 }] });
      const before = await page.evaluate(() => __night.screenPoint(__night.snapshot().aim));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => __night.screenPoint(__night.snapshot().aim));
      assert(Math.hypot(before.x - after.x, before.y - after.y) < 2, 'release preserves the offset reticle');
      assert.deepEqual((await snapshot(page)).held, []);
    }
    await hit('pause'); await capture('pause');
    s = await snapshot(page); assert(!s.radioPlaying); const frozen = s.time;
    await hit('settings'); await capture('settings'); await hit('help'); await capture('help');
    assert.equal((await snapshot(page)).time, frozen);
    await hit('close'); await hit('close');
    await hit('supply'); await capture('supply-offer'); await hit('reward:rate');
    await capture('supply-choice'); await hit('supplyWatch'); await capture('support-countdown');
    await page.waitForFunction(() => __night.snapshot().resumeCountdown === 0);
    assert.equal((await snapshot(page)).buff.kind, 'rate');
    if (width === 844) {
      const enemy = (await snapshot(page)).units.find(u => !u.friendly && u.hp > 0);
      await navigateMap(page, enemy, true); await aimAt(page, enemy, true, cdp);
      const before = await snapshot(page); await hit('fire');
      await page.waitForFunction(id => __night.snapshot().units.find(u => u.id === id)?.hp < 90, enemy.id, { timeout: 15000 });
      assert((await snapshot(page)).fired > before.fired);
      await capture('impact');
      await page.waitForFunction(() => !!__night.snapshot().priority, null, { timeout: 25000 });
      await capture('priority'); await hit('priority');
      assert.deepEqual((await snapshot(page)).held, []);
    }
    await hit('pause'); await hit('home'); await hit('missions'); await hit('missionsNext');
    await hit('mission:operation-004'); await hit('start'); assert.equal((await snapshot(page)).light, 'dusk');
    await hit('pause'); await hit('home'); await hit('missions');
    await hit('mission:operation-006'); await hit('start');
    await page.waitForFunction(() => __night.snapshot().modelImport === 'loaded');
    assert.equal((await snapshot(page)).light, 'night'); await capture('night');
    await hit('flightControls'); await hit('sensor'); await hit('flightControls'); await capture('thermal');
    assert.equal((await snapshot(page)).thermal, true);
    await hit('pause'); assert.equal((await snapshot(page)).radioPlaying, false);
    report.checks.push({ width, height, touch, layout: true, dayDuskNight: true, radioLifecycle: true, relativeRelease: touch, supplyFixture: true });
    const video = page.video(); await context.close();
    if (video) await video.saveAs(`${dir}/gameplay-source.webm`);
  }
  assert.deepEqual(report.errors, []);
  await acceptanceBuild(base);
} finally {
  await writeFile(`${dir}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report));
