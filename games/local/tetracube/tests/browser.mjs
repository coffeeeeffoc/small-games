import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { Game } from '../src/engine.mjs';
import { SHAPES } from '../src/config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../docs/qa/interaction-2026-10-07/', import.meta.url);
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
const worldDown = (state) => assert.deepEqual(state.game.gravity, { axis: 2, sign: -1 });
const stored = (page) => page.evaluate((key) => localStorage.getItem(key), saveKey);
const touch = (cdp, type, touchPoints = []) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
const point = (x, y, id = 1) => ({ x, y, id });
const rotation = (page, plane, direction = 1) =>
  page.locator(`[data-rotate="${plane}"][data-rotate-direction="${direction}"]`);
const coordinates = (cells) => cells.map((cell) => cell.join(',')).sort();
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
  await capture(page, 'mobile-home.png');
  await page.locator('#help-home').tap();
  await phase(page, 'help');
  await page.locator('#help-back').tap();
  await phase(page, 'home');
  assert.equal(await stored(page), null, 'Opening help must not manufacture a saved run');
  await page.locator('#start-game').tap();
  await phase(page, 'playing');
  assert.deepEqual((await snapshot(page)).game.dims, [6, 6, 12]);
  await capture(page, 'mobile-tutorial.png');
  await page.locator('#skip-tutorial').tap();
  assert.equal(await page.locator('[data-move]').count(), 0, 'Movement is directly on the board');
  assert.equal(await page.locator('#gravity-open').count(), 0, 'Flip needs no direction picker');
  const beforeMove = await snapshot(page);
  await swipe(page, cdp, 70, 24);
  const afterMove = await snapshot(page);
  assert.notDeepEqual(
    xy(afterMove),
    xy(beforeMove),
    'Board swipe moves the active piece horizontally',
  );
  assert.deepEqual(afterMove.camera, beforeMove.camera, 'Move gesture cannot orbit the camera');
  for (const plane of ['XY', 'XZ', 'YZ']) await rotation(page, plane).tap();
  await page.locator('#hard-drop').tap();
  await idle(page);
  assert.equal((await snapshot(page)).game.placed, 1);
  worldDown(await snapshot(page));
  await capture(page, 'mobile-play.png');
  report.checks.push(
    'Home/help/start, 6×6×12 container, direct canvas movement, three rotations and hard drop',
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
    if (view === 'top') {
      const top = await snapshot(page);
      assert.equal(top.projection.mode, 'perspective');
      const [lower, upper] = top.projection.samples;
      assert.ok(
        Math.hypot(upper.x - lower.x, upper.y - lower.y) > 3,
        'Top view separates a vertical stack into distinct projected layers',
      );
      await capture(page, 'mobile-top.png');
      await swipe(page, cdp, 0, 115);
      const overTop = await snapshot(page);
      assert.ok(overTop.camera.pitch > Math.PI / 2, 'Observation drag passes over top view');
      await swipe(page, cdp, 0, 30);
      assert.ok(
        (await snapshot(page)).camera.pitch > overTop.camera.pitch,
        'Dragging in the same direction continues rotating beyond top view',
      );
      assert.deepEqual(xy(await snapshot(page)), xy(top), 'Observation never moves the piece');
    }
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
  await page.waitForFunction(() => document.querySelector('#hard-drop').disabled);
  for (const selector of [
    '#hard-drop',
    '#flip-container',
    '[data-rotate="XY"][data-rotate-direction="1"]',
  ])
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
  assert.deepEqual(
    (await snapshot(page)).game,
    pausedFlip.game,
    'Pausing freezes the reconstruction state',
  );
  await page.locator('#resume-game').tap();
  await idle(page);
  const afterFlip = await snapshot(page);
  worldDown(afterFlip);
  assert.deepEqual(afterFlip.game.dims, [6, 6, 12]);
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

  await page.locator('[data-input="observe"]').tap();
  for (const [turn, dims] of [
    ['left', [12, 6, 6]],
    ['right', [6, 6, 12]],
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
    assert.equal(after.game.status, 'playing');
    if (turn === 'left') await capture(page, 'mobile-side-flip.png');
  }
  report.checks.push(
    'Left/right physical quarter-turns update container dimensions without changing gravity or camera',
  );
  await page.locator('[data-input="move"]').tap();
  await page.locator('#pause-game').tap();
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
    'Pause freezes simulation; home/reload/help/continue restores full v2 game including physical orientation',
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
      '[data-input="move"]',
      '[data-input="observe"]',
      ...['XY', 'XZ', 'YZ'].flatMap((plane) =>
        [1, -1].map(
          (direction) => `[data-rotate="${plane}"][data-rotate-direction="${direction}"]`,
        ),
      ),
    ]) {
      const bounds = await page.locator(selector).boundingBox();
      assert(
        bounds &&
          bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= viewport.width + 1 &&
          bounds.y + bounds.height <= viewport.height + 1,
        `${selector} fits ${viewport.width}×${viewport.height}`,
      );
      assert(
        bounds.width >= 43 && bounds.height >= 43,
        `${selector} has a mobile-sized touch target`,
      );
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    worldDown(await snapshot(page));
    await capture(page, `play-${viewport.width}x${viewport.height}.png`);
  }
  report.checks.push(
    'Responsive 320×640, 390×844, 844×390 and 1440×1000 layouts with visible usable primary touch controls',
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
  await capture(page, 'mobile-result.png');
  await page.locator('#retry-game').tap();
  await phase(page, 'playing');
  report.checks.push('Danger → one-tap physical flip rescue → playing; danger → result → retry');
  await context.close();

  const rotationContext = await browser.newContext(mobile);
  const rotationGame = new Game({ seed: 711 });
  rotationGame.board = [
    { id: 1, x: 1, y: 1, z: 0, color: '#63e7ff' },
    { id: 2, x: 1, y: 1, z: 1, color: '#63e7ff' },
    { id: 3, x: 2, y: 1, z: 0, color: '#63e7ff' },
  ];
  rotationGame.serial = 3;
  rotationGame.active = {
    ...structuredClone(SHAPES.find(({ id }) => id === 'tripod')),
    pos: [2, 2, 6],
  };
  const rotationSave = {
    version: 1,
    game: rotationGame.getSnapshot(),
    tutorialStep: 4,
    rescueUsed: false,
  };
  await rotationContext.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('tetracube.settings.v1', JSON.stringify({ tutorialDone: true }));
    },
    { key: saveKey, value: rotationSave },
  );
  const rotationPage = await rotationContext.newPage();
  watch(rotationPage);
  await rotationPage.goto(origin);
  await ready(rotationPage);
  await rotationPage.locator('#continue-game').tap();
  await phase(rotationPage, 'playing');
  await rotationPage.waitForFunction(() => {
    const layers = window.tetracubeSnapshot().layers;
    return layers.visible.includes(1) && layers.visible.includes(2) && layers.landing.length > 0;
  });
  assert.match(
    await rotationPage.locator('#stage-hint').innerText(),
    /落点.*层/,
    'Landing height is visible',
  );
  for (const plane of ['XY', 'XZ', 'YZ']) {
    const before = await snapshot(rotationPage);
    for (const direction of [1, -1]) {
      const button = rotation(rotationPage, plane, direction);
      assert.equal(
        await button.locator('svg').count(),
        1,
        `${plane} ${direction} has a spatial icon`,
      );
      assert.ok(await button.getAttribute('aria-label'), 'Rotation control has an accessible name');
      await button.tap();
      if (direction === 1) {
        assert.notDeepEqual(
          coordinates((await snapshot(rotationPage)).game.active.cells),
          coordinates(before.game.active.cells),
          `${plane} forward control changes orientation`,
        );
      }
    }
    const restored = await snapshot(rotationPage);
    assert.deepEqual(
      coordinates(restored.game.active.cells),
      coordinates(before.game.active.cells),
      `${plane} reverse control undoes one forward turn`,
    );
    assert.deepEqual(
      xy(restored),
      xy(before),
      'Free-space inverse rotation preserves horizontal position',
    );
  }
  await rotation(rotationPage, 'XZ', -1).tap();
  await rotation(rotationPage, 'YZ', 1).tap();
  const beforeRotatedDrop = await snapshot(rotationPage);
  const expectedGame = new Game().restore(beforeRotatedDrop.game);
  const expectedLanding = coordinates(expectedGame.ghost());
  await rotationPage.locator('[data-input="observe"]').tap();
  await rotationPage.locator('[data-view="top"]').tap();
  await capture(rotationPage, 'mobile-layer-stack.png');
  await rotationPage.locator('#hard-drop').tap();
  await idle(rotationPage);
  const dropped = await snapshot(rotationPage);
  assert.equal(dropped.game.placed, beforeRotatedDrop.game.placed + 1);
  assert.deepEqual(
    coordinates(
      dropped.game.board
        .filter(({ id }) => id > rotationGame.serial)
        .map(({ x, y, z }) => [x, y, z]),
    ),
    expectedLanding,
    'The real drop control commits the rotated piece at its predicted landing cells',
  );
  report.checks.push(
    'Six spatial rotation controls, inverse turns on XY/XZ/YZ, perspective layer separation, continuous orbit across top view and exact landing after rotation',
  );
  await rotationContext.close();

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
  assert.equal(migrated.game.version, 2);
  assert.deepEqual(migrated.game.dims, [12, 6, 6]);
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
  assert.equal(JSON.parse(await stored(legacyPage)).game.version, 2);
  await legacyPage.reload();
  await ready(legacyPage);
  await legacyPage.locator('#continue-game').tap();
  await phase(legacyPage, 'playing');
  assert.deepEqual((await snapshot(legacyPage)).game.dims, [12, 6, 6]);
  report.checks.push(
    'Authentic v1 sideways-gravity save migrates to v2 world-down coordinates without losing cubes or changing score, remains playable and reloads',
  );
  await legacyContext.close();

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
