import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const base = process.env.BASE_URL || 'http://127.0.0.1:43441';
await mkdir('outputs', { recursive: true });
try {
  for (const [width, height] of [[1920, 1080], [1440, 900], [390, 844], [320, 568], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/?dev=1&motion=reduce`);
    assert.equal(await page.locator('[data-game-fullscreen]').count(), 0);
    await page.locator('#level-select').tap();
    await page.getByTestId('level-button-1').tap();
    await page.waitForSelector('#cop-actor-0');
    assert.equal(await page.locator('[data-game-fullscreen]:visible, .map-expand-button:visible').count(), 0,
      'A level never shows fullscreen or map expansion controls');
    await page.getByTestId('cop-0').tap();
    await page.getByTestId('node-1').tap();
    await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
    if (width === 1920 || width === 390) await page.screenshot({ path: `outputs/fullscreen-play-${width}.png` });
    await page.locator('#focus-toggle').tap();
    await page.locator('#resume-patrol').tap();
    assert.equal(await page.locator('body').getAttribute('data-turn'), '1', 'Returning home preserves gameplay');
    await page.getByTestId('undo').tap();
    assert.equal(await page.locator('body').getAttribute('data-turn'), '0');
    assert.deepEqual(errors, []);
    await context.close();
  }
  for (const platform of ['web', 'h5']) {
    for (const source of ['query', 'config']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      if (source === 'config') await context.addInitScript(platform => { window.__COMPETITION_CONFIG__ = { platform }; }, platform);
      const page = await context.newPage();
      await page.goto(`${base}/?dev=1&motion=reduce${source === 'query' ? `&platform=${platform}` : ''}`);
      await page.locator('#home-start').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-game-fullscreen]:visible').count(), 0, `${source} ${platform} has no fullscreen entry`);
      await context.close();
    }
  }

  // Embedded mini-game and native hosts identify themselves with either supported platform input.
  for (const platform of ['wechat', 'bilibili', 'douyin', 'kuaishou', 'ios', 'android']) {
    for (const source of ['query', 'config']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      if (source === 'config') await context.addInitScript(platform => { window.__COMPETITION_CONFIG__ = { platform }; }, platform);
      const page = await context.newPage();
      await page.goto(`${base}/?dev=1&motion=reduce${source === 'query' ? `&platform=${platform}` : ''}`);
      await page.locator('#home-start').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-game-fullscreen]:visible').count(), 0, `${source} ${platform} must suppress fullscreen`);
      await page.locator('#level-select').tap();
      await page.getByTestId('level-button-1').tap();
      await page.waitForSelector('#cop-actor-0');
      assert.equal(await page.locator('[data-game-fullscreen]:visible, .map-expand-button:visible').count(), 0);
      await page.locator('#focus-toggle').tap();
      assert.equal(await page.locator('[data-game-fullscreen]:visible').count(), 0, 'Returning home retains platform gating');
      await context.close();
    }
  }
  console.log('PASS home return: 5 viewports, touch movement, retained progress and no fullscreen controls across Web/native inputs');
} finally { await browser.close(); }
