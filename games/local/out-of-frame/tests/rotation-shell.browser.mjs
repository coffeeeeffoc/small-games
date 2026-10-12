import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { rotationChecks, expectDisplay } from './rotation.mjs';

const output = new URL('../test-results/rotation-shell/', import.meta.url);
await mkdir(output, { recursive: true });
const server = await preview({ root: fileURLToPath(new URL('../../../../apps/shell-web/', import.meta.url)), base: '/small-games/', preview: { host: '127.0.0.1', port: 0 } });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? process.env.CHROMIUM_PATH });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-11T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-11T00:00:01Z'));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/small-games/#/games/out-of-frame`);
  const frame = page.frameLocator('iframe');
  console.log('Shell route loaded');
  await expect(frame.locator('#start-button')).toBeVisible();
  await page.clock.runFor(100);
  await frame.locator('#start-button').tap();
  await page.clock.runFor(100);
  console.log('Shell game started');
  await expectDisplay(frame, true);
  await rotationChecks(page, frame);
  console.log('Shell rotations passed');
  await page.screenshot({ path: fileURLToPath(new URL('landscape.png', output)) });
  await frame.locator('#pause').tap();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectDisplay(frame, true);
  await page.screenshot({ path: fileURLToPath(new URL('portrait-pause.png', output)) });
  await frame.locator('#pause-home').tap();
  await expect(frame.locator('#start-button')).toBeVisible();
  await page.getByRole('button', { name: '返回目录', exact: true }).tap();
  await expect(page.locator('iframe')).toHaveCount(0);
  assert.deepEqual(errors, []);
  await writeFile(new URL('report.json', output), JSON.stringify({ browser: await browser.version(), viewport: '390x844 ↔ 844x390; 360x640 ↔ 640x360', checks: ['Shell iframe repeated rotation', 'pause state and resume', 'native touch movement, drag mapping and cancel', 'home and catalog return'], errors }, null, 2));
  console.log('Out of Frame Shell rotation, touch, pause and return passed');
} finally {
  await browser.close();
  await server.close();
}
