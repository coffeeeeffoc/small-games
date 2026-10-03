import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../src/game/levels/levels.ts';
import { validateLevel, solve, distance } from '../src/game/levels/validate.ts';
import { geometry, move, isSafe } from '../src/game/core/geometry.ts';
import { newRun, interact, observe, mapData } from '../src/game/core/rules.ts';
import { DIRECTIONS, roomPosition } from '../src/game/core/model.ts';

test('all twenty unique authored mainline levels are present with their target sizes', () => {
  assert.deepEqual(
    levels.map((l) => l.id),
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  assert.deepEqual(
    levels.map((l) => l.rooms.length),
    [6, 8, 10, 12, 12, 14, 16, 18, 16, 18, 20, 22, 12, 16, 18, 20, 18, 20, 24, 30],
  );
  assert.equal(
    new Set(
      levels.map((l) =>
        l.edges
          .map((e) => e.id)
          .sort()
          .join(','),
      ),
    ).size,
    20,
  );
});

for (const level of levels)
  test(`level ${level.id}: topology, switch-state solution, physical traversal and interactable objects`, () => {
    assert.deepEqual(validateLevel(level), []);
    assert.ok(solve(level));
    const g = geometry(level);
    for (const e of level.edges)
      for (const reverse of [false, true]) {
        const a = roomPosition(level.rooms.find((r) => r.id === (reverse ? e.b : e.a))!),
          b = roomPosition(level.rooms.find((r) => r.id === (reverse ? e.a : e.b))!);
        const run = newRun(level, 'A');
        Object.assign(run, a);
        run.activated = level.switches.map((s) => s.id);
        move(run, b.x - a.x, b.z - a.z, g.boxes);
        assert.ok(
          Math.hypot(run.x - b.x, run.z - b.z) < 0.001,
          `blocked physical connection ${e.id}`,
        );
        assert.ok(isSafe(level, run, g.boxes));
        if (e.gate) {
          assert.ok(distance(level, e.a, e.b, e.id) >= 3);
          run.activated = [];
          Object.assign(run, a);
          move(run, b.x - a.x, b.z - a.z, g.boxes);
          assert.ok(Math.hypot(run.x - b.x, run.z - b.z) > 2);
        }
      }
    for (const t of g.targets.filter((t) => ['exit', 'switch', 'mirror'].includes(t.kind))) {
      const r = newRun(level, 'B'),
        d = DIRECTIONS[t.dir];
      r.x = t.x - d.x * 1.2;
      r.z = t.z - d.z * 1.2;
      r.yaw = (-t.dir * Math.PI) / 2;
      assert.ok(isSafe(level, r, g.boxes), `unreachable target ${t.id}`);
      observe(level, r, g.targets, g.boxes);
      if (t.kind === 'mirror') {
        assert.equal(r.verified[t.id], undefined);
        const m = mapData(level, r, g.targets)!;
        assert.equal(
          m.openings.find((o) => o.room === t.room && o.dir === t.dir)?.status,
          'unknown',
        );
        interact(level, r, g.targets, g.boxes);
        assert.equal(r.verified[t.id], 'mirror');
        assert.deepEqual(r.visited.sort(), [...new Set([level.entry, t.room])].sort());
        move(r, d.x * 20, d.z * 20, g.boxes);
        assert.ok(Math.hypot(r.x - t.x, r.z - t.z) >= 0.18);
      } else if (t.kind === 'switch') {
        interact(level, r, g.targets, g.boxes);
        assert.ok(r.activated.includes(t.switchId!));
      } else {
        r.activated = [...level.required];
        interact(level, r, g.targets, g.boxes);
        assert.equal(r.finished, true);
      }
    }
    // Replay the state-search solution through the collision and real interaction rules.
    // This is a deterministic rule replay, not a claim of manually playing the level.
    const replay = newRun(level, 'A');
    function approach(t: (typeof g.targets)[number]) {
      const d = DIRECTIONS[t.dir],
        origin = { x: replay.x, z: replay.z };
      move(replay, t.x - d.x * 1.2 - replay.x, t.z - d.z * 1.2 - replay.z, g.boxes);
      replay.yaw = (-t.dir * Math.PI) / 2;
      interact(level, replay, g.targets, g.boxes);
      move(replay, origin.x - replay.x, origin.z - replay.z, g.boxes);
    }
    for (const id of solve(level)!.path) {
      const p = roomPosition(level.rooms.find((n) => n.id === id)!);
      move(replay, p.x - replay.x, p.z - replay.z, g.boxes);
      assert.ok(
        Math.hypot(replay.x - p.x, replay.z - p.z) < 0.001,
        `solution physically blocked at ${id}`,
      );
      observe(level, replay, g.targets, g.boxes);
      for (const t of g.targets.filter((t) => t.room === id && t.kind === 'switch')) approach(t);
    }
    approach(g.targets.find((t) => t.kind === 'exit')!);
    assert.equal(replay.finished, true);
  });
