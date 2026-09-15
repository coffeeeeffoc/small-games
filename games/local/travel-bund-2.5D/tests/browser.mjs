import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
const output = new URL('../../../../.scratch/bund-flight/', import.meta.url);
await mkdir(output, { recursive: true });
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  preview: { host: '127.0.0.1', port: 0 },
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    let expectedFailure = false;
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        if (expectedFailure && message.location().url.endsWith('/lod/-1_0.glb')) return;
        errors.push(message.text());
        console.error(message.text());
      }
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await expect(page.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
    const scene = page.locator('.scene');
    assert.equal(Number(await scene.getAttribute('data-triangles')), 3484074);
    assert(Number(await scene.getAttribute('data-low-triangles')) < 500000);
    assert.equal(
      Number(await scene.getAttribute('data-detail-loaded')),
      0,
      'Initial overview loads no near detail tiles',
    );
    await page.screenshot({
      path: fileURLToPath(new URL(mobile ? 'mobile-overview.png' : 'overview.png', output)),
    });
    const original = await scene.getAttribute('data-camera');
    await page.waitForTimeout(350);
    assert.equal(
      await scene.getAttribute('data-progress'),
      '0.00000',
      'The visitor controls when travel begins',
    );
    await page.mouse.move(250, 350);
    await page.mouse.wheel(0, 120);
    await expect
      .poll(async () => Number(await scene.getAttribute('data-progress')))
      .toBeGreaterThan(0.01);
    const from = JSON.parse(original),
      first = JSON.parse(await scene.getAttribute('data-camera'));
    assert(
      Math.hypot(...first.map((n, i) => n - from[i])) > 100,
      'A single wheel notch has visible travel',
    );
    await page.mouse.wheel(0, -120);
    await expect.poll(() => scene.getAttribute('data-camera')).toBe(original);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '开始飞行', exact: true }).click();
    await expect.poll(() => scene.getAttribute('data-camera')).not.toBe(original);
    await page.getByRole('button', { name: '暂停飞行', exact: true }).click();
    const paused = await scene.getAttribute('data-camera');
    await page.waitForTimeout(300);
    assert.equal(await scene.getAttribute('data-camera'), paused);
    const slider = page.getByRole('slider', { name: '飞行进度' });
    for (const fraction of [0.29, 0.43, 0.71, 1]) {
      const box = await slider.boundingBox();
      await page.mouse.click(box.x + 8 + (box.width - 16) * fraction, box.y + box.height / 2);
      await expect
        .poll(async () => Number(await scene.getAttribute('data-progress')))
        .toBeGreaterThan(fraction - 0.03);
      if (fraction < 1)
        await expect
          .poll(async () => Number(await scene.getAttribute('data-detail-visible')), {
            timeout: 30000,
          })
          .toBeGreaterThan(0);
      await expect
        .poll(() => scene.getAttribute('data-detail-pending'), { timeout: 30000 })
        .toBe('0');
      await expect
        .poll(() => scene.getAttribute('data-detail-fading'), { timeout: 10000 })
        .toBe('0');
      await page.screenshot({
        path: fileURLToPath(new URL(`${mobile ? 'mobile-' : ''}flight-${fraction}.png`, output)),
      });
    }
    await page.getByRole('button', { name: '回到起点' }).click();
    await expect.poll(() => scene.getAttribute('data-camera')).toBe(original);
    await expect
      .poll(async () => Number(await scene.getAttribute('data-detail-visible')), { timeout: 10000 })
      .toBe(0);
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 240, y: 530 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 240, y: 230 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.wheel(0, 600);
    await expect
      .poll(async () => Number(await scene.getAttribute('data-progress')))
      .toBeGreaterThan(0.05);
    assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const box = await slider.boundingBox();
    await page.mouse.click(box.x + 8 + (box.width - 16) * 0.4, box.y + box.height / 2);
    await expect
      .poll(async () => Number(await scene.getAttribute('data-progress')))
      .toBeGreaterThan(0.39);
    await page.getByRole('button', { name: '开始飞行', exact: true }).click();
    await page.getByRole('button', { name: '暂停飞行', exact: true }).click();
    const settledPause = await scene.getAttribute('data-camera');
    await page.waitForTimeout(200);
    assert.equal(
      await scene.getAttribute('data-camera'),
      settledPause,
      'Pause stops even a damped camera',
    );
    // Horizontal input changes the view without moving along the route.
    const travelBeforeLook = await scene.getAttribute('data-progress');
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 130, y: 410 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 300, y: 410 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    } else {
      await page.mouse.move(400, 410);
      await page.mouse.down();
      await page.mouse.move(800, 410, { steps: 10 });
      await page.mouse.up();
    }
    await expect
      .poll(async () => Number(await scene.getAttribute('data-yaw')))
      .toBeGreaterThan(0.2);
    assert.equal(await scene.getAttribute('data-progress'), travelBeforeLook);
    await page.getByRole('button', { name: '视角归正', exact: true }).click();
    await expect.poll(() => scene.getAttribute('data-yaw')).toBe('0.0000');
    await page.getByRole('button', { name: '前往浦东天际线', exact: true }).click();
    await expect.poll(() => scene.getAttribute('data-progress')).toBe('0.70000');
    await expect(page.getByRole('button', { name: '前往浦东天际线', exact: true })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`${mobile ? 'mobile-' : ''}interactive-pudong.png`, output)),
    });
    if (!mobile) {
      await page.getByRole('button', { name: '回到起点' }).click();
      await expect.poll(() => scene.getAttribute('data-progress')).toBe('0.00000');
      await expect.poll(() => scene.getAttribute('data-detail-fading')).toBe('0');
      expectedFailure = true;
      await page.route('**/lod/-1_0.glb', (route) =>
        route.fulfill({ status: 503, body: 'Unavailable' }),
      );
      await page.getByRole('combobox', { name: '飞行速度' }).selectOption('2');
      await page.getByRole('button', { name: '开始飞行', exact: true }).click();
      const retry = page.getByRole('button', { name: '部分街区细节加载失败 · 点击重试' });
      await expect(retry).toBeVisible({ timeout: 30000 });
      await expect(page.locator('main')).toHaveAttribute('data-playing', 'true');
      await page.unroute('**/lod/-1_0.glb');
      await retry.click();
      await expect(retry).toBeHidden();
      expectedFailure = false;
      await expect
        .poll(() => scene.getAttribute('data-progress'), { timeout: 40000 })
        .toBe('1.00000');
      await expect(page.locator('main')).toHaveAttribute('data-playing', 'false');
      console.log(
        'Automatic full route completed; a failed detail request retained the overview and recovered.',
      );
    }
    console.log(
      `${mobile ? 'Touch' : 'Desktop'}: full scene fidelity, far silhouettes, lazy near detail, reversible fades, flight and input passed.`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
