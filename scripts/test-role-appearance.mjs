import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const source = await readFile(new URL('../platforms/h5/role-appearance.js', import.meta.url));
const pageHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><button id="appearance">角色装扮</button><script type="module">import {openAppearanceSettings,getRoleAppearance} from '/appearance.js'; import {getRoleAppearance as secondAppearance} from '/appearance.js?pk'; window.secondAppearance=secondAppearance; secondAppearance('cop'); window.appearance=getRoleAppearance; document.querySelector('button').onclick=()=>openAppearanceSettings();</script></body></html>`;
const requests = [];
const server = createServer((request, response) => {
  requests.push({ url: request.url, method: request.method });
  response.setHeader(
    'Content-Type',
    request.url.startsWith('/appearance.js') ? 'text/javascript' : 'text/html; charset=utf-8',
  );
  response.end(request.url.startsWith('/appearance.js') ? source : pageHtml);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: '角色装扮', exact: true }).click();
  await page.getByLabel('追逐队样式').selectOption('animals');
  assert.equal(
    await page.evaluate(() => window.secondAppearance('cop').style),
    'animals',
    'bundled PK renderer sees local lobby changes',
  );
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e32626';
    ctx.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('突围队本地头像').setInputFiles({
    name: 'friend.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.appearance('robber').avatar.startsWith('data:image/jpeg;base64,')),
    )
    .toBe(true);
  await expect(page.locator('svg image')).toHaveCount(1);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('dialog').scrollWidth > document.querySelector('dialog').clientWidth,
    ),
    false,
  );
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('[data-role-appearance]')).toHaveCount(0);
  await expect(page.locator('#appearance')).toBeFocused();
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.appearance?.('cop').style)).toBe('animals');
  assert.ok(
    await page.evaluate(() =>
      window.appearance('robber').avatar.startsWith('data:image/jpeg;base64,'),
    ),
  );
  await page.locator('#appearance').click();
  await page
    .getByLabel('追逐队本地头像')
    .setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('status')).toContainText('请选择');
  await page
    .getByRole('group', { name: '突围队', exact: true })
    .getByRole('button', { name: '恢复默认形象' })
    .click();
  assert.equal(await page.evaluate(() => window.appearance('robber').avatar), '');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-role-appearance]')).toHaveCount(0);
  // A storage failure must preserve the previously saved choice and show an actionable error.
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await page.locator('#appearance').click();
  await page.getByLabel('追逐队样式').selectOption('cosmic');
  await expect(page.getByRole('status')).toContainText('原设置未改动');
  await expect(page.getByLabel('追逐队样式')).toHaveValue('animals');
  assert.deepEqual(errors, []);
  assert.ok(
    requests.every(
      (request) =>
        request.method === 'GET' &&
        ['/', '/appearance.js', '/appearance.js?pk', '/favicon.ico'].includes(request.url),
    ),
    'avatars must never leave the browser',
  );
  console.log(
    'Role appearance: local upload, both presets, persistence, reset, rejection, quota, focus, 320px layout, and no network upload passed.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
