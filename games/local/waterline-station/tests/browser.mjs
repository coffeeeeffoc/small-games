import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { LEVELS } from '../levels.mjs';
import { createState, toggleGate, solve, isGateLocked } from '../engine.mjs';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(gameRoot, 'test-results');
const gameUrl = process.env.GAME_URL || 'http://127.0.0.1:4411/';
const runtimeErrors = [];
let server;
let browser;
let serverOutput = '';
let serverError;

function stableState(state) {
  const { volumes, gates, latched, wheelPower, moves, won, lost, bonusMoves } = state;
  return { volumes, gates, latched, wheelPower, moves, won, lost, bonusMoves };
}

function stateKey(state) {
  return JSON.stringify(stableState(state));
}

function expectedStatus(state) {
  return state.won ? 'won' : state.lost ? 'lost' : 'playing';
}

async function snapshot(page) {
  return page.evaluate(() => window.__waterlineSnapshot());
}

function sceneGate(page, gateId) {
  return page.locator('#board-controls button[data-gate="' + gateId + '"]');
}

async function settled(page) {
  await page.waitForFunction(
    () =>
      typeof window.__waterlineSnapshot === 'function' && !window.__waterlineSnapshot().animating,
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
  await settled(page);
  return page;
}

async function verifyBoard(page, levelIndex, expected, label) {
  const actual = await settled(page);
  assert.equal(actual.levelIndex, levelIndex, label + ': selected level');
  assert.deepEqual(stableState(actual.state), stableState(expected), label + ': engine state');
  assert.equal(
    await page.locator('#board').getAttribute('data-level'),
    String(levelIndex + 1),
    label + ': board level',
  );
  assert.equal(
    await page.locator('#board').getAttribute('data-status'),
    expectedStatus(expected),
    label + ': board status',
  );
  const movesLeft = Number((await page.locator('#moves-left').innerText()).trim());
  assert.equal(
    movesLeft,
    Math.max(0, LEVELS[levelIndex].maxMoves + expected.bonusMoves - expected.moves),
    label + ': remaining move counter',
  );
  for (const [index, gate] of LEVELS[levelIndex].gates.entries()) {
    const button = sceneGate(page, gate.id);
    assert.equal(
      await button.getAttribute('aria-pressed'),
      String(expected.gates[index]),
      label + ': ' + gate.id + ' reflects the actual valve state',
    );
    assert.equal(
      await button.isDisabled(),
      expected.won || expected.lost || isGateLocked(LEVELS[levelIndex], expected, gate.id),
      label + ': ' + gate.id + ' availability',
    );
  }
  return actual;
}

async function clickGate(page, levelIndex, expected, gateId, label, touch = false) {
  const before = await snapshot(page);
  const gate = sceneGate(page, gateId);
  if (touch) await gate.tap();
  else await gate.click();
  const next = toggleGate(LEVELS[levelIndex], expected, gateId);
  assert.notEqual(stateKey(next), stateKey(expected), label + ': solver must make a legal move');
  const actual = await verifyBoard(page, levelIndex, next, label);
  assert.equal(actual.historyLength, before.historyLength + 1, label + ': undo history');
  return next;
}

async function selectLevel(page, index) {
  await page.locator('button[data-level-index="' + index + '"]').click();
  return verifyBoard(page, index, createState(LEVELS[index]), 'Select level ' + (index + 1));
}

async function undo(page) {
  const result = page.locator('#result');
  if (await result.isVisible()) await page.locator('#result-undo').click();
  else await page.locator('#undo').click();
  await settled(page);
}

async function verifySceneControls(page, levelIndex, label) {
  assert.equal(await page.locator('#gate-controls').count(), 0, label + ': no remote gate panel');
  assert.equal(
    await page.locator('#board-controls button[data-gate]').count(),
    LEVELS[levelIndex].gates.length,
    label + ': each valve has a scene control',
  );
  const layout = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      board: { left: board.left, right: board.right, top: board.top, bottom: board.bottom },
      gates: [...document.querySelectorAll('#board-controls button[data-gate]')].map((gate) => {
        const bounds = gate.getBoundingClientRect();
        return {
          id: gate.dataset.gate,
          inScene: Boolean(gate.closest('.board-wrap')),
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      }),
    };
  });
  for (const gate of layout.gates) {
    assert.ok(gate.inScene, label + ': ' + gate.id + ' belongs to the station scene');
    assert.ok(
      gate.width >= 44 && gate.height >= 44,
      label + ': ' + gate.id + ' needs a 44px touch target: ' + JSON.stringify(gate),
    );
    assert.ok(
      gate.left >= layout.board.left - 1 &&
        gate.right <= layout.board.right + 1 &&
        gate.top >= layout.board.top - 1 &&
        gate.bottom <= layout.board.bottom + 1,
      label + ': ' + gate.id + ' remains inside the rendered board',
    );
  }
  for (let first = 0; first < layout.gates.length; first += 1) {
    for (let second = first + 1; second < layout.gates.length; second += 1) {
      const a = layout.gates[first];
      const b = layout.gates[second];
      assert.ok(
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        label + ': ' + a.id + ' and ' + b.id + ' touch targets overlap',
      );
    }
  }
}

async function verifyDirectValveInteraction(page) {
  // Level four permits opening and closing the same valve without ending the run.
  const levelIndex = 3;
  const level = LEVELS[levelIndex];
  await selectLevel(page, levelIndex);
  await verifySceneControls(page, levelIndex, 'Desktop station valves');
  let expected = createState(level);
  const gate = sceneGate(page, 'AB');
  const bounds = await gate.boundingBox();
  assert.ok(bounds, 'Scene valve has a physical pointer target');
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.click(center.x, center.y);
  assert.equal((await snapshot(page)).animating, true, 'Opening a valve starts water animation');
  assert.equal(await gate.isDisabled(), true, 'A moving station disables the valve');
  // Raw pointer input must not wait for disabled controls to become enabled again.
  await page.mouse.click(center.x, center.y);
  await page.mouse.click(center.x, center.y);
  expected = toggleGate(level, expected, 'AB');
  const opened = await verifyBoard(page, levelIndex, expected, 'Repeated clicks during water flow');
  assert.equal(opened.historyLength, 1, 'Rapid clicks record exactly one operation');

  expected = await clickGate(page, levelIndex, expected, 'AB', 'Click the open valve to close it');
  assert.equal(expected.gates[0], false, 'The scene valve can be closed again');

  await page.locator('#restart').click();
  expected = createState(level);
  await gate.focus();
  await page.keyboard.press('Enter');
  expected = toggleGate(level, expected, 'AB');
  await verifyBoard(page, levelIndex, expected, 'Enter opens the focused valve');
  assert.equal(
    await gate.evaluate((button) => document.activeElement === button),
    true,
    'Focus remains on the valve after the water animation',
  );
  await page.keyboard.press('Space');
  expected = toggleGate(level, expected, 'AB');
  await verifyBoard(page, levelIndex, expected, 'Space closes the focused valve');

  await selectLevel(page, 1);
  const locked = sceneGate(page, 'BC');
  assert.equal(await locked.isDisabled(), true, 'Level two starts with a locked scene valve');
  const lockedBounds = await locked.boundingBox();
  await page.mouse.click(
    lockedBounds.x + lockedBounds.width / 2,
    lockedBounds.y + lockedBounds.height / 2,
  );
  const unchanged = await verifyBoard(page, 1, createState(LEVELS[1]), 'Click a locked valve');
  assert.equal(unchanged.historyLength, 0, 'Locked valves consume no operation');
  expected = await clickGate(page, 1, createState(LEVELS[1]), 'AB', 'Lower the crate to unlock BC');
  assert.equal(await locked.isDisabled(), false, 'The switch unlocks the scene valve');
  await clickGate(page, 1, expected, 'BC', 'Open the unlocked scene valve');
  await page.locator('#result').waitFor({ state: 'visible' });
  await page.locator('#result-retry').click();
  await selectLevel(page, 0);
}

// The puzzle engine finds an actual losing route, so this remains useful if
// individual level solutions or move budgets change.
function findLosingRoute(level, start = createState(level)) {
  const queue = [{ state: start, path: [], states: [start] }];
  const seen = new Set([stateKey(start)]);
  for (let cursor = 0; cursor < queue.length && cursor < 30_000; cursor += 1) {
    const entry = queue[cursor];
    if (entry.state.lost) return entry;
    if (entry.state.won) continue;
    for (const gate of level.gates) {
      const next = toggleGate(level, entry.state, gate.id);
      const key = stateKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({
        state: next,
        path: [...entry.path, gate.id],
        states: [...entry.states, next],
      });
    }
  }
  return null;
}

async function verifyPredictionAndUndo(page) {
  const level = LEVELS[0];
  const initial = createState(level);
  const initialSnapshot = await verifyBoard(page, 0, initial, 'Initial board');
  const solution = solve(level, initial);
  assert.ok(solution?.length, 'The first level must be solvable');

  await page.locator('#predict').click();
  const enabled = await settled(page);
  assert.deepEqual(stableState(enabled.state), stableState(initial), 'Enabling prediction is free');
  assert.equal(
    enabled.historyLength,
    initialSnapshot.historyLength,
    'Prediction adds no undo entry',
  );

  const gate = sceneGate(page, solution[0]);
  await gate.click();
  const preview = await settled(page);
  assert.ok(preview.prediction, 'The first gate click displays a prediction');
  assert.equal(preview.selectedGate, solution[0], 'The selected gate awaits confirmation');
  assert.deepEqual(
    stableState(preview.state),
    stableState(initial),
    'Preview does not move water or use a turn',
  );
  assert.equal(
    preview.historyLength,
    initialSnapshot.historyLength,
    'Preview keeps undo history unchanged',
  );
  assert.equal(
    await gate.evaluate((button) => document.activeElement === button),
    true,
    'Prediction preserves focus on the selected scene valve',
  );

  await gate.click();
  const next = toggleGate(level, initial, solution[0]);
  const applied = await verifyBoard(page, 0, next, 'Confirm predicted gate');
  assert.equal(applied.state.moves, initial.moves + 1, 'Only the confirmation consumes a move');
  assert.equal(
    applied.historyLength,
    initialSnapshot.historyLength + 1,
    'Confirmation creates one undo entry',
  );

  await undo(page);
  const restored = await verifyBoard(page, 0, initial, 'Undo predicted move');
  assert.equal(
    restored.historyLength,
    initialSnapshot.historyLength,
    'Undo restores history length',
  );
  assert.equal(restored.extraClaimed, false, 'Undo does not claim a bonus');

  // Restart clears the run; prediction is a player preference and may stay enabled.
  await page.locator('#restart').click();
  const reset = await verifyBoard(page, 0, initial, 'Restart after prediction');
  assert.equal(reset.historyLength, 0, 'Restart clears undo history');
  assert.equal(reset.extraClaimed, false, 'Restart clears bonus claim');
  if (reset.prediction) await page.locator('#predict').click();
}

async function verifyAllLevels(page) {
  assert.equal(LEVELS.length, 8, 'The MVP should contain eight levels');
  const solvedMoves = new Map();
  let checkedRestartAfterMove = false;
  let checkedWheelUndo = false;
  for (let index = 0; index < LEVELS.length; index += 1) {
    const level = LEVELS[index];
    let expected = createState(level);
    await verifyBoard(page, index, expected, 'Start level ' + (index + 1));
    const solution = solve(level, expected);
    assert.ok(solution?.length, 'Level ' + (index + 1) + ' must have a solution');
    solvedMoves.set(level.id, solution.length);

    // Exercise the actual restart control after a nonterminal move.
    if (!checkedRestartAfterMove && solution.length > 1) {
      expected = await clickGate(page, index, expected, solution[0], 'Move before restart');
      await page.locator('#restart').click();
      const reset = await verifyBoard(page, index, createState(level), 'Restart an active puzzle');
      assert.equal(reset.historyLength, 0, 'Restart drops all previous moves');
      assert.equal(reset.extraClaimed, false, 'Restart starts a fresh allowance');
      expected = createState(level);
      checkedRestartAfterMove = true;
    }

    for (let move = 0; move < solution.length; move += 1) {
      const beforeMove = expected;
      expected = await clickGate(
        page,
        index,
        expected,
        solution[move],
        'Level ' + (index + 1) + ', move ' + (move + 1),
      );
      if (!checkedWheelUndo && expected.wheelPower > beforeMove.wheelPower) {
        await undo(page);
        await verifyBoard(page, index, beforeMove, 'Undo restores wheel power and overflow water');
        expected = await clickGate(
          page,
          index,
          beforeMove,
          solution[move],
          'Replay the overflow move',
        );
        checkedWheelUndo = true;
      }
    }
    assert.equal(expected.won, true, 'Level ' + (index + 1) + ' reaches its goals');
    await page.locator('#result').waitFor({ state: 'visible' });
    if (index < LEVELS.length - 1) {
      await page.locator('#next-level').click();
      await verifyBoard(page, index + 1, createState(LEVELS[index + 1]), 'Advance to next level');
    }
  }
  assert.equal(checkedRestartAfterMove, true, 'At least one puzzle exercises restart after a move');
  assert.equal(
    checkedWheelUndo,
    true,
    'An overflow puzzle exercises undo after powering the wheel',
  );
  return solvedMoves;
}

async function verifyPersistence(page, solvedMoves, initialProgress) {
  const before = await snapshot(page);
  assert.ok(before.progress && typeof before.progress === 'object', 'Progress is available');
  // Compare the full stored progress object; this also preserves every best result.
  const progress = structuredClone(before.progress);
  assert.ok(Object.keys(progress).length, 'Completed puzzles produced a progress record');
  assert.notDeepEqual(
    progress,
    initialProgress,
    'Completing all levels changes persisted progress',
  );
  for (const [levelId, moves] of solvedMoves) {
    assert.equal(progress.best[levelId], moves, levelId + ': shortest result is saved');
  }
  await page.reload({ waitUntil: 'networkidle' });
  const after = await settled(page);
  assert.deepEqual(after.progress, progress, 'All best results survive a reload');
  assert.equal(solvedMoves.size, LEVELS.length, 'Every level contributed a completion result');
}

async function verifyFailureBonusAndRestart(page) {
  let failingIndex = -1;
  let route;
  for (let index = 0; index < LEVELS.length; index += 1) {
    route = findLosingRoute(LEVELS[index]);
    if (route?.path.length) {
      failingIndex = index;
      break;
    }
  }
  assert.ok(failingIndex >= 0, 'At least one level must have a reachable failure state');
  const level = LEVELS[failingIndex];
  await selectLevel(page, failingIndex);
  let expected = createState(level);
  for (let index = 0; index < route.path.length; index += 1) {
    expected = await clickGate(
      page,
      failingIndex,
      expected,
      route.path[index],
      'Failing route, move ' + (index + 1),
    );
  }
  assert.equal(expected.lost, true, 'Exhausting the budget opens the failure result');
  await page.locator('#result').waitFor({ state: 'visible' });

  await page.locator('#next-level').click();
  const bonus = await settled(page);
  assert.equal(bonus.extraClaimed, true, 'Failure offers one extra gate operation');
  assert.equal(bonus.state.bonusMoves, expected.bonusMoves + 1, 'Exactly one move is granted');
  assert.equal(bonus.state.moves, expected.moves, 'Claiming the extra move consumes no move');
  assert.equal(bonus.state.lost, false, 'The extra move resumes play');
  assert.deepEqual(
    bonus.state.volumes,
    expected.volumes,
    'Claiming a bonus leaves water unchanged',
  );
  assert.deepEqual(bonus.state.gates, expected.gates, 'Claiming a bonus leaves gates unchanged');

  const bonusControl = page.locator('#extra-move');
  assert.ok(
    (await bonusControl.isDisabled()) || !(await bonusControl.isVisible()),
    'An already claimed bonus cannot be requested again',
  );
  await undo(page);
  const afterUndo = await settled(page);
  const previous = route.states[route.states.length - 2];
  assert.deepEqual(
    stableState(afterUndo.state),
    stableState({ ...previous, bonusMoves: bonus.state.bonusMoves, lost: false }),
    'Undo restores water, switches, wheel and gates while retaining the claimed allowance',
  );
  assert.equal(afterUndo.extraClaimed, true, 'Undo cannot reset the one-time bonus claim');
  assert.equal(
    afterUndo.historyLength,
    route.path.length - 1,
    'Undo removes exactly one gate action',
  );
  assert.ok(
    (await bonusControl.isDisabled()) || !(await bonusControl.isVisible()),
    'Undo does not make the bonus claimable again',
  );

  await page.locator('#restart').click();
  const reset = await verifyBoard(
    page,
    failingIndex,
    createState(level),
    'Restart after bonus and undo',
  );
  assert.equal(reset.extraClaimed, false, 'Restart begins a new bonus allowance');
  assert.equal(reset.historyLength, 0, 'Restart clears the failed run history');
}

async function assertNoHorizontalOverflow(page, label) {
  const bounds = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    bounds.document <= bounds.viewport + 1,
    label + ': document overflows: ' + JSON.stringify(bounds),
  );
  assert.ok(
    bounds.body <= bounds.viewport + 1,
    label + ': body overflows: ' + JSON.stringify(bounds),
  );
}

async function verifyMobile() {
  for (const width of [390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await openGame(context, 'mobile-' + width);
      assert.equal(
        await page.evaluate(() => navigator.maxTouchPoints > 0),
        true,
        'Mobile context supports touch',
      );
      await assertNoHorizontalOverflow(page, width + 'px initial board');
      await verifySceneControls(page, 0, width + 'px three-tank touch targets');
      await page.screenshot({
        path: resolve(outputDir, 'waterline-mobile-' + width + '.png'),
        fullPage: true,
      });
      let expected = createState(LEVELS[0]);
      const solution = solve(LEVELS[0], expected);
      assert.ok(solution?.length, 'Mobile tutorial is solvable');
      for (let index = 0; index < solution.length; index += 1) {
        expected = await clickGate(
          page,
          0,
          expected,
          solution[index],
          width + 'px tutorial tap ' + (index + 1),
          true,
        );
      }
      assert.equal(expected.won, true, 'The tutorial can be completed using scene touch taps');
      await page.locator('#result').waitFor({ state: 'visible' });
      await page.locator('#result-retry').tap();

      // This five-tank puzzle requires opening and then closing CD before DE opens.
      const levelIndex = 5;
      const level = LEVELS[levelIndex];
      await selectLevel(page, levelIndex);
      await verifySceneControls(page, levelIndex, width + 'px five-tank touch targets');
      await assertNoHorizontalOverflow(page, width + 'px five-tank board');
      await page.screenshot({
        path: resolve(outputDir, 'waterline-mobile-five-tanks-' + width + '.png'),
        fullPage: true,
      });
      expected = createState(level);
      const advancedSolution = solve(level, expected);
      assert.ok(advancedSolution?.length, 'Five-tank mobile puzzle is solvable');
      let closedValve = false;
      for (let index = 0; index < advancedSolution.length; index += 1) {
        if (index === 1) {
          const resizedWidth = width === 390 ? 320 : 390;
          await page.setViewportSize({ width: resizedWidth, height: 844 });
          await verifySceneControls(page, levelIndex, resizedWidth + 'px resized touch targets');
          await assertNoHorizontalOverflow(page, resizedWidth + 'px resized board');
        }
        const gateId = advancedSolution[index];
        if (expected.gates[level.gates.findIndex((gate) => gate.id === gateId)]) {
          closedValve = true;
        }
        expected = await clickGate(
          page,
          levelIndex,
          expected,
          gateId,
          width + 'px five-tank tap ' + (index + 1),
          true,
        );
      }
      assert.equal(closedValve, true, 'Touch gameplay includes closing a valve');
      assert.equal(expected.won, true, 'Five-tank puzzle completes after resizing with real taps');
      await page.locator('#result').waitFor({ state: 'visible' });
    } finally {
      await context.close();
    }
  }
}

async function verifyBlockedStorage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage is blocked in this regression test', 'SecurityError');
      },
    });
  });
  try {
    const page = await openGame(context, 'blocked-storage');
    let expected = createState(LEVELS[0]);
    await verifyBoard(page, 0, expected, 'Board with blocked localStorage');
    const solution = solve(LEVELS[0], expected);
    assert.ok(solution?.length, 'Tutorial remains solvable without storage');
    for (let index = 0; index < solution.length; index += 1) {
      expected = await clickGate(
        page,
        0,
        expected,
        solution[index],
        'Blocked storage move ' + (index + 1),
      );
    }
    assert.equal(expected.won, true, 'Blocked storage does not prevent completing a level');
    await page.locator('#result').waitFor({ state: 'visible' });
    await page.locator('#result-retry').click();
    await verifyBoard(page, 0, createState(LEVELS[0]), 'Retry with blocked localStorage');
  } finally {
    await context.close();
  }
}

async function startServer() {
  if (process.env.GAME_URL) return;
  server = spawn(
    process.execPath,
    [resolve(gameRoot, 'server.mjs'), '--dist', '--host', '127.0.0.1', '--port', '4411'],
    { cwd: gameRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-8_000);
    });
  }
  server.on('error', (error) => {
    serverError = error;
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (serverError) throw serverError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error('Preview server exited before becoming ready:\n' + serverOutput);
    }
    try {
      const response = await fetch(gameUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Startup has a fixed deadline; retry only while the process is alive.
    }
    await delay(150);
  }
  throw new Error('Preview server did not become ready within 15 seconds:\n' + serverOutput);
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((resolveExit) => server.once('exit', resolveExit));
  server.kill('SIGTERM');
  const stopped = await Promise.race([exited.then(() => true), delay(3_000).then(() => false)]);
  if (!stopped) {
    server.kill('SIGKILL');
    await Promise.race([exited, delay(1_000)]);
  }
}

try {
  await mkdir(outputDir, { recursive: true });
  await startServer();
  const configuredBrowser = process.env.BROWSER_EXECUTABLE;
  if (configuredBrowser && !existsSync(configuredBrowser)) {
    throw new Error('BROWSER_EXECUTABLE does not exist: ' + configuredBrowser);
  }
  const executablePath =
    configuredBrowser || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await openGame(desktop, 'desktop');
    await verifyBoard(page, 0, createState(LEVELS[0]), 'Fresh desktop game');
    await page.screenshot({ path: resolve(outputDir, 'waterline-desktop.png'), fullPage: true });
    const initialProgress = (await snapshot(page)).progress;
    await verifyDirectValveInteraction(page);
    await verifyPredictionAndUndo(page);
    const solvedMoves = await verifyAllLevels(page);
    await verifyPersistence(page, solvedMoves, initialProgress);
    await verifyFailureBonusAndRestart(page);
  } finally {
    await desktop.close();
  }
  await verifyMobile();
  await verifyBlockedStorage();
  assert.deepEqual(runtimeErrors, [], 'No browser runtime or console errors');
  console.log(
    'PASS: all 8 levels, scene valves, locks, keyboard, rapid clicks, prediction, undo, restart, bonus move, persistence, 320/390px touch targets and resize, and blocked storage.',
  );
  console.log('Screenshots: ' + outputDir);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    await stopServer();
  }
}
