import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { enterGame } from './helpers.mjs';
const output = fileURLToPath(
  new URL('../docs/design/characters-2026-10-11/actual/', import.meta.url),
);
const base = process.env.BASE_URL || 'http://127.0.0.1:4174/';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  headless: true,
});
const report = {
  date: new Date().toISOString(),
  environment: 'Chromium, production build, phone emulation with touch',
  checks: [],
};
const errors = [];
async function open(width, height, id, missing = false, delayed = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
  });
  const requests = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().includes('/art/characters/')) requests.push(r.url().split('/').at(-1));
  });
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype,
      clear = proto.clearRect,
      draw = proto.drawImage;
    window.characterFrame = [];
    proto.clearRect = function (...args) {
      window.characterFrame = [];
      return clear.apply(this, args);
    };
    proto.drawImage = function (image, ...args) {
      if (/xiaocha\.png|\/characters\//.test(image.src || '')) {
        const m = this.getTransform();
        window.characterFrame.push({
          file: image.src.split('/').at(-1),
          args,
          tilt: m.b,
          sourceWidth: image.width,
          sourceHeight: image.height,
        });
      }
      return draw.call(this, image, ...args);
    };
  });
  if (missing) await page.route('**/assets/art/characters/*.png', (route) => route.abort());
  let releaseArt;
  const artReady = new Promise((resolve) => {
    releaseArt = resolve;
  });
  if (delayed)
    await page.route('**/assets/art/characters/*.png', async (route) => {
      await artReady;
      await route.continue();
    });
  const url = new URL(base);
  url.searchParams.set('dev', '1');
  url.searchParams.set('level', id);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await enterGame(page, true);
  return { context, page, requests, releaseArt };
}
try {
  for (const [width, height] of [
    [390, 844],
    [320, 568],
  ])
    for (const [id, expected] of [
      [8, ['guard.png', 'waiter.png', 'xiaocha.png']],
      [17, ['elder.png', 'aunt.png', 'girl.png', 'xiaocha.png']],
      [19, ['performer.png', 'xiaocha.png']],
      [12, ['uncle.png', 'xiaocha.png']],
      [14, ['elder.png', 'xiaocha.png']],
      [23, ['aunt.png', 'xiaocha.png']],
      [24, ['xiaocha.png']],
    ]) {
      const { context, page, requests } = await open(width, height, id);
      await page.waitForFunction(
        (expected) =>
          JSON.stringify(window.characterFrame.map((x) => x.file)) === JSON.stringify(expected),
        expected,
      );
      const frame = await page.evaluate(() => window.characterFrame);
      assert.equal(new Set(frame.map((x) => x.file)).size, frame.length);
      for (const item of frame)
        if (item.file !== 'xiaocha.png') {
          assert(Math.abs(item.tilt) < 1e-8);
          assert(
            Math.abs(item.args[2] / item.args[3] - item.sourceWidth / item.sourceHeight) < 1e-8,
          );
          assert.equal(item.args[1] + item.args[3], 2);
        }
      assert.deepEqual(
        [...new Set(requests)].sort(),
        expected.filter((x) => x !== 'xiaocha.png').sort(),
      );
      assert.equal(requests.length, new Set(requests).size, 'one request per identity');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const name = `level-${id}-${width}.png`;
      if ([8, 17, 19, 24].includes(id)) await page.screenshot({ path: output + '/' + name });
      if (id === 8 && width === 390) {
        const box = await page.locator('#right').boundingBox();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 7, x: box.x + box.width / 2, y: box.y + box.height / 2 }],
        });
        await page.waitForFunction(() => window.__wulong.snapshot().state.p.vx > 1);
        const moving = await page.evaluate(() => window.characterFrame);
        assert(
          moving.filter((x) => x.file !== 'xiaocha.png').every((x) => x.tilt === 0),
          'NPCs do not inherit walking',
        );
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await page.waitForFunction(() => window.__wulong.snapshot().state.p.vx === 0);
        await page.locator('#pause').tap();
        await page.locator('[data-resume]').tap();
        await page.locator('#menu').tap();
        await page.locator('#home-levels').tap();
        await page.locator('[data-level="8"]').tap();
        await page.waitForFunction(() => window.characterFrame.length === 3);
        assert.equal(requests.length, 2, 'revisit reuses loaded sprites');
        await page.screenshot({ path: output + '/diner-revisit-390.png' });
      }
      report.checks.push({
        level: id,
        viewport: `${width}x${height}`,
        characters: frame.map((x) => x.file),
        lazyRequests: requests,
        result: 'PASS',
      });
      await context.close();
    }
  const { context, page, requests } = await open(390, 844, 8, true);
  await page.waitForFunction(() => window.characterFrame.length === 1);
  await page.locator('[data-zone="meal"]').tap();
  assert.equal(await page.evaluate(() => window.__wulong.snapshot().state.meal), true);
  await page.screenshot({ path: output + '/diner-missing-art-390.png' });
  await page.locator('#pause').tap();
  await page.locator('[data-resume]').tap();
  assert.equal(requests.length, 2, 'failed sprites are not requested every frame');
  assert.deepEqual(await page.evaluate(() => window.characterFrame.map((x) => x.file)), [
    'xiaocha.png',
  ]);
  report.checks.push({ level: 8, viewport: '390x844', missingArt: true, result: 'PASS', requests });
  await context.close();
  const late = await open(390, 844, 8, false, true);
  await late.page.waitForFunction(() => window.characterFrame.length === 1);
  late.releaseArt();
  await late.page.waitForFunction(() => window.characterFrame.length === 3);
  assert.deepEqual(await late.page.evaluate(() => window.characterFrame.map((x) => x.file)), [
    'guard.png',
    'waiter.png',
    'xiaocha.png',
  ]);
  assert.equal(late.requests.length, 2, 'late artwork loads once per identity');
  report.checks.push({
    level: 8,
    viewport: '390x844',
    delayedArt: true,
    result: 'PASS',
    requests: late.requests,
  });
  await late.context.close();
  assert.deepEqual(errors, []);
  report.errors = errors;
  await writeFile(output + '/browser-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS ${report.checks.length} visual scenarios, no page errors`);
} finally {
  await browser.close();
}
