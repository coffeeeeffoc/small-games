import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, LEVELS } from '../src/core.mjs';
import { readProgress, recordProgress, unlockedCount } from '../src/progress.mjs';
import { createLocalHost } from '../src/host.mjs';

test('corrupt and out-of-order saves cannot skip locked rooms', () => {
  assert.equal(unlockedCount(readProgress(null)), 1);
  assert.deepEqual(
    readProgress({ schemaVersion: 1, completed: [LEVELS[2].id], bestTime: 1 }).completed,
    [],
  );
  assert.equal(
    readProgress({ schemaVersion: 99, completed: LEVELS.map((level) => level.id) }).bestTime,
    null,
  );
  const saved = readProgress({
    schemaVersion: 1,
    completed: [LEVELS[0].id],
    sound: false,
    bestTime: -3,
  });
  assert.equal(unlockedCount(saved), 2);
  assert.equal(saved.sound, false);
  assert.equal(saved.bestTime, null);
});

test('clears persist once; developer trials and a boss-only run never set a full-run record', () => {
  const progress = readProgress(null),
    run = createRun(0, { seed: 1 });
  run.roomsCleared = [LEVELS[0].id];
  run.phase = 'upgrade';
  assert.equal(recordProgress(progress, run, true), false);
  assert.equal(recordProgress(progress, run), true);
  assert.equal(recordProgress(progress, run), false);
  run.roomsCleared.push(LEVELS[1].id);
  assert.equal(recordProgress(progress, run), true);
  const boss = createRun(2, { seed: 1 });
  boss.phase = 'won';
  boss.roomsCleared = [LEVELS[2].id];
  boss.time = 12;
  assert.equal(recordProgress(progress, boss), true);
  assert.equal(progress.bestTime, null);
  run.phase = 'won';
  run.roomsCleared = LEVELS.map((level) => level.id);
  run.time = 70;
  assert.equal(recordProgress(progress, run), true);
  assert.equal(progress.bestTime, 70);
  assert.equal(recordProgress(progress, run), false);
});

test('unavailable storage preserves session progress and version conflicts do not overwrite it', async () => {
  const host = createLocalHost({
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  });
  const value = { schemaVersion: 1, completed: [LEVELS[0].id] };
  await assert.rejects(host.storage.write('progress', value), { code: 'UNAVAILABLE' });
  const record = await host.storage.read('progress');
  assert.deepEqual(record.value, value);
  await assert.rejects(host.storage.write('progress', {}, 'stale'), { code: 'CONFLICT' });
  assert.deepEqual((await host.storage.read('progress')).value, value);
});
