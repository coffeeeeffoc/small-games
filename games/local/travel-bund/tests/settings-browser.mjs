import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// Real App and browser Pointer Lock, isolated scene to keep UI timing independent of GPU speed.
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const appModule = await server.transformRequest('/src/main.tsx');
const reactUrl = appModule.code.match(/from ["']([^"']*deps\/react\.js[^"']*)["']/)[1];
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  headless: true,
});
const output = new URL('../../../../.scratch/travel-bund-settings/', import.meta.url);
await mkdir(output, { recursive: true });
const checks = [],
  errors = [];
try {
  for (const embedded of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/src/Scene.tsx*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `
      import React from '${reactUrl}';
      const {useEffect,useRef}=React;
      export function Tour({onReady,onRenderer}) {
        const canvas=useRef(null);
        useEffect(()=>{onRenderer({domElement:canvas.current});onReady();},[]);
        return React.createElement('canvas',{ref:canvas,style:{width:'100%',height:'100%'}});
      }`,
      }),
    );
    if (embedded) {
      await page.route('**/embed', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<iframe src="/" allow="pointer-lock; fullscreen" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`,
        }),
      );
      await page.goto(base + 'embed');
    } else await page.goto(base);
    const app = embedded ? page.frames().find((frame) => frame.parentFrame()) : page;
    await expect(app.locator('main')).toHaveAttribute('data-ready', 'true');
    await app.locator('#enter-world').click();
    await expect(app.locator('main')).toHaveAttribute('data-phase', 'playing');
    if (!(await app.evaluate(() => Boolean(document.pointerLockElement))))
      await app.getByRole('button', { name: '鼠标环顾', exact: true }).click();
    await expect.poll(() => app.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Escape');
    await page.keyboard.up('KeyW');
    await expect.poll(() => app.evaluate(() => Boolean(document.pointerLockElement))).toBe(false);
    await expect(app.getByRole('dialog')).not.toBeVisible();
    await expect(app.locator('main')).toHaveAttribute('data-phase', 'playing');
    assert.equal(
      await app.evaluate(async () => [...(await import('/src/world.ts')).input.keys].length),
      0,
    );
    await app.getByRole('button', { name: '拍照', exact: true }).click();
    await expect(app.getByRole('status')).toContainText('已取景');
    await app.getByRole('button', { name: '打开旅行手记' }).click();
    await expect(app.getByRole('dialog')).toBeVisible();
    await app.getByRole('button', { name: '返回漫游', exact: true }).click();
    assert.equal(
      await app.evaluate(() => Boolean(document.pointerLockElement)),
      false,
      'Closing a panel keeps the cursor free',
    );
    await app.getByRole('button', { name: '暂停', exact: true }).click();
    const detail = app.getByRole('combobox', { name: '模型细节' });
    await detail.click();
    for (const value of ['balanced', 'light', 'original']) {
      await app.locator(`[role="option"][value="${value}"]`).click();
      await expect(detail).toHaveAttribute('aria-expanded', 'true');
      await expect(app.locator(`[role="option"][value="${value}"]`)).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(app.getByRole('listbox', { name: '模型细节选项' })).toBeVisible();
    }
    await page.screenshot({
      path: fileURLToPath(new URL(`desktop${embedded ? '-iframe' : ''}.png`, output)),
    });
    await app.getByRole('button', { name: '返回漫游', exact: true }).click();
    await app.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(app.locator('main')).toHaveAttribute('data-phase', 'paused');
    await expect(app.getByRole('dialog')).not.toBeVisible();
    await app.getByRole('button', { name: '继续漫游' }).click();
    await expect(app.locator('main')).toHaveAttribute('data-phase', 'playing');
    checks.push(
      `${embedded ? 'iframe' : 'standalone'}: real pointer lock / Esc, camera and journal clicks after unlocking, manual settings only, retained model choices, blur clears input with explicit resume`,
    );
    await context.close();
  }
  // Touch layouts: internal scrolling must not move the close or completion controls out of reach.
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 320, height: 568 },
  ]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.route('**/src/Scene.tsx*', (r) =>
      r.fulfill({
        contentType: 'text/javascript',
        body: 'export function Tour({onReady}) {queueMicrotask(onReady);return null;}',
      }),
    );
    await page.goto(base);
    await page.getByRole('button', { name: '游览设置' }).tap();
    const toggle = page.getByRole('switch', { name: '环境声音' });
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: '夜色', exact: true }).tap();
    await expect(page.locator('main')).toHaveClass(/night/);
    const detail = page.getByRole('combobox', { name: '模型细节' });
    await detail.tap();
    await page.locator('[role="option"][value="balanced"]').tap();
    await expect(detail).toHaveAttribute('aria-expanded', 'true');
    await page.locator('.panel-content').evaluate((el) => (el.scrollTop = el.scrollHeight));
    for (const name of ['返回首页', '完成']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      assert(box.y >= 0 && box.y + box.height <= viewport.height, `${name} stays in viewport`);
    }
    await page.screenshot({
      path: fileURLToPath(new URL(`settings-${viewport.width}.png`, output)),
    });
    await page.getByRole('button', { name: '完成', exact: true }).tap();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    checks.push(
      `${viewport.width}x${viewport.height}: touch switches, time segment, retained choice, independent scrolling, fixed close/completion`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('report.json', output),
    JSON.stringify(
      { checks, errors, scene: 'isolated; real App, native Pointer Lock and real touch' },
      null,
      2,
    ),
  );
  console.log(checks.join('\n'));
} finally {
  await browser.close();
  await server.close();
}
