import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { barrierOverlap } from '../assets/scripts/KartPhysics.ts';
import { fileURLToPath } from 'node:url';
const track = createTrack();
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  for (const side of ['Left', 'Right']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.KART_URL || 'http://127.0.0.1:4198');
    await page.waitForFunction(() => globalThis.__kart?.snapshot().modelsLoaded && !__kart.snapshot().loading);
    await page.keyboard.press('Enter');
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => __kart.snapshot().time > 1.8);
    await page.keyboard.down('Arrow' + side);
    await page.waitForFunction(() => __kart.snapshot().collisions > 0, {}, { timeout: 10000 });
    const contact = await page.evaluate(() => __kart.snapshot());
    const deadline = Date.now() + 10000;
    let advanced = false;
    while (Date.now() < deadline) {
      const s = await page.evaluate(() => __kart.snapshot());
      const penetration = Math.max(
        0,
        ...track.barriers.map((b) => barrierOverlap(s.player, b)?.depth ?? 0),
      );
      assert.ok(penetration < 0.01, `body crossed a visible rail by ${penetration}m`);
      if (s.time > contact.time + 1) {
        advanced = true;
        break;
      }
      await page.waitForTimeout(40);
    }
    assert.ok(advanced, 'the race must keep advancing while pressed against the rail');
    await page.screenshot({
      path: fileURLToPath(new URL(`../reports/wall-${side.toLowerCase()}.png`, import.meta.url)),
    });
    await page.keyboard.up('Arrow' + side);
    // A stopped kart cannot steer in place: back away from the wall first.
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowDown');
    let held;
    const escapeDeadline = Date.now() + 8000;
    while (Date.now() < escapeDeadline) {
      const s = await page.evaluate(() => __kart.snapshot());
      if (s.progress.distance > contact.progress.distance + 3) break;
      const steer = s.suggestedInput.steer;
      const key = Math.abs(steer) < 0.1 ? undefined : steer < 0 ? 'ArrowLeft' : 'ArrowRight';
      if (held !== key) {
        if (held) await page.keyboard.up(held);
        if (key) await page.keyboard.down(key);
        held = key;
      }
      await page.waitForTimeout(40);
    }
    if (held) await page.keyboard.up(held);
    const after = await page.evaluate(() => __kart.snapshot());
    assert.ok(
      after.progress.distance > contact.progress.distance + 3,
      'steering away should restore forward progress',
    );
    assert.equal(after.resets, 0, 'backing out must not teleport the player');
    assert.deepEqual(errors, []);
    console.log(`${side}: held against rail without mesh penetration, then drove away`);
    await page.close();
  }
} finally {
  await browser.close();
}
