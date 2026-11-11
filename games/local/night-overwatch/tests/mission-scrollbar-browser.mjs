import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { MISSIONS } from '../assets/scripts/core/MissionCatalog.ts';
import { ECONOMY } from '../assets/scripts/core/Progression.ts';
import { acceptanceBuild, evidenceDirectory, press, settleVisuals, snapshot } from './flight-browser.mjs';
import { assetFixture } from './progression-fixture.ts';
import { scrollPage } from './scroll-helpers.mjs';

const base = process.env.NIGHT_URL;
await acceptanceBuild(base);
const output = evidenceDirectory('mission-scrollbar');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=d3d11'],
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
});

try {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) {
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const assets = { ...assetFixture(), economy: ECONOMY };
    const metadata = { identity: { playerId: assets.playerId, nickname: '夜航07' }, capabilities: { multiplayer: false, leaderboards: false } };
    await page.route('**/game-bootstrap.js', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `globalThis.SmallGamesServices={
        ready: Promise.resolve(${JSON.stringify(metadata)}),
        services: { nightAssets: async () => (${JSON.stringify(assets)}) },
        createRecorder: () => ({})
      };`,
    }));
    await page.goto(base + '?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().progression.assets && !document.getElementById('night-startup'));
    await press(page, 'missions', touch);
    const getArea = async () => (await snapshot(page)).scrollLists.find((area) => area.key === 'missions');
    const { scrollbar: bar, max } = await getArea();
    const initial = await snapshot(page);
    assert(bar.h >= 24 && bar.thumbWidth >= 44);
    assert(bar.y + bar.h <= initial.buttons.find((button) => button.id === 'start').y);
    await page.screenshot({ path: join(output, `start-${width}.png`) });

    const y = bar.y + bar.h / 2;
    const pressX = bar.thumbX + 6;
    const endX = bar.x + bar.w - 1;
    if (touch) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pressX, y }] });
      await settleVisuals(page);
      assert.equal((await getArea()).offset, 0, 'The thumb stays put when grabbed off-center');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: endX, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    } else {
      await page.mouse.move(pressX, y);
      await page.mouse.down();
      await settleVisuals(page);
      assert.equal((await getArea()).offset, 0, 'The thumb stays put when grabbed off-center');
      await page.mouse.move(endX, y, { steps: 8 });
      await page.mouse.up();
    }
    await settleVisuals(page);
    assert.equal((await getArea()).offset, max);
    const end = await snapshot(page);
    assert.equal(end.mission.id, initial.mission.id);
    assert.equal(end.buttons.find((button) => button.id === 'mission:' + MISSIONS.at(-1).id)?.disabled, true);
    await page.screenshot({ path: join(output, `end-${width}.png`) });

    const clickX = bar.x + bar.w / 2;
    if (touch) await page.touchscreen.tap(clickX, y);
    else await page.mouse.click(clickX, y);
    await settleVisuals(page);
    assert(Math.abs((await getArea()).offset - max / 2) < max * 0.01);
    assert.equal((await snapshot(page)).mission.id, initial.mission.id);
    const scrolled = await scrollPage(page, 'missions');
    assert(scrolled.scrollLists.find((area) => area.key === 'missions').offset > max / 2);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`Mission scrollbar passed at all three sizes. Screenshots in ${output}`);
} finally {
  await browser.close();
}
