import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

// Run against a production build, never against Vite's development server.
// `pnpm build && pnpm test:browser`, or supply an already-running GAME_URL.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../docs/design/', import.meta.url));
const saveKey = 'moss-garden.save.v1';
const failures = [];
const checks = [];
let server;
let browser;
let status = 'running';
let url = process.env.GAME_URL;
let version;

await mkdir(output, { recursive: true });
const record = (name) => checks.push(name);
const action = (page, id) => page.locator(`[data-hit-id="${id}"]`);
const screen = (page, name) => expect(page.locator('#garden')).toHaveAttribute('data-page', name);
const save = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey);
const shot = (page, name) => page.screenshot({ path: `${output}/actual-${name}.png` });
const board = (page) =>
  page.locator('[data-hit-id^="cell:"]').evaluateAll((buttons) =>
    buttons.map((button) => ({
      id: button.dataset.hitId,
      label: button.getAttribute('aria-label'),
      pressed: button.getAttribute('aria-pressed'),
    })),
  );
function monitor(page, name) {
  page.on('pageerror', (error) => failures.push({ name, error: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error')
      failures.push({ name, console: message.text(), location: message.location().url });
  });
  page.on('response', (response) => {
    if (new URL(response.url()).origin === new URL(url).origin && response.status() >= 400)
      failures.push({ name, resource: response.url(), status: response.status() });
  });
  page.on('requestfailed', (request) => {
    failures.push({ name, resource: request.url(), failed: request.failure()?.errorText });
  });
}
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production preview exited: ${server.exitCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Preview is still binding. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Production preview did not start on port 4426');
}
async function touchPath(page, cells, cancelled = false) {
  const points = [];
  for (const index of cells) {
    const bounds = await action(page, `cell:${index}`).boundingBox();
    assert(bounds, `Cell ${index} must remain visible for the gesture`);
    points.push({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 });
  }
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [points[0]],
    });
    for (const point of points.slice(1))
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await session.send('Input.dispatchTouchEvent', {
      type: cancelled ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}
async function mobileContext(mode = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    reducedMotion: 'reduce',
  });
  if (mode.stored || mode.blocked)
    await context.addInitScript((mode) => {
      if (mode.blocked)
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('Storage disabled for browser verification', 'SecurityError');
          },
        });
      else localStorage.setItem('dev', mode.stored);
    }, mode);
  return context;
}

try {
  if (!url) {
    await access(`${root}/dist/index.html`);
    url = 'http://127.0.0.1:4426/';
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4426',
        '--strictPort',
      ],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    await waitForServer();
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
  });
  version = browser.version();
  const context = await mobileContext();
  const page = await context.newPage();
  monitor(page, 'normal-mobile');
  await page.goto(url);
  await screen(page, 'home');
  assert.equal(await page.evaluate(() => window.SmallGamesDev.isEnabled()), false);
  assert.equal(
    await page.evaluate(() => 'game' in window.SmallGamesDev.inspect()),
    false,
    'Normal entry must not expose the registered debug snapshot',
  );
  await expect(page.locator('small-games-devtools')).toHaveCount(0);
  await shot(page, 'home');
  await action(page, 'home:levels').tap();
  await screen(page, 'levels');
  await expect(action(page, 'level:moss-01')).toBeVisible();
  assert.equal(
    await action(page, 'level:moss-02').count(),
    0,
    'Locked levels cannot have a playable hit area',
  );
  await shot(page, 'levels');
  await action(page, 'nav:back').tap();
  await page.locator('[data-action="start"]').tap();
  await screen(page, 'play');
  await expect(page.locator('[data-hit-id^="cell:"]')).toHaveCount(16);
  await expect(action(page, 'cell:0')).toHaveAttribute('aria-label', '花圃 第1行 第1列');
  await action(page, 'cell:0').tap();
  await expect(action(page, 'cell:0')).toHaveAttribute('aria-pressed', 'true');
  await action(page, 'cell:1').tap();
  await expect(action(page, 'cell:1')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('status')).toContainText('这一行已有光种');
  await expect.poll(async () => (await save(page)).active.puzzle.mistakes).toBe(1);
  await action(page, 'cell:0').tap();
  await expect(action(page, 'cell:0')).toHaveAttribute('aria-pressed', 'false');
  record('移动触屏播种、取回、同行冲突拒绝和可感知错误反馈');

  await action(page, 'play:mark').tap();
  await expect(action(page, 'play:mark')).toHaveAttribute('aria-pressed', 'true');
  await action(page, 'cell:0').tap();
  await expect.poll(async () => (await save(page)).active.puzzle.excluded).toEqual([0]);
  await action(page, 'play:undo').tap();
  await expect.poll(async () => (await save(page)).active.puzzle.excluded).toEqual([]);
  await touchPath(page, [0, 1, 2], true);
  assert.deepEqual(
    (await save(page)).active.puzzle.excluded,
    [],
    'Cancelled drag must not commit exclusions',
  );
  await touchPath(page, [0, 1, 2]);
  await expect.poll(async () => (await save(page)).active.puzzle.excluded).toEqual([0, 1, 2]);
  await action(page, 'cell:1').tap();
  await expect.poll(async () => (await save(page)).active.puzzle.excluded).toEqual([0, 2]);
  record('标记、撤回、原生触屏拖动批量标记、手势取消及再次点击取消标记');

  await action(page, 'play:seed').tap();
  await action(page, 'cell:0').tap();
  await expect(action(page, 'cell:0')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'play');
  const beforeHelp = await board(page);
  await action(page, 'play:help').tap();
  await screen(page, 'help');
  await action(page, 'nav:back').tap();
  await screen(page, 'play');
  assert.deepEqual(await board(page), beforeHelp, 'Returning from help must preserve the board');
  await page.waitForTimeout(1150);
  await action(page, 'play:pause').tap();
  await screen(page, 'pause');
  await shot(page, 'pause');
  const paused = (await save(page)).active;
  assert(paused.elapsedMs > 1000);
  await page.waitForTimeout(1250);
  assert.deepEqual((await save(page)).active, paused, 'Paused elapsed time and board stay frozen');
  await action(page, 'pause:resume').tap();
  await page.waitForTimeout(1150);
  await action(page, 'play:pause').tap();
  await expect
    .poll(async () => (await save(page)).active.elapsedMs)
    .toBeGreaterThan(paused.elapsedMs + 1000);
  await action(page, 'pause:resume').tap();
  const savedBoard = await board(page);
  await page.reload();
  await screen(page, 'home');
  await page.locator('[data-action="start"]').tap();
  await screen(page, 'play');
  assert.deepEqual(
    await board(page),
    savedBoard,
    'Reload must restore seed positions and cell labels',
  );
  assert.deepEqual((await save(page)).active.puzzle.excluded, [2]);
  record('手册返回、暂停计时冻结、恢复计时、刷新恢复棋盘和标记');

  // Reach the ordinary result solely through the player's visible hint tool.
  // Hints are tracked in the settlement, and this does not invoke developer actions.
  let hintTaps = 0;
  for (
    ;
    hintTaps < 8 && (await page.locator('#garden').getAttribute('data-page')) === 'play';
    hintTaps++
  )
    await action(page, 'play:hint').tap();
  await screen(page, 'result');
  await shot(page, 'result');
  await expect.poll(async () => Object.keys((await save(page)).completed)).toEqual(['moss-01']);
  const completion = (await save(page)).completed['moss-01'];
  assert.equal(completion.hints, hintTaps);
  assert.equal(completion.mistakes, 1);
  assert(completion.timeMs > 2000);
  assert.equal((await save(page)).active, null);
  await action(page, 'result:next').tap();
  await screen(page, 'play');
  await expect.poll(async () => (await save(page)).active.levelId).toBe('moss-02');
  await action(page, 'cell:0').tap();
  const beforeResize = await board(page);
  await page.setViewportSize({ width: 320, height: 568 });
  assert.deepEqual(
    await board(page),
    beforeResize,
    'Small viewport resize must preserve the round',
  );
  await shot(page, 'small-320x568');
  await page.setViewportSize({ width: 844, height: 390 });
  assert.deepEqual(
    await board(page),
    beforeResize,
    'Landscape letterboxing must preserve the round',
  );
  await action(page, 'cell:0').tap();
  await expect(action(page, 'cell:0')).toHaveAttribute('aria-pressed', 'false');
  await shot(page, 'landscape-844x390');
  await action(page, 'play:pause').tap();
  await action(page, 'pause:home').tap();
  await page.reload();
  await screen(page, 'home');
  await action(page, 'home:levels').tap();
  await expect(action(page, 'level:moss-02')).toBeVisible();
  assert.equal(await action(page, 'level:moss-03').count(), 0);
  assert.deepEqual((await save(page)).completed['moss-01'], completion);
  record('普通提示通关、提示/失误/时间结算、下一关解锁和持久化、小屏及横屏坐标保持');
  await context.close();

  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
  });
  const desktopPage = await desktop.newPage();
  monitor(desktopPage, 'desktop-fullscreen');
  await desktopPage.goto(url);
  await screen(desktopPage, 'home');
  await action(desktopPage, 'home:settings').click();
  await screen(desktopPage, 'settings');
  const fullscreen = desktopPage.locator('[data-game-fullscreen]');
  await expect(fullscreen).toHaveCount(1);
  await fullscreen.click();
  await expect
    .poll(() => desktopPage.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
  await fullscreen.click();
  await expect
    .poll(() => desktopPage.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  await action(desktopPage, 'settings:sound').click();
  await expect.poll(async () => (await save(desktopPage)).sound).toBe(false);
  await action(desktopPage, 'nav:back').click();
  await desktopPage.reload();
  await screen(desktopPage, 'home');
  assert.equal((await save(desktopPage)).sound, false);
  record('桌面实际全屏进入/退出、设置切换及存档保留');
  await desktop.close();

  for (const mode of [
    { name: 'url-on', query: '?dev=1', enabled: true },
    { name: 'storage-on', stored: '1', enabled: true },
    { name: 'explicit-off', query: '?dev=0', stored: '1', enabled: false },
    { name: 'blocked-storage', blocked: true, enabled: false },
  ]) {
    const modeContext = await mobileContext(mode);
    const modePage = await modeContext.newPage();
    monitor(modePage, mode.name);
    const destination = new URL(url);
    destination.search = mode.query || '';
    await modePage.goto(destination.href);
    await screen(modePage, 'home');
    assert.equal(await modePage.evaluate(() => window.SmallGamesDev.isEnabled()), mode.enabled);
    await expect(modePage.locator('small-games-devtools')).toHaveCount(mode.enabled ? 1 : 0);
    await modePage.locator('[data-action="start"]').tap();
    await screen(modePage, 'play');
    if (mode.enabled) {
      const tools = modePage.locator('small-games-devtools');
      await tools.getByRole('button', { name: '开发者调试', exact: true }).tap();
      await tools.getByRole('button', { name: '完成本关（试玩）', exact: true }).tap();
      await tools.getByRole('button', { name: '关闭', exact: true }).tap();
      await screen(modePage, 'result');
      assert.deepEqual(
        (await save(modePage)).completed,
        {},
        'Developer clear must not record progress',
      );
      assert.equal(
        await modePage.evaluate(() => window.SmallGamesDev.inspect().game.practice),
        true,
      );
      await action(modePage, 'result:next').tap();
      await screen(modePage, 'play');
      assert.equal(
        await modePage.evaluate(() => window.SmallGamesDev.inspect().game.levelId),
        'moss-02',
      );
      assert.deepEqual((await save(modePage)).completed, {});
      await modePage.reload();
      await screen(modePage, 'home');
      await action(modePage, 'home:levels').tap();
      assert.equal(
        await action(modePage, 'level:moss-02').count(),
        0,
        'Practice must not unlock ordinary level selection',
      );
    } else {
      assert.equal(await modePage.evaluate(() => 'game' in window.SmallGamesDev.inspect()), false);
      await action(modePage, 'cell:0').tap();
      await expect(action(modePage, 'cell:0')).toHaveAttribute('aria-pressed', 'true');
    }
    record(`开发模式 ${mode.name}（含试玩不结算或禁用存储正常启动）`);
    await modeContext.close();
  }
  assert.deepEqual(
    failures,
    [],
    'No console errors, uncaught errors, failed resources or HTTP errors',
  );
  status = 'passed';
  console.log(
    `苔光花园: ${checks.length} production browser checks passed; actual screenshots in docs/design/`,
  );
} catch (error) {
  status = 'failed';
  failures.push({ error: String(error) });
  throw error;
} finally {
  await writeFile(
    `${output}/browser-report.json`,
    JSON.stringify(
      {
        status,
        date: new Date().toISOString(),
        environment: {
          browser: version,
          mode: 'headless Chromium browser simulation',
          mobile: '390×844 touch, DPR 2',
          small: '320×568',
          landscape: '844×390',
          desktop: '1280×900',
          build: 'Vite production preview',
        },
        checks,
        failures,
      },
      null,
      2,
    ),
  );
  await browser?.close();
  server?.kill('SIGTERM');
}
