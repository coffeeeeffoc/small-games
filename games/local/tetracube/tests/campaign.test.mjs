import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS, validateLevels } from '../assets/scripts/core/campaign.js';
import {
  createRun,
  applyInput,
  advanceTicks,
  snapshotRun,
  restoreRun,
  runResult,
} from '../assets/scripts/core/session.js';
import { createProgressStore, PROGRESS_KEY } from '../assets/scripts/core/progress.js';

test('all eighteen authored challenges have a legal real-input solution', () => {
  assert.deepEqual(validateLevels(), []);
  assert.equal(LEVELS.length, 18);
  for (const level of LEVELS) {
    const run = createRun('campaign', 42, level.id);
    for (let placement = 0; placement < level.layers; placement++) {
      for (const plane of level.turns)
        assert(applyInput(run, { action: 'rotate', plane, direction: 1 }), level.id);
      for (const axis of [0, 1]) {
        const target = Math.min(...level.target.map((cell) => cell[axis]));
        let current = Math.min(...run.game.cells().map((cell) => cell[axis]));
        while (current !== target) {
          const direction = Math.sign(target - current);
          assert(applyInput(run, { action: 'move', axis, direction }), level.id);
          current += direction;
        }
      }
      advanceTicks(run, 1);
      assert(applyInput(run, { action: 'drop' }), level.id);
    }
    assert.equal(run.status, 'won', level.id);
    assert.equal(run.game.lines, level.targetLines, level.id);
    assert.equal(runResult(run).score, level.index + 1);
    assert.equal(runResult(run).stars, 3);
    assert.deepEqual(snapshotRun(restoreRun(snapshotRun(run))), snapshotRun(run));
  }
});

test('ranked simulation rejects invented fields and assisted results stay ineligible', () => {
  const run = createRun('endless', 4);
  assert.throws(() => applyInput(run, { score: 100000 }));
  assert.throws(() => applyInput(run, { action: 'revive' }));
  assert.throws(() => applyInput(run, { action: 'move', axis: 2, direction: 1 }));
  assert.throws(() => applyInput(run, { action: 'drop', turn: 'left' }));
  advanceTicks(run, 240);
  applyInput(run, { action: 'drop' });
  applyInput(run, { action: 'end' });
  assert.equal(runResult(run).elapsedMs, 2000);
  assert.equal(runResult(run).secondary, 2);
  assert.equal(runResult(run).eligible, true);
  run.assisted = true;
  assert.equal(runResult(run).eligible, false);
  assert.throws(() => advanceTicks(run, 1));
});

test('progress unlocks the next challenge, keeps best stars and preserves broken saves', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => data.set(key, value),
  };
  const store = createProgressStore(storage);
  assert(store.unlocked(0));
  assert(!store.unlocked(1));
  assert(store.complete(LEVELS[0].id, { stars: 3, secondary: 20000 }));
  assert(store.complete(LEVELS[0].id, { stars: 1, secondary: 30000 }));
  assert.deepEqual(store.levels[LEVELS[0].id], { stars: 3, time: 20000 });
  assert(createProgressStore(storage).unlocked(1));
  data.set(PROGRESS_KEY, 'broken');
  const broken = createProgressStore(storage);
  assert(!broken.writable);
  assert(!broken.complete(LEVELS[0].id, { stars: 1, secondary: 100 }));
  assert.equal(data.get(PROGRESS_KEY), 'broken');
});
