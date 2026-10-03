import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${process.env.SHELL_URL || 'http://127.0.0.1:4333'}/#/games/urban-breakout`);
  const frame = page.frameLocator('iframe[title="街区突围"]');
  await frame.locator('#start').click();
  await frame.locator('body').evaluate(
    () =>
      new Promise((resolve) => {
        const poll = () => (window.urbanSnapshot().tick > 30 ? resolve() : setTimeout(poll, 30));
        poll();
      }),
  );
  await frame.locator('#pause').click();
  await frame.locator('#resume').click();
  const before = await frame.locator('body').evaluate(() => window.urbanSnapshot());
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  assert.equal(await page.locator('iframe[title="街区突围"]').count(), 0);
  await page.goto(`${process.env.SHELL_URL || 'http://127.0.0.1:4333'}/#/games/urban-breakout`);
  await frame.locator('#start').waitFor();
  const reset = await frame.locator('body').evaluate(() => window.urbanSnapshot());
  assert.equal(reset.tick, 0);
  assert.equal(reset.started, false);
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    errors,
    beforeExitTick: before.tick,
    freshEntryTick: reset.tick,
    note: 'Actual Shell iframe, start/pause/resume, route exit/remount; only this game artifact refreshed.',
  };
  await writeFile(
    new URL('../docs/evidence/shell.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
