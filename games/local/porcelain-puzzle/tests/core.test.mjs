import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { levels, vessels, validateContent, levelAt } from '../src/content.mjs';
import {
  makePuzzle,
  newAttempt,
  start,
  tick,
  move,
  snap,
  hint,
  revive,
  restore,
  pause,
  resume,
  contains,
} from '../src/core.mjs';
import { emptySave, settle, loadSave, persist } from '../src/storage.mjs';
test('100 distinct vessels; all 100 seeded puzzles are connected, visible and solvable', () => {
  assert.equal(validateContent(), true);
  assert.equal(new Set(levels.map((l) => l.vesselId)).size, 100);
  for (const level of levels) {
    const p = makePuzzle(level);
    assert.equal(p.pieces.length, level.pieces);
    assert.deepEqual(p, makePuzzle(level));
    const seen = new Set([0]),
      queue = [0];
    while (queue.length) {
      const id = queue.pop();
      for (const n of p.pieces[id].neighbors)
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    }
    assert.equal(seen.size, level.pieces, `${level.id} disconnected`);
    for (const piece of p.pieces) {
      assert.ok(contains(piece.center, p.silhouette));
      assert.ok(contains(piece.center, piece.polygon));
      let area = 0;
      for (
        let y = Math.ceil(Math.max(0, piece.bounds.minY) / 4) * 4;
        y < Math.min(300, piece.bounds.maxY);
        y += 4
      )
        for (
          let x = Math.ceil(Math.max(0, piece.bounds.minX) / 4) * 4;
          x < Math.min(240, piece.bounds.maxX);
          x += 4
        )
          if (contains({ x, y }, p.silhouette) && contains({ x, y }, piece.polygon)) area += 16;
      assert.ok(area > 120, `${level.id} tiny visible fragment ${piece.id}: ${area}`);
    }
    const s = newAttempt(level, 'test');
    start(s);
    for (const g of s.groups) move(s, g.id, 40, 80);
    snap(s, s.groups[0].id, p);
    assert.equal(s.phase, 'won', level.id);
    assert.equal(s.groups.length, 1);
  }
});
test('only correct neighbors attach, group-to-group joins stay rigid', () => {
  const level = levelAt(12),
    s = newAttempt(level),
    p = makePuzzle(level);
  start(s);
  const a = s.groups[0],
    neighbor = p.pieces[a.id].neighbors[0],
    b = s.groups.find((g) => g.id === neighbor);
  for (const g of s.groups) move(s, g.id, 700 + g.id * 20, 700);
  move(s, a.id, 10, 30);
  move(s, b.id, 22, 32);
  assert.equal(snap(s, a.id, p), 1);
  assert.equal(s.groups.find((g) => g.id === a.id).pieces.length, 2);
  assert.equal(a.x, 22);
  const c = s.groups.find(
    (g) =>
      g.id !== a.id &&
      g.pieces.some((id) => p.pieces[id].neighbors.some((n) => a.pieces.includes(n))),
  );
  move(s, c.id, 35, 35);
  assert.ok(snap(s, c.id, p) >= 1);
  assert.equal(s.groups.find((g) => g.id === c.id).pieces.length, 3);
});
test('timer, pause, timeout, once-only revive, cancelled and stale rewards', () => {
  const level = levelAt(1),
    s = newAttempt(level, 'one');
  tick(s, 10000);
  assert.equal(s.remainingMs, level.timeMs);
  start(s);
  tick(s, 10);
  pause(s);
  tick(s, 30000);
  assert.equal(s.elapsedMs, 10);
  resume(s);
  tick(s, level.timeMs);
  assert.equal(s.phase, 'timeout');
  const before = structuredClone(s.groups);
  assert.equal(move(s, s.groups[0].id, 4, 5), false);
  assert.equal(revive(s, 'other', 'completed'), false);
  for (const status of ['dismissed', 'failed', 'unavailable'])
    assert.equal(revive(s, 'one', status), false);
  assert.equal(revive(s, 'one', 'completed'), true);
  assert.equal(s.remainingMs, 45000);
  assert.deepEqual(s.groups, before);
  assert.equal(revive(s, 'one', 'completed'), false);
  tick(s, 45000);
  assert.equal(revive(s, 'one', 'completed'), false);
});
test('save resumes groups/time without resetting, corrupt saves fail safely; practice has no rewards', () => {
  const s = newAttempt(levelAt(1), 'save');
  start(s);
  tick(s, 1200);
  const restored = restore(s);
  assert.equal(restored.phase, 'paused');
  assert.equal(restored.remainingMs, s.remainingMs);
  assert.deepEqual(restored.groups, s.groups);
  assert.equal(restore({ ...s, groups: [s.groups[0]] }), null);
  assert.equal(restore({ ...s, remainingMs: -5 }), null);
  const save = emptySave(),
    p = makePuzzle(levelAt(1));
  for (const g of s.groups) move(s, g.id, 0, 0);
  snap(s, s.groups[0].id, p);
  assert.equal(settle(save, s, true), false);
  assert.equal(save.unlocked, 1);
  settle(save, s);
  settle(save, s);
  assert.equal(save.unlocked, 2);
  assert.equal(save.collection.length, 1);
  assert.equal(
    loadSave({
      getItem() {
        throw Error('blocked');
      },
    }).unlocked,
    1,
  );
  assert.equal(
    persist(
      {
        setItem() {
          throw Error('blocked');
        },
      },
      save,
    ),
    false,
  );
});
test('hints consume fixed quota and do not move fragments', () => {
  const s = newAttempt(levelAt(1)),
    p = makePuzzle(levelAt(1));
  start(s);
  const before = structuredClone(s.groups);
  assert.ok(hint(s, p));
  assert.ok(hint(s, p));
  assert.equal(hint(s, p), null);
  assert.deepEqual(s.groups, before);
  assert.equal(s.assisted, true);
});

test('studio shapes preserve original seed identities and shared seams in all 100 puzzles', () => {
  const cuts = levels.map((level) => {
    const old = makePuzzle(level, true),
      current = makePuzzle(level);
    assert.deepEqual(
      current.pieces.map((p) => [p.id, p.neighbors]),
      old.pieces.map((p) => [p.id, p.neighbors]),
    );
    return old.pieces.map((piece) => piece.polygon);
  });
  assert.equal(
    createHash('sha256').update(JSON.stringify(cuts)).digest('hex'),
    'da5fb1f106887aeab9f7d77969fdac53f3bd112e57e535dcb3130727cd92f591',
  );
});

test('both older contour versions retain positions, time and progress', () => {
  for (const version of [undefined, 2]) {
    for (const number of [40, 59, 64]) {
      const level = levelAt(number),
        legacy = makePuzzle(level, version === undefined ? true : 2),
        current = makePuzzle(level);
      const a = legacy.pieces[0];
      const b = a.neighbors[0];
      const state = newAttempt(level, `old-${number}`);
      start(state);
      for (const group of state.groups) move(state, group.id, 500 + group.id * 10, 700);
      move(state, a.id, 12, 40);
      move(state, b, 12, 40);
      snap(state, a.id, legacy);
      tick(state, 1234);
      state.contourVersion = version;
      const untouched = structuredClone(state),
        save = emptySave();
      save.unlocked = number;
      save.collection = ['vessel-001'];
      save.attempt = state;
      const loaded = loadSave({ getItem: () => JSON.stringify(save) }),
        restored = loaded.attempt;
      assert.equal(loaded.unlocked, number);
      assert.deepEqual(loaded.collection, save.collection);
      assert.equal(restored.remainingMs, state.remainingMs);
      assert.equal(restored.elapsedMs, 1234);
      assert.equal(restored.phase, 'paused');
      assert.ok(restored.groups.length >= state.groups.length);
      assert.equal(restored.contourVersion, 3);
      for (const piece of current.pieces) {
        const oldGroup = state.groups.find((group) => group.pieces.includes(piece.id)),
          newGroup = restored.groups.find((group) => group.pieces.includes(piece.id));
        assert.equal(newGroup.x, oldGroup.x);
        assert.equal(newGroup.y, oldGroup.y);
      }
      assert.deepEqual(restore(restored), restored);
      assert.deepEqual(state, untouched);
      assert.equal(restore({ ...state, contourVersion: 99 }), null);
    }
  }
});

test('a version 2 group using a removed extra seam splits in place without losing progress', () => {
  const level = levelAt(30),
    legacy = makePuzzle(level, 2),
    state = newAttempt(level, 'v2-edge');
  start(state);
  for (const group of state.groups) move(state, group.id, 500 + group.id * 10, 700);
  move(state, 9, 12, 40);
  move(state, 17, 12, 40);
  snap(state, 9, legacy);
  tick(state, 1234);
  state.contourVersion = 2;
  const restored = restore(state);
  assert.equal(restored.groups.length, state.groups.length + 1);
  assert.equal(restored.remainingMs, state.remainingMs);
  assert.equal(restored.elapsedMs, 1234);
  for (const id of [9, 17]) {
    const group = restored.groups.find((g) => g.pieces.includes(id));
    assert.deepEqual([group.x, group.y], [12, 40]);
  }
  assert.deepEqual(restore(restored), restored);
});
