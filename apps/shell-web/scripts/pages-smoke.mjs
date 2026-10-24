import { threeChooseTwoInput } from './standalone-game-checks.mjs';
import { tapControl as tapChaseControl } from './game-checks/chase-thief.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, devices, expect } from '@playwright/test';
import { preview } from 'vite';
import { markers, exerciseStandalone } from './standalone-game-checks.mjs';
import { entryMode } from './standalone-game-entry.mjs';
import { selectPagesGames, mobileGameViewport } from './pages-validation.mjs';
import { monitorPagesPage } from './pages-browser-monitor.mjs';

const games = JSON.parse(await readFile(new URL('../src/standalone-games.json', import.meta.url)));
// Parse before starting either the preview server or Chromium: invalid CI selection must fail fast.
const selectedGames = selectPagesGames(games, process.env.PAGES_GAME_IDS);
const builtInCount = 0;
const basePath = process.env.PAGES_BASE_PATH ?? '/small-games/';
const immersiveGame = (id) =>
  [
    'bullet-garden',
    'homebound-station',
    'tianxia-chalu',
    'ashfall-front',
    'carrom-club',
    'three-choose-two',
    'cage-rescue',
    'chase-thief',
    'orbit-atelier',
    'merge-front',
    'tower-brake',
    'tetracube',
    'castle-cannon',
    'ink-is-everything',
    'ball-roguelite',
    'porcelain-puzzle',
    'flick-arena',
    'xiangqi-five',
    'letters-words2',
    'vibeJam-myself-history-guess',
    'wulong-city',
  ].includes(id);
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
        browserVersion: browser?.version(),
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
  await monitorPagesPage(page, url, failures);
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
    await monitorPagesPage(shared, url, failures, `share/${id}`);
    try {
      assert.equal((await shared.goto(sharedUrl)).status(), 200);
      if (immersiveGame(id)) await expect(shared.locator('iframe')).toHaveAttribute('title', title);
      else await expect(shared.locator('nav strong')).toHaveText(title);
      await expect(shared.locator('.game-slot, .standalone-page iframe')).toHaveCount(1);
    } finally {
      await shared.close();
    }
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
        .filter({ has: page.getByRole('heading', { name: game.title, exact: true }) })
        .getByRole('link', { name: '进入游戏', exact: true })
        .click();
      await expect(page).toHaveURL(`${url}#/games/${game.id}`);
      if (game === selectedGames[0]) await verifySharedRoute(game.id, game.title);
      await expect(frame.locator(marker).first()).toBeVisible({ timeout: 120000 });
      // Static controls can appear before module scripts attach their event listeners.
      const gameFrame = await (await page.locator('iframe').elementHandle()).contentFrame();
      await gameFrame.waitForLoadState();
    });
    await phase(result, 'embedded-gameplay', () => exerciseStandalone(frame, game.id));
    result.embedded = 'passed';
    const standaloneUrl = new URL(`games/${game.id}/index.html`, url).href;
    await phase(result, 'embedded-return', async () => {
      assert.equal(
        await page.evaluate(() => globalThis.document.querySelector('iframe')?.src),
        standaloneUrl,
      );
      if (game.id === 'homebound-station') {
        const view = () => frame.locator('body').evaluate(() => globalThis.homeboundView());
        const control = async (id) => {
          await expect
            .poll(async () =>
              (await view()).buttons.some((button) => button.id === id && !button.disabled),
            )
            .toBe(true);
          const button = (await view()).buttons.find((item) => item.id === id);
          await frame.locator('#GameCanvas').click({
            position: { x: button.x + button.w / 2, y: button.y + button.h / 2 },
          });
        };
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await control('pause');
        await expect.poll(async () => (await view()).page).toBe('pause');
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await control('home');
        await expect.poll(async () => (await view()).page).toBe('home');
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'carrom-club') {
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await frame.locator('#pause').click();
        await expect(frame.locator('#pause-screen')).toBeVisible();
        await frame.locator('#pause-home').click();
        await expect(frame.locator('#home')).toBeVisible();
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'three-choose-two') {
        const { snapshot, control } = threeChooseTwoInput(frame);
        await expect.poll(async () => (await snapshot()).screen).toBe('home');
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await control('start');
        if ((await snapshot()).screen === 'brief') await control('begin');
        await expect.poll(async () => (await snapshot()).screen).toBe('playing');
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await control('home');
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await control('start');
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await control('pause');
        await expect.poll(async () => (await snapshot()).screen).toBe('pause');
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await control('exit-level');
        await expect.poll(async () => (await snapshot()).screen).toBe('home');
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'ink-is-everything') {
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
      } else if (game.id === 'chase-thief') {
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
        await tapChaseControl(frame, 'start');
        await expect(frame.locator('body')).toHaveAttribute('data-phase', 'running');
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await tapChaseControl(frame, 'pause');
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await tapChaseControl(frame, 'home');
        await expect(frame.locator('body')).toHaveAttribute('data-phase', 'home');
        await expect(page.locator('.standalone-page nav')).toBeVisible();
      } else if (game.id === 'flick-arena') {
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await frame.locator('#pause').click();
        await expect(frame.locator('body')).toHaveAttribute('data-phase', 'paused');
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await frame.locator('#home').click();
        await expect(frame.locator('body')).toHaveAttribute('data-phase', 'home');
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (
        game.id === 'bullet-garden' ||
        game.id === 'tianxia-chalu' ||
        game.id === 'ashfall-front' ||
        game.id === 'cage-rescue' ||
        game.id === 'ball-roguelite' ||
        game.id === 'porcelain-puzzle' ||
        game.id === 'orbit-atelier' ||
        game.id === 'merge-front' ||
        game.id === 'tower-brake' ||
        game.id === 'tetracube' ||
        game.id === 'castle-cannon'
      ) {
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'xiangqi-five') {
        await frame.locator('#game-back').click();
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'vibeJam-myself-history-guess') {
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await frame.getByRole('button', { name: '前往下一幕' }).click();
        await expect(frame.locator('#load-cover')).toBeHidden({ timeout: 20000 });
        await frame.getByRole('button', { name: '暂停', exact: true }).click();
        await expect(frame.locator('.pause-overlay')).toBeVisible();
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await frame.getByRole('button', { name: '保存并返回首页' }).click();
        await expect(frame.locator('#start')).toBeVisible();
        await expect(page.locator('.standalone-page nav')).toBeVisible();
        await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
      } else if (game.id === 'wulong-city') {
        await expect(page.locator('.standalone-page nav')).toBeHidden();
        await frame.locator('#menu').click();
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
    const viewport = mobileGameViewport(game.id);
    result.viewport = viewport;
    const mobileContext = await browser.newContext({ ...devices['Pixel 7'], viewport });
    const direct = await mobileContext.newPage();
    await monitorPagesPage(direct, url, failures, `${game.id}/mobile`);
    if (game.id === 'moss-garden')
      await direct.addInitScript(() => {
        // Passive evidence for the CI-only seed regression; never replace native input.
        globalThis.__pagesMossInputEvents = [];
        for (const type of [
          'pointerdown',
          'pointermove',
          'pointerup',
          'pointercancel',
          'lostpointercapture',
          'click',
          'blur',
          'focus',
          'resize',
          'visibilitychange',
        ])
          globalThis.addEventListener(
            type,
            (event) => {
              const root = globalThis.document.querySelector('#garden');
              const canvas = globalThis.document.querySelector('canvas');
              const events = globalThis.__pagesMossInputEvents;
              events.push({
                type,
                time: performance.now(),
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                target: event.target?.dataset?.hitId ?? event.target?.id,
                x: event.clientX,
                y: event.clientY,
                detail: event.detail,
                page: root?.dataset.page,
                hidden: globalThis.document.hidden,
                focused: globalThis.document.hasFocus(),
                captured: event.pointerId !== undefined && root?.hasPointerCapture(event.pointerId),
                firstCellPressed: globalThis.document
                  .querySelector('[data-hit-id="cell:0"]')
                  ?.getAttribute('aria-pressed'),
                canvasBounds: canvas?.getBoundingClientRect().toJSON(),
                canvasSize: canvas ? [canvas.width, canvas.height] : undefined,
              });
              if (events.length > 80) events.shift();
            },
            { capture: true, passive: true },
          );
      });
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
      if (game.id === 'moss-garden')
        result.nativeInputDiagnostics = await direct
          .evaluate(() => globalThis.__pagesMossInputEvents)
          .catch(() => undefined);
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
