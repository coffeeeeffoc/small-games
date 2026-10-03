import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyRecord, finishRun, parseRecord, parseRun } from './records.ts';
import { storage } from '../storage.ts';

test('a complete no-hint attempt earns independence and records the full cycle', () => {
  const first = finishRun(emptyRecord(), { hints: 0, disassemblyMoves: 5 }, 7);
  assert.deepEqual(first, { completed: true, independent: true, bestMoves: 12 });
  assert.deepEqual(finishRun(first, { hints: 4, disassemblyMoves: 10 }, 10), first);
  assert.deepEqual(finishRun(first, { hints: 1, disassemblyMoves: 4 }, 4), {
    completed: true,
    independent: true,
    bestMoves: 8,
  });
});

test('legacy and partially known attempts do not manufacture independent achievements', () => {
  const legacy = { completed: true, independent: false, bestMoves: null };
  assert.deepEqual(finishRun(legacy, { hints: 0, disassemblyMoves: null }, 4), legacy);
  assert.deepEqual(finishRun(legacy, { hints: 1, disassemblyMoves: 5 }, 6), {
    completed: true,
    independent: false,
    bestMoves: 11,
  });
});

test('malformed counters and contradictory records are rejected', () => {
  for (const raw of [null, '', '{}', '{', '[]', '{"hints":-1,"disassemblyMoves":3}'])
    assert.equal(parseRun(raw), null);
  assert.equal(parseRun('{"hints":0.5,"disassemblyMoves":3}'), null);
  assert.equal(parseRun('{"hints":0,"disassemblyMoves":-1}'), null);
  assert.deepEqual(parseRun('{"hints":2,"disassemblyMoves":null}'), {
    hints: 2,
    disassemblyMoves: null,
  });
  assert.equal(parseRecord('{"completed":false,"independent":true,"bestMoves":null}'), null);
  assert.equal(parseRecord('{"completed":true,"independent":false,"bestMoves":-1}'), null);
  assert.equal(parseRecord('{"completed":false,"independent":false,"bestMoves":2}'), null);
  assert.deepEqual(parseRecord(JSON.stringify(emptyRecord())), emptyRecord());
});

test('run statistics survive reload reads; restart clears the attempt but preserves records', () => {
  const items = new Map<string, string>();
  const local = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  try {
    const id = 'record-persistence-test';
    assert.equal(storage.loadRun(id), null);
    assert.equal(storage.resetRun(id), true);
    assert.equal(storage.saveRun(id, { hints: 2, disassemblyMoves: 5 }), true);
    assert.deepEqual(storage.loadRun(id), { hints: 2, disassemblyMoves: 5 });
    assert.deepEqual(parseRun(items.get('luban-workshop:v1:run:' + id)!), {
      hints: 2,
      disassemblyMoves: 5,
    });
    assert.deepEqual(storage.recordCompletion(id, storage.loadRun(id)!, 4), {
      completed: true,
      independent: false,
      bestMoves: 9,
      saved: true,
    });
    assert.equal(storage.resetRun(id), true);
    assert.deepEqual(storage.loadRun(id), { hints: 0, disassemblyMoves: null });
    assert.deepEqual(storage.record(id), { completed: true, independent: false, bestMoves: 9 });
    assert.equal(storage.completed(id), true);
    assert.equal(storage.dismantled(id), true);

    items.set('luban-workshop:v1:complete:legacy-test', '1');
    assert.deepEqual(storage.record('legacy-test'), {
      completed: true,
      independent: false,
      bestMoves: null,
    });
    items.set('luban-workshop:v1:run:reload-test', '{"hints":3,"disassemblyMoves":8}');
    assert.deepEqual(storage.loadRun('reload-test'), { hints: 3, disassemblyMoves: 8 });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('storage failures retain achievements in memory and return a failed-save signal', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('storage disabled');
    },
  });
  try {
    const id = 'record-memory-test';
    assert.equal(storage.saveRun(id, { hints: 0, disassemblyMoves: 6 }), false);
    assert.deepEqual(storage.loadRun(id), { hints: 0, disassemblyMoves: 6 });
    assert.deepEqual(storage.recordCompletion(id, storage.loadRun(id)!, 6), {
      completed: true,
      independent: true,
      bestMoves: 12,
      saved: false,
    });
    assert.equal(storage.completed(id), true);
    assert.equal(storage.markDismantled('dismantled-memory-test'), false);
    assert.equal(storage.dismantled('dismantled-memory-test'), true);
    assert.equal(storage.resetRun(id), false);
    assert.equal(storage.record(id).independent, true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
