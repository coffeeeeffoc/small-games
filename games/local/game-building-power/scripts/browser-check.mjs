/* global window, document */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.resolve(
  root,
  '../../../test-results/building-power',
  process.env.BUILDING_POWER_URL ? 'shell' : 'standalone',
);
await mkdir(evidence, { recursive: true });
const require = createRequire(import.meta.url);
const external = process.env.BUILDING_POWER_URL;
const url = external || 'http://127.0.0.1:4186';
const server = external
  ? null
  : spawn(
      process.execPath,
      [
        path.resolve(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4186',
        '--strictPort',
      ],
      { cwd: root, stdio: 'pipe', windowsHide: true },
    );
let serverError = '';
server?.stderr.on('data', (data) => {
  serverError += data;
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
async function point(page, id) {
  const rect = await page.locator(`[data-action="${id}"]`).boundingBox();
  assert.ok(rect, `Missing control ${id}`);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
async function tap(page, id) {
  const p = await point(page, id);
  await page.mouse.click(p.x, p.y);
}
async function label(page) {
  return page.locator('canvas').getAttribute('aria-label');
}
async function painted(page) {
  return page
    .locator('canvas')
    .evaluate((canvas) => canvas.getContext('2d').getImageData(1, 1, 1, 1).data[3] > 0);
}
async function touchDrag(page, from, to, cancel = false) {
  const cdp = await page.context().newCDPSession(page),
    a = await point(page, from),
    b = await point(page, to);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
}
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Wait until the local preview is listening. */
    }
    if (i === 59) throw new Error(`Preview unavailable ${serverError}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const witness = JSON.parse(
    await readFile(
      path.resolve(root, '../../../test-results/building-power/shift-witness.json'),
      'utf8',
    ),
  );
  for (const [width, height] of external
    ? [
        [320, 568],
        [390, 932],
      ]
    : [
        [320, 568],
        [320, 740],
        [390, 932],
        [430, 932],
      ]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.clock.install();
    await page.goto(url);
    await expect(page.locator('[data-action="start"]')).toBeAttached();
    await page.screenshot({ path: path.join(evidence, 'lobby-' + width + 'x' + height + '.png') });
    await page.getByRole('button', { name: '全屏游玩', exact: true }).click();
    assert.ok(await painted(page));
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await tap(page, 'start');
    const stage = await page.locator('.bp-stage').boundingBox();
    assert.ok(stage.y >= 0 && stage.y + stage.height <= height + 1, 'entire playing surface fits');
    const rect = await page.locator('[data-action="room:l1-r1"]').boundingBox();
    assert.ok(rect.width >= 44 && rect.height >= 44, 'touch targets >=44 CSS pixels');
    await tap(page, 'room:l1-r1');
    assert.match(await label(page), /当前用电 780W/);
    await tap(page, 'room:l1-r1');
    assert.match(await label(page), /当前用电 80W/);
    await tap(page, 'room:l1-r1');
    await page.clock.runFor(2100);
    await touchDrag(page, 'room:l1-r1', 'room:l1-r4', true);
    assert.match(await label(page), /当前用电 780W/);
    await touchDrag(page, 'room:l1-r1', 'room:l1-r4');
    assert.match(await label(page), /当前用电 1380W/);
    await tap(page, 'cooling:l1-r2');
    await tap(page, 'room:l1-r2');
    assert.match(await label(page), /当前用电 1435W/);
    await tap(page, 'defer');
    await tap(page, 'room:l1-r4');
    await expect(page.locator('[data-action="defer"]')).toContainText('错峰 ×1');

    await page.screenshot({
      path: path.join(evidence, 'playing-' + width + 'x' + height + '.png'),
    });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const paused = await label(page);
    await page.clock.runFor(10000);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await label(page), paused);
    await page.getByRole('button', { name: '全屏游玩', exact: true }).click();
    assert.ok(await page.evaluate(() => !!document.fullscreenElement));
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await tap(page, 'resume');
    await tap(page, 'pause');
    await tap(page, 'menu');
    await page.locator('[data-action="start"]').focus();
    await page.keyboard.press('Enter');
    await page.clock.runFor(44000);
    assert.match(await label(page), /服务不足/);
    await tap(page, 'retry');
    assert.match(await label(page), /值班中.*当前用电 80W/);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      touch: true,
      atomicTransfer: true,
      cancel: true,
      cooling: true,
      pause: true,
      fullscreen: true,
      keyboard: true,
      errors,
    });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 932 } });
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install();
  await page.goto(url);
  await expect(page.locator('[data-action="start"]')).toBeAttached();
  await tap(page, 'start');
  await page.clock.runFor(34);
  let now = 0;
  for (const { tick, action } of witness.actions) {
    const ms = tick * 50;
    if (ms > now) await page.clock.runFor(ms - now);
    now = ms;
    if (action.type === 'connect' || action.type === 'disconnect')
      await tap(page, 'room:' + action.requestId);
    else if (action.type === 'cooling') await tap(page, 'cooling:' + action.requestId);
    else if (action.type === 'defer') {
      await tap(page, 'defer');
      await tap(page, 'room:' + action.requestId);
    } else if (action.type === 'battery') await tap(page, 'battery');
  }
  await page.clock.runFor(90100 - now);
  assert.match(await label(page), /值班成功/);
  await page.screenshot({ path: path.join(evidence, 'win.png') });
  const saved = await page.evaluate(() =>
    Object.entries(window.localStorage).find(([key]) => key.endsWith('building-power:progress')),
  );
  assert.ok(saved, 'progress was persisted');
  await page.reload();
  await expect(page.locator('[data-action="start"]')).toContainText('开始第2班');
  results.push({
    fullShiftWin: true,
    persistence: true,
    seed: witness.seed,
    actions: witness.actions.length,
  });
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ url, results }, null, 2));
  console.log(JSON.stringify({ evidence, results }, null, 2));
} finally {
  await browser.close();
  server?.kill();
}
