import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

// Browser resize delivery uses the native rendering clock, not Playwright's
// paused game clock. Wait for the actual display contract before sending input.
export async function expectDisplay(scope, rotated) {
  await expect.poll(() => scope.locator('html').evaluate((html) => {
    const viewport = visualViewport ?? window;
    const width = viewport.width ?? innerWidth, height = viewport.height ?? innerHeight;
    const root = document.querySelector('.landscape-root');
    const box = root.getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    const isRotated = html.dataset.rotated === 'true';
    return {
      rotated: html.dataset.rotated,
      orientation: height > width,
      width: Math.abs(box.width - width) < 1,
      height: Math.abs(box.height - height) < 1,
      geometry: Math.abs((isRotated ? board.height / board.width : board.width / board.height) - 16 / 9) < 0.015,
    };
  }), { message: 'native resize updates rotation, container bounds and board geometry' }).toEqual({
    rotated: String(rotated), orientation: rotated, width: true, height: true, geometry: true,
  });
}

export async function rotationChecks(page, scope = page) {
  const snapshot = () => scope.locator('body').evaluate(() => window.__outOfFrameSnapshot());
  await scope.locator('#pause').tap();
  const paused = await snapshot();
  for (const [width, height] of [[844,390], [390,844], [844,390], [360,640], [640,360], [844,390]]) {
    await page.setViewportSize({ width, height });
    await expectDisplay(scope, height > width);
    await page.clock.runFor(100);
    const current = await snapshot();
    assert.equal(current.paused, true, 'rotation keeps the pause open');
    assert.deepEqual(current.state, paused.state, 'rotation preserves the paused world exactly');
    const bounds = await scope.locator('#resume').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, 'rotated pause controls remain reachable');
  }
  await scope.locator('#resume').tap();
  await page.clock.runFor(100);
  assert.ok((await snapshot()).state.time > paused.state.time, 'resume advances the same game');

  const cdp = await page.context().newCDPSession(page);
  const button = await scope.locator('#move-right').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: button.x + button.width / 2, y: button.y + button.height / 2 }] });
  await page.clock.runFor(100);
  const moving = await snapshot();
  assert.ok(moving.state.player.x > paused.state.player.x, 'landscape touch moves the player');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectDisplay(scope, true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const released = await snapshot();
  await page.clock.runFor(150);
  assert.equal((await snapshot()).state.player.x, released.state.player.x, 'rotation and cancel release held movement');
  await expect(scope.locator('.touch-controls .pressed')).toHaveCount(0);

  // Native touch coordinates must still map to the same logical frame after
  // repeated rotation, including when the game lives inside the Shell iframe.
  const frame = (await snapshot()).state.frame;
  const board = await scope.locator('#board').boundingBox();
  const point = (x, y) => ({ x: board.x + (1 - y / 540) * board.width, y: board.y + x / 960 * board.height });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, ...point(frame.x + frame.w / 2, frame.y + frame.h / 2) }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 2, ...point(frame.x + frame.w / 2 + 35, frame.y + frame.h / 2 + 20) }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const dragged = (await snapshot()).state.frame;
  assert.ok(Math.abs(dragged.x - frame.x - 35) < 2 && Math.abs(dragged.y - frame.y - 20) < 2, 'rotated touch drag preserves logical coordinates');
  await expect(scope.locator('#board')).not.toHaveClass(/dragging/);
  // Keep the input session until context.close(); detaching resets mobile emulation in Chromium.
  await scope.locator('#touch-restart').tap();
  await page.clock.runFor(30);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectDisplay(scope, false);
  await page.clock.runFor(30);
}
