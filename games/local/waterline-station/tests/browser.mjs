import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { LEVELS } from '../levels.mjs';
import { createState, toggleGate, solve } from '../engine.mjs';

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
  return actual;
}

async function clickGate(page, levelIndex, expected, gateId, label, touch = false) {
  const before = await snapshot(page);
  const gate = page.locator('button[data-gate="' + gateId + '"]');
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

  const gate = page.locator('button[data-gate="' + solution[0] + '"]');
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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await openGame(context, 'mobile');
    assert.equal(
      await page.evaluate(() => navigator.maxTouchPoints > 0),
      true,
      'Mobile context supports touch',
    );
    await assertNoHorizontalOverflow(page, 'Mobile initial board');
    await page.screenshot({ path: resolve(outputDir, 'waterline-mobile.png'), fullPage: true });
    let expected = createState(LEVELS[0]);
    const solution = solve(LEVELS[0], expected);
    assert.ok(solution?.length, 'Mobile tutorial is solvable');
    for (let index = 0; index < solution.length; index += 1) {
      expected = await clickGate(
        page,
        0,
        expected,
        solution[index],
        'Mobile tap ' + (index + 1),
        true,
      );
      await assertNoHorizontalOverflow(page, 'Mobile after tap ' + (index + 1));
    }
    assert.equal(expected.won, true, 'The first level can be completed using real touch taps');
    await page.locator('#result').waitFor({ state: 'visible' });
  } finally {
    await context.close();
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
    'PASS: all 8 levels, prediction, undo, restart, bonus move, persistence, mobile taps, and blocked storage.',
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
