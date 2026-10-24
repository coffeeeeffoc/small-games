import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, press, assertLayout } from './flight-browser.mjs';
const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = fileURLToPath(new URL('../reports/2026-10-24-compact-hud/support/', import.meta.url));
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [], errors = [];
try {
  for (const mode of ['dismissed', 'unavailable', 'failed', 'background', 'offline-credit']) {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    await context.addInitScript(mode => {
      localStorage.setItem('night-overwatch-coach-v2', 'done');
      globalThis.__supportOffers = 0;
      if (mode === 'offline-credit') localStorage.setItem('night-overwatch-rewards-v1', JSON.stringify({ ammo: 0, zoomLimit: 5, pendingSupply: true }));
      globalThis.SmallGamesRewardAds = { available: mode !== 'offline-credit', offer: () => {
        globalThis.__supportOffers++;
        return new Promise(resolve => { globalThis.__completeSupport = status => resolve({ status }); });
      } };
    }, mode);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && !document.getElementById('night-startup'));
    const hit = id => press(page, id, true);
    await hit('start'); await hit('supply'); await hit('reward:' + (mode === 'background' ? 'rate' : 'ammo'));
    const chosen = await snapshot(page); assertLayout(chosen, 844, 390); const frozenTime = chosen.time;
    assert.equal(await page.evaluate(() => __supportOffers), 0);
    await hit('supplyWatch');
    if (mode !== 'offline-credit') {
      assert((await snapshot(page)).advert); assert.equal((await snapshot(page)).time, frozenTime);
      if (mode === 'background') await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.evaluate(status => __completeSupport(status), mode === 'background' ? 'completed' : mode);
      await page.waitForFunction(() => !__night.snapshot().advert);
      const completed = await snapshot(page);
      if (mode === 'background') {
        assert(completed.pendingSupply); assert.equal(completed.buff, null); assert.equal(completed.resumeCountdown, 0);
        await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
        await page.waitForFunction(() => __night.snapshot().resumeCountdown > 0);
        const active = await snapshot(page); assert.equal(active.buff.kind, 'rate'); assert.equal(active.buff.remaining, 60);
        assert(!active.pendingSupply); assert.equal(await page.evaluate(() => __supportOffers), 1);
      } else {
        assert.equal(completed.modal, 'supply:offer'); assert(completed.supplyMessage.includes('未获得奖励'));
        assert.equal(completed.homingAmmo, 0); assert.equal(completed.buff, null); assert(!completed.pendingSupply);
        assertLayout(completed, 844, 390);
        await page.screenshot({ path: `${dir}/support-${mode}-844.png` });
        await hit('supplyLater');
        assert.equal((await snapshot(page)).resumeCountdown, 0);
        assert.equal((await snapshot(page)).modal, '');
      }
    } else {
      const active = await snapshot(page); assert.equal(active.homingAmmo, 2); assert(!active.pendingSupply);
      assert.equal(await page.evaluate(() => __supportOffers), 0); assert.equal(active.buff, null);
    }
    assert.equal((await snapshot(page)).resumeCountdown > 0, ['background', 'offline-credit'].includes(mode));
    await page.waitForFunction(() => __night.snapshot().resumeCountdown === 0 && !__night.snapshot().pauses.length);
    assert((await snapshot(page)).time >= frozenTime); assert.deepEqual((await snapshot(page)).held, []);
    results.push({ mode, returnedToBattle: true, offers: await page.evaluate(() => __supportOffers) });
    await context.close();
  }
  assert.deepEqual(errors, []); await acceptanceBuild(base);
  await writeFile(`${dir}/support-flow.json`, JSON.stringify({ build, results, errors,
    fixtures: 'Public ad provider, stored credit and visibility boundary only. Actual touch controls. No simulation state writes; not real SDK fill or physical device.' }, null, 2));
} finally { await browser.close(); }
