// Run after building the four games/submodules packages.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const allGames = ['fishing', 'office-slacking', 'tower-defense-game', 'xiangqi-five'];
const games = process.env.DIALOG_GAMES ? process.env.DIALOG_GAMES.split(',') : allGames;
assert.ok(
  games.length && games.every((game) => allGames.includes(game)),
  'choose known submodule games',
);
// Copied assets must match source; bundled games are freshly built before this runner.
for (const [game, files] of [
  ['xiangqi-five', ['index.html', 'app.js', 'style.css', 'fullscreen.js']],
  ['office-slacking', ['index.html', 'src/main.js', 'src/style.css']],
].filter(([game]) => games.includes(game)))
  for (const file of files) {
    const source = new URL(`../games/submodules/${game}/${file}`, import.meta.url);
    const built = new URL(`../games/submodules/${game}/dist/${file}`, import.meta.url);
    const builtData = await readFile(built);
    const copiedData =
      game === 'xiangqi-five' && file === 'index.html'
        ? Buffer.from(
            builtData.toString().replace('<script defer src="./competition.js"></script>', ''),
          )
        : builtData;
    assert.deepEqual(
      copiedData,
      await readFile(source),
      `${game}/${file}: build must match source`,
    );
  }
const screenshotKeys = new Set();
if (process.env.DIALOG_SCREENSHOT_DIR)
  await mkdir(process.env.DIALOG_SCREENSHOT_DIR, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
};
const server = createServer(async (request, response) => {
  try {
    const [game, ...parts] = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      .slice(1)
      .split('/');
    assert.ok(games.includes(game));
    const output = game === 'tower-defense-game' ? 'dist-pages' : 'dist';
    const root = fileURLToPath(new URL(`../games/submodules/${game}/${output}/`, import.meta.url));
    const file = path.resolve(root, parts.join('/') || 'index.html');
    assert.ok(file.startsWith(root), 'asset path stays within its built game');
    const data = await readFile(file);
    response
      .writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' })
      .end(data);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  channel: process.env.BROWSER_CHANNEL || undefined,
});
const base = `http://127.0.0.1:${server.address().port}`;
function noExtraControls(dialog) {
  return dialog.evaluate((element) =>
    [...element.querySelectorAll('button')].every(
      (button) =>
        !button.matches('[data-game-fullscreen], .dialog-close, .close-button') &&
        !/[×✕✖]|full.?screen|全屏/i.test(button.textContent) &&
        !button.querySelector('svg.lucide-x'),
    ),
  );
}
async function closePanel(page, dialog, close, input) {
  assert.equal(
    await noExtraControls(dialog),
    true,
    'modal has neither fullscreen nor a close cross',
  );
  const key = `${new URL(page.url()).pathname.split('/')[1]}-${page.viewportSize().width}`;
  if (process.env.DIALOG_SCREENSHOT_DIR && !screenshotKeys.has(key)) {
    await page.screenshot({
      path: path.join(process.env.DIALOG_SCREENSHOT_DIR, `${key}.png`),
      fullPage: true,
    });
    screenshotKeys.add(key);
  }
  await close[input]();
  await dialog.waitFor({ state: 'hidden' });
}
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 800 },
      isMobile: touch,
      hasTouch: touch,
      reducedMotion: 'reduce',
    });
    const input = touch ? 'tap' : 'click';
    for (const game of games) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/${game}/`);
      if (game === 'xiangqi-five') {
        assert.equal(await page.locator('dialog').count(), 0, 'xiangqi uses full pages');
        await page.locator('#home-start')[input]();
        await page.locator('#mode-local')[input]();
        await page.locator('#setup-start')[input]();
        await page.locator('#game-more')[input]();
        const fullscreen = page.locator('section[data-screen="tools"] [data-game-fullscreen]');
        await fullscreen[input]();
        await page.waitForFunction(() => Boolean(document.fullscreenElement));
        for (const [open, panelId, close] of [
          ['tools-rules', 'rules-dialog', 'rules-close'],
          ['history-open', 'history-dialog', 'history-close'],
          ['new-game', 'restart-dialog', 'restart-cancel'],
        ]) {
          for (let repeat = 0; repeat < 2; repeat++) {
            await page.locator(`#${open}`)[input]();
            const panel = page.locator(`#${panelId}`);
            await panel.waitFor({ state: 'visible' });
            await closePanel(page, panel, page.locator(`#${close}`), input);
            await page.waitForFunction(() => document.body.dataset.screen === 'tools');
            assert.equal(
              await page.evaluate(() => Boolean(document.fullscreenElement)),
              true,
              'return to game keeps fullscreen',
            );
          }
        }
        await page.locator('#tools-close')[input]();
        await page.waitForFunction(() => document.body.dataset.screen === 'game');
        await page.locator('#game-back')[input]();
        for (const [open, panelId, close] of [
          ['room-open', 'room-dialog', 'room-close'],
          ['challenge-open', 'challenge-dialog', 'challenge-close'],
        ]) {
          await page.locator('#home-start')[input]();
          for (let repeat = 0; repeat < 2; repeat++) {
            await page.locator(`#${open}`)[input]();
            await closePanel(page, page.locator(`#${panelId}`), page.locator(`#${close}`), input);
            await page.waitForFunction(() => document.body.dataset.screen === 'modes');
            assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), true);
          }
          await page.locator('section[data-screen="modes"] [data-back]')[input]();
          await page.waitForFunction(() => document.body.dataset.screen === 'home');
        }
        await page.locator('#home-start')[input]();
        await page.locator('#mode-local')[input]();
        await page.locator('#setup-start')[input]();
        await page.locator('#game-more')[input]();
        await fullscreen[input]();
        await page.waitForFunction(() => !document.fullscreenElement);
        await page.locator('#tools-close')[input]();
        await page.waitForFunction(() => document.body.dataset.screen === 'game');
        await page.locator('.cell').first()[input]();
        assert.equal(
          await page.locator('#history-count').textContent(),
          '1',
          'board remains playable after all page round trips',
        );
      } else if (game === 'office-slacking') {
        await page.locator('#start')[input]();
        for (const opener of ['pause', 'help'])
          for (let repeat = 0; repeat < 2; repeat++) {
            await page.locator(`#${opener}`)[input]();
            await closePanel(page, page.locator('#pause-dialog'), page.locator('#resume'), input);
          }
        await page.locator('#pause')[input]();
        await closePanel(page, page.locator('#pause-dialog'), page.locator('#restart'), input);
        assert.equal(await page.locator('#pause').isVisible(), true);
      } else if (game === 'fishing') {
        await page.getByRole('button', { name: '开始航行' })[input]();
        for (let repeat = 0; repeat < 2; repeat++) {
          await page.getByRole('button', { name: '暂停', exact: true })[input]();
          for (const [name, panel, close] of [
            ['设置', '航行设置', '完成'],
            ['海域手册', '海域手册', '返回航行'],
          ]) {
            await page.getByRole('button', { name, exact: true })[input]();
            await closePanel(
              page,
              page.getByRole('dialog', { name: panel }),
              page.getByRole('button', { name: close }),
              input,
            );
            assert.equal(
              await page.locator('.overlay.modal:not(.sheet)').isVisible(),
              true,
              'closing nested sheet returns to paused game',
            );
          }
          await page.getByRole('button', { name: '继续航行' })[input]();
        }
        assert.equal(
          await page.getByRole('button', { name: '暂停', exact: true }).isVisible(),
          true,
        );
      } else {
        for (let repeat = 0; repeat < 2; repeat++) {
          await page.getByRole('button', { name: '玩法说明', exact: true })[input]();
          const dialog = page.getByRole('dialog');
          await closePanel(
            page,
            dialog,
            page.getByRole('button', { name: '明白了，安排它们！' }),
            input,
          );
          assert.equal(
            await page.getByRole('button', { name: '玩法说明', exact: true }).isVisible(),
            true,
          );
        }
      }
      assert.deepEqual(errors, [], `${game}: no browser errors`);
      console.log(
        `PASS ${game}: ${touch ? 'touch' : 'desktop'} dialogs, repeat/return, no extra controls`,
      );
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
