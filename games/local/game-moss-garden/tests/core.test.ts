import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAPTERS, LEVELS, validateCatalog } from '../src/content.ts';
import type { Level } from '../src/content.ts';
import {
  createPuzzle,
  hint,
  placeSeed,
  restorePuzzle,
  solve,
  toggleExclusion,
  touching,
  undo,
  validateLevel,
} from '../src/rules.ts';
import { createSave, parseSave, recordCompletion, unlocked } from '../src/progress.ts';

const level = LEVELS[0];

function solvedBoard(item: Level) {
  return solve(item, 1)[0].reduce(
    (state, cell) => placeSeed(item, state, cell),
    createPuzzle(item),
  );
}

test('30 original boards have connected flower plots, exactly one solution, and coherent chapter references', () => {
  assert.equal(LEVELS.length, 30);
  assert.equal(CHAPTERS.length, 5);
  validateCatalog();
  assert.equal(new Set(LEVELS.map((item) => `${item.size}:${item.regions.join(',')}`)).size, 30);
  for (const item of LEVELS) {
    validateLevel(item);
    const solutions = solve(item, 2);
    assert.equal(solutions.length, 1, item.id);
    assert.equal(solutions[0].length, item.size);
    assert.equal(solvedBoard(item).completed, true, item.id);
    assert.equal(item.size, item.chapter + 3);
  }
});

test('schema rejects missing plots, disconnected plots, invalid IDs, and ambiguous layouts', () => {
  assert.throws(() => validateLevel({ ...level, regions: [] }), /size/);
  assert.throws(
    () =>
      validateLevel({ ...level, regions: level.regions.map((value) => (value === 3 ? 2 : value)) }),
    /missing/,
  );
  assert.throws(
    () =>
      validateLevel({
        ...level,
        regions: level.regions.map((value, index) => (index === 12 ? 0 : value)),
      }),
    /disconnected/,
  );
  assert.throws(
    () =>
      validateLevel({
        ...level,
        regions: level.regions.map((value, index) => (index === 0 ? 99 : value)),
      }),
    /ID/,
  );
  assert.throws(
    () =>
      validateLevel({
        ...level,
        regions: Array.from({ length: 16 }, (_, cell) => Math.floor(cell / 4)),
      }),
    /one solution/,
  );
});

test('same row, column, and flower plot are rejected with useful feedback and do not alter placements', () => {
  const original = placeSeed(level, createPuzzle(level), 1);
  const before = JSON.stringify(original);
  for (const [cell, reason] of [
    [2, /行/],
    [5, /列/],
    [4, /花圃/],
  ] as const) {
    const next = placeSeed(level, original, cell);
    assert.deepEqual(next.placed, [1]);
    assert.equal(next.mistakes, 1);
    assert.match(next.message, reason);
    assert.equal(next.history.length, original.history.length);
  }
  assert.equal(JSON.stringify(original), before, 'The rules must not mutate the previous state');
  assert.equal(placeSeed(level, original, -1), original);
  assert.equal(placeSeed(level, original, 16), original);
});

test('adjacent diagonals are rejected while distant diagonal cells are legal', () => {
  const rowPlots = {
    ...level,
    regions: Array.from({ length: 16 }, (_, cell) => Math.floor(cell / 4)),
  };
  const state = placeSeed(rowPlots, createPuzzle(rowPlots), 0);
  const touchingDiagonal = placeSeed(rowPlots, state, 5);
  assert.deepEqual(touchingDiagonal.placed, [0]);
  assert.match(touchingDiagonal.message, /斜角/);
  assert.deepEqual(placeSeed(rowPlots, state, 10).placed, [0, 10]);
  assert.equal(touching(4, 0, 5), true);
  assert.equal(touching(4, 0, 10), false);
});

test('placements, removal, exclusion, and undo form a reversible sequence without erasing hint or mistake counts', () => {
  let state = toggleExclusion(level, createPuzzle(level), 1);
  assert.deepEqual(state.excluded, [1]);
  state = placeSeed(level, state, 1);
  assert.deepEqual(state.excluded, []);
  state = placeSeed(level, state, 2);
  assert.equal(state.mistakes, 1);
  state = undo(level, state);
  assert.deepEqual(state.placed, []);
  assert.deepEqual(state.excluded, [1]);
  assert.equal(state.mistakes, 1);
  state = undo(level, state);
  assert.deepEqual(state.excluded, []);
  assert.equal(state.history.length, 0);
  assert.equal(undo(level, state), state);
  const placed = placeSeed(level, createPuzzle(level), 1);
  assert.deepEqual(placeSeed(level, placed, 1).placed, []);
  assert.deepEqual(toggleExclusion(level, placed, 1).placed, [1]);
  assert.deepEqual(toggleExclusion(level, placed, 1).excluded, []);
});

test('the first hint demonstrates the single-cell flower plot; hints never make an unsolvable placement', () => {
  const first = hint(level, createPuzzle(level));
  assert.deepEqual(first.placed, [14]);
  assert.match(first.message, /花圃只剩/);
  assert.equal(first.hints, 1);
  assert.equal(undo(level, first).hints, 1);
  for (const item of LEVELS) {
    const solution = solve(item, 1)[0];
    let state = createPuzzle(item);
    for (let i = 0; i < item.size; i++) {
      state = hint(item, state);
      assert.ok(
        state.placed.every((cell) => solution.includes(cell)),
        item.id,
      );
    }
    assert.equal(state.completed, true, item.id);
    assert.equal(state.hints, item.size);
    assert.equal(hint(item, state), state);
  }
});

test('hints repair a wrong placement and recover a correct square even when marked excluded', () => {
  let state = placeSeed(level, createPuzzle(level), 0);
  assert.deepEqual(state.placed, [0]);
  state = hint(level, state);
  assert.deepEqual(state.placed, []);
  assert.equal(state.hints, 1);
  assert.match(state.message, /取回/);
  for (const cell of solve(level, 1)[0]) state = toggleExclusion(level, state, cell);
  for (let i = 0; i < level.size; i++) state = hint(level, state);
  assert.equal(state.completed, true);
  assert.equal(state.excluded.length, 0);
});

test('completion freezes interaction, and rejected input cannot fake completion', () => {
  const state = solvedBoard(level);
  assert.equal(state.completed, true);
  assert.equal(placeSeed(level, state, state.placed[0]), state);
  assert.equal(toggleExclusion(level, state, 0), state);
  assert.equal(undo(level, state), state);
  const empty = restorePuzzle(level, { completed: true });
  assert.equal(empty.completed, false);
});

test('restoring a corrupt puzzle bounds history, keeps legal cells, and recomputes completion', () => {
  const state = restorePuzzle(level, {
    placed: [1, 1, 2, -1, 500, '7', 7],
    excluded: [1, 3, 3, -1, 500],
    history: Array.from({ length: 150 }, () => ({ placed: [1, 2], excluded: [1, 15] })),
    hints: Infinity,
    mistakes: -9,
    completed: true,
    message: 'untrusted message',
  });
  assert.deepEqual(state.placed, [1, 7]);
  assert.deepEqual(state.excluded, [3]);
  assert.equal(state.history.length, 100);
  assert.deepEqual(state.history[0], { placed: [1], excluded: [15] });
  assert.equal(state.hints, 0);
  assert.equal(state.mistakes, 0);
  assert.equal(state.completed, false);
  assert.equal(state.message, '');
  assert.equal(restorePuzzle(level, { placed: solve(level, 1)[0] }).completed, true);
  assert.deepEqual(restorePuzzle(level, null), createPuzzle(level));
});

test('normal progression unlocks each next level exactly once and refuses unfinished or locked settlement', () => {
  let save = createSave();
  assert.equal(unlocked(save, LEVELS[0]), true);
  assert.equal(unlocked(save, LEVELS[1]), false);
  assert.equal(recordCompletion(save, level, createPuzzle(level), 100), save);
  assert.equal(recordCompletion(save, LEVELS[1], solvedBoard(LEVELS[1]), 100), save);
  for (const item of LEVELS) {
    assert.equal(unlocked(save, item), true, item.id);
    const puzzle = solvedBoard(item);
    save = recordCompletion(
      { ...save, active: { levelId: item.id, puzzle, elapsedMs: 5000 } },
      item,
      puzzle,
      5000,
    );
    assert.equal(save.active, null);
    assert.deepEqual(save.completed[item.id], { hints: 0, mistakes: 0, timeMs: 5000 });
    assert.equal(
      recordCompletion(save, item, puzzle, 9000),
      save,
      'Repeated settlement is idempotent',
    );
  }
  assert.equal(Object.keys(save.completed).length, 30);
});

test('save parsing restores an unlocked active game, drops unknown content, and survives corrupt or future saves', () => {
  const base = recordCompletion(createSave(), level, solvedBoard(level), 7500);
  const puzzle = placeSeed(LEVELS[1], createPuzzle(LEVELS[1]), solve(LEVELS[1], 1)[0][0]);
  const raw = {
    ...base,
    completed: { ...base.completed, nonexistent: {} },
    active: { levelId: LEVELS[1].id, puzzle, elapsedMs: 1234 },
    sound: false,
    vibration: false,
  };
  const restored = parseSave(JSON.stringify(raw));
  assert.deepEqual(restored.completed, base.completed);
  assert.equal(restored.active?.levelId, LEVELS[1].id);
  assert.deepEqual(restored.active?.puzzle.placed, puzzle.placed);
  assert.equal(restored.active?.elapsedMs, 1234);
  assert.equal(restored.sound, false);
  assert.equal(restored.vibration, false);
  assert.equal(
    parseSave({ ...raw, active: { ...raw.active, levelId: LEVELS[5].id } }).active,
    null,
  );
  assert.deepEqual(parseSave('{bad json'), createSave());
  assert.deepEqual(parseSave(null), createSave());
  assert.deepEqual(parseSave({ version: 999, sound: false }).completed, {});
});

test('save parsing discards finished active boards so continuing cannot reopen a frozen puzzle', () => {
  const raw = {
    ...createSave(),
    active: { levelId: level.id, puzzle: solvedBoard(level), elapsedMs: 1234 },
  };
  assert.equal(parseSave(raw).active, null);
  const completed = recordCompletion(createSave(), level, solvedBoard(level), 5000);
  assert.equal(parseSave({ ...raw, ...completed, active: raw.active }).active, null);
});

test('only a well-formed contiguous completion prefix unlocks normal progression', () => {
  const stats = { hints: 0, mistakes: 0, timeMs: 5000 };
  const gap = parseSave({
    ...createSave(),
    completed: { [LEVELS[0].id]: stats, [LEVELS[2].id]: stats },
  });
  assert.deepEqual(Object.keys(gap.completed), [LEVELS[0].id]);
  assert.equal(unlocked(gap, LEVELS[1]), true);
  assert.equal(unlocked(gap, LEVELS[3]), false);
  const forgedLater = parseSave({ ...createSave(), completed: { [LEVELS[20].id]: stats } });
  assert.deepEqual(forgedLater.completed, {});
  assert.equal(unlocked(forgedLater, LEVELS[21]), false);
  for (const corrupt of [
    {},
    [],
    { ...stats, timeMs: -1 },
    { ...stats, hints: Infinity },
    { ...stats, mistakes: '0' },
    { ...stats, timeMs: 1.5 },
  ]) {
    const save = parseSave({
      ...createSave(),
      completed: { [LEVELS[0].id]: corrupt, [LEVELS[1].id]: stats },
    });
    assert.deepEqual(save.completed, {});
    assert.equal(unlocked(save, LEVELS[1]), false);
  }
  const future = parseSave({
    version: 2,
    completed: { [LEVELS[0].id]: stats },
    active: { levelId: level.id, puzzle: createPuzzle(level), elapsedMs: 999 },
    sound: false,
    vibration: false,
  });
  assert.deepEqual(future.completed, {});
  assert.equal(future.active, null);
  assert.equal(future.sound, false);
  assert.equal(future.vibration, false);
});
