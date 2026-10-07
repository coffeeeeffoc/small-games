import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, CHAPTERS, validateLevels, getLevel } from '../src/levels.mjs';
import { createLevel, place, hasPlacement } from '../src/engine.mjs';

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
