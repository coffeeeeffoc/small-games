import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { _android, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });

const app = 'com.coffeeeeffoc.wulongcity.debug';
const adbPath = process.env.ADB || path.join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const serial = process.env.WULONG_ANDROID_SERIAL || 'emulator-5554';
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true }).trim();
assert.equal(adb('shell', 'getprop', 'ro.kernel.qemu'), '1', 'This test installs only on an emulator');
const apk = fileURLToPath(new URL('../android/dist/wulong-city-taptap-debug.apk', import.meta.url));
const output = new URL('../docs/design/rewarded-android-2026-10-14/android-actual/', import.meta.url);
await mkdir(output, { recursive: true });
adb('install', '-r', apk);
adb('shell', 'pm', 'clear', app);
adb('shell', 'am', 'force-stop', app);
adb('shell', 'am', 'start', '-W', '-n', `${app}/com.coffeeeeffoc.wulongcity.MainActivity`);
const device = (await _android.devices()).find(value => value.serial() === serial);
assert(device, 'ADB device is visible to Playwright');
const connect = async () => {
  // A restarted process has a new WebView socket; the old device entry can remain briefly cached.
  const pid = Number(adb('shell', 'pidof', app));
  const matches = view => view.pkg() === app && view.pid() === pid;
  const view = device.webViews().find(matches) || await device.waitForEvent('webview', { predicate: matches, timeout: 30000 });
  const page = await view.page();
  page.setDefaultTimeout(30000);
  await page.waitForLoadState('domcontentloaded');
  return page;
};
const checks = [];
try {
  let page = await connect();
  async function tap(selector) {
    const target = page.locator(selector);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'home');
  assert.equal(await page.evaluate(() => !!window.WulongNative), true);
  assert.equal(await page.evaluate(() => !!window.WulongNative.provider), false);
  await device.screenshot({ path: fileURLToPath(new URL('home.png', output)) });
  await tap('#home-settings');
  await expect(page.locator('#fullscreen')).toBeHidden();
  await tap('#pause-home');
  // Debug visibility exposes read-only snapshots; no game state is changed by the test.
  await page.evaluate(() => localStorage.setItem('dev', '1'));
  await page.reload(); await tap('#start-game');
  await tap('#left');
  await page.waitForFunction(() => window.__wulong.snapshot().state.opened, null, { timeout: 20000 });
  const box = await page.locator('#right').boundingBox();
  const input = await page.context().newCDPSession(page);
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }] });
  await page.locator('#game[data-page="result"]').waitFor({ timeout: 20000 });
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await input.detach();
  await device.screenshot({ path: fileURLToPath(new URL('result.png', output)) });
  await tap('#next');
  await tap('#hint'); await expect(page.locator('#reward-hint')).toHaveCount(0);
  await tap('[data-more]'); await tap('[data-more]');
  await expect(page.locator('.hint-step')).toContainText('3 / 3');
  await tap('[data-close-hint]');
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'play');
  adb('shell', 'input', 'keyevent', '4');
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'pause');
  await device.screenshot({ path: fileURLToPath(new URL('pause.png', output)) });
  await tap('[data-resume]');
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'play');
  adb('shell', 'input', 'keyevent', '3');
  adb('shell', 'am', 'start', '-W', '-n', `${app}/com.coffeeeeffoc.wulongcity.MainActivity`);
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'pause');
  await tap('[data-resume]');
  const resumedTime = await page.evaluate(() => window.__wulong.snapshot().state.t);
  await page.waitForFunction(previous => window.__wulong.snapshot().state.t > previous + 0.1, resumedTime);
  assert(await page.evaluate(() => {
    const canvas = document.querySelector('#canvas');
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(value => value > 0);
  }), 'Game canvas continues rendering after native background/resume');
  // WebView CDP screenshots omit the hardware canvas surface; capture the Android compositor.
  await device.screenshot({ path: fileURLToPath(new URL('play.png', output)) });
  const save = await page.evaluate(() => localStorage.getItem('wulong-city-v1'));
  assert(JSON.parse(save).records['1']);
  await page.evaluate(() => localStorage.removeItem('dev'));
  await page.waitForTimeout(6000);
  adb('shell', 'am', 'force-stop', app);
  adb('shell', 'am', 'start', '-W', '-n', `${app}/com.coffeeeeffoc.wulongcity.MainActivity`);
  page = await connect();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'home');
  assert.equal(await page.evaluate(() => localStorage.getItem('wulong-city-v1')), save);
  await tap('#home-levels');
  await expect(page.locator('[data-level="2"]')).toBeEnabled();
  await expect(page.locator('[data-level="4"]')).toBeDisabled();
  await device.screenshot({ path: fileURLToPath(new URL('levels.png', output)) });
  assert.deepEqual(errors, []);
  checks.push('installed real debug APK', 'offline packaged game home and assets', 'native capabilities; ads disabled without config',
    'touch-only L01 completion and L02 unlock', 'free hints', 'native back/pause/background/resume', 'process restart restores real progress', 'browser fullscreen hidden');
  const apkReport = JSON.parse(await readFile(new URL('../android/dist/debug-report.json', import.meta.url)));
  await writeFile(new URL('verification.json', output), JSON.stringify({ environment: 'Android API 34 Pixel_3a emulator, system WebView', apkSha256: apkReport.sha256, checks, errors, physicalDeviceVerified: false, realAdsVerified: false }, null, 2) + '\n');
  console.log('PASS Android installed APK: ' + checks.join('; '));
} finally { await device.close(); }
