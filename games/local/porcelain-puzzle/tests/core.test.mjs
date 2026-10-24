import test from 'node:test';
import assert from 'node:assert/strict';
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
      for (let y = 0; y < 300; y += 4)
        for (let x = 0; x < 240; x += 4)
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
