import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { sourceHash } from '../scripts/artifact.mjs';
import {
  missionReplay,
  friendlyFailure,
  waitForImpact,
  evidenceDirectory,
  acceptanceBuild,
} from './flight-browser.mjs';
const base = process.env.NIGHT_URL || 'http://localhost:4318';
const build = await acceptanceBuild(base);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [],
  warnings = [],
  report = {};
const evidence = pathToFileURL(evidenceDirectory('browser') + '/');
await mkdir(evidence, { recursive: true });
report.build = build;
report.base = base;
const snapshot = (p) => p.evaluate(() => globalThis.__night.snapshot());
const screenshot = (p, name) =>
  p.screenshot({ path: fileURLToPath(new URL(name + '.png', evidence)) });
async function open(width, height, touch = false) {
  const page = await browser.newPage({
    viewport: { width, height },
    recordVideo: process.env.NIGHT_RECORD
      ? { dir: fileURLToPath(evidence), size: { width, height } }
      : undefined,
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: touch ? 2 : 1,
    userAgent: touch
      ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
      : undefined,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      if (m.text().includes('touchcancel event with cancelable=false')) warnings.push(m.text());
      else errors.push(m.text());
    }
  });
  await page.goto(base);
  await page.waitForFunction(
    () =>
      globalThis.__night &&
      globalThis.__night.snapshot().modelImport !== 'loading' &&
      globalThis.__night.snapshot().audio !== 'loading',
  );
  await page.waitForFunction(() => globalThis.__night?.snapshot().buttons.length > 0);
  return page;
}
async function button(p, id, touch = false) {
  let s = await snapshot(p);
  if (!s.buttons.some((b) => b.id === id) && s.buttons.some((b) => b.id === 'flightControls')) {
    await button(p, 'flightControls', touch);
    s = await snapshot(p);
  }
  const b = s.buttons.find((b) => b.id === id);
  assert(b, 'visible button ' + id);
  if (touch) await p.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2);
  else await p.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await p.waitForTimeout(70);
}
async function aim(p, point) {
  const q = await p.evaluate((p) => __night.screenPoint(p), point);
  await p.mouse.move(q.x, q.y);
  return q;
}
const desktopWin = (p) => missionReplay(p);
const mobileWin = (p) => missionReplay(p, { touch: true });

try {
  if (!process.env.NIGHT_TOUCH_ONLY) {
    const p = await open(1366, 768);
    assert.equal((await snapshot(p)).modelImport, 'loaded');
    assert.equal((await snapshot(p)).audio, 'ready');
    report.initialTransfer = await p.evaluate(() => ({
      bytes: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0),
      requests: performance.getEntriesByType('resource').length,
    }));
    await screenshot(p, 'desktop-briefing');
    await button(p, 'start');
    await p.keyboard.press('p');
    await p.waitForTimeout(60);
    await p.keyboard.press('h');
    const before = await snapshot(p);
    console.log('nested pause', before.pauses);
    await p.waitForTimeout(250);
    assert.equal((await snapshot(p)).time, before.time);
    await button(p, 'tab:advanced');
    await p.mouse.move(650, 350);
    await p.mouse.wheel(0, 9000);
    await p.waitForTimeout(100);
    const help = await snapshot(p);
    assert.equal(help.scroll, help.scrollMax);
    assert(help.scrollMax > 0);
    assert(help.buttons.some((b) => b.id === 'fullscreen'));
    await screenshot(p, 'desktop-help-last');
    await button(p, 'close');
    console.log('closed help', (await snapshot(p)).pauses);
    assert((await snapshot(p)).pauses.includes('manual'));
    await p.keyboard.press('p');
    await p.waitForTimeout(60);
    assert.equal((await snapshot(p)).pauses.length, 0);
    await p.keyboard.press('3');
    const heavyAmmo = (await snapshot(p)).guns[2].ammo;
    await aim(p, { x: -38, z: -22 });
    await p.mouse.down();
    await p.waitForTimeout(3400);
    assert.equal((await snapshot(p)).guns[2].ammo, heavyAmmo - 1);
    await p.mouse.up();
    // Lead the moving rescue vehicle using the real range-dependent flight time.
    const airborne = (await snapshot(p)).shots;
    if (airborne.length) await waitForImpact(p, airborne.at(-1));
    await friendlyFailure(p);
    report.friendlyFailure = {
      phase: (await snapshot(p)).phase,
      friendlyDamage: (await snapshot(p)).friendlyDamage,
    };
    assert((await snapshot(p)).buttons.some((b) => b.id === 'fullscreen'));
    await screenshot(p, 'friendly-fire-failure');
    await button(p, 'retry');
    await p.keyboard.press('t');
    await p.keyboard.press('v');
    await screenshot(p, 'desktop-daylight');
    await p.keyboard.press('v');
    // Zoom preserves the world aim and does not remap in-flight shells.
    const worldAim = (await snapshot(p)).aim;
    await p.keyboard.press('x');
    assert.deepEqual((await snapshot(p)).aim, worldAim);
    await p.keyboard.press('z');
    report.desktopWin = await desktopWin(p);
    await screenshot(p, 'desktop-success');
    console.log('Desktop full mission passed');
    await p.close();
    if (p.video())
      await p.video().saveAs(fileURLToPath(new URL('desktop-complete.webm', evidence)));
  }
  for (const [w, h] of [
    [667, 375],
    [844, 390],
  ]) {
    const m = await open(w, h, true);
    await button(m, 'start', true);
    await button(m, 'help', true);
    await button(m, 'tab:advanced', true);
    await screenshot(m, `mobile-${w}-help-first`);
    const cdp = await m.context().newCDPSession(m);
    let s = await snapshot(m);
    for (let i = 0; i < 9 && s.scroll < s.scrollMax; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 1, x: w / 2, y: h * 0.64 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 1, x: w / 2, y: h * 0.34 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await m.waitForTimeout(40);
      s = await snapshot(m);
    }
    assert.equal(s.scroll, s.scrollMax);
    await screenshot(m, `mobile-${w}-help-last`);
    await button(m, 'close', true);
    await button(m, 'weapon0', true);
    s = await snapshot(m);
    const fire = s.buttons.find((b) => b.id === 'fire'),
      fp = { id: 2, x: fire.x + fire.w / 2, y: fire.y + fire.h / 2 };
    const origin = { ...s.aim };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: w * 0.5, y: h * 0.45 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: w * 0.5, y: h * 0.45 }, fp],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: w * 0.55, y: h * 0.4 }, fp],
    });
    await m.waitForTimeout(450);
    s = await snapshot(m);
    assert(s.fired >= 3);
    assert.notDeepEqual(s.aim, origin);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const fired = (await snapshot(m)).fired;
    await m.waitForTimeout(220);
    assert.equal((await snapshot(m)).fired, fired);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fp] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await m.waitForTimeout(90);
    const cancelled = (await snapshot(m)).fired;
    await m.waitForTimeout(220);
    assert.equal((await snapshot(m)).fired, cancelled);
    await button(m, 'pause', true);
    await button(m, 'help', true);
    await m.setViewportSize({ width: h, height: w });
    await m.waitForTimeout(250);
    await button(m, 'close', true);
    s = await snapshot(m);
    assert(s.pauses.includes('manual'));
    assert(s.pauses.includes('orientation'));
    assert(s.buttons.some((b) => b.id === 'fullscreen'));
    await m.setViewportSize({ width: w, height: h });
    await m.waitForTimeout(250);
    assert((await snapshot(m)).pauses.includes('manual'));
    await button(m, 'resume', true);
    await screenshot(m, `mobile-${w}-battle`);
    report['mobile' + w] = { multitouch: true, cancel: true, orientation: true };
    if (w === 844) {
      await m.reload();
      await m.waitForFunction(() =>
        globalThis.__night?.snapshot().buttons.some((b) => b.id === 'start'),
      );
      await button(m, 'start', true);
      await button(m, 'convoy', true);
      report.mobileWin = await mobileWin(m);
      await screenshot(m, 'mobile-success');
      console.log('Touch-only full mission passed');
    }
    await m.close();
    if (m.video())
      await m
        .video()
        .saveAs(
          fileURLToPath(
            new URL(`touch-${w}-${w === 844 ? 'complete' : 'interaction'}.webm`, evidence),
          ),
        );
  }
  assert.deepEqual(errors, []);
  assert.equal(build.sourceHash, await sourceHash(), 'Production source changed during acceptance');
  report.errors = errors;
  report.warnings = warnings;
  await writeFile(new URL('browser-results.json', evidence), JSON.stringify(report, null, 2));
  console.log('Browser checks passed');
} finally {
  await browser.close();
  if (errors.length) console.error(errors);
}
