import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge' });
const base = process.env.BASE_URL || 'http://127.0.0.1:43441';
await mkdir('outputs', { recursive: true });
try {
  const page = await browser.newPage({ hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of [[1920, 1080], [1440, 900], [390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/?level=1&motion=reduce`);
    await page.waitForSelector('#cop-actor-0');
    const before = await page.locator('#board').boundingBox();
    await page.getByRole('button', { name: '放大地图', exact: true }).first().click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    const board = await page.locator('#board').boundingBox();
    for (const selector of ['#board', '.challenge-game .action-bar', '.challenge-game .squad-row']) {
      const bounds = await page.locator(selector).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1,
        `${selector} outside ${width}x${height}: ${JSON.stringify(bounds)}`);
    }
    if (width >= 1440) assert.ok(board.width > before.width * 1.5, 'Desktop map must grow substantially');
    assert.ok(board.width >= Math.min(width - 30, height - 170), 'Map uses available viewport');
    await page.getByTestId('cop-0').click();
    await page.getByTestId('node-1').click();
    await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
    if (width === 1920 || width === 390) await page.screenshot({ path: `outputs/map-expanded-${width}.png` });
    await page.getByRole('button', { name: '收起地图', exact: true }).first().click();
    await page.waitForFunction(() => !document.fullscreenElement && !document.body.classList.contains('map-expanded'));
    assert.equal(await page.locator('body').getAttribute('data-turn'), '1');
    await page.getByTestId('undo').click();
    assert.equal(await page.locator('body').getAttribute('data-turn'), '0');
  }
  // Expanding while already fullscreen must still enlarge the map, and collapsing retains that fullscreen.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/?level=1&motion=reduce`);
  await page.locator('.topbar [data-game-fullscreen]').click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.getByRole('button', { name: '放大地图', exact: true }).first().click();
  await page.getByRole('button', { name: '收起地图', exact: true }).first().click();
  assert.ok(await page.evaluate(() => !!document.fullscreenElement));
  await page.locator('.topbar [data-game-fullscreen]').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  // Denied fullscreen still provides a usable expanded map.
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('denied')); });
  await page.getByRole('button', { name: '放大地图', exact: true }).first().click();
  await page.waitForSelector('#game-display-notice:not([hidden])');
  assert.ok(await page.locator('body').evaluate(body => body.classList.contains('map-expanded')));
  await page.keyboard.press('Escape');
  assert.ok(!await page.locator('body').evaluate(body => body.classList.contains('map-expanded')));
  // Result dialogs remain above the expanded board and can exit native fullscreen.
  await page.goto(`${base}/?level=1&motion=reduce`);
  await page.getByRole('button', { name: '放大地图', exact: true }).first().click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.getByTestId('node-1').click();
  await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
  await page.getByTestId('node-1').click();
  await page.getByTestId('defeat').waitFor();
  await page.locator('#loss-dialog [data-game-fullscreen]').click();
  await page.waitForFunction(() => !document.fullscreenElement && !document.body.classList.contains('map-expanded'));
  await page.getByTestId('undo-loss').click();
  assert.equal(await page.locator('body').getAttribute('data-turn'), '1');
  // The duel board shares expansion controls and preserves its live game.
  await page.goto(base);
  await page.locator('#solo-mode').selectOption('escape');
  await page.locator('#start-mode').click();
  await page.locator('#duel-board [data-actor]').first().waitFor();
  await page.locator('.duel-game .map-expand-button').click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  const duelBoard = await page.locator('#duel-board').boundingBox();
  assert.ok(duelBoard.width > 800);
  await page.locator('.duel-game .map-expand-button').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.deepEqual(errors, []);
  console.log('PASS expanded map: 5 viewports, native fullscreen, live movement, undo, retained progress, existing fullscreen, denial fallback, Escape and duel board');
} finally {
  await browser.close();
}
