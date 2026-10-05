import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// Exercise the real App and shared input with real touch events. The scene is isolated
// so software WebGL performance cannot turn control ownership into a timing test.
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const output = new URL('../../../../.scratch/travel-bund-controls/', import.meta.url);
const results = [], errors = [];
await mkdir(output, { recursive: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/src/Scene.tsx*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: 'export function Tour({onReady}) { queueMicrotask(onReady); return null; }',
    }));
    await page.goto(url);
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'intro');
    await expect(page.locator('main')).toHaveAttribute('data-quality', '0');
    await page.locator('#enter-world').tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
    const stick = page.getByRole('group', { name: '移动摇杆' });
    const box = await stick.boundingBox();
    await stick.evaluate((element) => {
      element.addEventListener('pointerdown', (event) => { window.stickOwner ??= event.pointerId; });
    });
    const cdp = await context.newCDPSession(page);
    const readInput = () => page.evaluate(async () => {
      const { input } = await import('/src/world.ts');
      return { stick: input.stick, look: input.look, active: input.active, keys: [...input.keys] };
    });
    const walking = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const looking = { id: 2, x: viewport.width * .6, y: viewport.height * .4 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [walking] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [walking, looking] });
    walking.y -= 30;
    looking.x += 35;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, looking] });
    assert((await readInput()).stick[1] < -.5);
    assert((await readInput()).look[0] > 30);

    const extraStick = { id: 3, x: box.x + box.width / 2 - 15, y: box.y + box.height / 2 + 10 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [walking, looking, extraStick] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [extraStick] });
    assert((await readInput()).stick[1] < -.5, 'Releasing an extra finger must preserve joystick movement');
    const extraLook = { id: 4, x: viewport.width * .7, y: viewport.height * .5 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [walking, looking, extraLook] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [extraLook] });
    const beforeLook = (await readInput()).look[0];
    looking.x += 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, looking] });
    await expect.poll(async () => (await readInput()).look[0], {
      message: 'The original look finger keeps controlling the camera',
    }).toBeGreaterThan(beforeLook + 15);

    await stick.evaluate((element) => element.releasePointerCapture(window.stickOwner));
    walking.y += 1;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, looking] });
    await expect.poll(async () => (await readInput()).stick).toEqual([0, 0]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.getByRole('button', { name: '暂停' }).tap();
    assert.deepEqual(await readInput(), { stick: [0, 0], look: [0, 0], active: false, keys: [] });
    assert.equal(await page.locator('select').count(),0,'Settings use the designed choice panel');
    const precision=page.getByRole('combobox',{name:'画面精度'});
    await precision.tap();
    await expect(precision).toHaveAttribute('aria-expanded','true');
    await page.keyboard.press('Escape');
    await expect(precision).toHaveAttribute('aria-expanded','false');
    await expect(page.getByRole('dialog')).toBeVisible();
    await precision.tap();
    await page.getByRole('heading',{name:'风景会等你。'}).tap();
    await expect(precision).toHaveAttribute('aria-expanded','false');
    await precision.focus();await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option',{name:'流畅',exact:true})).toBeFocused();
    await page.keyboard.press('End');await page.keyboard.press('Enter');
    await expect(page.locator('main')).toHaveAttribute('data-quality','2');
    await page.getByRole('combobox', {name:'画面精度'}).tap();
    await page.locator('[role="option"][value="' + '1' + '"]').tap();
    await expect(page.locator('main')).toHaveAttribute('data-quality', '1');
    await page.getByRole('combobox', {name:'画面精度'}).tap();
    await page.locator('[role="option"][value="' + '0' + '"]').tap();
    for(const detail of ['original','balanced','light']) {
      await page.getByRole('combobox', {name:'模型细节'}).tap();
    await page.locator('[role="option"][value="' + detail + '"]').tap();
      await expect(page.locator('main')).toHaveAttribute('data-render-detail',detail);
      assert.equal(await page.evaluate(()=>localStorage.getItem('travel-bund.render-detail.v1')),detail);
    }
    await page.getByRole('button', { name: '继续漫游' }).tap();
    assert((await readInput()).active);
    results.push({ viewport, checks: ['mobile defaults to smooth quality and allows switching', 'original joystick/look ownership survives extra fingers', 'lost joystick capture releases movement', 'pause clears controls and resume works'] });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('report.json', output), JSON.stringify({ results, errors, scene: 'isolated; no visual or performance assertion' }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
