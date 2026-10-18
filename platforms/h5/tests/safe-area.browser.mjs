import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const output = path.join(root, 'outputs/safe-area');
const games = {
  'cops-robbers': 'games/local/cops-robbers',
  'cops-robbers-realtime': 'games/local/cops-robbers-realtime',
  'xiangqi-five': 'games/submodules/xiangqi-five',
};
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/frame') {
      assert(Object.hasOwn(games, url.searchParams.get('game')));
      return res
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          `<meta name="viewport" content="width=device-width, initial-scale=1"><iframe title="game" src="/${games[url.searchParams.get('game')]}/dist/index.html" style="position:fixed;inset:0;border:0;width:100%;height:100%" allow="fullscreen"></iframe>`,
        );
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    assert(file.startsWith(root + path.sep) && !file.includes('/node_modules/'));
    const body = await readFile(file);
    res
      .writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH,
});
const checks = [];
async function protectedControl(scope, selector, top, height) {
  const element = scope.locator(selector).first();
  await expect(element).toBeVisible();
  await scope.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const box = await element.boundingBox();
  const safe = await scope.evaluate(() => ({
    left: parseFloat(document.documentElement.style.getPropertyValue('--game-host-left')) || 0,
    right: parseFloat(document.documentElement.style.getPropertyValue('--game-host-right')) || 0,
    bottom: parseFloat(document.documentElement.style.getPropertyValue('--game-host-bottom')) || 0,
    width: innerWidth,
  }));
  assert(
    box.x >= safe.left - 1 && box.x + box.width <= safe.width - safe.right + 1,
    `${selector} outside safe horizontal bounds: ${JSON.stringify(box)}`,
  );
  assert(
    box.y >= top - 1 && box.y + box.height <= height - safe.bottom + 1,
    `${selector} outside protected viewport: ${JSON.stringify(box)}, top=${top}, height=${height}`,
  );
}
try {
  for (const [width, height, host, framed] of [
    [390, 844, 'sdk', false],
    [320, 568, 'ua', false],
    [844, 390, 'sdk', false],
    [568, 320, 'sdk', false],
    [390, 844, 'browser', false],
    [390, 844, 'sdk', true],
  ]) {
    for (const [game, source] of Object.entries(games)) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
        isMobile: true,
        userAgent: host === 'ua' ? 'TapTap H5 MiniProgram' : undefined,
      });
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.addInitScript((host) => {
        if (host === 'sdk')
          globalThis.tap = {
            getWindowInfo() {
              return {
                windowWidth: innerWidth,
                windowHeight: innerHeight,
                safeArea: {
                  top: innerWidth > innerHeight ? 0 : 59,
                  left: innerWidth > innerHeight ? 59 : 0,
                  right: innerWidth - (innerWidth > innerHeight ? 34 : 0),
                  bottom: innerHeight - 20,
                },
              };
            },
            getMenuButtonBoundingClientRect() {
              return {
                top: innerWidth <= innerHeight ? 52 : 12,
                bottom: innerWidth <= innerHeight ? 85 : 44,
              };
            },
          };
      }, host);
      try {
        await page.goto(
          `http://127.0.0.1:${server.address().port}/${framed ? 'frame?game=' + game : source + '/dist/index.html'}`,
        );
        const scope = framed ? page.frames().find((frame) => frame !== page.mainFrame()) : page;
        await scope.waitForFunction(() =>
          document.documentElement.style.getPropertyValue('--game-safe-area-top'),
        );
        const top = host === 'browser' ? 4 : host === 'sdk' ? (width <= height ? 89 : 48) : 96;
        const railTop = host === 'sdk' && width <= height ? 63 : 4;
        if (game === 'xiangqi-five') {
          await expect(scope.locator('#loading-screen')).toBeHidden();
          await expect(scope.locator('.app-shell')).toHaveJSProperty('inert', false);
        } else {
          const railSelector = game === 'cops-robbers' ? '.brand' : '.profile-portrait';
          await protectedControl(scope, railSelector, railTop, height);
          assert(
            Math.abs((await scope.locator(railSelector).boundingBox()).y - railTop) <= 1,
            'Home icon must sit directly below the cutout',
          );
        }
        await expect(scope.locator('[data-fullscreen-toggle]')).toHaveCount(0);
        if (host !== 'browser')
          await page.evaluate((top) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `position:fixed;inset:0 0 auto auto;width:110px;height:${top - 4}px;z-index:2147483647;background:#122d3b99;color:white;text-align:center;font:12px sans-serif;pointer-events:auto`;
            overlay.textContent = '宿主顶部遮挡区（浏览器模拟）';
            document.body.append(overlay);
          }, top);
        if (game === 'cops-robbers') {
          for (const selector of ['#sound', '#settings'])
            await protectedControl(scope, selector, railTop, height);
          for (const selector of ['.home-kicker', '#home-start'])
            await protectedControl(scope, selector, top, height);
          await page.screenshot({
            path: path.join(output, `${game}-${width}-${host}-${framed}-home.png`),
          });
          await scope.locator('#home-start').tap();
          await expect(scope.locator('#board')).toBeVisible();
          for (const selector of [
            '#focus-toggle',
            '.game-heading',
            '.board-hud',
            '#restart',
            '#board',
          ])
            await protectedControl(scope, selector, top, height);
          await page.screenshot({
            path: path.join(output, `${game}-${width}-${host}-${framed}-play.png`),
          });
          await scope.locator('#restart').tap();
          await scope.locator('#share-level').tap();
          await expect(scope.locator('#share-url')).toHaveValue(/level=1/);
          await scope
            .locator('#share-dialog')
            .getByRole('button', { name: '返回游戏', exact: true })
            .tap();
          await scope.locator('#focus-toggle').tap();
          await scope.locator('#settings').tap();
          await protectedControl(scope, 'dialog[open]', top, height);
        } else if (game === 'cops-robbers-realtime') {
          await protectedControl(scope, '#settings-button', railTop, height);
          await page.screenshot({
            path: path.join(output, `${game}-${width}-${host}-${framed}-home.png`),
          });
          await scope.locator('#levels-button').tap();
          await protectedControl(scope, '#start-button', top, height);
          await scope.locator('#start-button').tap();
          for (const selector of ['.board-top', '#pause-button', '#sprint-button'])
            await protectedControl(scope, selector, top, height);
          await page.screenshot({
            path: path.join(output, `${game}-${width}-${host}-${framed}-play.png`),
          });
          await scope.locator('#pause-button').tap();
          await protectedControl(scope, '#resume-button', top, height);
          await scope.locator('#resume-button').tap();
        } else {
          for (const selector of [
            '.home-brand',
            '#home-title',
            '#home-start',
            '#challenge-quick-start',
            '#rules-open',
          ])
            await protectedControl(scope, selector, top, height);
          // The left settings control can sit beside the host's top-right capsule.
          await protectedControl(scope, '#home-settings', railTop, height);
          await page.screenshot({
            path: path.join(output, `${game}-${width}-${host}-${framed}-home.png`),
          });
          await scope.locator('#home-settings').tap();
          await protectedControl(scope, '.screen[data-screen="setup"] .screen-header', top, height);
          await scope.locator('.screen[data-screen="setup"] [data-back]').tap();
          await expect(scope.locator('#home-title')).toBeVisible();
          await scope.locator('#home-start').tap();
          await protectedControl(scope, '.screen[data-screen="modes"] .screen-header', top, height);
          await scope.locator('#mode-local').tap();
          await scope.locator('#setup-start').tap();
          for (const selector of ['#game-back', '#game-more', '#board', '#draw-button'])
            await protectedControl(scope, selector, top, height);
          await scope.locator('.cell').first().tap();
          await page.screenshot({
            path: path.join(output, `${game}-${width}-${host}-${framed}-play.png`),
          });
          await scope.locator('#game-more').tap();
          await protectedControl(scope, '.screen[data-screen="tools"] .screen-header', top, height);
        }
        assert.deepEqual(errors, []);
        checks.push({ game, width, height, host, framed, passed: true });
        console.log(`PASS safe area ${game} ${width}x${height} ${host}${framed ? ' iframe' : ''}`);
      } catch (error) {
        await page.screenshot({ path: path.join(output, `${game}-${width}-${host}-failure.png`) });
        throw error;
      } finally {
        await context.close();
      }
    }
  }
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify({ browser: browser.version(), realDeviceVerified: false, checks }, null, 2) +
      '\n',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
