import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, devices, expect } from '@playwright/test';
import { RULES } from '../src/core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['server.mjs', '--dist'], {
  cwd: root,
  env: { ...process.env, PORT: '4484' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Preview exited ${code}`)));
});
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  headless: true,
});
const report = {
  browser: browser.version(),
  device: 'Pixel 7 / 390×844 native Chromium touch emulation',
  checks: [],
  errors: [],
};
try {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.addInitScript(() => {
    window.__pauseActivations = [];
    document.addEventListener('click', (event) => {
      if (event.target.closest('button')?.id === 'pause')
        window.__pauseActivations.push({ trusted: event.isTrusted, detail: event.detail });
    });
  });
  await page.goto('http://127.0.0.1:4484');
  await page.locator('#start').tap();
  const touch = await context.newCDPSession(page);
  const snapshot = () => page.evaluate(() => __cageRescue.snapshot());
  const field = await page.locator('#scene').boundingBox();
  const control = await page.locator('#paddle-control').boundingBox();
  const send = (type, touchPoints = []) =>
    touch.send('Input.dispatchTouchEvent', { type, touchPoints });
  const pointAt = (x) => ({
    x: field.x + (x / 390) * field.width,
    y: control.y + control.height * 0.55,
  });
  await send('touchStart', [{ x: field.x + field.width / 2, y: field.y + field.height * 0.85 }]);
  assert.equal(
    (await snapshot()).activePointer,
    null,
    'touching the field does not grab the paddle',
  );
  await send('touchEnd');
  // Start inside the old paddle hit area: no grab offset is allowed on the strip.
  await send('touchStart', [pointAt(210)]);
  await expect.poll(async () => (await snapshot()).game.paddle.x).toBeCloseTo(210, 0);
  for (const target of [100, 290, 195]) {
    await send('touchMove', [pointAt(target)]);
    await expect.poll(async () => (await snapshot()).game.paddle.x).toBeCloseTo(target, 0);
  }
  for (const target of [1, 389]) {
    await send('touchMove', [pointAt(target)]);
    const width = (await snapshot()).game.paddle.w;
    const expected = target < 195 ? RULES.left + width / 2 : RULES.right - width / 2;
    await expect.poll(async () => (await snapshot()).game.paddle.x).toBeCloseTo(expected, 0);
    await expect(page.locator('#paddle-control')).toHaveAttribute(
      'aria-valuenow',
      target < 195 ? '0' : '100',
    );
  }
  await send('touchMove', [{ x: field.x + field.width + 25, y: control.y + 5 }]);
  assert.notEqual((await snapshot()).activePointer, null, 'capture survives leaving the control');
  await send('touchMove', [pointAt(195)]);
  await expect.poll(async () => (await snapshot()).game.paddle.x).toBeCloseTo(195, 0);
  const oldPointer = (await snapshot()).activePointer;
  await send('touchCancel');
  assert.equal((await snapshot()).activePointer, null);
  await page
    .locator('#paddle-control')
    .dispatchEvent('pointermove', { pointerId: oldPointer, clientX: field.x });
  await page.waitForTimeout(100);
  assert.equal((await snapshot()).game.paddle.x, 195, 'cancelled pointer cannot move the paddle');
  await page.locator('#paddle-control').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#paddle-control')).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('End');
  await expect(page.locator('#paddle-control')).toHaveAttribute('aria-valuenow', '100');
  await send('touchStart', [pointAt(195)]);
  await expect.poll(async () => (await snapshot()).game.paddle.x).toBeCloseTo(195, 0);
  await send('touchEnd');
  report.checks.push(
    'Separate strip maps absolute positions and both boundaries precisely; field touches are ignored; capture, cancellation and slider keyboard endpoints work',
  );
  await page.locator('#launch').tap();
  for (let i = 0; i < 8; i++) {
    const bounds = await page.locator('#paddle-control').boundingBox();
    const start = { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * 0.55 };
    const end = { x: bounds.x + bounds.width * (i % 2 ? 0.3 : 0.7), y: start.y };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
    if (i % 2) await expect.poll(async () => (await snapshot()).game.paddle.x).toBeLessThan(150);
    else await expect.poll(async () => (await snapshot()).game.paddle.x).toBeGreaterThan(240);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Deliberately no animation-frame wait, synthetic event or retry after the drag.
    await page.locator('#pause').tap();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
    assert.equal((await snapshot()).activePointer, null);
    assert.equal(await page.evaluate(() => __pauseActivations.length), i + 1);
    assert.equal(
      await page.evaluate(() => __pauseActivations.at(-1).trusted),
      false,
      'touch release invokes the game action once',
    );
    await page.locator('#resume').tap();
  }
  report.checks.push(
    'Eight native control-strip drags immediately followed by pause each activate exactly once; resume remains available',
  );
  const bounds = await page.locator('#pause').boundingBox();
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x - 90, y: point.y + 90 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
  assert.equal(
    await page.evaluate(() => __pauseActivations.length),
    8,
    'cancelled and moved-out presses cannot activate pause',
  );
  report.checks.push('Native touch cancellation and release outside the control produce no action');
  await page.locator('#pause').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
  assert.equal(await page.evaluate(() => __pauseActivations.length), 9);
  await page.locator('#resume').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
  await page.locator('#pause').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
  assert.equal(await page.evaluate(() => __pauseActivations.length), 10);
  await page.locator('#resume').tap();
  await page.locator('#pause').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
  assert.equal(await page.evaluate(() => __pauseActivations.length), 11);
  report.checks.push(
    'Keyboard Enter, mouse click, and real mouse immediately after touch retain their activation paths',
  );
  for (const lifecycle of ['blur', 'pagehide']) {
    const resumeBounds = await page.locator('#resume').boundingBox();
    const resumePoint = {
      x: resumeBounds.x + resumeBounds.width / 2,
      y: resumeBounds.y + resumeBounds.height / 2,
    };
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [resumePoint],
    });
    await page.evaluate((type) => window.dispatchEvent(new Event(type)), lifecycle);
    // The cancelled press must survive beyond the compatibility-click window;
    // release starts that window, rather than blur/pagehide starting a timer.
    await page.waitForTimeout(850);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
    if (lifecycle === 'pagehide')
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.locator('#resume').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
    await page.locator('#pause').tap();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
    await page.locator('#resume').tap();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
    await page.locator('#pause').tap();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
  }
  report.checks.push(
    'Native touch releases after blur/pagehide and an 850 ms hold stay cancelled; immediate keyboard and fresh touch activation remain available',
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../test-results/touch-activation-report.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.kill();
}
