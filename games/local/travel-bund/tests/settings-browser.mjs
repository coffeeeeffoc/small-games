import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
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
      export function Tour({onReady,onRenderer,zoom}) {
        const canvas=useRef(null);
        useEffect(()=>{onRenderer({domElement:canvas.current});onReady();},[]);
        return React.createElement('canvas',{ref:canvas,'data-scene-zoom':zoom,style:{width:'100%',height:'100%'}});
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
    const readZoom = async () => Number(await app.locator('main').getAttribute('data-zoom'));
    await page.mouse.move(550, 300);
    await page.mouse.wheel(0, -350);
    assert.equal(await readZoom(), 1, 'The home preview ignores the wheel');
    await app.locator('#enter-world').click();
    await expect(app.locator('main')).toHaveAttribute('data-phase', 'playing');
    if (!(await app.evaluate(() => Boolean(document.pointerLockElement))))
      await app.locator('.look-mode').click();
    await expect.poll(() => app.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Escape');
    await page.keyboard.up('KeyW');
    await expect.poll(() => app.evaluate(() => Boolean(document.pointerLockElement))).toBe(false);
    await expect(app.getByRole('dialog')).not.toBeVisible();
    await expect(app.locator('main')).toHaveAttribute('data-phase', 'playing');
    await expect(app.getByRole('button', { name: '鼠标环顾', exact: true })).toBeVisible();
    await expect(app.locator('.keyboard-hint')).toContainText('点击画面也可恢复');
    assert.equal(
      await app.evaluate(async () => [...(await import('/src/world.ts')).input.keys].length),
      0,
    );
    // A click on the world restores actual Pointer Lock after Esc.
    await app.locator('.world canvas').click({ position: { x: 520, y: 310 } });
    await expect.poll(() => app.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await page.mouse.wheel(0, -350);
    await expect.poll(readZoom).toBeGreaterThan(1);
    const enlarged = await readZoom();
    await page.mouse.wheel(0, 150);
    await expect.poll(readZoom).toBeLessThan(enlarged);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100000);
    await expect.poll(readZoom).toBe(2.5);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 100000);
    await expect.poll(readZoom).toBe(0.75);
    assert(Math.abs(Number(await app.locator('canvas').getAttribute('data-scene-zoom')) - 0.75) < 0.001,
      'The renderer receives the clamped zoom');
    assert.deepEqual(await app.evaluate(() => [scrollX, scrollY]), [0, 0], 'Wheel zoom does not scroll the page');
    await page.keyboard.press('Escape');
    await expect.poll(() => app.evaluate(() => Boolean(document.pointerLockElement))).toBe(false);
    await app.locator('.look-mode').click();
    await expect.poll(() => app.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => app.evaluate(() => Boolean(document.pointerLockElement))).toBe(false);
    // The free cursor also supports zoom over the world, while HUD controls ignore it.
    await page.mouse.move(520, 310);
    await page.mouse.wheel(0, -200);
    await expect.poll(readZoom).toBeGreaterThan(0.75);
    const unlockedZoom = await readZoom();
    await app.getByRole('button', { name: '拍照', exact: true }).hover();
    await page.mouse.wheel(0, -350);
    assert.equal(await readZoom(), unlockedZoom, 'Scrolling over HUD buttons does not change zoom');
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
    const pausedZoom = await readZoom();
    const content = app.locator('.panel-content');
    const contentBox = await content.boundingBox();
    await page.mouse.move(contentBox.x + contentBox.width / 2, contentBox.y + contentBox.height / 2);
    await page.mouse.wheel(0, 400);
    assert.equal(await readZoom(), pausedZoom, 'Wheel in settings keeps camera zoom unchanged');
    await content.evaluate((element) => { element.scrollTop = 0; });
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
      `${embedded ? 'iframe' : 'standalone'}: real pointer lock / Esc, world and button restore mouse look, wheel zoom direction and bounds, HUD/home/settings ignore wheel, renderer receives zoom, no page scroll, camera/journal actions and settings, blur clears input with explicit resume`,
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
    page.on('pageerror', (error) => errors.push(error.message));
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
    for (const value of ['original', 'light', 'balanced']) {
      await page.locator(`[role="option"][value="${value}"]`).tap();
      await expect(detail).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('main')).toHaveAttribute('data-render-detail', value);
      assert.equal(await page.evaluate(() => localStorage.getItem('travel-bund.render-detail.v1')), value);
    }
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
