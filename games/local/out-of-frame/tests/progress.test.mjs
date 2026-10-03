import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckpoint, readProgress, writeProgress, STORAGE_KEY } from '../progress.mjs';
import { createState, moveFrame, snapshot, step } from '../engine.mjs';
import { LEVELS } from '../levels.mjs';

const levels = [{ id: 'first' }, { id: 'second' }];
const storage = (value) => ({
  getItem: (key) => (assert.equal(key, STORAGE_KEY), value),
});
const empty = {
  completed: {},
  sound: false,
  lastLevelId: 'first',
  checkpoint: null,
};

test('missing, malformed, and unavailable storage leave every room playable', () => {
  for (const value of [null, '', '{', 'null', '42', 'false']) {
    assert.deepEqual(readProgress(storage(value), levels), empty);
  }
  assert.deepEqual(
    readProgress(
      {
        getItem() {
          throw new Error('blocked');
        },
      },
      levels,
    ),
    empty,
  );
  assert.deepEqual(readProgress(undefined, levels), empty);
});

test('original records migrate using the same key and only accept known positive finite times', () => {
  const saved = JSON.stringify({
    completed: { first: 12.5, second: -4, retired: 8 },
    sound: true,
  });
  assert.deepEqual(readProgress(storage(saved), levels), {
    ...empty,
    completed: { first: 12.5 },
    sound: true,
  });
  for (const time of [0, -1, '12', null, {}, true]) {
    assert.deepEqual(
      readProgress(storage(JSON.stringify({ completed: { first: time }, sound: 'true' })), levels),
      empty,
    );
  }
});

test('last room falls back safely when a stored level no longer exists', () => {
  assert.equal(
    readProgress(storage(JSON.stringify({ lastLevelId: 'second' })), levels).lastLevelId,
    'second',
  );
  assert.equal(
    readProgress(storage(JSON.stringify({ lastLevelId: 'retired' })), levels).lastLevelId,
    'first',
  );
});

function savedSession() {
  const level = LEVELS[0];
  const state = createState(level);
  const history = [snapshot(state)];
  moveFrame(state, 0, 0);
  for (let tick = 0; tick < 240; tick += 1) {
    step(level, state, {}, 1 / 60);
    if (tick % 15 === 0) history.push(snapshot(state));
  }
  return {
    completed: { [level.id]: 6.3 },
    sound: true,
    lastLevelId: level.id,
    checkpoint: createCheckpoint(state, history),
  };
}

test('a checkpoint restores moving frame, elapsed time, canonical level geometry, and undo', () => {
  const progress = savedSession();
  const result = readProgress(storage(JSON.stringify(progress)), LEVELS);
  assert.deepEqual(result, progress);
  const checkpoint = progress.checkpoint;
  checkpoint.state.player.w = 900;
  checkpoint.state.frame.w = 900;
  checkpoint.state.objects[0].path = [{ x: 900, y: 900 }];
  checkpoint.state.objects[0].speed = 900;
  const sanitized = readProgress(storage(JSON.stringify(progress)), LEVELS).checkpoint;
  assert.equal(sanitized.state.player.w, 26);
  assert.equal(sanitized.state.frame.w, 340);
  assert.deepEqual(sanitized.state.objects[0].path, LEVELS[0].objects[0].path);
  assert.equal(sanitized.state.objects[0].speed, LEVELS[0].objects[0].speed);
});

test('checkpoint history is bounded and saved held input is released on reload', () => {
  const state = createState(LEVELS[0]);
  state.jumpHeld = true;
  const checkpoint = createCheckpoint(
    state,
    Array.from({ length: 100 }, () => snapshot(state)),
  );
  assert.equal(checkpoint.history.length, 33);
  const value = { lastLevelId: LEVELS[0].id, checkpoint };
  const result = readProgress(storage(JSON.stringify(value)), LEVELS);
  assert.equal(result.checkpoint.state.jumpHeld, false);
  assert.equal(result.checkpoint.history[0].jumpHeld, false);
  assert.notEqual(checkpoint.state, state);
});

test('corrupt or mismatched snapshots are ignored without losing completed rooms', () => {
  for (const mutate of [
    (value) => {
      value.checkpoint.levelId = 'retired';
    },
    (value) => {
      value.checkpoint.state.status = 'won';
    },
    (value) => {
      value.checkpoint.state.frame.x = -1;
    },
    (value) => {
      value.checkpoint.state.player.vy = 'fast';
    },
    (value) => {
      value.checkpoint.state.player.supportId = 'unknown';
    },
    (value) => {
      value.checkpoint.state.objects[0].id = 'unknown';
    },
    (value) => {
      value.checkpoint.state.objects[0].pathIndex = 999;
    },
    (value) => {
      value.checkpoint.state.switches = [];
    },
  ]) {
    const progress = savedSession();
    mutate(progress);
    const result = readProgress(storage(JSON.stringify(progress)), LEVELS);
    assert.equal(result.checkpoint, null);
    assert.deepEqual(result.completed, progress.completed);
  }
  const progress = savedSession();
  progress.checkpoint.history.unshift({ levelId: 'broken' });
  assert.equal(
    readProgress(storage(JSON.stringify(progress)), LEVELS).checkpoint.history.length,
    17,
  );
});

test('terminal rooms have no resumable checkpoint', () => {
  for (const status of ['won', 'lost']) {
    const state = createState(LEVELS[0]);
    state.status = status;
    assert.equal(createCheckpoint(state), null);
  }
});

test('progress writes round-trip and storage quota failures do not escape', () => {
  let saved;
  const target = {
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      saved = value;
    },
  };
  const progress = {
    ...empty,
    completed: { first: 6.3, second: 20 },
    sound: true,
  };
  assert.equal(writeProgress(target, progress), true);
  assert.deepEqual(readProgress(storage(saved), levels), progress);
  assert.equal(
    writeProgress(
      {
        setItem() {
          throw new Error('quota');
        },
      },
      progress,
    ),
    false,
  );
});
