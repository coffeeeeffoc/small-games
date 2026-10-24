import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import {
  ashfallInput,
  assertAshfallGameplay,
  snapshot,
} from '../../../../apps/shell-web/scripts/game-checks/ashfall-front.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const url = process.env.ASHFALL_TEST_URL || 'http://127.0.0.1:4469';
const output = new URL('../docs/qa/cocos/', import.meta.url);
await mkdir(output, { recursive: true });
await mkdir(new URL('../publishing/gameplay/screenshots/', import.meta.url), { recursive: true });
const server = process.env.ASHFALL_TEST_URL
  ? null
  : spawn(process.execPath, ['scripts/serve.mjs', '--port', '4469'], {
      cwd: root,
      stdio: 'ignore',
    });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});
const report = {
  creator: '3.8.8',
  checks: [],
  errors: [],
  screenshots: [],
  limitations: [
    'Desktop Chromium with emulated touch, not a physical phone or TapTap inventory.',
    'Only explicit development fixtures change battle state; timing samples are separate pure-input rule tests.',
  ],
};
const capture = async (page, name) => {
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', output)) });
  report.screenshots.push(name + '.png');
};
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(url)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
  for (const [width, height] of [
    [844, 390],
    [390, 844],
    [568, 320],
    [932, 430],
    [1024, 390],
    [1280, 720],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      ...(width === 844
        ? {
            recordVideo: {
              dir: root + '../../../outputs/ashfall-front/video',
              size: { width, height },
            },
          }
        : {}),
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(url + '/?dev=1');
    await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
    await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
    const input = await ashfallInput(page, true);
    async function bounds() {
      const s = await snapshot(page);
      for (const b of s.controls) {
        assert.ok(b.w >= 43.5 && b.h >= 43.5, `${width} ${b.id}: touch target ${b.w}x${b.h}`);
        assert.ok(
          b.x >= -1 && b.y >= -1 && b.x + b.w <= width + 1 && b.y + b.h <= height + 1,
          `${width} ${b.id}: clipped`,
        );
      }
    }
    await bounds();
    await capture(page, `home-${width}x${height}`);
    await input.tap('levels');
    await expect.poll(async () => (await snapshot(page)).screen).toBe('levels');
    await bounds();
    await capture(page, `levels-${width}x${height}`);
    await input.tap('next');
    await input.tap('prev');
    await input.tap('home');
    await assertAshfallGameplay(page, true);
    await input.tap('start');
    const before = await snapshot(page);
    await input.press(['right', 'fire', 'jump']);
    await page.waitForTimeout(350);
    const during = await snapshot(page);
    assert.ok(
      during.run.player.x > before.run.player.x &&
        during.run.shots > before.run.shots &&
        during.run.player.y < 570,
      'native simultaneous movement, fire and jump',
    );
    await input.release(true);
    const shots = (await snapshot(page)).run.shots;
    await page.waitForTimeout(220);
    assert.equal((await snapshot(page)).run.shots, shots, 'cancel releases fire');
    await capture(page, `combat-${width}x${height}`);
    await input.tap('pause');
    await bounds();
    await capture(page, `pause-${width}x${height}`);
    const buttons = (await snapshot(page)).controls.filter((b) => b.id !== 'pause');
    for (let a = 0; a < buttons.length; a++)
      for (let b = a + 1; b < buttons.length; b++) {
        const x = buttons[a],
          y = buttons[b];
        assert.ok(
          x.x + x.w <= y.x + 0.5 ||
            y.x + y.w <= x.x + 0.5 ||
            x.y + x.h <= y.y + 0.5 ||
            y.y + y.h <= x.y + 0.5,
          `overlapping pause controls ${x.id}/${y.id}`,
        );
      }
    await input.tap('resume');
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await snapshot(page)).screen).toBe('paused');
    await input.tap('home');
    await page.evaluate(() => window.Ashfall.dev('level', 0));
    await page.evaluate(() => window.Ashfall.dev('clear'));
    await expect.poll(async () => (await snapshot(page)).screen).toBe('result');
    await capture(page, `victory-${width}x${height}`);
    assert.equal(
      (await snapshot(page)).progress.completed.length,
      0,
      'trial does not unlock normal progress',
    );
    await input.tap('retry');
    await page.evaluate(() => window.Ashfall.dev('lose'));
    await capture(page, `defeat-${width}x${height}`);
    await input.tap('retry');
    await input.dispose();
    report.checks.push(
      `Creator touch/home/23-level pages/multitouch/cancel/pause/blur/results/retry at ${width}x${height}`,
    );
    const video = page.video();
    await context.close();
    if (video) report.video = await video.path();
  }
  {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await desktop.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(url + '/');
    await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
    assert.equal(await page.evaluate(() => typeof window.Ashfall.dev), 'undefined');
    assert.equal((await snapshot(page)).rewardAvailable, false);
    const input = await ashfallInput(page, false);
    await input.tap('levels');
    assert.equal(
      (await snapshot(page)).controls.filter((c) => c.id.startsWith('level-') && c.disabled).length,
      5,
    );
    await input.tap('home');
    await assertAshfallGameplay(page, false);
    await input.tap('start');
    const shots = (await snapshot(page)).run.shots;
    await page.mouse.move(940, 320);
    await page.mouse.down();
    await expect.poll(async () => (await snapshot(page)).run.shots).toBeGreaterThan(shots);
    await page.mouse.move(980, 220);
    await page.mouse.up();
    await input.dispose();
    await desktop.close();
    report.checks.push(
      'Normal desktop mode: locked levels, no developer mutations or SDK, native mouse aiming',
    );
  }
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    globalThis.SmallGamesPublishingConfig = {
      adsEnabled: true,
      adMode: 'host',
      platform: 'taptap-h5',
      adUnitId: 'qa-ashfall-only',
    };
    globalThis.__ad = { shown: 0, close: null, error: null };
    globalThis.tap = {
      createRewardedVideoAd: () => ({
        onClose(fn) {
          __ad.close = fn;
        },
        onError(fn) {
          __ad.error = fn;
        },
        offClose() {},
        offError() {},
        load: async () => {},
        show: async () => {
          __ad.shown++;
        },
        destroy() {},
      }),
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url + '/?dev=1');
  await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
  await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
  const input = await ashfallInput(page, true);
  for (const result of [
    'completed',
    'dismissed',
    'failed',
    'close-hidden',
    'return-first',
    'stale',
  ]) {
    await page.evaluate(() => {
      window.Ashfall.dev('level', 0);
      window.Ashfall.dev('damage');
    });
    await input.tap('pause');
    await input.tap('supply');
    await capture(page, 'supply-confirmation');
    const hp = (await snapshot(page)).run.player.hp;
    await input.tap('claim');
    await expect.poll(async () => (await snapshot(page)).adLocked).toBe(true);
    if (result === 'failed') await page.evaluate(() => __ad.error({ errCode: 1004 }));
    else if (result === 'stale') {
      await page.evaluate(() => window.Ashfall.dev('level', 1));
      await page.evaluate(() => __ad.close({ isEnded: true }));
    } else if (result === 'close-hidden') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        __ad.close({ isEnded: true });
      });
      await page.waitForTimeout(80);
      assert.equal((await snapshot(page)).run.player.hp, hp, 'hidden close waits for return');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } else if (result === 'return-first') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        __ad.close({ isEnded: true });
      });
    } else await page.evaluate((ended) => __ad.close({ isEnded: ended }), result === 'completed');
    await expect.poll(async () => (await snapshot(page)).adLocked).toBe(false);
    const state = await snapshot(page);
    assert.equal(
      state.run.player.hp,
      result === 'stale'
        ? 120
        : ['completed', 'close-hidden', 'return-first'].includes(result)
          ? hp + 48
          : hp,
    );
    report.checks.push('SDK fixture: ' + result);
  }
  await page.evaluate(() => {
    window.Ashfall.dev('level', 0);
    window.Ashfall.dev('lose');
  });
  await input.tap('revive');
  await input.tap('claim');
  await expect.poll(async () => (await snapshot(page)).adLocked).toBe(true);
  await page.evaluate(() => __ad.close({ isEnded: true }));
  await expect.poll(async () => (await snapshot(page)).run.player.hp).toBe(60);
  await input.tap('resume');
  await expect.poll(async () => (await snapshot(page)).screen).toBe('playing');
  report.checks.push('SDK fixture: revive restores 50% and actually resumes');
  await input.dispose();
  await context.close();
  assert.deepEqual(report.errors, []);
  for (const name of ['home-844x390', 'combat-844x390', 'levels-844x390', 'pause-844x390'])
    await copyFile(
      new URL(name + '.png', output),
      new URL('../publishing/gameplay/screenshots/' + name + '.png', import.meta.url),
    );
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  server?.kill();
}
console.log(JSON.stringify(report));
