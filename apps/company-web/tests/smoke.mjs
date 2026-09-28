import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const screenshots = fileURLToPath(new URL('../../../outputs/company-web/', import.meta.url));
const server = await preview({
  root,
  base: '/company/',
  logLevel: 'error',
  preview: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;
try {
  const address = server.httpServer.address();
  assert(address && typeof address === 'object');
  browser = await chromium.launch();
  await mkdir(screenshots, { recursive: true });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(request.url()));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    const response = await page.goto(`http://127.0.0.1:${address.port}/company/`);
    assert.equal(response.status(), 200);
    assert.match(await page.title(), /上海能工智人科技有限公司/);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.intelligence-glyph').textContent(), '智');
    assert.equal(await page.locator('.service').count(), 3);
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    await expect(page.locator('.motion-toggle')).toBeVisible();
    assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
    assert(await page.locator('.motion-toggle').isDisabled());
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    assert.equal(
      await page.locator('body').evaluate((body) => getComputedStyle(body).margin),
      '0px',
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), '跳到正文');
    await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#main');
    for (const id of ['about', 'expertise', 'approach']) {
      await page.locator(`nav a[href="#${id}"]`).click();
      assert.equal(new URL(page.url()).hash, `#${id}`);
      const bounds = await page.locator(`#${id}`).boundingBox();
      assert(bounds.y >= 0 && bounds.y < 450, `${id} should be visible after navigation`);
    }
    await page.getByRole('link', { name: '返回顶部', exact: true }).click();
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    await page.getByRole('link', { name: '探索我们所做的' }).click();
    assert.equal(new URL(page.url()).hash, '#expertise');
    await page.getByRole('link', { name: '返回顶部', exact: true }).click();
    await page.screenshot({ path: `${screenshots}/${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/company/`);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  const button = page.getByRole('link', { name: '探索我们所做的' });
  for (const hover of [true, false, true, false]) {
    if (hover) await button.hover();
    else await page.mouse.move(10, 10);
    const frames = await button.evaluate(async (element) => {
      const samples = [];
      for (let i = 0; i < 16; i++) {
        await new Promise(requestAnimationFrame);
        const style = getComputedStyle(element);
        samples.push([style.backgroundImage, style.backgroundColor]);
      }
      return samples;
    });
    assert(
      frames.every(
        ([image, color]) => image.includes('linear-gradient') && color === 'rgb(50, 90, 235)',
      ),
      'CTA must retain its opaque blue gradient throughout hover transitions',
    );
  }
  const sculpture = page.locator('.sculpture');
  const initialTransform = await sculpture.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await expect
    .poll(() => sculpture.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(initialTransform);
  await page.locator('.hero-art').hover({ position: { x: 90, y: 120 } });
  await expect(page.locator('html')).toHaveAttribute('data-pointer', 'active');
  await expect
    .poll(() =>
      page.locator('.hero-art').evaluate((element) => element.style.getPropertyValue('--tilt-x')),
    )
    .not.toBe('');
  await page.screenshot({ path: `${screenshots}/motion-desktop.png` });
  const card = page.locator('.service').first();
  await card.scrollIntoViewIfNeeded();
  await card.hover({ position: { x: 65, y: 80 } });
  const cardBounds = await card.boundingBox();
  await page.mouse.move(cardBounds.x + 90, cardBounds.y + 100, { steps: 12 });
  await expect
    .poll(() => card.evaluate((element) => parseFloat(element.style.getPropertyValue('--tilt-y'))))
    .toBeLessThan(0);
  await expect
    .poll(() => card.evaluate((element) => getComputedStyle(element, '::before').opacity))
    .toBe('1');
  assert.equal(
    await card.evaluate((element) => getComputedStyle(element, '::after').content),
    'none',
  );
  await page.screenshot({ path: `${screenshots}/motion-card.png` });
  await page.getByRole('button', { name: '暂停动效', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
  assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
  assert.equal(await card.evaluate((element) => element.style.getPropertyValue('--tilt-y')), '');
  await page.getByRole('button', { name: '开启动效', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
  assert.deepEqual(errors, []);
  await page.close();

  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await touch.goto(`http://127.0.0.1:${address.port}/company/`);
  await expect(touch.locator('html')).toHaveAttribute('data-motion', 'on');
  await touch.locator('.hero-art').tap();
  assert.equal(await touch.locator('html').getAttribute('data-pointer'), null);
  assert.equal(
    await touch
      .locator('.hero-art')
      .evaluate((element) => element.style.getPropertyValue('--tilt-x')),
    '',
  );
  await touch.getByRole('button', { name: '暂停动效', exact: true }).tap();
  await expect(touch.locator('html')).toHaveAttribute('data-motion', 'off');
  await touch.close();
  console.log(
    'Company website passed: production subpath, assets, keyboard, navigation, 1440/390/320px, animation, pointer tilt, pause/resume, reduced motion, touch.',
  );
} finally {
  await browser?.close();
  await server.close();
}
