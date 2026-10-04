import test from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../storage.ts';
import { levels } from './fixtures/legacy-levels.ts';
import { createGame, tryMove, type Level } from './index.ts';

test('disabled browser storage preserves puzzle state, attempt stats, and records when switching levels', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('browser storage unavailable');
      },
      setItem: () => {
        throw new Error('browser storage unavailable');
      },
    },
  });
  try {
    const first: Level = { ...levels[0]!, id: 'session-puzzle-first' };
    const second: Level = { ...levels[0]!, id: 'session-puzzle-second' };
    const shifted = tryMove(first, createGame(first), ['key', 'cross'], -6, 'y').state;
    const firstState = tryMove(first, shifted, 'key', -2, 'z').state;
    assert.deepEqual(firstState.offsets.key, [0, -6, -2]);
    assert.deepEqual(firstState.offsets.cross, [0, -6, 0]);
    assert.equal(firstState.history.length, 2);
    const secondState = createGame(second);
    assert.equal(storage.load(first), null);
    assert.equal(storage.save(firstState), false);
    assert.equal(storage.saveRun(first.id, { hints: 1, disassemblyMoves: null }), false);
    assert.equal(storage.save(secondState), false);
    assert.equal(storage.resetRun(second.id), false);
    assert.equal(storage.current(), second.id);

    assert.deepEqual(storage.load(first), firstState);
    assert.deepEqual(storage.loadRun(first.id), { hints: 1, disassemblyMoves: null });
    assert.deepEqual(storage.load(second), secondState);
    assert.deepEqual(storage.loadRun(second.id), { hints: 0, disassemblyMoves: null });
    assert.equal(storage.markDismantled(first.id), false);
    assert.deepEqual(storage.recordCompletion(first.id, { hints: 0, disassemblyMoves: 4 }, 5), {
      completed: true,
      independent: true,
      bestMoves: 9,
      saved: false,
    });
    assert.equal(storage.save(firstState), false);
    assert.equal(storage.current(), first.id);
    assert.equal(storage.dismantled(first.id), true);
    assert.equal(storage.completed(first.id), true);
    assert.equal(storage.record(first.id).independent, true);
    assert.equal(storage.completed(second.id), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
