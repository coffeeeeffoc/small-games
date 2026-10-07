import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../docs/qa/v3/', import.meta.url);
await mkdir(evidence, { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4189'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Server exited ${code}`)));
  server.stdout.once('data', resolve);
});
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const report = {
  environment: 'Linux Chromium; mobile viewports and CDP touch simulation, not physical device QA',
  browserVersion: browser.version(),
  nodeVersion: process.version,
  checks: [],
  errors: [],
};
const origin = 'http://127.0.0.1:4189';
const saveKey = 'tetracube.save.v1';
const snapshot = (page) => page.evaluate(() => window.tetracubeSnapshot());
const phase = (page, name) => page.waitForFunction((p) => document.body.dataset.phase === p, name);
const idle = (page) => page.waitForFunction(() => !window.tetracubeSnapshot().animating);
const ready = (page) => page.locator('#app[data-ready="true"]').waitFor();
const capture = (page, name) => page.screenshot({ path: fileURLToPath(new URL(name, evidence)) });
const xy = (state) => state.game.active.pos.slice(0, 2);
const watch = (page) => page.on('pageerror', (error) => report.errors.push(error.message));
const recordEffects = (page) =>
  page.evaluate(() => {
    window.__qaEffects = [];
    window.__qaRecording = true;
    const sample = () => {
      if (!window.__qaRecording) return;
      const { motionKind, animationKind, animationRole, impact, trails, reducedMotion } =
        window.tetracubeSnapshot();
      window.__qaEffects.push({
        motionKind,
        animationKind,
        animationRole,
        impact,
        trails,
        reducedMotion,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
const recordedEffects = (page) =>
  page.evaluate(() => {
    window.__qaRecording = false;
    return window.__qaEffects;
  });
const motion = (page, kind) =>
  page.waitForFunction((k) => window.__qaEffects.some((sample) => sample.motionKind === k), kind);
const fits = async (page, selector, viewport) => {
  const bounds = await page.locator(selector).boundingBox();
  assert(
    bounds &&
      bounds.x >= -1 &&
      bounds.y >= -1 &&
      bounds.x + bounds.width <= viewport.width + 1 &&
      bounds.y + bounds.height <= viewport.height + 1,
    `${selector} fits ${viewport.width}×${viewport.height}`,
  );
  assert(bounds.width >= 43 && bounds.height >= 43, `${selector} has a mobile-sized touch target`);
};
const noOverflow = async (page) =>
  assert.deepEqual(
    await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > innerWidth,
      vertical: document.documentElement.scrollHeight > innerHeight + 1,
    })),
    { horizontal: false, vertical: false },
    'The complete page fits its viewport without horizontal or vertical overflow',
  );
const worldDown = (state) => assert.deepEqual(state.game.gravity, { axis: 2, sign: -1 });
const stored = (page) => page.evaluate((key) => localStorage.getItem(key), saveKey);
const touch = (cdp, type, touchPoints = []) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
const point = (x, y, id = 1) => ({ x, y, id });
const touchButton = async (page, cdp, selector) => {
  const box = await page.locator(selector).boundingBox();
  assert(box);
  await touch(cdp, 'touchStart', [point(box.x + box.width / 2, box.y + box.height / 2)]);
  await touch(cdp, 'touchEnd');
};
const canvasPoint = async (page) => {
  const box = await page.locator('#game-canvas').boundingBox();
  assert(box && box.width > 150 && box.height > 150, 'Game canvas is visible and usable');
  return point(box.x + box.width * 0.45, box.y + box.height * 0.47);
};
const swipe = async (page, cdp, dx, dy, cancel = false) => {
  const start = await canvasPoint(page);
  await touch(cdp, 'touchStart', [start]);
  for (let i = 1; i <= 4; i++)
    await touch(cdp, 'touchMove', [point(start.x + (dx * i) / 4, start.y + (dy * i) / 4)]);
  await touch(cdp, cancel ? 'touchCancel' : 'touchEnd');
  await page.waitForFunction(() => !window.tetracubeSnapshot().input.dragging);
};
const devFixture = async (page, action) => {
  await page.getByRole('button', { name: '开发者调试', exact: true }).tap();
  await page.locator(`[data-dev-action="${action}"]`).tap();
  await page.locator('[data-close]').tap();
};
const mobile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

try {
  const context = await browser.newContext(mobile);
  const page = await context.newPage();
  watch(page);
  const cdp = await context.newCDPSession(page);
  await page.goto(origin);
  await ready(page);
  await noOverflow(page);
  await fits(page, '#start-game', mobile.viewport);
  await capture(page, 'mobile-home.png');
  await page.locator('#help-home').tap();
  await phase(page, 'help');
  await fits(page, '#help-back', mobile.viewport);
  await capture(page, 'mobile-help.png');
  await page.locator('#help-back').tap();
  await phase(page, 'home');
  assert.equal(await stored(page), null, 'Opening help must not manufacture a saved run');
  await page.locator('#start-game').tap();
  await phase(page, 'playing');
  assert.deepEqual((await snapshot(page)).game.dims, [6, 6, 18]);
  await capture(page, 'mobile-tutorial.png');
  await page.locator('#skip-tutorial').tap();
  assert.equal(await page.locator('[data-move]').count(), 0, 'Movement is directly on the board');
  assert.equal(await page.locator('#gravity-open').count(), 0, 'Flip needs no direction picker');
  for (const selector of [
    '[data-flip="left"]',
    '[data-flip="right"]',
    '#flip-container',
    '#hold-piece',
  ]) {
    await fits(page, selector, mobile.viewport);
    assert.equal(
      await page.locator(selector).isVisible(),
      true,
      `${selector} is directly available in move mode`,
    );
  }
  assert.equal(
    await page.locator('#view-tools').isVisible(),
    false,
    'Camera tools stay separate from physical turns',
  );
  const beforeMove = await snapshot(page);
  await recordEffects(page);
  await swipe(page, cdp, 70, 24);
  await motion(page, 'move');
  await capture(page, 'mobile-move.png');
  const afterMove = await snapshot(page);
  assert.notDeepEqual(
    xy(afterMove),
    xy(beforeMove),
    'Board swipe moves the active piece horizontally',
  );
  assert.deepEqual(afterMove.camera, beforeMove.camera, 'Move gesture cannot orbit the camera');
  const moveEffects = await recordedEffects(page);
  assert(
    moveEffects.some((sample) => sample.motionKind === 'move'),
    'Movement renders interpolation frames',
  );
  for (const plane of ['XY', 'XZ', 'YZ']) {
    await recordEffects(page);
    await page.locator(`[data-rotate="${plane}"]`).tap();
    await motion(page, 'rotate');
    if (plane === 'XY') await capture(page, 'mobile-rotate.png');
    await recordedEffects(page);
  }
  const beforeHold = await snapshot(page);
  await page.locator('#hold-piece').tap();
  const afterHold = await snapshot(page);
  assert.equal(afterHold.game.held.id, beforeHold.game.active.id);
  assert.equal(afterHold.game.active.id, beforeHold.game.next[0].id);
  assert.equal(afterHold.game.holdUsed, true);
  assert.equal(
    afterHold.game.placed,
    beforeHold.game.placed,
    'Hold cannot place or score the airborne piece',
  );
  assert.equal(afterHold.game.score, beforeHold.game.score);
  assert.equal(
    await page.locator('#hold-piece').isDisabled(),
    true,
    'Hold is allowed once per airborne piece',
  );
  await touchButton(page, cdp, '#hold-piece');
  assert.equal((await snapshot(page)).game.held.id, afterHold.game.held.id);
  assert.equal((await snapshot(page)).game.active.id, afterHold.game.active.id);
  await capture(page, 'mobile-hold.png');
  await recordEffects(page);
  await page.locator('#hard-drop').tap();
  await page.waitForFunction(() =>
    window.__qaEffects.some(
      (sample) => sample.animationKind === 'compact' && sample.animationRole === 'drop',
    ),
  );
  await capture(page, 'mobile-drop.png');
  await idle(page);
  await page.waitForFunction(() => window.__qaEffects.some((sample) => sample.impact));
  await capture(page, 'mobile-impact.png');
  const dropEffects = await recordedEffects(page);
  assert(
    dropEffects.some((sample) => sample.trails > 0),
    'Hard drop has visible velocity trails',
  );
  assert.equal((await snapshot(page)).game.placed, 1);
  assert.equal((await snapshot(page)).game.holdUsed, false);
  const beforeSwap = await snapshot(page);
  await page.locator('#hold-piece').tap();
  const afterSwap = await snapshot(page);
  assert.equal(afterSwap.game.active.id, beforeSwap.game.held.id);
  assert.equal(afterSwap.game.held.id, beforeSwap.game.active.id);
  assert.deepEqual(
    afterSwap.game.next,
    beforeSwap.game.next,
    'Swapping with hold leaves the next queue intact',
  );
  await recordEffects(page);
  const beforeFall = await snapshot(page);
  await motion(page, 'fall');
  const afterFall = await snapshot(page);
  assert.equal(afterFall.game.active.id, beforeFall.game.active.id);
  assert(
    afterFall.game.active.pos[2] < beforeFall.game.active.pos[2],
    'Natural fall advances the active piece',
  );
  await capture(page, 'mobile-natural-fall.png');
  await recordedEffects(page);
  worldDown(await snapshot(page));
  await capture(page, 'mobile-play.png');
  report.checks.push(
    'Touch home/help/start, 6×6×18 container, permanent three physical turns, direct movement/three rotations/natural fall with motion, hard-drop trail and impact',
  );
  report.checks.push(
    'One hold per airborne piece, disabled repeat tap, reset after landing, held-piece swap with queue and score conservation',
  );

  await page.locator('[data-input="observe"]').tap();
  const beforeObserve = await snapshot(page);
  await swipe(page, cdp, 60, 20, true);
  const afterObserve = await snapshot(page);
  assert.notDeepEqual(
    afterObserve.camera,
    beforeObserve.camera,
    'Observe gesture orbits the camera',
  );
  assert.deepEqual(
    xy(afterObserve),
    xy(beforeObserve),
    'Observe gesture cannot move the piece in XY',
  );
  for (const view of ['top', 'front', 'side', 'iso']) {
    await page.locator(`[data-view="${view}"]`).tap();
    if (view === 'top') await capture(page, 'mobile-top.png');
  }
  await capture(page, 'mobile-observe.png');
  await page.locator('[data-input="move"]').tap();
  const beforeCancel = await snapshot(page);
  await swipe(page, cdp, -45, 10, true);
  const afterCancel = await snapshot(page);
  assert.deepEqual(afterCancel.camera, beforeCancel.camera);
  await page.waitForTimeout(150);
  assert.deepEqual(
    xy(await snapshot(page)),
    xy(afterCancel),
    'Cancelled move has no continuing drift',
  );
  const start = await canvasPoint(page);
  const second = point(start.x + 42, start.y + 30, 2);
  const beforeMulti = await snapshot(page);
  await touch(cdp, 'touchStart', [start]);
  await touch(cdp, 'touchStart', [start, second]);
  await touch(cdp, 'touchMove', [
    point(start.x + 40, start.y, 1),
    point(second.x + 40, second.y, 2),
  ]);
  await touch(cdp, 'touchCancel');
  await page.waitForFunction(() => !window.tetracubeSnapshot().input.dragging);
  const afterMulti = await snapshot(page);
  assert.deepEqual(
    xy(afterMulti),
    xy(beforeMulti),
    'Second finger cancels single-finger board movement',
  );
  assert.deepEqual(afterMulti.camera, beforeMulti.camera, 'Multitouch cannot accidentally orbit');
  report.checks.push(
    'Explicit observe/move modes, camera presets, cancelled drags and multitouch isolation',
  );

  const beforeFlip = await snapshot(page);
  await page.locator('#flip-container').tap();
  await page.waitForFunction(() => window.tetracubeSnapshot().animationKind === 'flip');
  for (const selector of ['#hard-drop', '#flip-container', '[data-rotate="XY"]'])
    assert.equal(
      await page.locator(selector).isDisabled(),
      true,
      `${selector} is disabled during reconstruction`,
    );
  worldDown(await snapshot(page));
  await page.waitForTimeout(240);
  const midFlip = await snapshot(page);
  assert.equal(
    midFlip.animationKind,
    'flip',
    'Screenshot samples physical rotation, before collapse',
  );
  assert.deepEqual(
    midFlip.camera,
    beforeFlip.camera,
    'The container rotates independently of the camera',
  );
  await capture(page, 'mobile-mid-flip.png');
  await page.locator('#pause-game').tap();
  await phase(page, 'paused');
  const pausedFlip = await snapshot(page);
  await page.waitForTimeout(900);
  assert.equal(
    (await snapshot(page)).animationKind,
    pausedFlip.animationKind,
    'Pause freezes the physical-turn animation',
  );
  assert.deepEqual(
    (await snapshot(page)).game,
    pausedFlip.game,
    'Pausing freezes the reconstruction state',
  );
  await page.locator('#resume-game').tap();
  await idle(page);
  const afterFlip = await snapshot(page);
  worldDown(afterFlip);
  assert.deepEqual(afterFlip.game.dims, [6, 6, 18]);
  assert.equal(afterFlip.game.flipCount, beforeFlip.game.flipCount + 1);
  assert.equal(
    afterFlip.game.placed,
    beforeFlip.game.placed + 1,
    'Flip commits airborne tetracube exactly once',
  );
  assert.equal(
    afterFlip.game.active.id,
    beforeFlip.game.next[0].id,
    'The next queued tetracube spawns after a flip',
  );
  assert.deepEqual(afterFlip.camera, beforeFlip.camera);
  await capture(page, 'mobile-after-flip.png');
  report.checks.push(
    'One-tap 180° physical flip, fixed world-down gravity/camera, disabled controls, airborne commitment, next spawn and animation pause/resume',
  );

  for (const [turn, dims] of [
    ['left', [18, 6, 6]],
    ['right', [6, 6, 18]],
  ]) {
    const before = await snapshot(page);
    await page.locator(`[data-flip="${turn}"]`).tap();
    await idle(page);
    const after = await snapshot(page);
    worldDown(after);
    assert.deepEqual(after.game.dims, dims, `${turn} swaps physical container extents`);
    assert.equal(after.game.placed, before.game.placed + 1);
    assert.equal(after.game.flipCount, before.game.flipCount + 1);
    assert.deepEqual(after.camera, before.camera);
    assert.equal(after.inputMode, 'move', 'Physical turn requires no observe-mode detour');
    assert.equal(after.game.status, 'playing');
    if (turn === 'left') await capture(page, 'mobile-side-flip.png');
  }
  report.checks.push(
    'Left/right physical quarter-turns are directly usable in move mode and update container dimensions without changing gravity or camera',
  );
  await page.locator('[data-input="move"]').tap();
  await page.locator('#hold-piece').tap();
  await page.locator('#pause-game').tap();
  await phase(page, 'paused');
  await fits(page, '#resume-game', mobile.viewport);
  await fits(page, '#home-game', mobile.viewport);
  await capture(page, 'mobile-pause.png');
  await page.locator('#help-pause').tap();
  await phase(page, 'help');
  await page.locator('#help-back').tap();
  await phase(page, 'paused');
  const paused = (await snapshot(page)).game;
  await page.waitForTimeout(1800);
  assert.deepEqual((await snapshot(page)).game, paused);
  await page.locator('#resume-game').tap();
  await page.locator('#pause-game').tap();
  const expectedSave = (await snapshot(page)).game;
  await page.locator('#home-game').tap();
  const saved = await stored(page);
  await page.reload();
  await ready(page);
  await page.locator('#help-home').tap();
  await page.locator('#help-back').tap();
  assert.equal(await stored(page), saved, 'Home help preserves prior game');
  await page.locator('#continue-game').tap();
  await page.locator('#pause-game').tap();
  assert.deepEqual(
    (await snapshot(page)).game,
    expectedSave,
    'Reload restores board, orientation, queue and RNG exactly',
  );
  await page.locator('#resume-game').tap();
  report.checks.push(
    'Touch pause/help/back/resume; pause freezes simulation; home/reload/help/continue restores full v3 game including physical orientation, hold and queue',
  );

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    for (const selector of [
      '#hard-drop',
      '#flip-container',
      '[data-flip="left"]',
      '[data-flip="right"]',
      '#hold-piece',
      '[data-input="move"]',
      '[data-rotate="YZ"]',
    ]) {
      await fits(page, selector, viewport);
    }
    await noOverflow(page);
    worldDown(await snapshot(page));
    await capture(page, `play-${viewport.width}x${viewport.height}.png`);
  }
  report.checks.push(
    'Responsive 320×640, 390×844, 844×390 and 1440×1000 layouts without page overflow; drop, all three physical turns, hold, modes and rotations have visible usable touch targets',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/?dev=1`);
  await ready(page);
  const beforeDebugSave = await stored(page);
  await devFixture(page, 'cascade');
  assert.equal(
    await stored(page),
    beforeDebugSave,
    'Developer fixture never overwrites normal save',
  );
  const cascadeBefore = await snapshot(page);
  assert.equal(cascadeBefore.game.board.length, 72);
  await page.locator('#flip-container').tap();
  await idle(page);
  const result = await snapshot(page);
  worldDown(result);
  assert.equal(result.game.lines, 2);
  assert.equal(result.game.bestCombo, 2);
  assert.equal(
    result.game.board.length,
    4,
    '72 fixture cubes clear; four committed airborne cubes remain',
  );
  assert.equal(result.game.placed, cascadeBefore.game.placed + 1);
  await capture(page, 'mobile-combo.png');
  report.checks.push(
    'Visible cascade fixture + real flip control: two sequential planes clear, Combo ×2, four airborne cubes conserved',
  );

  await devFixture(page, 'danger');
  await phase(page, 'danger');
  await page.locator('#rescue-game').tap();
  await idle(page);
  await phase(page, 'playing');
  assert.equal((await snapshot(page)).rescueUsed, true);
  worldDown(await snapshot(page));
  await devFixture(page, 'danger');
  await page.locator('#end-game').tap();
  await phase(page, 'over');
  await fits(page, '#retry-game', mobile.viewport);
  await fits(page, '#result-home', mobile.viewport);
  await capture(page, 'mobile-result.png');
  await page.locator('#result-home').tap();
  await phase(page, 'home');
  await page.locator('#start-game').tap();
  await phase(page, 'playing');
  await devFixture(page, 'danger');
  await page.locator('#end-game').tap();
  await phase(page, 'over');
  await page.locator('#retry-game').tap();
  await phase(page, 'playing');
  report.checks.push(
    'Touch danger → one-tap physical flip rescue → playing; danger → result → home/start and result → retry',
  );
  await context.close();

  const legacyContext = await browser.newContext(mobile);
  const legacyShape = {
    id: 'line',
    name: '长桥',
    color: '#63e7ff',
    cells: [
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ],
  };
  const legacy = {
    version: 1,
    rescueUsed: false,
    tutorialStep: 4,
    game: {
      version: 1,
      configId: 'classic',
      dims: [5, 5, 10],
      board: [
        { id: 1, x: 0, y: 0, z: 0, color: '#63e7ff' },
        { id: 2, x: 4, y: 4, z: 9, color: '#ffe08a' },
      ],
      active: { ...legacyShape, pos: [2, 2, 5] },
      pending: null,
      next: [legacyShape, legacyShape, legacyShape],
      bag: [],
      gravity: { axis: 0, sign: -1 },
      score: 230,
      lines: 2,
      combo: 0,
      bestCombo: 2,
      placed: 3,
      gravityChanges: 3,
      serial: 2,
      rngState: 123,
      initialSeed: 123,
      status: 'playing',
    },
  };
  await legacyContext.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('tetracube.settings.v1', JSON.stringify({ tutorialDone: true }));
    },
    { key: saveKey, value: legacy },
  );
  const legacyPage = await legacyContext.newPage();
  watch(legacyPage);
  await legacyPage.goto(origin);
  await ready(legacyPage);
  await legacyPage.locator('#continue-game').tap();
  await phase(legacyPage, 'playing');
  await legacyPage.locator('#pause-game').tap();
  const migrated = await snapshot(legacyPage);
  worldDown(migrated);
  assert.equal(migrated.game.version, 3);
  assert.deepEqual(migrated.game.dims, [18, 6, 6]);
  assert.equal(migrated.game.held, null);
  assert.equal(migrated.game.holdUsed, false);
  assert.equal(migrated.game.flipCount, 3);
  assert.equal(migrated.game.score, legacy.game.score);
  assert.equal(migrated.game.lines, legacy.game.lines);
  assert.equal(migrated.game.placed, legacy.game.placed);
  assert.deepEqual(
    migrated.game.board.map(({ id, x, y, z }) => ({ id, x, y, z })),
    [
      { id: 1, x: 9, y: 0, z: 0 },
      { id: 2, x: 0, y: 4, z: 4 },
    ],
  );
  assert.equal(migrated.game.active.cells.length, 4);
  await legacyPage.locator('#resume-game').tap();
  await legacyPage.locator('#hard-drop').tap();
  await idle(legacyPage);
  assert.equal((await snapshot(legacyPage)).game.placed, 4);
  await legacyPage.locator('#pause-game').tap();
  await legacyPage.locator('#home-game').tap();
  assert.equal(JSON.parse(await stored(legacyPage)).game.version, 3);
  await legacyPage.reload();
  await ready(legacyPage);
  await legacyPage.locator('#continue-game').tap();
  await phase(legacyPage, 'playing');
  assert.deepEqual((await snapshot(legacyPage)).game.dims, [18, 6, 6]);
  report.checks.push(
    'Authentic v1 sideways-gravity save migrates to v3 world-down 18×6×6 coordinates with empty hold, preserving cubes/score, remains playable and reloads',
  );
  await legacyContext.close();

  const previousContext = await browser.newContext(mobile);
  const previous = {
    ...legacy,
    game: {
      ...legacy.game,
      version: 2,
      dims: [6, 6, 12],
      orientation: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      gravity: { axis: 2, sign: -1 },
      flipCount: 3,
      active: { ...legacyShape, pos: [2, 2, 10] },
      board: [{ id: 1, x: 0, y: 0, z: 0, color: '#63e7ff' }],
    },
  };
  delete previous.game.gravityChanges;
  await previousContext.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('tetracube.settings.v1', JSON.stringify({ tutorialDone: true }));
    },
    { key: saveKey, value: previous },
  );
  const previousPage = await previousContext.newPage();
  watch(previousPage);
  await previousPage.goto(origin);
  await ready(previousPage);
  await previousPage.locator('#continue-game').tap();
  await previousPage.locator('#pause-game').tap();
  const fromV2 = (await snapshot(previousPage)).game;
  assert.equal(fromV2.version, 3);
  assert.deepEqual(fromV2.dims, [6, 6, 18]);
  assert.deepEqual(fromV2.board, previous.game.board);
  assert.deepEqual(fromV2.active, previous.game.active);
  assert.deepEqual(fromV2.next, previous.game.next);
  for (const key of ['score', 'lines', 'placed', 'flipCount', 'rngState'])
    assert.equal(fromV2[key], previous.game[key], `v2 migration preserves ${key}`);
  assert.equal(fromV2.held, null);
  assert.equal(fromV2.holdUsed, false);
  await previousPage.locator('#resume-game').tap();
  await previousPage.locator('#hold-piece').tap();
  assert.equal((await snapshot(previousPage)).game.held.id, previous.game.active.id);
  report.checks.push(
    'Authentic v2 6×6×12 save grows to 6×6×18 without moving board/active/queue or changing progression/RNG; new hold works',
  );
  await previousContext.close();

  const reduced = await browser.newContext({ ...mobile, reducedMotion: 'reduce' });
  await reduced.addInitScript(() =>
    localStorage.setItem('tetracube.settings.v1', JSON.stringify({ tutorialDone: true })),
  );
  const reducedPage = await reduced.newPage();
  watch(reducedPage);
  await reducedPage.goto(origin);
  await ready(reducedPage);
  await reducedPage.locator('#start-game').tap();
  assert.equal((await snapshot(reducedPage)).reducedMotion, true);
  const reducedCDP = await reduced.newCDPSession(reducedPage);
  await recordEffects(reducedPage);
  const reducedBefore = await snapshot(reducedPage);
  await swipe(reducedPage, reducedCDP, 70, 24);
  assert.notDeepEqual(xy(await snapshot(reducedPage)), xy(reducedBefore));
  await reducedPage.locator('[data-rotate="XY"]').tap();
  await reducedPage.locator('#hold-piece').tap();
  await reducedPage.locator('#hard-drop').tap();
  await idle(reducedPage);
  assert.equal((await snapshot(reducedPage)).game.placed, 1);
  await reducedPage.locator('[data-flip="left"]').tap();
  await idle(reducedPage);
  assert.deepEqual((await snapshot(reducedPage)).game.dims, [18, 6, 6]);
  const reducedEffects = await recordedEffects(reducedPage);
  assert(reducedEffects.length > 0);
  assert(
    reducedEffects.every((sample) => sample.trails === 0),
    'Reduced motion suppresses motion trails',
  );
  await capture(reducedPage, 'mobile-reduced-motion.png');
  report.checks.push(
    'prefers-reduced-motion preserves touch movement/rotation/hold/drop/quarter-turn while suppressing trails',
  );
  await reduced.close();

  const teaching = await browser.newContext(mobile);
  const teachingPage = await teaching.newPage();
  watch(teachingPage);
  await teachingPage.goto(origin);
  await ready(teachingPage);
  await teachingPage.locator('#start-game').tap();
  assert.equal(await teachingPage.locator('#tutorial').isVisible(), true);
  const teachingCDP = await teaching.newCDPSession(teachingPage);
  await swipe(teachingPage, teachingCDP, 70, 24);
  const rotateInstruction = await teachingPage.locator('#tutorial-text').textContent();
  assert.match(rotateInstruction, /旋转方块/);
  await teachingPage.locator('#hold-piece').tap();
  assert.equal(
    await teachingPage.locator('#tutorial-text').textContent(),
    rotateInstruction,
    'Hold does not complete the instruction to rotate the piece',
  );
  await capture(teachingPage, 'mobile-tutorial-hold.png');
  await teachingPage.locator('[data-rotate="XY"]').tap();
  assert.match(await teachingPage.locator('#tutorial-text').textContent(), /直接落下/);
  await teachingPage.locator('#hard-drop').tap();
  await idle(teachingPage);
  assert.match(await teachingPage.locator('#tutorial-text').textContent(), /颠倒容器/);
  await teachingPage.locator('#flip-container').tap();
  await idle(teachingPage);
  assert.equal(await teachingPage.locator('#tutorial').isVisible(), false);
  report.checks.push(
    'First-run touch teaching advances only on move → actual rotation → drop → physical turn; hold does not incorrectly complete the rotation step',
  );
  await teaching.close();

  const embedded = await browser.newContext(mobile);
  const embeddedPage = await embedded.newPage();
  watch(embeddedPage);
  await embeddedPage.route(`${origin}/qa-embed`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style><main data-game-display-host style="width:100%;height:100%"><iframe title="重力方舱" src="/?dev=0" allow="fullscreen" sandbox="allow-scripts allow-same-origin"></iframe></main>',
    }),
  );
  await embeddedPage.goto(`${origin}/qa-embed`);
  const iframe = await embeddedPage.locator('iframe').elementHandle();
  const frame = await iframe.contentFrame();
  assert(frame);
  await ready(frame);
  assert.equal(await frame.getByRole('button', { name: '开发者调试', exact: true }).count(), 0);
  await frame.locator('#start-game').tap();
  await phase(frame, 'playing');
  await frame.locator('#skip-tutorial').tap();
  await frame.locator('#hold-piece').tap();
  assert.equal((await snapshot(frame)).game.holdUsed, true);
  await frame.locator('[data-flip="left"]').tap();
  await idle(frame);
  assert.deepEqual((await snapshot(frame)).game.dims, [18, 6, 6]);
  for (const viewport of [
    { width: 320, height: 640 },
    mobile.viewport,
    { width: 844, height: 390 },
  ]) {
    await embeddedPage.setViewportSize(viewport);
    await embeddedPage.waitForTimeout(100);
    await noOverflow(embeddedPage);
    await noOverflow(frame);
    for (const selector of [
      '#hold-piece',
      '[data-flip="left"]',
      '[data-flip="right"]',
      '#flip-container',
      '#hard-drop',
    ])
      await fits(frame, selector, viewport);
    await capture(embeddedPage, `iframe-${viewport.width}x${viewport.height}.png`);
  }
  await embeddedPage.setViewportSize(mobile.viewport);
  await frame.locator('#pause-game').tap();
  await phase(frame, 'paused');
  await frame.locator('#home-game').tap();
  await phase(frame, 'home');
  await frame.locator('#continue-game').tap();
  await phase(frame, 'playing');
  assert.deepEqual((await snapshot(frame)).game.dims, [18, 6, 6]);
  report.checks.push(
    'Production iframe touch start/hold/direct left turn/pause/home/continue; 320×640, 390×844 and 844×390 iframe/host fit without overflow and explicit dev=0 stays off',
  );
  await embedded.close();

  const blocked = await browser.newContext(mobile);
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('disabled');
      },
    });
  });
  const deniedPage = await blocked.newPage();
  watch(deniedPage);
  await deniedPage.goto(origin);
  await ready(deniedPage);
  await deniedPage.locator('#start-game').tap();
  await deniedPage.locator('#hard-drop').tap();
  await idle(deniedPage);
  assert.equal((await snapshot(deniedPage)).game.placed, 1);
  await deniedPage.locator('#flip-container').tap();
  await idle(deniedPage);
  worldDown(await snapshot(deniedPage));
  assert.equal((await snapshot(deniedPage)).game.flipCount, 1);
  report.checks.push('Unavailable storage still allows starting, dropping and physically flipping');
  await blocked.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await browser.close();
  server.kill();
  await writeFile(new URL('browser-report.json', evidence), JSON.stringify(report, null, 2) + '\n');
}
console.log(`Tetracube browser: ${report.checks.length} flows passed; no page errors.`);
