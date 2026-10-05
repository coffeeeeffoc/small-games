import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL || 'http://127.0.0.1:43441';
const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const checks = [];
const homeControls = '.brand, #home-start, #level-select, #mobile-level-select, #settings, #help, #sound, #appearance-settings, #mode-settings, [data-game-fullscreen], .map-expand-button, #share-challenge';
try {
  await mkdir('outputs', { recursive: true });
  for (const [width, height] of [[390, 844], [320, 568], [844, 390], [667, 375], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/?level=1&motion=reduce`);
    await page.waitForSelector('#cop-actor-0');
    const layout = await page.evaluate(() => {
      const bounds = selector => {
        const element = document.querySelector(selector), rect = element.getBoundingClientRect();
        return { visible: !!element.getClientRects().length, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      };
      return {
        board: bounds('#board'), actions: bounds('.challenge-game .action-bar'), squad: bounds('.challenge-game .squad-row'),
        back: bounds('#focus-toggle'), scrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert.equal(await page.locator(`${homeControls.split(', ').join(':visible, ')}:visible`).count(), 0,
      'Home controls and fullscreen must leave the playing surface');
    for (const [name, target] of Object.entries(layout).filter(([, value]) => typeof value === 'object')) {
      assert.ok(target.visible, `${name} must be visible`);
      assert.ok(target.y >= -1 && target.bottom <= height + 1, `${name} outside ${width}x${height}: ${JSON.stringify(layout)}`);
      assert.ok(target.x >= -1 && target.right <= width + 1, `${name} exceeds viewport width`);
    }
    assert.ok(layout.scrollWidth <= width, 'No horizontal scrolling');
    assert.equal(await page.locator('#restart:visible, #undo:visible, #hint:visible').count(), 3, 'Core actions stay reachable');
    if (width === 390 || width === 844) await page.screenshot({ path: `outputs/focus-${width}.png` });
    await page.getByTestId('cop-0').tap();
    await page.getByTestId('node-1').tap();
    await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
    await page.locator('#focus-toggle').tap();
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('focus-play')), false);
    assert.ok(await page.locator('#home-start').isVisible(), 'Back returns to the game home');
    await page.locator('#help').tap();
    await page.locator('#help-dialog').waitFor({ state: 'visible' });
    await page.locator('#help-dialog .dialog-close').tap();
    await page.locator('#resume-patrol').tap();
    assert.equal(await page.locator('body').getAttribute('data-turn'), '1', 'Returning home preserves the patrol');
    await page.getByTestId('undo').tap();
    assert.equal(await page.locator('body').getAttribute('data-turn'), '0', 'Undo works after returning');
    assert.deepEqual(errors, []);
    checks.push({ width, height, layout, passed: true });
    await context.close();
  }
  await writeFile('outputs/focus-layout.json', JSON.stringify({ base, checks }, null, 2));
  console.log(`PASS ${checks.length} focused layouts, touch move, home/resume, home rules and undo`);
} finally { await browser.close(); }
