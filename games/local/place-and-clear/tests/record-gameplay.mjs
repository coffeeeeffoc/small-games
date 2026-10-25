import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { inputFor } from './cocos-input.mjs';
import { getLevel } from '../src/levels.mjs';
// Capture the production canvas with ordinary touch input; no developer state or ad fixtures.
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: fileURLToPath(new URL('../reports/gameplay-recording/', import.meta.url)), size: { width: 390, height: 844 } } });
  const page = await context.newPage(), input = inputFor(page), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.PLACE_AND_CLEAR_BROWSER_URL || 'http://localhost:4422');
  await input.ready();
  await page.waitForTimeout(2000);
  await input.control('start');
  for (const id of [1, 2, 3]) {
    await input.screen('brief');
    await page.waitForTimeout(1800);
    await input.control('begin');
    await input.screen('playing');
    await page.waitForTimeout(2000);
    for (const move of getLevel(id).solution) {
      await input.drag(move);
      await page.waitForTimeout(1300);
    }
    await input.screen('result');
    await page.waitForTimeout(2000);
    if (id < 3) await input.control('next');
  }
  const video = page.video();
  await context.close();
  if (errors.length) throw Error(errors.join('\n'));
  console.log(await video.path());
} finally { await browser.close(); }
