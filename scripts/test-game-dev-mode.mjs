import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results/dev-mode');
const catalog = JSON.parse(
  await readFile(path.join(root, 'apps/shell-web/src/standalone-games.json')),
);
const metadata = JSON.parse(
  await readFile(path.join(root, 'apps/shell-web/src/game-meta.json')),
).games;
const selected = process.env.DEV_MODE_GAME_IDS?.split(',');
const allGames = Object.entries(metadata).map(([id, game]) => ({
  id,
  source: game.source,
  standalone: catalog.some((entry) => entry.id === id),
  dist: path.join(root, game.source, catalog.find((entry) => entry.id === id)?.output ?? 'dist'),
}));
const games = allGames.filter(({ id }) => !selected || selected.includes(id));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/fixture') {
      const child = url.searchParams.get('child');
      response
        .writeHead(200, { 'Content-Type': mime['.html'] })
        .end(
          `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><iframe style="width:100%;height:95vh;border:0" src="${child.replaceAll('"', '&quot;')}"></iframe>`,
        );
      return;
    }
    const independent = url.pathname.match(/^\/independent\/([^/]+)(\/.*)$/);
    const directory = independent
      ? allGames.find((game) => game.id === independent[1])?.dist
      : path.join(root, 'apps/shell-web/dist');
    assert(directory, 'Unknown game');
    const suffix = independent ? independent[2] : url.pathname.replace(/^\/small-games/, '');
    let file = path.resolve(directory, '.' + decodeURIComponent(suffix));
    const relative = path.relative(directory, file);
    assert(
      !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep),
    );
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await mkdir(output, { recursive: true });
await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const cases = [
  { name: 'default', query: '', stored: null, enabled: false },
  { name: 'url', query: '?dev=1', stored: null, enabled: true },
  { name: 'storage', query: '', stored: 'true', enabled: true },
  { name: 'explicit-off', query: '?dev=0', stored: 'true', enabled: false },
];
const report = { games: games.length, checks: [], errors: [], passed: false };
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const sessions = [];
try {
  report.browser = await browser.version();
  for (const mode of cases) {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    await context.addInitScript((value) => {
      if (value === null) localStorage.removeItem('dev');
      else localStorage.setItem('dev', value);
    }, mode.stored);
    sessions.push({ mode, context });
  }
  async function check(game, session, embedded) {
    const { mode } = session;
    const page = await session.context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) =>
      report.errors.push({
        game: game.id,
        mode: mode.name,
        entry: embedded ? 'shell' : 'independent',
        error: error.message,
      }),
    );
    try {
      const url = embedded
        ? `${origin}/small-games/${mode.query}#/games/${game.id}`
        : `${origin}/independent/${game.id}/${mode.query}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Obtain the actual frame after navigation; mode must be present in its own document.
      let surface = page;
      if (embedded && game.standalone) {
        await expect(page.locator('iframe')).toBeVisible();
        surface = await (await page.locator('iframe').elementHandle()).contentFrame();
        assert(surface, `${game.id}: missing frame`);
        const src = new URL(await page.locator('iframe').getAttribute('src'), page.url());
        assert.equal(
          src.searchParams.get('dev'),
          mode.name === 'default' ? null : mode.enabled ? '1' : '0',
        );
        if (
          game.id === 'ink-is-everything' ||
          game.id === 'ball-roguelite' ||
          game.id === 'xiangqi-five'
        ) {
          await expect(page.locator('.standalone-page')).toHaveAttribute('data-immersive', 'true');
          await expect(page.getByRole('button', { name: '返回目录', exact: true })).toBeVisible();
          await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
        } else {
          assert.equal(
            await page.getByRole('link', { name: '独立打开' }).getAttribute('href'),
            await page.locator('iframe').getAttribute('src'),
          );
        }
      }
      await surface.waitForFunction(
        (enabled) =>
          window.SmallGamesDev?.isEnabled() === enabled &&
          document.documentElement.dataset.devMode === String(enabled),
        mode.enabled,
      );
      const debugField = {
        fishing: '__tidebreak',
        'maze-wander': 'mazeDebug',
        'hold-tight-acrobats': '__acroDev',
        'one-stroke-course': '__course',
        'vibeJam-myself-nullrange': '__flight',
      }[game.id];
      if (debugField)
        await surface.waitForFunction(({ field, enabled }) => Boolean(window[field]) === enabled, {
          field: debugField,
          enabled: mode.enabled,
        });
      if (game.id === 'bullet-garden')
        await surface.waitForFunction(
          (enabled) => window.__bulletGarden?.snapshot().controls.developerMode === enabled,
          mode.enabled,
        );
      if (game.id === 'cultivation' && mode.enabled)
        await surface.waitForFunction(
          () => typeof document.querySelector('canvas')?.getCultivationSnapshot === 'function',
        );
      if (game.id === 'tower-defense-game')
        await expect(surface.getByRole('switch', { name: /开发调参/ })).toHaveCount(
          mode.enabled ? 1 : 0,
        );
      const tools = surface.locator('small-games-devtools');
      await expect(tools).toHaveCount(mode.enabled ? 1 : 0);
      if (mode.enabled) {
        await tools.getByRole('button', { name: '开发者调试', exact: true }).tap();
        await expect(tools.getByRole('dialog', { name: '开发者调试选项' })).toBeVisible();
        await tools.getByRole('button', { name: '查看运行信息' }).tap();
        await expect(tools.locator('pre')).toContainText('"enabled": true');
        await tools.getByRole('button', { name: '关闭', exact: true }).tap();
      }
      report.checks.push({
        game: game.id,
        entry: embedded ? 'shell' : 'independent',
        mode: mode.name,
        enabled: mode.enabled,
      });
    } finally {
      await page.close();
    }
  }
  for (const game of games) {
    for (const session of sessions) {
      for (const embedded of [false, true]) {
        try {
          await check(game, session, embedded);
        } catch (error) {
          const failure = {
            game: game.id,
            entry: embedded ? 'shell' : 'independent',
            mode: session.mode.name,
            error: String(error),
          };
          report.errors.push(failure);
          console.error(JSON.stringify(failure));
        }
      }
    }
    console.log(
      `Developer mode: ${game.id}, ${report.checks.length} checks, ${report.errors.length} errors`,
    );
  }

  // Exercise movable controls and gesture cancellation with actual mobile input.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`${origin}/independent/wulong-city/?dev`);
  const tools = page.locator('small-games-devtools');
  const button = tools.getByRole('button', { name: '开发者调试', exact: true });
  await button.tap();
  await tools.getByLabel('显示触点', { exact: true }).check();
  await tools.getByLabel('显示性能信息', { exact: true }).check();
  await tools.getByRole('button', { name: '关闭', exact: true }).tap();
  await expect(tools.locator('output')).toContainText('FPS');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 200, y: 350 }],
  });
  await expect(tools.locator('.touch')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(tools.locator('.touch')).toHaveCount(0);
  await page.getByRole('button', { name: '暂停', exact: true }).tap();
  await button.tap();
  await expect(tools.locator('dialog')).toBeVisible();
  await tools.getByRole('button', { name: '查看运行信息' }).tap();
  await expect(tools.locator('pre')).toContainText('"enabled": true');
  await tools.getByRole('button', { name: '关闭', exact: true }).tap();
  await page.getByRole('button', { name: '继续探索', exact: true }).tap();
  // A cancelled drag must leave the next tap available.
  const cancelled = await button.boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: cancelled.x + 24, y: cancelled.y + 22 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await button.tap();
  await expect(tools.locator('dialog')).toBeVisible();
  await tools.getByRole('button', { name: '关闭', exact: true }).tap();
  const rect = await button.boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: rect.x + 24, y: rect.y + 22 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 30, y: 740 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(tools.locator('dialog')).not.toBeVisible();
  assert((await button.boundingBox()).x < 50);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.innerWidth === 844 && window.innerHeight === 390);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert((await button.boundingBox()).y + 44 <= 390);
  await button.tap();
  await expect(tools.locator('dialog')).toBeVisible();
  await tools.getByLabel('记住开发模式（当前站点）').check();
  assert.equal(await page.evaluate(() => localStorage.getItem('dev')), '1');
  await page.screenshot({ path: path.join(output, 'mobile-panel.png') });
  await tools.getByRole('button', { name: '退出开发模式' }).tap();
  await page.waitForURL(/dev=0/);
  await expect(page.locator('small-games-devtools')).toHaveCount(0);
  assert.equal(await page.evaluate(() => localStorage.getItem('dev')), null);
  report.checks.push({
    mobile: 'drag, resize, game modal, performance, touchcancel, persistence, exit',
  });

  // Parent inheritance also works in an ordinary external embed; inaccessible parents do not break explicit opt-in.
  const child = `${origin}/independent/wulong-city/`;
  await page.goto(`${origin}/fixture?dev=1&child=${encodeURIComponent(child)}`);
  await expect(page.frameLocator('iframe').locator('small-games-devtools')).toHaveCount(1);
  await page.goto(
    `${origin}/fixture?dev=0&child=${encodeURIComponent(child + '?dev=1')}`.replace(
      '127.0.0.1',
      'localhost',
    ),
  );
  await expect(page.frameLocator('iframe').locator('small-games-devtools')).toHaveCount(1);
  report.checks.push({ iframe: 'same-origin inheritance and cross-origin URL opt-in' });
  await context.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  for (const session of sessions) await session.context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  `Developer mode: ${report.games} games, ${report.checks.length} browser checks passed.`,
);
