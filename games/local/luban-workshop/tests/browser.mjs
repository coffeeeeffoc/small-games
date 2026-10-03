import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const evidenceDir = process.env.BROWSER_EVIDENCE_DIR || resolve(tmpdir(), 'luban-browser-checks');

/** All game changes come from real buttons, mouse input, and CDP touch input.
 * The diagnostic snapshot is read only; no solver or state setter is injected.
 * A shell can supply its iframe as `scope` and its element as `frameElement`.
 */
export async function exerciseStandalone(
  page,
  {
    mobile = false,
    scope = page,
    frameElement,
    screenshotPrefix = mobile ? 'mobile' : 'desktop',
    screenshotDir = evidenceDir,
    completeAllLevels = true,
    interactionsOnly = false,
  } = {},
) {
  await scope.locator('#app[data-ready="true"]').waitFor();
  const snapshot = () => scope.evaluate(() => window.lubanSnapshot());
  const activate = async (selector) => {
    const button = scope.locator(selector);
    if (mobile) await button.tap();
    else await button.click();
  };
  const cdp = mobile ? await page.context().newCDPSession(page) : null;
  const globalPoint = async (point) => {
    const frame = frameElement ? await frameElement.boundingBox() : { x: 0, y: 0 };
    assert.ok(frame, 'The embedded game must be visible');
    return { x: point.x + frame.x, y: point.y + frame.y };
  };
  const touch = async (type, points) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: await Promise.all(
        points.map(async (point, index) => ({
          ...(await globalPoint(point)),
          id: index + 1,
          radiusX: 5,
          radiusY: 5,
          force: 1,
        })),
      ),
    });
  };
  const tap = async (point) => {
    if (mobile) {
      await touch('touchStart', [point]);
      await touch('touchEnd', []);
    } else {
      const p = await globalPoint(point);
      await page.mouse.click(p.x, p.y);
    }
  };
  const drag = async (from, to, { cancel = false, keepDown = false } = {}) => {
    if (mobile) {
      await touch('touchStart', [from]);
      for (let step = 1; step <= 8; step++) {
        await touch('touchMove', [
          { x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 },
        ]);
      }
      if (!keepDown) await touch(cancel ? 'touchCancel' : 'touchEnd', []);
    } else {
      const a = await globalPoint(from),
        b = await globalPoint(to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 8 });
      if (!keepDown) await page.mouse.up();
    }
  };
  const screenshot = async (name) => {
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: resolve(screenshotDir, `${screenshotPrefix}-${name}.png`),
      fullPage: true,
    });
  };

  const axes = ['x', 'y', 'z'];
  const component = (data, id, axis) => data.state.offsets[id][axes.indexOf(axis)];
  const selectSingle = async (id) => {
    if ((await scope.locator('#group-select').getAttribute('aria-pressed')) === 'true')
      await activate('#group-select');
    await activate(`[data-piece="${id}"]`);
    assert.deepEqual((await snapshot()).selectedIds, [id]);
  };
  const chooseAxis = async (axis) => {
    await activate(`#axis-${axis}`);
    assert.equal((await snapshot()).activeAxis, axis);
  };
  const dragAlong = async (from, id, axis, distance, options) => {
    const direction = (await snapshot()).pieces.find((piece) => piece.id === id).directions[axis];
    const to = {
      x: from.x + direction.x * direction.pixelsPerUnit * distance,
      y: from.y + direction.y * direction.pixelsPerUnit * distance,
    };
    await drag(from, to, options);
    return to;
  };

  // These are projections of real mesh surfaces. Each candidate still has to
  // be selected through the normal raycast, including after the camera moves.
  const findPiece = async (id, { preserveSelection = false } = {}) => {
    const data = await snapshot();
    const piece = data.pieces.find((item) => item.id === id);
    assert.ok(piece, `Missing piece ${id}`);
    if (preserveSelection) assert.notEqual(data.selected, id);
    else await selectSingle(data.pieces.find((item) => item.id !== id).id);
    assert.ok(piece.screenSamples.length, `${id} must expose rendered surface samples`);
    for (const sample of piece.screenSamples) {
      const point = {
        x: data.stage.x + sample.x,
        y: data.stage.y + sample.y,
      };
      if (
        point.x < data.stage.x + 4 ||
        point.x > data.stage.x + data.stage.width - 4 ||
        point.y < data.stage.y + 4 ||
        point.y > data.stage.y + data.stage.height - 4
      )
        continue;
      const hitsCanvas = await scope.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit?.tagName === 'CANVAS';
      }, point);
      if (!hitsCanvas) continue;
      await tap(point);
      if ((await snapshot()).selected === id) return point;
    }
    throw new Error(`Could not select visible ${id} directly from the scene`);
  };

  const layout = await scope.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    canvas: document.querySelector('canvas').getBoundingClientRect().toJSON(),
  }));
  assert.ok(layout.scrollWidth <= layout.width + 1, 'The game must not overflow horizontally');
  assert.ok(
    layout.canvas.width >= 300 && layout.canvas.height >= 180,
    '3D interaction area must stay usable',
  );
  for (const selector of [
    '#levels',
    '#help',
    '#hint',
    '#restart',
    '#group-select',
    '#axis-x',
    '#axis-y',
    '#axis-z',
    '[data-piece="key"]',
  ]) {
    assert.ok(await scope.locator(selector).isVisible(), `${selector} must be discoverable`);
  }
  await screenshot('initial');

  await activate('#help');
  assert.equal(await scope.locator('#dialog').evaluate((element) => element.open), true);
  await activate('#help-done');

  // Every part is directly selectable, including the blue cap which can lift
  // off immediately. Sideways moves use the same geometry as axial moves.
  for (const piece of (await snapshot()).pieces) await findPiece(piece.id);
  for (const [direction, id] of [
    ['negative', 'cross'],
    ['positive', 'upright'],
  ]) {
    await selectSingle('key');
    await chooseAxis('y');
    const beforeHandleSelection = await snapshot();
    const handle = scope.locator(`#axis-${direction}`);
    assert.equal(await handle.isVisible(), false, `The Y ${direction} handle must not cover ${id}`);
    const point = await handle.evaluate((element) => {
      const stage = element.parentElement.getBoundingClientRect();
      return {
        x: stage.x + parseFloat(element.style.left),
        y: stage.y + parseFloat(element.style.top),
      };
    });
    await tap(point);
    assert.equal((await snapshot()).selected, id, 'A covered face must remain directly selectable');
    assert.deepEqual((await snapshot()).state, beforeHandleSelection.state);
  }
  for (const id of ['cross', 'upright']) {
    await selectSingle('key');
    await chooseAxis('z');
    await findPiece(id, { preserveSelection: true });
  }
  await selectSingle('upright');
  await chooseAxis('y');
  const beforeLift = (await snapshot()).state;
  await activate('#nudge-positive');
  assert.deepEqual((await snapshot()).state.offsets.upright, [0, 0.5, 0]);
  await activate('#undo');
  assert.deepEqual((await snapshot()).state.offsets, beforeLift.offsets);
  await selectSingle('key');
  await chooseAxis('z');
  await activate('#nudge-negative');
  assert.deepEqual((await snapshot()).state.offsets.key, [0, 0, -0.5]);
  await activate('#undo');

  // Blocking feedback must identify the obstructing part and preserve history.
  await selectSingle('cross');
  await chooseAxis('y');
  const beforeCollision = (await snapshot()).state;
  await activate('#nudge-positive');
  assert.deepEqual(
    (await snapshot()).state,
    beforeCollision,
    'A blocked move cannot change state or add history',
  );
  assert.match(await scope.locator('#status').innerText(), /挡住/);
  assert.ok(
    await scope
      .locator('[data-piece="key"]')
      .evaluate((element) => element.classList.contains('blocked')),
  );
  await screenshot('collision');

  // A direct drag moves only the selected bar and records one undoable action.
  const from = await findPiece('key');
  const beforeDrag = await snapshot();
  await dragAlong(from, 'key', 'x', 1.2);
  const afterDragSnapshot = await snapshot();
  const afterDrag = afterDragSnapshot.state;
  assert.deepEqual(afterDrag.offsets.key, [1, 0, 0], 'A direct drag should snap to one unit');
  assert.deepEqual(afterDrag.offsets.cross, [0, 0, 0]);
  assert.deepEqual(afterDrag.offsets.upright, [0, 0, 0]);
  assert.equal(afterDrag.moves, beforeDrag.state.moves + 1, 'A drag is one history action');
  for (const axis of axes) {
    const before = beforeDrag.pieces.find((piece) => piece.id === 'key').directions[axis];
    const after = afterDragSnapshot.pieces.find((piece) => piece.id === 'key').directions[axis];
    assert.ok(
      Math.abs(before.pixelsPerUnit - after.pixelsPerUnit) < 0.001 &&
        Math.hypot(before.x - after.x, before.y - after.y) < 0.001,
      `A translated piece must retain its projected ${axis} direction and scale`,
    );
  }
  await activate('#undo');
  assert.deepEqual((await snapshot()).state.offsets, beforeDrag.state.offsets);
  await activate('#redo');
  assert.deepEqual((await snapshot()).state.offsets, afterDrag.offsets);

  // Reload is a real page/iframe navigation; persistence must restore history.
  if (scope === page) await page.reload();
  else await scope.goto(scope.url());
  await scope.locator('#app[data-ready="true"]').waitFor();
  assert.deepEqual(
    (await snapshot()).state,
    afterDrag,
    'Reload must recover offsets and undo history',
  );
  await activate('#undo');
  assert.deepEqual((await snapshot()).state.offsets.key, [0, 0, 0]);

  // A and B stay engaged with each other while translating as a subassembly.
  // Pressing an already selected body must preserve the entire selected set.
  const groupFrom = await findPiece('key');
  await activate('#group-select');
  await activate('[data-piece="cross"]');
  await chooseAxis('y');
  assert.deepEqual(new Set((await snapshot()).selectedIds), new Set(['key', 'cross']));
  const beforeGroup = (await snapshot()).state;
  await dragAlong(groupFrom, 'key', 'y', -1.2);
  const afterGroupSnapshot = await snapshot();
  const afterGroup = afterGroupSnapshot.state;
  assert.deepEqual(new Set(afterGroupSnapshot.selectedIds), new Set(['key', 'cross']));
  assert.deepEqual(afterGroup.offsets.key, [0, -1, 0]);
  assert.deepEqual(afterGroup.offsets.cross, [0, -1, 0]);
  assert.deepEqual(afterGroup.offsets.upright, [0, 0, 0]);
  assert.equal(afterGroup.moves, beforeGroup.moves + 1, 'One group drag is one history action');
  assert.equal(
    afterGroupSnapshot.progress.complete,
    false,
    'An engaged group is not fully disassembled',
  );
  await screenshot('group-move');
  await activate('#undo');
  assert.deepEqual((await snapshot()).state.offsets, beforeGroup.offsets);
  await activate('#redo');
  assert.deepEqual((await snapshot()).state.offsets, afterGroup.offsets);
  if (scope === page) await page.reload();
  else await scope.goto(scope.url());
  await scope.locator('#app[data-ready="true"]').waitFor();
  assert.deepEqual(
    (await snapshot()).state,
    afterGroup,
    'Reload preserves a group action atomically',
  );
  await activate('#undo');
  assert.deepEqual((await snapshot()).state.offsets, beforeGroup.offsets);

  if (mobile) {
    const start = await findPiece('key');
    const stateBeforeCancel = (await snapshot()).state;
    const end = await dragAlong(start, 'key', 'x', 1.3, { keepDown: true });
    assert.ok(
      component(await snapshot(), 'key', 'x') > 0.5,
      'Touch preview must follow the finger',
    );
    await touch('touchCancel', []);
    assert.deepEqual(
      (await snapshot()).state,
      stateBeforeCancel,
      'pointercancel must restore the whole transaction',
    );

    // Adding a second finger cancels a part drag before camera zoom begins.
    await drag(start, end, { keepDown: true });
    const other = { x: end.x - 90, y: end.y + 30 };
    await touch('touchStart', [end, other]);
    assert.deepEqual(
      (await snapshot()).state,
      stateBeforeCancel,
      'A pinch cannot accidentally commit a part drag',
    );
    const beforePinch = (await snapshot()).pieces[0].direction.pixelsPerUnit;
    await touch('touchMove', [
      { x: end.x + 20, y: end.y - 8 },
      { x: other.x - 20, y: other.y + 8 },
    ]);
    await touch('touchEnd', []);
    const afterPinch = await snapshot();
    assert.deepEqual(afterPinch.state, stateBeforeCancel);
    assert.ok(
      afterPinch.pieces[0].direction.pixelsPerUnit > beforePinch * 1.08,
      'Pinching out must zoom in',
    );
    await activate('#camera-reset');
  }

  // Background drags rotate the view without modifying puzzle state.
  const beforeOrbit = await snapshot();
  const blank = {
    x: beforeOrbit.stage.x + 25,
    y: beforeOrbit.stage.y + beforeOrbit.stage.height * 0.68,
  };
  await drag(blank, { x: blank.x + 40, y: blank.y + 18 });
  const afterOrbit = await snapshot();
  assert.deepEqual(afterOrbit.state, beforeOrbit.state);
  assert.ok(
    Math.hypot(
      afterOrbit.pieces[0].direction.x - beforeOrbit.pieces[0].direction.x,
      afterOrbit.pieces[0].direction.y - beforeOrbit.pieces[0].direction.y,
    ) > 0.01,
    `Background drag must rotate the camera: ${JSON.stringify({ before: beforeOrbit.pieces[0].direction, after: afterOrbit.pieces[0].direction })}`,
  );
  for (const piece of afterOrbit.pieces) await findPiece(piece.id);
  const rotatedFrom = await findPiece('key');
  const beforeRotatedDrag = await snapshot();
  await dragAlong(rotatedFrom, 'key', 'x', 1.2);
  const afterRotatedDrag = await snapshot();
  assert.deepEqual(afterRotatedDrag.state.offsets.key, [1, 0, 0]);
  const beforeScreen = beforeRotatedDrag.pieces.find((piece) => piece.id === 'key').screen;
  const afterScreen = afterRotatedDrag.pieces.find((piece) => piece.id === 'key').screen;
  const projected = beforeRotatedDrag.pieces.find((piece) => piece.id === 'key').directions.x;
  const screenDelta = { x: afterScreen.x - beforeScreen.x, y: afterScreen.y - beforeScreen.y };
  assert.ok(
    screenDelta.x * projected.x + screenDelta.y * projected.y > 0,
    'After orbiting, the piece must move in the pointer direction',
  );
  assert.ok(
    Math.hypot(
      screenDelta.x - projected.x * projected.pixelsPerUnit,
      screenDelta.y - projected.y * projected.pixelsPerUnit,
    ) < 0.01,
    'The drag projection must use world coordinates consistently',
  );
  await activate('#undo');
  await activate('#camera-reset');

  await activate('[data-piece="key"]');
  await activate('#xray');
  assert.equal((await snapshot()).xray, true);
  assert.equal(await scope.locator('#xray').getAttribute('aria-pressed'), 'true');
  await activate('#xray');
  assert.equal((await snapshot()).xray, false);

  if (mobile) {
    const button = await scope.locator('#nudge-positive').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    const beforeButtonGesture = (await snapshot()).state;
    await drag(button, { x: button.x + 55, y: button.y });
    assert.deepEqual(
      (await snapshot()).state,
      beforeButtonGesture,
      'Swiping across a button must not activate it',
    );
    await touch('touchStart', [button]);
    await touch('touchCancel', []);
    assert.deepEqual(
      (await snapshot()).state,
      beforeButtonGesture,
      'Cancelling a button touch must not activate it',
    );
  }

  if (!mobile) {
    await selectSingle('key');
    await chooseAxis('x');
    await activate('[data-piece="key"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(
      component(await snapshot(), 'key', 'x'),
      0.5,
      'Focused piece buttons must still allow keyboard movement',
    );
    await page.keyboard.press('Control+z');
    assert.equal(
      component(await snapshot(), 'key', 'x'),
      0,
      'Undo shortcut must work while a button is focused',
    );
  }

  // Verify scene-attached controls when present, including reversing a move.
  await selectSingle('key');
  await chooseAxis('x');
  if (await scope.locator('#axis-positive').isVisible()) {
    await activate('#axis-positive');
    assert.equal(component(await snapshot(), 'key', 'x'), 0.5);
    await activate('#axis-negative');
    assert.equal(component(await snapshot(), 'key', 'x'), 0);
  }

  // Free movement can carry an entire engaged assembly well beyond its old
  // rails. Reframing, reloading, and restarting must fit the current geometry,
  // rather than fitting the poses from before the state change.
  await activate('#camera-reset');
  const originFraming = await snapshot();
  await selectSingle('key');
  await activate('#group-select');
  for (const piece of originFraming.pieces.filter((piece) => piece.id !== 'key'))
    await activate(`[data-piece="${piece.id}"]`);
  await chooseAxis('x');
  for (let step = 0; step < 16; step++) await activate('#nudge-positive');
  const translatedAssembly = await snapshot();
  for (const offset of Object.values(translatedAssembly.state.offsets))
    assert.deepEqual(offset, [8, 0, 0]);
  assert.equal(
    translatedAssembly.progress.complete,
    false,
    'Moving an engaged assembly beyond the old rails cannot count as disassembly',
  );
  const assertFraming = (data, expected, message) => {
    for (const piece of data.pieces) {
      const before = expected.pieces.find((item) => item.id === piece.id);
      assert.ok(
        Math.hypot(piece.screen.x - before.screen.x, piece.screen.y - before.screen.y) < 0.01,
        `${message}: ${piece.id} must stay centered in the fitted scene`,
      );
    }
  };
  await activate('#camera-reset');
  const reframedAssembly = await snapshot();
  assert.deepEqual(reframedAssembly.state, translatedAssembly.state);
  assertFraming(reframedAssembly, originFraming, 'Camera reset after translation');
  if (scope === page) await page.reload();
  else await scope.goto(scope.url());
  await scope.locator('#app[data-ready="true"]').waitFor();
  const restoredAssembly = await snapshot();
  assert.deepEqual(restoredAssembly.state, translatedAssembly.state);
  assertFraming(restoredAssembly, originFraming, 'Reload of a translated assembly');
  for (const piece of restoredAssembly.pieces) await findPiece(piece.id);
  await screenshot('translated-assembly-reloaded');
  await activate('#restart');
  await activate('#confirm-restart');
  const restartedAssembly = await snapshot();
  assert.equal(restartedAssembly.state.moves, 0);
  for (const offset of Object.values(restartedAssembly.state.offsets))
    assert.deepEqual(offset, [0, 0, 0]);
  assertFraming(restartedAssembly, originFraming, 'Restart of a translated assembly');
  for (const piece of restartedAssembly.pieces) await findPiece(piece.id);

  if (interactionsOnly) {
    await cdp?.detach();
    return { levels: 0, mobile, screenshots: screenshotDir };
  }

  const solvePhase = async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const beforeHint = await snapshot();
      if (beforeHint.progress.complete) return;
      await activate('#hint');
      const hinted = await snapshot();
      assert.ok(hinted.hint, `No hint from a reachable ${hinted.state.phase} state`);
      assert.equal(
        hinted.selected,
        hinted.hint.pieceId,
        'A hint must highlight the part to manipulate',
      );
      const { pieceId, pieceIds, axis, targetOffset, direction } = hinted.hint;
      assert.deepEqual(new Set(hinted.selectedIds), new Set(pieceIds));
      assert.equal(hinted.activeAxis, axis, 'Hints must set the movement axis they describe');
      const selector = direction > 0 ? '#nudge-positive' : '#nudge-negative';
      for (let step = 0; step < 60; step++) {
        const current = component(await snapshot(), pieceId, axis);
        if (Math.abs(current - targetOffset) < 0.001) break;
        await activate(selector);
        const next = component(await snapshot(), pieceId, axis);
        assert.ok(
          Math.abs(next - current) > 0.001,
          'The suggested motion must be physically executable',
        );
        assert.ok(Math.abs(targetOffset - next) < Math.abs(targetOffset - current) + 0.001);
      }
      assert.ok(
        Math.abs(component(await snapshot(), pieceId, axis) - targetOffset) < 0.001,
        'The hinted target must be reachable with touch controls',
      );
    }
    assert.fail('Puzzle did not complete within 60 hinted actions');
  };

  const levelCount = completeAllLevels ? 3 : 1;
  for (let index = 0; index < levelCount; index++) {
    if (index > 0) {
      await activate('#levels');
      await activate(`[data-level="${index}"]`);
    }
    assert.equal((await snapshot()).pieces.length, index + 3);
    // The same direct selection and free-axis behavior must hold at every level.
    for (const piece of (await snapshot()).pieces) await findPiece(piece.id);
    await selectSingle('key');
    await chooseAxis('z');
    await activate('#nudge-negative');
    assert.deepEqual((await snapshot()).state.offsets.key, [0, 0, -0.5]);
    await activate('#undo');
    await solvePhase();
    assert.equal((await snapshot()).progress.removed, index + 3);
    await screenshot(`level-${index + 1}-disassembled`);
    await activate('#reassemble');
    assert.equal((await snapshot()).state.phase, 'reassemble');
    assert.equal((await snapshot()).state.history.length, 0);
    await solvePhase();
    const complete = await snapshot();
    assert.equal(complete.progress.assembled, index + 3);
    assert.equal(complete.progress.complete, true);
    assert.ok(
      Object.values(complete.state.offsets).every((value) => value.every((axis) => axis === 0)),
    );
    assert.ok(await scope.locator('#next-level').isVisible());
    await screenshot(`level-${index + 1}-reassembled`);
    console.log(`${screenshotPrefix}: level ${index + 1} disassembly and reassembly passed`);
  }

  await activate('#levels');
  assert.equal(
    await scope.locator('.level-badge').filter({ hasText: '已复原' }).count(),
    levelCount,
  );
  await activate('#close-dialog');
  await activate('#restart');
  await activate('#keep-playing');
  assert.equal(
    (await snapshot()).progress.complete,
    true,
    'Dismissing restart must preserve completion',
  );
  await activate('#restart');
  await activate('#confirm-restart');
  assert.equal((await snapshot()).state.moves, 0);
  assert.equal((await snapshot()).state.phase, 'disassemble');
  assert.equal((await snapshot()).progress.complete, false);
  await cdp?.detach();
  return { levels: levelCount, mobile, screenshots: screenshotDir };
}

async function runBrowserChecks() {
  const port = process.env.GAME_PORT || '4340';
  const url = process.env.GAME_URL || `http://127.0.0.1:${port}/`;
  let server;
  let browser;
  let serverOutput = '';
  try {
    if (!process.env.GAME_URL) {
      const vite = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
      await new Promise((resolveBuild, reject) => {
        const build = spawn(process.execPath, [vite, 'build'], { cwd: root, stdio: 'inherit' });
        build.once('error', reject);
        build.once('exit', (code) =>
          code === 0 ? resolveBuild() : reject(new Error(`Vite build exited ${code}`)),
        );
      });
      server = spawn(
        process.execPath,
        [vite, 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'],
        { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let startupError;
      server.once('error', (error) => {
        startupError = error;
      });
      for (const stream of [server.stdout, server.stderr])
        stream.on('data', (chunk) => {
          serverOutput = (serverOutput + chunk).slice(-4000);
        });
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (startupError) throw startupError;
        if (server.exitCode !== null) throw new Error(`Preview stopped: ${serverOutput}`);
        try {
          ready = (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
          if (ready) break;
        } catch {
          /* Bounded preview startup polling. */
        }
        await delay(100);
      }
      assert.ok(ready, `Preview did not become available: ${serverOutput}`);
    }

    const executablePath =
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    });
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(url);
        await exerciseStandalone(page, { mobile });
        if (mobile) {
          for (const viewport of [
            { width: 360, height: 740 },
            { width: 844, height: 390 },
          ]) {
            await page.setViewportSize(viewport);
            await page.locator('[data-piece="key"]').tap();
            await page.screenshot({
              path: resolve(evidenceDir, `mobile-layout-${viewport.width}x${viewport.height}.png`),
              fullPage: true,
            });
            const layout = await page.evaluate(() => ({
              overflowX: document.documentElement.scrollWidth > innerWidth + 1,
              overflowY: document.documentElement.scrollHeight > innerHeight + 1,
              controls: [
                ...document.querySelectorAll(
                  '.controls button, .topbar button, .view-tools button, .axis-handle',
                ),
              ]
                .filter((button) => button.getBoundingClientRect().width > 0)
                .map((button) => {
                  const box = button.getBoundingClientRect();
                  const hit = document.elementFromPoint(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                  );
                  return {
                    name: button.id || button.getAttribute('aria-label'),
                    onScreen:
                      box.x >= 0 &&
                      box.y >= 0 &&
                      box.right <= innerWidth + 1 &&
                      box.bottom <= innerHeight + 1,
                    unobstructed: button === hit || button.contains(hit),
                  };
                }),
            }));
            assert.equal(
              layout.overflowX || layout.overflowY,
              false,
              `No scrolling at ${viewport.width}×${viewport.height}`,
            );
            assert.deepEqual(
              layout.controls.filter((control) => !control.onScreen || !control.unobstructed),
              [],
              `Controls must remain visible and unobstructed at ${viewport.width}×${viewport.height}`,
            );
          }
        }
        assert.deepEqual(errors, [], 'The browser must not raise uncaught errors');
      } catch (error) {
        await mkdir(evidenceDir, { recursive: true });
        await page.screenshot({
          path: resolve(evidenceDir, `${mobile ? 'mobile' : 'desktop'}-failure.png`),
          fullPage: true,
        });
        throw error;
      } finally {
        await context.close();
      }
    }
    console.log(`Desktop and mobile browser checks passed. Screenshots: ${evidenceDir}`);
  } finally {
    await browser?.close();
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = new Promise((resolveExit) => server.once('exit', resolveExit));
      server.kill('SIGTERM');
      await Promise.race([exited, delay(2000)]);
      if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBrowserChecks().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
