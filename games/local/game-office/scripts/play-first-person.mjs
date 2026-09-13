/* global document, innerWidth, window, DeviceOrientationEvent */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const app = fileURLToPath(new URL('..', import.meta.url));
const output = join(app, 'test-results');
await mkdir(output, { recursive: true });
const url = 'http://127.0.0.1:43214';
const server = spawn(
  process.execPath,
  [
    join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    '43214',
    '--strictPort',
  ],
  { cwd: app, stdio: 'pipe', windowsHide: true },
);
let logs = '';
server.stdout.on('data', (data) => {
  logs += data;
});
server.stderr.on('data', (data) => {
  logs += data;
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Wait for this Vite process. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    channel: process.env.OFFICE_BROWSER || 'chrome',
    headless: true,
  });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-12T00:00:01Z'));
  await page.goto(url);
  await page.getByRole('button', { name: '悄悄进入办公室' }).waitFor();
  await page.screenshot({ path: join(output, 'desktop-intro.png') });
  await page.getByRole('button', { name: '悄悄进入办公室' }).click();
  const walk = async (key, ms) => {
    await page.keyboard.down(key);
    await page.clock.runFor(ms);
    await page.keyboard.up(key);
  };
  await page.keyboard.press('c');
  await walk('w', 7300);
  await walk('d', 5200);
  assert.match(await page.locator('.office-interact').innerText(), /坐下打卡/);
  await page.screenshot({ path: join(output, 'desktop-arrived.png') });
  await page.keyboard.press('e');
  await page.getByRole('heading', { name: '有惊无险，坐下了。' }).waitFor();
  await page.screenshot({ path: join(output, 'desktop-win.png') });
  await page.getByRole('button', { name: '查看之后的日程' }).click();
  const combinations = [];
  for (const day of ['周一', '周二', '周三', '周四', '周五']) {
    await page.getByRole('button', { name: day, exact: true }).click();
    const texts = await page.locator('.office-agenda-list strong').allTextContents();
    combinations.push(texts.join('|'));
  }
  assert.equal(new Set(combinations).size, 5);
  await page.screenshot({ path: join(output, 'week-plan.png') });
  await page.getByRole('button', { name: '预览新的一周' }).click();
  assert.equal(
    await page.getByRole('button', { name: '周一', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  await page.getByRole('button', { name: '关闭场景表' }).click();
  await page.getByRole('button', { name: '悄悄进入办公室' }).click();
  await page.getByRole('button', { name: '打开一周场景表' }).click();
  await page.keyboard.press('Escape');
  await walk('w', 1500);
  await page.getByRole('button', { name: '关闭场景表' }).click();
  await page.getByRole('heading', { name: '先缓一口气。' }).waitFor();
  await page.getByRole('button', { name: '继续潜入' }).click();
  await page.clock.runFor(111000);
  await page.getByRole('heading', { name: '“你才刚来？”' }).waitFor();
  await page.close();

  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const phone = await context.newPage();
    phone.on('pageerror', (error) => errors.push(error.message));
    await phone.goto(url);
    await phone.getByRole('button', { name: '悄悄进入办公室' }).tap();
    const cdp = await context.newCDPSession(phone);
    const touch = (type, touchPoints) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const point = (id, x, y) => ({ id, x, y, radiusX: 8, radiusY: 8, force: 1 });
    await touch('touchStart', [point(1, 70, viewport.height - 90)]);
    await touch('touchMove', [point(1, 70, viewport.height - 150)]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await touch('touchStart', [
      point(1, 70, viewport.height - 150),
      point(2, viewport.width * 0.67, viewport.height * 0.53),
    ]);
    await touch('touchMove', [
      point(1, 70, viewport.height - 150),
      point(2, viewport.width * 0.83, viewport.height * 0.58),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await touch('touchEnd', []);
    await phone.getByRole('button', { name: '蹲下', exact: false }).tap();
    await phone.getByRole('button', { name: '站起来', exact: false }).waitFor();
    await phone.screenshot({ path: join(output, `phone-${viewport.width}.png`) });
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    await phone.getByRole('button', { name: '暂停', exact: true }).tap();
    await phone.getByRole('heading', { name: '先缓一口气。' }).waitFor();
    await phone.getByRole('button', { name: '继续潜入' }).tap();
    await phone.getByRole('button', { name: '体感视角' }).tap();
    // Real browser event path; sensor hardware and permission dialogs require a physical phone.
    await phone.evaluate(() => {
      window.dispatchEvent(
        new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 90, gamma: 0 }),
      );
      window.dispatchEvent(
        new DeviceOrientationEvent('deviceorientation', { alpha: 30, beta: 95, gamma: 0 }),
      );
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  process.stdout.write(
    JSON.stringify({
      status: 'passed',
      coverage: [
        'keyboard route to victory',
        'timeout and retry',
        'five distinct days and new week',
        'schedule pauses game',
        'portrait and landscape multitouch',
        'orientation event fallback',
      ],
      screenshots: output,
    }) + '\n',
  );
} finally {
  await browser?.close();
  server.kill();
}
