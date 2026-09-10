import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { _android, expect as baseExpect } from '@playwright/test';

const expect = baseExpect.configure({ timeout: 30000 });

// Start an emulator (or connect one test phone) before running pnpm android:test.
const app = 'com.coffeeeeffoc.smallgames';
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const start = () => adb('shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`);
adb('install', '-r', fileURLToPath(new URL('../dist/moyu-arcade-debug.apk', import.meta.url)));
adb('shell', 'am', 'force-stop', app);
start();
const devices = await _android.devices();
assert.equal(devices.length, 1, 'Connect exactly one Android test device');
const device = devices[0];
async function connect() {
  const webview = await device.webView({ pkg: app }, { timeout: 30000 });
  const page = await webview.page();
  page.setDefaultTimeout(30000);
  return page;
}
try {
  let page = await connect();
  await device.shell(`am start -W -n ${app}/.MainActivity`);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith('https://appassets.androidplatform.net/') &&
      // The bundled tower-defense CSS has optional fonts; native WebView blocks them.
      !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(request.url()).hostname)
    )
      errors.push(`Unexpected network request: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  await page.reload();
  await expect(page.locator('.catalog-grid article')).toHaveCount(6);
  await expect(page.getByText('云存档账号', { exact: true })).toHaveCount(0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const output = new URL('../dist/', import.meta.url);
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('android-catalog.png', output)) });
  const cards = await page.locator('article h2').allTextContents();
  for (const title of cards) {
    await page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button')
      .click();
    await expect(page.locator('.game-page')).toBeVisible();
    if (await page.locator('iframe').count()) {
      const frame = page.frameLocator('iframe');
      if (title === '象五子棋') {
        await frame.locator('#draw-button').click();
        await frame.locator('.cell').first().click();
        await expect(frame.locator('.cell.last-play')).toHaveCount(1);
      } else if (title === '月森守卫') {
        await frame.getByRole('button', { name: '切换速度，当前1倍' }).click();
        await expect(frame.getByRole('button', { name: '切换速度，当前2倍' })).toBeVisible();
      } else {
        await frame.locator('#start').click();
        await expect(frame.locator('.game')).toHaveAttribute('data-phase', 'playing');
        await expect(frame.locator('#asset-error')).toBeHidden();
      }
    } else {
      await expect(page.locator('.game-slot')).not.toBeEmpty();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    await expect(page.locator('.game-page > nav button')).toBeEnabled();
    await device.shell('input keyevent 4');
    await expect(page.locator('.catalog-grid article')).toHaveCount(6);
    console.log(`Android launch / interaction / native back: ${title}`);
  }
  await page.evaluate(() => localStorage.setItem('android-smoke', 'persistent'));
  await device.shell('input keyevent 3');
  await device.shell(`am start -W -n ${app}/.MainActivity`);
  await expect(page.locator('.catalog-grid article')).toHaveCount(6);
  assert.deepEqual(errors, []);
  // Chromium batches localStorage disk writes; let the commit finish before simulating an abrupt kill.
  await page.waitForTimeout(6000);
  await device.shell(`am force-stop ${app}`);
  await device.shell(`am start -W -n ${app}/.MainActivity`);
  page = await connect();
  await expect(page.locator('.catalog-grid article')).toHaveCount(6);
  assert.equal(await page.evaluate(() => localStorage.getItem('android-smoke')), 'persistent');
  await page.evaluate(() => localStorage.removeItem('android-smoke'));
  console.log(
    'Android WebView: six games with networking blocked, mobile layout, background/resume and persistent storage passed.',
  );
} finally {
  await device.close();
}
