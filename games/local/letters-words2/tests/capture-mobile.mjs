import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { restoreProgress, findSpelling } from '../engine.js';
import {
  chromium, browserOptions, activate, goHome, openLibrary,
  openImport, openHelp, openSettings, continueGame, pauseGame,
} from './browser-helpers.mjs';

const base = process.env.GAME_URL || 'http://127.0.0.1:4175/';
const output = process.env.QA_OUTPUT || 'docs/design/mobile-2026-10-06/implemented';
await mkdir(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
  const page = await context.newPage();
  const capture = async name => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: join(output, `h5-${name}-390x844.png`) });
  };
  await page.goto(base);
  await capture('home');
  await activate(page, '#islands-button');
  await capture('islands');
  await goHome(page);
  await activate(page, '#learn-button');
  await capture('learning');
  await openLibrary(page);
  await page.locator('#textbook-publisher option').first().waitFor({ state: 'attached' });
  await capture('book');
  await openImport(page);
  await page.locator('#word-input').fill("apple 苹果\nforest 森林\ncan't 不能\nice-cream 冰淇淋");
  await capture('custom');
  await goHome(page);
  await openHelp(page);
  await capture('help');
  await openSettings(page);
  await capture('settings');
  await goHome(page);
  await continueGame(page);
  await capture('play');
  await pauseGame(page);
  await capture('pause');
  await continueGame(page);
  for (;;) {
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('ciyu-progress')));
    if (record.completed.length === record.entries.length) break;
    const game = restoreProgress(record.entries, record.completed, Math.random, record.board);
    for (const id of findSpelling(game, game.activeWordId)) await page.locator(`[data-tile-id="${id}"]`).tap();
    await page.waitForFunction(count => Number(document.querySelector('#completed-count').textContent) > count, record.completed.length);
  }
  await page.locator('#win-dialog').waitFor({ state: 'visible' });
  await capture('result');
  await goHome(page);
  await activate(page, '#daily-start');
  await pauseGame(page);
  await activate(page, '#daily-share');
  await capture('share');
  console.log(`Saved 11 actual H5 screens at 390×844 to ${output}`);
} finally {
  await browser.close();
}
