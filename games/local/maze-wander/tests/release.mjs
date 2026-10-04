import { chromium } from '@playwright/test';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)),
  out = `${root}/docs/evidence`;
await mkdir(out, { recursive: true });
const server = await preview({
  configFile: false,
  root,
  preview: { host: '127.0.0.1', port: 4438, strictPort: true },
});
const url = 'http://127.0.0.1:4438',
  browser = await chromium.launch({ headless: true });
const errors = [],
  results = [];
async function newPage(script) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  if (script) await context.addInitScript(script);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page };
}
try {
  const scripts = await readdir(`${root}/dist/assets`);
  const bundle = (
    await Promise.all(
      scripts
        .filter((s) => s.endsWith('.js'))
        .map((s) => readFile(`${root}/dist/assets/${s}`, 'utf8')),
    )
  ).join('');
  assert.equal(bundle.includes('mazeDebug'), true, 'production retains explicit developer opt-in');
  assert.equal(bundle.includes('开发环境 · 全关试玩'), true);
  const { context, page } = await newPage();
  await page.route('**/frame-host', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><body style="margin:0"><iframe title="迷境漫游" src="${url}" allow="autoplay; fullscreen" allowfullscreen style="width:100vw;height:100vh;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto(`${url}/frame-host`);
  const frame = page.frameLocator('iframe');
  await frame.locator('#start').click();
  await frame.locator('#enter').click();
  await frame.locator('#maze-game[data-screen="playing"]').waitFor();
  assert.equal(await frame.locator('body').evaluate(() => 'mazeDebug' in window), false);
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await frame.locator('#maze-game[data-screen="pause"]').waitFor();
  const saved = await frame
    .locator('body')
    .evaluate(() => JSON.parse(localStorage.getItem('maze-wander:v1')));
  assert.ok(saved.run.x > 1);
  assert.ok(saved.run.seconds > 0.4);
  await frame.locator('#resume').click();
  await page.keyboard.press('m');
  await frame.locator('#maze-game[data-screen="map"]').waitFor();
  await page.screenshot({ path: `${out}/production-iframe.png` });
  results.push({
    check:
      'production build: same-origin iframe, real pointer lock, keyboard movement, pause, save and fog map; no developer API/menu',
    passed: true,
  });
  await context.close();

  const storage = await newPage(() => {
    Storage.prototype.getItem = () => {
      throw new Error('denied');
    };
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
  });
  await storage.page.goto(url);
  await storage.page.locator('#start').click();
  await storage.page.locator('#enter').click();
  await storage.page.locator('#maze-game[data-screen="playing"]').waitFor();
  assert.match(await storage.page.locator('[role="status"]').innerText(), /保存失败/);
  await storage.context.close();
  results.push({
    check: 'storage denial/quota failure keeps the game playable and shows a warning',
    passed: true,
  });

  const corrupt = await newPage(() => {
    localStorage.setItem('maze-wander:v1', '{broken');
    localStorage.setItem(
      'maze-wander:v1:profile',
      JSON.stringify({ version: 1, unlocked: 2, settings: { fov: 90 }, played: [1] }),
    );
  });
  await corrupt.page.goto(url);
  await corrupt.page.getByRole('button', { name: '旅行手记 · 选择关卡' }).click();
  assert.equal(await corrupt.page.locator('.level-card:not(:disabled)').count(), 2);
  assert.match(await corrupt.page.locator('[role="status"]').innerText(), /损坏/);
  await corrupt.context.close();
  results.push({ check: 'corrupt run uses independent progress/settings backup', passed: true });

  const graphics = await newPage(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).includes('webgl') ? null : original.call(this, type, ...args);
    };
  });
  await graphics.page.goto(url);
  await graphics.page.getByRole('heading', { name: '暂时无法展开这段风景' }).waitFor();
  await graphics.page.getByRole('button', { name: '重新载入', exact: true }).waitFor();
  await graphics.page.screenshot({ path: `${out}/webgl-fallback.png` });
  await graphics.context.close();
  results.push({ check: 'WebGL unavailable shows a recoverable error screen', passed: true });

  const lock = await newPage(() => {
    Element.prototype.requestPointerLock = () => Promise.reject(new Error('not supported'));
  });
  await lock.page.goto(url);
  await lock.page.locator('#start').click();
  await lock.page.locator('#enter').click();
  await lock.page.locator('#maze-game[data-screen="pause"]').waitFor();
  await lock.page.getByRole('button', { name: '拖动转向继续' }).click();
  await lock.page.locator('#maze-game[data-screen="playing"]').waitFor();
  await lock.context.close();
  results.push({
    check: 'pointer-lock denial offers playable drag-to-look fallback',
    passed: true,
  });
  const resources = await newPage();
  await resources.page.route('**/assets/*.js', (route) => route.abort());
  await resources.page.goto(url);
  await resources.page.getByRole('alert').waitFor();
  assert.match(await resources.page.getByRole('alert').innerText(), /检查网络连接/);
  await resources.page.unroute('**/assets/*.js');
  await resources.page.getByRole('button', { name: '重新载入', exact: true }).click();
  await resources.page.locator('#start').waitFor();
  await resources.context.close();
  results.push({
    check: 'missing JavaScript resources retain an accessible reload action and recover on retry',
    passed: true,
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${out}/release-report.json`,
    JSON.stringify(
      { date: new Date().toISOString(), browser: browser.version(), results, errors },
      null,
      2,
    ),
  );
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(`Release checks: ${results.length}; errors: ${errors.length}`);
