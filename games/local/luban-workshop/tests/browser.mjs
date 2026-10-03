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
    levelIndices,
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

  // Find an exposed point on the actual rendered bar, so occlusion cannot turn
  // a test into a drag of the wrong piece. Tapping never changes puzzle offsets.
  const findPiece = async (id) => {
    const data = await snapshot();
    const piece = data.pieces.find((item) => item.id === id);
    assert.ok(piece, `Missing piece ${id}`);
    for (const units of [2, -2, 1.5, -1.5, 0, 1, -1]) {
      const point = {
        x:
          data.stage.x + piece.screen.x + piece.direction.x * piece.direction.pixelsPerUnit * units,
        y:
          data.stage.y + piece.screen.y + piece.direction.y * piece.direction.pixelsPerUnit * units,
      };
      if (
        point.x < data.stage.x + 4 ||
        point.x > data.stage.x + data.stage.width - 4 ||
        point.y < data.stage.y + 4 ||
        point.y > data.stage.y + data.stage.height - 4
      )
        continue;
      if (
        !(await scope.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS',
          point,
        ))
      )
        continue;
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
  for (const selector of ['#levels', '#help', '#clue', '#hint', '#restart', '[data-piece="key"]']) {
    assert.ok(await scope.locator(selector).isVisible(), `${selector} must be discoverable`);
  }
  await screenshot('initial');

  await activate('#help');
  assert.equal(await scope.locator('#dialog').evaluate((element) => element.open), true);
  await activate('#help-done');

  await activate('#levels');
  const catalog = await scope.locator('button[data-level]').evaluateAll((buttons) =>
    buttons.map((button) => ({
      index: Number(button.dataset.level),
      number: button.querySelector('.level-number')?.textContent.trim(),
    })),
  );
  if (!interactionsOnly) assert.equal(catalog.length, 20, 'The workshop must offer all 20 levels');
  assert.deepEqual(
    catalog.map((item) => item.index),
    Array.from({ length: catalog.length }, (_, i) => i),
  );
  assert.deepEqual(
    catalog.map((item) => item.number),
    Array.from({ length: catalog.length }, (_, i) => String(i + 1).padStart(2, '0')),
    'Level numbering must remain correct after level 09',
  );
  await screenshot('level-catalog');
  await activate('#close-dialog');

  // A conceptual clue helps observation without performing a move or giving
  // the exact next action. It must not consume an undo step.
  const beforeClue = await snapshot();
  await activate('#clue');
  const afterClue = await snapshot();
  assert.deepEqual(afterClue.state.offsets, beforeClue.state.offsets);
  assert.deepEqual(afterClue.state.history, beforeClue.state.history);
  assert.equal(afterClue.state.moves, beforeClue.state.moves);
  assert.equal(afterClue.hint, null, 'A conceptual clue must not reveal the exact move');
  assert.ok((await scope.locator('#status').innerText()).trim().length > 0);

  // Blocking feedback must identify the obstructing part and preserve history.
  await activate('[data-piece="cross"]');
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
  const axis = beforeDrag.pieces.find((item) => item.id === 'key').direction;
  const to = {
    x: from.x + axis.x * axis.pixelsPerUnit * 1.2,
    y: from.y + axis.y * axis.pixelsPerUnit * 1.2,
  };
  await drag(from, to);
  const afterDrag = (await snapshot()).state;
  assert.equal(afterDrag.offsets.key, 1, 'A direct drag should snap to one unit');
  assert.equal(afterDrag.offsets.cross, 0);
  assert.equal(afterDrag.offsets.upright, 0);
  assert.equal(afterDrag.moves, beforeDrag.state.moves + 1, 'A drag is one history action');
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
  assert.equal((await snapshot()).state.offsets.key, 0);

  if (mobile) {
    const start = await findPiece('key');
    const stateBeforeCancel = (await snapshot()).state;
    const direction = (await snapshot()).pieces.find((item) => item.id === 'key').direction;
    const end = {
      x: start.x + direction.x * direction.pixelsPerUnit * 1.3,
      y: start.y + direction.y * direction.pixelsPerUnit * 1.3,
    };
    await drag(start, end, { keepDown: true });
    assert.ok((await snapshot()).state.offsets.key > 0.5, 'Touch preview must follow the finger');
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
    await activate('[data-piece="key"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(
      (await snapshot()).state.offsets.key,
      0.5,
      'Focused piece buttons must still allow keyboard movement',
    );
    await page.keyboard.press('Control+z');
    assert.equal(
      (await snapshot()).state.offsets.key,
      0,
      'Undo shortcut must work while a button is focused',
    );
  }

  // Verify scene-attached controls when present, including reversing a move.
  if (await scope.locator('#axis-positive').isVisible()) {
    await activate('#axis-positive');
    assert.equal((await snapshot()).state.offsets.key, 0.5);
    await activate(
      (await scope.locator('#axis-negative').isVisible()) ? '#axis-negative' : '#nudge-negative',
    );
    assert.equal((await snapshot()).state.offsets.key, 0);
  }

  if (interactionsOnly) {
    await cdp?.detach();
    return { levels: 0, mobile, screenshots: screenshotDir };
  }

  let slowestHintMs = 0;
  const solvePhase = async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const beforeHint = await snapshot();
      if (beforeHint.progress.complete) return;
      const started = performance.now();
      await activate('#hint');
      slowestHintMs = Math.max(slowestHintMs, performance.now() - started);
      const hinted = await snapshot();
      assert.ok(hinted.hint, `No hint from a reachable ${hinted.state.phase} state`);
      assert.equal(
        hinted.selected,
        hinted.hint.pieceId,
        'A hint must highlight the part to manipulate',
      );
      const { pieceId, targetOffset, direction } = hinted.hint;
      const selector = direction > 0 ? '#nudge-positive' : '#nudge-negative';
      const otherDirection = direction > 0 ? '#nudge-negative' : '#nudge-positive';
      assert.equal(
        await scope
          .locator(selector)
          .evaluate((button) => button.classList.contains('hint-direction')),
        true,
      );
      assert.equal(
        await scope
          .locator(otherDirection)
          .evaluate((button) => button.classList.contains('hint-direction')),
        false,
      );
      assert.deepEqual(
        hinted.state.offsets,
        beforeHint.state.offsets,
        'Revealing a step cannot move pieces',
      );
      const axisSelector = direction > 0 ? '#axis-positive' : '#axis-negative';
      if (await scope.locator(axisSelector).isVisible()) {
        assert.equal(
          await scope
            .locator(axisSelector)
            .evaluate((button) => button.classList.contains('hint-direction')),
          true,
        );
      }
      const maximumSteps =
        Math.ceil(Math.abs(targetOffset - hinted.state.offsets[pieceId]) / 0.5) + 1;
      for (let step = 0; step < maximumSteps; step++) {
        const current = (await snapshot()).state.offsets[pieceId];
        if (Math.abs(current - targetOffset) < 0.001) break;
        await activate(selector);
        const next = (await snapshot()).state.offsets[pieceId];
        assert.ok(
          Math.abs(next - current) > 0.001,
          'The suggested motion must be physically executable',
        );
        assert.ok(Math.abs(targetOffset - next) < Math.abs(targetOffset - current) + 0.001);
        assert.equal(
          await scope
            .locator(selector)
            .evaluate((button) => button.classList.contains('hint-direction')),
          Math.abs(targetOffset - next) > 0.001,
          'The suggested direction must stay lit until the hinted target is reached',
        );
      }
      assert.ok(
        Math.abs((await snapshot()).state.offsets[pieceId] - targetOffset) < 0.001,
        'The hinted target must be reachable with touch controls',
      );
    }
    assert.fail('Puzzle did not complete within 30 hinted actions');
  };

  const playableLevels =
    levelIndices ?? (completeAllLevels ? catalog.map((item) => item.index) : [0]);
  assert.ok(playableLevels.length > 0);
  assert.ok(playableLevels.every((index) => catalog.some((item) => item.index === index)));
  const captureLevels = new Set([0, 4, 9, 14, 19]);
  for (const [position, index] of playableLevels.entries()) {
    if (position > 0 || index !== 0) {
      await activate('#levels');
      await activate(`button[data-level="${index}"]`);
    }
    const pieceCount = (await snapshot()).pieces.length;
    assert.ok(pieceCount >= 3, `Level ${index + 1} must contain a complete puzzle`);
    await solvePhase();
    assert.equal((await snapshot()).progress.removed, pieceCount);
    if (captureLevels.has(index)) await screenshot(`level-${index + 1}-disassembled`);
    await activate('#reassemble');
    assert.equal((await snapshot()).state.phase, 'reassemble');
    assert.equal((await snapshot()).state.history.length, 0);
    await solvePhase();
    const complete = await snapshot();
    assert.equal(complete.progress.assembled, pieceCount);
    assert.equal(complete.progress.complete, true);
    assert.ok(Object.values(complete.state.offsets).every((value) => value === 0));
    assert.ok(await scope.locator('#replay-level').isVisible());
    if (index < catalog.length - 1) assert.ok(await scope.locator('#next-level').isVisible());
    if (captureLevels.has(index)) await screenshot(`level-${index + 1}-reassembled`);
    console.log(`${screenshotPrefix}: level ${index + 1} disassembly and reassembly passed`);
  }

  await activate('#levels');
  const badges = () =>
    scope.locator('button[data-level]').evaluateAll((buttons) =>
      buttons.map((button) => ({
        index: Number(button.dataset.level),
        badge: button.querySelector('.level-badge')?.textContent.trim(),
        seals: [...button.querySelectorAll('.seal.earned')].map((seal) => seal.textContent.trim()),
      })),
    );
  const completedBadges = (await badges()).filter((item) => playableLevels.includes(item.index));
  assert.ok(completedBadges.every((item) => /复原|独立/.test(item.badge)));
  assert.ok(
    completedBadges.every((item) => item.seals.includes('解开') && item.seals.includes('复原')),
  );
  assert.ok(
    completedBadges.every((item) => !item.seals.includes('独立')),
    'Step-assisted solves must not earn an independent seal',
  );
  await activate('#close-dialog');
  await activate('#restart');
  await activate('#keep-playing');
  assert.equal(
    (await snapshot()).progress.complete,
    true,
    'Dismissing restart must preserve completion',
  );
  await activate('#replay-level');
  const replayed = await snapshot();
  assert.equal(replayed.state.moves, 0);
  assert.equal(replayed.state.phase, 'disassemble');
  assert.equal(replayed.progress.complete, false);
  assert.ok(Object.values(replayed.state.offsets).every((value) => value === 0));
  if (scope === page) await page.reload();
  else await scope.goto(scope.url());
  await scope.locator('#app[data-ready="true"]').waitFor();
  assert.deepEqual((await snapshot()).state, replayed.state, 'Replay must survive a reload');
  await activate('#levels');
  assert.deepEqual(
    (await badges()).filter((item) => playableLevels.includes(item.index)),
    completedBadges,
    'Replaying a completed puzzle must preserve all completion records after reload',
  );
  await activate('#close-dialog');
  await activate('#restart');
  await activate('#confirm-restart');
  assert.equal((await snapshot()).state.moves, 0);
  assert.equal((await snapshot()).state.phase, 'disassemble');
  assert.equal((await snapshot()).progress.complete, false);
  await cdp?.detach();
  return {
    levels: playableLevels.length,
    mobile,
    slowestHintMs: Math.round(slowestHintMs),
    screenshots: screenshotDir,
  };
}

/** Check every control at six phone sizes, including each tile in the
 * intentionally scrollable piece tray. All selections use real touch input.
 */
export async function exerciseMobileLayouts(page, { screenshotDir = evidenceDir } = {}) {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 568, height: 320 },
    { width: 740, height: 360 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const pieces = page.locator('button[data-piece]');
    for (let index = 0; index < (await pieces.count()); index++) {
      const piece = pieces.nth(index);
      await piece.tap();
      const id = await piece.getAttribute('data-piece');
      assert.equal(await page.evaluate(() => window.lubanSnapshot().selected), id);
      const size = await piece.boundingBox();
      assert.ok(size.width >= 44 && size.height >= 44, 'Each part needs a 44px touch target');
    }
    await pieces.first().tap();
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: resolve(screenshotDir, `mobile-layout-${viewport.width}x${viewport.height}.png`),
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
        .filter(
          (button) => button.getBoundingClientRect().width > 0 && !button.closest('.piece-list'),
        )
        .map((button) => {
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return {
            name: button.id || button.getAttribute('aria-label'),
            onScreen:
              box.x >= 0 &&
              box.y >= 0 &&
              box.right <= innerWidth + 1 &&
              box.bottom <= innerHeight + 1,
            unobstructed: button === hit || button.contains(hit),
            touchSized: box.width >= 44 && box.height >= 44,
          };
        }),
    }));
    assert.equal(
      layout.overflowX || layout.overflowY,
      false,
      `No page scrolling at ${viewport.width}×${viewport.height}`,
    );
    assert.deepEqual(
      layout.controls.filter(
        (control) => !control.onScreen || !control.unobstructed || !control.touchSized,
      ),
      [],
      `Controls must stay visible, unobstructed and touch-sized at ${viewport.width}×${viewport.height}`,
    );
    console.log(`mobile layout: ${viewport.width}×${viewport.height} passed`);
  }
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
        await exerciseStandalone(page, {
          mobile,
          levelIndices: mobile ? undefined : [0, 4, 9, 14, 19],
        });
        if (mobile) await exerciseMobileLayouts(page);
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
