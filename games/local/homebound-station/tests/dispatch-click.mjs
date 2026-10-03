import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../test-results/', import.meta.url); await mkdir(output, { recursive: true });
const server = process.env.GAME_URL ? undefined : await preview({ preview: { host: '127.0.0.1', port: 4329, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome', headless: true });
const report = [];
try {
  for (const width of [1500, 390, 360]) {
    const mobile = width < 600;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 940 }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage(); const errors = [], requests = []; page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:4329/');
    await expect(page.locator('[data-level="0"]')).toBeVisible();
    expect(requests.some(url => /broadleaf\.glb|asphalt\.jpg|\/scene-[^/]+\.js/.test(url))).toBe(false);
    if (width === 1500) await page.route('**/art/broadleaf.glb', route => route.abort());
    await page.locator('[data-level="0"]').click();
    if (width === 1500) {
      await expect(page.locator('#stage')).toHaveAttribute('data-scenery', 'fallback');
      await expect(page.locator('[data-vehicle]')).toHaveCount(12);
      await page.unroute('**/art/broadleaf.glb'); await page.locator('.scenery-status').click();
    }
    await expect(page.locator('#stage')).toHaveAttribute('data-scenery', 'ready');
    const visuals = () => page.evaluate(() => window.homeboundVisualSnapshot());
    const idle = await visuals(); await page.waitForTimeout(1300);
    expect((await visuals()).people).not.toEqual(idle.people);
    await expect(page.locator('#pause')).toHaveText('暂停');
    await expect(page.locator('[data-bay]')).toHaveCount(4); await expect(page.locator('[data-vehicle]')).toHaveCount(12);
    expect(await page.locator('body').innerText()).not.toMatch(/同行一组|未开放|预约|网约/);
    for (const label of await page.locator('[data-vehicle]').all()) {
      const box = await label.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await label.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(17);
    }
    await page.screenshot({ path: fileURLToPath(new URL(`readability-${width}.png`, output)) });
    const cdp = mobile ? await context.newCDPSession(page) : undefined;
    async function press(id, duration = 180, swipe = false, cancel = false) {
      const target = page.locator(`[data-vehicle="${id}"] b`); await expect(target).toBeVisible();
      const held = await target.elementHandle(), box = await target.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      else { await page.mouse.move(x, y); await page.mouse.down(); }
      await page.waitForTimeout(duration); expect(await held.evaluate(el => el.isConnected)).toBe(true);
      if (swipe) {
        if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 24, y: y + 45 }] });
        else await page.mouse.move(x + 24, y + 45, { steps: 5 });
      }
      if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
    }
    const snapshot = () => page.evaluate(() => window.homeboundSnapshot());
    if (mobile) { await press('巡01', 80, false, true); expect((await snapshot()).services.length).toBe(0); }
    await press('巡03', 180, true); expect((await snapshot()).services.length).toBe(0); await expect(page.locator('#notice')).toContainText('挡住');
    await press('巡01', 450, true); await expect.poll(async () => (await snapshot()).services.length).toBe(1);
    await page.locator('#pause').click(); const paused = await snapshot(), still = await visuals(); await page.waitForTimeout(500); expect(await snapshot()).toEqual(paused);
    expect((await visuals()).people).toEqual(still.people);
    await expect(page.locator('#pause svg rect')).toHaveCount(2);
    await page.locator('[data-action="sound"]').click(); await expect(page.locator('[data-action="sound"]')).toHaveText('声音：关');
    await page.locator('[data-action="resume"]').click();
    await expect.poll(async () => (await snapshot()).delivered.length, { timeout: 20000 }).toBe(2);
    await expect(page.locator('[data-bay="T1"]')).toHaveAttribute('data-bay-state', 'free');
    await expect(page.locator('[data-bay="T1"] small')).toHaveText('4人候车');
    await page.locator('#pause').click(); await page.locator('[data-action="retry"]').click();
    expect(requests.filter(url => url.endsWith('/asphalt.jpg'))).toHaveLength(1);
    expect(requests.filter(url => url.endsWith('/broadleaf.glb'))).toHaveLength(width === 1500 ? 2 : 1);
    expect((await snapshot()).services.length).toBe(0); expect((await snapshot()).vehicles.every(v => v.state === 'holding')).toBe(true);
    await press('巡01', 180); await expect.poll(async () => (await snapshot()).services.length).toBe(1);
    expect(errors).toEqual([]); report.push({ width, longPress: true, swipe: true, blocked: true, cancel: mobile, pause: true, retry: true, lazyAssets: true, idleAnimation: true, renderCalls: (await visuals()).calls, fallbackRetry: width === 1500, errors });
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
} finally { await writeFile(new URL('interaction-report.json', output), JSON.stringify(report, null, 2)); await browser.close(); if (server) await new Promise(resolve => server.httpServer.close(resolve)); }
