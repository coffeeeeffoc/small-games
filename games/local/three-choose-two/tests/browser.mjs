import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { getLevel } from '../src/levels.mjs';
import { canPlace, previewPlacement, createEndless } from '../src/engine.mjs';

// Exercise the production artifact using real Chromium touch events. Read-only
// snapshots and level solutions may describe expected state; they never place a
// piece, unlock content, or manufacture a normal-player victory.
const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = fileURLToPath(new URL('../docs/design/refresh-2026-10-07/actual/', import.meta.url));
const port = Number(process.env.THREE_CHOOSE_TWO_BROWSER_PORT || 4423);
let baseURL = process.env.THREE_CHOOSE_TWO_URL;
let server;
let browser;
const report = {
  startedAt: new Date().toISOString(),
  environment: 'Production dist; Chromium desktop emulation with native CDP touch input',
  actualDevice: false,
  checks: [],
  screenshots: [],
  pageErrors: [],
  status: 'running',
};
await mkdir(outputRoot, { recursive: true });

function record(name, detail) {
  report.checks.push({ name, status: 'passed', ...(detail ? { detail } : {}) });
  console.log(`PASS ${name}`);
}
async function capture(page, name) {
  const filename = `${name}.png`;
  await page.waitForTimeout(240);
  await page.screenshot({ path: `${outputRoot}/${filename}` });
  report.screenshots.push({ filename, viewport: page.viewportSize() });
}
function monitor(page) {
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
}
async function tap(page, name, exact = true) {
  const button = page.getByRole('button', { name, exact });
  await expect(button).toBeVisible();
  await button.tap();
}
async function touch(session, type, points = []) {
  await session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((point, index) => ({ radiusX: 3, radiusY: 3, force: 1, id: index + 1, ...point })),
  });
}
async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, 'The portrait UI must fit the physical viewport width');
}
async function startServer() {
  if (baseURL) return;
  server = spawn(process.execPath, ['server.mjs', '--dist', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: gameRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  server.stderr.on('data', (data) => { errors += data; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Production preview did not start: ' + errors)), 10_000);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Preview exited (${code}): ${errors}`)); });
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  baseURL = `http://127.0.0.1:${port}/`;
}

async function screen(page, name) {
  await expect(page.locator('#game')).toHaveAttribute('data-screen', name);
}
async function state(page) {
  const value = await page.evaluate(() => window.getThreeChooseTwoSnapshot());
  return value.state ?? value;
}
async function action(page, name, fallback) {
  const locator = page.locator(`button[data-action="${name}"]`);
  if (await locator.count()) {
    await expect(locator.first()).toBeVisible();
    await locator.first().tap();
  } else await tap(page, fallback || name);
}
async function gesturePoints(page, slot, x, y) {
  const candidate = page.locator(`[data-slot="${slot}"]`);
  const [boardBox, candidateBox, shape] = await Promise.all([
    page.locator('#board').boundingBox(),
    candidate.boundingBox(),
    candidate.evaluate((element) => ({ width: Number(element.dataset.width), height: Number(element.dataset.height) })),
  ]);
  assert(boardBox && candidateBox, 'Board and candidate must be rendered for direct manipulation');
  assert(shape.width > 0 && shape.height > 0, 'Candidate must describe its immutable shape geometry');
  const pitch = boardBox.width * 40 / 360;
  const pad = boardBox.width * 20 / 360;
  return {
    start: { x: candidateBox.x + candidateBox.width / 2, y: candidateBox.y + candidateBox.height / 2 },
    target: { x: boardBox.x + pad + (x + shape.width / 2) * pitch, y: boardBox.y + pad + (y + shape.height) * pitch + 46 },
  };
}
async function sendDrag(session, points, { cancel = false, moving = false } = {}) {
  await touch(session, 'touchStart', [points.start]);
  for (let i = 1; i <= 6; i++) {
    const ratio = i / 6;
    await touch(session, 'touchMove', [{
      x: points.start.x + (points.target.x - points.start.x) * ratio,
      y: points.start.y + (points.target.y - points.start.y) * ratio,
    }]);
  }
  if (!moving) await touch(session, cancel ? 'touchCancel' : 'touchEnd');
}
async function drag(page, session, slot, x, y, options) {
  await sendDrag(session, await gesturePoints(page, slot, x, y), options);
}
async function waitPlacements(page, count) {
  await expect.poll(async () => (await state(page)).stats.placements).toBe(count);
  await page.waitForTimeout(360);
}
async function assertGameFits(page, label) {
  await assertNoHorizontalOverflow(page);
  const viewport = page.viewportSize();
  const board = await page.locator('#board').boundingBox();
  const header = await page.locator('.screen-header').boundingBox();
  assert(header && header.y >= 0, `${label}: page transition must not scroll the title or pause offscreen`);
  const candidates = await page.locator('[data-slot]').evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  assert(board && board.width > 200, `${label}: board must remain usable`);
  assert.equal(candidates.length, 3, `${label}: three slots must remain present`);
  assert(board.y >= 0 && board.y + board.height <= viewport.height, `${label}: full board must fit the viewport`);
  for (const slot of candidates) {
    assert(slot.x >= 0 && slot.x + slot.width <= viewport.width + 1, `${label}: candidate must fit viewport width`);
    assert(slot.y >= 0 && slot.y + slot.height <= viewport.height + 1, `${label}: candidate must fit viewport height`);
    assert(slot.height >= 44 && slot.width >= 44, `${label}: candidate must retain a touch target`);
  }
  const footer = await page.locator('.play-footer button').evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  for (const button of footer) {
    assert(button.height >= 44 && button.width >= 44, `${label}: footer tools need a 44 px touch target`);
    assert(button.y + button.height <= viewport.height + 1, `${label}: footer tools must not be clipped`);
  }
  record(label, { board, candidates, header, footer });
}
async function phoneContext(viewport = { width: 390, height: 844 }) {
  return browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
}
async function mainFlow() {
  const context = await phoneContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  monitor(page);
  await page.goto(baseURL);
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  await screen(page, 'home');
  await assertNoHorizontalOverflow(page);
  await capture(page, 'home-390x844');
  record('Fresh player opens a complete standalone home');

  await action(page, 'levels', '选关');
  await screen(page, 'levels');
  const levelButtons = page.locator('button[data-level]');
  assert.equal(await levelButtons.count(), 30);
  await expect(levelButtons.first()).toBeEnabled();
  await expect(levelButtons.nth(1)).toBeDisabled();
  await capture(page, 'levels-390x844');
  await levelButtons.first().tap();
  await screen(page, 'brief');
  await capture(page, 'brief-390x844');
  await action(page, 'begin', '开始');
  await screen(page, 'playing');
  await assertGameFits(page, '390 × 844 board and all three touch slots fit');
  await capture(page, 'game-390x844');
  for (const move of getLevel(1).solution) {
    await drag(page, session, move.slot, move.x, move.y, { moving: true });
    await expect(page.locator('#board-ghost rect')).toHaveCount(1);
    await expect(page.locator('#preview-lines rect')).toHaveCount(1);
    await capture(page, 'game-valid-preview-390x844');
    await touch(session, 'touchEnd');
  }
  await screen(page, 'result');
  const won = await state(page);
  assert.equal(won.status, 'won');
  assert.equal(won.stats.placements, 1);
  assert.equal(won.stats.lines, 1);
  assert.equal(won.stats.discardedBlocks, 0);
  assert.equal(won.score, 100);
  assert.equal(won.stars, 3);
  await capture(page, 'result-win-390x844');
  record('Normal touch drag wins level 1 immediately before a second placement or discard');

  await action(page, 'next', '下一关');
  await screen(page, 'brief');
  await action(page, 'begin', '开始');
  await screen(page, 'playing');
  assert.equal((await state(page)).levelId, 2);
  const initial = await state(page);
  await drag(page, session, 0, 0, 2, { moving: true });
  await expect(page.locator('#board-ghost rect').first()).toHaveAttribute('stroke-dasharray', '5 3');
  await capture(page, 'game-invalid-preview-390x844');
  await touch(session, 'touchEnd');
  assert.deepEqual((await state(page)).board, initial.board);
  assert.equal((await state(page)).stats.placements, 0);
  await drag(page, session, 0, 0, 0, { cancel: true });
  assert.equal((await state(page)).stats.placements, 0);
  const a = await gesturePoints(page, 0, 0, 0);
  const b = await gesturePoints(page, 1, 5, 5);
  await touch(session, 'touchStart', [{ ...a.start, id: 1 }]);
  await touch(session, 'touchStart', [{ ...a.start, id: 1 }, { ...b.start, id: 2 }]);
  await touch(session, 'touchMove', [{ ...a.target, id: 1 }, { ...b.target, id: 2 }]);
  await touch(session, 'touchCancel');
  assert.equal((await state(page)).stats.placements, 0);
  record('Illegal overlap, gesture cancel, and cancelled multitouch do not spend a placement');

  const solution = getLevel(2).solution;
  const firstPoints = await gesturePoints(page, solution[0].slot, solution[0].x, solution[0].y);
  const secondPoints = await gesturePoints(page, solution[1].slot, solution[1].x, solution[1].y);
  await sendDrag(session, firstPoints);
  await sendDrag(session, secondPoints);
  await waitPlacements(page, 1);
  assert.equal((await state(page)).stats.lines, 1);
  await capture(page, 'game-after-first-390x844');
  record('Clear animation locks a second touch placement while preserving first-step state');

  const firstState = await state(page);
  const slotPositionsBefore = await page.locator('[data-slot]').evaluateAll((elements) => elements.map((element) => {
    const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
  }));
  await drag(page, session, solution[1].slot, solution[1].x, solution[1].y);
  await waitPlacements(page, 2);
  const afterGroup = await state(page);
  assert.equal(afterGroup.group, 2);
  assert.equal(afterGroup.stats.discardedBlocks, 1);
  assert.deepEqual(await page.locator('[data-slot]').evaluateAll((elements) => elements.map((element) => {
    const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
  })), slotPositionsBefore);
  await action(page, 'undo', '撤销');
  await waitPlacements(page, 1);
  const undone = await state(page);
  assert.deepEqual(undone.board, firstState.board);
  assert.deepEqual(undone.candidates, firstState.candidates);
  assert.equal(undone.group, 1);
  assert.equal(undone.undoRemaining, 2);
  assert.equal(undone.stats.discardedBlocks, 0);
  await drag(page, session, solution[1].slot, solution[1].x, solution[1].y);
  await waitPlacements(page, 2);
  assert.deepEqual((await state(page)).candidates, afterGroup.candidates);
  record('Two placements discard once; fixed slots and cross-group undo restore a deterministic group');

  const beforePause = await state(page);
  await page.getByRole('button', { name: '返回首页', exact: true }).tap();
  await screen(page, 'home');
  await action(page, 'start', '继续游戏');
  await screen(page, 'playing');
  for (const key of ['board', 'candidates', 'group', 'score', 'stats']) assert.deepEqual((await state(page))[key], beforePause[key]);
  record('The visible in-game home button saves the unfinished board and resumes it directly');
  await action(page, 'pause', '暂停');
  await screen(page, 'pause');
  await capture(page, 'pause-390x844');
  await action(page, 'resume', '继续游戏');
  await screen(page, 'playing');
  assert.deepEqual((await state(page)).board, beforePause.board);
  await page.reload();
  await screen(page, 'home');
  await action(page, 'start', '继续闯关');
  await screen(page, 'playing');
  const restored = await state(page);
  for (const key of ['board', 'candidates', 'group', 'score', 'stats']) assert.deepEqual(restored[key], beforePause[key]);
  await drag(page, session, solution[2].slot, solution[2].x, solution[2].y);
  await screen(page, 'result');
  assert.equal((await state(page)).levelId, 2);
  assert.equal((await state(page)).status, 'won');
  await action(page, 'home', '返回首页');
  await screen(page, 'home');
  await action(page, 'levels', '选关');
  await screen(page, 'levels');
  await expect(page.locator('button[data-level="3"]')).toBeEnabled();
  await expect(page.locator('button[data-level="4"]')).toBeDisabled();
  await action(page, 'home', '返回首页');
  record('Pause, reload, normal continue, next-level unlock, and return paths preserve real progress');

  await action(page, 'start', '继续闯关');
  await action(page, 'begin', '开始');
  assert.equal((await state(page)).levelId, 3);
  await action(page, 'pause', '暂停');
  await action(page, 'exit-level', '退出关卡');
  await screen(page, 'home');
  const abandoned = await page.evaluate(() => JSON.parse(localStorage.getItem('three-choose-two-progress-v1')));
  assert.equal(abandoned.currentGame, null);
  assert.equal(abandoned.unlocked, 3);
  assert.equal(Object.keys(abandoned.records).length, 2);
  await page.reload();
  await action(page, 'start', '继续闯关');
  await screen(page, 'brief');
  await action(page, 'levels', '返回');
  await action(page, 'home', '返回首页');
  record('Exit level clears the unfinished board across reload while preserving earned stars and unlocks');

  await action(page, 'endless', '无尽挑战');
  await screen(page, 'endless');
  await action(page, 'practice', '离线练习');
  await screen(page, 'playing');
  const practice = await state(page);
  assert.equal(practice.mode, 'endless');
  assert.equal(practice.ranked, false);
  assert.equal(practice.undoRemaining, 0);
  const legal = (() => {
    for (let slot = 0; slot < 3; slot++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (canPlace(practice, slot, x, y)) return { slot, x, y };
    throw new Error('An empty practice board must allow its first placement');
  })();
  await drag(page, session, legal.slot, legal.x, legal.y);
  await waitPlacements(page, 1);
  await action(page, 'pause', '暂停');
  await action(page, 'end-run', '结束本局');
  await screen(page, 'result');
  assert.equal((await state(page)).status, 'finished');
  await capture(page, 'practice-result-390x844');
  await action(page, 'share', '分享成绩');
  await expect(page.locator('#game')).toHaveAttribute('data-screen', 'result');
  await action(page, 'leaderboard', '查看排行榜');
  await screen(page, 'leaderboard');
  assert.equal(await page.locator('.ranking-row').count(), 0, 'Disconnected ranking must not invent players');
  await capture(page, 'ranking-offline-390x844');
  await action(page, 'home', '返回首页');
  record('Offline endless placement, voluntary finish, safe share, and truthful ranking fallback');

  await action(page, 'settings', '设置');
  await screen(page, 'settings');
  const sound = page.getByRole('switch', { name: '音效', exact: true });
  const previousSetting = await sound.getAttribute('aria-checked');
  await sound.tap();
  assert.notEqual(await sound.getAttribute('aria-checked'), previousSetting);
  const fullscreen = page.locator('[data-game-fullscreen]');
  if (await fullscreen.count()) {
    await fullscreen.tap();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await fullscreen.tap();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  }
  await capture(page, 'settings-390x844');
  await action(page, 'home', '返回首页');
  await page.reload();
  await action(page, 'settings', '设置');
  assert.notEqual(await page.getByRole('switch', { name: '音效', exact: true }).getAttribute('aria-checked'), previousSetting);
  record('Settings persist and user-gesture H5 fullscreen enters and exits without resetting progress');
  await context.close();
}
async function failureFlow() {
  const context = await phoneContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  monitor(page);
  await page.goto(baseURL);
  await action(page, 'start', '开始闯关');
  await action(page, 'begin', '开始');
  let lastMove;
  for (let step = 0; step < 4; step++) {
    const before = await state(page);
    lastMove = (() => {
      for (let slot = 0; slot < 3; slot++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        if (canPlace(before, slot, x, y) && previewPlacement(before, slot, x, y).lines === 0) return { slot, x, y };
      }
      throw new Error('The ordinary failure test must find a legal non-clearing placement');
    })();
    await drag(page, session, lastMove.slot, lastMove.x, lastMove.y);
    await waitPlacements(page, step + 1);
  }
  await screen(page, 'result');
  const failed = await state(page);
  assert.equal(failed.status, 'lost');
  assert.equal(failed.reason, 'groups-exhausted');
  assert.equal(failed.stats.lines, 0);
  assert.equal(await page.locator('button[data-action="continue"]').count(), 0, 'Unavailable ads must not promise a reward');
  await capture(page, 'result-failure-390x844');
  await page.reload();
  await screen(page, 'home');
  await action(page, 'start', '继续游戏');
  await screen(page, 'result');
  assert.deepEqual((await state(page)).board, failed.board);
  assert.equal((await state(page)).canUndo, true);
  await action(page, 'undo', '撤销');
  await screen(page, 'playing');
  assert.equal((await state(page)).stats.placements, 3);
  assert.equal((await state(page)).status, 'playing');
  assert.equal((await state(page)).undoRemaining, 2);
  await drag(page, session, lastMove.slot, lastMove.x, lastMove.y);
  await screen(page, 'result');
  await action(page, 'retry', '再玩一次');
  await screen(page, 'playing');
  const restarted = await state(page);
  assert.equal(restarted.stats.placements, 0);
  assert.deepEqual(restarted.board, getLevel(1).initialBoard);
  record('Real group-exhaustion failure survives reload and offers remaining undo and a free fixed-board retry');

  // A platform receipt fixture represents the process being killed after a
  // confirmed reward is journaled. This is not a real ad integration or a way
  // to manufacture normal gameplay: `failed` came from four native touch moves.
  const rewardId = 'browser-confirmed-receipt-v1';
  const injectReceipt = () => page.evaluate(({ originalState, id }) => {
    localStorage.setItem('three-choose-two-pending-reward-v1', JSON.stringify({ state: originalState, rewardId: id }));
  }, { originalState: failed, id: rewardId });
  await injectReceipt();
  await page.reload();
  await screen(page, 'home');
  await action(page, 'start', '继续游戏');
  await screen(page, 'playing');
  const continued = await state(page);
  assert.equal(continued.continued, true);
  assert.equal(continued.continueRewardId, rewardId);
  assert.equal(continued.group, 3);
  assert.equal(continued.stats.placements, 4);
  assert.equal(continued.status, 'playing');
  await expect(page.locator('.metric-group .metric-main')).toHaveText('3 / 4');
  assert.deepEqual(continued.board, failed.board);
  assert.equal(await page.evaluate(() => localStorage.getItem('three-choose-two-pending-reward-v1')), 'null');
  await injectReceipt();
  await page.reload();
  await screen(page, 'home');
  await action(page, 'start', '继续游戏');
  await screen(page, 'playing');
  const repeated = await state(page);
  assert.equal(repeated.group, 3);
  assert.equal(repeated.stats.placements, 4);
  assert.equal(repeated.continueRewardId, rewardId);
  assert.deepEqual(repeated.candidates, continued.candidates);
  await capture(page, 'confirmed-reward-fixture-restored-390x844');
  record('Fixture: a confirmed rewarded-ad receipt restores once across reload; replay is idempotent', { realAd: false });
  await context.close();
}

async function smallViewports() {
  for (const viewport of [{ width: 360, height: 640 }, { width: 320, height: 568 }]) {
    const context = await phoneContext(viewport);
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    monitor(page);
    await page.goto(baseURL);
    await screen(page, 'home');
    await capture(page, `home-${viewport.width}x${viewport.height}`);
    await action(page, 'start', '开始闯关');
    await screen(page, 'brief');
    await action(page, 'begin', '开始');
    await screen(page, 'playing');
    await capture(page, `game-${viewport.width}x${viewport.height}`);
    await assertGameFits(page, `${viewport.width} × ${viewport.height} all touch controls fit`);
    for (const move of getLevel(1).solution) await drag(page, session, move.slot, move.x, move.y);
    await screen(page, 'result');
    record(`${viewport.width} × ${viewport.height} normal touch mapping reaches a real win`);
    await context.close();
  }
  const context = await phoneContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  monitor(page);
  await page.goto(baseURL);
  await action(page, 'start', '开始闯关');
  await action(page, 'begin', '开始');
  const portrait = await state(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await assertNoHorizontalOverflow(page);
  assert.deepEqual((await state(page)).board, portrait.board);
  await capture(page, 'game-landscape-844x390');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual((await state(page)).board, portrait.board);
  for (const move of getLevel(1).solution) await drag(page, session, move.slot, move.x, move.y);
  await screen(page, 'result');
  record('Viewport rotation preserves the same game and restored touch mapping');
  await context.close();
}

async function developerFlow() {
  const context = await phoneContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  monitor(page);
  await page.goto(baseURL);
  assert.equal(await page.evaluate(() => typeof window.ThreeChooseTwoDev), 'undefined');
  await action(page, 'start');
  await action(page, 'begin');
  for (const move of getLevel(1).solution) await drag(page, session, move.slot, move.x, move.y);
  await screen(page, 'result');
  await action(page, 'next');
  await action(page, 'begin');
  const first = getLevel(2).solution[0];
  await drag(page, session, first.slot, first.x, first.y);
  await waitPlacements(page, 1);
  await action(page, 'home');
  const realSave = await page.evaluate(() => JSON.parse(localStorage.getItem('three-choose-two-progress-v1')));

  await page.goto(new URL('?dev=1', baseURL).href);
  await action(page, 'levels');
  await expect(page.locator('[data-level="30"]')).toBeEnabled();
  await page.locator('[data-level="30"]').tap();
  await action(page, 'begin');
  await screen(page, 'playing');
  assert.equal((await state(page)).levelId, 30);
  assert.equal((await page.evaluate(() => window.getThreeChooseTwoSnapshot())).devPractice, true);
  const configuredSolution = await page.evaluate(() => window.ThreeChooseTwoDev.solution());
  assert.deepEqual(configuredSolution, getLevel(30).solution);
  await capture(page, 'developer-level-30');
  for (const [i, move] of configuredSolution.entries()) {
    await drag(page, session, move.slot, move.x, move.y);
    await waitPlacements(page, i + 1);
  }
  await screen(page, 'result');
  assert.equal((await state(page)).status, 'won');
  assert.equal((await state(page)).stars, 3);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('three-choose-two-progress-v1'))), realSave);
  await capture(page, 'developer-result');
  record('Developer selection opens all 30 levels and a real touch solution earns no normal progress or record');

  await page.evaluate(() => window.ThreeChooseTwoDev.level(12));
  await screen(page, 'playing');
  await action(page, 'pause');
  await action(page, 'dev-tools');
  await screen(page, 'dev-tools');
  await action(page, 'dev-solution');
  await expect(page.locator('.dev-solution li')).toHaveCount(getLevel(12).solution.length);
  await capture(page, 'developer-tools');
  await action(page, 'dev-back');
  await screen(page, 'pause');
  await action(page, 'resume');
  await screen(page, 'playing');
  record('Touch developer tools expose the reference route and return to the originating pause screen');
  await page.evaluate(() => window.ThreeChooseTwoDev.refillUndo(12));
  assert.equal((await state(page)).undoRemaining, 12);
  await page.evaluate(() => window.ThreeChooseTwoDev.setParameters({ groupLimit: 20, discardBudget: 30, goalLines: 12 }));
  assert.equal((await state(page)).config.maxGroups, 20);
  assert.equal((await state(page)).config.discardBudget, 30);
  assert.equal((await state(page)).config.goal.lines, 12);
  await page.evaluate(() => window.ThreeChooseTwoDev.clearBoard());
  assert.equal((await state(page)).board.filter(Boolean).length, 0);
  await page.evaluate(() => window.ThreeChooseTwoDev.restart());
  assert.deepEqual((await state(page)).board, getLevel(12).initialBoard);
  await action(page, 'pause');
  await action(page, 'exit-level');
  await screen(page, 'home');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('three-choose-two-progress-v1'))), realSave);
  await action(page, 'start');
  await screen(page, 'playing');
  assert.equal((await state(page)).levelId, 2);
  assert.equal((await page.evaluate(() => window.getThreeChooseTwoSnapshot())).devPractice, false);
  assert.deepEqual((await state(page)).board, realSave.currentGame.board);
  record('Full developer controls operate on isolated trials; leaving a trial restores the existing normal save');

  await page.evaluate(() => localStorage.setItem('dev', '1'));
  await page.goto(new URL('?dev=0', baseURL).href);
  await action(page, 'levels');
  await expect(page.locator('[data-level="30"]')).toBeDisabled();
  assert.equal(await page.evaluate(() => typeof window.ThreeChooseTwoDev), 'undefined');
  await expect(page.locator('small-games-devtools')).toHaveCount(0);
  record('Explicit dev=0 hides debugging and restores normal unlock restrictions despite stored dev=1');
  await context.close();
}

async function onlineHomeFixture() {
  const context = await phoneContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  monitor(page);
  await page.goto(new URL('?dev=1', baseURL).href);
  // A transport fixture checks navigation while an issued move is offline. It
  // does not represent a real service, identity, settlement or ranking check.
  const issued = createEndless('home-navigation-fixture', { ranked: true });
  await page.evaluate((initial) => {
    window.__navigationFixtureCalls = [];
    window.__competition = {
      async request(path) {
        window.__navigationFixtureCalls.push(path);
        if (path.endsWith('/actions')) throw new Error('Navigation fixture is offline');
        if (path.endsWith('/session')) return { id: 'navigation-fixture', seq: 0, status: 'active', eligible: false, state: initial };
        throw new Error('Unexpected navigation fixture request: ' + path);
      },
    };
  }, issued);
  await action(page, 'endless');
  await action(page, 'online-start');
  await screen(page, 'playing');
  const move = (() => {
    for (let slot = 0; slot < 3; slot++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (canPlace(issued, slot, x, y)) return { slot, x, y };
    throw new Error('Issued fixture group must have a legal first move');
  })();
  await drag(page, session, move.slot, move.x, move.y);
  await waitPlacements(page, 1);
  const before = await state(page);
  const journal = await page.evaluate(() => JSON.parse(localStorage.getItem('three-choose-two-online-v1')));
  assert.equal(journal.pending.length, 1);
  assert.equal(await page.evaluate(() => {
    try { window.ThreeChooseTwoDev.refillUndo(12); return false; }
    catch { return true; }
  }), true, 'Developer mutation must reject an online board');
  assert.deepEqual((await state(page)).board, before.board);
  await page.getByRole('button', { name: '返回首页', exact: true }).tap();
  await screen(page, 'home');
  await action(page, 'levels');
  await page.locator('[data-level="30"]').tap();
  await screen(page, 'brief');
  await action(page, 'levels');
  await action(page, 'home');
  await action(page, 'start');
  await screen(page, 'playing');
  assert.deepEqual((await state(page)).board, before.board);
  const after = await page.evaluate(() => window.getThreeChooseTwoSnapshot());
  assert.equal(after.online.id, 'navigation-fixture');
  assert.equal(after.online.seq, 0);
  assert.equal(after.devPractice, false, 'An abandoned trial selection must not relabel online play as a trial');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('three-choose-two-online-v1'))), journal);
  assert.equal(await page.evaluate(() => window.__navigationFixtureCalls.filter(path => path.endsWith('/session')).length), 1);
  record('Transport fixture: direct home and continue retain the same online session and unconfirmed move', { realService: false });
  await context.close();
}

async function run() {
  await startServer();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  report.browserVersion = browser.version();
  await mainFlow();
  await failureFlow();
  await smallViewports();
  await developerFlow();
  await onlineHomeFixture();
}

try {
  await run();
  assert.ok(report.checks.length > 0, 'Browser flow must execute before reporting success');
  assert.equal(report.pageErrors.length, 0, 'The browser must not raise uncaught application errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${outputRoot}/verification.json`, JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server?.kill('SIGTERM');
}
