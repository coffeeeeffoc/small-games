import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, assertLayout, snapshot, press, navigateMap } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = fileURLToPath(new URL('../reports/2026-10-25-tracking-zoom/', import.meta.url));
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], results = [];
try {
  for (const [width, height] of [[844, 390], [568, 320], [1366, 768], [390, 844]]) {
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      ...(touch ? { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' } : {}),
      ...(width === 844 ? { recordVideo: { dir, size: { width, height } } } : {}) });
    await context.addInitScript(() => {
      localStorage.setItem('night-overwatch-coach-v2', 'done');
      globalThis.SmallGamesRewardAds = { available: true, offer: async () => ({ status: 'completed' }) };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const hit = id => press(page, id, touch);
    const capture = async name => {
      const state = await snapshot(page); assertLayout(state, state.ui.width, state.ui.height);
      await page.screenshot({ path: `${dir}/${name}-${width}.png` });
      return state;
    };
    const tracking = state => state.buttons.find(b => b.id === 'homing');
    await page.goto(base + '?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && !document.getElementById('night-startup'));
    await hit('start');
    assert(!tracking(await snapshot(page)).bold);
    await hit('homing'); await hit('reward:tracking'); await hit('supplyWatch');
    await page.waitForFunction(() => __night.snapshot().buff?.kind === 'tracking');
    const claimed = await snapshot(page);
    assert.equal(claimed.resumeCountdown, 0); assert.deepEqual(claimed.pauses, []); assert.equal(claimed.modal, '');
    assert(claimed.buff.remaining > 59 && claimed.buff.remaining <= 60);
    let active = await capture('tracking');
    assert.equal(active.buff.kind, 'tracking'); assert(tracking(active).bold);
    assert.equal(tracking(active).text, `追踪\n${Math.ceil(active.buff.remaining)}秒`);
    assert.equal(active.homingAmmo, 0, 'automatic tracking does not require homing ammunition');
    const selected = active.buttons.find(b => b.id === 'weapon' + active.selected);
    assert.equal(tracking(active).color, selected.color);
    await hit('weapon0'); assert(tracking(await snapshot(page)).bold, 'switching guns retains active tracking');
    const target = (await snapshot(page)).units.find(u => !u.friendly && u.kind === 'turret');
    if (width > height) await navigateMap(page, target, touch);
    await capture('zoom-before');
    await hit('settings'); await hit('zoomControls');
    const before = await snapshot(page);
    await page.waitForTimeout(350);
    assert.equal((await snapshot(page)).buff.remaining, before.buff.remaining, 'pause freezes the displayed timer');
    await hit('lensIn');
    const after = await snapshot(page);
    assert.equal(after.zoom, before.zoom * 1.5);
    const factor = Math.tan(before.camera.fov * Math.PI / 360) / Math.tan(after.camera.fov * Math.PI / 360);
    assert(Math.abs(factor - 1.5) < .01, 'one zoom step enlarges actual projection by 50%');
    for (let i = 0; i < 8; i++) await hit('lensIn');
    assert.equal((await snapshot(page)).zoom, before.zoomLimit, 'zoom respects unlocked limit');
    await hit('resume'); await capture('zoom-after');
    if (width > height) {
      if (touch) await hit('fire'); else await page.keyboard.press('Space');
      await page.waitForTimeout(500);
      assert((await snapshot(page)).fired > 0, 'battle remains playable after reward and zoom');
    }
    if (!touch) {
      // Stay above the widest-FOV clamp while measuring the temporary magnification.
      for (let i = 0; i < 8; i++) await page.keyboard.press('Minus');
      await page.keyboard.press('Equal'); await page.waitForTimeout(120);
      const wide = await snapshot(page);
      await page.mouse.move(width / 2, height / 2); await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(120);
      const focused = await capture('temporary-3x');
      const focusFactor = Math.tan(wide.camera.fov * Math.PI / 360) / Math.tan(focused.camera.fov * Math.PI / 360);
      assert(Math.abs(focusFactor - 3) < .01);
      assert.equal(focused.zoom, wide.zoom);
      await page.mouse.up({ button: 'right' }); await page.waitForTimeout(120);
      assert(Math.abs((await snapshot(page)).camera.fov - wide.camera.fov) < .01);
    }
    if (width === 568) {
      await page.waitForFunction(() => __night.snapshot().buff?.remaining <= 5, null, { timeout: 120000 });
      active = await capture('tracking-ending');
      assert(tracking(active).bold); assert.equal(tracking(active).color, 'ffbf55');
      await page.waitForFunction(() => !__night.snapshot().buff, null, { timeout: 20000 });
      active = await capture('tracking-expired');
      assert(!tracking(active).bold); assert.equal(tracking(active).text, '追踪\n+');
    }
    results.push({ width, height, zoomStep: factor, tracking: true, expiry: width === 568, temporaryFocus: !touch });
    await context.close();
  }
  assert.deepEqual(errors, []); await acceptanceBuild(base);
  await writeFile(`${dir}/results.json`, JSON.stringify({ build, results, errors,
    fixtures: 'Public completed ad callback only. Real touch/mouse input; no simulation writes. Browser emulation, not device or real inventory.' }, null, 2));
} finally { await browser.close(); }
