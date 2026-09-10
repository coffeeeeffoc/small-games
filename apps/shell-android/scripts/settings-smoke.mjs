import assert from 'node:assert/strict';
import { _android, expect } from '@playwright/test';

const app = 'com.coffeeeeffoc.smallgames';
const [device] = await _android.devices();
assert(device, 'Start one Android emulator or test device first');
async function nodes() {
  await device.shell('uiautomator dump /data/local/tmp/small-games-settings.xml');
  const xml = (await device.shell('cat /data/local/tmp/small-games-settings.xml')).toString();
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map((node) =>
    Object.fromEntries([...node[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  );
}
async function tap(text) {
  const node = (await nodes()).find((n) => n.text === text || n['content-desc'] === text);
  assert(node, `Missing native control: ${text}`);
  const [left, top, right, bottom] = node.bounds.match(/\d+/g).map(Number);
  await device.shell(
    `input tap ${Math.floor((left + right) / 2)} ${Math.floor((top + bottom) / 2)}`,
  );
}
async function visible(text, expected = true) {
  assert.equal(
    (await nodes()).some((n) => n.text === text),
    expected,
    text,
  );
}
try {
  await device.shell(`am force-stop ${app}`);
  await device.shell(`am start -W -n ${app}/.MainActivity`);
  let page = await (await device.webView({ pkg: app })).page();
  await expect(page.locator('.catalog-grid article')).toHaveCount(6);
  await page.evaluate(() => localStorage.setItem('settings-smoke', 'keep-save'));
  await tap('应用设置');
  // This smoke check expects the default, disabled remote setting on the test device.
  await visible('检查并下载最新资源', false);
  await visible('下载并安装最新 APK');
  await tap('从 GitHub 加载并缓存游戏');
  await visible('检查并下载最新资源');
  await device.screenshot({ path: 'dist/android-settings.png' });
  await tap('重新加载（返回目录）');
  await tap('关闭');
  await expect(page.locator('.catalog-grid article')).toHaveCount(6);
  assert.equal(await page.evaluate(() => localStorage.getItem('settings-smoke')), 'keep-save');
  // Match the browser's asynchronous disk commit before testing process-death recovery.
  await page.waitForTimeout(6000);
  await device.shell(`am force-stop ${app}`);
  await device.shell(`am start -W -n ${app}/.MainActivity`);
  page = await (await device.webView({ pkg: app })).page();
  await expect(page.locator('.catalog-grid article')).toHaveCount(6);
  await tap('应用设置');
  await visible('检查并下载最新资源');
  await tap('从 GitHub 加载并缓存游戏');
  await visible('检查并下载最新资源', false);
  await tap('关闭');
  await expect(page.locator('.catalog-grid article')).toHaveCount(6);
  assert.equal(await page.evaluate(() => localStorage.getItem('settings-smoke')), 'keep-save');
  await page.evaluate(() => localStorage.removeItem('settings-smoke'));
  console.log(
    'Native settings, conditional update controls, reload, persisted toggle and save preservation passed',
  );
} finally {
  await device.close();
}
