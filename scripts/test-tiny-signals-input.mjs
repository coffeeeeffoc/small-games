import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium, expect } from '@playwright/test';
import { LEVELS } from '../games/local/tiny-signals/levels.mjs';
import { createState, step } from '../games/local/tiny-signals/rules.mjs';
import { exerciseStandalone } from '../apps/shell-web/scripts/standalone-game-checks.mjs';

const port = '15186';
const server = spawn(process.execPath, ['server.mjs', '--port', port, '--host', '127.0.0.1'], {
  cwd: new URL('../games/local/tiny-signals/', import.meta.url),
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
try {
  await Promise.race([
    once(server.stdout, 'data'),
    once(server, 'exit').then(([code]) => {
      throw new Error(`Server exited: ${code}`);
    }),
  ]);
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  const ready = () => expect(page.locator('#game-root')).toHaveAttribute('data-busy', 'false');
  const moves = (n) => expect(page.locator('#moves')).toHaveText(String(n).padStart(2, '0'));
  const cdp = await context.newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  async function swipe(x, y, dx, dy, cancel = false) {
    await touch('touchStart', [{ x, y, id: 1 }]);
    for (let i = 1; i <= 4; i++) {
      await page.waitForTimeout(30);
      await touch('touchMove', [{ x: x + (dx * i) / 4, y: y + (dy * i) / 4, id: 1 }]);
    }
    await touch(cancel ? 'touchCancel' : 'touchEnd', []);
    await ready();
  }
  await ready();
  await expect(page.locator('.direction-pad')).toBeHidden();
  await expect(page.locator('#control-note')).toContainText('任意位置滑动');
  let state = createState(LEVELS[0]);
  // Real touch input from the heading, board, empty gutter and fixed controls.
  for (const [x, y, dx, dy, direction] of [
    [180, 120, 90, 10, 'right'],
    [100, 330, 5, -85, 'up'],
    [8, 340, 0, 80, 'down'],
    [220, 805, -90, 0, 'left'],
  ]) {
    await swipe(x, y, dx, dy);
    state = step(LEVELS[0], state, direction);
    await moves(state.turn);
    for (let i = 0; i < 4; i++) {
      await expect(page.locator(`[data-board="${i}"] [data-piece="robot"]`)).toHaveAttribute(
        'data-cell',
        String(state.boards[i].pos),
      );
    }
    assert.equal(await page.evaluate(() => scrollY), 0, 'single-finger input must not scroll');
  }
  await swipe(160, 300, 8, 5);
  await swipe(160, 300, 0, 90, true);
  await moves(4);

  // Swiping from a button must not also activate its click action.
  const restart = await page.locator('#restart').boundingBox();
  await swipe(restart.x + restart.width / 2, restart.y + restart.height / 2, 0, -90);
  await moves(5);
  await page.locator('#restart').tap();
  await moves(0);
  await page.locator('#preview-toggle').tap();
  await swipe(170, 300, 100, 0);
  await moves(0);
  await expect(page.locator('#commit-preview')).toHaveText('确认向右移动 →');
  await page.locator('#commit-preview').tap();
  await ready();
  await moves(1);
  await page.locator('#undo').tap();
  await moves(0);
  await page.locator('#help').tap();
  await swipe(170, 320, 80, 0);
  await moves(0);
  await expect(page.locator('#commit-preview')).toBeHidden();
  await page.locator('#close-help').tap();
  await expect(page.locator('#rules-dialog')).not.toBeVisible();
  await page.locator('#preview-toggle').tap();

  // Multiple fingers cancel movement and leave native scrolling available.
  await touch('touchStart', [
    { x: 150, y: 450, id: 1 },
    { x: 220, y: 450, id: 2 },
  ]);
  for (let y = 430; y >= 250; y -= 20) {
    await page.waitForTimeout(30);
    await touch('touchMove', [
      { x: 150, y, id: 1 },
      { x: 220, y, id: 2 },
    ]);
  }
  await page.waitForTimeout(150);
  await touch('touchEnd', []);
  await moves(0);
  assert.ok(
    await page.evaluate(() => scrollY > 0),
    'two-finger scrolling must reach lower page controls',
  );
  await page.locator('[data-level="1"]').tap();
  await expect(page.locator('#game-root')).toHaveAttribute('data-level', '1');
  await page.evaluate(() => scrollTo(0, 0));
  await exerciseStandalone(page, 'tiny-signals', true);

  // Pause/remount clear gestures and dispose removes all document listeners.
  await page.evaluate(async () => {
    const { gameDefinition } = await import('./game.mjs');
    window.inputGame = await gameDefinition.mount(document.querySelector('#game-root'));
  });
  await touch('touchStart', [{ x: 150, y: 300, id: 1 }]);
  await page.evaluate(() => {
    window.inputGame.pause();
    window.inputGame.resume();
  });
  await touch('touchMove', [{ x: 240, y: 300, id: 1 }]);
  await touch('touchEnd', []);
  await moves(0);
  await swipe(150, 300, 90, 0);
  await moves(1);
  await page.evaluate(() => window.inputGame.dispose());
  await touch('touchStart', [{ x: 150, y: 300, id: 1 }]);
  await touch('touchMove', [{ x: 240, y: 300, id: 1 }]);
  await touch('touchEnd', []);
  await expect(page.locator('#game-root')).toBeEmpty();

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1120 } });
  desktop.on('pageerror', (error) => errors.push(error.message));
  await desktop.goto(`http://127.0.0.1:${port}/`);
  await expect(desktop.locator('.direction-pad')).toBeVisible();
  let turns = 0;
  for (const key of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
    await desktop.keyboard.press(key);
    await expect(desktop.locator('#moves')).toHaveText(String(++turns).padStart(2, '0'));
    await expect(desktop.locator('#game-root')).toHaveAttribute('data-busy', 'false');
  }
  for (const direction of ['up', 'left', 'down', 'right']) {
    await desktop.locator(`[data-dir="${direction}"]`).click();
    await expect(desktop.locator('#moves')).toHaveText(String(++turns).padStart(2, '0'));
    await expect(desktop.locator('#game-root')).toHaveAttribute('data-busy', 'false');
  }
  await desktop.mouse.move(150, 300);
  await desktop.mouse.down();
  await desktop.mouse.move(240, 300);
  await desktop.mouse.up();
  await expect(desktop.locator('#moves')).toHaveText(String(turns).padStart(2, '0'));
  await exerciseStandalone(desktop, 'tiny-signals');
  assert.deepEqual(errors, []);
  console.log(
    'tiny-signals: mobile swipes, cancellation, preview, scrolling, lifecycle and desktop controls passed',
  );
} finally {
  await browser?.close();
  server.kill();
}
