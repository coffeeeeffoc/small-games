import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { MAP } from '../assets/scripts/core/Data.ts';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = new URL('../reports/mobile-20261009/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const results = [], errors = [];
try {
  for (const [width, height] of [[844, 390], [568, 320], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' });
    page.on('pageerror', e => errors.push(e.message));
    const capture = name => page.screenshot({ path: fileURLToPath(new URL(`${width}-${name}.png`, dir)) });
    const screenPoint = async (x, y) => page.evaluate(({ x, y }) => {
      const r = document.querySelector('canvas').getBoundingClientRect(), s = __night.snapshot();
      const rotated = new DOMMatrix(getComputedStyle(document.getElementById('GameDiv')).transform).b > .5;
      return rotated ? { x: r.left + r.width - y * r.width / s.ui.height, y: r.top + x * r.height / s.ui.width }
        : { x: r.left + x * r.width / s.ui.width, y: r.top + y * r.height / s.ui.height };
    }, { x, y });
    const tap = async (x, y) => { const p = await screenPoint(x, y); await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(90); };
    const press = async id => {
      const s = await snapshot(page), b = s.buttons.find(b => b.id === id);
      assert(b, `visible ${id}: ${s.buttons.map(b => b.id)}`);
      await tap(b.x + b.w / 2, b.y + b.h / 2);
    };
    const layout = async () => { const s = await snapshot(page); assertLayout(s, s.ui.width, s.ui.height); };
    await page.goto(base);
    await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
    assert.equal((await snapshot(page)).modal, 'home');
    assert((await snapshot(page)).ui.width > (await snapshot(page)).ui.height, 'phone starts landscape without fullscreen');
    await layout(); await capture('home');
    await press('missions'); assert.equal((await snapshot(page)).modal, 'missions');
    await layout(); await capture('missions');
    await press('homeMenu'); assert.equal((await snapshot(page)).modal, 'home');
    await press('missions'); await press('training'); await press('start');
    await layout();
    const s0 = await snapshot(page);
    for (const weapon of [0, 1, 2]) {
      await press(`weapon${weapon}`);
      assert.equal((await snapshot(page)).selected, weapon);
      await press('fire'); await capture(`weapon-${weapon}`);
    }
    await press('pause');
    const frozen = (await snapshot(page)).time; await page.waitForTimeout(200);
    assert.equal((await snapshot(page)).time, frozen); await capture('pause');
    await press('settings'); await capture('settings'); await press('help'); await capture('help');
    await press('close'); await press('close'); assert.equal((await snapshot(page)).modal, 'pause');
    await press('home'); await press('missions'); await press('training'); await press('start');
    await press('homing'); await capture('supply'); await press('adClose');
    assert((await snapshot(page)).homingSelected); assert.equal((await snapshot(page)).homingAmmo, 1);
    const target = (await snapshot(page)).units.find(u => !u.friendly && u.kind === 'light');
    const map = (await snapshot(page)).ui.minimap;
    await tap(map.x + 8 + (target.x + MAP.halfWidth) / (2 * MAP.halfWidth) * (map.w - 16),
      map.y + 25 + (target.z + MAP.halfDepth) / (2 * MAP.halfDepth) * (map.h - 33));
    const cdp = await page.context().newCDPSession(page);
    const view = (await snapshot(page)).ui, cx = view.width / 2, cy = view.height * .56;
    const fingers = async (gap, dx = 0, dy = 0) => Promise.all([-1, 1].map(async (sign, i) => ({
      ...await screenPoint(cx + dx + sign * gap, cy + dy), id: i + 1,
    })));
    const pinchBefore = await snapshot(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: await fingers(24) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: await fingers(48) });
    await page.waitForTimeout(80);
    const zoomed = await snapshot(page);
    assert(zoomed.zoom > pinchBefore.zoom * 1.8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: await fingers(48, 36, 8) });
    await page.waitForTimeout(80);
    const panned = await snapshot(page);
    assert(Math.abs(panned.zoom - zoomed.zoom) < .02, 'parallel fingers preserve zoom');
    assert(Math.hypot(panned.camera.center.x - zoomed.camera.center.x, panned.camera.center.z - zoomed.camera.center.z) > .5, 'parallel fingers move the camera');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: await fingers(48, -30, -8) });
    await page.waitForTimeout(80);
    const reversed = await snapshot(page);
    assert(Math.hypot(reversed.camera.center.x - panned.camera.center.x, reversed.camera.center.z - panned.camera.center.z) > .5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.deepEqual((await snapshot(page)).held, []); assert.equal((await snapshot(page)).fired, pinchBefore.fired);
    await capture('pan');
    const current = (await snapshot(page)).units.find(u => u.id === target.id);
    await tap(map.x + 8 + (current.x + MAP.halfWidth) / (2 * MAP.halfWidth) * (map.w - 16),
      map.y + 25 + (current.z + MAP.halfDepth) / (2 * MAP.halfDepth) * (map.h - 33));
    const q = await page.evaluate(id => __night.screenPoint(__night.snapshot().units.find(u => u.id === id)), target.id);
    await tap(q.x, q.y);
    assert.equal((await snapshot(page)).homingTarget, target.id); await capture('locked');
    const fire = (await snapshot(page)).buttons.find(b => b.id === 'fire');
    const fp = await screenPoint(fire.x + fire.w / 2, fire.y + fire.h / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...fp, id: 3 }] });
    await page.waitForTimeout(650);
    const launched = await snapshot(page);
    assert.equal(launched.fired, pinchBefore.fired + 1); assert.equal(launched.homingAmmo, 0);
    assert(launched.shots.some(s => s.guidance?.target === target.id));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(id => __night.snapshot().units.find(u => u.id === id).hp === 0, target.id, { timeout: 15000 });
    assert.equal((await snapshot(page)).friendlyDamage, 0); await capture('hit');
    await press('fullscreen'); await page.waitForFunction(() => !!document.fullscreenElement);
    await press('fullscreen'); await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal((await snapshot(page)).homingAmmo, 0);
    if (width === 390) {
      await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(250);
      assert.equal((await snapshot(page)).phase, 'playing'); await layout();
      assert.equal((await snapshot(page)).homingAmmo, 0);
      await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
      assert.equal((await snapshot(page)).modal, ''); await layout();
    }
    await press('pause'); await press('home');
    assert.equal((await snapshot(page)).modal, 'home');
    await page.reload(); await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
    assert.equal((await snapshot(page)).homingAmmo, 0);
    results.push({ width, height, viewport: s0.ui, pinch: [pinchBefore.zoom, zoomed.zoom],
      pan: [zoomed.camera.center, panned.camera.center, reversed.camera.center], homingTarget: target.id,
      fired: launched.fired, inventory: 0, menus: true, fullscreen: true, rotation: width === 390 });
    await cdp.detach(); await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('verification.json', dir), JSON.stringify({ build, results, errors }, null, 2));
  console.log(JSON.stringify({ results: results.map(({ width, height }) => ({ width, height })), errors }));
} finally { await browser.close(); }
