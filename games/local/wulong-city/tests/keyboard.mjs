// Real browser key and touch events; snapshots are read-only and never solve a level.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { enterGame } from './helpers.mjs';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4174/';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: 960, height: 900 }, hasTouch: true });
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const snapshot = () => page.evaluate(() => window.__wulong.snapshot());
const frames = async (count = 3) => {
  for (let i = 0; i < count; i++) await page.evaluate(() => new Promise(requestAnimationFrame));
};
const wait = (fn) => page.waitForFunction(fn, null, { timeout: 5000 });
async function reset() {
  const url = new URL(baseURL);
  url.searchParams.set('dev', '1');
  url.searchParams.set('level', '10');
  await page.goto(url.href);
  await wait(() => !!window.__wulong);
  await enterGame(page);
}
async function settle() {
  await wait(() => window.__wulong.snapshot().state.p.grounded);
  await frames();
}
async function move(key, direction) {
  const start = (await snapshot()).state.p.x;
  await page.keyboard.down(key);
  await page.waitForFunction(
    ({ start, direction }) => direction * (window.__wulong.snapshot().state.p.x - start) > 12,
    { start, direction },
  );
  await page.keyboard.up(key);
  await frames();
  const stopped = (await snapshot()).state.p.x;
  await frames(6);
  assert.equal((await snapshot()).state.p.x, stopped, `${key} releases movement`);
}

try {
  await reset();
  const donut = page.locator('[data-zone="donut"]');
  await donut.focus();
  for (const [key, direction] of [
    ['KeyD', 1],
    ['KeyA', -1],
    ['ArrowRight', 1],
    ['ArrowLeft', -1],
  ])
    await move(key, direction);
  let state = (await snapshot()).state;
  assert.equal(state.donutX, 124);
  assert.equal(state.donutY, 244);
  assert.equal(state.dragging, false);
  checks.push(
    'A/D and left/right move immediately while a draggable hotspot has focus, without grabbing it',
  );

  for (const selector of ['#left', '#right', '#jump', '#hint', '#pause', '[data-zone="donut"]']) {
    await page.locator(selector).focus();
    const before = await snapshot();
    await page.keyboard.press('Space');
    await wait(() => !window.__wulong.snapshot().state.p.grounded);
    const after = await snapshot();
    assert.equal(after.modal, false, `Space on ${selector} does not activate the focused button`);
    assert.equal(after.sound, before.sound);
    assert.equal(after.state.p.x, before.state.p.x);
    assert.equal(after.state.donutX, 124);
    assert.equal(after.state.donutY, 244);
    await settle();
  }
  checks.push(
    'Space jumps from movement, utility, and object button focus without activating the focused button',
  );

  await page.locator('#canvas').focus();
  for (const key of ['KeyW', 'ArrowUp']) {
    await page.keyboard.press(key);
    await wait(() => !window.__wulong.snapshot().state.p.grounded);
    await settle();
  }
  await page.keyboard.down('Space');
  await wait(() => !window.__wulong.snapshot().state.p.grounded);
  await settle();
  await page.keyboard.down('Space'); // Browser repeat event, not another jump.
  await frames(6);
  assert.equal((await snapshot()).state.p.grounded, true);
  await page.keyboard.up('Space');
  checks.push(
    'W, up, and Space jump once per press; holding/repeating Space does not auto-jump after landing',
  );

  for (const key of ['KeyS', 'ArrowDown']) {
    await page.keyboard.press('Space');
    await wait(() => window.__wulong.snapshot().state.p.y < 410);
    await page.keyboard.down(key);
    const before = (await snapshot()).state;
    await frames();
    const after = (await snapshot()).state;
    const acceleration = (after.p.vy - before.p.vy) / (after.t - before.t);
    assert(
      acceleration > 2300 && acceleration < 2500,
      `${key} increases downward acceleration: ${acceleration}`,
    );
    await page.keyboard.up(key);
    await settle();
  }
  checks.push('S and down accelerate descent and release normally');

  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('KeyD');
  await page.keyboard.up('ArrowRight');
  const beforeOverlap = (await snapshot()).state.p.x;
  await frames(6);
  assert((await snapshot()).state.p.x > beforeOverlap + 5);
  await page.keyboard.up('KeyD');
  await frames();
  await page.locator('#left').focus();
  const beforeButton = (await snapshot()).state.p.x;
  await page.keyboard.down('Enter');
  await page.waitForFunction((x) => window.__wulong.snapshot().state.p.x < x - 10, beforeButton);
  await page.locator('#canvas').focus();
  await page.keyboard.up('Enter');
  await frames();
  const buttonReleased = (await snapshot()).state.p.x;
  await frames(6);
  assert.equal((await snapshot()).state.p.x, buttonReleased);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Escape');
  await page.keyboard.up('ArrowRight');
  assert.equal((await snapshot()).modal, true);
  await page.keyboard.press('Space'); // The focused dialog resume button retains native activation.
  await wait(() => !window.__wulong.snapshot().modal);
  await frames();
  const resumed = (await snapshot()).state.p.x;
  await frames(6);
  assert.equal((await snapshot()).state.p.x, resumed);
  checks.push(
    'Overlapping keys and Enter-held buttons release even after focus changes; pause clears held input and keeps dialog keyboard activation',
  );

  await reset();
  await donut.focus();
  await page.keyboard.press('Enter');
  const grabX = (await snapshot()).state.p.x;
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  assert.equal((await snapshot()).state.p.x, grabX);
  await page.keyboard.press('Enter');
  await wait(() => window.__wulong.snapshot().state.won);
  checks.push(
    'Enter explicitly grabs a scene object; arrows move the object, and Enter releases it to solve the wheel puzzle',
  );

  await reset();
  await donut.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await page.locator('[data-resume]').click();
  state = (await snapshot()).state;
  assert.equal(state.donutX, 124);
  assert.equal(state.donutY, 244);
  await move('ArrowRight', 1);
  checks.push('Escape cancels an active keyboard drag and restores ordinary character movement');

  await reset();
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  const button = await page.locator('#right').boundingBox();
  const finger = { id: 1, x: button.x + button.width / 2, y: button.y + button.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  await wait(() => window.__wulong.snapshot().state.p.x > 80);
  await page.keyboard.down('KeyD');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const touchReleased = (await snapshot()).state.p.x;
  await frames(6);
  assert((await snapshot()).state.p.x > touchReleased + 5);
  await page.keyboard.up('KeyD');
  await frames();
  const stopped = (await snapshot()).state.p.x;
  await frames(6);
  assert.equal((await snapshot()).state.p.x, stopped);
  await page.locator('#jump').tap();
  await wait(() => !window.__wulong.snapshot().state.p.grounded);
  await settle();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  checks.push(
    '390px mobile layout: touch movement/jump still work, cancellation preserves another held keyboard source, and controls do not overflow',
  );

  assert.deepEqual(errors, []);
  console.log(checks.join('\n'));
} catch (error) {
  console.error(JSON.stringify(await snapshot()));
  throw error;
} finally {
  await browser.close();
}
