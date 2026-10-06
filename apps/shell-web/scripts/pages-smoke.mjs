import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, devices, expect } from '@playwright/test';
import { preview } from 'vite';
import { markers, exerciseStandalone } from './standalone-game-checks.mjs';
import { entryMode } from './standalone-game-entry.mjs';
import { selectPagesGames } from './pages-validation.mjs';
import { monitorPagesPage } from './pages-browser-monitor.mjs';

const games = JSON.parse(await readFile(new URL('../src/standalone-games.json', import.meta.url)));
// Parse before starting either the preview server or Chromium: invalid CI selection must fail fast.
const selectedGames = selectPagesGames(games, process.env.PAGES_GAME_IDS);
// The registry now also includes building-power; its own suite covers that game.
const builtInCount = 5;
const basePath = process.env.PAGES_BASE_PATH ?? '/small-games/';
const immersiveGame = (id) =>
  ['ink-is-everything', 'ball-roguelite', 'xiangqi-five', 'letters-words2', 'wulong-city'].includes(
    id,
  );
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  base: basePath,
  preview: { host: '127.0.0.1', port: 0 },
});
let browser;
let page;
const results = [];
const failures = [];
let status = 'running';
let activeGame;
const output = new URL('../../../.scratch/game-integration/', import.meta.url);
await mkdir(output, { recursive: true });
const report = () =>
  writeFile(
    new URL('report.json', output),
    JSON.stringify(
      {
        status,
        builtIn: builtInCount,
        selected: selectedGames.map((game) => game.id),
        standalone: results,
        failures,
      },
      null,
      2,
    ),
  );
async function phase(result, name, run) {
  result.phase = name;
  console.log(`Started: ${result.id} / ${name}`);
  await report();
  const started = performance.now();
  try {
    return await run();
  } finally {
    result.timings[name] = Math.round(performance.now() - started);
    console.log(`Finished: ${result.id} / ${name} (${result.timings[name]} ms)`);
    await report();
  }
}
await report();
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const url = process.env.PAGES_URL ?? `${origin}${basePath}`;
  browser = await chromium.launch({
    // Full Chromium keeps the desktop WebGL path; headless_shell stalls on the 3D city.
    channel: 'chromium',
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
    headless: true,
  });
  page = await browser.newPage();
  monitorPagesPage(page, url, failures);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: '摸鱼游戏社' })).toBeVisible();
  await expect(page.getByText('云存档账号', { exact: true })).toHaveCount(0);
  await expect(page.locator('.catalog-grid article')).toHaveCount(builtInCount + games.length);
  async function verifySharedRoute(id, title) {
    const sharedUrl = `${url}#/games/${id}`;
    await expect(page).toHaveURL(sharedUrl);
    await page.goBack();
    await expect(page.getByRole('heading', { name: '摸鱼游戏社' })).toBeVisible();
    await page.goForward();
    if (immersiveGame(id)) await expect(page.locator('iframe')).toHaveAttribute('title', title);
    else await expect(page.locator('nav strong')).toHaveText(title);
    await page.reload();
    if (immersiveGame(id)) await expect(page.locator('iframe')).toHaveAttribute('title', title);
    else await expect(page.locator('nav strong')).toHaveText(title);
    const shared = await browser.newPage();
    monitorPagesPage(shared, url, failures, `share/${id}`);
    try {
      assert.equal((await shared.goto(sharedUrl)).status(), 200);
      if (immersiveGame(id)) await expect(shared.locator('iframe')).toHaveAttribute('title', title);
      else await expect(shared.locator('nav strong')).toHaveText(title);
      await expect(shared.locator('.game-slot, .standalone-page iframe')).toHaveCount(1);
    } finally {
      await shared.close();
    }
  }
  for (const title of process.env.PAGES_SKIP_BUILTINS === '1'
    ? []
    : ['三分钟修仙', '秋声斗蟋', '打工人摸鱼记', '电子斗蛐蛐']) {
    await page
      .locator('article')
      .filter({ hasText: title })
      .getByRole('button', { name: '进入游戏', exact: true })
      .click();
    if (title === '三分钟修仙') {
      await verifySharedRoute('cultivation', title);
      await page.getByRole('button', { name: '点香 · 开始修行' }).click();
      await expect(page.getByRole('button', { name: '御剑', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '暂停', exact: true }).click();
      await page.getByRole('button', { name: '继续修行' }).click();
    } else if (title === '秋声斗蟋') {
      await page.getByRole('button', { name: '揭盖 · 开斗 →' }).click();
      await page.getByRole('button', { name: '暂停对局' }).click();
      await page.getByRole('button', { name: '继续斗蟋' }).click();
    } else if (title === '打工人摸鱼记') {
      await page.getByRole('button', { name: '悄悄进入办公室' }).click();
      await page.getByRole('button', { name: '蹲下', exact: false }).click();
      await expect(page.getByRole('button', { name: '站起来', exact: false })).toBeVisible();
      await page.getByRole('button', { name: '暂停', exact: true }).click();
      await page.getByRole('button', { name: '继续潜入' }).click();
    } else {
      await page.locator('.arena-picks button').first().click();
      await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'mutate');
      while (await page.locator('.arena-traits button').count())
        await page.locator('.arena-traits button').first().click();
      await page.getByRole('button', { name: '开盆，迎战！', exact: false }).click();
      await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'battle');
      await page.getByRole('button', { name: '闪身避锋', exact: false }).click();
      await expect(page.getByRole('progressbar', { name: '体力' })).not.toHaveAttribute(
        'value',
        '100',
      );
      await page.getByRole('button', { name: '暂停游戏' }).click();
      await page.getByRole('button', { name: '准备好了，继续' }).click();
    }
    await page.getByRole('button', { name: '← 返回目录', exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(page.locator('.catalog-grid article')).toHaveCount(builtInCount + games.length);
  }
  for (const game of selectedGames) {
    const result = {
      id: game.id,
      entryMode: entryMode(game.id),
      status: 'running',
      phase: 'embedded-load',
      timings: {},
    };
    activeGame = result;
    results.push(result);
    console.log(`Started game: ${game.id}`);
    const started = performance.now();
    const frame = page.frameLocator('iframe');
    const marker = markers[game.id];
    assert(marker, `Missing ready marker for ${game.id}`);
    await phase(result, 'embedded-load', async () => {
      await page
        .locator('article')
        .filter({ hasText: game.title })
        .getByRole('link', { name: '进入游戏', exact: true })
        .click();
      await expect(page).toHaveURL(`${url}#/games/${game.id}`);
      if (game === selectedGames[0]) await verifySharedRoute(game.id, game.title);
      await expect(frame.locator(marker).first()).toBeVisible({ timeout: 120000 });
      // Static controls can appear before module scripts attach their event listeners.
      const gameFrame = await (await page.locator('iframe').elementHandle()).contentFrame();
      await gameFrame.waitForLoadState();
      if (game.id === 'hold-tight-acrobats') {
        // Reproduce slow CI frames: charging may safely cancel, but walking must remain usable.
        await gameFrame.evaluate(() => {
          const raf = globalThis.requestAnimationFrame.bind(globalThis);
          globalThis.requestAnimationFrame = (callback) =>
            raf(() => {
              const until = performance.now() + 140;
              while (performance.now() < until) {
                /* Sustained slow rendering must not freeze physics. */
              }
              callback(performance.now());
            });
        });
      }
    });
    await phase(result, 'embedded-gameplay', () => exerciseStandalone(frame, game.id));
    result.embedded = 'passed';
    const standaloneUrl = new URL(`games/${game.id}/index.html`, url).href;
    await phase(result, 'embedded-return', async () => {
      assert.equal(
        await page.evaluate(() => globalThis.document.querySelector('iframe')?.src),
        standaloneUrl,
      );
      if (game.id === 'ink-is-everything') {
        await frame.locator('#pause').click();
        await frame.locator('#modal [data-home]').click();
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'letters-words2') {
        await frame.locator('#board button:enabled:not([aria-disabled="true"])').first().click();
        await expect(frame.locator('#answer-slots .filled')).toHaveCount(1);
        await page.reload();
        await expect(frame.locator('#focus-button')).toBeVisible();
        await expect(frame.locator('#board')).toBeHidden();
        await frame.locator('#focus-button').click();
        await expect(frame.locator('#answer-slots .filled')).toHaveCount(1);
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await frame.locator('#pause-button').click();
        await expect(frame.locator('#pause-dialog')).toBeVisible();
        await frame.locator('#home-button').click();
        await expect(frame.locator('#focus-button')).toBeVisible();
        await expect(frame.locator('#board')).toBeHidden();
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'ball-roguelite') {
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'xiangqi-five') {
        await frame.locator('#game-back').click();
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'wulong-city') {
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await frame.locator('#menu').click();
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'letters-words2') {
        await frame.locator('#play-home').click();
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else {
        assert.equal(
          await page.evaluate(
            () => globalThis.document.querySelector('.standalone-page nav a')?.href,
          ),
          standaloneUrl,
        );
      }
      // Release the desktop WebGL context before starting the mobile instance.
      const back = page.getByRole('button', { name: '返回目录', exact: true });
      if (game.id === 'travel-bund') {
        // The resumed default WebGL scene is still running. Read the fixed
        // Shell control once rather than adopting handles across several frames.
        await expect(back).toBeVisible();
        await expect(back).toBeEnabled();
        const point = await page.evaluate(() => {
          const document = globalThis.document;
          const controls = [...document.querySelectorAll('.standalone-page nav > button')].filter(
            (control) => control.textContent.trim() === '返回目录',
          );
          const control = controls[0];
          const bounds = control?.getBoundingClientRect();
          const x = bounds ? bounds.x + bounds.width / 2 : -1;
          const y = bounds ? bounds.y + bounds.height / 2 : -1;
          return {
            count: controls.length,
            x,
            y,
            hit: Boolean(control?.contains(document.elementFromPoint(x, y))),
          };
        });
        assert.equal(point.count, 1);
        assert.equal(point.hit, true);
        await page.mouse.click(point.x, point.y);
      } else await back.click();
      await expect(page).toHaveURL(url);
      await expect(page.locator('iframe')).toHaveCount(0);
    });
    const landscape = [
      'fold-the-world',
      'one-stroke-course',
      'hold-tight-acrobats',
      'carding-car',
      'night-overwatch',
      'fishing',
      'vibeJam-myself-delivery',
      'vibeJam-myself-nullrange',
    ].includes(game.id);
    // This tall narrow viewport catches a held touch leaking onto the result dialog.
    const viewport =
      game.id === 'wulong-city'
        ? { width: 360, height: 900 }
        : landscape
          ? { width: 844, height: 390 }
          : { width: 390, height: 844 };
    result.viewport = viewport;
    const mobileContext = await browser.newContext({ ...devices['Pixel 7'], viewport });
    const direct = await mobileContext.newPage();
    monitorPagesPage(direct, url, failures, `${game.id}/mobile`);
    try {
      await phase(result, 'mobile-load', async () => {
        const response = await direct.goto(standaloneUrl);
        assert.equal(response.status(), 200);
        await expect(direct.locator(marker).first()).toBeVisible({ timeout: 120000 });
      });
      await phase(result, 'mobile-gameplay', () => exerciseStandalone(direct, game.id, true));
      assert(
        await direct.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
        ),
        `${game.id}: mobile overflow`,
      );
      if (process.env.PAGES_SCREENSHOTS !== '0')
        await phase(result, 'mobile-screenshot', () =>
          direct.screenshot({ path: fileURLToPath(new URL(`${game.id}-phone.png`, output)) }),
        );
      Object.assign(result, {
        status: 'passed',
        phase: 'complete',
        directMobile: 'passed',
        durationMs: Math.round(performance.now() - started),
      });
      await report();
      console.log(
        `Passed: ${game.id} (embedded and ${viewport.width}x${viewport.height} touch, ${result.durationMs} ms)`,
      );
    } catch (error) {
      await direct
        .screenshot({
          path: fileURLToPath(new URL(`${game.id}-failure.png`, output)),
        })
        .catch(() => {});
      throw error;
    } finally {
      await mobileContext.close();
      assert.equal(browser.contexts().length, 1, `${game.id}: mobile context was not released`);
    }
    activeGame = undefined;
  }
  await page.goto(`${url}#/games/not-a-game`);
  await expect(page.getByRole('heading', { name: '摸鱼游戏社' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  );
  assert.deepEqual(failures, []);
  activeGame = undefined;
  status = 'passed';
  await report();
  console.log(
    `Pages: ${builtInCount + games.length} catalog entries, ${selectedGames.length}/${games.length} embedded/direct games, return navigation, mobile width and Runtime isolation passed.`,
  );
} catch (error) {
  status = 'failed';
  if (activeGame) {
    activeGame.status = 'failed';
    activeGame.error = error.stack ?? String(error);
  }
  if (page)
    await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)) }).catch(() => {});
  failures.push(error.stack ?? String(error));
  await report();
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
