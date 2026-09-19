import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { vehicles } from '../assets/scripts/Selection.ts';
import { sourceHash } from '../scripts/artifact.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
assert.equal(
  (await fetch(new URL('build-info.json', url)).then((r) => r.json())).sourceHash,
  await sourceHash(),
  'test the current build',
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const snapshot = (page) => page.evaluate(() => __kart.snapshot());
const loaded = (page) =>
  page.waitForFunction(
    () => globalThis.__kart && !__kart.snapshot().loading && __kart.snapshot().modelsLoaded,
    {},
    { timeout: 60000 },
  );
const reports = new URL('../reports/ranking-selection/', import.meta.url);
await mkdir(reports, { recursive: true });
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      hasTouch: mobile,
      isMobile: mobile,
      ...(mobile
        ? {
            userAgent:
              'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
          }
        : {}),
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(url);
    await loaded(page);
    const initial = await snapshot(page);
    assert.ok(initial.renderedVehicles.every((id) => vehicles.some((v) => v[0] === id)));
    for (let i = 0; i < 3; i++) {
      if (mobile) await page.touchscreen.tap(750, 306);
      else await page.keyboard.press('Digit3');
      await loaded(page);
      const selected = await snapshot(page);
      assert.equal(selected.renderedVehicles[0], selected.selection.vehicle);
      assert.deepEqual(
        selected.renderedVehicles.slice(1),
        initial.renderedVehicles.slice(1),
        'choosing the player car must leave every bot car unchanged',
      );
    }
    if (mobile) await page.touchscreen.tap(480, 395);
    else await page.keyboard.press('Enter');
    // Hold the mobile brake so real AI inputs can pass the player.
    if (mobile) await page.keyboard.down('ArrowDown');
    await page.waitForFunction(() => __kart.snapshot().time > 2);
    if (mobile) await page.keyboard.up('ArrowDown');
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => __kart.snapshot().hud.title === '休息一下');
    const paused = await snapshot(page);
    assert.equal(
      paused.order.indexOf(0) + 1,
      4,
      'the three bots passed the stationary/reversing player',
    );
    assert.match(paused.hud.top, /^第 4 \/ 4 名/);
    assert.match(paused.hud.standings, /^当前第 4 名/);
    await page.screenshot({
      path: fileURLToPath(new URL(`${mobile ? 'mobile' : 'desktop'}-rank.png`, reports)),
    });
    // Control randomness, never positions or progress, to prove each new race rerolls the bots.
    for (const [random, expected] of [
      [0, vehicles[0][0]],
      [0.999, vehicles.at(-1)[0]],
    ]) {
      await page.evaluate((value) => {
        globalThis.savedRandom = Math.random;
        Math.random = () => value;
      }, random);
      await page.keyboard.press('KeyR');
      await page.evaluate(() => {
        Math.random = globalThis.savedRandom;
        delete globalThis.savedRandom;
      });
      await loaded(page);
      const restarted = await snapshot(page);
      assert.equal(restarted.phase, 'countdown');
      assert.equal(restarted.time, 0);
      assert.equal(restarted.renderedVehicles[0], paused.selection.vehicle);
      assert.deepEqual(restarted.renderedVehicles.slice(1), [expected, expected, expected]);
      assert.notEqual(restarted.seed, paused.seed);
      await page.keyboard.press('KeyP');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'PASS: desktop/touch player-only selection, deterministic bot rerolls, real overtakes and matching HUD rank.',
  );
} finally {
  await browser.close();
}
