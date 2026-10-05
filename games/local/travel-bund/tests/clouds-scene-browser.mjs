import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

// Full production city, actual cloud shader, camera projection and touch input.
const server = await preview({ root: fileURLToPath(new URL('../', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const output = new URL('../docs/design/controls-2026-10-06/', import.meta.url);
const errors = [], results = [];
await mkdir(output, { recursive: true });
try {
  const viewports = [{ width: 844, height: 390 }, { width: 390, height: 844 }]
    .filter(viewport => !process.env.CLOUD_VIEWPORT || String(viewport.width) === process.env.CLOUD_VIEWPORT);
  for (const viewport of viewports) {
    console.log(`${viewport.width}: loading production city`);
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base + '?dev=1');
    await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
    await page.addStyleTag({ content: '.debug{display:none}' });
    await page.locator('#enter-world').tap();
    await expect(page.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
    const read = () => page.evaluate(() => window.SmallGamesDev.inspect().game);
    await expect.poll(async () => (await read())?.weather?.cloudCount, { timeout: 30000 }).toBe(12);
    const initial = (await read()).weather;
    assert.equal(initial.cloudTriangles, 24);
    assert.deepEqual(initial.atlasSize, [512, 256]);
    assert.equal(initial.projection.fov, 68);
    await page.waitForTimeout(700);
    await page.screenshot({ path: fileURLToPath(new URL(`playing-${viewport.width}.png`, output)) });
    console.log(`${viewport.width}: playing screenshot and default FOV verified`);
    const cdp = await context.newCDPSession(page);
    const x = viewport.width * 0.60, y = viewport.height * 0.28;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 5, x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 5, x, y: y + 130 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(700);
    await page.screenshot({ path: fileURLToPath(new URL(`clouds-sky-${viewport.width}.png`, output)) });
    console.log(`${viewport.width}: sky screenshot captured`);
    const beforePinch = (await read()).weather.projection;
    const left = { id: 7, x: viewport.width * 0.45, y }, right = { id: 8, x: viewport.width * 0.65, y };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
    left.x -= viewport.width * 0.07; right.x += viewport.width * 0.07;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [left, right] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await read()).weather.projection.fov, { timeout: 30000 }).toBeLessThan(beforePinch.fov);
    const zoomed = (await read()).weather.projection;
    assert.notDeepEqual(zoomed.matrix, beforePinch.matrix);
    console.log(`${viewport.width}: pinch changed real FOV to ${zoomed.fov}`);
    await page.getByRole('button', { name: '暂停', exact: true }).tap();
    const paused = (await read()).weather.time;
    await page.waitForTimeout(250);
    assert.equal((await read()).weather.time, paused);
    await page.getByRole('switch', { name: '生活动画', exact: true }).tap();
    await page.getByRole('button', { name: '继续漫游', exact: true }).tap();
    const reduced = (await read()).weather.time;
    await page.waitForTimeout(250);
    assert.equal((await read()).weather.time, reduced);
    console.log(`${viewport.width}: pause and reduced motion verified`);
    await page.getByRole('button', { name: '暂停', exact: true }).tap();
    await page.getByRole('button', { name: '夜色', exact: true }).tap();
    await page.getByRole('button', { name: '继续漫游', exact: true }).tap();
    await expect.poll(async () => (await read()).weather.cloudColour).toBe('627b96');
    assert.equal((await read()).weather.opacity, 0.55);
    await page.waitForTimeout(700);
    await page.screenshot({ path: fileURLToPath(new URL(`clouds-night-${viewport.width}.png`, output)) });
    console.log(`${viewport.width}: night screenshot captured`);
    results.push({ viewport, initial, zoomed, checks: ['full production cloud shader', 'touch pinch changes real FOV and projection matrix', 'pause freezes weather', 'reduced motion freezes weather', 'night tint and opacity'] });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('clouds-report.json', output), JSON.stringify({ results, errors, environment: 'Chromium ANGLE SwiftShader; desktop touch emulation; no physical-device acceptance' }, null, 2));
  console.log(JSON.stringify({ results, errors }));
} finally { await browser.close(); await server.close(); }
