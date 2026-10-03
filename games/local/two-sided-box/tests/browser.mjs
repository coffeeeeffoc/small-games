import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { LEVELS } from '../levels.mjs';
import {
  createState,
  moveShaft,
  toggleLatch,
  flipView,
  releaseBall,
  advanceBall,
} from '../engine.mjs';
import { STORAGE_KEY } from '../progress.mjs';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(gameRoot, 'test-results');
const gameUrl = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const mobileOnly = process.argv.includes('--mobile-only');
const reportName = mobileOnly ? 'browser-mobile-report.json' : 'browser-report.json';
const runtimeErrors = [];
const checks = [];
const touchSessions = new WeakMap();
let server;
let browser;
let serverOutput = '';
let serverError;

async function launchBrowser() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium';
  assert.ok(existsSync(executablePath), 'Chromium exists at ' + executablePath);
  return chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

function physicalState(state) {
  const { shafts, latches, released, checkpoint, completed } = state;
  return { shafts, latches, released, checkpoint, completed };
}

async function snapshot(page) {
  return page.evaluate(() => window.__twoSidedSnapshot());
}

async function settled(page) {
  await page.waitForFunction(
    () => {
      if (typeof window.__twoSidedSnapshot !== 'function') return false;
      const current = window.__twoSidedSnapshot();
      if (current.animating || current.ballMoving || current.dragging) return false;
      if (getComputedStyle(document.querySelector('#board')).transform !== 'none') return false;
      // Wait for a deferred gesture redraw as well as rule state. In particular,
      // a cancelled touch must visibly return the handle before the next input.
      return Object.entries(current.state.shafts).every(([id, value]) => {
        const shaft = document.querySelector('[data-shaft="' + id + '"]');
        const handle = document.querySelector('[data-shaft-handle="' + id + '"]');
        const position = handle?.transform.baseVal.consolidate()?.matrix.f;
        return (
          shaft?.dataset.value === String(value) && Math.abs(position - (450 - 150 * value)) < 1
        );
      });
    },
    null,
    { timeout: 15_000 },
  );
  return snapshot(page);
}

function recordErrors(page, label) {
  page.on('pageerror', (error) => runtimeErrors.push(label + ': ' + error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(label + ': ' + message.text());
  });
}

async function openGame(context, label) {
  const page = await context.newPage();
  recordErrors(page, label);
  page.setDefaultTimeout(15_000);
  await page.goto(gameUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.locator('#board').waitFor({ state: 'visible' });
  if (await page.locator('#welcome[open]').count()) {
    await tapOrClick(
      page.locator('#start'),
      await page.evaluate(() => navigator.maxTouchPoints > 0),
    );
  }
  await settled(page);
  return page;
}

async function selectLevel(page, index, touch = false) {
  if (await page.locator('#result[open]').count()) {
    if (touch) await tapNative(page.locator('#replay'));
    else await page.keyboard.press('Escape');
  }
  if (touch) await tapNative(page.locator('#levels'));
  else await page.locator('#levels').click();
  const button = page.locator('[data-level-index="' + index + '"]');
  assert.equal(await button.isEnabled(), true, 'All six prototype boxes are available');
  if (touch) await tapNative(button);
  else await button.click();
  const current = await settled(page);
  assert.equal(current.levelIndex, index, 'Selecting box ' + (index + 1));
  assert.equal(current.state.completed, false, 'Selection starts a fresh attempt');
  assert.equal(current.state.released, false, 'Selection returns the ball to the start');
  assert.equal(current.state.moves, 0, 'Selection resets move count');
  assert.equal(await page.locator('#board').getAttribute('data-level'), String(index + 1));
  return current;
}

async function tapOrClick(locator, touch = false) {
  if (touch) await tapNative(locator);
  else await locator.click();
}

async function nativeInput(page) {
  let session = touchSessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    touchSessions.set(page, session);
  }
  return session;
}

async function tapNative(locator) {
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  assert.equal(await locator.isEnabled(), true, 'The native touch target is available');
  const bounds = await locator.boundingBox();
  assert.ok(bounds, 'The native touch target has a visible physical location');
  const page = locator.page();
  const session = await nativeInput(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        id: 1,
      },
    ],
  });
  await delay(60);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(60);
}

async function executeAction(page, action, label, touch = false) {
  const before = await snapshot(page);
  if (action.type === 'flip') {
    await tapOrClick(page.locator('#flip'), touch);
    const after = await settled(page);
    assert.notEqual(after.state.side, before.state.side, label + ': side changed');
    assert.deepEqual(
      physicalState(after.state),
      physicalState(before.state),
      label + ': changing the view preserves the machine',
    );
    return after;
  }
  if (action.type === 'latch') {
    await tapOrClick(page.locator('[data-latch="' + action.id + '"]'), touch);
    const after = await settled(page);
    assert.notDeepEqual(after.state.latches, before.state.latches, label + ': latch operated');
    return after;
  }
  if (action.type === 'shaft') {
    const notch = page.locator(
      '[data-notch-shaft="' + action.id + '"][data-value="' + action.value + '"]',
    );
    await tapOrClick(notch, touch);
    const after = await settled(page);
    assert.equal(after.state.shafts[action.id], action.value, label + ': shaft reached detent');
    return after;
  }
  if (action.type === 'release') {
    await tapOrClick(page.locator('#release'), touch);
    const after = await settled(page);
    assert.equal(after.state.released, true, label + ': ball released');
    return after;
  }
  if (action.type === 'advance') {
    // Gravity advances the visible ball automatically after release or a legal
    // mechanism change. The route marker is never an extra UI control.
    const after = await settled(page);
    assert.equal(after.state.released, true, label + ': gravity follows a released ball');
    assert.ok(
      after.state.checkpoint >= before.state.checkpoint,
      label + ': ball never goes backward',
    );
    return after;
  }
  throw new Error(label + ': unknown solution action ' + JSON.stringify(action));
}

async function solveVisibleRoute(page, index, touch = false) {
  await selectLevel(page, index, touch);
  const solution = LEVELS[index].solution;
  const expected = createState(LEVELS[index]);
  assert.ok(solution?.length, 'Box ' + (index + 1) + ' supplies a reviewed solution');
  for (const [step, action] of solution.entries()) {
    const label = 'Box ' + (index + 1) + ', action ' + (step + 1);
    const actual = await executeAction(page, action, label, touch);
    let result;
    if (action.type === 'flip') result = flipView(expected);
    else if (action.type === 'latch') result = toggleLatch(LEVELS[index], expected, action.id);
    else if (action.type === 'shaft')
      result = moveShaft(LEVELS[index], expected, action.id, action.value);
    else if (action.type === 'release') result = releaseBall(LEVELS[index], expected);
    else result = { ok: true };
    assert.equal(result.ok, true, label + ': reviewed action is legal');
    // The UI moves the ball under gravity until it reaches the next closed
    // panel. Compute that same public rule transition without changing the UI.
    while (expected.released && !expected.completed && advanceBall(LEVELS[index], expected).ok) {}
    assert.deepEqual(actual.state, expected, label + ': rendered game follows the shared rules');
  }
  const final = await settled(page);
  assert.equal(
    final.state.completed,
    true,
    'Box ' + (index + 1) + ' completes through visible controls',
  );
  assert.equal(await page.locator('#board').getAttribute('data-status'), 'won');
  assert.equal(await page.locator('#next').isVisible(), true, 'Completion provides the next box');
  checks.push('Box ' + (index + 1) + ' solved via ' + (touch ? 'touch' : 'pointer') + ' UI');
  return final;
}

async function svgPoint(page, x, y) {
  await page.locator('#board').scrollIntoViewIfNeeded();
  return page.locator('#board').evaluate(
    (board, local) => {
      const point = new DOMPoint(local.x, local.y).matrixTransform(board.getScreenCTM());
      return { x: point.x, y: point.y };
    },
    { x, y },
  );
}

async function shaftPoint(page, id, value) {
  const current = await snapshot(page);
  const shaft = LEVELS[current.levelIndex].shafts.find((entry) => entry.id === id);
  assert.ok(shaft, 'The selected level defines shaft ' + id);
  return svgPoint(page, shaft.x, 450 - 150 * value);
}

async function verifyDragPreview(page, id, end, before, initialHandle) {
  await page.waitForFunction(
    ({ id, end }) => {
      const handle = document.querySelector('[data-shaft-handle="' + id + '"]');
      if (!handle || !window.__twoSidedSnapshot().dragging) return false;
      const point = new DOMPoint(0, 0).matrixTransform(handle.getScreenCTM());
      return Math.abs(point.y - end.y) <= 2;
    },
    { id, end },
    { timeout: 2_000 },
  );
  const preview = await snapshot(page);
  assert.equal(
    await initialHandle.evaluate(
      (handle) =>
        handle.isConnected &&
        handle ===
          document.querySelector('[data-shaft-handle="' + handle.dataset.shaftHandle + '"]'),
    ),
    true,
    'A continuous drag keeps the original touch target connected',
  );
  assert.equal(preview.dragging, true, 'The pointer is actively dragging a scene shaft');
  assert.deepEqual(
    preview.state,
    before.state,
    'A drag preview keeps committed puzzle state unchanged',
  );
  const visual = await page.locator('[data-shaft-handle="' + id + '"]').evaluate((handle) => {
    const point = new DOMPoint(0, 0).matrixTransform(handle.getScreenCTM());
    return { x: point.x, y: point.y };
  });
  assert.ok(
    Math.abs(visual.y - end.y) <= 2,
    'The handle follows the pointer before release: ' + JSON.stringify({ visual, end }),
  );
}

async function dragShaft(page, id, target, { touch = false, cancel = false } = {}) {
  const before = await snapshot(page);
  const start = await shaftPoint(page, id, before.state.shafts[id]);
  const end = await shaftPoint(page, id, target);
  const initialHandle = touch
    ? null
    : await page.locator('[data-shaft-handle="' + id + '"]').elementHandle();
  if (!touch) assert.ok(initialHandle, 'The drag starts on a visible scene handle');
  if (touch) {
    // All taps and drags on this page share one native input source, just as a
    // real touchscreen does. Closing the browser context releases the session.
    const cdp = await nativeInput(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...start, id: 1 }],
    });
    for (let step = 1; step <= 6; step += 1) {
      // Pace a real 180ms drag from the initial contact onward.
      await delay(30);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * step) / 6,
            y: start.y + ((end.y - start.y) * step) / 6,
            id: 1,
          },
        ],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
    await delay(60);
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await verifyDragPreview(page, id, end, before, initialHandle);
    await page.mouse.up();
  }
  const after = await settled(page);
  await initialHandle?.dispose();
  if (cancel) {
    assert.deepEqual(
      after.state,
      before.state,
      'Cancelling a real touch drag rolls back the entire gesture',
    );
    if ('historyLength' in before) assert.equal(after.historyLength, before.historyLength);
  } else {
    assert.equal(after.state.shafts[id], target, 'Dragging the visible shaft reaches its detent');
    assert.equal(
      after.state.moves,
      before.state.moves + 1,
      'A drag records exactly one mechanism operation',
    );
    if ('historyLength' in before) assert.equal(after.historyLength, before.historyLength + 1);
  }
  return after;
}

async function verifyMechanics(page) {
  await selectLevel(page, 0);
  const initial = await snapshot(page);
  await page.locator('#levels').click();
  assert.equal(
    await page.locator('[data-level-index]').count(),
    LEVELS.length,
    'Chapter selection lists six boxes',
  );
  await page.keyboard.press('Escape');
  assert.deepEqual(
    (await snapshot(page)).state,
    initial.state,
    'Browsing and dismissing chapter selection keeps the puzzle',
  );
  const lockedNotch = page.locator('[data-notch-shaft="A"][data-value="2"]');
  const lockedBounds = await lockedNotch.boundingBox();
  assert.ok(lockedBounds, 'Locked shaft still has a discoverable physical target');
  // Raw input checks the feedback from an intentionally disabled mechanism;
  // Playwright's actionable click correctly refuses aria-disabled controls.
  await page.mouse.click(
    lockedBounds.x + lockedBounds.width / 2,
    lockedBounds.y + lockedBounds.height / 2,
  );
  const locked = await settled(page);
  assert.deepEqual(locked.state, initial.state, 'A locked front shaft cannot be moved');
  assert.match(
    await page.locator('#status').innerText(),
    /锁|背|扣/,
    'A locked shaft gives actionable feedback',
  );

  await page.locator('#hint').click();
  const hinted = await snapshot(page);
  assert.deepEqual(hinted.state, initial.state, 'Hints preserve machine state and move count');
  if ('historyLength' in initial) assert.equal(hinted.historyLength, initial.historyLength);
  await page.locator('#hint-more').click();
  assert.deepEqual(
    (await snapshot(page)).state,
    initial.state,
    'Progressive hints still leave the puzzle untouched',
  );
  await page.locator('[data-close="hint-dialog"]').click();

  await executeAction(page, { type: 'flip' }, 'Look behind the first box');
  await executeAction(page, { type: 'latch', id: 'lock-A' }, 'Unlock the first shaft');
  await executeAction(page, { type: 'flip' }, 'Return to the unlocked front');
  const beforeDrag = await snapshot(page);
  await dragShaft(page, 'A', 2);
  await page.locator('#undo').click();
  assert.deepEqual(
    (await settled(page)).state,
    beforeDrag.state,
    'Undo restores the entire shaft gesture',
  );
  await dragShaft(page, 'A', 1);
  await page.locator('#restart').click();
  assert.deepEqual(
    (await settled(page)).state,
    initial.state,
    'Restart restores the original box and ball',
  );

  await executeAction(page, { type: 'flip' }, 'Keyboard unlock view');
  const latch = page.locator('[data-latch="lock-A"]');
  await latch.focus();
  await page.keyboard.press('Enter');
  assert.notDeepEqual(
    (await settled(page)).state.latches,
    initial.state.latches,
    'Enter operates a focused scene latch',
  );
  assert.equal(
    await latch.evaluate((element) => document.activeElement === element),
    true,
    'Keyboard focus follows the rebuilt latch',
  );
  await page.keyboard.press('Space');
  assert.deepEqual(
    (await settled(page)).state.latches,
    initial.state.latches,
    'Space closes the same focused latch',
  );
  await page.keyboard.press('Enter');
  assert.equal(
    (await settled(page)).state.latches['lock-A'],
    false,
    'The latch can be unlocked again without refocusing',
  );
  await executeAction(page, { type: 'flip' }, 'Keyboard front view');
  const shaft = page.locator('[data-shaft="A"]');
  await shaft.focus();
  await page.keyboard.press('ArrowUp');
  const keyboard = await settled(page);
  assert.equal(keyboard.state.shafts.A, 1, 'Arrow keys move a focused shaft by one detent');
  await page.locator('#restart').click();
  checks.push(
    'Locked feedback, flip invariance, progressive hints, mouse drag, undo, reset and keyboard',
  );
}

async function verifyPersistence(page) {
  const before = await snapshot(page);
  assert.ok(before.progress, 'A progress snapshot is exposed for verification');
  const progress = structuredClone(before.progress);
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  assert.ok(raw, 'Completing boxes writes progress');
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.locator('#welcome[open]').count()) await page.locator('#start').click();
  const after = await settled(page);
  assert.deepEqual(after.progress, progress, 'Completed boxes and best move counts survive reload');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), raw);
  checks.push('Completed progress survives reload');
}

async function verifyCompletionDuringHint(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  try {
    await selectLevel(page, 0);
    for (const action of LEVELS[0].solution) {
      if (action.type === 'release') break;
      await executeAction(page, action, 'Prepare completion while reading a hint');
    }
    await page.locator('#release').click();
    assert.equal((await snapshot(page)).ballMoving, true, 'Normal motion visibly rolls the ball');
    await page.locator('#hint').click();
    assert.equal(
      await page.locator('#hint-dialog[open]').count(),
      1,
      'A hint can be read while the ball rolls',
    );
    assert.equal(
      (await settled(page)).state.completed,
      true,
      'The clear route completes while reading a hint',
    );
    await page.locator('[data-close="hint-dialog"]').click();
    await page.locator('#result[open]').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#next').isVisible(),
      true,
      'Closing the hint exposes completion and next box',
    );
    await page.locator('#replay').click();
    checks.push('Completion while reading a hint still presents the next box');
  } finally {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
}

async function verifyLayout(page, label) {
  const layout = await page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
      );
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      board: rect(document.querySelector('#board')),
      targets: [
        ...document.querySelectorAll(
          '#flip, #release, #hint, #undo, #restart, #levels, [data-latch], [data-notch-shaft], [data-shaft-handle]',
        ),
      ]
        .filter(visible)
        .map((element) => ({
          name: element.id || element.getAttribute('aria-label') || element.outerHTML.slice(0, 100),
          ...rect(element),
        })),
    };
  });
  assert.ok(
    layout.documentWidth <= layout.viewport.width + 1,
    label + ': page has no horizontal overflow',
  );
  assert.ok(
    layout.bodyWidth <= layout.viewport.width + 1,
    label + ': body has no horizontal overflow',
  );
  for (const target of layout.targets) {
    assert.ok(
      target.width >= 43.99 && target.height >= 43.99,
      label + ': target is at least 44 CSS px: ' + JSON.stringify(target),
    );
    assert.ok(
      target.left >= -1 && target.right <= layout.viewport.width + 1,
      label + ': target remains within viewport width: ' + target.name,
    );
  }
  assert.ok(
    layout.board.left >= -1 && layout.board.right <= layout.viewport.width + 1,
    label + ': whole box fits horizontally',
  );
}

async function verifyMobile() {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const label = viewport.width + 'x' + viewport.height;
    const mobile = await launchBrowser();
    try {
      const context = await mobile.newContext({
        viewport,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      try {
        const page = await openGame(context, label);
        assert.equal(await page.evaluate(() => navigator.maxTouchPoints > 0), true);
        await verifyLayout(page, label + ' front');
        await executeAction(page, { type: 'flip' }, label + ' touch flip', true);
        await verifyLayout(page, label + ' back');
        await executeAction(page, { type: 'latch', id: 'lock-A' }, label + ' touch unlock', true);
        await executeAction(page, { type: 'flip' }, label + ' touch return', true);
        await dragShaft(page, 'A', 2, { touch: true, cancel: true });
        await dragShaft(page, 'A', 2, { touch: true });
        await tapNative(page.locator('#undo'));
        await page.waitForFunction(() => window.__twoSidedSnapshot().state.shafts.A === 0, null, {
          timeout: 2_000,
        });
        assert.equal(
          (await settled(page)).state.shafts.A,
          0,
          label + ': touch undo restores shaft',
        );
        await solveVisibleRoute(page, 0, true);
        if (viewport.width === 390) {
          for (let index = 1; index < LEVELS.length - 1; index += 1) {
            await solveVisibleRoute(page, index, true);
          }
        }
        await solveVisibleRoute(page, 5, true);
        await verifyLayout(page, label + ' finale');
        await tapNative(page.locator('#replay'));
        await settled(page);
        // Capture screenshots after input assertions to keep the touch session uninterrupted.
        await page.screenshot({
          path: resolve(outputDir, 'two-sided-' + label + '-final.png'),
          fullPage: true,
        });
        checks.push(
          label + ' touch drag/cancel, tutorial and finale routes, responsive bounds and targets',
        );
      } finally {
        await context.close();
      }
      const capture = await mobile.newContext({
        viewport,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      try {
        const page = await openGame(capture, label + '-capture');
        await page.screenshot({
          path: resolve(outputDir, 'two-sided-' + label + '-front.png'),
          fullPage: true,
        });
      } finally {
        await capture.close();
      }
    } finally {
      await mobile.close();
    }
  }
}

async function verifyOptionalStorage() {
  for (const mode of ['corrupt', 'blocked']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(
      ({ key, mode }) => {
        if (mode === 'corrupt') localStorage.setItem(key, '{broken save');
        else
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
              throw new DOMException('Storage unavailable in regression test', 'SecurityError');
            },
          });
      },
      { key: STORAGE_KEY, mode },
    );
    try {
      const page = await openGame(context, mode + '-storage');
      assert.equal((await snapshot(page)).levelIndex, 0, mode + ' storage falls back to first box');
      await solveVisibleRoute(page, 0);
      await page.locator('#replay').click();
      assert.equal(
        (await settled(page)).state.completed,
        false,
        mode + ' storage does not prevent restarting',
      );
      checks.push(mode + ' storage preserves playability');
    } finally {
      await context.close();
    }
  }
}

async function startServer() {
  if (process.env.GAME_URL) return;
  server = spawn(
    process.execPath,
    [resolve(gameRoot, 'server.mjs'), '--dist', '--host', '127.0.0.1', '--port', '4412'],
    {
      cwd: gameRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-8_000);
    });
  server.on('error', (error) => {
    serverError = error;
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error('Server exited before becoming ready:\n' + serverOutput);
    try {
      if ((await fetch(gameUrl, { signal: AbortSignal.timeout(1_000) })).ok) return;
    } catch {
      // Retry only until the bounded startup deadline.
    }
    await delay(150);
  }
  throw new Error('Server did not become ready:\n' + serverOutput);
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((resolveExit) => server.once('exit', resolveExit));
  server.kill('SIGTERM');
  if (!(await Promise.race([exited.then(() => true), delay(3_000).then(() => false)]))) {
    server.kill('SIGKILL');
    await Promise.race([exited, delay(1_000)]);
  }
}

try {
  await mkdir(outputDir, { recursive: true });
  await startServer();
  browser = await launchBrowser();
  if (!mobileOnly) {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    try {
      const page = await openGame(desktop, 'desktop');
      assert.equal(LEVELS.length, 6, 'The first chapter contains six boxes');
      await page.screenshot({
        path: resolve(outputDir, 'two-sided-desktop-front.png'),
        fullPage: true,
      });
      await verifyMechanics(page);
      await verifyCompletionDuringHint(page);
      for (let index = 0; index < LEVELS.length; index += 1) {
        await solveVisibleRoute(page, index);
        if (index < LEVELS.length - 1) {
          await page.locator('#next').click();
          const next = await settled(page);
          assert.equal(next.levelIndex, index + 1, 'Next box follows campaign order');
          assert.deepEqual(
            next.state,
            createState(LEVELS[index + 1]),
            'Next box starts with a fresh mechanism state',
          );
        }
      }
      await page.screenshot({
        path: resolve(outputDir, 'two-sided-desktop-final.png'),
        fullPage: true,
      });
      await verifyPersistence(page);
    } finally {
      await desktop.close();
    }
  }
  await verifyMobile();
  await verifyOptionalStorage();
  assert.deepEqual(runtimeErrors, [], 'No browser runtime or console errors');
  await writeFile(
    resolve(outputDir, reportName),
    JSON.stringify(
      { passed: true, scope: mobileOnly ? 'mobile and storage' : 'all', checks, runtimeErrors },
      null,
      2,
    ) + '\n',
  );
  console.log('PASS: ' + checks.join('; ') + '.');
  console.log('Screenshots and report: ' + outputDir);
} catch (error) {
  await writeFile(
    resolve(outputDir, reportName),
    JSON.stringify({ passed: false, checks, runtimeErrors, error: error.stack }, null, 2) + '\n',
  ).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await stopServer();
  }
}
