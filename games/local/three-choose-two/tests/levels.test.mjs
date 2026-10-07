import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, CHAPTERS, validateLevels, getLevel } from '../src/levels.mjs';
import { createLevel, place, hasPlacement, previewPlacement } from '../src/engine.mjs';
import { SHAPE_BY_ID } from '../src/shapes.mjs';
import { createProgress, saveCurrentGame, saveProgress, readProgress, resumeState } from '../src/progress.mjs';

function linePotential(board) {
  let potential = 0, occupied = 0;
  for (let line = 0; line < 8; line++) {
    let row = 0, column = 0;
    for (let cell = 0; cell < 8; cell++) {
      row += Number(Boolean(board[line * 8 + cell]));
      column += Number(Boolean(board[cell * 8 + line]));
    }
    occupied += row;
    potential += row * row + column * column;
  }
  return potential - occupied * 6;
}

// Four independent, deterministic one-move policies: clear as much as
// possible, break ties with big/small pieces, optionally favour denser lines.
// They know the current three pieces, but do not look ahead into future stock.
function playGreedy(level, policy) {
  let state = createLevel(level.id);
  for (let step = 0; step < level.maxGroups * 2 && state.status === 'playing'; step++) {
    let best;
    for (let slot = 0; slot < 3; slot++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const preview = previewPlacement(state, slot, x, y);
      if (!preview.valid) continue;
      const board = [...state.board];
      for (const cell of preview.cells) board[cell] = 1;
      for (let cell = 0; cell < 64; cell++) if (preview.rows.includes(Math.floor(cell / 8)) || preview.cols.includes(cell % 8)) board[cell] = 0;
      const size = SHAPE_BY_ID[state.candidates[slot].shapeId].size;
      const score = preview.lines * 100000 + (policy >= 2 ? linePotential(board) * 100 : 0) + (policy % 2 ? -size : size) * 10;
      if (!best || score > best.score) best = { slot, x, y, score };
    }
    if (!best) break;
    state = place(state, best.slot, best.x, best.y);
  }
  return state;
}

test('thirty stable independent levels pass their game-owned content validation', () => {
  assert.equal(LEVELS.length, 30); assert.equal(CHAPTERS.length, 3);
  assert.equal(new Set(LEVELS.map(({ id }) => id)).size, 30);
  assert.equal(new Set(LEVELS.map(({ initialBoard }) => JSON.stringify(initialBoard))).size, 30);
  assert.equal(new Set(LEVELS.map(({ initialBoard }) => JSON.stringify(initialBoard.map(Boolean)))).size, 30, 'each board has distinct occupancy, beyond its colours');
  assert.equal(validateLevels().valid, true);
  for (const [i, level] of LEVELS.entries()) {
    assert.equal(level.id, i + 1); assert.equal(getLevel(level.id), level);
    assert.equal(level.chapter, CHAPTERS[Math.floor(i / 10)].id);
    assert.ok(level.hint.length > 0); assert.equal(level.candidates.length, level.maxGroups + 2);
  }
});

test('every complete reference route legally wins and attains the highest configured star threshold', () => {
  for (const level of LEVELS) {
    let state = createLevel(level.id);
    const sameRetry = createLevel(level.id);
    assert.deepEqual(state.candidates, sameRetry.candidates, `level ${level.id} retry is fixed`);
    for (const [i, action] of level.solution.entries()) {
      assert.equal(state.status, 'playing', `level ${level.id} route must not continue after victory at ${i}`);
      const next = place(state, action.slot, action.x, action.y);
      assert.notEqual(next, state, `level ${level.id} move ${i} is legal`);
      state = next;
    }
    assert.equal(state.status, 'won', `level ${level.id}: ${state.reason}`);
    assert.equal(state.stars, 3, `level ${level.id} has an attainable three-star route`);
    assert.ok(state.stats.lines >= level.goal.lines);
    assert.ok(state.stats.crossClears >= (level.goal.cross ?? 0));
    assert.ok(state.stats.multiClears >= (level.goal.multi ?? 0));
    if (level.discardBudget !== undefined) assert.ok(state.stats.discardedCells <= level.discardBudget);
  }
});

test('only the first five levels are short tutorials; later routes require space preparation across groups', () => {
  assert.ok(LEVELS.slice(0, 5).every((level) => level.solution.length <= 3));
  let crossGroupPreparation = 0;
  for (const level of LEVELS.slice(5)) {
    let state = createLevel(level.id), run = 0, longestRun = 0, setups = 0;
    for (const action of level.solution) {
      const previousGroup = state.group;
      state = place(state, action.slot, action.x, action.y);
      run = state.lastEvent.lines ? 0 : run + 1;
      if (!state.lastEvent.lines) setups++;
      if (run >= 2 && state.group > previousGroup) crossGroupPreparation++;
      longestRun = Math.max(longestRun, run);
    }
    assert.ok(longestRun >= 2, `level ${level.id} needs consecutive setup moves, rather than only patching ready lines`);
    assert.ok(setups >= level.solution.length / 3, `level ${level.id} must plan useful non-clearing moves`);
    assert.ok(level.solution.length >= (level.id <= 10 ? 8 : level.id <= 20 ? 9 : 12));
  }
  assert.ok(crossGroupPreparation >= 15, 'planning includes carrying incomplete lines into the next group');
});

test('the early planning chapter starts with choices to build, rather than a ready one-piece clear', () => {
  for (const level of LEVELS.slice(5, 15)) {
    const state = createLevel(level.id);
    let placements = 0;
    for (let slot = 0; slot < 3; slot++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const preview = previewPlacement(state, slot, x, y);
      if (!preview.valid) continue;
      placements++;
      assert.equal(preview.lines, 0, `level ${level.id} requires a setup before any line can be cleared`);
    }
    assert.ok(placements >= 9, `level ${level.id} has multiple real layout choices`);
  }
});

test('four immediate-clear strategies cannot cruise through any post-tutorial challenge', () => {
  let budgetFailures = 0;
  for (const level of LEVELS.slice(5)) for (let policy = 0; policy < 4; policy++) {
    const result = playGreedy(level, policy);
    assert.equal(result.status, 'lost', `level ${level.id}, policy ${policy}: a one-move policy must not finish even using all ${level.maxGroups} groups`);
    if (result.reason === 'discard-budget') budgetFailures++;
  }
  assert.ok(budgetFailures >= 5, 'late discard limits change decisions, rather than being a cosmetic counter');
});

test('discard pressure arrives after spatial planning and progressively narrows the spare allowance', () => {
  for (const level of LEVELS) {
    if (level.id <= 20) {
      assert.equal(level.discardBudget, undefined);
      continue;
    }
    let state = createLevel(level.id);
    for (const action of level.solution) state = place(state, action.slot, action.x, action.y);
    const spare = level.id <= 23 ? 6 : level.id <= 26 ? 4 : 2;
    assert.equal(level.discardBudget - state.stats.discardedCells, spare, `level ${level.id} leaves a deliberate ${spare}-cell allowance`);
  }
});

test('an in-progress old challenge resumes its saved board and stock while existing unlocks survive the new content', () => {
  // Version-one level 6 had an L-shaped patch and a separate three-plus-five
  // row. An ongoing game keeps that complete config snapshot until it ends.
  const legacyBoard = Array(64).fill(0);
  for (const y of [1, 2]) for (let x = 0; x < 8; x++) legacyBoard[y * 8 + x] = 1 + ((x * 2 + y + 6) % 5);
  for (const [x, y] of [[2, 1], [2, 2], [3, 2]]) legacyBoard[y * 8 + x] = 0;
  const legacy = {
    id: 6, number: 6, title: '拐角留白', chapter: 'foundation', maxGroups: 6, initialBoard: legacyBoard,
    goal: { lines: 3 }, starThresholds: { two: 3, three: 2 },
    candidates: [
      ['l3-nw', 'h3', 'h2'], ['h5', 'h5', 'h2'], ['h5', 'v2', 'dot'], ['h3', 'square2', 'l3-se'],
      ['h5', 'v2', 'dot'], ['h3', 'v2', 'l3-se'], ['h5', 'square2', 'dot'], ['h3', 'v2', 'l3-se'],
    ].map((group) => group.map((shapeId, slot) => ({ shapeId, color: slot + 2 }))),
    solution: [{ slot: 0, x: 2, y: 1 }, { slot: 1, x: 0, y: 5 }, { slot: 1, x: 3, y: 5 }],
    hint: '拐角缺口适合固定朝向的L。', continuationGroups: 2,
  };
  legacy.candidates[1][1].color = 4;
  const progress = createProgress();
  for (let id = 1; id <= 5; id++) progress.records[id] = { stars: 3, bestGroups: 1, continued: false };
  progress.unlocked = 6;
  let raw;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  const oldState = place(createLevel(legacy), 0, 2, 1);
  assert.equal(saveProgress(storage, saveCurrentGame(progress, oldState)), true);
  const restored = readProgress(storage);
  let resumed = resumeState(restored);
  assert.equal(restored.unlocked, 6);
  assert.deepEqual(restored.records, progress.records);
  assert.deepEqual(resumed.config, legacy);
  assert.deepEqual(resumed.board, oldState.board);
  assert.notDeepEqual(resumed.config.initialBoard, getLevel(6).initialBoard);
  resumed = place(resumed, 1, 0, 5);
  resumed = place(resumed, 1, 3, 5);
  assert.equal(resumed.status, 'won');
  assert.equal(resumed.stars, 3);
  assert.deepEqual(createLevel(6).board, getLevel(6).initialBoard, 'a fresh attempt uses the revised challenge');
});

test('several retained pairs are genuinely available rather than a forced unusable third candidate', () => {
  const freelyChosen = LEVELS.filter((level) => {
    const state = createLevel(level.id);
    return [0, 1, 2].every((slot) => hasPlacement(state, slot));
  });
  assert.ok(freelyChosen.length >= 10, `${freelyChosen.length} initial states allow all three candidates`);
  const endings = new Set();
  const state = createLevel(2);
  for (let first = 0; first < 3; first++) for (let second = 0; second < 3; second++) {
    if (first === second) continue;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const a = place(state, first, x, y);
      if (a === state || a.status !== 'playing') continue;
      for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) {
        const b = place(a, second, xx, yy);
        if (b !== a) endings.add(`${first}-${second}:${b.stats.lines}`);
      }
    }
  }
  assert.ok([...endings].some((value) => value.endsWith(':0')));
  assert.ok([...endings].some((value) => value.endsWith(':1')));
  assert.ok(new Set([...endings].map((value) => value.split(':')[0])).size >= 3);
});

test('invalid references, budgets, star thresholds and duplicate ids are rejected', () => {
  const bad = structuredClone(LEVELS.slice(0, 2));
  bad[1].id = bad[0].id; bad[0].candidates[0][0].shapeId = 'missing-shape';
  bad[0].starThresholds.three = bad[0].maxGroups + 1; bad[0].discardBudget = -1;
  const result = validateLevels(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate')));
  assert.ok(result.errors.some((error) => error.includes('shape stock')));
  assert.ok(result.errors.some((error) => error.includes('threshold')));
  assert.ok(result.errors.some((error) => error.includes('budget')));
});
