import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { exerciseStandalone } from '../../../../apps/shell-web/scripts/standalone-game-checks.mjs';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.env.SHELL_URL || 'http://127.0.0.1:4173/') + '#/games/flick-arena');
  const frame = page.frameLocator('iframe');
  await frame.locator('#start').waitFor();
  await exerciseStandalone(frame, 'flick-arena', true);
  // Use a known practice layout before exercising an actual embedded touch flick.
  await frame.locator('#pause').tap();
  await frame.locator('#home').tap();
  await frame.locator('#layouts').tap();
  await frame.locator('#layout-0').tap();
  await frame.locator('body[data-phase="playing"]').waitFor();
  const box = await frame.locator('#game').boundingBox();
  const scale = Math.min(box.width / 390, box.height / 780),
    ox = box.x + (box.width - 390 * scale) / 2,
    oy = box.y + (box.height - 780 * scale) / 2;
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: ox + 195 * scale, y: oy + 475.6 * scale }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: ox + 175 * scale, y: oy + 580 * scale }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  assert.equal(await frame.locator('#game').getAttribute('data-shots'), '1');
  await page.screenshot({ path: new URL('../docs/design/shell.png', import.meta.url).pathname });
  await frame.locator('#pause').tap();
  await frame.locator('#home').tap();
  // Complete UI is the fullscreen target; rejection still leaves the game playable.
  await frame.locator('#fullscreen').tap();
  await page.waitForTimeout(250);
  assert(await frame.locator('#start').isVisible());
  assert.deepEqual(errors, []);
  console.log(
    'PASS: production shell iframe, native touch, pause/home, fullscreen control; zero page errors.',
  );
} finally {
  await browser.close();
}
